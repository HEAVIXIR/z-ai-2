import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "prisma/seed-category-specific-attributes.ts"),
  "utf8",
);

// Extract all template definition slugs: patterns like { slug: "xxx", label: ...
const cloneSectionStart = source.indexOf("// Canonical 16-family machine tree:");
if (cloneSectionStart < 0) throw new Error("Canonical clone section marker is missing");
const baseTemplateSection = source.slice(0, cloneSectionStart);
const cloneSection = source.slice(cloneSectionStart);
const baseTemplateSlugs = new Set(
  [...baseTemplateSection.matchAll(/slug:\s*"([^"]+)"/g)].map((entry) => entry[1]),
);

const definedSlugPattern = /slug:\s*"([^"]+)"/g;
const definedSlugs = new Set<string>();
let match: RegExpExecArray | null;
while ((match = definedSlugPattern.exec(source)) !== null) {
  definedSlugs.add(match[1]);
}

// Extract all cloneTemplate source slugs: cloneTemplate("sourceSlug", "newSlug", ...
const cloneSourcePattern = /cloneTemplate\("([^"]+)",\s*"/g;
const cloneSources: string[] = [];
while ((match = cloneSourcePattern.exec(source)) !== null) {
  cloneSources.push(match[1]);
}

describe("seed-category-specific-attributes: template source integrity", () => {
  it("has at least 250 defined template slugs", () => {
    expect(definedSlugs.size).toBeGreaterThanOrEqual(250);
  });

  it("has at least 80 cloneTemplate calls", () => {
    expect(cloneSources.length).toBeGreaterThanOrEqual(80);
  });

  it("every cloneTemplate source is registered before clone expressions are evaluated", () => {
    const missing = cloneSources.filter((slug) => !baseTemplateSlugs.has(slug));
    expect(missing).toEqual([]);
  });

  it("keeps motor-grader and other late family bases ahead of the clone section", () => {
    for (const slug of [
      "motor-grader",
      "backhoe-loader-standard",
      "hydraulic-shovel",
      "dump-truck",
      "rigid-mining-truck",
      "asphalt-recycling",
      "underground-dump-truck",
      "generator",
    ]) {
      expect(baseTemplateSlugs.has(slug), slug).toBe(true);
    }
    expect(cloneSection).toContain('cloneTemplate("motor-grader", "compact-grader"');
  });

  it("does not reference the removed bare 'excavator' source slug", () => {
    // The bare "excavator" slug was never defined as a template.
    // cloneTemplate("excavator", ...) was a bug that caused
    // "Cannot clone missing source template: excavator" (workflow 45410484083).
    // The correct source is "mining-excavator" (the L2 base for mining excavators).
    expect(cloneSources).not.toContain("excavator");
  });

  it("excavator-mining clones from mining-excavator (the correct L2 base)", () => {
    expect(source).toContain(
      'cloneTemplate("mining-excavator", "excavator-mining", "Mining Excavator"',
    );
  });

  it("mining-excavator template is defined with the required fields", () => {
    expect(source).toContain('slug: "mining-excavator"');
    // The clone requires: operating_weight, bucket_capacity, payload_capacity
    // Verify these fields exist in the mining-excavator definition
    const miningExcavatorBlock = source.match(
      /slug:\s*"mining-excavator".*?\n\s*\},/s,
    );
    expect(miningExcavatorBlock).toBeTruthy();
    const block = miningExcavatorBlock![0];
    expect(block).toContain("operating_weight");
    expect(block).toContain("bucket_capacity");
    expect(block).toContain("payload_capacity");
  });

  it("deduplicates canonical machine clones against parts leaf forms", () => {
    const canonicalTargets = [
      ...cloneSection.matchAll(/cloneTemplate\("([^"]+)",\s*"([^"]+)"/g),
    ].map((entry) => entry[2]);
    const partsLeafSlugs = [
      ...source.matchAll(/leafForm\(\s*"([^"]+)"/g),
    ].map((entry) => entry[1]);
    const overlap = partsLeafSlugs.filter((slug) => canonicalTargets.includes(slug));
    expect(overlap.length).toBeGreaterThanOrEqual(80);
    expect(source).toContain("const existingTemplateSlugs = new Set(templates.map((template) => template.slug));");
    expect(source).toContain("const uniquePartsLeafForms = partsLeafForms.filter(");
    expect(source).toContain("templates.push(...uniquePartsLeafForms);");
  });

  it("deduplicates canonical machine clones against supplemental terminal leaf forms", () => {
    const terminalStart = source.indexOf("const missingTerminalLeafForms: Template[] = [");
    const terminalEnd = source.indexOf("const duplicateAddedLeafSlugs", terminalStart);
    expect(terminalStart).toBeGreaterThanOrEqual(0);
    expect(terminalEnd).toBeGreaterThan(terminalStart);

    const terminalBlock = source.slice(terminalStart, terminalEnd);
    const canonicalTargets = [
      ...cloneSection.matchAll(/cloneTemplate\("([^"]+)",\s*"([^"]+)"/g),
    ].map((entry) => entry[2]);
    const terminalSlugs = [
      ...terminalBlock.matchAll(/leafForm[(]\s*"([^"]+)"/g),
    ].map((entry) => entry[1]);
    const overlap = terminalSlugs.filter((slug) => canonicalTargets.includes(slug));

    expect(overlap.length).toBeGreaterThanOrEqual(80);
    expect(source).toContain("const existingTemplateSlugsForLeafForms = new Set(templates.map((template) => template.slug));");
    expect(source).toContain("const uniqueMissingTerminalLeafForms = missingTerminalLeafForms.filter(");
    expect(source).toContain("templates.push(...uniqueMissingTerminalLeafForms);");
  });

  it("no duplicate template slugs in definitions", () => {
    const allSlugs: string[] = [];
    const slugPattern = /slug:\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = slugPattern.exec(source)) !== null) {
      allSlugs.push(m[1]);
    }
    const duplicates = allSlugs.filter(
      (slug, index) => allSlugs.indexOf(slug) !== index,
    );
    expect(duplicates).toEqual([]);
  });
});
