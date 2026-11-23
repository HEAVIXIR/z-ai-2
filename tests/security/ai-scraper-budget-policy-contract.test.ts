import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const policy = readFileSync(resolve(process.cwd(), "src/lib/ai-policy.ts"), "utf8");
const seed = readFileSync(resolve(process.cwd(), "prisma/seed-ai-policies.ts"), "utf8");

describe("AI scraper zero-spend policy contract", () => {
  it("keeps the seeded SCRAPER task inactive with a zero cost ceiling", () => {
    expect(seed).toMatch(/taskType: "SCRAPER"[\\s\\S]{0,350}costCeilingUsd: 0,/);
    expect(seed).toContain("create: { ...p, active: !scraperDisabledByDefault }");
    expect(seed).toContain('update: scraperDisabledByDefault ? { active: false, costCeilingUsd: 0 } : {}');
    expect(seed).not.toMatch(/costCeilingUsd: 0\\.05/);
  });

  it("fails closed for missing, inactive or zero-cost SCRAPER policies", () => {
    expect(policy).toMatch(/if \(!row \|\| !row\\.active\) return null/);
    expect(policy).toMatch(/taskType === "SCRAPER".*costCeilingUsd <= 0/s);
  });

  it("does not bypass per-user quotas for SCRAPER", () => {
    expect(policy).not.toMatch(/taskType === "SCRAPER"\\) return \{ ok: true \}/);
  });
});
