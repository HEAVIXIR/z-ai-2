import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("HEAVIX listing taxonomy and domain-form contracts", () => {
  it("rejects parent categories at the listing API boundary", () => {
    const route = read("src/app/api/listings/route.ts");
    expect(route).toContain('children: { where: { active: true }, select: { id: true }, take: 1 }');
    expect(route).toContain("if (category.children.length > 0)");
    expect(route).toContain("فقط انتخاب آخرین زیرشاخه برای ثبت آگهی مجاز است");
  });

  it("composes inherited category attributes from root to selected leaf", () => {
    const route = read("src/app/api/categories/[id]/attributes/route.ts");
    expect(route).toContain("const ancestryLeafFirst: string[] = [selected.id]");
    expect(route).toContain("const categoryIds = ancestryLeafFirst.reverse()");
    expect(route).toContain("merged.set(key");
  });

  it("keeps service offers and requests in the SERVICE taxonomy layer", () => {
    const route = read("src/app/api/listings/route.ts");
    expect(route).toContain('transactionType.key === "SERVICE_REQUEST" || transactionType.key === "SERVICE_OFFER"');
    expect(route).toContain('transactionType.key !== "SERVICE_REQUEST" && transactionType.key !== "SERVICE_OFFER"');
    const wizard = read("src/app/listings/new/page.tsx");
    expect(wizard).toContain('const isServiceFlow = isServiceRequest || isServiceOffer');
    expect(wizard).toContain("const categoryRoots = isServiceFlow ? serviceRoots : catalogRoots");
    expect(wizard).toContain("if (isServiceRequest || isServiceOffer) return true");
  });

  it("does not overwrite a globally shared attribute with an incompatible category definition", () => {
    const seed = read("prisma/seed-service-mineral-attributes.ts");
    expect(seed).toContain("const isCompatible=(candidate:typeof base)");
    expect(seed).toContain("candidate.type===x.type");
    expect(seed).toContain("candidate.unit===(x.unit??null)");
    expect(seed).toContain("candidate.name===x.fa");
    expect(seed).toContain("candidate.nameEn===x.en");
    expect(seed).toContain('(candidate.labelFa??candidate.name)===x.fa');
    expect(seed).toContain('(candidate.labelEn??candidate.nameEn)===x.en');
    expect(seed).toContain("candidate.filterable===!!x.filterable");
    expect(seed).toContain("candidate.searchable===true");
    expect(seed).toContain("candidate.visibleOnCard===!!x.filterable");
    expect(seed).toContain("candidate.seoRelevant===!!x.filterable");
    expect(seed).toContain("candidate.options");
    expect(seed).toContain('new Set(["iron-ore-supply","copper-supply","coal-supply","dimension-stone-supply","sand-gravel-supply","cement-clinker-supply"])');
    expect(seed).toContain("mineralSupplySlugs.has(form.slug)");
    expect(seed).toContain("const resolvedKey=base && !isCompatible(base)");
    expect(seed).toContain("if(existing && !isCompatible(existing))");
    expect(seed).not.toContain('attributeDefinition.upsert({where:{key:x.key}');
  });

  it("validates typed listing attribute values and option ownership at the API boundary", () => {
    const route = read("src/app/api/listings/[id]/attributes/route.ts");
    expect(route).toContain("options: { select: { id: true } }");
    expect(route).toContain("optionIds.has(String(value.optionId))");
    expect(route).toContain("selectedOptions.some((optionId) => !optionIds.has(optionId))");
    expect(route).toContain("Number.isFinite(Number(value.numberValue))");
    expect(route).toContain("Number.isNaN(new Date(value.dateValue).getTime())");
    expect(route).toContain('v.booleanValue === true || v.booleanValue === "true"');
  });

  it("preflights supplemental taxonomy slug collisions before moving any existing category", () => {
    const seed = read("prisma/seed-service-and-mineral-taxonomy.ts");
    expect(seed).toContain("type PlannedCategory");
    expect(seed).toContain("new Set(slugs).size!==slugs.length");
    expect(seed).toContain("row.parentId!==expectedParent.id");
    expect(seed).toContain("row.layer!==item.layer");
    expect(seed).toContain("row.domain!==item.domain");
    expect(seed).toContain("no writes were made");
    const preflight = seed.indexOf("for(const item of plan)");
    const firstWrite = seed.indexOf('await insert(root.id,root.taxPath??"services"');
    expect(preflight).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(preflight);
  });

  it("preflights all category slugs before writing any domain attributes", () => {
    const seed = read("prisma/seed-service-mineral-attributes.ts");
    const preflight = seed.indexOf('if(missing.length)throw new Error("Missing category forms; no attributes were written:');
    const firstWrite = seed.indexOf('await linkFields(serviceRoot.id,commonService,"services")');
    expect(preflight).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(preflight);
  });
});
