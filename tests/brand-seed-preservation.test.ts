import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PHASE_A_SEED = readFileSync("prisma/seed-brands-a.ts", "utf-8");
const PHASE_B_SEED = readFileSync("prisma/seed-brands-b.ts", "utf-8");

describe("Phase B brand seed preservation", () => {
  it("makes identity refresh an explicit opt-in", () => {
    expect(PHASE_B_SEED).toContain("refreshIdentity?: boolean;");
    expect(PHASE_B_SEED).toContain("update: b.refreshIdentity ? {");
    expect(PHASE_B_SEED).toContain("} : {},");
  });

  it("preserves existing brand identity by default", () => {
    expect(PHASE_B_SEED).toContain(
      "Phase B is additive for existing brands: preserve curated identity",
    );
    expect(PHASE_B_SEED).toContain(
      "featured state, family, parent, website, and verification by default",
    );
  });

  it("opts in only the documented Iveco legacy-name correction", () => {
    expect(PHASE_B_SEED).toContain(
      'name: "ایوکو", nameEn: "Iveco", country: "Italy", refreshIdentity: true,',
    );
  });

  it("continues adding industry links without replacing existing links", () => {
    expect(PHASE_B_SEED).toContain(
      "where: { brandId_industry: { brandId: brand.id, industry: ind } }",
    );
    expect(PHASE_B_SEED).toContain("update: {},");
  });
});


describe("Phase A brand seed preservation", () => {
  it("makes identity refresh an explicit opt-in", () => {
    expect(PHASE_A_SEED).toContain("refreshIdentity?: boolean;");
    expect(PHASE_A_SEED).toContain("update: b.refreshIdentity ? {");
    expect(PHASE_A_SEED).toContain("} : {},");
  });
  it("preserves existing industries and brand families by default", () => {
    expect(PHASE_A_SEED).toContain('db.industry.upsert({ where: { key: ind.key }, create: ind, update: {} });');
    expect(PHASE_A_SEED).toContain('db.brandFamily.upsert({ where: { slug: f.slug }, create: f, update: {} });');
  });
});


describe("Taxonomy seed preservation", () => {
  const V11 = readFileSync("prisma/seed-taxonomy-v11.ts", "utf-8");
  const SERVICE_MINERAL = readFileSync("prisma/seed-service-and-mineral-taxonomy.ts", "utf-8");

  it("preserves existing category labels, icon, order and featured state in V1.1", () => {
    expect(V11).toContain("Preserve curated labels, icon, ordering and featured state.");
    expect(V11).toContain("update: {\n      layer: c.layer,");
    expect(V11).not.toContain("featured: c.featured ?? false,\n    },\n  });");
  });

  it("preserves existing transaction, service, industry and location metadata", () => {
    expect(V11).toContain("where: { key: t.key },\n      create: t,\n      update: {},");
    expect(V11).toContain("where: { key: s.key },\n      create: s,\n      update: {},");
    expect(V11).toContain("where: { key: i.key },\n      create: i,\n      update: {},");
  });

  it("preserves service/mineral category labels while applying hierarchy links", () => {
    expect(SERVICE_MINERAL).toContain("Preserve curated labels and ordering; refresh only hierarchy identity.");
    expect(SERVICE_MINERAL).toContain("update:{parentId,level,layer,domain,taxPath}");
    expect(SERVICE_MINERAL).toContain("row.level!==item.level||row.taxPath!==item.taxPath");
    expect(SERVICE_MINERAL).toContain('update:{}});');
  });

  it("preflights V1.1 hierarchy collisions before the first write", () => {
    expect(V11).toContain("async function preflightTaxonomyHierarchy()");
    expect(V11).toContain("const LEGACY_ROOT_REPARENT_SLUGS = [");
    expect(V11).toContain("Category hierarchy collision");
    expect(V11).toContain("Category layer/domain collision");
    expect(V11).toContain("isLegacyRootAwaitingReviewedReparent");
    expect(V11).toContain("await preflightTaxonomyHierarchy();");
    expect(V11.indexOf("await preflightTaxonomyHierarchy();")).toBeLessThan(
      V11.indexOf("db.transactionType.upsert("),
    );
  });
});


describe("Catalog and attribute seed preservation", () => {
  const CATALOG = readFileSync("prisma/seed-catalog.ts", "utf-8");
  const CATEGORY_ATTRIBUTES = readFileSync("prisma/seed-category-specific-attributes.ts", "utf-8");

  it("preserves existing compatibility edge evidence", () => {
    expect(CATALOG).toContain("Preserve reviewed/administrator-managed edge evidence on reruns.");
    expect(CATALOG).toContain("update: {},");
  });

  it("preserves existing attachment and part metadata", () => {
    expect(CATALOG).toContain("Existing attachment metadata may be administrator-curated; preserve it.");
    expect(CATALOG).toContain("Existing part metadata may be administrator-curated; preserve it.");
  });

  it("checks existing namespaced attribute definitions before the first write", () => {
    expect(CATEGORY_ATTRIBUTES).toContain("Validate pre-existing namespaced keys too, before any seed write.");
    expect(CATEGORY_ATTRIBUTES).toContain("Existing namespaced AttributeDefinition");
    expect(CATEGORY_ATTRIBUTES).toContain("if (!attribute.key) continue;");
    expect(CATEGORY_ATTRIBUTES).toContain("seed aborted before writes");
  });
});
