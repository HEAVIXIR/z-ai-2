import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) =>
  fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("comparison AI summary policy contract", () => {
  it("requires an active bounded policy before generating an uncached summary", () => {
    const route = read("src/app/api/compare/[id]/ai-summary/route.ts");
    const preflightIndex = route.indexOf("preflightAIRequest");
    const generateIndex = route.indexOf("generateAISummary(id, comparisonData)");
    expect(preflightIndex).toBeGreaterThan(-1);
    expect(generateIndex).toBeGreaterThan(preflightIndex);
    expect(route).toContain('taskType: "COMPARE_SUMMARY"');
    expect(route).toContain('recordAICost("COMPARE_SUMMARY"');
    expect(route).toContain('taskType: "COMPARE_SUMMARY"');
    expect(route).toContain("db.aIGatewayLog.create");
  });

  it("returns a fresh cached summary without another model call", () => {
    const route = read("src/app/api/compare/[id]/ai-summary/route.ts");
    const cacheIndex = route.indexOf("if (cacheFresh)");
    const preflightIndex = route.indexOf("preflightAIRequest");
    expect(cacheIndex).toBeGreaterThan(-1);
    expect(cacheIndex).toBeLessThan(preflightIndex);
    expect(route).toContain("60 * 60 * 1000");
  });

  it("seeds a deny-by-default policy for comparison summaries", () => {
    const seed = read("prisma/seed-ai-policies.ts");
    expect(seed).toContain('taskType: "COMPARE_SUMMARY"');
    expect(seed).toContain('allowedRoles: "ADMIN,BUYER,SELLER"');
    expect(seed).toContain("costCeilingUsd: 0.02");
  });

  it("allows the policy-checked snapshot to be reused instead of querying twice", () => {
    const engine = read("src/lib/compare-engine.ts");
    expect(engine).toContain("dataOverride?: ComparisonData");
    expect(engine).toContain("dataOverride ?? await getComparisonData(sessionId)");
  });
});
