import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.34 — P1-B Security Fix: compare/ai-summary session ownership
   ------------------------------------------------------------
   Reproduction (BEFORE fix):
   - POST /api/compare/[id]/ai-summary checked auth (401 for
     anonymous) but did NOT verify the authenticated user owns the
     session. Any logged-in user could trigger AI summary generation
     on ANY session ID (cost abuse + cache mutation via aiSummary/
     aiSummaryAt fields on the session row).

   Fix (AFTER):
   - Load the ComparisonSession, check session.userId === user.id
     (or admin). Non-owner → 403; not-found → 404.
   ============================================================ */

let mockCurrentUser: { id: string } | null = null;
let mockIsAdminResult = false;
let mockSession: { id: string; userId: string | null } | null = null;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
}));
vi.mock("@/lib/authorization", () => ({
  isAdmin: async () => mockIsAdminResult,
}));
vi.mock("@/lib/db", () => ({
  db: {
    comparisonSession: {
      findUnique: vi.fn(async () => mockSession),
    },
  },
}));
vi.mock("@/lib/compare-engine", () => ({
  generateAISummary: vi.fn(async () => "خلاصه تستی"),
}));

const { POST } = await import("@/app/api/compare/[id]/ai-summary/route");

beforeEach(() => {
  mockCurrentUser = null;
  mockIsAdminResult = false;
  mockSession = null;
});

function makeReq(url: string): Request {
  return new Request(url, { method: "POST" });
}

const ARGS = (id: string) => ({ params: Promise.resolve({ id }) });

describe("P1-B: POST /api/compare/[id]/ai-summary — session ownership", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await POST(makeReq("http://localhost/api/compare/s1/ai-summary"), ARGS("s1"));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: session not found → 404", async () => {
    mockCurrentUser = { id: "user-1" };
    mockSession = null;
    const res = await POST(makeReq("http://localhost/api/compare/nonexistent/ai-summary"), ARGS("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("NEGATIVE: authenticated non-owner → 403 (IDOR fix)", async () => {
    mockCurrentUser = { id: "user-A" };
    mockIsAdminResult = false;
    mockSession = { id: "s1", userId: "user-B" }; // owned by another user
    const res = await POST(makeReq("http://localhost/api/compare/s1/ai-summary"), ARGS("s1"));
    expect(res.status).toBe(403);
  });

  it("POSITIVE: owner → passes (summary generated)", async () => {
    mockCurrentUser = { id: "user-A" };
    mockIsAdminResult = false;
    mockSession = { id: "s1", userId: "user-A" }; // owner
    const res = await POST(makeReq("http://localhost/api/compare/s1/ai-summary"), ARGS("s1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeDefined();
  });

  it("POSITIVE: admin → passes even if not owner", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockIsAdminResult = true;
    mockSession = { id: "s1", userId: "user-B" }; // owned by another user
    const res = await POST(makeReq("http://localhost/api/compare/s1/ai-summary"), ARGS("s1"));
    expect(res.status).toBe(200);
  });

  it("EDGE: session with null userId (anonymous-created session) → non-owner 403, admin 200", async () => {
    mockCurrentUser = { id: "user-A" };
    mockIsAdminResult = false;
    mockSession = { id: "s1", userId: null }; // no owner
    const res = await POST(makeReq("http://localhost/api/compare/s1/ai-summary"), ARGS("s1"));
    // user-A is not the owner (userId is null) and not admin → 403
    expect(res.status).toBe(403);

    // Admin can still access
    mockCurrentUser = { id: "admin-1" };
    mockIsAdminResult = true;
    const res2 = await POST(makeReq("http://localhost/api/compare/s1/ai-summary"), ARGS("s1"));
    expect(res2.status).toBe(200);
  });
});
