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
const mockPreflightAIRequest = vi.fn(async () =>
  mockPreflightOk
    ? {
        ok: true as const,
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
    : { ok: false as const, statusCode: 429, reason: "سهمیه شما تمام شده." },
);
const mockRecordAICost = vi.fn(async () => {});
vi.mock("@/lib/ai-policy", () => ({
  preflightAIRequest: mockPreflightAIRequest,
  recordAICost: mockRecordAICost,
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
  vi.clearAllMocks();
  mockCurrentUser = null;
  mockPreflightOk = true;
  // Enable provider routes only in mocked tests; no real provider call is made.
  process.env.HEAVIX_AI_SCRAPER_ENABLED = "true";
  process.env.HEAVIX_STORE_SCRAPER_ALLOWED_HOSTS = "parts.example.test";
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
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
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
// WORK ITEM 1B: Gateway's own provider calls receive the abort signal
// ════════════════════════════════════════════════════════════

describe("STEP 16.46: ai-gateway provider timeout wiring", () => {
  it("SOURCE: every direct chat completion passes the AbortController signal", () => {
    const src = readSource("ai-gateway/route.ts");
    const providerCalls = src.match(/zai\.chat\.completions\.create\(/g) ?? [];
    const abortSignals = src.match(/signal:\s*controller\.signal/g) ?? [];

    expect(providerCalls).toHaveLength(3);
    expect(abortSignals).toHaveLength(providerCalls.length);
  });
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

describe("Scraper authorization, source safety, and preflight ordering", () => {
  it("Marketplace search has no artificial activation flag and keeps auth + CSRF before AI preflight", () => {
    const src = readSource("admin/ai-scraper/route.ts");
    expect(src).toContain('requirePermission(user.id, "ai.execute")');
    expect(src).not.toContain("HEAVIX_AI_SCRAPER_ENABLED");
    expect(src.indexOf("getCurrentUser()")).toBeLessThan(src.indexOf("checkCsrf(req)"));
    expect(src.indexOf("checkCsrf(req)")).toBeLessThan(src.indexOf("preflightAIRequest("));
    expect(src).toContain("isAllowedSourceUrl");
  });

  it("Store discovery remains constrained and manual imports use bounded parsing without AI preflight", () => {
    const src = readSource("admin/store/ai-scraper/route.ts");
    expect(src).toContain("HEAVIX_STORE_SCRAPER_ALLOWED_HOSTS");
    expect(src).toContain('const isManualImport = body.action === "import" || body.action === "bulk-import"');
    expect(src).toContain('import { readBoundedJson } from "@/lib/read-bounded-json"');
    expect(src).toContain("readBoundedJson<Record<string, any>>(req, 1_000_000)");
    expect(src).not.toContain("HEAVIX_STORE_SCRAPER_ENABLED");
    expect(src.indexOf("getCurrentUser()")).toBeLessThan(src.indexOf("checkCsrf(req)"));
    expect(src.indexOf("checkCsrf(req)")).toBeLessThan(src.indexOf("preflightAIRequest("));
    expect(src.indexOf("if (isManualImport)")).toBeLessThan(src.indexOf("preflightAIRequest("));
    expect(src).toContain("isAllowedStoreSourceUrl");
  });
});

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

  it("admin/store/ai-scraper: manual import bypasses AI quota, budget, and gateway logging", async () => {
    mockCurrentUser = { id: "admin-1" };
    // Even when the AI preflight would deny discovery, deterministic manual import must work.
    mockPreflightOk = false;
    const { POST } = await import("@/app/api/admin/store/ai-scraper/route");
    const res = await POST(
      makePostReq("http://localhost/api/admin/store/ai-scraper", {
        action: "import",
        part: { name: "فیلتر روغن تویوتا" },
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPreflightAIRequest).not.toHaveBeenCalled();
    expect(mockRecordAICost).not.toHaveBeenCalled();
    const { db } = await import("@/lib/db");
    expect(db.aIGatewayLog.create).not.toHaveBeenCalled();
  });

  it("admin/store/ai-scraper: bulk manual import bypasses AI preflight", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockPreflightOk = false;
    const { POST } = await import("@/app/api/admin/store/ai-scraper/route");
    const res = await POST(
      makePostReq("http://localhost/api/admin/store/ai-scraper", {
        action: "bulk-import",
        parts: [{ name: "فیلتر اول" }, { name: "فیلتر دوم" }],
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPreflightAIRequest).not.toHaveBeenCalled();
    expect(mockRecordAICost).not.toHaveBeenCalled();
    const { db } = await import("@/lib/db");
    expect(db.aIGatewayLog.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// AI LISTING ACQUISITION: source trust, privacy, and review gate
// ════════════════════════════════════════════════════════════

describe("AI Listing Acquisition security contracts", () => {
  const src = () => readSource("admin/ai-scraper/route.ts");

  it("re-extracts source data server-side instead of trusting browser fields", () => {
    const code = src();
    expect(code).toMatch(/Browser-submitted extraction fields are untrusted/);
    expect(code).toMatch(/const scraped = await scrapeUrl\(zai, sourceUrl, controller\.signal\)/);
    expect(code).not.toMatch(/const scraped = body\.scraped as ScrapeResult/);
  });

  it("does not persist scraped contact details before consent verification", () => {
    const code = src();
    const start = code.indexOf("async function importListing");
    const end = code.indexOf("\n/**", start + 10);
    const importer = code.slice(start, end);
    expect(importer).toMatch(/sellerPhone: null/);
    expect(importer).not.toMatch(/sellerPhone:\s*s\.phone/);
  });

  it("keeps third-party source images out of ListingImage until rights and B2 ingest are approved", () => {
    const code = src();
    const start = code.indexOf("async function importListing");
    const end = code.indexOf("\n/**", start + 10);
    const importer = code.slice(start, end);
    expect(importer).toMatch(/Third-party images remain visible only in the admin extraction preview/);
    expect(importer).not.toMatch(/listingImage\.(create|createMany)/);
  });

  it("uses conservative exact catalog matches and attaches a model only when unambiguous", () => {
    const code = src();
    const start = code.indexOf("async function importListing");
    const end = code.indexOf("\n/**", start + 10);
    const importer = code.slice(start, end);
    expect(importer).toMatch(/name:\s*\{\s*equals:/);
    expect(importer).toMatch(/db\.productModel\.findMany/);
    expect(importer).toMatch(/modelId,/);
    expect(importer).not.toMatch(/contains:\s*s\.(brand|category)/);
  });

  it("creates imported ads as unpublished, unverified PENDING drafts", () => {
    const code = src();
    const start = code.indexOf("async function importListing");
    const end = code.indexOf("\n/**", start + 10);
    const importer = code.slice(start, end);
    expect(importer).toMatch(/status:\s*"PENDING"/);
    expect(importer).toMatch(/verified:\s*false/);
    expect(importer).not.toMatch(/publishedAt:\s*new Date/);
  });


  it("rejects incomplete or failed extraction on every import path, including bulk import", () => {
    const code = src();
    const start = code.indexOf("async function importListing");
    const end = code.indexOf("\n/**", start + 10);
    const importer = code.slice(start, end);
    expect(importer).toMatch(/!s\.title\?\.trim\(\)/);
    expect(importer).toMatch(/Error scraping:/);
    expect(importer).toMatch(/پیش‌نویس ساخته نشد/);
  });

  it("routes all source requests through the isolated SSRF-safe fetch module", () => {
    const route = src();
    const helper = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/server/safe-source-fetch.ts"),
      "utf-8",
    );
    expect(route).toContain('from "@/lib/server/safe-source-fetch"');
    expect(helper).toContain("lookup: dnsLookup as SourceFetchDependencies[\"lookup\"]");
    expect(helper).toContain("dependencies.lookup(current.hostname");
    expect(helper).toContain("resolved.some((entry) => !isPublicIpv4(entry.address))");
    expect(helper).toContain("dependencies.request(current, resolved[0].address, signal)");
    expect(helper).toContain("current = new URL(result.redirect, current)");
    expect(helper).toContain('current.port && current.port !== "443"');
    expect(route).not.toContain("page_reader");
  });

  it("serializes concurrent imports for the same source URL with a transaction-scoped advisory lock", () => {
    const code = src();
    const start = code.indexOf("async function importListing");
    const end = code.indexOf("/* POST /api/admin/ai-scraper", start + 10);
    const importer = code.slice(start, end);
    expect(importer).toContain("db.$transaction(async (tx) =>");
    expect(importer).toContain("SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended(${s.url}, 0))) AS source_lock");
    expect(importer).toContain("tx.listing.findFirst");
    expect(importer).toContain("alreadyExists: true");
  });

  it("maps structured extraction values through configured category attributes with source provenance", () => {
    const code = src();
    const start = code.indexOf("async function importListing");
    const end = code.indexOf("/* POST /api/admin/ai-scraper", start + 10);
    const importer = code.slice(start, end);
    expect(importer).toContain("db.categoryAttribute.findMany");
    expect(importer).toContain("where: { categoryId }");
    expect(importer).toContain("operating_hours");
    expect(importer).toContain("manufacturing_year");
    expect(importer).toContain('sourceType: "AI_EXTRACTION"');
    expect(importer).toContain("sourceReference: s.url");
    expect(importer).toContain("confidence: null");
    expect(importer).toContain("attributeValues: { create: extractedAttributeValues }");
  });

  it("bounds extracted numeric fields and does not invent USED when condition is unknown", () => {
    const code = src();
    const start = code.indexOf("async function importListing");
    const end = code.indexOf("/* POST /api/admin/ai-scraper", start + 10);
    const importer = code.slice(start, end);
    expect(importer).toContain("toBoundedInteger(s.year, 1900");
    expect(importer).toContain("toBoundedInteger(s.hours, 0, 1_000_000)");
    expect(importer).toContain("condition: normalizedCondition");
    expect(importer).not.toContain('condition: s.condition || "USED"');
  });

  it("does not guess condition option IDs when category options are ambiguous", () => {
    const code = src();
    const start = code.indexOf("async function importListing");
    const end = code.indexOf("/* POST /api/admin/ai-scraper", start + 10);
    const importer = code.slice(start, end);
    expect(importer).toContain("matches.length === 1");
    expect(importer).toContain("confidence: null");
    expect(importer).not.toContain("confidence: 0.7");
  });

  it("keeps the legacy synthetic action interface fail-closed", () => {
    const code = src();
    expect(code).toMatch(/if \(action\) return NextResponse\.json\([\s\S]{0,220}status: 410/);
  });
});

describe("AI Listing Acquisition manager publication gate", () => {
  it("exposes pending drafts through the admin listings status filter", () => {
    const code = readSource("admin/listings/route.ts");
    expect(code).toMatch(/const status = url\.searchParams\.get\("status"\)/);
    expect(code).toMatch(/if \(status\) where\.status = status/);
    expect(code).toMatch(/hasPermission\(sessionUser\.id, "listing\.read"\)/);
  });

  it("requires listing.publish permission for the manager publish action", () => {
    const code = readSource("admin/listings/route.ts");
    expect(code).toMatch(/hasPermission\(sessionUser\.id, "listing\.publish"\)/);
    expect(code).toMatch(/case "publish": data = \{ status: "PUBLISHED", publishedAt: now \}/);
  });
});

describe("AI scraper manager-review integration", () => {
  it("exposes pending source-backed listings separately from risk-flagged moderation records", () => {
    const route = readSource("admin/moderation/route.ts");
    expect(route).toContain('where: { status: "PENDING", sourceUrl: { not: null } }');
    expect(route).toContain("pendingImports: pendingImports.map");
    expect(route).toContain("requirePermission(user.id, \"moderation.read\")");
  });

  it("renders a dedicated approval lane and links to the existing listing editor", () => {
    const client = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/admin/moderation/ModerationAdminClient.tsx"),
      "utf-8",
    );
    expect(client).toContain("آگهی‌های واردشده با هوش مصنوعی");
    expect(client).toContain('review(item.id, "approve")');
    expect(client).toContain('review(item.id, "reject")');
    expect(client).toContain("/admin/listings/${encodeURIComponent(item.id)}/edit");
    expect(client).toContain("setPendingImports(j.pendingImports ?? [])");
  });
});

describe("AI import manager publication timestamp", () => {
  it("sets publishedAt on first approval and preserves it on re-approval", () => {
    const code = readSource("admin/moderation/route.ts");
    expect(code).toContain('action === "approve" && listing.status !== "PUBLISHED"');
    expect(code).toContain("publishedAt: new Date()");
    expect(code).toContain("data: { status: newStatus, ...publicationFields }");
    expect(code).toContain("after: { status: newStatus, ...publicationFields, reason, logId: log.id }");
  });
});


describe("AI scraper LLM cancellation propagation", () => {
  it("SOURCE: propagates an aborted extraction instead of swallowing it as an optional parse failure", () => {
    const src = readSource("admin/ai-scraper/route.ts");
    expect(src).toMatch(/async function llmExtract\([\s\S]*?signal\?: AbortSignal/);
    expect(src).toMatch(/llmExtract\(zai, text \|\| html, url, signal\)/);
    expect(src).toMatch(/if \(signal\?\.aborted\)[\s\S]*?error\.name = "AbortError"[\s\S]*?throw error/);
  });
});


describe("AI import manager page authorization", () => {
  it("checks moderation.read before loading server-rendered moderation data", () => {
    const page = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/admin/moderation/page.tsx"),
      "utf-8",
    );
    expect(page).toContain('await requirePermission(user.id, "moderation.read")');
    expect(page.indexOf('await requirePermission(user.id, "moderation.read")')).toBeLessThan(
      page.indexOf('db.moderationLog.count'),
    );
  });
});


describe("AI scraper hardening follow-up", () => {
  it("does not expose third-party image URLs to the admin browser", () => {
    const route = readSource("admin/ai-scraper/route.ts");
    const client = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/admin/AIScraperClient.tsx"),
      "utf-8",
    );
    expect(route).toContain("images: []");
    expect(route).toContain("Remote third-party image URLs are intentionally not sent to the browser");
    expect(client).not.toMatch(/<img\\b/i);
  });

  it("attributes import audit records to the authenticated admin", () => {
    const route = readSource("admin/ai-scraper/route.ts");
    expect(route).toContain("async function importListing(s: ScrapeResult, actorId: string)");
    expect(route).toContain("actorId,");
    expect(route).toContain("importListing(scraped, user.id)");
    expect(route).toContain("importListing(s, user.id)");
  });

  it("bounds bulk imports at thirty URLs and rejects non-string or disallowed URL entries", () => {
    const route = readSource("admin/ai-scraper/route.ts");
    expect(route).toContain("const MAX_BULK_IMPORT_URLS = 30");
    expect(route).toContain("urls.length > MAX_BULK_IMPORT_URLS");
    expect(route).toContain('typeof u !== "string" || !isAllowedSourceUrl(u)');
  });

  it("allows selecting all returned results without a stale five-item UI cap", () => {
    const client = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/admin/AIScraperClient.tsx"),
      "utf-8",
    );
    expect(client).not.toContain("MAX_BULK_IMPORT_SELECTION");
    expect(client).not.toContain("selected.size >=");
    expect(client).toContain("new Set(prev).add(index)");
    const updaterStart = client.indexOf("setSelected(prev => {", client.indexOf("const toggle ="));
    const updaterEnd = client.indexOf("});", updaterStart);
    expect(client.slice(updaterStart, updaterEnd)).not.toContain("setError");
  });
});
