/**
 * Resolve category-level attribute configuration through the category tree.
 *
 * A child category inherits its ancestors' attributes. When the same
 * AttributeDefinition is linked at multiple levels, the closest category
 * wins so child-level required/filter/display settings can override parents.
 */
async function getCategoryChainIds(db: any, categoryId: string): Promise<string[]> {
  const chain: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = categoryId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const category = await db.category.findUnique({
      where: { id: currentId },
      select: { id: true, parentId: true },
    });
    if (!category) break;
    chain.push(category.id);
    currentId = category.parentId ?? null;
  }

  return chain;
}

export async function getCategoryAttributeLinks(db: any, categoryId: string) {
  const chain = await getCategoryChainIds(db, categoryId);
  if (!chain.length) return [];

  const rank = new Map<string, number>();
  chain.forEach((id, index) => rank.set(id, index));
  const rows = await db.categoryAttribute.findMany({
    where: { categoryId: { in: chain } },
    include: {
      attribute: {
        include: {
          options: { orderBy: [{ sortOrder: "asc" }, { value: "asc" }] },
        },
      },
    },
  });

  rows.sort((a: any, b: any) =>
    (rank.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER) ||
    a.displayOrder - b.displayOrder ||
    (a.attribute.sortOrder ?? 0) - (b.attribute.sortOrder ?? 0) ||
    String(a.attribute.name).localeCompare(String(b.attribute.name), "fa")
  );

  const nearestByAttribute = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!nearestByAttribute.has(row.attributeId)) {
      nearestByAttribute.set(row.attributeId, row);
    }
  }

  return [...nearestByAttribute.values()].sort((a: any, b: any) =>
    a.displayOrder - b.displayOrder ||
    (a.attribute.sortOrder ?? 0) - (b.attribute.sortOrder ?? 0) ||
    String(a.attribute.name).localeCompare(String(b.attribute.name), "fa")
  );
}

export async function getCategoryAttributeIds(db: any, categoryId: string): Promise<Set<string>> {
  const chain = await getCategoryChainIds(db, categoryId);
  if (!chain.length) return new Set<string>();

  const links = await db.categoryAttribute.findMany({
    where: { categoryId: { in: chain } },
    select: { attributeId: true },
  });
  return new Set<string>(links.map((link: { attributeId: string }) => link.attributeId));
}
