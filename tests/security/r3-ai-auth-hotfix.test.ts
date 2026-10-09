import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.32 — R-3 Security Fix: 5 AI routes had NO authentication
   ------------------------------------------------------------
   These tests verify that each of the 5 previously-unauthenticated
   AI routes now requires a valid session (getCurrentUser) and
   returns 401 for anonymous requests.

   For /api/ai-seller-assistant, we also verify the IDOR fix:
   a non-owner authenticated user gets 403.
   ============================================================ */

let mockCurrentUser: { id: string } | null = null;
let mockIsAdminResult: boolean = false;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
}));
vi.mock("@/lib/authorization", () => ({
  isAdmin: async () => mockIsAdminResult,
}));
vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
  },
}));
vi.mock("@/lib/search", () => ({
  searchListings: vi.fn(async () => ({ items: [], total: 0 })),
}));
vi.mock("@/lib/compare-engine", () => ({
  generateAISummary: vi.fn(async () => "summary"),
}));
vi.mock("@/lib/api-helpers", () => ({
  parseBig: vi.fn(),
  parseNumber: vi.fn(),
}));
vi.mock("z-ai-web-dev-sdk", () => {
  const mockZAI = {
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: "{}" } }],
        })),
      },
    },
  };
  return { default: { create: vi.fn(async () => mockZAI) } };
});

beforeEach(() => {
  mockCurrentUser = null;
  mockIsAdminResult = false;
});

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

// ── /api/ai-search ─────────────────────────────────────────

describe("R-3: POST /api/ai-search — auth required", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const { POST } = await import("@/app/api/ai-search/route");
    const res = await POST(makeReq("http://localhost/api/ai-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test" }),
    }));
    expect(res.status).toBe(401);
  });

  it("POSITIVE: authenticated user passes auth gate (may proceed to AI)", async () => {
    mockCurrentUser = { id: "user-1" };
    const { POST } = await import("@/app/api/ai-search/route");
    const res = await POST(makeReq("http://localhost/api/ai-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test" }),
    }));
    // Auth passes — response should NOT be 401
    expect(res.status).not.toBe(401);
  });
});

// ── /api/ai-seller-assistant ───────────────────────────────

describe("R-3: GET /api/ai-seller-assistant — auth + IDOR", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const { GET } = await import("@/app/api/ai-seller-assistant/route");
    const res = await GET(makeReq("http://localhost/api/ai-seller-assistant?listingId=x"));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: authenticated non-owner → 403 (IDOR fix)", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockIsAdminResult = false;
    const { db } = await import("@/lib/db");
    // Mock returns a listing owned by seller-B
    (db.listing.findUnique as any).mockResolvedValueOnce({
      id: "x", sellerId: "seller-B", images: [], brand: null, category: null,
    });
    const { GET } = await import("@/app/api/ai-seller-assistant/route");
    const res = await GET(makeReq("http://localhost/api/ai-seller-assistant?listingId=x"));
    expect(res.status).toBe(403);
  });

  it("POSITIVE: owner passes auth + ownership check", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockIsAdminResult = false;
    const { db } = await import("@/lib/db");
    (db.listing.findUnique as any).mockResolvedValueOnce({
      id: "x", sellerId: "seller-A", images: [], brand: null, category: null,
    });
    const { GET } = await import("@/app/api/ai-seller-assistant/route");
    const res = await GET(makeReq("http://localhost/api/ai-seller-assistant?listingId=x"));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ── /api/ai-price-suggestion ───────────────────────────────

describe("R-3: POST /api/ai-price-suggestion — auth required", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const { POST } = await import("@/app/api/ai-price-suggestion/route");
    const res = await POST(makeReq("http://localhost/api/ai-price-suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(401);
  });
});

// ── /api/ai-listing-builder ────────────────────────────────

describe("R-3: POST /api/ai-listing-builder — auth required", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const { POST } = await import("@/app/api/ai-listing-builder/route");
    const res = await POST(makeReq("http://localhost/api/ai-listing-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "test" }),
    }));
    expect(res.status).toBe(401);
  });
});

// ── /api/compare/[id]/ai-summary ───────────────────────────

describe("R-3: POST /api/compare/[id]/ai-summary — auth required", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const { POST } = await import("@/app/api/compare/[id]/ai-summary/route");
    const res = await POST(
      makeReq("http://localhost/api/compare/abc/ai-summary", { method: "POST" }),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(res.status).toBe(401);
  });
});
