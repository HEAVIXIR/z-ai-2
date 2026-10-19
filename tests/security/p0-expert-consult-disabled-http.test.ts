import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/* ============================================================
   STEP 13.01-R2 — P0-3 FIX v2 HTTP-LAYER VERIFICATION
   ------------------------------------------------------------
   Senior manager directive (EO-3 / EO-8): the v2 test file at
   `tests/security/p0-expert-consult-disabled-fixed-v2.test.ts`
   only does `readFileSync` + regex match on the source string.
   It proves the FILE contains `status: 503`, NOT that a request
   to the route returns 503. If `route.ts` fails to import, has a
   syntax error, or `POST` throws before `NextResponse.json`, the
   v2 test still passes — the classic "false safety" anti-pattern.

   This file replaces that source-string approach with REAL
   handler invocation: we import `GET` and `POST` directly from
   the route module, invoke them, and assert on the actual
   `NextResponse` object (status + JSON body).

   We also mock `@/lib/db` with a Proxy that THROWS if any
   property is accessed — proving the disabled route never
   touches Prisma (the original P0-3 crash root cause).
   ============================================================ */

// Mock @/lib/db with a Proxy that throws on ANY property access.
// The disabled route must not touch Prisma at all — if it does,
// this mock will throw and the test will fail loudly.
vi.mock("@/lib/db", () => {
  const trap = (): never => {
    throw new Error(
      "P0-3 HTTP test: @/lib/db was accessed by the expert-consult " +
        "route, but the route is supposed to be DISABLED (503). " +
        "This is the original P0-3 crash root cause — the route " +
        "must NOT touch Prisma.",
    );
  };
  const handler: ProxyHandler<Record<string, never>> = {
    get: trap,
    set: trap,
    has: trap,
    getPrototypeOf: trap,
    ownKeys: trap,
    getOwnPropertyDescriptor: trap,
  };
  return { default: new Proxy({} as Record<string, never>, handler), db: new Proxy({} as Record<string, never>, handler) };
});

// Import AFTER vi.mock so the mock is in effect when the route
// module is loaded.
import { GET, POST } from "@/app/api/expert-consult/route";

describe("P0-3 FIX v2 — HTTP-layer: GET /api/expert-consult returns 503", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a NextResponse with status 503", async () => {
    const res = await GET();
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(503);
  });

  it("returns body { code: 'FEATURE_DISABLED' }", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toMatchObject({ code: "FEATURE_DISABLED" });
    expect(body).toHaveProperty("error");
  });

  it("does NOT touch Prisma (db mock throws on access)", async () => {
    // If the route touched db, the Proxy would have thrown and
    // this test would already have failed above. Re-invoking
    // here makes the assertion explicit.
    const res = await GET();
    expect(res.status).toBe(503);
  });
});

describe("P0-3 FIX v2 — HTTP-layer: POST /api/expert-consult returns 503", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when called with a JSON body", async () => {
    const req = new Request("http://localhost/api/expert-consult", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "test question",
        buyerPhone: "+989120000000",
        listingId: "test-listing-id",
      }),
    });
    const res = await POST(req);
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("returns 503 even when called with no body", async () => {
    // The disabled route must short-circuit regardless of input.
    const req = new Request("http://localhost/api/expert-consult", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("returns 503 even when called with no argument at all", async () => {
    // The route signature is `POST()` — no `req` parameter is
    // required by the disabled implementation. We invoke without
    // any argument to prove the route is disabled regardless of
    // input shape (the v2 source-string test could not catch a
    // regression where someone reintroduced `req.json()` parsing).
    const res = await POST();
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("does NOT touch Prisma (db mock throws on access)", async () => {
    const req = new Request("http://localhost/api/expert-consult", {
      method: "POST",
      body: JSON.stringify({ question: "x", buyerPhone: "y" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });
});

describe("P0-3 FIX v2 — HTTP-layer: GET and POST share disabled contract", () => {
  it("both handlers return the same FEATURE_DISABLED code", async () => {
    const getRes = await GET();
    const postRes = await POST();
    const getBody = await getRes.json();
    const postBody = await postRes.json();
    expect(getBody.code).toBe("FEATURE_DISABLED");
    expect(postBody.code).toBe("FEATURE_DISABLED");
    expect(getBody.code).toBe(postBody.code);
  });

  it("both handlers return 503 (not 500, not 404, not 200)", async () => {
    const getRes = await GET();
    const postRes = await POST();
    expect(getRes.status).toBe(503);
    expect(postRes.status).toBe(503);
  });
});
