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

const db = new PrismaClient();

const BRAND_TO_APPLICATION: Record<string, string[]> = {
  AGRICULTURE: ["AGRICULTURE"],
  AUTOMATION: ["FACTORY", "POWER"],
  BATTERIES: ["POWER", "FACTORY", "TRANSPORT"],
  BEARINGS: ["FACTORY", "TRANSPORT", "POWER"],
  COMPRESSORS: ["FACTORY", "OIL_GAS", "POWER"],
  CONCRETE_ASPHALT: ["CONSTRUCTION", "CIVIL", "ROAD_CONSTRUCTION"],
  CONSTRUCTION_MACHINERY: ["CONSTRUCTION", "CIVIL", "ROAD_CONSTRUCTION"],
  DRILLING: ["MINING", "OIL_GAS", "CIVIL"],
  ELECTRICAL: ["POWER", "FACTORY", "CONSTRUCTION"],
  ENGINES: ["TRANSPORT", "POWER", "FACTORY", "AGRICULTURE", "MINING"],
  FILTERS: ["FACTORY", "TRANSPORT", "POWER", "AGRICULTURE", "MINING", "OIL_GAS"],
  FORESTRY: ["FORESTRY"],
  GENERATORS: ["POWER", "FACTORY", "CONSTRUCTION", "MINING", "AGRICULTURE"],
  HYDRAULICS: ["FACTORY", "CONSTRUCTION", "MINING", "ROAD_CONSTRUCTION", "AGRICULTURE"],
  INDUSTRIAL_EQUIPMENT: ["FACTORY", "POWER", "STEEL", "CEMENT", "PETROCHEMICAL"],
  INDUSTRIAL_VEHICLES: ["FACTORY", "TRANSPORT", "MINING", "CONSTRUCTION"],
  LIFTING: ["CONSTRUCTION", "CIVIL", "FACTORY", "PORT_MARINE"],
  LUBRICANTS: ["FACTORY", "TRANSPORT", "MINING", "POWER", "AGRICULTURE", "OIL_GAS"],
  MARINE: ["PORT_MARINE"],
  MATERIAL_HANDLING: ["FACTORY", "TRANSPORT", "CONSTRUCTION", "PORT_MARINE"],
  MINING_MACHINERY: ["MINING"],
  OIL_GAS: ["OIL_GAS", "PETROCHEMICAL"],
  PASSENGER_VEHICLES: ["TRANSPORT"],
  PNEUMATICS: ["FACTORY", "CONSTRUCTION", "POWER"],
  PUMPS: ["FACTORY", "CONSTRUCTION", "AGRICULTURE", "MINING", "OIL_GAS", "POWER"],
  QUARRY_CRUSHING: ["MINING", "CEMENT", "CIVIL"],
  RAILWAY: ["TRANSPORT", "FACTORY"],
  ROAD_MACHINERY: ["ROAD_CONSTRUCTION", "CIVIL", "CONSTRUCTION"],
  SPARE_PARTS: ["FACTORY", "TRANSPORT", "CONSTRUCTION", "MINING", "AGRICULTURE", "POWER", "OIL_GAS"],
  STEEL_FACTORY: ["STEEL", "FACTORY", "CONSTRUCTION"],
  TIRES: ["TRANSPORT", "CONSTRUCTION", "MINING", "AGRICULTURE"],
  TOOLS: ["FACTORY", "CONSTRUCTION", "CIVIL", "AGRICULTURE"],
  TRAILERS: ["TRANSPORT", "CONSTRUCTION", "AGRICULTURE"],
  TRUCKS: ["TRANSPORT", "CONSTRUCTION", "MINING", "AGRICULTURE"],
  WASTE_RECYCLING: ["RECYCLING", "FACTORY", "CIVIL"],
  ATTACHMENTS: ["CONSTRUCTION", "MINING", "ROAD_CONSTRUCTION", "AGRICULTURE", "FORESTRY"],
};

type CategoryNode = { id: string; slug: string; layer: string; active: boolean; parentId: string | null };
type Pair = { brandId: string; categoryId: string };

function crosswalkBrandIndustry(industry: string): string[] {
  return BRAND_TO_APPLICATION[industry] ?? [];
}

function computeCategoryIndustries(categories: CategoryNode[], direct: Map<string, Set<string>>) {
  const children = new Map<string, CategoryNode[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const list = children.get(category.parentId) ?? [];
    list.push(category);
    children.set(category.parentId, list);
  }
  const cache = new Map<string, Set<string>>();
  const visiting = new Set<string>();
  const walk = (id: string): Set<string> => {
    if (cache.has(id)) return cache.get(id)!;
    if (visiting.has(id)) throw new Error("Category tree cycle detected at " + id);
    visiting.add(id);
    const result = new Set(direct.get(id) ?? []);
    for (const child of children.get(id) ?? []) {
      for (const key of walk(child.id)) result.add(key);
    }
    visiting.delete(id);
    cache.set(id, result);
    return result;
  };
  for (const category of categories) walk(category.id);
  return cache;
}

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
  const appIndustryIds = await db.applicationIndustry.findMany({ select: { id: true, key: true } });
  const appIdByKey = new Map(appIndustryIds.map(x => [x.key, x.id]));
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
    linksByCategorySlug: Object.fromEntries([...grouped].sort((a,b)=>a[0].localeCompare(b[0])) ,
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
