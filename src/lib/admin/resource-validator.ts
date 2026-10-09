/**
 * HEAVIX — P1: Server-Side Resource Validator
 *
 * Server-authoritative validation for Universal Resource API.
 * Uses the AdminField validation rules declared in resource configs
 * (required, type, enum, minLength, maxLength, min, max, pattern)
 * to validate request payloads BEFORE mutation.
 *
 * This is SEPARATE from field-level authorization (applyFieldWritePolicyAsync)
 * which checks permissions. Validation checks data shape/constraints.
 *
 * Flow in Universal Resource API:
 *   permission → field write policy → **resource validation** → service/data layer → auditMutation → response
 *
 * Uses zod (already installed — v4.0.2) for schema building.
 * No new dependency added.
 */

import { z } from 'zod';
import type { AdminResourceConfig, AdminField } from './types';

// ── Types ──────────────────────────────────────────────────
export interface ValidationError {
  field: string;
  message: string;
  code: 'required' | 'type' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'enum' | 'custom';
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  /** The validated data (only fields that passed validation) */
  data?: Record<string, unknown>;
}

// ── Build zod schema from AdminField config ────────────────
/**
 * Builds a zod schema for a single field based on its type + validation rules.
 * Returns null for fields that don't need validation (no rules + not required).
 */
function buildFieldSchema(field: AdminField): z.ZodTypeAny | null {
  let schema: z.ZodTypeAny;

  // Base type from field.type
  switch (field.type) {
    case 'number':
    case 'currency':
      schema = z.number();
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'date':
    case 'datetime':
      schema = z.union([z.string(), z.date()]);
      break;
    case 'select':
    case 'multi-select':
      if (field.options && field.options.length > 0) {
        const values = field.options.map(o => o.value);
        if (field.type === 'multi-select') {
          schema = z.array(z.enum(values as [string, ...string[]]));
        } else {
          schema = z.enum(values as [string, ...string[]]);
        }
      } else {
        schema = z.string();
      }
      break;
    case 'relation':
      schema = z.string(); // relation IDs are strings (cuid)
      break;
    case 'password':
    case 'color':
    case 'slug':
    case 'text':
    case 'rich-text':
    case 'json':
    default:
      schema = z.string();
      break;
  }

  // Apply validation rules from field.validation
  const v = field.validation;
  if (v) {
    if (schema instanceof z.ZodString) {
      const stringSchema = schema as z.ZodString;
      if (v.minLength !== undefined) {
        schema = stringSchema.min(v.minLength, v.message ?? `حداقل ${v.minLength} نویسه`);
      }
      if (v.maxLength !== undefined) {
        schema = stringSchema.max(v.maxLength, v.message ?? `حداکثر ${v.maxLength} نویسه`);
      }
      if (v.pattern) {
        try {
          const regex = new RegExp(v.pattern);
          schema = stringSchema.regex(regex, v.message ?? `فرمت نامعتبر`);
        } catch {
          // Invalid pattern — skip regex
        }
      }
    } else if (schema instanceof z.ZodNumber) {
      const numberSchema = schema as z.ZodNumber;
      if (v.min !== undefined) {
        schema = numberSchema.min(v.min, v.message ?? `حداقل ${v.min}`);
      }
      if (v.max !== undefined) {
        schema = numberSchema.max(v.max, v.message ?? `حداکثر ${v.max}`);
      }
    }
  }

  // Handle required vs optional
  if (field.required) {
    // For optional fields, wrap in .optional()
    // Required fields stay as-is
  } else {
    schema = schema.optional().or(z.literal('').transform(() => undefined));
  }

  return schema;
}

// ── Build full resource schema from config ─────────────────
/**
 * Builds a zod object schema from the AdminResourceConfig.fields array.
 * Only includes fields that have validation rules or are required.
 */
export function buildResourceSchema(config: AdminResourceConfig): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of config.fields) {
    const fieldSchema = buildFieldSchema(field);
    if (fieldSchema) {
      shape[field.key] = fieldSchema;
    }
  }

  // Use passthrough to allow fields not in the schema (they'll be filtered by applyFieldWritePolicyAsync)
  return z.object(shape).passthrough();
}

// ── Validate payload against resource config ───────────────
/**
 * Validates a request payload against the resource's field config.
 *
 * Returns:
 *   - `{ ok: true, data }` on success — `data` is the validated payload
 *   - `{ ok: false, errors }` on failure — `errors` is a list of validation errors
 *
 * Usage in Universal Resource API:
 *   const validation = await validateResourcePayload(config, body);
 *   if (!validation.ok) {
 *     return NextResponse.json({ errors: validation.errors }, { status: 422 });
 *   }
 *   // proceed with validation.data
 */
export function validateResourcePayload(
  config: AdminResourceConfig,
  data: Record<string, unknown>,
): ValidationResult {
  const schema = buildResourceSchema(config);
  const result = schema.safeParse(data);

  if (result.success) {
    // STEP 11.14 (Form Engine Closure): post-Zod conditional-required check.
    // Zod's static schema can't express "required only when X === Y" — that
    // requires runtime evaluation of `requiredWhen` against the submitted data.
    // We run it AFTER Zod passes (so type/length constraints are already
    // validated) and merge any new errors into the result.
    const requiredWhenErrors = checkRequiredWhen(config, result.data as Record<string, unknown>);
    if (requiredWhenErrors.length > 0) {
      return { ok: false, errors: requiredWhenErrors };
    }
    return { ok: true, errors: [], data: result.data as Record<string, unknown> };
  }

  // Convert zod errors to ValidationError format
  // Note: zod v4 uses .issues (not .errors). Each issue has .path, .message, .code.
  const errors: ValidationError[] = result.error.issues.map((err) => {
    const field = err.path[0]?.toString() ?? 'unknown';
    let code: ValidationError['code'] = 'custom';
    let message = err.message;

    // Map zod issue codes to our codes
    // zod v4 uses different code names than v3
    const errCode = (err as { code?: string }).code ?? '';
    if (errCode.includes('invalid_type') || errCode === 'invalid_type') {
      code = 'type';
    } else if (errCode.includes('too_small')) {
      // Could be min (number) or minLength (string/array)
      const origin = (err as { origin?: string }).origin;
      code = origin === 'number' ? 'min' : 'minLength';
    } else if (errCode.includes('too_big')) {
      const origin = (err as { origin?: string }).origin;
      code = origin === 'number' ? 'max' : 'maxLength';
    } else if (errCode.includes('invalid_string')) {
      code = 'pattern';
    } else if (errCode.includes('invalid_enum') || errCode.includes('invalid_value')) {
      code = 'enum';
    }

    return { field, message, code };
  });

  // STEP 11.14: also run checkRequiredWhen on FAILED parses — Zod may have
  // skipped required-checks for fields it couldn't even type-check. We want
  // to surface "this field is required when X" rather than "invalid type".
  const requiredWhenErrors = checkRequiredWhen(config, data);
  // Merge: prefer Zod errors for fields Zod caught, add requiredWhen errors
  // for fields Zod didn't catch (to avoid duplicate error messages).
  const existingFields = new Set(errors.map(e => e.field));
  for (const reqErr of requiredWhenErrors) {
    if (!existingFields.has(reqErr.field)) {
      errors.push(reqErr);
    }
  }

  return { ok: false, errors };
}

// ── STEP 11.14: Conditional-required post-validation ──────
/**
 * Evaluates `field.requiredWhen` conditions against the submitted data and
 * returns errors for any field that:
 *   (a) declares `requiredWhen`
 *   (b) ALL conditions are met (AND logic — same as `conditions` visibility)
 *   (c) the field value is empty (null, undefined, '', or [] for arrays)
 *
 * This is the SERVER-SIDE enforcement of conditional required. The
 * CLIENT-SIDE enforcement is in universal-form.tsx `isFieldRequired()`
 * (renders the `*` indicator + blocks submit via validateField()).
 *
 * Why post-Zod? Zod's static schema can't express "required when X === Y"
 * — that requires runtime evaluation against the submitted data. We run
 * it AFTER Zod so type/length constraints are already validated (we don't
 * re-implement Zod's job here, just the conditional-required layer).
 */
export function checkRequiredWhen(
  config: AdminResourceConfig,
  data: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of config.fields) {
    if (!field.requiredWhen || field.requiredWhen.length === 0) continue;

    // ALL conditions must be met (AND logic — same as `conditions` visibility)
    const allMet = field.requiredWhen.every(cond => evaluateCondition(cond, data));
    if (!allMet) continue;

    // Condition is met → field is required. Check if value is empty.
    const value = data[field.key];
    if (isEmpty(value)) {
      errors.push({
        field: field.key,
        message: `${field.label} الزامی است`,
        code: 'required',
      });
    }
  }

  return errors;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function evaluateCondition(
  cond: { field: string; operator: string; value?: unknown },
  values: Record<string, unknown>,
): boolean {
  const val = values[cond.field];
  switch (cond.operator) {
    case 'eq': return val === cond.value;
    case 'neq': return val !== cond.value;
    case 'in': return Array.isArray(cond.value) && cond.value.includes(val);
    case 'notNull': return val !== null && val !== undefined;
    case 'isNull': return val === null || val === undefined;
    case 'gt': return typeof val === 'number' && typeof cond.value === 'number' && val > cond.value;
    case 'lt': return typeof val === 'number' && typeof cond.value === 'number' && val < cond.value;
    default: return true;
  }
}
