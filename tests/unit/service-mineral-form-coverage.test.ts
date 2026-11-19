import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("service and mineral terminal form coverage", () => {
  const taxonomy = read("prisma/seed-service-and-mineral-taxonomy.ts");
  const taxonomyV11 = read("prisma/seed-taxonomy-v11.ts");
  const formSeed = read("prisma/seed-service-mineral-attributes.ts");

  it("provides a dedicated form for every supplemental service leaf", () => {
    const treeStart = taxonomy.indexOf("const tree: N[] = [");
    const treeEnd = taxonomy.indexOf("const minerals:", treeStart);
    const treeBlock = taxonomy.slice(treeStart, treeEnd);
    const allSlugs = [...treeBlock.matchAll(/slug:"([^"]+)"/g)].map((match) => match[1]);
    const parentSlugs = [...treeBlock.matchAll(/slug:"([^"]+)",children:\s*\[/g)].map((match) => match[1]);
    const serviceLeaves = allSlugs.filter((slug) => !parentSlugs.includes(slug));

    const formsStart = formSeed.indexOf("const forms:Form[]=[");
    const generatedStart = formSeed.indexOf("const generatedFormEntries = [", formsStart);
    const explicitForms = formSeed.slice(formsStart, generatedStart);
    const formSlugs = [...explicitForms.matchAll(/slug:"([^"]+)"/g)].map((match) => match[1]);

    expect(serviceLeaves).toHaveLength(26);
    expect(new Set(formSlugs).size).toBe(formSlugs.length);
    expect(serviceLeaves.filter((slug) => !formSlugs.includes(slug))).toEqual([]);
  });

  it("covers every legacy terminal service category in the V1.1 service tree", () => {
    const lines = taxonomyV11.split("\n");
    const rootIndex = lines.findIndex((line) => line.match(/slug:\\s*"([^"]+)"/)?.[1] === "services");
    expect(rootIndex).toBeGreaterThanOrEqual(0);
    const rootIndent = lines[rootIndex].match(/^ */)?.[0].length ?? 0;
    let rootEnd = lines.length;
    for (let index = rootIndex + 1; index < lines.length; index += 1) {
      const slug = lines[index].match(/slug:\\s*"([^"]+)"/)?.[1];
      const indent = lines[index].match(/^ */)?.[0].length ?? 0;
      if (slug && indent === rootIndent) {
        rootEnd = index;
        break;
      }
    }
    const rootLines = lines.slice(rootIndex + 1, rootEnd);
    const terminalSlugs: string[] = [];
    for (let index = 0; index < rootLines.length; index += 1) {
      const slug = rootLines[index].match(/slug:\\s*"([^"]+)"/)?.[1];
      if (!slug) continue;
      const indent = rootLines[index].match(/^ */)?.[0].length ?? 0;
      let nextSibling = rootLines.length;
      for (let next = index + 1; next < rootLines.length; next += 1) {
        const nextSlug = rootLines[next].match(/slug:\\s*"([^"]+)"/)?.[1];
        const nextIndent = rootLines[next].match(/^ */)?.[0].length ?? 0;
        if (nextSlug && nextIndent <= indent) {
          nextSibling = next;
          break;
        }
      }
      if (!rootLines.slice(index, nextSibling).some((line) => /children:\\s*\\[/.test(line))) {
        terminalSlugs.push(slug);
      }
    }

    const generatedStart = formSeed.indexOf("const generatedFormEntries = [");
    const generatedEnd = formSeed.indexOf("const generatedForms:", generatedStart);
    const generatedBlock = formSeed.slice(generatedStart, generatedEnd);
    const generatedSlugs = [...generatedBlock.matchAll(/\\["([^"]+)",\\s*\\[/g)].map((match) => match[1]);

    expect(terminalSlugs).toHaveLength(19);
    expect(terminalSlugs.filter((slug) => !generatedSlugs.includes(slug))).toEqual([]);
  });

  it("provides dedicated forms for all terminal mineral/material categories", () => {
    const lines = taxonomyV11.split("\n");
    const rootIndex = lines.findIndex((line) => line.match(/slug:\s*"([^"]+)"/)?.[1] === "minerals-materials");
    expect(rootIndex).toBeGreaterThanOrEqual(0);
    const rootIndent = lines[rootIndex].match(/^ */)?.[0].length ?? 0;
    let rootEnd = lines.length;
    for (let index = rootIndex + 1; index < lines.length; index += 1) {
      const slug = lines[index].match(/slug:\s*"([^"]+)"/)?.[1];
      const indent = lines[index].match(/^ */)?.[0].length ?? 0;
      if (slug && indent === rootIndent) {
        rootEnd = index;
        break;
      }
    }
    const rootBlock = lines.slice(rootIndex, rootEnd).join("\n");
    const directMaterialSlugs = [...rootBlock.matchAll(/slug:\s*"([^"]+)"/g)]
      .map((match) => match[1])
      .filter((slug) => slug !== "minerals-materials" && !["iron-ore", "copper-ore", "coal"].includes(slug));

    const mineralBlockStart = taxonomy.indexOf("const minerals:");
    const mineralBlockEnd = taxonomy.indexOf("async function insert", mineralBlockStart);
    const supplementalMineralBlock = taxonomy.slice(mineralBlockStart, mineralBlockEnd);
    const supplementalMineralSlugs = [...supplementalMineralBlock.matchAll(/slug:"([^"]+)"/g)].map((match) => match[1]);
    const terminalMaterialSlugs = [...directMaterialSlugs, ...supplementalMineralSlugs];

    const generatedStart = formSeed.indexOf("const generatedFormEntries = [");
    const generatedEnd = formSeed.indexOf("const generatedForms:", generatedStart);
    const generatedBlock = formSeed.slice(generatedStart, generatedEnd);
    const generatedFormSlugs = [...generatedBlock.matchAll(/\["([^"]+)",\s*\[/g)].map((match) => match[1]);

    expect(directMaterialSlugs).toHaveLength(13);
    expect(supplementalMineralSlugs).toHaveLength(9);
    expect(terminalMaterialSlugs).toHaveLength(22);
    expect(terminalMaterialSlugs.filter((slug) => !generatedFormSlugs.includes(slug))).toEqual([]);
  });

  it("links common mineral fields at the material root and composes them with leaf forms", () => {
    expect(formSeed).toContain('await linkFields(mineralRoot.id,commonMineral,"minerals-materials")');
    expect(formSeed).toContain("const generatedForms: Form[] = generatedFormEntries.map");
    expect(formSeed).toContain("forms.push(...generatedForms)");
    expect(formSeed).toContain("mineralSupplySlugs.has(form.slug)?[...commonMineral,...form.fields]:form.fields");
  });
});
