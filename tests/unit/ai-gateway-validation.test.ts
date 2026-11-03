import { describe, it, expect } from "vitest";
import { z } from "zod";
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
// NORMALIZATION POLICY TESTS (STEP 18.2.7.3.4 — Review Point 1)
// All string fields are .trim()-ed before length/presence checks.
// ============================================================

describe("Normalization policy — trim before validate", () => {
  it("whitespace-only title — rejected (min(1) after trim)", () => {
    const result = validateLLMJson(
      '{"title":"   "}',
      listingBuilderSchema,
    );
    expect(result.success).toBe(false);
  });

  it("whitespace-only title with tabs/newlines — rejected", () => {
    const result = validateLLMJson(
      '{"title":"  \n\t  "}',
      listingBuilderSchema,
    );
    expect(result.success).toBe(false);
  });

  it("title with leading/trailing spaces — trimmed and accepted", () => {
    const result = validateLLMJson(
      '{"title":"  بیل مکانیکی  "}',
      listingBuilderSchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("بیل مکانیکی");
    }
  });

  it("optional brand with only whitespace — normalized to empty string", () => {
    const result = validateLLMJson(
      '{"title":"Valid Title","brand":"   "}',
      listingBuilderSchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      // Trimmed: whitespace-only optional string becomes "" not padding.
      expect(result.data.brand).toBe("");
    }
  });

  it("moderation reason with leading/trailing spaces — trimmed", () => {
    const result = validateLLMJson(
      '{"appropriate":false,"reason":"  spam content  "}',
      moderationSchema,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("spam content");
    }
  });

  it("title exactly max length (200) after trim — accepted", () => {
    const t = "ا".repeat(200);
    const result = validateLLMJson(
      JSON.stringify({ title: t }),
      listingBuilderSchema,
    );
    expect(result.success).toBe(true);
  });

  it("title exceeds max length (201) after trim — rejected", () => {
    const t = "ا".repeat(201);
    const result = validateLLMJson(
      JSON.stringify({ title: t }),
      listingBuilderSchema,
    );
    expect(result.success).toBe(false);
  });

  it("title exceeds max length only because of padding — trimmed, accepted", () => {
    // 200 real chars + 10 leading spaces. Without trim, length=210>200 → reject.
    // With trim, length=200 → accept. Proves trim runs BEFORE max check.
    const t = "          " + "ا".repeat(200);
    const result = validateLLMJson(
      JSON.stringify({ title: t }),
      listingBuilderSchema,
    );
    expect(result.success).toBe(true);
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

// ============================================================
// EXTRACTION CONTRACT FORMALIZATION (STEP 18.2.7.3.4 — Review Point 2)
// These tests pin the EXPLICIT contract documented in
// src/lib/ai-gateway-validation.ts so the tolerated-vs-rejected
// boundary cannot drift by accident.
// ============================================================

describe("Extraction contract — tolerated vs rejected boundary", () => {
  // ── ACCEPTED (preamble / postamble / fences) ──

  it("CONTRACT: leading prose (preamble) is tolerated", () => {
    const result = validateLLMJson(
      'Based on the text, here is my moderation: {"appropriate":true}',
      moderationSchema,
    );
    expect(result.success).toBe(true);
  });

  it("CONTRACT: trailing prose without { (postamble) is tolerated", () => {
    const result = validateLLMJson(
      '{"appropriate":false,"reason":"spam"} — please review this listing carefully.',
      moderationSchema,
    );
    expect(result.success).toBe(true);
  });

  it("CONTRACT: multi-line trailing prose without { is tolerated", () => {
    const result = validateLLMJson(
      '{"appropriate":true}\n\nLet me know if you need any further analysis.\nThanks!',
      moderationSchema,
    );
    expect(result.success).toBe(true);
  });

  it("CONTRACT: preamble + postamble together (no second {) is tolerated", () => {
    const result = validateLLMJson(
      'Result: {"appropriate":true} Done.',
      moderationSchema,
    );
    expect(result.success).toBe(true);
  });

  // ── REJECTED (second object / structural attacks) ──

  it("CONTRACT: trailing text WITH second { is rejected", () => {
    const result = validateLLMJson(
      '{"appropriate":true} Also consider {"appropriate":false}',
      moderationSchema,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Multiple JSON objects");
    }
  });

  it("CONTRACT: second { even in prose-looking position is rejected", () => {
    // A stray `{` in trailing text is treated as ambiguous/injection.
    const result = validateLLMJson(
      '{"appropriate":true} Note: see config {options} for details',
      moderationSchema,
    );
    expect(result.success).toBe(false);
  });

  it("CONTRACT: nested object inside first JSON is NOT treated as second object", () => {
    // The nested {} belongs to the first balanced object — must be accepted.
    const result = validateLLMJson(
      '{"appropriate":true,"meta":{"source":"llm"}}',
      moderationSchema.extend({ meta: z.object({ source: z.string() }).optional() }).strict(),
    );
    expect(result.success).toBe(true);
  });

  it("CONTRACT: two separate top-level objects (no separator) — rejected", () => {
    const result = validateLLMJson(
      '{"appropriate":true}{"appropriate":false}',
      moderationSchema,
    );
    expect(result.success).toBe(false);
  });
});
