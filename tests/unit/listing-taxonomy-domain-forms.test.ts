import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("HEAVIX listing taxonomy and domain-form contracts", () => {
  it("rejects parent categories and validates the free-text model at the listing API boundary", () => {
    const route = read("src/app/api/listings/route.ts");
    expect(route).toContain('children: { where: { active: true }, select: { id: true }, take: 1 }');
    expect(route).toContain("if (category.children.length > 0)");
    expect(route).toContain("فقط انتخاب آخرین زیرشاخه برای ثبت آگهی مجاز است");
    expect(route).toContain('const modelName = typeof body.modelName === "string" ? body.modelName.trim() : "";');
    expect(route).toContain("if (modelName.length > 120)");
    expect(route).toContain("modelName: modelName || null");
    expect(route).not.toContain("const modelCategoryMatches =");
  });

  it("composes inherited category attributes from root to selected leaf", () => {
    const route = read("src/app/api/categories/[id]/attributes/route.ts");
    expect(route).toContain("const ancestryLeafFirst: string[] = [selected.id]");
    expect(route).toContain("const categoryIds = ancestryLeafFirst.reverse()");
    expect(route).toContain("merged.set(key");
  });

  it("accepts canonical CATALOG categories for WANTED product requests while preserving legacy MARKETPLACE compatibility", () => {
    const route = read("src/app/api/wanted/route.ts");
    expect(route).toContain('intentStr === "SERVICE_REQUEST" ? ["SERVICE"] : ["CATALOG", "MARKETPLACE"]');
    expect(route).toContain("!allowedLayers.includes(categoryRow.layer)");
  });

  it("keeps service offers and requests in the SERVICE taxonomy layer", () => {
    const route = read("src/app/api/listings/route.ts");
    expect(route).toContain("categoryLayerForTransactionType(transactionType.key)");
    expect(route).toContain("const expectedLayer = categoryLayerForTransactionType(transactionType.key);");
    const wizard = read("src/app/listings/new/page.tsx");
    // Service demand and supply are independent top-level transaction
    // types; WANTED remains equipment demand and never carries service intent.
    expect(wizard).not.toContain("isWantedServiceRequest");
    expect(wizard).toContain("const isServiceFlow = isServiceRequest || isServiceOffer");
    expect(wizard).toContain("const categoryRoots = isServiceFlow ? serviceRoots : catalogRoots");
    const routing = read("src/lib/transaction-type-routing.ts");
    expect(routing).toContain('RENT: "CATALOG"');
    expect(routing).toContain('AUCTION: "CATALOG"');
    expect(routing).toContain('QUOTE: "CATALOG"');
    expect(routing).toContain('SERVICE_REQUEST: "SERVICE"');
    // Top-level service requests require a service type and validate their
    // request-specific quantity/budget/deadline fields before proceeding.
    expect(wizard).toContain("if (isServiceFlow) {");
    expect(wizard).toContain("if (!serviceTypeId) return false;");
    expect(wizard).toContain("if (isServiceRequest) {");
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

  it("keeps the public transaction-type endpoint active-only, deterministic, and uncached", () => {
    const route = read("src/app/api/transaction-types/route.ts");
    expect(route).toContain('where: { active: true }');
    expect(route).toContain('orderBy: [{ sortOrder: "asc" }, { nameFa: "asc" }]');
    expect(route).toContain('return NextResponse.json({ types });');
    expect(route).toContain('export const dynamic = "force-dynamic"');
    const picker = read("src/components/listings/TransactionTypePicker.tsx");
    const wizard = read("src/app/listings/new/page.tsx");
    expect(wizard).toContain('fetch("/api/transaction-types", { cache: "no-store" })');
    expect(wizard).toContain("setTransactionTypes(data.types ?? [])");
    expect(wizard).toContain("setTransactionTypesRetryKey((current) => current + 1)");
    expect(wizard).toContain("[transactionTypesRetryKey]");
    expect(picker).not.toContain("/api/transaction-types");
    expect(picker).toContain("types: TransactionTypeOption[]");
    expect(picker).toContain("onClick={onRetry}");
  });

});