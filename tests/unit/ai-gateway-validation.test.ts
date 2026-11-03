import { describe, it, expect } from "vitest";
import {
  validateLLMJson,
  listingBuilderSchema,
  moderationSchema,
} from "@/lib/ai-gateway-validation";

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

  it("error message does not expose internal field names", () => {
    const result = validateLLMJson(
      '{"wrongfield":"test"}',
      moderationSchema,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should be generic, not "appropriate: Required"
      expect(result.error).not.toContain("appropriate");
      expect(result.error).toContain("schema validation failed");
    }
  });
});
