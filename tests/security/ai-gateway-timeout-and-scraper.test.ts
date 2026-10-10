import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

/* ============================================================
   STEP 11.43 — Timeout Hardening + Scraper Gateway Migration
   ------------------------------------------------------------
   Work Item 1: AbortController timeout on 6 migrated routes
     - Each route sets up: const controller = new AbortController();
       const timeoutTimer = setTimeout(() => controller.abort(),
       policy.timeoutMs);
     - Passes signal: controller.signal to zai.chat.completions.create
     - Calls clearTimeout(timeoutTimer) on success AND failure paths
     - Detects AbortError in catch → 504 Gateway Timeout (or fallback
       for routes with optional LLM, e.g. ai-price-suggestion,
       ai-sales-agent, ai-seller-assistant)

   Work Item 2: SCRAPER case in ai-gateway + 2 scraper routes migrated
     - ai-gateway has a `case "SCRAPER"` (previously returned 400)
     - admin/ai-scraper has preflightAIRequest
     - admin/store/ai-scraper has preflightAIRequest
     - Behavioral: preflight denied → 429 for both scraper routes

   Routes audited (6 timeout + 2 scraper = 8 migrated, 8/14 total):
   1. /api/ai-search            (SEARCH, POST)
   2. /api/ai-listing-builder   (LISTING_BUILDER, POST)
   3. /api/ai-price-suggestion  (PRICE_ANALYSIS, POST)
   4. /api/ai-market-analyst    (MARKET_ANALYST, POST, admin)
   5. /api/ai-sales-agent       (SELLER_ASSISTANT, GET)
   6. /api/ai-seller-assistant  (SELLER_ASSISTANT, GET, IDOR)
   7. /api/admin/ai-scraper     (SCRAPER, POST, admin) — Phase 2
   8. /api/admin/store/ai-scraper (SCRAPER, POST, admin) — Phase 2
   ============================================================ */

let mockCurrentUser: { id: string } | null = null;
let mockPreflightOk: boolean = true;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
}));
vi.mock("@/lib/authorization", () => ({
  isAdmin: async () => true,
  requirePermission: async () => {},
  hasRole: async () => true,
}));
vi.mock("@/lib/auth-helpers/require-admin", () => ({
  requireAdminPermission: async () => ({
    user: mockCurrentUser ?? { id: "admin-1" },
    error: null,
  }),
}));
vi.mock("@/lib/ai-policy", () => ({
  preflightAIRequest: async () =>
    mockPreflightOk
      ? {
          ok: true,
          policy: {
            model: "default",
            costCeilingUsd: 0.1,
            timeoutMs: 30000,
            hourlyLimit: 5,
            dailyLimit: 20,
            maxInputChars: 5000,
            allowedRoles: "ADMIN",
            active: true,
          },
          budget: {},
          actorId: "admin-1",
        }
      : { ok: false, statusCode: 429, reason: "سهمیه شما تمام شده." },
  recordAICost: vi.fn(async () => {}),
}));
vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      aggregate: vi.fn(async () => ({ _avg: { price: 1000 } })),
      create: vi.fn(async () => ({ id: "l1", slug: "slug-1" })),
    },
    buyRequest: { count: vi.fn(async () => 0) },
    brand: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "b1" })),
    },
    category: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "c1" })),
    },
    lead: { findMany: vi.fn(async () => []) },
    listingOffer: { findMany: vi.fn(async () => []) },
    listingImage: { create: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
    demandSignal: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    aIGatewayLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/store-db", () => ({
  storeDb: {
    part: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "p1", sku: "AI-X", name: "Part" })),
    },
    brand: {
      findUnique: vi.fn(async () => ({ id: "b1" })),
      create: vi.fn(async () => ({ id: "b1" })),
    },
    category: {
      findUnique: vi.fn(async () => ({ id: "c1" })),
      create: vi.fn(async () => ({ id: "c1" })),
    },
  },
}));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => {}),
}));
vi.mock("@/lib/api-helpers", () => ({
  parseNumber: vi.fn((v: any) => (v ? Number(v) : null)),
  parseBig: vi.fn(),
  slugify: vi.fn((s: string) => s || "slug"),
}));
vi.mock("@/lib/search", () => ({
  searchListings: vi.fn(async () => ({ results: [], total: 0 })),
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
      functions: {
        invoke: vi.fn(async () => ({ results: [] })),
      },
      images: {
        search: { create: vi.fn(async () => ({ results: [] })) },
        generations: { create: vi.fn(async () => ({ data: [] })) },
      },
    })),
  },
}));

beforeEach(() => {
  mockCurrentUser = null;
  mockPreflightOk = true;
});

function readSource(rel: string): string {
  return fs.readFileSync(
    path.resolve(process.cwd(), "src/app/api", rel),
    "utf-8",
  );
}

function makePostReq(url: string, body: any): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ════════════════════════════════════════════════════════════
// WORK ITEM 1: AbortController timeout on 6 migrated routes
// ════════════════════════════════════════════════════════════

const ROUTES_WITH_TIMEOUT = [
  { name: "ai-search",            rel: "ai-search/route.ts" },
  { name: "ai-listing-builder",   rel: "ai-listing-builder/route.ts" },
  { name: "ai-price-suggestion",  rel: "ai-price-suggestion/route.ts" },
  { name: "ai-market-analyst",    rel: "ai-market-analyst/route.ts" },
  { name: "ai-sales-agent",       rel: "ai-sales-agent/route.ts" },
  { name: "ai-seller-assistant",  rel: "ai-seller-assistant/route.ts" },
];

describe("STEP 11.43 Work Item 1: AbortController timeout on 6 migrated routes", () => {
  for (const r of ROUTES_WITH_TIMEOUT) {
    describe(`${r.name}`, () => {
      it("SOURCE: has AbortController", () => {
        const src = readSource(r.rel);
        expect(src).toMatch(/new AbortController\(\)/);
      });

      it("SOURCE: has setTimeout(() => controller.abort(), policy.timeoutMs)", () => {
        const src = readSource(r.rel);
        expect(src).toMatch(/setTimeout\(\s*\(\s*\)\s*=>\s*controller\.abort\(\)/);
        expect(src).toMatch(/policy\.timeoutMs/);
      });

      it("SOURCE: has clearTimeout(timeoutTimer)", () => {
        const src = readSource(r.rel);
        expect(src).toMatch(/clearTimeout\(timeoutTimer\)/);
      });

      it("SOURCE: passes signal: controller.signal to zai.chat.completions.create", () => {
        const src = readSource(r.rel);
        expect(src).toMatch(/signal:\s*controller\.signal/);
      });

      it("SOURCE: detects AbortError in catch block", () => {
        const src = readSource(r.rel);
        // Either AbortError name check OR controller.signal.aborted check
        expect(src).toMatch(/AbortError|controller\.signal\.aborted/);
      });
    });
  }
});

// ════════════════════════════════════════════════════════════
// WORK ITEM 2A: SCRAPER case in ai-gateway
// ════════════════════════════════════════════════════════════

describe("STEP 11.43 Work Item 2A: SCRAPER case in ai-gateway", () => {
  it("SOURCE: ai-gateway route has case \"SCRAPER\"", () => {
    const src = readSource("ai-gateway/route.ts");
    expect(src).toMatch(/case\s+["']SCRAPER["']/);
  });

  it("SOURCE: SCRAPER case returns a hint message (not Unknown task type)", () => {
    const src = readSource("ai-gateway/route.ts");
    // The SCRAPER case should set result to a message — not fall through to default
    const scraperCaseMatch = src.match(/case\s+["']SCRAPER["']\s*:\s*\{([\s\S]*?)\}/);
    expect(scraperCaseMatch).not.toBeNull();
    expect(scraperCaseMatch![1]).toMatch(/ai-scraper/);
  });
});

// ════════════════════════════════════════════════════════════
// WORK ITEM 2B: 2 scraper routes migrated to Gateway controls
// ════════════════════════════════════════════════════════════

const SCRAPER_ROUTES = [
  { name: "admin/ai-scraper",       rel: "admin/ai-scraper/route.ts" },
  { name: "admin/store/ai-scraper", rel: "admin/store/ai-scraper/route.ts" },
];

describe("STEP 11.43 Work Item 2B: scraper routes have preflightAIRequest", () => {
  for (const r of SCRAPER_ROUTES) {
    describe(`${r.name}`, () => {
      it("SOURCE: imports preflightAIRequest from @/lib/ai-policy", () => {
        const src = readSource(r.rel);
        expect(src).toMatch(/import.*preflightAIRequest.*from.*@\/lib\/ai-policy/);
      });

      it("SOURCE: calls preflightAIRequest with taskType SCRAPER", () => {
        const src = readSource(r.rel);
        expect(src).toMatch(/preflightAIRequest\(/);
        expect(src).toMatch(/taskType:\s*["']SCRAPER["']/);
      });

      it("SOURCE: calls recordAICost on success", () => {
        const src = readSource(r.rel);
        expect(src).toMatch(/recordAICost\(/);
        expect(src).toMatch(/SCRAPER/);
      });

      it("SOURCE: creates AIGatewayLog entry", () => {
        const src = readSource(r.rel);
        expect(src).toMatch(/aIGatewayLog\.create/);
      });

      it("SOURCE: has AbortController + setTimeout + clearTimeout", () => {
        const src = readSource(r.rel);
        expect(src).toMatch(/new AbortController\(\)/);
        expect(src).toMatch(/setTimeout\(\s*\(\s*\)\s*=>\s*controller\.abort\(\)/);
        expect(src).toMatch(/clearTimeout\(timeoutTimer\)/);
      });

      it("SOURCE: existing auth checks preserved (defense-in-depth)", () => {
        const src = readSource(r.rel);
        expect(src).toMatch(/getCurrentUser\(/);
        expect(src).toMatch(/requirePermission\(/);
      });
    });
  }
});

// ════════════════════════════════════════════════════════════
// BEHAVIORAL: preflight denied → 429 for scraper routes
// ════════════════════════════════════════════════════════════

describe("STEP 11.43 Behavioral: scraper routes respect preflight denial", () => {
  it("admin/ai-scraper: authenticated + preflight denied → 429", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockPreflightOk = false;
    const { POST } = await import("@/app/api/admin/ai-scraper/route");
    const res = await POST(
      makePostReq("http://localhost/api/admin/ai-scraper", { action: "scrape", limit: 5 }),
    );
    expect(res.status).toBe(429);
  });

  it("admin/store/ai-scraper: authenticated + preflight denied → 429", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockPreflightOk = false;
    const { POST } = await import("@/app/api/admin/store/ai-scraper/route");
    const res = await POST(
      makePostReq("http://localhost/api/admin/store/ai-scraper", { action: "scrape", query: "فیلتر روغن" }),
    );
    expect(res.status).toBe(429);
  });

  it("admin/ai-scraper: anonymous → 401 (existing auth preserved)", async () => {
    mockCurrentUser = null;
    const { POST } = await import("@/app/api/admin/ai-scraper/route");
    const res = await POST(
      makePostReq("http://localhost/api/admin/ai-scraper", { action: "scrape" }),
    );
    expect(res.status).toBe(401);
  });

  it("admin/store/ai-scraper: anonymous → 401 (existing auth preserved)", async () => {
    mockCurrentUser = null;
    const { POST } = await import("@/app/api/admin/store/ai-scraper/route");
    const res = await POST(
      makePostReq("http://localhost/api/admin/store/ai-scraper", { action: "scrape", query: "x" }),
    );
    expect(res.status).toBe(401);
  });

  it("admin/ai-scraper: preflight ok → AIGatewayLog.create called with SCRAPER", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockPreflightOk = true;
    const { POST } = await import("@/app/api/admin/ai-scraper/route");
    // Use import action with a simple body — this won't trigger LLM/scraping
    await POST(
      makePostReq("http://localhost/api/admin/ai-scraper", {
        action: "import",
        suggestion: { title: "test", brand: "X", category: "Y" },
      }),
    );
    const { db } = await import("@/lib/db");
    expect(db.aIGatewayLog.create).toHaveBeenCalled();
    const lastCall = (db.aIGatewayLog.create as any).mock.calls.at(-1)?.[0];
    expect(lastCall.data.taskType).toBe("SCRAPER");
  });

  it("admin/store/ai-scraper: preflight ok → AIGatewayLog.create called with SCRAPER", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockPreflightOk = true;
    const { POST } = await import("@/app/api/admin/store/ai-scraper/route");
    // Use import action with a simple body
    await POST(
      makePostReq("http://localhost/api/admin/store/ai-scraper", {
        action: "import",
        part: { name: "فیلتر روغن تویوتا" },
      }),
    );
    const { db } = await import("@/lib/db");
    expect(db.aIGatewayLog.create).toHaveBeenCalled();
    const lastCall = (db.aIGatewayLog.create as any).mock.calls.at(-1)?.[0];
    expect(lastCall.data.taskType).toBe("SCRAPER");
  });
});
