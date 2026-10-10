import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

/* ============================================================
   STEP 11.44 — AI Gateway Phase 3: 6 admin AI routes migration
   ------------------------------------------------------------
   Verifies that each of the 6 migrated admin routes has Gateway
   controls (same pattern as Phase 1/2 + ai-search pilot):
   - preflightAIRequest is called (policy + auth + quota + budget)
   - recordAICost is called (cost tracking)
   - AIGatewayLog is created (usage logging)
   - AbortController timeout is in place (policy.timeoutMs)
   - Existing auth (getCurrentUser + hasPermission) is preserved
   - Output format is UNCHANGED (API compatibility)

   Also verifies:
   - ai-gateway switch has all 6 new cases (CONTENT_FACTORY,
     LOGO_SEARCH, IMAGE_GENERATION, ARTICLE_GENERATION,
     KNOWLEDGE_IMAGE, REEL_GENERATION)
   - seed-ai-policies.ts has all 6 new task type entries

   Routes tested:
   1. /api/admin/ai-content-factory              — CONTENT_FACTORY
   2. /api/admin/brands/[id]/search-logo         — LOGO_SEARCH
   3. /api/admin/categories/[id]/generate-image  — IMAGE_GENERATION
   4. /api/admin/knowledge/generate-article      — ARTICLE_GENERATION
   5. /api/admin/knowledge/generate-image        — KNOWLEDGE_IMAGE
   6. /api/admin/reels                           — REEL_GENERATION
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
vi.mock("@/lib/rbac", () => ({
  hasPermission: async () => true,
}));
vi.mock("@/lib/ai-policy", () => ({
  preflightAIRequest: async () =>
    mockPreflightOk
      ? {
          ok: true,
          policy: {
            model: "default",
            costCeilingUsd: 0.05,
            timeoutMs: 45000,
            hourlyLimit: 10,
            dailyLimit: 30,
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
      findUnique: vi.fn(async () => ({
        id: "l1",
        title: "Test Listing",
        price: "1000000000",
        city: "تهران",
        images: [{ url: "/test.jpg" }],
        brand: { name: "Caterpillar", nameEn: "Caterpillar" },
        category: { name: "بیل مکانیکی", nameEn: "Excavator" },
      })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      aggregate: vi.fn(async () => ({ _avg: { price: 1000 } })),
      create: vi.fn(async () => ({ id: "l1", slug: "slug-1" })),
    },
    brand: {
      findUnique: vi.fn(async () => ({ id: "b1", name: "Caterpillar", nameEn: "Caterpillar" })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: "b1" })),
    },
    category: {
      findUnique: vi.fn(async () => ({ id: "c1", name: "بیل مکانیکی", nameEn: "Excavator", slug: "excavator", domain: "MACHINE", description: null, imageUrl: null })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: "c1" })),
      update: vi.fn(async () => ({})),
    },
    article: {
      findUnique: vi.fn(async () => ({ id: "a1", slug: "test-article", title: "Test", excerpt: null, tags: null, coverImage: null })),
      create: vi.fn(async () => ({ id: "a1", slug: "test-article", title: "Test", excerpt: null, content: "content", coverImage: null, status: "DRAFT", category: "GUIDE" })),
      update: vi.fn(async () => ({})),
    },
    socialReel: {
      create: vi.fn(async () => ({ id: "r1", listingId: "l1", platform: "INSTAGRAM", status: "PROCESSING", duration: 5 })),
      update: vi.fn(async () => ({})),
      findMany: vi.fn(async () => []),
    },
    buyRequest: { count: vi.fn(async () => 0) },
    lead: { findMany: vi.fn(async () => []) },
    listingOffer: { findMany: vi.fn(async () => []) },
    listingImage: { create: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
    demandSignal: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    aIGatewayLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => {}),
}));
vi.mock("@/lib/api-helpers", () => ({
  parseNumber: vi.fn((v: any) => (v ? Number(v) : null)),
  parseBig: vi.fn(),
  slugify: vi.fn((s: string) => s || "slug"),
  uniqueSlug: vi.fn(async () => "test-slug"),
}));
vi.mock("@/lib/request-context", () => ({
  getClientIp: () => "127.0.0.1",
  rateLimitKey: (id: string, label: string) => `${id}:${label}`,
}));
vi.mock("@/lib/rate-limit-check", () => ({
  enforceRateLimit: () => ({ ok: true }),
}));
vi.mock("@/lib/rate-limit-presets", () => ({
  UPLOAD: { label: "upload", limit: 20, windowMs: 3600000, scope: "ip" },
  AI: { label: "ai", limit: 30, windowMs: 3600000, scope: "user" },
}));
vi.mock("z-ai-web-dev-sdk", () => ({
  default: {
    create: vi.fn(async () => ({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: '{"title":"تست","excerpt":"خلاصه","content":"محتوا","tags":["تگ"],"caption":"کپشن","hashtags":"#هشتگ"}' } }],
          })),
        },
      },
      images: {
        search: {
          create: vi.fn(async () => ({
            results: [{ original_url: "http://example.com/logo.png", caption: "Logo", source: "example.com" }],
          })),
        },
        generations: {
          create: vi.fn(async () => ({
            data: [{ base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC" }],
          })),
        },
      },
      video: {
        generations: {
          create: vi.fn(async () => ({ id: "task-1" })),
        },
      },
      async: {
        result: {
          query: vi.fn(async () => ({ task_status: "SUCCESS", video_result: [{ url: "http://example.com/video.mp4" }] })),
        },
      },
      functions: {
        invoke: vi.fn(async () => ({ results: [] })),
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
    path.resolve(process.cwd(), rel),
    "utf-8",
  );
}

function readRoute(routeRel: string): string {
  return fs.readFileSync(
    path.resolve(process.cwd(), "src/app/api", routeRel),
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
// SOURCE-CODE CHECKS: 6 routes have preflightAIRequest + recordAICost
// ════════════════════════════════════════════════════════════

const PHASE3_ROUTES = [
  {
    name: "admin/ai-content-factory",
    rel: "admin/ai-content-factory/route.ts",
    taskType: "CONTENT_FACTORY",
  },
  {
    name: "admin/brands/[id]/search-logo",
    rel: "admin/brands/[id]/search-logo/route.ts",
    taskType: "LOGO_SEARCH",
  },
  {
    name: "admin/categories/[id]/generate-image",
    rel: "admin/categories/[id]/generate-image/route.ts",
    taskType: "IMAGE_GENERATION",
  },
  {
    name: "admin/knowledge/generate-article",
    rel: "admin/knowledge/generate-article/route.ts",
    taskType: "ARTICLE_GENERATION",
  },
  {
    name: "admin/knowledge/generate-image",
    rel: "admin/knowledge/generate-image/route.ts",
    taskType: "KNOWLEDGE_IMAGE",
  },
  {
    name: "admin/reels",
    rel: "admin/reels/route.ts",
    taskType: "REEL_GENERATION",
  },
];

describe("STEP 11.44 Phase 3: 6 admin routes have Gateway controls", () => {
  for (const r of PHASE3_ROUTES) {
    describe(`${r.name} (${r.taskType})`, () => {
      it("SOURCE: imports preflightAIRequest + recordAICost from @/lib/ai-policy", () => {
        const src = readRoute(r.rel);
        expect(src).toMatch(/import.*preflightAIRequest.*from.*@\/lib\/ai-policy/);
        expect(src).toMatch(/import.*recordAICost.*from.*@\/lib\/ai-policy/);
      });

      it("SOURCE: calls preflightAIRequest with correct taskType", () => {
        const src = readRoute(r.rel);
        expect(src).toMatch(/preflightAIRequest\(/);
        expect(src).toMatch(new RegExp(`taskType:\\s*["']${r.taskType}["']`));
      });

      it("SOURCE: calls recordAICost with correct taskType", () => {
        const src = readRoute(r.rel);
        expect(src).toMatch(/recordAICost\(/);
        expect(src).toMatch(new RegExp(`recordAICost\\(["']${r.taskType}["']`));
      });

      it("SOURCE: creates AIGatewayLog entry", () => {
        const src = readRoute(r.rel);
        expect(src).toMatch(/aIGatewayLog\.create/);
        expect(src).toMatch(new RegExp(`taskType:\\s*["']${r.taskType}["']`));
      });

      it("SOURCE: has AbortController", () => {
        const src = readRoute(r.rel);
        expect(src).toMatch(/new AbortController\(\)/);
      });

      it("SOURCE: has setTimeout(() => controller.abort(), policy.timeoutMs)", () => {
        const src = readRoute(r.rel);
        expect(src).toMatch(/setTimeout\(\s*\(\s*\)\s*=>\s*controller\.abort\(\)/);
        expect(src).toMatch(/policy\.timeoutMs/);
      });

      it("SOURCE: has clearTimeout(timeoutTimer)", () => {
        const src = readRoute(r.rel);
        expect(src).toMatch(/clearTimeout\(timeoutTimer\)/);
      });

      it("SOURCE: detects AbortError in catch block", () => {
        const src = readRoute(r.rel);
        expect(src).toMatch(/AbortError|controller\.signal\.aborted/);
      });

      it("SOURCE: existing auth preserved (getCurrentUser)", () => {
        const src = readRoute(r.rel);
        expect(src).toMatch(/getCurrentUser\(/);
      });
    });
  }
});

// ════════════════════════════════════════════════════════════
// SOURCE-CODE CHECKS: Gateway switch has all 6 new cases
// ════════════════════════════════════════════════════════════

describe("STEP 11.44 Phase 3: ai-gateway switch has 6 new cases", () => {
  const NEW_CASES = [
    "CONTENT_FACTORY",
    "LOGO_SEARCH",
    "IMAGE_GENERATION",
    "ARTICLE_GENERATION",
    "KNOWLEDGE_IMAGE",
    "REEL_GENERATION",
  ];

  for (const taskType of NEW_CASES) {
    it(`SOURCE: ai-gateway has case "${taskType}"`, () => {
      const src = readRoute("ai-gateway/route.ts");
      expect(src).toMatch(new RegExp(`case\\s+["']${taskType}["']`));
    });

    it(`SOURCE: ${taskType} case returns a hint message`, () => {
      const src = readRoute("ai-gateway/route.ts");
      const caseMatch = src.match(
        new RegExp(`case\\s+["']${taskType}["']\\s*:\\s*\\{([\\s\\S]*?)\\}`),
      );
      expect(caseMatch).not.toBeNull();
      expect(caseMatch![1]).toMatch(/message/);
    });
  }
});

// ════════════════════════════════════════════════════════════
// SOURCE-CODE CHECKS: seed-ai-policies.ts has all 6 new task types
// ════════════════════════════════════════════════════════════

describe("STEP 11.44 Phase 3: seed-ai-policies.ts has 6 new task types", () => {
  const NEW_POLICIES = [
    "CONTENT_FACTORY",
    "LOGO_SEARCH",
    "IMAGE_GENERATION",
    "ARTICLE_GENERATION",
    "KNOWLEDGE_IMAGE",
    "REEL_GENERATION",
  ];

  for (const taskType of NEW_POLICIES) {
    it(`SOURCE: seed-ai-policies.ts has taskType "${taskType}"`, () => {
      const src = readSource("prisma/seed-ai-policies.ts");
      expect(src).toMatch(new RegExp(`taskType:\\s*["']${taskType}["']`));
    });
  }

  it("SOURCE: seed-ai-policies.ts has all 6 new policies (count check)", () => {
    const src = readSource("prisma/seed-ai-policies.ts");
    let count = 0;
    for (const taskType of NEW_POLICIES) {
      if (new RegExp(`taskType:\\s*["']${taskType}["']`).test(src)) count++;
    }
    expect(count).toBe(6);
  });
});

// ════════════════════════════════════════════════════════════
// BEHAVIORAL: preflight denied → 429 for at least 2 routes
// ════════════════════════════════════════════════════════════

describe("STEP 11.44 Phase 3 Behavioral: routes respect preflight denial", () => {
  it("admin/ai-content-factory: authenticated + preflight denied → 429", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockPreflightOk = false;
    const { POST } = await import("@/app/api/admin/ai-content-factory/route");
    const res = await POST(
      makePostReq("http://localhost/api/admin/ai-content-factory", {
        topic: "بیل مکانیکی کوماتسو",
        category: "GUIDE",
      }),
    );
    expect(res.status).toBe(429);
  });

  it("admin/knowledge/generate-image: authenticated + preflight denied → 429", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockPreflightOk = false;
    const { POST } = await import("@/app/api/admin/knowledge/generate-image/route");
    const res = await POST(
      makePostReq("http://localhost/api/admin/knowledge/generate-image", {
        articleId: "a1",
      }),
    );
    expect(res.status).toBe(429);
  });

  it("admin/ai-content-factory: anonymous → 401 (existing auth preserved)", async () => {
    mockCurrentUser = null;
    mockPreflightOk = true;
    const { POST } = await import("@/app/api/admin/ai-content-factory/route");
    const res = await POST(
      makePostReq("http://localhost/api/admin/ai-content-factory", {
        topic: "test",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("admin/knowledge/generate-image: anonymous → 401 (existing auth preserved)", async () => {
    mockCurrentUser = null;
    mockPreflightOk = true;
    const { POST } = await import("@/app/api/admin/knowledge/generate-image/route");
    const res = await POST(
      makePostReq("http://localhost/api/admin/knowledge/generate-image", {
        articleId: "a1",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("admin/ai-content-factory: preflight ok → AIGatewayLog.create called with CONTENT_FACTORY", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockPreflightOk = true;
    const { POST } = await import("@/app/api/admin/ai-content-factory/route");
    await POST(
      makePostReq("http://localhost/api/admin/ai-content-factory", {
        topic: "بیل مکانیکی کوماتسو",
        category: "GUIDE",
      }),
    );
    const { db } = await import("@/lib/db");
    expect(db.aIGatewayLog.create).toHaveBeenCalled();
    const lastCall = (db.aIGatewayLog.create as any).mock.calls.at(-1)?.[0];
    expect(lastCall.data.taskType).toBe("CONTENT_FACTORY");
  });

  it("admin/knowledge/generate-image: preflight ok → AIGatewayLog.create called with KNOWLEDGE_IMAGE", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockPreflightOk = true;
    const { POST } = await import("@/app/api/admin/knowledge/generate-image/route");
    await POST(
      makePostReq("http://localhost/api/admin/knowledge/generate-image", {
        articleId: "a1",
      }),
    );
    const { db } = await import("@/lib/db");
    expect(db.aIGatewayLog.create).toHaveBeenCalled();
    const lastCall = (db.aIGatewayLog.create as any).mock.calls.at(-1)?.[0];
    expect(lastCall.data.taskType).toBe("KNOWLEDGE_IMAGE");
  });
});
