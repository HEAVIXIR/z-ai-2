/**
 * HEAVIX — Security Tests: Universal Form Engine (STEP 11.14)
 * -----------------------------------------------------------
 * Behavioral tests for the Universal Form engine closure:
 *   - `multi-select` field type (checkbox list)
 *   - `rich-text` field type (textarea with toolbar)
 *   - `requiredWhen` conditional required (server-side via
 *     `checkRequiredWhen` in resource-validator.ts)
 *   - `readonlyWhen` conditional readonly (client-side; verified
 *     via type declaration)
 *   - `conditions` field visibility (declared + evaluated)
 *
 * STEP 11.13 audit found Universal Form PARTIAL: 2 of 16 field types
 * unhandled, no requiredWhen/readonlyWhen. STEP 11.14 closes both gaps.
 *
 * Test strategy:
 *   - For server-side validation: import REAL `validateResourcePayload`
 *     and `checkRequiredWhen` from `resource-validator.ts`. Use
 *     synthetic test configs that exercise each new feature.
 *   - For type declarations: verify the AdminField type accepts the
 *     new fields (requiredWhen, readonlyWhen, conditions).
 *   - For renderer: verify the universal-form.tsx file CONTAINS the
 *     multi-select and rich-text cases (static code check — full
 *     renderer testing requires jsdom + React Testing Library, out
 *     of scope for this pass).
 *
 * Runs under `bun run test:security`
 * (config: vitest.security.config.ts → includes tests/security/**).
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import type { AdminResourceConfig, AdminField } from "@/lib/admin/types";
import { validateResourcePayload, checkRequiredWhen } from "@/lib/admin/resource-validator";

const ROOT = path.resolve(__dirname, "..", "..");
const FORM_PATH = path.join(ROOT, "src", "components", "admin", "universal-form.tsx");
const formCode = fs.readFileSync(FORM_PATH, "utf8");

/* ── Synthetic test config with requiredWhen + readonlyWhen ──────
   Mirrors a real-world scenario:
     - taxId is required only when userType === 'COMPANY'
     - price is read-only once status === 'PUBLISHED'
   ============================================================ */

const testConfig: AdminResourceConfig = {
  key: "test-form",
  titleFa: "تست",
  model: "testEntity",
  apiBase: "/api/admin/test",
  adminPath: "/admin/test",
  permissions: { read: "test.read", create: "test.create", update: "test.update", delete: "test.delete" },
  columns: [
    { key: "name", label: "Name", type: "text" },
    { key: "userType", label: "User Type", type: "badge" },
  ],
  fields: [
    { key: "name", label: "Name", type: "text", required: true,
      validation: { minLength: 2 } },
    { key: "userType", label: "User Type", type: "select", required: true,
      options: [
        { value: "INDIVIDUAL", label: "Individual" },
        { value: "COMPANY", label: "Company" },
      ]},
    // taxId is required only when userType === 'COMPANY'
    { key: "taxId", label: "Tax ID", type: "text",
      requiredWhen: [{ field: "userType", operator: "eq", value: "COMPANY" }],
      validation: { minLength: 4, maxLength: 50 } },
    // status field (controls readonlyWhen on price)
    { key: "status", label: "Status", type: "select",
      options: [
        { value: "DRAFT", label: "Draft" },
        { value: "PUBLISHED", label: "Published" },
      ]},
    // price is read-only once status === 'PUBLISHED'
    { key: "price", label: "Price", type: "currency",
      readonlyWhen: [{ field: "status", operator: "eq", value: "PUBLISHED" }],
      validation: { min: 0 } },
    // multi-select field (checkbox list)
    { key: "tags", label: "Tags", type: "multi-select",
      options: [
        { value: "new", label: "New" },
        { value: "sale", label: "Sale" },
        { value: "featured", label: "Featured" },
      ]},
    // rich-text field (textarea with toolbar)
    { key: "description", label: "Description", type: "rich-text",
      validation: { maxLength: 5000 } },
    // conditional visibility: notes only shown when status === 'DRAFT'
    { key: "internalNotes", label: "Internal Notes", type: "textarea",
      conditions: [{ field: "status", operator: "eq", value: "DRAFT" }] },
  ],
};

/* ────────────────────────────────────────────────────────────────
   Type declaration tests
   ──────────────────────────────────────────────────────────────── */

describe("AdminField type — STEP 11.14 declarations", () => {
  it("AdminField accepts requiredWhen?: FieldCondition[]", () => {
    const field: AdminField = {
      key: "taxId",
      label: "Tax ID",
      type: "text",
      requiredWhen: [{ field: "userType", operator: "eq", value: "COMPANY" }],
    };
    expect(field.requiredWhen).toBeDefined();
    expect(field.requiredWhen).toHaveLength(1);
  });

  it("AdminField accepts readonlyWhen?: FieldCondition[]", () => {
    const field: AdminField = {
      key: "price",
      label: "Price",
      type: "currency",
      readonlyWhen: [{ field: "status", operator: "eq", value: "PUBLISHED" }],
    };
    expect(field.readonlyWhen).toBeDefined();
    expect(field.readonlyWhen).toHaveLength(1);
  });

  it("AdminField accepts conditions?: FieldCondition[] (existing, undeployed)", () => {
    const field: AdminField = {
      key: "internalNotes",
      label: "Notes",
      type: "textarea",
      conditions: [{ field: "status", operator: "eq", value: "DRAFT" }],
    };
    expect(field.conditions).toBeDefined();
    expect(field.conditions).toHaveLength(1);
  });

  it("multi-select is a valid AdminField.type", () => {
    const field: AdminField = {
      key: "tags",
      label: "Tags",
      type: "multi-select",
      options: [{ value: "new", label: "New" }],
    };
    expect(field.type).toBe("multi-select");
  });

  it("rich-text is a valid AdminField.type", () => {
    const field: AdminField = {
      key: "description",
      label: "Description",
      type: "rich-text",
    };
    expect(field.type).toBe("rich-text");
  });
});

/* ────────────────────────────────────────────────────────────────
   checkRequiredWhen — server-side conditional required
   ──────────────────────────────────────────────────────────────── */

describe("checkRequiredWhen — server-side enforcement", () => {
  it("condition MET + field EMPTY → returns required error", () => {
    const errors = checkRequiredWhen(testConfig, {
      name: "Alice",
      userType: "COMPANY",
      taxId: "",  // EMPTY — should fail
    });
    const taxIdError = errors.find(e => e.field === "taxId");
    expect(taxIdError).toBeDefined();
    expect(taxIdError!.code).toBe("required");
  });

  it("condition MET + field PROVIDED → no error", () => {
    const errors = checkRequiredWhen(testConfig, {
      name: "Alice",
      userType: "COMPANY",
      taxId: "TAX-12345",
    });
    const taxIdError = errors.find(e => e.field === "taxId");
    expect(taxIdError).toBeUndefined();
  });

  it("condition NOT MET + field EMPTY → no error (field is optional in this case)", () => {
    const errors = checkRequiredWhen(testConfig, {
      name: "Alice",
      userType: "INDIVIDUAL",  // taxId NOT required for individuals
      taxId: "",
    });
    const taxIdError = errors.find(e => e.field === "taxId");
    expect(taxIdError).toBeUndefined();
  });

  it("does NOT interfere with fields that have no requiredWhen", () => {
    const errors = checkRequiredWhen(testConfig, {
      name: "Alice",
      userType: "INDIVIDUAL",
    });
    // name has static required (not requiredWhen) — checkRequiredWhen
    // doesn't touch it (Zod handles static required).
    const nameError = errors.find(e => e.field === "name");
    expect(nameError).toBeUndefined();
  });
});

/* ────────────────────────────────────────────────────────────────
   validateResourcePayload — end-to-end with requiredWhen
   ──────────────────────────────────────────────────────────────── */

describe("validateResourcePayload — end-to-end with requiredWhen", () => {
  it("rejects when requiredWhen condition is met + field is empty", () => {
    const result = validateResourcePayload(testConfig, {
      name: "Alice",
      userType: "COMPANY",
      taxId: "",
      status: "DRAFT",
    });
    expect(result.ok).toBe(false);
    const taxIdError = result.errors.find(e => e.field === "taxId");
    expect(taxIdError).toBeDefined();
  });

  it("accepts when requiredWhen condition is NOT met + field is empty", () => {
    const result = validateResourcePayload(testConfig, {
      name: "Alice",
      userType: "INDIVIDUAL",
      taxId: "",
      status: "DRAFT",
    });
    // Zod passes (taxId is optional when condition not met), and
    // checkRequiredWhen returns no errors.
    expect(result.ok).toBe(true);
  });

  it("accepts when requiredWhen condition is met + field is provided", () => {
    const result = validateResourcePayload(testConfig, {
      name: "Alice",
      userType: "COMPANY",
      taxId: "TAX-12345",
      status: "DRAFT",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects invalid data via Zod (multi-select accepts array values)", () => {
    // multi-select field accepts an array — Zod should accept string[]
    const result = validateResourcePayload(testConfig, {
      name: "Alice",
      userType: "INDIVIDUAL",
      tags: ["new", "sale"],
      status: "DRAFT",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects unknown enum value (server-side validation works)", () => {
    const result = validateResourcePayload(testConfig, {
      name: "Alice",
      userType: "ROBOT",  // not in the enum
      status: "DRAFT",
    });
    expect(result.ok).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────
   Renderer — multi-select + rich-text cases (static code check)
   ──────────────────────────────────────────────────────────────── */

describe("universal-form.tsx — renderer coverage", () => {
  it("renderField has a case for 'multi-select' (checkbox list)", () => {
    expect(formCode).toMatch(/case\s+['"]multi-select['"]/);
  });

  it("multi-select case renders checkboxes (input type=checkbox)", () => {
    expect(formCode).toMatch(/type="checkbox"/);
  });

  it("renderField has a case for 'rich-text' (textarea + toolbar)", () => {
    expect(formCode).toMatch(/case\s+['"]rich-text['"]/);
  });

  it("rich-text case has a formatting toolbar (B/I/H buttons)", () => {
    // Toolbar should have at least one formatting button
    expect(formCode).toMatch(/wrapSelection|insertLinePrefix/);
  });

  it("FormField uses isFieldRequired() OR inline conditional-required logic", () => {
    // The renderer should evaluate requiredWhen — either via a helper
    // function (isFieldRequired) or inline (field.requiredWhen.every).
    const hasHelper = formCode.includes("isFieldRequired");
    const hasInline = formCode.includes("field.requiredWhen");
    expect(hasHelper || hasInline).toBe(true);
  });

  it("FormField uses isFieldReadonly() OR inline conditional-readonly logic", () => {
    const hasHelper = formCode.includes("isFieldReadonly");
    const hasInline = formCode.includes("field.readonlyWhen");
    expect(hasHelper || hasInline).toBe(true);
  });
});
