import { describe, it, expect } from "vitest";
import { z } from "zod";

// Replicate the schemas and function from the route for testing.
// In production these would be exported from a shared module.
const listingBuilderSchema = z.object({
  title: z.string().min(1).max(200),
  brand: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  hours: z.number().min(0).max(100000).optional(),
  condition: z.string().max(50).optional(),
  price: z.number().min(0).optional(),
  description: z.string().max(5000).optional(),
}).strict();

const moderationSchema = z.object({
  appropriate: z.boolean(),
  reason: z.string().max(500).optional(),
}).strict();

function validateLLMJson<T>(
  content: string,
  schema: z.ZodType<T>,
): { success: true; data: T } | { success: false; error: string } {
  if (!content || !content.trim()) {
    return { success: false, error: "Empty LLM response" };
  }

  let cleaned = content.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

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
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"' && !escape) { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) { endIndex = i; break; }
    }
  }

  if (endIndex === -1) {
    return { success: false, error: "Unbalanced braces in LLM JSON response" };
  }

  const jsonStr = cleaned.substring(startIndex, endIndex + 1);

  const afterJson = cleaned.substring(endIndex + 1).trim();
  if (afterJson.includes("{")) {
    return { success: false, error: "Multiple JSON objects in LLM response" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { success: false, error: "Invalid JSON in LLM response" };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      error: `Schema validation failed: ${result.error.issues.map(i => i.path.join('.') + ': ' + i.message).join('; ')}`,
    };
  }

  return { success: true, data: result.data };
}

// ============================================================
// MODERATION TESTS
// ============================================================

describe("MODERATION output validation", () => {
  it("valid moderation output — appropriate: false", () => {
    const result = validateLLMJson(
      '{"appropriate":false,"reason":"spam content"}',
      moderationSchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.appropriate).toBe(false);
      expect(result.data.reason).toBe("spam content");
    }
  });

  it("valid moderation output — appropriate: true", () => {
    const result = validateLLMJson(
      '{"appropriate":true}',
      moderationSchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.appropriate).toBe(true);
    }
  });

  it("invalid moderation JSON — malformed", () => {
    const result = validateLLMJson(
      'This is not JSON at all',
      moderationSchema,
    );
    expect(result.success).toBe(false);
  });

  it("missing 'appropriate' field", () => {
    const result = validateLLMJson(
      '{"reason":"some reason"}',
      moderationSchema,
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain("appropriate");
  });

  it("wrong type for 'appropriate' — string instead of boolean", () => {
    const result = validateLLMJson(
      '{"appropriate":"true","reason":"test"}',
      moderationSchema,
    );
    expect(result.success).toBe(false);
  });

  it("wrong type for 'appropriate' — number instead of boolean", () => {
    const result = validateLLMJson(
      '{"appropriate":1}',
      moderationSchema,
    );
    expect(result.success).toBe(false);
  });

  it("extra unexpected field — strict schema rejects", () => {
    const result = validateLLMJson(
      '{"appropriate":true,"reason":"ok","malicious":"field"}',
      moderationSchema,
    );
    expect(result.success).toBe(false);
  });

  it("empty LLM response", () => {
    const result = validateLLMJson("", moderationSchema);
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain("Empty");
  });

  it("whitespace-only LLM response", () => {
    const result = validateLLMJson("   \n\t  ", moderationSchema);
    expect(result.success).toBe(false);
  });
});

// ============================================================
// LISTING_BUILDER TESTS
// ============================================================

describe("LISTING_BUILDER output validation", () => {
  it("valid listing builder output", () => {
    const result = validateLLMJson(
      '{"title":"بیل مکانیکی کاترپیلار ۳۲۰","brand":"Caterpillar","model":"320","year":2018,"hours":5000,"condition":"used","price":250000000,"description":"بیل سالم"}',
      listingBuilderSchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("بیل مکانیکی کاترپیلار ۳۲۰");
      expect(result.data.year).toBe(2018);
    }
  });

  it("missing title — required field", () => {
    const result = validateLLMJson(
      '{"brand":"Caterpillar"}',
      listingBuilderSchema,
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain("title");
  });

  it("invalid year type — string instead of number", () => {
    const result = validateLLMJson(
      '{"title":"Test","year":"2018"}',
      listingBuilderSchema,
    );
    expect(result.success).toBe(false);
  });

  it("extra unexpected field — strict schema rejects", () => {
    const result = validateLLMJson(
      '{"title":"Test","malicious":"field"}',
      listingBuilderSchema,
    );
    expect(result.success).toBe(false);
  });

  it("year out of range — too old", () => {
    const result = validateLLMJson(
      '{"title":"Test","year":1800}',
      listingBuilderSchema,
    );
    expect(result.success).toBe(false);
  });

  it("year out of range — too far future", () => {
    const result = validateLLMJson(
      '{"title":"Test","year":2200}',
      listingBuilderSchema,
    );
    expect(result.success).toBe(false);
  });

  it("negative price — rejected", () => {
    const result = validateLLMJson(
      '{"title":"Test","price":-100}',
      listingBuilderSchema,
    );
    expect(result.success).toBe(false);
  });

  it("empty LLM response", () => {
    const result = validateLLMJson("", listingBuilderSchema);
    expect(result.success).toBe(false);
  });
});

// ============================================================
// JSON EXTRACTION EDGE CASES
// ============================================================

describe("JSON extraction edge cases", () => {
  it("multiple JSON objects — rejected", () => {
    const result = validateLLMJson(
      '{"appropriate":true} {"appropriate":false}',
      moderationSchema,
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain("Multiple");
  });

  it("markdown fenced JSON — extracted correctly", () => {
    const result = validateLLMJson(
      '```json\n{"appropriate":true,"reason":"ok"}\n```',
      moderationSchema,
    );
    expect(result.success).toBe(true);
  });

  it("JSON with nested braces in string values", () => {
    const result = validateLLMJson(
      '{"appropriate":true,"reason":"contains } brace"}',
      moderationSchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("contains } brace");
    }
  });

  it("JSON with escaped quotes in string values", () => {
    const result = validateLLMJson(
      '{"appropriate":true,"reason":"has \\"quotes\\""}',
      moderationSchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('has "quotes"');
    }
  });

  it("unbalanced braces — rejected", () => {
    const result = validateLLMJson(
      '{"appropriate":true',
      moderationSchema,
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain("Unbalanced");
  });

  it("text before JSON — extracted correctly", () => {
    const result = validateLLMJson(
      'Here is the result: {"appropriate":true}',
      moderationSchema,
    );
    expect(result.success).toBe(true);
  });

  it("text after JSON (no second object) — extracted correctly", () => {
    const result = validateLLMJson(
      '{"appropriate":true} Done.',
      moderationSchema,
    );
    expect(result.success).toBe(true);
  });
});
