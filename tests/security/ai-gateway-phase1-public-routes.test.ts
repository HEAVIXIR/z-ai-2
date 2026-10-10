import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

/* ============================================================
   STEP 11.42 — AI Gateway Phase 1: 5 public AI routes migration
   ------------------------------------------------------------
   Verifies that each of the 5 migrated routes has Gateway controls:
   - preflightAIRequest is called (policy + auth + quota + budget)
   - recordAICost is called (cost tracking)
   - AIGatewayLog is created (usage logging)
   - Output format is UNCHANGED (API compatibility)
   - Existing auth/ownership checks are preserved (defense-in-depth)

   Routes tested:
   1. /api/ai-listing-builder  — taskType LISTING_BUILDER (POST)
   2. /api/ai-price-suggestion — taskType PRICE_ANALYSIS  (POST)
   3. /api/ai-market-analyst   — taskType MARKET_ANALYST  (POST, admin)
   4. /api/ai-sales-agent      — taskType SELLER_ASSISTANT (GET)
   5. /api/ai-seller-assistant — taskType SELLER_ASSISTANT (GET, IDOR)
   ============================================================ */

let mockCurrentUser: { id: string } | null = null;
let mockIsAdminResult: boolean = false;
let mockPreflightOk: boolean = true;
let mockRequireAdminError: any = null;
let mockListingSamples: any[] = [];
let mockListingForIdor: any = null;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
}));
vi.mock("@/lib/authorization", () => ({
  isAdmin: async () => mockIsAdminResult,
}));
vi.mock("@/lib/auth-helpers/require-admin", () => ({
  requireAdminPermission: async () =>
    mockRequireAdminError
      ? { user: null, error: mockRequireAdminError }
      : { user: mockCurrentUser ?? { id: "admin-1" }, error: null },
}));
vi.mock("@/lib/ai-policy", () => ({
  preflightAIRequest: async () =>
    mockPreflightOk
      ? {
          ok: true,
          policy: {
            model: "default",
            costCeilingUsd: 0.05,
            timeoutMs: 30000,
            hourlyLimit: 10,
            dailyLimit: 100,
            maxInputChars: 100000,
            allowedRoles: "*",
            active: true,
          },
          budget: {},
          actorId: "user-1",
        }
      : { ok: false, statusCode: 429, reason: "سهمیه شما تمام شده." },
  recordAICost: vi.fn(async () => {}),
}));
vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      findUnique: vi.fn(async () => mockListingForIdor),
      findMany: vi.fn(async () => mockListingSamples),
      count: vi.fn(async () => 0),
      aggregate: vi.fn(async () => ({ _avg: { price: 1000 } })),
    },
    buyRequest: { count: vi.fn(async () => 0) },
    brand: { findMany: vi.fn(async () => []) },
    category: { findMany: vi.fn(async () => []) },
    lead: { findMany: vi.fn(async () => []) },
    listingOffer: { findMany: vi.fn(async () => []) },
    aIGatewayLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/api-helpers", () => ({
  parseNumber: vi.fn((v: any) => (v ? Number(v) : null)),
  parseBig: vi.fn(),
}));
vi.mock("z-ai-web-dev-sdk", () => ({
  default: {
    create: vi.fn(async () => ({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: '{"price":1000,"note":"ok"}' } }],
          })),
        },
      },
    })),
  },
}));

beforeEach(() => {
  mockCurrentUser = null;
  mockIsAdminResult = false;
  mockPreflightOk = true;
  mockRequireAdminError = null;
  mockListingSamples = [];
  mockListingForIdor = null;
});

function makePostReq(url: string, body: any): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetReq(url: string): Request {
  return new Request(url, { method: "GET" });
}

function readSource(routeRel: string): string {
  return fs.readFileSync(
    path.resolve(process.cwd(), "src/app/api", routeRel),
    "utf-8",
  );
}

// ════════════════════════════════════════════════════════════
// 1. /api/ai-listing-builder  (LISTING_BUILDER, POST)
// ════════════════════════════════════════════════════════════

describe("STEP 11.42 Phase 1: /api/ai-listing-builder — Gateway controls", () => {
  it("SOURCE: imports preflightAIRequest + recordAICost from @/lib/ai-policy", () => {
    const src = readSource("ai-listing-builder/route.ts");
    expect(src).toMatch(/import.*preflightAIRequest.*from.*@\/lib\/ai-policy/);
    expect(src).toMatch(/import.*recordAICost.*from.*@\/lib\/ai-policy/);
  });

  it("SOURCE: calls preflightAIRequest, recordAICost, and aIGatewayLog.create", () => {
    const src = readSource("ai-listing-builder/route.ts");
    expect(src).toMatch(/preflightAIRequest\(/);
    expect(src).toMatch(/recordAICost\(/);
    expect(src).toMatch(/aIGatewayLog\.create/);
    expect(src).toMatch(/LISTING_BUILDER/);
  });

  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const { POST } = await import("@/app/api/ai-listing-builder/route");
    const res = await POST(makePostReq("http://localhost/api/ai-listing-builder", { description: "بیل بلاک ۲۰۲۰" }));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: preflight denied (quota) → 429", async () => {
    mockCurrentUser = { id: "user-1" };
    mockPreflightOk = false;
    const { POST } = await import("@/app/api/ai-listing-builder/route");
    const res = await POST(makePostReq("http://localhost/api/ai-listing-builder", { description: "بیل بلاک ۲۰۲۰" }));
    expect(res.status).toBe(429);
  });

  it("POSITIVE: authenticated + preflight ok → 200 + same output format", async () => {
    mockCurrentUser = { id: "user-1" };
    mockPreflightOk = true;
    const { POST } = await import("@/app/api/ai-listing-builder/route");
    const res = await POST(makePostReq("http://localhost/api/ai-listing-builder", { description: "بیل بلاک ۲۰۲۰" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.extracted).toBeDefined();
    expect(body.source).toBeDefined();
  });

  it("VERIFY: recordAICost + aIGatewayLog.create called on success", async () => {
    mockCurrentUser = { id: "user-1" };
    mockPreflightOk = true;
    const { POST } = await import("@/app/api/ai-listing-builder/route");
    await POST(makePostReq("http://localhost/api/ai-listing-builder", { description: "test" }));
    const { recordAICost } = await import("@/lib/ai-policy");
    const { db } = await import("@/lib/db");
    expect(recordAICost).toHaveBeenCalled();
    expect(db.aIGatewayLog.create).toHaveBeenCalled();
    const logCall = (db.aIGatewayLog.create as any).mock.calls.at(-1)[0];
    expect(logCall.data.taskType).toBe("LISTING_BUILDER");
    expect(logCall.data.success).toBe(true);
    expect(logCall.data.userId).toBe("user-1");
  });
});

// ════════════════════════════════════════════════════════════
// 2. /api/ai-price-suggestion  (PRICE_ANALYSIS, POST)
// ════════════════════════════════════════════════════════════

describe("STEP 11.42 Phase 1: /api/ai-price-suggestion — Gateway controls", () => {
  it("SOURCE: imports preflightAIRequest + recordAICost from @/lib/ai-policy", () => {
    const src = readSource("ai-price-suggestion/route.ts");
    expect(src).toMatch(/import.*preflightAIRequest.*from.*@\/lib\/ai-policy/);
    expect(src).toMatch(/import.*recordAICost.*from.*@\/lib\/ai-policy/);
  });

  it("SOURCE: calls preflightAIRequest, recordAICost, and aIGatewayLog.create", () => {
    const src = readSource("ai-price-suggestion/route.ts");
    expect(src).toMatch(/preflightAIRequest\(/);
    expect(src).toMatch(/recordAICost\(/);
    expect(src).toMatch(/aIGatewayLog\.create/);
    expect(src).toMatch(/PRICE_ANALYSIS/);
  });

  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const { POST } = await import("@/app/api/ai-price-suggestion/route");
    const res = await POST(makePostReq("http://localhost/api/ai-price-suggestion", { brandId: "b1" }));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: preflight denied (quota) → 429 (samples present so preflight runs)", async () => {
    mockCurrentUser = { id: "user-1" };
    mockPreflightOk = false;
    mockListingSamples = [
      { price: 1000n, year: 2020, workingHours: 100, condition: "USED", province: "Tehran", brand: { name: "Cat" } },
      { price: 2000n, year: 2021, workingHours: 200, condition: "USED", province: "Tehran", brand: { name: "Cat" } },
    ];
    const { POST } = await import("@/app/api/ai-price-suggestion/route");
    const res = await POST(makePostReq("http://localhost/api/ai-price-suggestion", { brandId: "b1" }));
    expect(res.status).toBe(429);
  });

  it("POSITIVE: authenticated + preflight ok → 200 + same output format", async () => {
    mockCurrentUser = { id: "user-1" };
    mockPreflightOk = true;
    mockListingSamples = [
      { price: 1000n, year: 2020, workingHours: 100, condition: "USED", province: "Tehran", brand: { name: "Cat" } },
      { price: 2000n, year: 2021, workingHours: 200, condition: "USED", province: "Tehran", brand: { name: "Cat" } },
    ];
    const { POST } = await import("@/app/api/ai-price-suggestion/route");
    const res = await POST(makePostReq("http://localhost/api/ai-price-suggestion", { brandId: "b1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggested).toBeDefined();
    expect(body.min).toBeDefined();
    expect(body.max).toBeDefined();
    expect(body.samples).toBeDefined();
    expect(body.confidence).toBeDefined();
  });

  it("VERIFY: recordAICost + aIGatewayLog.create called on success", async () => {
    mockCurrentUser = { id: "user-1" };
    mockPreflightOk = true;
    mockListingSamples = [
      { price: 1000n, year: 2020, workingHours: 100, condition: "USED", province: "Tehran", brand: { name: "Cat" } },
    ];
    const { POST } = await import("@/app/api/ai-price-suggestion/route");
    await POST(makePostReq("http://localhost/api/ai-price-suggestion", { brandId: "b1" }));
    const { recordAICost } = await import("@/lib/ai-policy");
    const { db } = await import("@/lib/db");
    expect(recordAICost).toHaveBeenCalled();
    expect(db.aIGatewayLog.create).toHaveBeenCalled();
    const logCall = (db.aIGatewayLog.create as any).mock.calls.at(-1)[0];
    expect(logCall.data.taskType).toBe("PRICE_ANALYSIS");
    expect(logCall.data.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// 3. /api/ai-market-analyst  (MARKET_ANALYST, POST, admin)
// ════════════════════════════════════════════════════════════

describe("STEP 11.42 Phase 1: /api/ai-market-analyst — Gateway controls", () => {
  it("SOURCE: imports preflightAIRequest + recordAICost from @/lib/ai-policy", () => {
    const src = readSource("ai-market-analyst/route.ts");
    expect(src).toMatch(/import.*preflightAIRequest.*from.*@\/lib\/ai-policy/);
    expect(src).toMatch(/import.*recordAICost.*from.*@\/lib\/ai-policy/);
  });

  it("SOURCE: calls preflightAIRequest, recordAICost, and aIGatewayLog.create", () => {
    const src = readSource("ai-market-analyst/route.ts");
    expect(src).toMatch(/preflightAIRequest\(/);
    expect(src).toMatch(/recordAICost\(/);
    expect(src).toMatch(/aIGatewayLog\.create/);
    expect(src).toMatch(/MARKET_ANALYST/);
  });

  it("SOURCE: defense-in-depth — requireAdminPermission('ai.execute') still present", () => {
    const src = readSource("ai-market-analyst/route.ts");
    expect(src).toMatch(/requireAdminPermission\(["']ai\.execute["']\)/);
  });

  it("NEGATIVE: no permission → 403 (requireAdminPermission defense-in-depth)", async () => {
    mockCurrentUser = { id: "user-no-perm" };
    mockRequireAdminError = { status: 403, json: async () => ({ error: "Forbidden" }) } as any;
    const { POST } = await import("@/app/api/ai-market-analyst/route");
    const res = await POST(makePostReq("http://localhost/api/ai-market-analyst", { question: "بازار چطور است؟" }));
    // requireAdminPermission returns the NextResponse error object directly.
    expect(res).toBe(mockRequireAdminError);
  });

  it("NEGATIVE: preflight denied (quota) → 429 (after requireAdminPermission passes)", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockRequireAdminError = null;
    mockPreflightOk = false;
    const { POST } = await import("@/app/api/ai-market-analyst/route");
    const res = await POST(makePostReq("http://localhost/api/ai-market-analyst", { question: "بازار چطور است؟" }));
    expect(res.status).toBe(429);
  });

  it("POSITIVE: admin + preflight ok → 200 + same output format", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockRequireAdminError = null;
    mockPreflightOk = true;
    const { POST } = await import("@/app/api/ai-market-analyst/route");
    const res = await POST(makePostReq("http://localhost/api/ai-market-analyst", { question: "بازار چطور است؟" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.question).toBeDefined();
    expect(body.answer).toBeDefined();
    expect(body.context).toBeDefined();
  });

  it("VERIFY: recordAICost + aIGatewayLog.create called on success", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockRequireAdminError = null;
    mockPreflightOk = true;
    const { POST } = await import("@/app/api/ai-market-analyst/route");
    await POST(makePostReq("http://localhost/api/ai-market-analyst", { question: "test" }));
    const { recordAICost } = await import("@/lib/ai-policy");
    const { db } = await import("@/lib/db");
    expect(recordAICost).toHaveBeenCalled();
    expect(db.aIGatewayLog.create).toHaveBeenCalled();
    const logCall = (db.aIGatewayLog.create as any).mock.calls.at(-1)[0];
    expect(logCall.data.taskType).toBe("MARKET_ANALYST");
    expect(logCall.data.success).toBe(true);
    expect(logCall.data.userId).toBe("admin-1");
  });
});

// ════════════════════════════════════════════════════════════
// 4. /api/ai-sales-agent  (SELLER_ASSISTANT, GET)
// ════════════════════════════════════════════════════════════

describe("STEP 11.42 Phase 1: /api/ai-sales-agent — Gateway controls", () => {
  it("SOURCE: imports preflightAIRequest + recordAICost from @/lib/ai-policy", () => {
    const src = readSource("ai-sales-agent/route.ts");
    expect(src).toMatch(/import.*preflightAIRequest.*from.*@\/lib\/ai-policy/);
    expect(src).toMatch(/import.*recordAICost.*from.*@\/lib\/ai-policy/);
  });

  it("SOURCE: calls preflightAIRequest, recordAICost, and aIGatewayLog.create", () => {
    const src = readSource("ai-sales-agent/route.ts");
    expect(src).toMatch(/preflightAIRequest\(/);
    expect(src).toMatch(/recordAICost\(/);
    expect(src).toMatch(/aIGatewayLog\.create/);
    expect(src).toMatch(/SELLER_ASSISTANT/);
  });

  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const { GET } = await import("@/app/api/ai-sales-agent/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: preflight denied (quota) → 429", async () => {
    mockCurrentUser = { id: "seller-1" };
    mockPreflightOk = false;
    const { GET } = await import("@/app/api/ai-sales-agent/route");
    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("POSITIVE: authenticated + preflight ok → 200 + same output format", async () => {
    mockCurrentUser = { id: "seller-1" };
    mockPreflightOk = true;
    const { GET } = await import("@/app/api/ai-sales-agent/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.stats).toBeDefined();
    expect(body.classification).toBeDefined();
  });

  it("VERIFY: recordAICost + aIGatewayLog.create called on success", async () => {
    mockCurrentUser = { id: "seller-1" };
    mockPreflightOk = true;
    const { GET } = await import("@/app/api/ai-sales-agent/route");
    await GET();
    const { recordAICost } = await import("@/lib/ai-policy");
    const { db } = await import("@/lib/db");
    expect(recordAICost).toHaveBeenCalled();
    expect(db.aIGatewayLog.create).toHaveBeenCalled();
    const logCall = (db.aIGatewayLog.create as any).mock.calls.at(-1)[0];
    expect(logCall.data.taskType).toBe("SELLER_ASSISTANT");
    expect(logCall.data.success).toBe(true);
    expect(logCall.data.userId).toBe("seller-1");
  });
});

// ════════════════════════════════════════════════════════════
// 5. /api/ai-seller-assistant  (SELLER_ASSISTANT, GET, IDOR)
// ════════════════════════════════════════════════════════════

describe("STEP 11.42 Phase 1: /api/ai-seller-assistant — Gateway controls + IDOR preserved", () => {
  it("SOURCE: imports preflightAIRequest + recordAICost from @/lib/ai-policy", () => {
    const src = readSource("ai-seller-assistant/route.ts");
    expect(src).toMatch(/import.*preflightAIRequest.*from.*@\/lib\/ai-policy/);
    expect(src).toMatch(/import.*recordAICost.*from.*@\/lib\/ai-policy/);
  });

  it("SOURCE: calls preflightAIRequest, recordAICost, and aIGatewayLog.create", () => {
    const src = readSource("ai-seller-assistant/route.ts");
    expect(src).toMatch(/preflightAIRequest\(/);
    expect(src).toMatch(/recordAICost\(/);
    expect(src).toMatch(/aIGatewayLog\.create/);
    expect(src).toMatch(/SELLER_ASSISTANT/);
  });

  it("SOURCE: defense-in-depth — IDOR ownership check still present", () => {
    const src = readSource("ai-seller-assistant/route.ts");
    expect(src).toMatch(/listing\.sellerId === user\.id/);
  });

  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const { GET } = await import("@/app/api/ai-seller-assistant/route");
    const res = await GET(makeGetReq("http://localhost/api/ai-seller-assistant?listingId=x"));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: authenticated non-owner → 403 (IDOR preserved)", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockIsAdminResult = false;
    mockListingForIdor = {
      id: "x",
      sellerId: "seller-B", // owned by someone else
      images: [],
      brand: null,
      category: null,
    };
    const { GET } = await import("@/app/api/ai-seller-assistant/route");
    const res = await GET(makeGetReq("http://localhost/api/ai-seller-assistant?listingId=x"));
    expect(res.status).toBe(403);
  });

  it("NEGATIVE: preflight denied (quota) → 429 (after ownership passes)", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockIsAdminResult = false;
    mockPreflightOk = false;
    mockListingForIdor = {
      id: "x",
      sellerId: "seller-A", // owner
      images: [],
      brand: null,
      category: null,
    };
    const { GET } = await import("@/app/api/ai-seller-assistant/route");
    const res = await GET(makeGetReq("http://localhost/api/ai-seller-assistant?listingId=x"));
    expect(res.status).toBe(429);
  });

  it("POSITIVE: owner + preflight ok → 200 + same output format", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockIsAdminResult = false;
    mockPreflightOk = true;
    mockListingForIdor = {
      id: "x",
      sellerId: "seller-A",
      title: "Test Listing",
      description: "x".repeat(150),
      price: 1000n,
      year: 2020,
      workingHours: 100,
      province: "Tehran",
      city: "Tehran",
      brandId: "b1",
      condition: "USED",
      images: [{ id: "i1" }, { id: "i2" }, { id: "i3" }],
      brand: { name: "Cat" },
      category: { name: "Excavator" },
    };
    const { GET } = await import("@/app/api/ai-seller-assistant/route");
    const res = await GET(makeGetReq("http://localhost/api/ai-seller-assistant?listingId=x"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listingId).toBeDefined();
    expect(body.title).toBeDefined();
    expect(body.issues).toBeDefined();
    expect(body.aiSuggestions).toBeDefined();
    expect(body.completeness).toBeDefined();
  });

  it("VERIFY: recordAICost + aIGatewayLog.create called on success", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockIsAdminResult = false;
    mockPreflightOk = true;
    mockListingForIdor = {
      id: "x",
      sellerId: "seller-A",
      title: "Test",
      images: [],
      brand: null,
      category: null,
    };
    const { GET } = await import("@/app/api/ai-seller-assistant/route");
    await GET(makeGetReq("http://localhost/api/ai-seller-assistant?listingId=x"));
    const { recordAICost } = await import("@/lib/ai-policy");
    const { db } = await import("@/lib/db");
    expect(recordAICost).toHaveBeenCalled();
    expect(db.aIGatewayLog.create).toHaveBeenCalled();
    const logCall = (db.aIGatewayLog.create as any).mock.calls.at(-1)[0];
    expect(logCall.data.taskType).toBe("SELLER_ASSISTANT");
    expect(logCall.data.success).toBe(true);
    expect(logCall.data.userId).toBe("seller-A");
  });
});
