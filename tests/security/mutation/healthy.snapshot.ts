/**
 * STEP 13.53 P2-C — HEALTHY snapshot (subprocess target)
 * ======================================================
 * This file is executed as a STANDALONE vitest subprocess by the
 * orchestrator (tests/security/mutation/orchestrator.test.ts):
 *
 *   bunx vitest run --config vitest.mutation.config.ts tests/security/mutation/healthy.snapshot.ts
 *
 * It imports the REAL production POST /api/deals handler, triggers an
 * error containing a synthetic secret, and asserts the HTTP response
 * body does NOT leak the secret. The vitest PROCESS EXIT CODE is the
 * proof:
 *   - exit 0  => the healthy route does not leak (assertion passed)
 *   - exit nonzero => the route leaked (assertion failed)
 *
 * There is NO expect.toThrow / try-catch that converts an assertion
 * failure into a pass. The assertion runs directly; if it fails, the
 * test fails and vitest exits nonzero.
 */
import { describe, it, expect, vi } from "vitest";

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

// ── Mock db + auth (no real DB needed; the error is injected at the $transaction boundary) ──
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

describe("HEALTHY snapshot — real POST /api/deals does not leak secret", () => {
  it("real production route: error response contains no secret (assertion passes -> exit 0)", async () => {
    vi.clearAllMocks();
    setupValidSource();
    // Inject a secret-containing error at the $transaction boundary so the
    // outer catch (the P2-C fix site) receives it.
    mockDbTransaction.mockRejectedValue(makeErrorWithSecret());

    const { POST } = await import("@/app/api/deals/route");
    const res = await POST(
      new Request("http://localhost/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "LISTING_OFFER", sourceId: "offer-1" }),
      }),
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    // DIRECT assertion — no expect.toThrow. If the route leaked, this FAILS
    // and vitest exits nonzero.
    assertNoSecret(json, "HEALTHY route");
    expect(json.error).toBe("Internal server error");
  });
});
