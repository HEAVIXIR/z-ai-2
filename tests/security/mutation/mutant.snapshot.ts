/**
 * STEP 13.53 P2-C — MUTANT snapshot (subprocess target)
 * ======================================================
 * Executed as a STANDALONE vitest subprocess by the orchestrator:
 *
 *   bunx vitest run --config vitest.mutation.config.ts tests/security/mutation/mutant.snapshot.ts
 *
 * This file applies a CONTROLLED security mutation to an ISOLATED COPY of
 * the production POST /api/deals route source: the P2-C catch block (which
 * returns the generic "Internal server error") is replaced with a leaking
 * version that returns `err.message` directly. The mutated copy is imported
 * via a file:// URL, the POST handler is invoked with a secret-containing
 * error, and assertNoSecret is called DIRECTLY (no expect.toThrow).
 *
 * Because the mutant LEAKS the secret, the assertion FAILS, the test FAILS,
 * and vitest exits NONZERO. The orchestrator verifies this nonzero exit is
 * caused by the security assertion (not import/syntax/setup) by inspecting
 * the subprocess stderr for the assertion message.
 *
 * Mutation contract:
 *   - The mutation targets the EXACT P2-C fix site (the outer catch of POST).
 *   - The mutated copy is a faithful reproduction of the production source
 *     with ONLY the catch-block return statement changed.
 *   - If the production source no longer contains the fixed return (e.g. the
 *     fix was removed), this snapshot fails with a clear "mutation harness
 *     broken" error BEFORE reaching the security assertion — the orchestrator
 *     detects this and reports the harness is stale (not a security pass).
 */
import { describe, it, expect, vi, afterAll } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const FAKE_SECRET = "postgres://user:SUPERSECRET_db_password@internal-host:5432/heavix";
const FAKE_STACK = "/home/secret/node_modules/library/internal-path.ts";

function makeErrorWithSecret(): Error {
  return new Error(`${FAKE_SECRET} — ${FAKE_STACK}`);
}

function assertNoSecret(body: unknown, label: string) {
  const bodyStr = JSON.stringify(body);
  expect(bodyStr, `${label}: must not contain SUPERSECRET`).not.toContain("SUPERSECRET_db_password");
  expect(bodyStr, `${label}: must not contain internal-host`).not.toContain("internal-host");
  expect(bodyStr, `${label}: must not contain /home/secret`).not.toContain("/home/secret");
}

// ── Mock db + auth (identical to healthy.snapshot.ts) ──
function makeModelMock() {
  return {
    findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(),
    update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn(),
    deleteMany: vi.fn(), upsert: vi.fn(),
  };
}
const mockDbTransaction = vi.fn();
const mockDb: Record<string, ReturnType<typeof makeModelMock>> = {
  rFQ: makeModelMock(), deal: makeModelMock(), listingOffer: makeModelMock(),
  dealRoom: makeModelMock(), rFQQuote: makeModelMock(), order: makeModelMock(),
  listing: makeModelMock(), category: makeModelMock(), brand: makeModelMock(),
  user: makeModelMock(),
};

vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get(_t, prop) {
      if (prop === "$transaction") return mockDbTransaction;
      return mockDb[prop as string] ?? makeModelMock();
    },
  }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/request-context", () => ({ getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
  getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
}));

function setupValidSource() {
  mockDb.listingOffer.findUnique.mockResolvedValue({
    id: "offer-1", status: "ACCEPTED", offerAmount: 500000000n,
    buyerId: "user-1", listingId: "listing-1", listing: { sellerId: "seller-1" },
  });
}

const ROUTE_PATH = "src/app/api/deals/route.ts";
const TEMP_DIR = join(process.cwd(), "tmp-mutation-mutant");

// The EXACT fixed return block in the production POST catch (the P2-C fix site).
const FIXED_RETURN = `console.error("[api/deals POST] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );`;
// The MUTATED return: leaks err.message directly to the client.
const BROKEN_RETURN = `const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });`;

describe("MUTANT snapshot — mutated POST /api/deals leaks secret (assertion fails -> exit nonzero)", () => {
  it("mutated route: error response LEAKS secret -> assertNoSecret FAILS (exit nonzero)", async () => {
    // 1. Read the ACTUAL production route source.
    const originalSource = readFileSync(ROUTE_PATH, "utf-8");
    if (!originalSource.includes("STEP 13.31 P2-C FIX")) {
      throw new Error("MUTATION HARNESS BROKEN: production route does not contain P2-C fix marker");
    }
    if (!originalSource.includes(FIXED_RETURN)) {
      throw new Error("MUTATION HARNESS BROKEN: could not find the fixed return block — production source changed; update FIXED_RETURN");
    }

    // 2. Apply the controlled mutation to an ISOLATED temp copy.
    mkdirSync(join(TEMP_DIR, "api", "deals"), { recursive: true });
    const tempRoutePath = join(TEMP_DIR, "api", "deals", "route.ts");
    const mutatedSource = originalSource.replace(FIXED_RETURN, BROKEN_RETURN);
    writeFileSync(tempRoutePath, mutatedSource);

    // Verify mutation was applied (no false green if replacement silently no-ops).
    const written = readFileSync(tempRoutePath, "utf-8");
    expect(written, "mutation must be applied").toContain("err instanceof Error ? err.message");
    expect(written, "fixed code must be removed from mutant").not.toContain('console.error("[api/deals POST] unexpected error:"');

    // 3. Setup + inject secret-containing error.
    vi.clearAllMocks();
    setupValidSource();
    mockDbTransaction.mockRejectedValue(makeErrorWithSecret());

    // 4. Import the MUTATED route copy (isolated file:// URL with cache-bust).
    const tempRouteUrl = new URL(`file://${tempRoutePath}`).href;
    const mutatedModule = await import(tempRouteUrl + `?t=${Date.now()}`);

    // 5. Run the real POST handler from the mutated copy.
    const res = await mutatedModule.POST(
      new Request("http://localhost/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "LISTING_OFFER", sourceId: "offer-1" }),
      }),
    );

    expect(res.status).toBe(500);
    const json = await res.json();

    // 6. DIRECT assertion — NO expect.toThrow. The mutant LEAKS the secret,
    //    so assertNoSecret FAILS here, the test FAILS, and vitest exits NONZERO.
    //    This is the proof dellk00k requires: the mutant's failure is a real,
    //    observable subprocess exit code caused by the security assertion.
    assertNoSecret(json, "MUTANT route");

    // Cleanup (only reached if the assertion above PASSED — i.e. the mutant
    // failed to leak, which would itself be a harness problem).
    if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true, force: true });
  });
});

// Guarantee temp cleanup even if the assertion fails (afterAll runs regardless).
afterAll(() => {
  if (existsSync(TEMP_DIR)) rmSync(TEMP_DIR, { recursive: true, force: true });
});
