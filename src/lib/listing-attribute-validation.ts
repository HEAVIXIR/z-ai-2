import { getCategoryAttributeIds } from "@/lib/category-attributes";

type AttributeValueInput = {
  attributeId?: unknown;
  numberValue?: unknown;
  dateValue?: unknown;
  optionId?: unknown;
};

type ValidationResult = { ok: true } | { ok: false; error: string; details?: Record<string, unknown> };

/**
 * Validate the complete technical-attribute batch before a listing PATCH mutates
 * the listing, images, or attribute rows. The dedicated PUT endpoint applies the
 * same invariants; this protects the legacy combined PATCH endpoints used by forms.
 */
export async function validateListingAttributeBatch(
  db: any,
  categoryId: string | null | undefined,
  incoming: unknown[],
): Promise<ValidationResult> {
  if (!Array.isArray(incoming)) return { ok: false, error: "attributeValues must be an array" };
  if (incoming.some((value) => !value || typeof value !== "object" || Array.isArray(value) ||
    typeof (value as AttributeValueInput).attributeId !== "string" ||
    !((value as AttributeValueInput).attributeId as string).trim())) {
    return { ok: false, error: "attributeId is required for each value" };
  }

  const values = incoming as AttributeValueInput[];
  const ids = values.map((value) => String(value.attributeId));
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Duplicate attributeIds are not allowed" };
  }
  if (!categoryId) return { ok: false, error: "Attributes require a category" };

  const allowedIds = await getCategoryAttributeIds(db, categoryId);
  const invalidIds = ids.filter((id) => !allowedIds.has(id));
  if (invalidIds.length) {
    return {
      ok: false,
      error: "One or more attributes do not belong to the selected category",
      details: { invalidAttributeIds: invalidIds },
    };
  }

  const definitions = await db.attributeDefinition.findMany({
    where: { id: { in: ids } },
    select: { id: true, type: true },
  });
  const definitionsById = new Map(definitions.map((definition: { id: string; type: string }) => [definition.id, definition]));
  const missingIds = ids.filter((id) => !definitionsById.has(id));
  if (missingIds.length) {
    return { ok: false, error: "One or more attribute definitions do not exist", details: { invalidAttributeIds: missingIds } };
  }

  const invalidNumbers = values.some((value) =>
    value.numberValue !== undefined && value.numberValue !== null && value.numberValue !== "" &&
    !Number.isFinite(Number(value.numberValue))
  );
  if (invalidNumbers) return { ok: false, error: "Numeric attribute values must be finite numbers" };

  const invalidDates = values.some((value) =>
    value.dateValue !== undefined && value.dateValue !== null && value.dateValue !== "" &&
    Number.isNaN(new Date(value.dateValue as string | number | Date).getTime())
  );
  if (invalidDates) return { ok: false, error: "Date attribute values must be valid dates" };

  const optionRefs = values
    .filter((value) => value.optionId !== undefined && value.optionId !== null && value.optionId !== "")
    .map((value) => ({ attributeId: String(value.attributeId), optionId: String(value.optionId) }));
  if (optionRefs.length) {
    const options = await db.attributeOption.findMany({
      where: { id: { in: optionRefs.map((option) => option.optionId) } },
      select: { id: true, attributeId: true },
    });
    const optionOwners = new Map(options.map((option: { id: string; attributeId: string }) => [option.id, option.attributeId]));
    const invalidOptions = optionRefs.some((option) =>
      (definitionsById.get(option.attributeId) as { type?: string } | undefined)?.type !== "SELECT" ||
      optionOwners.get(option.optionId) !== option.attributeId
    );
    if (invalidOptions) {
      return { ok: false, error: "One or more selected options do not belong to their attributes" };
    }
  }

  return { ok: true };
}
