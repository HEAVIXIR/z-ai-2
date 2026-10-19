import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 13.28 — BEHAVIORAL TESTS: GET /api/rfq (LIST) PII
   ------------------------------------------------------------
   P1-A fix: listRFQs must NOT return buyerPhone, buyerEmail,
   or buyerId to ANY caller (anonymous or authenticated).
   The list is a PUBLIC marketplace catalog (the /rfq page
   renders it to anonymous visitors); buyer contact info is
   only relevant on the detail page (getRFQ), where
   viewer-aware redaction already applies.

   These tests call the actual GET handler and inspect the
   real JSON response — NOT regex on source text.
   ============================================================ */

// ── Mock db ──────────────────────────────────────────────
const mockRFQFindMany = vi.fn();
const mockRFQCount = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    rFQ: {
      findMany: mockRFQFindMany,
      count: mockRFQCount,
    },
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/request-context", () => ({ getClientIp: () => "127.0.0.1" }));

// GET /api/rfq does not auth-gate (public catalog) — getCurrentUser
// is not imported by the route. We mock nothing for auth.
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const { GET } = await import("@/app/api/rfq/route");

// ── Mock RFQ rows (as Prisma would return, with ALL columns) ──
function makeMockRFQRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rfq-1",
    title: "Test RFQ",
    description: "desc",
    machineType: "Excavator",
    brandPref: "Caterpillar",
    quantity: 1,
    budgetMin: 100000000n,
    budgetMax: 200000000n,
    location: "Tehran",
    deadline: new Date("2026-12-01"),
    status: "OPEN",
    // PII that MUST NOT appear in the list response:
    buyerName: "Ali Buyer",
    buyerPhone: "09121111111",
    buyerEmail: "ali@buyer.com",
    buyerId: "buyer-internal-id",
    createdAt: new Date("2026-10-01"),
    updatedAt: new Date("2026-10-01"),
    _count: { quotes: 3 },
    ...overrides,
  };
}

// The allowlist for list items (NO PII fields).
const ALLOWED_LIST_KEYS = [
  "id",
  "title",
  "description",
  "machineType",
  "brandPref",
  "quantity",
  "budgetMin",
  "budgetMax",
  "location",
  "deadline",
  "status",
  "buyerName",
  "quoteCount",
  "createdAt",
] as const;

const FORBIDDEN_LIST_KEYS = [
  "buyerPhone",
  "buyerEmail",
  "buyerId",
  "updatedAt",
] as const;

describe("STEP 13.28 — GET /api/rfq (LIST): PII redaction behavioral tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRFQFindMany.mockResolvedValue([makeMockRFQRow()]);
    mockRFQCount.mockResolvedValue(1);
  });

  it("anonymous request: 200 with items (public catalog)", async () => {
    const req = new Request("http://localhost/api/rfq");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toHaveLength(1);
  });

  it("response items contain ONLY allowlisted fields (no PII)", async () => {
    const req = new Request("http://localhost/api/rfq");
    const res = await GET(req);
    const json = await res.json();
    const keys = Object.keys(json.data[0]).sort();
    expect(keys).toEqual([...ALLOWED_LIST_KEYS].sort());
  });

  it("does NOT expose buyerPhone, buyerEmail, or buyerId", async () => {
    const req = new Request("http://localhost/api/rfq");
    const res = await GET(req);
    const json = await res.json();
    const bodyStr = JSON.stringify(json);
    for (const key of FORBIDDEN_LIST_KEYS) {
      expect(bodyStr).not.toContain(`"${key}"`);
    }
    // Concrete PII values must not appear anywhere in the response
    expect(bodyStr).not.toContain("09121111111");
    expect(bodyStr).not.toContain("ali@buyer.com");
    expect(bodyStr).not.toContain("buyer-internal-id");
  });

  it("buyerName IS present (public trust signal)", async () => {
    const req = new Request("http://localhost/api/rfq");
    const res = await GET(req);
    const json = await res.json();
    expect(json.data[0].buyerName).toBe("Ali Buyer");
  });

  it("quoteCount IS present (trust signal)", async () => {
    const req = new Request("http://localhost/api/rfq");
    const res = await GET(req);
    const json = await res.json();
    expect(json.data[0].quoteCount).toBe(3);
  });

  it("BigInt budgetMin/Max serialized as string", async () => {
    const req = new Request("http://localhost/api/rfq");
    const res = await GET(req);
    const json = await res.json();
    expect(json.data[0].budgetMin).toBe("100000000");
    expect(json.data[0].budgetMax).toBe("200000000");
    expect(typeof json.data[0].budgetMin).toBe("string");
  });

  it("query params (status, buyerId, sellerId, limit, offset) pass through", async () => {
    const req = new Request(
      "http://localhost/api/rfq?status=OPEN&buyerId=b1&sellerId=s1&limit=5&offset=10",
    );
    await GET(req);
    expect(mockRFQFindMany).toHaveBeenCalledTimes(1);
    const args = mockRFQFindMany.mock.calls[0][0];
    expect(args.where.status).toBe("OPEN");
    expect(args.where.buyerId).toBe("b1");
    expect(args.where.quotes).toEqual({ some: { sellerId: "s1" } });
    expect(args.take).toBe(5);
    expect(args.skip).toBe(10);
  });

  it("limit capped to 100 (no unbounded harvest)", async () => {
    const req = new Request("http://localhost/api/rfq?limit=99999");
    await GET(req);
    const args = mockRFQFindMany.mock.calls[0][0];
    expect(args.take).toBe(100);
  });

  it("a newly-added RFQ column (e.g. internalNote) does NOT leak", async () => {
    mockRFQFindMany.mockResolvedValue([
      makeMockRFQRow({
        internalAdminNote: "secret admin note",
        buyerMobileBackup: "09120000000",
      }),
    ]);
    const req = new Request("http://localhost/api/rfq");
    const res = await GET(req);
    const json = await res.json();
    const bodyStr = JSON.stringify(json);
    expect(bodyStr).not.toContain("internalAdminNote");
    expect(bodyStr).not.toContain("buyerMobileBackup");
    expect(bodyStr).not.toContain("secret admin note");
    // Allowlist still exact
    expect(Object.keys(json.data[0]).sort()).toEqual(
      [...ALLOWED_LIST_KEYS].sort(),
    );
  });

  it("empty result set handled gracefully", async () => {
    mockRFQFindMany.mockResolvedValue([]);
    mockRFQCount.mockResolvedValue(0);
    const req = new Request("http://localhost/api/rfq");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
    expect(json.total).toBe(0);
  });

  // ── Regression guard: if buyerPhone is ever re-added to listRFQs
  //    mapping, this test fails. ──
  it("regression guard: response is NOT the full RFQ row", async () => {
    const req = new Request("http://localhost/api/rfq");
    const res = await GET(req);
    const json = await res.json();
    // The raw mock row has ~17 keys; the allowlist has 14. If the
    // mapping were ever reverted to spread the full row, PII would
    // appear and this assertion would fail.
    expect(Object.keys(json.data[0]).length).toBeLessThanOrEqual(
      ALLOWED_LIST_KEYS.length,
    );
  });
});
