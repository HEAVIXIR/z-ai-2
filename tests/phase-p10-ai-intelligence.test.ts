/**
 * HEAVIX — Phase 10 / AI Intelligence Contract Tests
 *
 * Verifies the Phase 10 AI operational layer meets the contract:
 *   1. The 5 AI service modules exist with the expected exports.
 *   2. The 5 admin API routes exist with the expected shapes.
 *   3. Every service uses logAudit with the right action key:
 *        ai.listing.analyze / ai.listing.improve
 *        ai.search.understand / ai.search.zero_recovery
 *        ai.matching.enhance
 *        ai.content.outline / ai.content.seo / ai.content.quality_check
 *        ai.operational.anomaly / ai.operational.fraud / ai.operational.suggest
 *   4. Every AI output type carries `source: "AI_SUGGESTED"` and
 *      `verified: false` — never presented as truth.
 *   5. The ai.execute permission key is enforced on every admin route.
 *
 * No DB dependency — these are pure structural/contract assertions.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";

// ── File paths ──────────────────────────────────────────────
const LIB_LISTING = "src/lib/ai-listing-builder.ts";
const LIB_SEARCH = "src/lib/ai-search.ts";
const LIB_MATCHING = "src/lib/ai-matching-enhanced.ts";
const LIB_CONTENT = "src/lib/ai-content-assistant.ts";
const LIB_OPERATIONAL = "src/lib/ai-operational.ts";

const ROUTE_LISTING = "src/app/api/admin/ai/listing-analyze/route.ts";
const ROUTE_SEARCH = "src/app/api/admin/ai/search-understand/route.ts";
const ROUTE_MATCHING = "src/app/api/admin/ai/match-enhance/route.ts";
const ROUTE_CONTENT = "src/app/api/admin/ai/content-assist/route.ts";
const ROUTE_OPERATIONAL = "src/app/api/admin/ai/operational-signals/route.ts";

const PERMISSIONS_FILE = "src/lib/authorization/permissions.ts";

function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function assertFileExists(p: string) {
  if (!fs.existsSync(p)) {
    throw new Error(`Expected file not found: ${p}`);
  }
}

// ══════════════════════════════════════════════════════════════
// 1. SERVICE MODULES EXIST WITH EXPECTED EXPORTS
// ══════════════════════════════════════════════════════════════
describe("Phase 10 — AI service modules exist with expected exports", () => {
  it("src/lib/ai-listing-builder.ts exists", () => {
    assertFileExists(LIB_LISTING);
  });

  it("ai-listing-builder exports analyzeListing + improveListingContent", () => {
    const c = read(LIB_LISTING);
    expect(c).toMatch(/export async function analyzeListing/);
    expect(c).toMatch(/export async function improveListingContent/);
  });

  it("ai-search.ts exports understandQuery + getZeroResultRecovery", () => {
    assertFileExists(LIB_SEARCH);
    const c = read(LIB_SEARCH);
    expect(c).toMatch(/export async function understandQuery/);
    expect(c).toMatch(/export async function getZeroResultRecovery/);
  });

  it("ai-matching-enhanced.ts exports enhanceMatchScore + generateMatchExplanation", () => {
    assertFileExists(LIB_MATCHING);
    const c = read(LIB_MATCHING);
    expect(c).toMatch(/export async function enhanceMatchScore/);
    expect(c).toMatch(/export async function generateMatchExplanation/);
  });

  it("ai-content-assistant.ts exports generateArticleOutline + optimizeForSEO + checkListingQuality", () => {
    assertFileExists(LIB_CONTENT);
    const c = read(LIB_CONTENT);
    expect(c).toMatch(/export async function generateArticleOutline/);
    expect(c).toMatch(/export async function optimizeForSEO/);
    expect(c).toMatch(/export async function checkListingQuality/);
  });

  it("ai-operational.ts exports detectPriceAnomalies + detectFraudSignals + suggestNextActions", () => {
    assertFileExists(LIB_OPERATIONAL);
    const c = read(LIB_OPERATIONAL);
    expect(c).toMatch(/export async function detectPriceAnomalies/);
    expect(c).toMatch(/export async function detectFraudSignals/);
    expect(c).toMatch(/export async function suggestNextActions/);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. ADMIN API ROUTES EXIST
// ══════════════════════════════════════════════════════════════
describe("Phase 10 — admin AI API routes exist with permission + audit shape", () => {
  const routes = [
    { path: ROUTE_LISTING, verb: "POST" },
    { path: ROUTE_SEARCH, verb: "POST" },
    { path: ROUTE_MATCHING, verb: "POST" },
    { path: ROUTE_CONTENT, verb: "POST" },
    { path: ROUTE_OPERATIONAL, verb: "GET" },
  ];

  for (const r of routes) {
    it(`${r.path} exists and exports ${r.verb}`, () => {
      assertFileExists(r.path);
      const c = read(r.path);
      expect(c).toMatch(new RegExp(`export async function ${r.verb}\\b`));
    });

    it(`${r.path} enforces requireAdmin("ai.execute")`, () => {
      const c = read(r.path);
      expect(c).toMatch(/requireAdmin\(\s*['"]ai\.execute['"]\s*\)/);
    });

    it(`${r.path} declares runtime=nodejs + dynamic=force-dynamic`, () => {
      const c = read(r.path);
      expect(c).toMatch(/runtime\s*=\s*['"]nodejs['"]/);
      expect(c).toMatch(/dynamic\s*=\s*['"]force-dynamic['"]/);
    });

    it(`${r.path} marks its response as AI_SUGGESTED + verified:false`, () => {
      const c = read(r.path);
      expect(c).toMatch(/source:\s*['"]AI_SUGGESTED['"]/);
      expect(c).toMatch(/verified:\s*false/);
    });
  }

  it("operational-signals route also exports POST (fraud + suggest modes)", () => {
    const c = read(ROUTE_OPERATIONAL);
    expect(c).toMatch(/export async function POST/);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. AUDIT KEYS
// ══════════════════════════════════════════════════════════════
describe("Phase 10 — AI audit keys are wired into the service modules", () => {
  it("ai-listing-builder.ts logs ai.listing.analyze + ai.listing.improve", () => {
    const c = read(LIB_LISTING);
    expect(c).toMatch(/action:\s*['"]ai\.listing\.analyze['"]/);
    expect(c).toMatch(/action:\s*['"]ai\.listing\.improve['"]/);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
  });

  it("ai-search.ts logs ai.search.understand + ai.search.zero_recovery", () => {
    const c = read(LIB_SEARCH);
    expect(c).toMatch(/action:\s*['"]ai\.search\.understand['"]/);
    expect(c).toMatch(/action:\s*['"]ai\.search\.zero_recovery['"]/);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
  });

  it("ai-matching-enhanced.ts logs ai.matching.enhance", () => {
    const c = read(LIB_MATCHING);
    expect(c).toMatch(/action:\s*['"]ai\.matching\.enhance['"]/);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
  });

  it("ai-content-assistant.ts logs ai.content.outline / .seo / .quality_check", () => {
    const c = read(LIB_CONTENT);
    expect(c).toMatch(/action:\s*['"]ai\.content\.outline['"]/);
    expect(c).toMatch(/action:\s*['"]ai\.content\.seo['"]/);
    expect(c).toMatch(/action:\s*['"]ai\.content\.quality_check['"]/);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
  });

  it("ai-operational.ts logs ai.operational.anomaly / .fraud / .suggest", () => {
    const c = read(LIB_OPERATIONAL);
    expect(c).toMatch(/action:\s*['"]ai\.operational\.anomaly['"]/);
    expect(c).toMatch(/action:\s*['"]ai\.operational\.fraud['"]/);
    expect(c).toMatch(/action:\s*['"]ai\.operational\.suggest['"]/);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. AI OUTPUT IS ALWAYS MARKED AI_SUGGESTED (NEVER VERIFIED)
// ══════════════════════════════════════════════════════════════
describe("Phase 10 — every AI output type is marked AI_SUGGESTED + verified:false", () => {
  it("ai-listing-builder.ts types declare source:'AI_SUGGESTED' + verified:false", () => {
    const c = read(LIB_LISTING);
    // Both ListingAnalysis and ImprovedListingContent types must mark the
    // AI suggestion as unverified — the structural type enforces this.
    expect(c).toMatch(/source:\s*['"]AI_SUGGESTED['"]/);
    expect(c).toMatch(/verified:\s*false/);
  });

  it("ai-search.ts types declare source:'AI_SUGGESTED' + verified:false", () => {
    const c = read(LIB_SEARCH);
    expect(c).toMatch(/source:\s*['"]AI_SUGGESTED['"]/);
    expect(c).toMatch(/verified:\s*false/);
  });

  it("ai-matching-enhanced.ts types declare source:'AI_SUGGESTED' + verified:false", () => {
    const c = read(LIB_MATCHING);
    expect(c).toMatch(/source:\s*['"]AI_SUGGESTED['"]/);
    expect(c).toMatch(/verified:\s*false/);
  });

  it("ai-content-assistant.ts types declare source:'AI_SUGGESTED' + verified:false", () => {
    const c = read(LIB_CONTENT);
    expect(c).toMatch(/source:\s*['"]AI_SUGGESTED['"]/);
    expect(c).toMatch(/verified:\s*false/);
  });

  it("ai-operational.ts types declare source:'AI_SUGGESTED' + verified:false", () => {
    const c = read(LIB_OPERATIONAL);
    expect(c).toMatch(/source:\s*['"]AI_SUGGESTED['"]/);
    expect(c).toMatch(/verified:\s*false/);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. z-ai-web-dev-sdk IS SERVER-ONLY + PERMISSION KEY EXISTS
// ══════════════════════════════════════════════════════════════
describe("Phase 10 — z-ai-web-dev-sdk is server-only + ai.execute permission exists", () => {
  it("every AI service module imports z-ai-web-dev-sdk", () => {
    for (const f of [LIB_LISTING, LIB_SEARCH, LIB_MATCHING, LIB_CONTENT, LIB_OPERATIONAL]) {
      const c = read(f);
      expect(c).toMatch(/import.*ZAI.*from\s*['"]z-ai-web-dev-sdk['"]/);
    }
  });

  it("no AI service module has 'use client' directive", () => {
    for (const f of [LIB_LISTING, LIB_SEARCH, LIB_MATCHING, LIB_CONTENT, LIB_OPERATIONAL]) {
      const c = read(f);
      const firstLine = c.split("\n")[0];
      expect(firstLine).not.toMatch(/^['"]use client['"]/);
    }
  });

  it("ai.execute permission key exists in PERMISSIONS array", () => {
    assertFileExists(PERMISSIONS_FILE);
    const c = read(PERMISSIONS_FILE);
    expect(c).toMatch(/['"]ai\.execute['"]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. BEST-EFFORT — every service module wraps AI calls in try/catch
// ══════════════════════════════════════════════════════════════
describe("Phase 10 — every AI service is best-effort (try/catch — never crashes the route)", () => {
  for (const f of [LIB_LISTING, LIB_SEARCH, LIB_MATCHING, LIB_CONTENT, LIB_OPERATIONAL]) {
    it(`${f} wraps logic in try/catch`, () => {
      const c = read(f);
      expect(c).toMatch(/try\s*\{/);
      // allow optional binding name + optional `: any` type annotation:
      //   } catch (err: any) {   |   } catch {   |   } catch (e) {
      expect(c).toMatch(/catch\s*(\(\s*\w*(\s*:\s*\w+)?\s*\))?\s*\{/);
    });
  }
});
