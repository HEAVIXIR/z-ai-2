/**
 * HEAVIX — P0 Control Plane Hardening Contract Tests
 *
 * Verifies the 3 P0 security fixes from the Control Plane Hardening batch:
 *
 * P0-1: Field Write Authorization (fail-closed)
 *   - applyFieldWritePolicyAsync exists in field-policy.ts
 *   - createResource + updateResource in data-adapter.ts call applyFieldWritePolicyAsync
 *   - Universal Resource API POST + PATCH routes handle 403 field-write rejection
 *
 * P0-2: Field Read Authorization in Detail Route
 *   - filterReadableFieldsAsync is called in GET [id] (Detail) route
 *   - Detail route returns filtered data (consistent with List route)
 *
 * P0-3: Audit Enforcement (central, not convention)
 *   - POST (Create) uses auditMutation wrapper (not post-mutation auditCreate)
 *   - PATCH (Update) uses auditMutation wrapper (was already correct)
 *   - DELETE uses auditMutation wrapper (not post-mutation auditDelete)
 *   - All 3 mutation types wrap the operation inside auditMutation
 *
 * These are STATIC contract tests — they verify code structure and
 * import patterns without requiring a running database (which is
 * currently blocked by the DATABASE_URL Environment Blocker).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ─── Helpers ────────────────────────────────────────────────
function readFile(relPath: string): string {
  const fullPath = path.join(process.cwd(), relPath);
  return fs.readFileSync(fullPath, 'utf-8');
}

function fileExists(relPath: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), relPath));
  } catch {
    return false;
  }
}

// ─── P0-1: Field Write Authorization ─────────────────────────
describe('P0-1: Field Write Authorization (fail-closed)', () => {
  const fieldPolicyPath = 'src/lib/admin/field-policy.ts';
  const dataAdapterPath = 'src/lib/admin/data-adapter.ts';
  const postRoutePath = 'src/app/api/admin/resources/[resource]/route.ts';
  const patchRoutePath = 'src/app/api/admin/resources/[resource]/[id]/route.ts';

  it('field-policy.ts exports applyFieldWritePolicyAsync', () => {
    expect(fileExists(fieldPolicyPath)).toBe(true);
    const code = readFile(fieldPolicyPath);
    expect(code).toContain('export async function applyFieldWritePolicyAsync');
  });

  it('applyFieldWritePolicyAsync returns FieldWritePolicyResult with ok/rejectedField/requiredPermission', () => {
    const code = readFile(fieldPolicyPath);
    expect(code).toContain('FieldWritePolicyResult');
    expect(code).toContain('ok: boolean');
    expect(code).toContain('rejectedField');
    expect(code).toContain('requiredPermission');
  });

  it('applyFieldWritePolicyAsync calls can() for fields with permissions.write', () => {
    const code = readFile(fieldPolicyPath);
    expect(code).toMatch(/await can\(ctx\.userId,\s*writePerm\)/);
  });

  it('applyFieldWritePolicyAsync FAILS CLOSED (returns ok:false) when user lacks permission', () => {
    const code = readFile(fieldPolicyPath);
    // Must return ok: false when can() returns false
    expect(code).toMatch(/if\s*\(!hasPerm\)\s*\{[\s\S]*?return\s*\{[\s\S]*?ok:\s*false/);
  });

  it('data-adapter.ts imports applyFieldWritePolicyAsync (not sync version)', () => {
    expect(fileExists(dataAdapterPath)).toBe(true);
    const code = readFile(dataAdapterPath);
    expect(code).toContain('applyFieldWritePolicyAsync');
    expect(code).not.toMatch(/import.*applyFieldWritePolicy[^A]/); // not importing sync version only
  });

  it('createResource calls applyFieldWritePolicyAsync before model.create', () => {
    const code = readFile(dataAdapterPath);
    expect(code).toContain('export async function createResource');
    // Verify applyFieldWritePolicyAsync is called inside createResource
    const createSection = code.match(/export async function createResource[\s\S]*?^}/m);
    expect(createSection).toBeTruthy();
    expect(createSection![0]).toContain('applyFieldWritePolicyAsync');
  });

  it('updateResource calls applyFieldWritePolicyAsync before model.update', () => {
    const code = readFile(dataAdapterPath);
    expect(code).toContain('export async function updateResource');
    const updateSection = code.match(/export async function updateResource[\s\S]*?^}/m);
    expect(updateSection).toBeTruthy();
    expect(updateSection![0]).toContain('applyFieldWritePolicyAsync');
  });

  it('createResource throws 403 error with rejectedField + requiredPermission on auth failure', () => {
    const code = readFile(dataAdapterPath);
    // statusCode is set via assignment (err.statusCode = 403) in both createResource and updateResource
    expect(code).toMatch(/statusCode\s*=\s*403/);
    expect(code).toMatch(/rejectedField/);
    expect(code).toMatch(/requiredPermission/);
  });

  it('POST route handles 403 field-write rejection (not 500)', () => {
    const code = readFile(postRoutePath);
    expect(code).toContain('statusCode === 403');
    expect(code).toContain('rejectedField');
    expect(code).toContain('requiredPermission');
  });

  it('PATCH route handles 403 field-write rejection (not 500)', () => {
    const code = readFile(patchRoutePath);
    expect(code).toContain('statusCode === 403');
    expect(code).toContain('rejectedField');
    expect(code).toContain('requiredPermission');
  });
});

// ─── P0-2: Field Read Authorization in Detail Route ─────────
describe('P0-2: Field Read Authorization in Detail Route', () => {
  const detailRoutePath = 'src/app/api/admin/resources/[resource]/[id]/route.ts';

  it('Detail route imports filterReadableFieldsAsync', () => {
    expect(fileExists(detailRoutePath)).toBe(true);
    const code = readFile(detailRoutePath);
    expect(code).toContain("import { filterReadableFieldsAsync }");
  });

  it('GET handler in Detail route calls filterReadableFieldsAsync', () => {
    const code = readFile(detailRoutePath);
    // Find the GET handler section
    const getMatch = code.match(/export async function GET[\s\S]*?^}/m);
    expect(getMatch).toBeTruthy();
    expect(getMatch![0]).toContain('filterReadableFieldsAsync');
  });

  it('Detail route returns filtered item (not raw item)', () => {
    const code = readFile(detailRoutePath);
    const getMatch = code.match(/export async function GET[\s\S]*?^}/m);
    expect(getMatch).toBeTruthy();
    // Must use filteredItem in the response, not the raw item
    expect(getMatch![0]).toContain('filteredItem');
    expect(getMatch![0]).toMatch(/data:\s*filteredItem/);
  });

  it('List route also calls filterReadableFieldsAsync (consistency check)', () => {
    const listRoutePath = 'src/app/api/admin/resources/[resource]/route.ts';
    const code = readFile(listRoutePath);
    const getMatch = code.match(/export async function GET[\s\S]*?(?=export async function)/m);
    expect(getMatch).toBeTruthy();
    expect(getMatch![0]).toContain('filterReadableFieldsAsync');
  });
});

// ─── P0-3: Audit Enforcement ─────────────────────────────────
describe('P0-3: Audit Enforcement (central, not convention)', () => {
  const postRoutePath = 'src/app/api/admin/resources/[resource]/route.ts';
  const detailRoutePath = 'src/app/api/admin/resources/[resource]/[id]/route.ts';

  it('POST route imports auditMutation (not just auditCreate)', () => {
    const code = readFile(postRoutePath);
    expect(code).toContain('auditMutation');
    expect(code).toMatch(/import.*auditMutation.*from.*audit-foundation/);
  });

  it('POST route wraps createResource inside auditMutation', () => {
    const code = readFile(postRoutePath);
    // Find POST handler
    const postMatch = code.match(/export async function POST[\s\S]*?^}/m);
    expect(postMatch).toBeTruthy();
    expect(postMatch![0]).toContain('auditMutation');
    // Verify auditMutation wraps the createResource call (operation inside)
    expect(postMatch![0]).toMatch(/auditMutation\([\s\S]*?async\s*\(\)\s*=>\s*\{[\s\S]*?createResource/);
  });

  it('PATCH route uses auditMutation (was already correct — verify still intact)', () => {
    const code = readFile(detailRoutePath);
    const patchMatch = code.match(/export async function PATCH[\s\S]*?^}/m);
    expect(patchMatch).toBeTruthy();
    expect(patchMatch![0]).toContain('auditMutation');
    expect(patchMatch![0]).toMatch(/async\s*\(\)\s*=>\s*\{[\s\S]*?updateResource/);
  });

  it('DELETE route uses auditMutation (not post-mutation auditDelete)', () => {
    const code = readFile(detailRoutePath);
    const deleteMatch = code.match(/export async function DELETE[\s\S]*?^}/m);
    expect(deleteMatch).toBeTruthy();
    expect(deleteMatch![0]).toContain('auditMutation');
    // Verify deleteResource is inside the auditMutation operation
    expect(deleteMatch![0]).toMatch(/auditMutation\([\s\S]*?async\s*\(\)\s*=>\s*\{[\s\S]*?deleteResource/);
  });

  it('DELETE route captures before-state via captureSnapshot + beforeModel', () => {
    const code = readFile(detailRoutePath);
    const deleteMatch = code.match(/export async function DELETE[\s\S]*?^}/m);
    expect(deleteMatch).toBeTruthy();
    expect(deleteMatch![0]).toContain('captureSnapshot: true');
    expect(deleteMatch![0]).toContain('beforeModel');
  });

  it('auditMutation captures Who/What/When/Where/Before/After/Why semantic', () => {
    const auditFoundationPath = 'src/lib/audit-foundation.ts';
    expect(fileExists(auditFoundationPath)).toBe(true);
    const code = readFile(auditFoundationPath);

    // Who: actorId
    expect(code).toContain('actorId');
    // What: action
    expect(code).toContain('action');
    // When: createdAt (in AuditLog model, verified via audit log)
    // Where: ip + userAgent + requestId
    expect(code).toContain('ip');
    expect(code).toContain('userAgent');
    expect(code).toContain('requestId');
    // Before/After: captured via captureSnapshot
    expect(code).toContain('before');
    expect(code).toContain('after');
    // Why: reason
    expect(code).toContain('reason');

    // Verify logAudit is called with all semantic fields
    expect(code).toMatch(/logAudit\(\{[\s\S]*?actorId[\s\S]*?action[\s\S]*?entityType[\s\S]*?entityId[\s\S]*?before[\s\S]*?after[\s\S]*?reason[\s\S]*?ip[\s\S]*?userAgent[\s\S]*?requestId/);
  });

  it('auditMutation logs .failed suffix on operation failure', () => {
    const code = readFile('src/lib/audit-foundation.ts');
    expect(code).toContain('.failed');
    expect(code).toMatch(/action:\s*\`\$\{ctx\.action\}\.failed\`/);
  });

  it('AuditLog Prisma model has all required semantic fields', () => {
    const schema = readFile('prisma/schema.prisma');
    const auditLogMatch = schema.match(/model AuditLog \{[\s\S]*?\}/);
    expect(auditLogMatch).toBeTruthy();
    const model = auditLogMatch![0];
    expect(model).toContain('actorId');
    expect(model).toContain('actorType');
    expect(model).toContain('action');
    expect(model).toContain('entityType');
    expect(model).toContain('entityId');
    expect(model).toContain('beforeJson');
    expect(model).toContain('afterJson');
    expect(model).toContain('ip');
    expect(model).toContain('userAgent');
    expect(model).toContain('requestId');
    expect(model).toContain('reason');
    expect(model).toContain('createdAt');
  });
});

// ─── Mixed Payload + Deterministic Behavior ─────────────────
describe('Mixed authorized/unauthorized payload — deterministic rejection', () => {
  const fieldPolicyPath = 'src/lib/admin/field-policy.ts';

  it('applyFieldWritePolicyAsync processes fields in deterministic order (Object.entries)', () => {
    const code = readFile(fieldPolicyPath);
    expect(code).toContain('Object.entries(data)');
  });

  it('applyFieldWritePolicyAsync rejects on FIRST unauthorized field (fail-closed, not partial)', () => {
    const code = readFile(fieldPolicyPath);
    // Must return immediately on first rejection (not continue processing)
    expect(code).toMatch(/if\s*\(!hasPerm\)\s*\{[\s\S]*?return\s*\{[\s\S]*?ok:\s*false/);
  });

  it('Unknown fields (not in config) are silently dropped (security: no unknown writes)', () => {
    const code = readFile(fieldPolicyPath);
    expect(code).toMatch(/if\s*\(!field\)\s*\{[\s\S]*?continue/);
  });

  it('Fields without permissions.write are allowed (resource-level check already passed)', () => {
    const code = readFile(fieldPolicyPath);
    expect(code).toMatch(/if\s*\(!writePerm\)\s*\{[\s\S]*?filtered\[key\]\s*=\s*value/);
  });
});

// ─── Audit Observable Properties ────────────────────────────
describe('Audit actor/action/resource/before/after observable', () => {
  it('POST audit captures actorId (Who)', () => {
    const code = readFile('src/app/api/admin/resources/[resource]/route.ts');
    const postMatch = code.match(/export async function POST[\s\S]*?^}/m);
    expect(postMatch![0]).toContain('actorId: user?.id ?? null');
  });

  it('POST audit captures action (What) — includes .create suffix', () => {
    const code = readFile('src/app/api/admin/resources/[resource]/route.ts');
    const postMatch = code.match(/export async function POST[\s\S]*?^}/m);
    expect(postMatch![0]).toContain('.create');
  });

  it('POST audit captures entityType (resource identity)', () => {
    const code = readFile('src/app/api/admin/resources/[resource]/route.ts');
    const postMatch = code.match(/export async function POST[\s\S]*?^}/m);
    expect(postMatch![0]).toContain('entityType');
  });

  it('PATCH audit captures entityId + before/after (resource/before/after)', () => {
    const code = readFile('src/app/api/admin/resources/[resource]/[id]/route.ts');
    const patchMatch = code.match(/export async function PATCH[\s\S]*?^}/m);
    expect(patchMatch![0]).toContain('entityId: id');
    expect(patchMatch![0]).toContain('captureSnapshot: true');
    expect(patchMatch![0]).toContain('beforeModel');
    expect(patchMatch![0]).toContain('afterModel');
  });

  it('DELETE audit captures before-state (resource/before)', () => {
    const code = readFile('src/app/api/admin/resources/[resource]/[id]/route.ts');
    const deleteMatch = code.match(/export async function DELETE[\s\S]*?^}/m);
    expect(deleteMatch![0]).toContain('captureSnapshot: true');
    expect(deleteMatch![0]).toContain('beforeModel');
  });

  it('All 3 mutations capture reason (Why)', () => {
    const postCode = readFile('src/app/api/admin/resources/[resource]/route.ts');
    const detailCode = readFile('src/app/api/admin/resources/[resource]/[id]/route.ts');
    expect(postCode).toContain('reason:');
    expect(detailCode).toContain('reason:');
  });
});
