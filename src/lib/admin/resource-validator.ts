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

  return { ok: false, errors };
}
