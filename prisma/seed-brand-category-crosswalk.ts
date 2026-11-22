/**
 * HEAVIX brand -> catalog category crosswalk.
 *
 * Default is DRY-RUN (read-only). Apply only when:
 *   HEAVIX_ENV=preview BRAND_CATEGORY_MAPPING_APPLY=1
 * Never delete existing BrandCategory links.
 *
 * Maps BrandIndustry (manufacturer/product specialization) to
 * ApplicationIndustry (category use context), then connects brands only to
 * active CATALOG categories whose application industries intersect.
 * Ancestor categories inherit descendant industries so selecting a parent
 * category can return relevant brands. No generic marketplace/service roots.
 */
import { PrismaClient } from "@prisma/client";
import { crosswalkBrandIndustry, computeCategoryIndustries } from "../src/lib/brand-category-crosswalk";

const db = new PrismaClient();

async function main() {
  const preview = process.env.HEAVIX_ENV === "preview";
  const apply = process.env.BRAND_CATEGORY_MAPPING_APPLY === "1";
  if (apply && !preview) throw new Error("Apply is allowed only when HEAVIX_ENV=preview.");
  if (apply && process.env.BRAND_CATEGORY_MAPPING_CONFIRM !== "YES" ) {
    throw new Error("Set BRAND_CATEGORY_MAPPING_CONFIRM=YES to confirm Preview-only writes.");
  }

  const [categories, brandIndustries, existing] = await Promise.all([
    db.category.findMany({ where: { active: true, layer: "CATALOG" }, select: { id: true, slug: true, layer: true, active: true, parentId: true } }),
    db.brandIndustry.findMany({ select: { brandId: true, industry: true } }),
    db.brandCategory.findMany({ select: { brandId: true, categoryId: true } }),
  ]);
  const direct = new Map<string, Set<string>>();
  const categoryAppLinks = await db.categoryApplicationIndustry.findMany({
    where: { categoryId: { in: categories.map(c => c.id) } },
    select: { categoryId: true, applicationIndustry: { select: { key: true } } },
  });
  for (const relation of categoryAppLinks) {
    const set = direct.get(relation.categoryId) ?? new Set<string>();
    set.add(relation.applicationIndustry.key);
    direct.set(relation.categoryId, set);
  }
  const effective = computeCategoryIndustries(categories, direct);
  const brandsByIndustry = new Map<string, Set<string>>();
  for (const relation of brandIndustries) {
    for (const key of crosswalkBrandIndustry(relation.industry)) {
      const set = brandsByIndustry.get(key) ?? new Set<string>();
      set.add(relation.brandId);
      brandsByIndustry.set(key, set);
    }
  }
  const existingSet = new Set(existing.map(x => x.brandId + "|" + x.categoryId));
  const proposed = new Set<string>();
  const unmapped = new Set<string>();
  for (const relation of brandIndustries) {
    const keys = crosswalkBrandIndustry(relation.industry);
    if (!keys.length) unmapped.add(relation.industry);
  }
  for (const category of categories) {
    const keys = effective.get(category.id) ?? new Set<string>();
    const candidateBrands = new Set<string>();
    for (const key of keys) for (const id of brandsByIndustry.get(key) ?? []) candidateBrands.add(id);
    for (const brandId of candidateBrands) {
      const pair = brandId + "|" + category.id;
      if (!existingSet.has(pair)) proposed.add(pair);
    }
  }
  const grouped = new Map<string, number>();
  const slugById = new Map(categories.map(c => [c.id, c.slug]));
  for (const pair of proposed) {
    const categoryId = pair.split("|")[1];
    const slug = slugById.get(categoryId) ?? "unknown";
    grouped.set(slug, (grouped.get(slug) ?? 0) + 1);
  }
  const sample = [...proposed].slice(0, 30).map(pair => {
    const [brandId, categoryId] = pair.split("|");
    return { brandId, categorySlug: slugById.get(categoryId) };
  });
  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "DRY_RUN",
    previewGuard: preview,
    brandsWithIndustry: new Set(brandIndustries.map(x => x.brandId)).size,
    activeCatalogCategories: categories.length,
    existingBrandCategoryLinks: existingSet.size,
    proposedNewLinks: proposed.size,
    unmappedIndustryKeys: [...unmapped].sort(),
    linksByCategorySlug: Object.fromEntries([...grouped].sort((a,b)=>a[0].localeCompare(b[0]))),
    sample,
  }, null, 2));
  if (apply && proposed.size) {
    const rows: Pair[] = [...proposed].map(pair => {
      const [brandId, categoryId] = pair.split("|");
      return { brandId, categoryId };
    });
    const result = await db.brandCategory.createMany({ data: rows, skipDuplicates: true });
    console.log("Inserted BrandCategory links:", result.count);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
