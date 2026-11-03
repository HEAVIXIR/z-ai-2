import { z } from "zod";

/* ============================================================
   AI Gateway Output Validation — Fail-Closed Schemas
   ------------------------------------------------------------
   Issue #179: LLM outputs must be validated before use.
   No fallback defaults that could silently approve content.
   ============================================================ */

// Strict schemas — no .passthrough(). Unknown fields are rejected.
export const listingBuilderSchema = z.object({
  title: z.string().min(1).max(200),
  brand: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  hours: z.number().min(0).max(100000).optional(),
  condition: z.string().max(50).optional(),
  price: z.number().min(0).optional(),
  description: z.string().max(5000).optional(),
}).strict();

export const moderationSchema = z.object({
  appropriate: z.boolean(),
  reason: z.string().max(500).optional(),
}).strict();

/**
 * Deterministic JSON extraction from LLM output.
 *
 * Instead of a greedy regex that may capture multiple JSON objects or
 * trailing text, this function:
 * 1. Strips markdown code fences (```json ... ```).
 * 2. Finds the FIRST balanced JSON object using brace counting.
 * 3. Rejects if there is leftover JSON content after the first object.
 * 4. Parses with JSON.parse.
 * 5. Validates against the Zod schema.
 *
 * Fail-closed: any extraction or validation failure returns an error.
 * The error message does NOT expose internal system details to the caller.
 */
export function validateLLMJson<T>(
  content: string,
  schema: z.ZodType<T>,
): { success: true; data: T } | { success: false; error: string } {
  if (!content || !content.trim()) {
    return { success: false, error: "Empty LLM response" };
  }

  // Step 1: Strip markdown code fences if present
  let cleaned = content.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Step 2: Find the first balanced JSON object using brace counting
  const startIndex = cleaned.indexOf("{");
  if (startIndex === -1) {
    return { success: false, error: "No JSON object found in LLM response" };
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  let endIndex = -1;

  for (let i = startIndex; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"' && !escape) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex === -1) {
    return { success: false, error: "Unbalanced braces in LLM JSON response" };
  }

  const jsonStr = cleaned.substring(startIndex, endIndex + 1);

  // Step 3: Reject if there is another JSON object after the first one
  const afterJson = cleaned.substring(endIndex + 1).trim();
  if (afterJson.includes("{")) {
    return { success: false, error: "Multiple JSON objects in LLM response" };
  }

  // Step 4: Parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { success: false, error: "Invalid JSON in LLM response" };
  }

  // Step 5: Validate against schema
  const result = schema.safeParse(parsed);
  if (!result.success) {
    // Return a generic error — do NOT expose schema field names to caller
    return { success: false, error: "LLM output schema validation failed" };
  }

  return { success: true, data: result.data };
}
