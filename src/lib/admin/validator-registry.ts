/**
 * HEAVIX — CP-02.17-IR-01 §04: Validator Registry
 *
 * PROVENANCE: RE-AUTHORED during CP-02.17-SCP-REC-01 recovery.
 * Original file was created during Phase A §04 but lost during container restart.
 * Re-authored from documented contract in worklog.md.
 * NOT original historical evidence.
 *
 * Server-side allowlisted validator registry for custom field validation.
 *
 * Security invariants:
 *   - No eval()
 *   - No arbitrary function execution from user-controlled strings
 *   - No dynamic import from untrusted input
 *   - Registry is allowlisted (only explicitly registered validators can run)
 *   - Unknown validator names FAIL CLOSED (reject the input)
 *   - Server remains authoritative
 */

import type { AdminField } from './types';

export type ValidatorFn = (
  value: unknown,
  field: AdminField,
  allData: Record<string, unknown>,
) => string | null;

const _registry = new Map<string, ValidatorFn>();

export function registerValidator(name: string, fn: ValidatorFn): void {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Validator name must be a non-empty string');
  }
  if (typeof fn !== 'function') {
    throw new Error('Validator function must be a function');
  }
  _registry.set(name, fn);
}

export function resolveValidator(name: string): ValidatorFn | null {
  return _registry.get(name) ?? null;
}

export function hasValidator(name: string): boolean {
  return _registry.has(name);
}

export function listValidators(): string[] {
  return Array.from(_registry.keys()).sort();
}

// Built-in validators
registerValidator('phoneNumber', (value) => {
  const str = String(value ?? '');
  if (str.length === 0) return null;
  return /^(\+98|0)?9\d{9}$/.test(str) ? null : 'شماره موبایل نامعتبر است';
});

registerValidator('email', (value) => {
  const str = String(value ?? '');
  if (str.length === 0) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str) ? null : 'ایمیل نامعتبر است';
});

registerValidator('url', (value) => {
  const str = String(value ?? '');
  if (str.length === 0) return null;
  try { new URL(str); return null; } catch { return 'URL نامعتبر است'; }
});

registerValidator('slug', (value) => {
  const str = String(value ?? '');
  if (str.length === 0) return null;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(str) ? null : 'اسلاگ باید فقط شامل حروف کوچک، اعداد و خط تیره باشد';
});

registerValidator('nonEmpty', (value) => {
  const str = String(value ?? '');
  if (str.length === 0) return null;
  return str.trim().length > 0 ? null : 'این فیلد نمی‌تواند فقط فضای خالی باشد';
});
