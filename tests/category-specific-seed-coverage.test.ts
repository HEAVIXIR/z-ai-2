import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const seedSource = readFileSync(
  join(process.cwd(), "prisma/seed-category-specific-attributes.ts"),
  "utf8",
);

const expectedTerminalSlugs = [
  "bulldozer",
  "grader",
  "backhoe-loader",
  "mining-excavator-machine",
  "drilling-machine",
  "shovel",
  "cubic-crusher",
  "conveyor-belt",
  "crane",
  "sizing-conveyor",
  "belt-conveyor",
] as const;

function getUncoveredTerminalTemplateBlock(): string {
  const start = seedSource.indexOf("const uncoveredTerminalCategoryForms: Template[] = [");
  if (start < 0) throw new Error("Uncovered terminal category template block is missing.");
  const end = seedSource.indexOf("\n];", start);
  if (end < 0) throw new Error("Uncovered terminal category template block is not closed.");
  return seedSource.slice(start, end);
}

describe("category-specific seed terminal coverage", () => {
  it("defines exactly one dedicated form for each previously uncovered terminal category", () => {
    const block = getUncoveredTerminalTemplateBlock();
    const declaredSlugs = [...block.matchAll(/leafForm\("([a-z0-9-]+)"/g)].map((match) => match[1]);

    expect(declaredSlugs).toEqual([...expectedTerminalSlugs]);
    expect(new Set(declaredSlugs).size).toBe(expectedTerminalSlugs.length);
  });

  it("keeps every new form non-empty and category-namespaced", () => {
    const block = getUncoveredTerminalTemplateBlock();

    for (const slug of expectedTerminalSlugs) {
      expect(block).toContain(`leafForm("${slug}"`);
      expect(block).toContain(`${slug.replace(/-/g, "_")}_`);
    }
    expect(block.match(/\{ key: "/g)?.length ?? 0).toBeGreaterThanOrEqual(55);
  });

  it("retains fail-closed coverage validation before the first database write", () => {
    const missingFormsGuard = seedSource.indexOf(
      "Missing dedicated forms for terminal equipment categories; seed aborted before writes:",
    );
    const firstWrite = seedSource.indexOf("await upsertField({ ...field, key: resolvedKey })");

    expect(missingFormsGuard).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(missingFormsGuard).toBeLessThan(firstWrite);
    expect(seedSource).toContain("templates.push(...uncoveredTerminalCategoryForms)");
  });
});
