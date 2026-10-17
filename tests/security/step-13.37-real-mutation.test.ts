import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";

/* ============================================================
   STEP 13.38 — P2-C: REAL Mutation Test on Production Route
   ------------------------------------------------------------
   dellk00k finding (review 5557976754): "vi.doMock کل ماژول Route
   را با یک تابع جدید جایگزین می‌کند. در نتیجه، پاسخ HTTP از
   تابع ساختگی می‌آید، نه از Route تولیدی‌ای که catch آن
   عمداً معیوب شده باشد."

   FIX (per owner /detailed): "یک کپی ایزوله از همان منبع واقعی
   Route ساخته و فقط تغییر مشخص Mutation روی آن اعمال شود"

   This test:
   1. Reads the ACTUAL production route source file
   2. Creates an isolated copy in a temp directory
   3. Applies a MUTATION: replaces the fixed catch block with the
      broken one (returns err.message instead of "Internal server error")
   4. Compiles and imports the MUTATED route
   5. Runs an HTTP request through the mutated route's POST handler
   6. Verifies the response DOES contain the secret (leak detected)
   7. Verifies assertNoSecret catches the leak (test would FAIL)
   8. Then runs the SAME request through the ORIGINAL (fixed) route
   9. Verifies the response does NOT contain the secret (PASS)
   10. Cleans up the temp directory in finally (guaranteed)

   The mutated route is the SAME source code as the production route,
   with only the catch block changed — not a separate mock function.
   ============================================================ */

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

// ── Mock db + auth ──
function makeModelMock() {
  return { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), $transaction: vi.fn() };
}
const mockDbTransaction = vi.fn();
const mockDb: Record<string, ReturnType<typeof makeModelMock>> = {
  rFQ: makeModelMock(),
  deal: makeModelMock(),
  listingOffer: makeModelMock(),
  dealRoom: makeModelMock(),
  rFQQuote: makeModelMock(),
  order: makeModelMock(),
  listing: makeModelMock(),
  category: makeModelMock(),
  brand: makeModelMock(),
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
  getCurrentUserId: vi.fn(),
}));

const { getCurrentUserId } = await import("@/lib/auth");

function makePostReq(): Request {
  return new Request("http://localhost/api/deals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceType: "LISTING_OFFER", sourceId: "offer-1" }),
  });
}

function setupValidSource() {
  mockDb.listingOffer.findUnique.mockResolvedValue({
    id: "offer-1",
    status: "ACCEPTED",
    offerAmount: 500000000n,
    buyerId: "user-1",
    listingId: "listing-1",
    listing: { sellerId: "seller-1" },
  });
}

describe("STEP 13.38 — P2-C: REAL mutation on production route source", () => {
  const ROUTE_PATH = "src/app/api/deals/route.ts";
  const TEMP_DIR = join(process.cwd(), "tmp-mutation-test");
  let tempRoutePath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockResolvedValue("user-1");
    setupValidSource();
    mockDbTransaction.mockRejectedValue(makeErrorWithSecret());

    // Create temp directory for the mutated route copy
    mkdirSync(join(TEMP_DIR, "api", "deals"), { recursive: true });
    tempRoutePath = join(TEMP_DIR, "api", "deals", "route.ts");
  });

  afterEach(() => {
    // GUARANTEED cleanup: remove temp directory
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  // ── Test 1: FIXED production route → no leak ──
  it("FIXED production route: $transaction throws with secret → no leak", async () => {
    const { POST } = await import("@/app/api/deals/route");
    const res = await POST(makePostReq());

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
    assertNoSecret(json, "FIXED production route");
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
  });

  // ── Test 2: MUTATED route (isolated copy) → leak detected ──
  it("MUTATED route (isolated copy of production source): err.message leaks → assertNoSecret catches", async () => {
    // 1. Read the ACTUAL production route source
    const originalSource = readFileSync(ROUTE_PATH, "utf-8");

    // Verify it contains the fixed catch
    if (!originalSource.includes("STEP 13.31 P2-C FIX")) {
      throw new Error("Production route does not contain P2-C fix — test setup issue");
    }

    // 2. Apply mutation: replace the fixed error handling with broken
    //    error handling (returns err.message instead of "Internal server error")
    let mutatedSource = originalSource;

    // The fixed POST catch returns "Internal server error" — replace it
    // with the broken version that returns err.message
    const FIXED_RETURN = `console.error("[api/deals POST] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );`;
    const BROKEN_RETURN = `const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });`;

    if (mutatedSource.includes(FIXED_RETURN)) {
      mutatedSource = mutatedSource.replace(FIXED_RETURN, BROKEN_RETURN);
    } else {
      throw new Error("Could not find fixed return block in production route — test setup issue");
    }

    // 3. Write the mutated source to an isolated temp file
    writeFileSync(tempRoutePath, mutatedSource);

    // 4. Verify the mutation was applied
    const writtenSource = readFileSync(tempRoutePath, "utf-8");
    expect(writtenSource).toContain("err instanceof Error ? err.message");
    // The POST catch should no longer have the console.error + "Internal server error"
    // (but GET catch may still have it — that's fine, we only mutated POST)
    expect(writtenSource).not.toContain('console.error("[api/deals POST] unexpected error:"');

    // 5. Import the MUTATED route using a file:// URL with cache-busting
    //    The mutated route is the SAME source as the production route,
    //    with only the catch block changed — not a separate mock.
    const tempRouteUrl = new URL(`file://${tempRoutePath}`).href;
    const mutatedModule = await import(tempRouteUrl + `?t=${Date.now()}`);

    // 6. Run HTTP request through the MUTATED route's POST handler
    const res = await mutatedModule.POST(makePostReq());
    expect(res.status).toBe(500);
    const json = await res.json();

    // 7. Verify the MUTATED route DOES leak the secret
    expect(JSON.stringify(json)).toContain("SUPERSECRET_db_password");
    expect(JSON.stringify(json)).toContain("internal-host");

    // 8. Verify assertNoSecret catches the leak (proving the test is valid)
    let caught = false;
    try {
      assertNoSecret(json, "MUTATED route");
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);

    // 9. The leak comes from the mutated PRODUCTION route's catch block,
    //    not from a separate mock function. The source code proves this:
    //    the file contains the same imports, same POST signature, same
    //    try block — only the catch block was mutated.
  });

  // ── Test 3: FIXED route still passes after mutation test (restoration) ──
  it("FIXED production route: still passes after mutation test (no side effects)", async () => {
    // The production route file should be unchanged (mutation was on a copy)
    const source = readFileSync(ROUTE_PATH, "utf-8");
    expect(source).toContain("STEP 13.31 P2-C FIX");

    // Run the same test as test 1 — should still pass
    const { POST } = await import("@/app/api/deals/route");
    const res = await POST(makePostReq());

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
    assertNoSecret(json, "FIXED route after mutation test");
  });


});
