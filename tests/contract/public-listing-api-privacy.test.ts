import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("public listing and comparison API privacy contract", () => {
  it("uses the same allowlisted DTO in both listing-search query paths", () => {
    const source = read("src/app/api/listings/route.ts");
    expect(source).toContain("toPublicListingDTO");
    expect(source).not.toContain("const data = rows.map((l) => ({\n      ...l");
  });

  it("only compares published listings through the legacy public endpoint", () => {
    const source = read("src/app/api/compare/route.ts");
    expect(source).toContain('status: "PUBLISHED"');
    expect(source).toContain("ordered.map(toPublicListingDTO)");
    expect(source).not.toContain("function serialize(l: any)");
  });

  it("rate-limits public comparison creation, item mutations, and capability reads", () => {
    const collection = read("src/app/api/compare/route.ts");
    const itemMutation = read("src/app/api/compare/[id]/items/route.ts");
    const sessionRead = read("src/app/api/compare/[id]/route.ts");
    const sharedRead = read("src/app/api/compare/shared/[token]/route.ts");
    expect(collection).toContain("COMPARE_CREATE");
    expect(collection).toContain("COMPARE_READ");
    expect(itemMutation).toContain("COMPARE_ADD_ITEM");
    expect(sessionRead).toContain("COMPARE_READ");
    expect(sessionRead).toContain('Cache-Control": "private, no-store"');
    expect(sharedRead).toContain("COMPARE_READ");
    expect(sharedRead).toContain('Cache-Control": "private, no-store"');
  });

  it("keeps owned comparison sessions private while preserving anonymous compare capability", () => {
    const route = read("src/app/api/compare/[id]/route.ts");
    expect(route).toContain("if (session.userId !== null)");
    expect(route).toContain('return NextResponse.json({ error: "Unauthorized" }, { status: 401 })');
    expect(route).toContain('return NextResponse.json({ error: "Forbidden" }, { status: 403 })');
  });

  it("rate-limits and caches AI comparison summaries, invalidating cache after item changes", () => {
    const route = read("src/app/api/compare/[id]/ai-summary/route.ts");
    const engine = read("src/lib/compare-engine.ts");
    expect(route).toContain("COMPARE_AI_SUMMARY");
    expect(route).toContain("rateLimit(");
    expect(engine).toContain("cacheAgeMs < 15 * 60 * 1000");
    expect(engine).toContain("aiSummary: null, aiSummaryAt: null");
  });

  it("uses trusted proxy IP extraction instead of the caller-controlled XFF prefix", () => {
    const context = read("src/lib/request-context.ts");
    expect(context).toContain('headers.get("cf-connecting-ip")');
    expect(context).toContain("hops[hops.length - 1]");
    expect(context).not.toContain('xff.split(",")[0]');
  });

  it("rejects non-public listings before they enter a comparison session", () => {
    const source = read("src/lib/compare-engine.ts");
    expect(source).toContain('status: "PUBLISHED"');
    expect(source).toContain('status: "ACTIVE"');
    expect(source.split('brand: { is: { active: true, status: "ACTIVE" } }').length - 1).toBe(2);
    expect(source).toContain("...(input.brandId ? { brandId: input.brandId } : {})");
    expect(source).toContain("...(it.brandId ? { brandId: it.brandId } : {})");
  });
});
