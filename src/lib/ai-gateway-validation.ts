import { z } from "zod";

/* ============================================================
   AI Gateway Output Validation — Fail-Closed Schemas
   ------------------------------------------------------------
   Issue #179: LLM outputs must be validated before use.
   No fallback defaults that could silently approve content.
   ============================================================ */

/* ------------------------------------------------------------
   NORMALIZATION POLICY (STEP 18.2.7.3.4 — Review Point 1)
   ------------------------------------------------------------
   All string fields are `.trim()`-ed BEFORE length / presence
   validation. Consequences:

   • Required strings (e.g. listing `title`) MUST be non-empty
     AFTER trimming — a whitespace-only value like "   " is rejected.
   • Optional strings are trimmed when present, so a value of
     "   " is normalized to "" rather than stored as padding.

   This prevents an LLM from returning a structurally-valid but
   semantically-empty string (e.g. `"title": "   "`) that would
   otherwise pass `min(1)` because the raw length is ≥ 1.
   ------------------------------------------------------------ */

// Strict schemas — no .passthrough(). Unknown fields are rejected.
export const listingBuilderSchema = z.object({
  title: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  hours: z.number().min(0).max(100000).optional(),
  condition: z.string().trim().max(50).optional(),
  price: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  description: z.string().trim().max(5000).optional(),
}).strict();

export const moderationSchema = z.object({
  appropriate: z.boolean(),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const MAX_LISTING_BUILDER_OUTPUT_CHARS = 16_384;
export const MAX_MODERATION_OUTPUT_CHARS = 4_096;

/* ============================================================
   JSON EXTRACTION CONTRACT (STEP 18.2.7.3.4 — Review Point 2)
   ------------------------------------------------------------
   LLM responses in the wild commonly contain surrounding prose
   ("Here is the result: {…} Let me know if you need more.").
   To balance robustness against the security requirement that
   NO unvalidated JSON can influence a moderation decision, the
   extractor enforces the following EXPLICIT contract:

   ACCEPTED (tolerated):
   • Leading text before the first `{`           — preamble.
   • Trailing text after the closing `}` that does
     NOT contain another `{`                       — postamble.
   • Markdown code fences (```json … ```).

   REJECTED (fail-closed):
   • A second `{` anywhere after the first balanced
     object (i.e. a second JSON object)             — ambiguity
     is treated as an attack, not a feature.
   • Unbalanced / mismatched braces.
   • No `{` at all (empty or prose-only response).
   • JSON that parses but fails the Zod schema.

   Rationale: the security-critical surface (second JSON object
   injection) is firmly rejected; the merely noisy surface
   (preamble / postamble) is tolerated because real LLMs produce
   it routinely and forcing JSON-only would raise the false-
   failure rate without improving security.
   ============================================================ */

/**
 * Deterministic JSON extraction from LLM output.
 *
 * Instead of a greedy regex that may capture multiple JSON objects or
 * trailing text, this function:
 * 1. Strips markdown code fences (```json ... ```).
 * 2. Finds the FIRST balanced JSON object using brace counting.
 * 3. Rejects if there is another `{` after the first object.
 * 4. Parses with JSON.parse.
 * 5. Validates against the Zod schema.
 *
 * Fail-closed: any extraction or validation failure returns an error.
 * The error message does NOT expose internal system details to the caller.
 */
export function validateLLMJson<T>(
  content: string,
  schema: z.ZodType<T>,
  maxChars = MAX_LISTING_BUILDER_OUTPUT_CHARS,
): { success: true; data: T } | { success: false; error: string } {
  // Bound parser work before trim, regex, substring allocation, or JSON.parse.
  if (content.length > maxChars) {
    return { success: false, error: "LLM response exceeds size limit" };
  }

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

  // Step 3: Reject if there is another JSON object (`{`) after the first.
  // Per the extraction contract above, trailing PROSE is tolerated, but a
  // second `{` is treated as an ambiguous / injection attempt → fail-closed.
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
