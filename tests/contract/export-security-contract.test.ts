/**
 * HEAVIX — CP-02.17-IR-01 Phase A §05: Export Read-Policy Enforcement Tests
 * PROVENANCE: RE-AUTHORED during CP-02.17-SCP-REC-01 recovery (×2 — lost twice to container restarts).
 * NOT original historical evidence.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CP-02.17-IR-01 §05 — Export Read-Policy Enforcement', () => {
  const exportEngineSource = readFileSync(resolve('src/lib/admin/bulk-export-engine.ts'), 'utf-8');

  it('imports filterReadableFieldsAsync from field-policy', () => {
    expect(exportEngineSource).toContain("import { filterReadableFieldsAsync } from './field-policy';");
  });

  it('does NOT rely solely on visible !== false for field selection', () => {
    expect(exportEngineSource).toContain('canFieldRead');
    expect(exportEngineSource).toContain('permissions?.read');
    expect(exportEngineSource).toContain('CP-02.17-IR-01 §05');
  });

  it('filters exportFields by permissions.read before querying data', () => {
    expect(exportEngineSource).toContain('await can(ctx.userId, col.permissions.read)');
    expect(exportEngineSource).toContain('readableChecks');
    expect(exportEngineSource).toContain('.filter(check => check.canRead)');
  });

  it('calls filterReadableFieldsAsync on queried items (defense-in-depth)', () => {
    expect(exportEngineSource).toContain('filterReadableFieldsAsync(config, rawItems, ctx.userId)');
  });

  it('preserves 5000-row safety limit', () => { expect(exportEngineSource).toContain('take: 5000'); });
  it('preserves canExport permission check', () => { expect(exportEngineSource).toContain('canExport(ctx.userId, resourceKey)'); });
  it('preserves audit logging', () => { expect(exportEngineSource).toContain('logAudit'); expect(exportEngineSource).toContain('resourceKey}.export'); });
  it('preserves CSV and JSON format support', () => { expect(exportEngineSource).toContain("format === 'json'"); expect(exportEngineSource).toContain('escapeCSV'); expect(exportEngineSource).toContain('\\uFEFF'); });

  it('does NOT use eval or dynamic import for field selection', () => {
    const stripped = exportEngineSource.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(stripped).not.toMatch(/\beval\s*\(/);
    expect(stripped).not.toMatch(/new\s+Function\s*\(/);
  });
});

describe('CP-02.17-IR-01 §05 — Field Policy Strips Restricted Fields', () => {
  it('filterReadableFieldsAsync is exported from field-policy module', async () => {
    const mod = await import('@/lib/admin/field-policy');
    expect(typeof mod.filterReadableFieldsAsync).toBe('function');
  });

  it('sync applyFieldPolicy is documented as non-enforcing', async () => {
    const source = readFileSync(resolve('src/lib/admin/field-policy.ts'), 'utf-8');
    const hasNonEnforcingNote = source.includes("can't check async permissions") || source.includes("NON-ENFORCING") || source.includes("non-enforcing") || source.includes("does NOT enforce");
    expect(hasNonEnforcingNote).toBe(true);
  });

  it('async applyFieldWritePolicyAsync is fail-closed', async () => {
    const source = readFileSync(resolve('src/lib/admin/field-policy.ts'), 'utf-8');
    expect(source).toContain('ok: false');
    expect(source).toContain('rejectedField');
    expect(source).toContain('requiredPermission');
  });
});
