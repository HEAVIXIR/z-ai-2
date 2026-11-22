import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const policy = readFileSync(resolve(process.cwd(), "src/lib/ai-policy.ts"), "utf8");
const seed = readFileSync(resolve(process.cwd(), "prisma/seed-ai-policies.ts"), "utf8");

describe("AI scraper budget policy contract", () => {
  it("does not synthesize a zero-cost SCRAPER policy when the DB row is missing", () => {
    expect(policy).toMatch(/if \(!row \|\| !row\.active\) return null/);
    expect(policy).toMatch(/taskType === "SCRAPER".*costCeilingUsd <= 0/s);
    expect(policy).not.toMatch(/costCeilingUsd: 0,\s*active: true/);
  });

  it("does not bypass per-user quotas for SCRAPER", () => {
    expect(policy).not.toMatch(/taskType === "SCRAPER"\) return \{ ok: true \}/);
  });

  it("seeds a positive reservation and repairs only legacy zero-ceiling rows", () => {
    expect(seed).toMatch(/taskType: "SCRAPER"[\s\S]{0,350}costCeilingUsd: 0\.05/);
    expect(seed).toMatch(/where: \{ taskType: "SCRAPER", costCeilingUsd: 0 \}/);
    expect(seed).toMatch(/data: \{ costCeilingUsd: 0\.05 \}/);
  });
});
