import { getCategoryAttributeIds, getCategoryAttributeLinks } from "@/lib/category-attributes";

type AttributeValueInput = {
  attributeId?: unknown;
  textValue?: unknown;
  numberValue?: unknown;
  booleanValue?: unknown;
  dateValue?: unknown;
  optionId?: unknown;
  unit?: unknown;
};

type ValidationOptions = { enforceRequired?: boolean };

type ValidationResult = { ok: true } | { ok: false; error: string; details?: Record<string, unknown> };

/**
 * Validate the complete technical-attribute batch before a listing PATCH mutates
 * the listing, images, or attribute rows. Values are checked against both the
 * category's inherited definitions and the storage representation used by forms.
 */
export async function validateListingAttributeBatch(
  db: any,
  categoryId: string | null | undefined,
  incoming: unknown[],
  options: ValidationOptions = {},
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

  const numericTypes = new Set(["INTEGER", "DECIMAL", "NUMBER", "CURRENCY", "UNIT", "SIZE", "WEIGHT", "YEAR"]);
  const dateTypes = new Set(["DATE", "DATETIME"]);
  const textTypes = new Set(["TEXT", "LONG_TEXT", "REFERENCE", "LOCATION", "FILE", "IMAGE", "COLOR", "URL", "PHONE", "RANGE", "MULTI_SELECT"]);

  // Reject values sent through a storage column that does not match the
  // definition type. This keeps the API contract aligned with the form engine.
  for (const value of values) {
    const type = (definitionsById.get(String(value.attributeId)) as { type?: string } | undefined)?.type ?? "";
    const present = (candidate: unknown) => candidate !== undefined && candidate !== null && candidate !== "";
    const hasText = present(value.textValue);
    const hasNumber = present(value.numberValue);
    const hasBoolean = value.booleanValue !== undefined && value.booleanValue !== null;
    const hasDate = present(value.dateValue);
    const hasOption = present(value.optionId);

    if (numericTypes.has(type)) {
      if (hasText || hasBoolean || hasDate || hasOption) {
        return { ok: false, error: "Attribute values must match their definition type" };
      }
    } else if (dateTypes.has(type)) {
      if (hasText || hasNumber || hasBoolean || hasOption) {
        return { ok: false, error: "Attribute values must match their definition type" };
      }
    } else if (type === "BOOLEAN") {
      if (hasText || hasNumber || hasDate || hasOption) {
        return { ok: false, error: "Attribute values must match their definition type" };
      }
    } else if (type === "SELECT") {
      if (hasText || hasNumber || hasBoolean || hasDate) {
        return { ok: false, error: "Attribute values must match their definition type" };
      }
    } else if (type === "MULTI_SELECT" || type === "RANGE" || textTypes.has(type)) {
      if (hasNumber || hasBoolean || hasDate || hasOption) {
        return { ok: false, error: "Attribute values must match their definition type" };
      }
    } else {
      return { ok: false, error: "Unsupported attribute type" };
    }
  }
  const invalidNumbers = values.some((value) => {
    if (value.numberValue === undefined || value.numberValue === null || value.numberValue === "") return false;
    if (typeof value.numberValue !== "number" && typeof value.numberValue !== "string") return true;
    const definition = definitionsById.get(String(value.attributeId)) as { type?: string } | undefined;
    const type = definition?.type ?? "";
    const numeric = Number(value.numberValue);
    return !numericTypes.has(type) ||
      (typeof value.numberValue === "string" && value.numberValue.trim() === "") ||
      !Number.isFinite(numeric) ||
      ((type === "INTEGER" || type === "YEAR") && !Number.isInteger(numeric));
  });
  if (invalidNumbers) return { ok: false, error: "Numeric values must be finite and match a numeric attribute" };

  const invalidRanges = values.some((value) => {
    const definition = definitionsById.get(String(value.attributeId)) as { type?: string } | undefined;
    if (definition?.type !== "RANGE" || value.textValue === undefined || value.textValue === null || value.textValue === "") return false;
    if (typeof value.textValue !== "string") return true;
    const parts = value.textValue.split("|");
    if (parts.length !== 2) return true;
    const parsed = parts.map((part) => part.trim() === "" ? null : Number(part));
    if (parsed.every((part) => part === null)) return true;
    if (parsed.some((part) => part !== null && !Number.isFinite(part))) return true;
    return parsed[0] !== null && parsed[1] !== null && parsed[0] > parsed[1];
  });
  if (invalidRanges) return { ok: false, error: "Range values must contain valid minimum and maximum numbers" };

  const invalidDates = values.some((value) => {
    if (value.dateValue === undefined || value.dateValue === null || value.dateValue === "") return false;
    const definition = definitionsById.get(String(value.attributeId)) as { type?: string } | undefined;
    return !definition || !dateTypes.has(definition.type ?? "") ||
      typeof value.dateValue !== "string" ||
      Number.isNaN(new Date(value.dateValue).getTime());
  });
  if (invalidDates) return { ok: false, error: "Date values must be valid and match a date attribute" };

  const invalidBooleans = values.some((value) => {
    if (value.booleanValue === undefined || value.booleanValue === null) return false;
    const definition = definitionsById.get(String(value.attributeId)) as { type?: string } | undefined;
    return definition?.type !== "BOOLEAN" || typeof value.booleanValue !== "boolean";
  });
  if (invalidBooleans) return { ok: false, error: "Boolean values must be booleans and match a boolean attribute" };

  const invalidText = values.some((value) => {
    if (value.textValue === undefined || value.textValue === null) return false;
    return typeof value.textValue !== "string";
  });
  if (invalidText) return { ok: false, error: "Text values must be strings" };

  const optionRefs: Array<{ attributeId: string; optionId: string; expectedType: "SELECT" | "MULTI_SELECT" }> = [];
  for (const value of values) {
    const attributeId = String(value.attributeId);
    const type = (definitionsById.get(attributeId) as { type?: string } | undefined)?.type;
    if (value.optionId !== undefined && value.optionId !== null && value.optionId !== "") {
      if (type !== "SELECT" || typeof value.optionId !== "string") {
        return { ok: false, error: "One or more selected options do not belong to their attributes" };
      }
      optionRefs.push({ attributeId, optionId: value.optionId, expectedType: "SELECT" });
    }
    // MULTI_SELECT is stored in textValue as comma-separated option IDs by
    // buildAttributePayload; validate every ID before it reaches persistence.
    if (type === "MULTI_SELECT" && value.textValue !== undefined && value.textValue !== null && value.textValue !== "") {
      const selected = (value.textValue as string).split(",").map((id) => id.trim());
      if (selected.some((id) => !id) || new Set(selected).size !== selected.length) {
        return { ok: false, error: "Multi-select values must contain unique valid option IDs" };
      }
      for (const optionId of selected) optionRefs.push({ attributeId, optionId, expectedType: "MULTI_SELECT" });
    }
  }

  if (optionRefs.length) {
    const options = await db.attributeOption.findMany({
      where: { id: { in: optionRefs.map((option) => option.optionId) } },
      select: { id: true, attributeId: true },
    });
    const optionOwners = new Map(options.map((option: { id: string; attributeId: string }) => [option.id, option.attributeId]));
    const invalidOptions = optionRefs.some((option) =>
      (definitionsById.get(option.attributeId) as { type?: string } | undefined)?.type !== option.expectedType ||
      optionOwners.get(option.optionId) !== option.attributeId
    );
    if (invalidOptions) {
      return { ok: false, error: "One or more selected options do not belong to their attributes" };
    }
  }

  if (options.enforceRequired) {
    const links = await getCategoryAttributeLinks(db, categoryId);
    const supplied = new Map(values.map((value) => [String(value.attributeId), value]));
    const missingRequired = links
      .filter((link: any) => link.required)
      .filter((link: any) => {
        const value = supplied.get(link.attributeId);
        if (!value) return true;
        return ![
          value.textValue,
          value.numberValue,
          value.booleanValue,
          value.dateValue,
          value.optionId,
        ].some((candidate) => candidate !== undefined && candidate !== null && candidate !== "");
      })
      .map((link: any) => link.attributeId);
    if (missingRequired.length) {
      return {
        ok: false,
        error: "Required technical attributes are missing",
        details: { missingRequiredAttributeIds: missingRequired },
      };
    }
  }

  return { ok: true };
}
