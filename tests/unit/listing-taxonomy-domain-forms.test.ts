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
    expect(route).toContain("const modelCategoryMatches =");
    expect(route).toContain("if (body.categoryId && !modelCategoryMatches)");
  });

  it("composes inherited category attributes from root to selected leaf", () => {
    const route = read("src/app/api/categories/[id]/attributes/route.ts");
    expect(route).toContain("const ancestryLeafFirst: string[] = [selected.id]");
    expect(route).toContain("const categoryIds = ancestryLeafFirst.reverse()");
    expect(route).toContain("merged.set(key");
  });

  it("keeps service offers and requests in the SERVICE taxonomy layer", () => {
    const route = read("src/app/api/listings/route.ts");
    expect(route).toContain("categoryLayerForTransactionType(transactionType.key)");
    expect(route).toContain("const expectedLayer = categoryLayerForTransactionType(transactionType.key);");
    const wizard = read("src/app/listings/new/page.tsx");
    // isServiceFlow must be intent-aware: a WANTED request with
    // intent=SERVICE_REQUEST uses SERVICE categories; asset purchase/rent
    // requests and supply listings use the CATALOG tree. Transaction intent
    // never forces the selected asset category into the MARKETPLACE layer.
    expect(wizard).toContain('const isWantedServiceRequest = transactionType === "WANTED" && wanted.intent === "SERVICE_REQUEST"');
    expect(wizard).toContain("const isServiceFlow = isServiceRequest || isServiceOffer || isWantedServiceRequest");
    expect(wizard).toContain("const categoryRoots = isServiceFlow ? serviceRoots : catalogRoots");
    const routing = read("src/lib/transaction-type-routing.ts");
    expect(routing).toContain('RENT: "CATALOG"');
    expect(routing).toContain('AUCTION: "CATALOG"');
    expect(routing).toContain('QUOTE: "CATALOG"');
    expect(routing).toContain('SERVICE_REQUEST: "SERVICE"');
    // H.2.3 (P1 fix): the isServiceFlow branch must NOT short-circuit past
    // the WANTED quantity/budget/deadline checks when intent=SERVICE_REQUEST.
    // Previously it returned Boolean(serviceTypeId) and skipped the WANTED
    // validation block entirely. The branch now requires serviceTypeId AND,
    // for WANTED+SERVICE_REQUEST, runs the quantity/budget/deadline checks.
    expect(wizard).toContain("if (isServiceFlow) {");
    expect(wizard).toContain("if (!serviceTypeId) return false;");
    expect(wizard).toContain("if (isWantedServiceRequest || isServiceRequest) {");
    expect(wizard).toContain('if (transactionType === "QUOTE")');
    expect(wizard).toContain("if (isRequestFlow) return true");
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
    const validator = read("src/lib/listing-attributes.ts");
    expect(route).toContain("validateListingAttributeValues");
    expect(validator).toContain("options: { select: { id: true } }");
    expect(validator).toContain("optionIds.has(String(value.optionId))");
    expect(validator).toContain("selectedOptions.some((optionId) => !optionIds.has(optionId))");
    expect(validator).toContain("Number.isFinite(numberValue)");
    expect(validator).toContain("Number.isNaN(dateValue.getTime())");
    expect(validator).toContain('value.booleanValue === true || value.booleanValue === "true"');
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

  it("refuses machine taxonomy slug collisions owned by other canonical parents", () => {
    const seed = read("prisma/seed-machine-taxonomy.ts");
    expect(seed).toContain("externalSlugCollisions");
    expect(seed).toContain("another parent taxonomy");
    const preflight = seed.indexOf("const externalSlugCollisions = await db.category.findMany");
    const firstWrite = seed.indexOf("await db.category.update({");
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
