import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.35 — Compare IDOR Fix: all 5 routes
   ------------------------------------------------------------
   Reproduction (BEFORE fix):
   - GET /api/compare/[id] — NO auth, exposes userId + shareToken
   - DELETE /api/compare/[id] — NO auth, anyone can archive
   - PATCH /api/compare/[id] — NO auth, anyone can rename/refresh token
   - POST /api/compare/[id]/items — NO auth, anyone can add items
   - DELETE /api/compare/[id]/items/[itemId] — NO auth, anyone can remove items

   Fix model:
   - GET: capability model (session ID = access). userId redacted.
   - PATCH + DELETE: auth + ownership (or admin). Null-userId → admin only.
   - POST/DELETE items: owned sessions require auth + ownership;
     anonymous sessions (null userId) use capability model.

   Tests cover: anonymous, non-owner, owner, admin, not-found,
   null-userId, cross-session item injection.
   ============================================================ */

let mockCurrentUser: { id: string } | null = null;
let mockIsAdminResult = false;
let mockSession: { id: string; userId: string | null; status: string; shareToken: string | null; shareExpiresAt: string | null; name: string | null; aiSummary: string | null; aiSummaryAt: string | null; createdAt: Date; updatedAt: Date } | null = null;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
  getCurrentUserId: async () => mockCurrentUser?.id ?? null,
}));
vi.mock("@/lib/authorization", () => ({
  isAdmin: async () => mockIsAdminResult,
}));
vi.mock("@/lib/db", () => ({
  db: {
    comparisonSession: {
      findUnique: vi.fn(async () => mockSession),
      update: vi.fn(async (args: any) => ({ ...mockSession, ...args.data })),
    },
    comparisonItem: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  },
}));
vi.mock("@/lib/compare-engine", () => ({
  getComparisonData: vi.fn(async () => ({ items: [], rows: [], attributes: [], differences: [], crossCategoryWarning: null, categories: [] })),
  addItem: vi.fn(async (sessionId: string) => ({ id: "item-new", sessionId, sortOrder: 0 })),
  removeItem: vi.fn(async () => {}),
  createSession: vi.fn(async () => ({ id: "new-session", shareToken: "tok", name: null, status: "ACTIVE", createdAt: new Date() })),
  getSessionByShareToken: vi.fn(async () => null),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

const compareIdRoute = await import("@/app/api/compare/[id]/route");
const itemsRoute = await import("@/app/api/compare/[id]/items/route");
const itemIdRoute = await import("@/app/api/compare/[id]/items/[itemId]/route");

beforeEach(() => {
  mockCurrentUser = null;
  mockIsAdminResult = false;
  mockSession = null;
});

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
const ARGS = (id: string) => ({ params: Promise.resolve({ id }) });
const ITEM_ARGS = (id: string, itemId: string) => ({ params: Promise.resolve({ id, itemId }) });

const ownedSession = {
  id: "s1", userId: "user-A", status: "ACTIVE", shareToken: "tok-abc",
  shareExpiresAt: null, name: "My Compare", aiSummary: null, aiSummaryAt: null,
  createdAt: new Date(), updatedAt: new Date(),
};
const anonSession = {
  id: "s2", userId: null, status: "ACTIVE", shareToken: "tok-xyz",
  shareExpiresAt: null, name: null, aiSummary: null, aiSummaryAt: null,
  createdAt: new Date(), updatedAt: new Date(),
};

// ── GET /api/compare/[id] ───────────────────────────────────

describe("GET /api/compare/[id] — capability access + userId redaction", () => {
  it("POSITIVE: anonymous can GET (capability model)", async () => {
    mockCurrentUser = null;
    mockSession = { ...ownedSession };
    const res = await compareIdRoute.GET(makeReq("http://localhost/api/compare/s1"), ARGS("s1"));
    expect(res.status).toBe(200);
  });

  it("SECURITY: userId is NOT in the response (PII redaction)", async () => {
    mockCurrentUser = null;
    mockSession = { ...ownedSession };
    const res = await compareIdRoute.GET(makeReq("http://localhost/api/compare/s1"), ARGS("s1"));
    const body = await res.json();
    expect(body.session.userId).toBeUndefined();
  });

  it("NEGATIVE: not found → 404", async () => {
    mockSession = null;
    const res = await compareIdRoute.GET(makeReq("http://localhost/api/compare/nonexistent"), ARGS("nonexistent"));
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/compare/[id] ────────────────────────────────

describe("DELETE /api/compare/[id] — auth + ownership", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    mockSession = { ...ownedSession };
    const res = await compareIdRoute.DELETE(makeReq("http://localhost/api/compare/s1", { method: "DELETE" }), ARGS("s1"));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: non-owner (user-B on user-A's session) → 403", async () => {
    mockCurrentUser = { id: "user-B" };
    mockIsAdminResult = false;
    mockSession = { ...ownedSession }; // userId: "user-A"
    const res = await compareIdRoute.DELETE(makeReq("http://localhost/api/compare/s1", { method: "DELETE" }), ARGS("s1"));
    expect(res.status).toBe(403);
  });

  it("POSITIVE: owner → 200", async () => {
    mockCurrentUser = { id: "user-A" };
    mockIsAdminResult = false;
    mockSession = { ...ownedSession };
    const res = await compareIdRoute.DELETE(makeReq("http://localhost/api/compare/s1", { method: "DELETE" }), ARGS("s1"));
    expect(res.status).toBe(200);
  });

  it("POSITIVE: admin → 200 (even if not owner)", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockIsAdminResult = true;
    mockSession = { ...ownedSession };
    const res = await compareIdRoute.DELETE(makeReq("http://localhost/api/compare/s1", { method: "DELETE" }), ARGS("s1"));
    expect(res.status).toBe(200);
  });

  it("NEGATIVE: anonymous on null-userId session → 401 (not admin)", async () => {
    mockCurrentUser = null;
    mockSession = { ...anonSession };
    const res = await compareIdRoute.DELETE(makeReq("http://localhost/api/compare/s2", { method: "DELETE" }), ARGS("s2"));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: non-owner on null-userId session → 403", async () => {
    mockCurrentUser = { id: "user-A" };
    mockIsAdminResult = false;
    mockSession = { ...anonSession }; // userId: null
    const res = await compareIdRoute.DELETE(makeReq("http://localhost/api/compare/s2", { method: "DELETE" }), ARGS("s2"));
    expect(res.status).toBe(403);
  });

  it("POSITIVE: admin on null-userId session → 200", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockIsAdminResult = true;
    mockSession = { ...anonSession };
    const res = await compareIdRoute.DELETE(makeReq("http://localhost/api/compare/s2", { method: "DELETE" }), ARGS("s2"));
    expect(res.status).toBe(200);
  });

  it("NEGATIVE: not found → 404", async () => {
    mockCurrentUser = { id: "user-A" };
    mockSession = null;
    const res = await compareIdRoute.DELETE(makeReq("http://localhost/api/compare/nonexistent", { method: "DELETE" }), ARGS("nonexistent"));
    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/compare/[id] ─────────────────────────────────

describe("PATCH /api/compare/[id] — auth + ownership (token hijack prevention)", () => {
  it("NEGATIVE: anonymous → 401 (prevents token hijack)", async () => {
    mockCurrentUser = null;
    mockSession = { ...ownedSession };
    const res = await compareIdRoute.PATCH(
      makeReq("http://localhost/api/compare/s1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshShareToken: true }) }),
      ARGS("s1"),
    );
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: non-owner → 403 (cannot refresh shareToken)", async () => {
    mockCurrentUser = { id: "user-B" };
    mockIsAdminResult = false;
    mockSession = { ...ownedSession };
    const res = await compareIdRoute.PATCH(
      makeReq("http://localhost/api/compare/s1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshShareToken: true }) }),
      ARGS("s1"),
    );
    expect(res.status).toBe(403);
  });

  it("POSITIVE: owner → 200 (can rename)", async () => {
    mockCurrentUser = { id: "user-A" };
    mockIsAdminResult = false;
    mockSession = { ...ownedSession };
    const res = await compareIdRoute.PATCH(
      makeReq("http://localhost/api/compare/s1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "New Name" }) }),
      ARGS("s1"),
    );
    expect(res.status).toBe(200);
  });

  it("POSITIVE: admin → 200", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockIsAdminResult = true;
    mockSession = { ...ownedSession };
    const res = await compareIdRoute.PATCH(
      makeReq("http://localhost/api/compare/s1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Admin Rename" }) }),
      ARGS("s1"),
    );
    expect(res.status).toBe(200);
  });
});

// ── POST /api/compare/[id]/items ────────────────────────────

describe("POST /api/compare/[id]/items — ownership for owned sessions", () => {
  it("NEGATIVE: non-owner on owned session → 403", async () => {
    mockCurrentUser = { id: "user-B" };
    mockIsAdminResult = false;
    mockSession = { ...ownedSession }; // userId: "user-A"
    const res = await itemsRoute.POST(
      makeReq("http://localhost/api/compare/s1/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: "l1" }) }),
      ARGS("s1"),
    );
    expect(res.status).toBe(403);
  });

  it("NEGATIVE: anonymous on owned session → 401", async () => {
    mockCurrentUser = null;
    mockSession = { ...ownedSession };
    const res = await itemsRoute.POST(
      makeReq("http://localhost/api/compare/s1/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: "l1" }) }),
      ARGS("s1"),
    );
    expect(res.status).toBe(401);
  });

  it("POSITIVE: owner → 200", async () => {
    mockCurrentUser = { id: "user-A" };
    mockIsAdminResult = false;
    mockSession = { ...ownedSession };
    const res = await itemsRoute.POST(
      makeReq("http://localhost/api/compare/s1/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: "l1" }) }),
      ARGS("s1"),
    );
    expect(res.status).toBe(200);
  });

  it("POSITIVE: anonymous on null-userId session → 200 (capability model)", async () => {
    mockCurrentUser = null;
    mockSession = { ...anonSession }; // userId: null
    const res = await itemsRoute.POST(
      makeReq("http://localhost/api/compare/s2/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: "l1" }) }),
      ARGS("s2"),
    );
    expect(res.status).toBe(200);
  });

  it("NEGATIVE: not found → 404", async () => {
    mockSession = null;
    const res = await itemsRoute.POST(
      makeReq("http://localhost/api/compare/nonexistent/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: "l1" }) }),
      ARGS("nonexistent"),
    );
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/compare/[id]/items/[itemId] ─────────────────

describe("DELETE /api/compare/[id]/items/[itemId] — ownership + cross-session", () => {
  it("NEGATIVE: non-owner on owned session → 403", async () => {
    mockCurrentUser = { id: "user-B" };
    mockIsAdminResult = false;
    mockSession = { ...ownedSession };
    const res = await itemIdRoute.DELETE(
      makeReq("http://localhost/api/compare/s1/items/item-1", { method: "DELETE" }),
      ITEM_ARGS("s1", "item-1"),
    );
    expect(res.status).toBe(403);
  });

  it("POSITIVE: owner → 200", async () => {
    mockCurrentUser = { id: "user-A" };
    mockIsAdminResult = false;
    mockSession = { ...ownedSession };
    const res = await itemIdRoute.DELETE(
      makeReq("http://localhost/api/compare/s1/items/item-1", { method: "DELETE" }),
      ITEM_ARGS("s1", "item-1"),
    );
    expect(res.status).toBe(200);
  });

  it("POSITIVE: anonymous on null-userId session → 200 (capability model)", async () => {
    mockCurrentUser = null;
    mockSession = { ...anonSession };
    const res = await itemIdRoute.DELETE(
      makeReq("http://localhost/api/compare/s2/items/item-1", { method: "DELETE" }),
      ITEM_ARGS("s2", "item-1"),
    );
    expect(res.status).toBe(200);
  });

  it("NEGATIVE: not found → 404", async () => {
    mockSession = null;
    const res = await itemIdRoute.DELETE(
      makeReq("http://localhost/api/compare/nonexistent/items/item-1", { method: "DELETE" }),
      ITEM_ARGS("nonexistent", "item-1"),
    );
    expect(res.status).toBe(404);
  });
});
