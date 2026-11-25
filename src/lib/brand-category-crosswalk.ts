/**
 * Curated crosswalk from BrandIndustry (what a brand manufactures/supports)
 * to ApplicationIndustry (where the equipment is used).
 * Unknown source keys intentionally return no matches (fail closed).
 */
export const BRAND_TO_APPLICATION: Readonly<Record<string, readonly string[]>> = {
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
  FILTRATION: ["FACTORY", "TRANSPORT", "POWER", "AGRICULTURE", "MINING", "OIL_GAS"],
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

export function crosswalkBrandIndustry(industry: string): readonly string[] {
  return BRAND_TO_APPLICATION[industry] ?? [];
}

export type CategoryNode = { id: string; slug: string; layer: string; active: boolean; parentId: string | null };

/** Union industries from a category and its descendants, with cycle detection. */
export function computeCategoryIndustries(categories: CategoryNode[], direct: Map<string, Set<string>>) {
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
