import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

const findJsonArrayEnd = (source: string, start: number) => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

describe("definitive machine terminal form coverage", () => {
  const taxonomy = read("prisma/seed-machine-taxonomy.ts");
  const taxonomyV11 = read("prisma/seed-taxonomy-v11.ts");
  const formSeed = read("prisma/seed-category-specific-attributes.ts");
  const treeStart = taxonomy.indexOf("const TREE:");
  const treeEnd = taxonomy.indexOf("const treeSlugs", treeStart);
  const templateStart = formSeed.indexOf("const templates:");
  const templateEnd = formSeed.indexOf("// AttributeDefinition.key is globally unique.", templateStart);

  it("has a parseable, bounded source region for the canonical machine tree and form registry", () => {
    expect(treeStart).toBeGreaterThanOrEqual(0);
    expect(treeEnd).toBeGreaterThan(treeStart);
    expect(templateStart).toBeGreaterThanOrEqual(0);
    expect(templateEnd).toBeGreaterThan(templateStart);
  });

  it("provides exactly one direct template for every terminal L2 and L3 machine category", () => {
    const treeBlock = taxonomy.slice(treeStart, treeEnd);
    const formBlock = formSeed.slice(templateStart, templateEnd);
    // The machine TREE is emitted as JSON-compatible TypeScript. Parse the
    // actual hierarchy instead of inferring terminal nodes from indentation.
    const arrayStart = treeBlock.indexOf("= [") + 2;
    const arrayEnd = findJsonArrayEnd(treeBlock, arrayStart);
    const machineTree = JSON.parse(
      treeBlock.slice(arrayStart, arrayEnd + 1).replace(/^\s*\/\/.*$/gm, ""),
    ) as Array<{ l2: Array<{ slug: string; l3?: Array<{ slug: string }> }> }>;
    const terminalSlugs = machineTree.flatMap((group) =>
      group.l2.flatMap((family) => family.l3?.length ? family.l3.map((variant) => variant.slug) : [family.slug]),
    );
    const allMachineSlugs = machineTree.flatMap((group) => [
      group.slug,
      ...group.l2.flatMap((family) => [family.slug, ...(family.l3 ?? []).map((variant) => variant.slug)]),
    ]);

    const literalTemplateSlugs = [...formBlock.matchAll(/slug:\s*"([^"]+)"/g)].map((match) => match[1]);
    const generatedTemplateSlugs = [...formBlock.matchAll(/leafForm\("([^"]+)"/g)].map((match) => match[1]);
    const templateSlugs = [...literalTemplateSlugs, ...generatedTemplateSlugs];
    const templateSet = new Set(templateSlugs);
    const missing = terminalSlugs.filter((slug) => !templateSet.has(slug));
    const duplicates = templateSlugs.filter((slug, index, all) => all.indexOf(slug) !== index);

    expect(machineTree).toHaveLength(16);
    expect(machineTree.reduce((count, group) => count + group.l2.length, 0)).toBe(168);
    expect(machineTree.reduce((count, group) => count + group.l2.reduce((sum, family) => sum + (family.l3?.length ?? 0), 0), 0)).toBe(88);
    expect(terminalSlugs).toHaveLength(243);
    expect(allMachineSlugs).toContain("dump-truck");
    expect(allMachineSlugs).not.toContain("mining-dump-truck");
    expect(allMachineSlugs).not.toContain("mining-excavator-machine");
    expect(allMachineSlugs).not.toContain("mining-loader-machine");
    for (const externalSlug of ["aerial-platform", "generator", "compressor", "industrial-pumps", "industrial-fans", "boilers", "hvac-equipment", "cutting-equipment", "transformers", "switchgears", "fuel-station-equipment", "heavy-haulage"]) {
      expect(allMachineSlugs).not.toContain(externalSlug);
    }
    expect(templateSet.size).toBe(templateSlugs.length);
    expect(duplicates).toEqual([]);
    expect(missing).toEqual([]);
  });

  it("covers every terminal category under vehicles, attachments, agriculture, industrial equipment and parts", () => {
    const lines = taxonomyV11.split("\n");
    const roots = ["vehicles", "attachments", "agriculture", "industrial-equipment", "parts"];
    const terminalSlugs: string[] = [];

    for (const root of roots) {
      const start = lines.findIndex((line) => line.match(/slug:\s*"([^"]+)"/)?.[1] === root);
      expect(start).toBeGreaterThanOrEqual(0);
      const rootIndent = lines[start].match(/^ */)?.[0].length ?? 0;
      let end = lines.length;
      for (let index = start + 1; index < lines.length; index += 1) {
        const slug = lines[index].match(/slug:\s*"([^"]+)"/)?.[1];
        const indent = lines[index].match(/^ */)?.[0].length ?? 0;
        if (slug && indent === rootIndent) {
          end = index;
          break;
        }
      }

      for (let index = start + 1; index < end; index += 1) {
        const slug = lines[index].match(/slug:\s*"([^"]+)"/)?.[1];
        if (!slug) continue;
        const indent = lines[index].match(/^ */)?.[0].length ?? 0;
        let nextSibling = end;
        for (let next = index + 1; next < end; next += 1) {
          const nextSlug = lines[next].match(/slug:\s*"([^"]+)"/)?.[1];
          const nextIndent = lines[next].match(/^ */)?.[0].length ?? 0;
          if (nextSlug && nextIndent <= indent) {
            nextSibling = next;
            break;
          }
        }
        const hasChildren = lines.slice(index, nextSibling).some((line) => /children:\s*\[/.test(line));
        if (!hasChildren) terminalSlugs.push(slug);
      }
    }

    const formBlock = formSeed.slice(templateStart, templateEnd);
    const literal = [...formBlock.matchAll(/slug:\s*"([^"]+)"/g)].map((match) => match[1]);
    const generated = [...formBlock.matchAll(/leafForm\("([^"]+)"/g)].map((match) => match[1]);
    const templateSet = new Set([...literal, ...generated]);
    const missing = terminalSlugs.filter((slug) => !templateSet.has(slug));

    expect(terminalSlugs).toHaveLength(73);
    expect(new Set(terminalSlugs).size).toBe(73);
    expect(missing).toEqual([]);
  });

  it("makes every generated leaf template concrete and requires its primary technical field", () => {
    expect(formSeed).toContain("const missingTerminalLeafForms: Template[] = [");
    expect(formSeed).toContain("required: fields.length ? [fields[0].key] : []");
    expect(formSeed).toContain("templates.push(...missingTerminalLeafForms)");
    expect(formSeed).toContain('const coverageRootSlugs = ["machinery", "vehicles", "attachments", "agriculture", "industrial-equipment", "parts"];');
    expect(formSeed).toContain("if (duplicateAddedLeafSlugs.length)");
    expect(formSeed).toContain("const partsLeafForms: Template[] = [");
    expect(formSeed).toContain("templates.push(...partsLeafForms)");
    expect(formSeed).toContain("if (duplicatePartsLeafSlugs.length)");
  });
});
