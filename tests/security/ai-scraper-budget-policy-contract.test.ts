import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const policy = readFileSync(resolve(process.cwd(), "src/lib/ai-policy.ts"), "utf8");
const seed = readFileSync(resolve(process.cwd(), "prisma/seed-ai-policies.ts"), "utf8");

describe("AI scraper zero-spend policy contract", () => {
  it("keeps the seeded SCRAPER task inactive with a zero cost ceiling", () => {
    expect(seed).toContain('taskType: "SCRAPER"');
    expect(seed).toContain("costCeilingUsd: 0,");
    expect(seed).toContain("create: { ...p, active: !scraperDisabledByDefault }");
    expect(seed).toContain('update: scraperDisabledByDefault ? { active: false, costCeilingUsd: 0 } : {}');
    expect(seed).not.toContain("costCeilingUsd: 0.05");
  });

  it("fails closed for missing, inactive or zero-cost SCRAPER policies", () => {
    expect(policy).toContain("if (!row || !row.active) return null;");
    expect(policy).toContain('taskType === "SCRAPER" && (!Number.isFinite(row.costCeilingUsd) || row.costCeilingUsd <= 0)');
  });

  it("does not bypass per-user quotas for SCRAPER", () => {
    expect(policy).not.toContain('taskType === "SCRAPER") return { ok: true }');
  });
});
