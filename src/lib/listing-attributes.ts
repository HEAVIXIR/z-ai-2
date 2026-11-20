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
  enforceRequired = false,
): Promise<ListingAttributeValidation> {

  const values = incoming as Array<Record<string, unknown>>;
  const attrIds = Array.from(
    new Set(values.map((value) => String(value?.attributeId ?? "")).filter(Boolean)),
  );
  if (attrIds.length !== values.length) {
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
          select: { categoryId: true, attributeId: true, required: true, active: true },
        })
      : Promise.resolve([]),
    listing.modelId
      ? db.productModelAttribute.findMany({
          where: { modelId: listing.modelId, categoryId: listing.categoryId ?? "" },
          select: { attributeId: true, required: true },
        })
      : Promise.resolve([]),
  ]);
  // Category links form an explicit per-category policy. The nearest
  // category link overrides both active and required flags from ancestors.
  const categoryDepth = new Map(allowedCategoryIds.map((id, index) => [id, index]));
  const effectiveCategoryPolicy = new Map<string, { active: boolean; required: boolean }>();
  const orderedCategoryLinks = [...categoryLinks].sort(
    (a: { categoryId: string }, b: { categoryId: string }) =>
      (categoryDepth.get(b.categoryId) ?? 0) - (categoryDepth.get(a.categoryId) ?? 0),
  );
  for (const link of orderedCategoryLinks as Array<{
    categoryId: string;
    attributeId: string;
    active?: boolean;
    required?: boolean;
  }>) {
    effectiveCategoryPolicy.set(link.attributeId, {
      active: link.active !== false,
      required: Boolean(link.required),
    });
  }

  const allowedAttributeIds = new Set<string>();
  for (const [attributeId, policy] of effectiveCategoryPolicy) {
    if (policy.active) allowedAttributeIds.add(attributeId);
  }
  // Model-level links can add model-specific attributes, but cannot revive
  // a field explicitly disabled by the selected category or an ancestor.
  for (const link of modelLinks as Array<{ attributeId: string; required?: boolean }>) {
    const categoryPolicy = effectiveCategoryPolicy.get(link.attributeId);
    if (!categoryPolicy || categoryPolicy.active) allowedAttributeIds.add(link.attributeId);
  }

  const requiredAttributeIds = new Set(
    [...effectiveCategoryPolicy.entries()]
      .filter(([, policy]) => policy.active && policy.required)
      .map(([attributeId]) => attributeId),
  );
  // Model-level required flags override category defaults only for fields
  // that remain active and in scope.
  for (const link of modelLinks as Array<{ attributeId: string; required?: boolean }>) {
    if (!allowedAttributeIds.has(link.attributeId)) continue;
    if (link.required) requiredAttributeIds.add(link.attributeId);
    else requiredAttributeIds.delete(link.attributeId);
  }

  if (enforceRequired) {
    const supplied = new Map(values.map((value) => [String(value.attributeId ?? ""), value]));
    const missingRequired = [...requiredAttributeIds].filter((attributeId) => {
      const value = supplied.get(attributeId);
      if (!value) return true;
      return ![
        value.textValue,
        value.numberValue,
        value.booleanValue,
        value.dateValue,
        value.optionId,
      ].some((item) => item !== undefined && item !== null && item !== "");
    });
    if (missingRequired.length > 0) {
      const definitions = await db.attributeDefinition.findMany({
        where: { id: { in: missingRequired } },
        select: { id: true, name: true, labelFa: true },
      });
      const labels = new Map(definitions.map((item: any) => [item.id, item.labelFa ?? item.name]));
      const missingLabels = missingRequired.map((id) => labels.get(id) ?? id);
      return {
        ok: false,
        error: `لطفاً این مشخصات الزامی را تکمیل کنید: ${missingLabels.join("، ")}`,
      };
    }
  }

  if (incoming.length === 0) return { ok: true, values: [] };
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

    const hasText = value.textValue !== undefined && value.textValue !== null && value.textValue !== "";
    const hasNumber = numberValue !== null;
    const hasBoolean = value.booleanValue !== undefined && value.booleanValue !== null;
    const hasDate = dateValue !== null;
    const hasOption = value.optionId !== undefined && value.optionId !== null && value.optionId !== "";
    const incompatible = (allowed: string[]) =>
      (hasText && !allowed.includes("text")) ||
      (hasNumber && !allowed.includes("number")) ||
      (hasBoolean && !allowed.includes("boolean")) ||
      (hasDate && !allowed.includes("date")) ||
      (hasOption && !allowed.includes("option"));

    switch (attribute.type) {
      case "BOOLEAN":
        if (!hasBoolean || incompatible(["boolean"])) {
          return { ok: false, error: "مقدار بله/خیر ویژگی با نوع آن سازگار نیست." };
        }
        break;
      case "SELECT":
        if (!hasOption || incompatible(["option"])) {
          return { ok: false, error: "لطفاً یک گزینهٔ معتبر برای این ویژگی انتخاب کنید." };
        }
        break;
      case "MULTI_SELECT":
        if (!hasText || incompatible(["text"])) {
          return { ok: false, error: "مقدار متنی ویژگی با نوع آن سازگار نیست." };
        }
        break;
      case "RANGE": {
        if (!hasText || incompatible(["text"])) {
          return { ok: false, error: "مقدار بازه‌ای ویژگی با نوع آن سازگار نیست." };
        }
        const rangeParts = String(value.textValue).split("|");
        if (rangeParts.length !== 2) {
          return { ok: false, error: "بازهٔ واردشده معتبر نیست؛ حداقل یا حداکثر را بررسی کنید." };
        }
        const [minRaw, maxRaw] = rangeParts.map((part) => part.trim());
        const min = minRaw === "" ? null : Number(minRaw);
        const max = maxRaw === "" ? null : Number(maxRaw);
        if (
          (minRaw !== "" && !Number.isFinite(min)) ||
          (maxRaw !== "" && !Number.isFinite(max)) ||
          (min === null && max === null) ||
          (min !== null && max !== null && min > max)
        ) {
          return { ok: false, error: "حداقل و حداکثر بازه معتبر نیستند؛ مقادیر عددی و ترتیب آن‌ها را بررسی کنید." };
        }
        break;
      }
      case "DATE":
      case "DATETIME":
        if (!hasDate || incompatible(["date"])) {
          return { ok: false, error: "مقدار تاریخ ویژگی با نوع آن سازگار نیست." };
        }
        break;
      case "INTEGER":
      case "YEAR":
        if (!hasNumber || !Number.isInteger(numberValue) || incompatible(["number"])) {
          return { ok: false, error: "مقدار این ویژگی باید عدد صحیح باشد." };
        }
        break;
      case "DECIMAL":
      case "NUMBER":
      case "CURRENCY":
      case "UNIT":
      case "SIZE":
      case "WEIGHT":
        if (!hasNumber || incompatible(["number"])) {
          return { ok: false, error: "مقدار عددی ویژگی با نوع آن سازگار نیست." };
        }
        break;
      default:
        if (!hasText || incompatible(["text"])) {
          return { ok: false, error: "مقدار متنی ویژگی با نوع آن سازگار نیست." };
        }
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
