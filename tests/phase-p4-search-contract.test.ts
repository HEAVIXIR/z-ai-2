/**
 * HEAVIX — Phase 4 Search & Discovery Deepening Contract Tests
 *
 * Verifies the search/discovery deepening implementation:
 *   • `src/lib/search-service.ts` exists with expected exports
 *   • `/api/search`, `/api/search/suggestions`, `/api/search/compare`,
 *     `/api/search/facets` route files exist with proper GET handlers
 *   • `/api/search/suggestions` no longer has @ts-nocheck
 *   • `/api/listings` GET supports the new Phase 4 filters
 *   • `/api/saved-searches` supports POST (create) with `alertEnabled`
 *     + writes `search.saved.create` audit log
 *
 * No DB dependency — file-content assertions only.
 *
 * Usage: bunx vitest run tests/phase-p4-search-contract.test.ts
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function read(rel: string): string {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

const SEARCH_ROUTES = [
  "src/app/api/search/route.ts",
  "src/app/api/search/suggestions/route.ts",
  "src/app/api/search/compare/route.ts",
  "src/app/api/search/facets/route.ts",
];

// ════════════════════════════════════════════════════════════
// 1. search-service.ts — exports + structure
// ════════════════════════════════════════════════════════════
describe("Phase 4 — search-service.ts contract", () => {
  const SVC = "src/lib/search-service.ts";

  it("file exists at src/lib/search-service.ts", () => {
    expect(exists(SVC)).toBe(true);
  });

  it("exports the 5 canonical service functions (search / getSuggestions / getFacets / getRelatedSearches / compareListings)", () => {
    const c = read(SVC);
    expect(c).toMatch(/export async function search\b/);
    expect(c).toMatch(/export async function getSuggestions\b/);
    expect(c).toMatch(/export async function getFacets\b/);
    expect(c).toMatch(/export async function getRelatedSearches\b/);
    expect(c).toMatch(/export async function compareListings\b/);
  });

  it("imports the Persian-aware normalization helpers + db", () => {
    const c = read(SVC);
    expect(c).toMatch(/from ["']@\/lib\/search["']/);
    expect(c).toMatch(/normalizeSearchQuery|buildSearchWhere/);
    expect(c).toMatch(/from ["']@\/lib\/db["']/);
  });

  it("does NOT use @ts-nocheck", () => {
    const c = read(SVC);
    const firstLines = c.split("\n").slice(0, 5).join("\n");
    expect(firstLines).not.toMatch(/@ts-nocheck/);
  });

  it("caps compareListings at 4 listings", () => {
    const c = read(SVC);
    expect(c).toMatch(/\.slice\(0,\s*4\)|up to 4 listings|capped at 4/i);
  });
});

// ════════════════════════════════════════════════════════════
// 2. Search route files — existence + structure
// ════════════════════════════════════════════════════════════
describe("Phase 4 — search route files contract", () => {
  it("all 4 search route files exist (search / suggestions / compare / facets)", () => {
    for (const p of SEARCH_ROUTES) {
      expect(exists(p)).toBe(true);
    }
  });

  it("all 4 search route files export an async GET handler with force-dynamic", () => {
    for (const p of SEARCH_ROUTES) {
      const c = read(p);
      expect(c).toMatch(/export async function GET\b/);
      expect(c).toMatch(/export const dynamic/);
    }
  });

  it("/api/search/suggestions has NO @ts-nocheck (Phase 4 Task 1)", () => {
    const c = read("src/app/api/search/suggestions/route.ts");
    const firstLines = c.split("\n").slice(0, 5).join("\n");
    expect(firstLines).not.toMatch(/@ts-nocheck/);
  });

  it("/api/search/compare is PUBLIC (no requireAdmin) and calls compareListings", () => {
    const c = read("src/app/api/search/compare/route.ts");
    expect(c).not.toMatch(/requireAdmin/);
    expect(c).toMatch(/compareListings/);
  });

  it("/api/search/facets is PUBLIC + delegates to getFacets from search-service", () => {
    const c = read("src/app/api/search/facets/route.ts");
    expect(c).not.toMatch(/requireAdmin/);
    expect(c).toMatch(/from ["']@\/lib\/search-service["']/);
    expect(c).toMatch(/getFacets/);
  });

  it("/api/search/suggestions delegates to getSuggestions (no inline DB calls)", () => {
    const c = read("src/app/api/search/suggestions/route.ts");
    expect(c).toMatch(/from ["']@\/lib\/search-service["']/);
    expect(c).toMatch(/getSuggestions/);
    // The route should be a thin pass-through — no direct Prisma
    // queries (those now live in the service).
    expect(c).not.toMatch(/db\.(brand|category|searchQuery)\.findMany/);
  });
});

// ════════════════════════════════════════════════════════════
// 3. /api/listings — Phase 4 faceted filters + sort
// ════════════════════════════════════════════════════════════
describe("Phase 4 — /api/listings faceted filters contract", () => {
  const R = "src/app/api/listings/route.ts";

  it("file exists", () => {
    expect(exists(R)).toBe(true);
  });

  it("parses priceMin + priceMax + condition + yearMin + yearMax + sort query params", () => {
    const c = read(R);
    expect(c).toMatch(/priceMin/);
    expect(c).toMatch(/priceMax/);
    expect(c).toMatch(/condition/);
    expect(c).toMatch(/NEW|USED|REFURBISHED/);
    expect(c).toMatch(/yearMin/);
    expect(c).toMatch(/yearMax/);
    expect(c).toMatch(/newest|oldest|price-asc|price-desc|featured/);
  });

  it("forwards the new filters to searchListings (fast path) AND applies them locally (slow path)", () => {
    const c = read(R);
    // Fast path — searchListings call receives the new filters.
    expect(c).toMatch(/searchListings\(\{[\s\S]*?priceMin[\s\S]*?\}\)/);
    // Slow path — local where.AND clauses for price/condition/year.
    expect(c).toMatch(/priceFilter/);
    expect(c).toMatch(/where\.AND/);
  });
});

// ════════════════════════════════════════════════════════════
// 4. /api/saved-searches — POST + alertEnabled + audit
// ════════════════════════════════════════════════════════════
describe("Phase 4 — /api/saved-searches POST contract", () => {
  const R = "src/app/api/saved-searches/route.ts";

  it("file exists", () => {
    expect(exists(R)).toBe(true);
  });

  it("exports an async POST handler", () => {
    const c = read(R);
    expect(c).toMatch(/export async function POST\b/);
  });

  it("accepts alertEnabled alias + logs search.saved.create via logAudit", () => {
    const c = read(R);
    expect(c).toMatch(/alertEnabled/);
    expect(c).toMatch(/search\.saved\.create/);
    expect(c).toMatch(/from ["']@\/lib\/audit["']/);
    expect(c).toMatch(/logAudit/);
  });
});
