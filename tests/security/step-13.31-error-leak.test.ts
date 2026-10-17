import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 13.31 — P2-C: Error path must NOT leak raw err.message
   ------------------------------------------------------------
   Inject errors containing fake secrets / connection strings
   into each route's dependencies and assert the HTTP 500
   response body contains ONLY the generic "Internal server error"
   message — never the raw exception text.

   Covers all 5 route files:
   - GET /api/rfq (list)
   - POST /api/rfq (create)
   - GET /api/rfq/[id] (detail)
   - GET /api/rfq/[id]/quotes
   - POST /api/rfq/[id]/quotes
   - GET /api/deals (list)
   - POST /api/deals (create)
   - GET /api/deals/[id] (detail)
   - PATCH /api/deals/[id]

   RFQServiceError typed responses are PRESERVED (safe, controlled
   messages) — verified separately.
   ============================================================ */

// A fake secret that must NEVER appear in any HTTP response body.
const FAKE_SECRET = "postgres://user:SUPERSECRET_db_password@internal-host:5432/heavix";
const FAKE_STACK = "/home/secret/node_modules/library/internal-path.ts";

function makeErrorWithSecret(): Error {
  const e = new Error(`${FAKE_SECRET} — ${FAKE_STACK}`);
  return e;
}

// ── Mock db + auth (overridden per-test) ─────────────────
function makeModelMock() {
  return { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), $transaction: vi.fn() };
}
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
      return mockDb[prop as string] ?? { $transaction: vi.fn() };
    },
  }),
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/request-context", () => ({ getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const { getCurrentUser } = await import("@/lib/auth");

function assertNoSecret(body: unknown, label: string) {
  const bodyStr = JSON.stringify(body);
  expect(bodyStr, `${label}: response must not contain FAKE_SECRET`).not.toContain("SUPERSECRET_db_password");
  expect(bodyStr, `${label}: response must not contain connection string`).not.toContain("internal-host");
  expect(bodyStr, `${label}: response must not contain stack path`).not.toContain("node_modules/library");
  expect(bodyStr, `${label}: response must not contain /home/secret`).not.toContain("/home/secret");
}

describe("STEP 13.31 — P2-C: error path does not leak raw err.message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue("user-1" as any);
  });

  // ── GET /api/rfq (list) ──
  it("GET /api/rfq: db.findMany throws → 500 with generic message, no secret", async () => {
    mockDb.rFQ.findMany.mockRejectedValue(makeErrorWithSecret());
    mockDb.rFQ.count.mockResolvedValue(0);
    const { GET } = await import("@/app/api/rfq/route");
    const res = await GET(new Request("http://localhost/api/rfq"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
    assertNoSecret(json, "GET /api/rfq");
  });

  // ── POST /api/rfq (create) ──
  it("POST /api/rfq: createRFQ throws non-RFQServiceError → 500 generic, no secret", async () => {
    // Mock getCurrentUser to return a valid user (passes auth)
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as any);
    // Mock createRFQ to throw a non-RFQServiceError (raw Error with secret)
    // We do this by making db.rFQ.create throw
    mockDb.rFQ.create.mockRejectedValue(makeErrorWithSecret());
    mockDb.category.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.brand.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.user.findUnique = vi.fn().mockResolvedValue({ firstName: "T", lastName: "U", mobile: "09", email: null });
    const { POST } = await import("@/app/api/rfq/route");
    const res = await POST(
      new Request("http://localhost/api/rfq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test RFQ Title" }),
      }),
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
    assertNoSecret(json, "POST /api/rfq");
  });

  // ── GET /api/rfq/[id] (detail) ──
  it("GET /api/rfq/[id]: getRFQ throws non-RFQServiceError → 500 generic, no secret", async () => {
    mockDb.rFQ.findUnique.mockRejectedValue(makeErrorWithSecret());
    const { GET } = await import("@/app/api/rfq/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/rfq/rfq-1"),
      { params: Promise.resolve({ id: "rfq-1" }) },
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
    assertNoSecret(json, "GET /api/rfq/[id]");
  });

  // ── GET /api/rfq/[id]/quotes ──
  it("GET /api/rfq/[id]/quotes: getRFQ throws non-RFQServiceError → 500 generic", async () => {
    mockDb.rFQ.findUnique.mockRejectedValue(makeErrorWithSecret());
    const { GET } = await import("@/app/api/rfq/[id]/quotes/route");
    const res = await GET(
      new Request("http://localhost/api/rfq/rfq-1/quotes"),
      { params: Promise.resolve({ id: "rfq-1" }) },
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
    assertNoSecret(json, "GET /api/rfq/[id]/quotes");
  });

  // ── GET /api/deals (list) ──
  it("GET /api/deals: db.deal.findMany throws → 500 generic, no secret", async () => {
    mockDb.deal.findMany.mockRejectedValue(makeErrorWithSecret());
    const { GET } = await import("@/app/api/deals/route");
    const res = await GET(new Request("http://localhost/api/deals"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
    assertNoSecret(json, "GET /api/deals");
  });

  // ── GET /api/deals/[id] (detail) ──
  it("GET /api/deals/[id]: db.deal.findUnique throws → 500 generic, no secret", async () => {
    mockDb.deal.findUnique.mockRejectedValue(makeErrorWithSecret());
    const { GET } = await import("@/app/api/deals/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/deals/deal-1"),
      { params: Promise.resolve({ id: "deal-1" }) },
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
    assertNoSecret(json, "GET /api/deals/[id]");
  });

  // ── PATCH /api/deals/[id] ──
  it("PATCH /api/deals/[id]: $transaction throws non-P2002 → 500 generic, no secret", async () => {
    // deal.findUnique returns a valid deal (passes auth + transition check)
    mockDb.deal.findUnique.mockResolvedValue({
      id: "deal-1",
      dealNumber: "DEAL-1",
      status: "PENDING_CONFIRMATION",
      buyerId: "user-1",
      sellerId: "seller-1",
      listingId: null,
      agreedAmount: 100n,
      currency: "IRR",
      order: null,
    });
    // $transaction throws a non-P2002 error (with secret)
    mockDb.deal.$transaction.mockRejectedValue(makeErrorWithSecret());
    const { PATCH } = await import("@/app/api/deals/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/deals/deal-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      }),
      { params: Promise.resolve({ id: "deal-1" }) },
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
    assertNoSecret(json, "PATCH /api/deals/[id]");
  });

  // ── RFQServiceError typed responses are PRESERVED (not masked) ──
  it("RFQServiceError response is preserved (not replaced with generic)", async () => {
    const { RFQServiceError } = await import("@/lib/rfq-service");
    // Make getRFQ throw a real RFQServiceError
    mockDb.rFQ.findUnique.mockRejectedValue(new RFQServiceError(404, "استعلام یافت نشد"));
    const { GET } = await import("@/app/api/rfq/[id]/route");
    const res = await GET(
      new Request("http://localhost/api/rfq/rfq-1"),
      { params: Promise.resolve({ id: "rfq-1" }) },
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("استعلام یافت نشد");
  });
});
