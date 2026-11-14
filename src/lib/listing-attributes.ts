export type NormalizedListingAttributeValue = {
  attributeId: string;
  textValue: string | null;
  numberValue: number | null;
  booleanValue: boolean | null;
  dateValue: Date | null;
  optionId: string | null;
  unit: string | null;
  sourceType: string;
  confidence: number | null;
  sourceReference: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
};

export type ListingAttributeValidation =
  | { ok: true; values: NormalizedListingAttributeValue[] }
  | { ok: false; error: string };

/**
 * Shared server-side validation for listing attribute writes.
 * Both listing creation and later seller/admin edits use the same taxonomy,
 * model-scope, option ownership, and typed-value checks.
 */
export async function validateListingAttributeValues(
  db: any,
  listing: { categoryId?: string | null; modelId?: string | null },
  incoming: unknown[],
  isAdmin = false,
): Promise<ListingAttributeValidation> {
  if (incoming.length === 0) return { ok: true, values: [] };

  const values = incoming as Array<Record<string, unknown>>;
  const attrIds = Array.from(
    new Set(values.map((value) => String(value?.attributeId ?? "")).filter(Boolean)),
  );
  if (attrIds.length !== values.length || attrIds.length === 0) {
    return { ok: false, error: "attributeId is required for each value" };
  }

  const allowedCategoryIds: string[] = [];
  let categoryCursor = listing.categoryId ?? null;
  const seenCategories = new Set<string>();
  for (let depth = 0; categoryCursor && depth < 16; depth += 1) {
    if (seenCategories.has(categoryCursor)) break;
    seenCategories.add(categoryCursor);
    allowedCategoryIds.push(categoryCursor);
    const parent = await db.category.findUnique({
      where: { id: categoryCursor },
      select: { parentId: true },
    });
    categoryCursor = parent?.parentId ?? null;
  }

  const [categoryLinks, modelLinks] = await Promise.all([
    allowedCategoryIds.length
      ? db.categoryAttribute.findMany({
          where: { categoryId: { in: allowedCategoryIds } },
          select: { attributeId: true },
        })
      : Promise.resolve([]),
    listing.modelId
      ? db.productModelAttribute.findMany({
          where: { modelId: listing.modelId, categoryId: listing.categoryId ?? "" },
          select: { attributeId: true },
        })
      : Promise.resolve([]),
  ]);
  const allowedAttributeIds = new Set([
    ...categoryLinks.map((link: { attributeId: string }) => link.attributeId),
    ...modelLinks.map((link: { attributeId: string }) => link.attributeId),
  ]);
  const outOfScope = attrIds.filter((attributeId) => !allowedAttributeIds.has(attributeId));
  if (outOfScope.length > 0) {
    return { ok: false, error: "یکی از ویژگی‌ها به دسته‌بندی یا مدل این آگهی متصل نیست." };
  }

  const attributes = await db.attributeDefinition.findMany({
    where: { id: { in: attrIds } },
    select: { id: true, type: true, options: { select: { id: true } } },
  });
  const attributeMap = new Map(attributes.map((attribute: any) => [attribute.id, attribute]));
  const missing = attrIds.filter((attributeId) => !attributeMap.has(attributeId));
  if (missing.length > 0) {
    return { ok: false, error: "یکی از ویژگی‌های ارسال‌شده معتبر نیست." };
  }

  const normalized: NormalizedListingAttributeValue[] = [];
  for (const value of values) {
    const attributeId = String(value.attributeId);
    const attribute = attributeMap.get(attributeId) as {
      id: string;
      type: string;
      options: Array<{ id: string }>;
    };
    const optionIds = new Set(attribute.options.map((option) => option.id));

    if (
      attribute.type === "SELECT" &&
      value.optionId != null &&
      value.optionId !== "" &&
      !optionIds.has(String(value.optionId))
    ) {
      return { ok: false, error: "گزینهٔ انتخاب‌شده متعلق به این ویژگی نیست." };
    }
    if (attribute.type === "MULTI_SELECT" && value.textValue != null && value.textValue !== "") {
      const selectedOptions = String(value.textValue).split(",").filter(Boolean);
      if (selectedOptions.some((optionId) => !optionIds.has(optionId))) {
        return { ok: false, error: "یکی از گزینه‌های چندانتخابی متعلق به این ویژگی نیست." };
      }
    }

    const numberValue =
      value.numberValue === undefined || value.numberValue === null || value.numberValue === ""
        ? null
        : Number(value.numberValue);
    if (numberValue !== null && !Number.isFinite(numberValue)) {
      return { ok: false, error: "مقدار عددی ویژگی معتبر نیست." };
    }

    const dateValue =
      value.dateValue === undefined || value.dateValue === null || value.dateValue === ""
        ? null
        : new Date(String(value.dateValue));
    if (dateValue && Number.isNaN(dateValue.getTime())) {
      return { ok: false, error: "تاریخ ویژگی معتبر نیست." };
    }

    const confidence =
      value.confidence === undefined || value.confidence === null
        ? null
        : Number(value.confidence);
    if (confidence !== null && !Number.isFinite(confidence)) {
      return { ok: false, error: "درجهٔ اطمینان ویژگی معتبر نیست." };
    }

    if (
      attribute.type === "BOOLEAN" &&
      value.booleanValue !== undefined &&
      value.booleanValue !== null &&
      ![true, false, "true", "false"].includes(value.booleanValue as boolean | string)
    ) {
      return { ok: false, error: "مقدار بله/خیر ویژگی معتبر نیست." };
    }

    normalized.push({
      attributeId,
      textValue: value.textValue === undefined || value.textValue === null ? null : String(value.textValue),
      numberValue,
      booleanValue:
        value.booleanValue === undefined || value.booleanValue === null
          ? null
          : value.booleanValue === true || value.booleanValue === "true",
      dateValue,
      optionId: value.optionId === undefined || value.optionId === null || value.optionId === "" ? null : String(value.optionId),
      unit: value.unit === undefined || value.unit === null || value.unit === "" ? null : String(value.unit),
      // Sellers cannot self-assert ADMIN_VERIFIED or AI provenance.
      sourceType: isAdmin
        ? value.sourceType === undefined || value.sourceType === null
          ? "ADMIN_VERIFIED"
          : String(value.sourceType)
        : "SELLER_INPUT",
      confidence: confidence === null ? null : Math.max(0, Math.min(1, confidence)),
      sourceReference: value.sourceReference === undefined || value.sourceReference === null ? null : String(value.sourceReference),
      verifiedAt: isAdmin ? new Date() : null,
      verifiedBy: isAdmin ? "admin" : null,
    });
  }

  return { ok: true, values: normalized };
}
