import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const policy = readFileSync(resolve(process.cwd(), "src/lib/ai-policy.ts"), "utf8");
const seed = readFileSync(resolve(process.cwd(), "prisma/seed-ai-policies.ts"), "utf8");

describe("AI scraper zero-spend policy contract", () => {
  it("keeps the seeded SCRAPER task inactive with a zero cost ceiling", () => {
    const scraperStart = seed.indexOf('taskType: "SCRAPER"');
    const scraperSeed = seed.slice(scraperStart, scraperStart + 400);
    expect(scraperStart).toBeGreaterThanOrEqual(0);
    expect(scraperSeed).toContain("costCeilingUsd: 0,");
    expect(scraperSeed).not.toContain("costCeilingUsd: 0.05");
    expect(seed).toContain("create: { ...p, active: !scraperDisabledByDefault }");
    expect(seed).toContain('update: scraperDisabledByDefault ? { active: false, costCeilingUsd: 0 } : {}');
  });

  it("requires explicit runtime opt-in plus an active, positive-cost DB policy", () => {
    expect(policy).toContain('taskType === "SCRAPER" && process.env.HEAVIX_AI_SCRAPER_ENABLED !== "true"');
    expect(policy).toContain("explicit HEAVIX_AI_SCRAPER_ENABLED=true opt-in is required");
    expect(policy).toContain("if (!row || !row.active) return null;");
    expect(policy).toContain('taskType === "SCRAPER" && (!Number.isFinite(row.costCeilingUsd) || row.costCeilingUsd <= 0)');
  });

  it("does not bypass per-user quotas for SCRAPER", () => {
    expect(policy).not.toContain('taskType === "SCRAPER") return { ok: true }');
  });
});
