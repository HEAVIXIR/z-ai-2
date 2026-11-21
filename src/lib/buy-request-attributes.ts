/**
 * HEAVIX — BuyRequest attribute validation (H.3)
 * ------------------------------------------------------------
 * Mirrors src/lib/listing-attributes.ts (validateListingAttributeValues)
 * but writes to the BuyRequest parent/child tables:
 *   - BuyRequestAttributeValue (parent: one row per request+attribute)
 *   - BuyRequestAttributeOption (child: one row per selected option for MULTI_SELECT)
 *
 * The parent/child split fixes the H.2-rev2 senior-manager audit finding:
 * the single-table + partial-index design was incompatible with
 * @@unique([buyRequestId, attributeId]) and ON DELETE SET NULL could
 * cause a uniqueness collision. Here, the parent holds the (request,
 * attribute) uniqueness; the child holds (attributeValue, option)
 * uniqueness. No partial indexes, no SET NULL collision.
 *
 * Validation enforces (fail-closed):
 *   - attributeId is required for each value
 *   - the attribute belongs to the request's categoryId (via CategoryAttribute,
 *     walking the category ancestry) OR modelId (via ProductModelAttribute)
 *   - the typed slot matches AttributeDefinition.type
 *   - SELECT optionId belongs to the attribute's options
 *   - MULTI_SELECT optionIds belong to the attribute's options
 */
import type { PrismaClient } from "@prisma/client";

export type NormalizedBuyRequestAttributeValue = {
  attributeId: string;
  textValue: string | null;
  numberValue: number | null;
  booleanValue: boolean | null;
  dateValue: Date | null;
  // For SELECT: the single chosen optionId. For MULTI_SELECT: null (selections
  // live in selectedOptionIds).
  optionId: string | null;
  // For MULTI_SELECT: the selected option ids (child rows).
  selectedOptionIds: string[];
  unit: string | null;
  sourceType: string;
  confidence: number | null;
  sourceReference: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
};

export type BuyRequestAttributeValidation =
  | { ok: true; values: NormalizedBuyRequestAttributeValue[] }
  | { ok: false; error: string };

/**
 * Validate + normalize a BuyRequest attribute payload.
 *
 * @param db        Prisma client
 * @param request   { categoryId?, modelId? } — the request's taxonomy context
 * @param incoming  raw attribute values from the API
 * @param isAdmin   when true, sourceType defaults to ADMIN_VERIFIED
 * @param enforceRequired  when true, enforce CategoryAttribute.required
 */
export async function validateBuyRequestAttributeValues(
  db: PrismaClient,
  request: { categoryId?: string | null; modelId?: string | null },
  incoming: unknown[],
  isAdmin = false,
  enforceRequired = false,
): Promise<BuyRequestAttributeValidation> {
  if (!Array.isArray(incoming)) {
    return { ok: false, error: "attributeValues باید یک آرایه باشد." };
  }
  const values = incoming as Array<Record<string, unknown>>;
  if (values.some((value) => !value || typeof value !== "object" || Array.isArray(value))) {
    return { ok: false, error: "هر ویژگی باید یک شیء معتبر باشد." };
  }
  if (values.length > 100) {
    return { ok: false, error: "تعداد ویژگی‌ها نمی‌تواند بیش از ۱۰۰ مورد باشد." };
  }

  const attrIds = Array.from(
    new Set(values.map((value) => String(value?.attributeId ?? "")).filter(Boolean)),
  );
  if (attrIds.length !== values.length) {
    return { ok: false, error: "attributeId برای هر ویژگی الزامی است." };
  }

  // ── Resolve allowed attributes from category ancestry + model links ──
  const allowedCategoryIds: string[] = [];
  let categoryCursor = request.categoryId ?? null;
  const seenCategories = new Set<string>();
  for (let depth = 0; categoryCursor && depth < 16; depth += 1) {
    if (seenCategories.has(categoryCursor)) break;
    seenCategories.add(categoryCursor);
    const category = await db.category.findUnique({
      where: { id: categoryCursor },
      select: { parentId: true, active: true },
    });
    // Inactive categories terminate the same ancestry used by the public
    // resolver; they cannot impose hidden required fields on a child.
    if (!category || category.active === false) break;
    allowedCategoryIds.push(categoryCursor);
    categoryCursor = category.parentId ?? null;
  }

  const [categoryLinks, modelLinks] = await Promise.all([
    allowedCategoryIds.length
      ? db.categoryAttribute.findMany({
          where: { categoryId: { in: allowedCategoryIds } },
          select: { categoryId: true, attributeId: true, active: true, required: true },
        })
      : Promise.resolve([]),
    request.modelId
      ? db.productModelAttribute.findMany({
          where: { modelId: request.modelId, categoryId: request.categoryId ?? "" },
          select: { attributeId: true, required: true },
        })
      : Promise.resolve([]),
  ]);

  // Nearest category policy wins. Inactive links are authoritative disables:
  // neither ancestor inheritance nor model-specific links may revive them.
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
  for (const link of modelLinks as Array<{ attributeId: string; required?: boolean }>) {
    const categoryPolicy = effectiveCategoryPolicy.get(link.attributeId);
    if (!categoryPolicy || categoryPolicy.active) allowedAttributeIds.add(link.attributeId);
  }

  // ── Required enforcement ──
  const requiredAttributeIds = new Set(
    [...effectiveCategoryPolicy.entries()]
      .filter(([, policy]) => policy.active && policy.required)
      .map(([attributeId]) => attributeId),
  );
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
        value.selectedOptionIds,
      ].some(
        (item) =>
          item !== undefined &&
          item !== null &&
          item !== "" &&
          !(Array.isArray(item) && item.length === 0),
      );
    });
    if (missingRequired.length > 0) {
      return { ok: false, error: "لطفاً تمام ویژگی‌های الزامی این دسته‌بندی را تکمیل کنید." };
    }
  }

  // ── Out-of-scope check ──
  const outOfScope = attrIds.filter((attributeId) => !allowedAttributeIds.has(attributeId));
  if (outOfScope.length > 0) {
    return { ok: false, error: "یکی از ویژگی‌ها به دسته‌بندی یا مدل این درخواست متصل نیست." };
  }

  // ── Fetch attribute definitions + options ──
  const attributes = await db.attributeDefinition.findMany({
    where: { id: { in: attrIds } },
    select: { id: true, type: true, unit: true, options: { select: { id: true } } },
  });
  const attributeMap = new Map(attributes.map((attribute) => [attribute.id, attribute]));
  const missing = attrIds.filter((attributeId) => !attributeMap.has(attributeId));
  if (missing.length > 0) {
    return { ok: false, error: "یکی از ویژگی‌های ارسال‌شده معتبر نیست." };
  }

  // ── Per-value type/slot validation ──
  const normalized: NormalizedBuyRequestAttributeValue[] = [];
  for (const value of values) {
    const attributeId = String(value.attributeId);
    const attribute = attributeMap.get(attributeId) as {
      id: string;
      type: string;
      unit: string | null;
      options: Array<{ id: string }>;
    };
    const optionIds = new Set(attribute.options.map((option) => option.id));

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

    // ── Resolve selectedOptionIds for MULTI_SELECT ──
    // The client may send either selectedOptionIds (array) OR a comma-separated
    // textValue (legacy compat). Normalize to the child-row form.
    let selectedOptionIds: string[] = [];
    if (attribute.type === "MULTI_SELECT") {
      if (Array.isArray(value.selectedOptionIds)) {
        selectedOptionIds = (value.selectedOptionIds as unknown[])
          .map((id) => String(id).trim())
          .filter(Boolean);
      } else if (value.textValue != null && value.textValue !== "") {
        // Legacy compatibility for older clients that encoded selected IDs
        // as comma-separated text. This is normalized to child option rows.
        selectedOptionIds = String(value.textValue)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (new Set(selectedOptionIds).size !== selectedOptionIds.length) {
        return { ok: false, error: "گزینهٔ تکراری در ویژگی چندانتخابی مجاز نیست." };
      }
      if (selectedOptionIds.some((oid) => !optionIds.has(oid))) {
        return { ok: false, error: "یکی از گزینه‌های چندانتخابی متعلق به این ویژگی نیست." };
      }
    }

    // SELECT: the single optionId must belong to the attribute.
    if (
      attribute.type === "SELECT" &&
      value.optionId != null &&
      value.optionId !== "" &&
      !optionIds.has(String(value.optionId))
    ) {
      return { ok: false, error: "گزینهٔ انتخاب‌شده متعلق به این ویژگی نیست." };
    }

    // MULTI_SELECT textValue is a legacy transport encoding only; once
    // normalized into selectedOptionIds it must not occupy the TEXT slot.
    const hasText = attribute.type !== "MULTI_SELECT" && value.textValue !== undefined && value.textValue !== null && value.textValue !== "";
    const hasNumber = numberValue !== null;
    const hasBoolean = value.booleanValue !== undefined && value.booleanValue !== null;
    const hasDate = dateValue !== null;
    const hasOption = value.optionId !== undefined && value.optionId !== null && value.optionId !== "";
    const hasMulti = selectedOptionIds.length > 0;
    const incompatible = (allowed: string[]) =>
      (hasText && !allowed.includes("text")) ||
      (hasNumber && !allowed.includes("number")) ||
      (hasBoolean && !allowed.includes("boolean")) ||
      (hasDate && !allowed.includes("date")) ||
      (hasOption && !allowed.includes("option")) ||
      (hasMulti && !allowed.includes("multi"));

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
        if (!hasMulti || incompatible(["multi"])) {
          return { ok: false, error: "لطفاً حداقل یک گزینه برای این ویژگی انتخاب کنید." };
        }
        break;
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
        // TEXT / LONG_TEXT / URL / PHONE / etc.
        if (!hasText || incompatible(["text"])) {
          return { ok: false, error: "مقدار متنی ویژگی با نوع آن سازگار نیست." };
        }
    }

    normalized.push({
      attributeId,
      textValue: hasText ? String(value.textValue) : null,
      numberValue,
      booleanValue:
        value.booleanValue === undefined || value.booleanValue === null
          ? null
          : value.booleanValue === true || value.booleanValue === "true",
      dateValue,
      optionId:
        attribute.type === "SELECT" && hasOption
          ? String(value.optionId)
          : null,
      selectedOptionIds,
      unit: attribute.unit,
      sourceType: isAdmin ? "ADMIN_VERIFIED" : "SELLER_INPUT",
      confidence: confidence === null ? null : Math.max(0, Math.min(1, confidence)),
      sourceReference:
        value.sourceReference === undefined || value.sourceReference === null
          ? null
          : String(value.sourceReference),
      verifiedAt: isAdmin ? new Date() : null,
      verifiedBy: isAdmin ? "admin" : null,
    });
  }

  return { ok: true, values: normalized };
}
