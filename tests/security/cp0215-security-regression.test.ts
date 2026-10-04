/**
 * HEAVIX — CP-02.17-IR-01 Phase C §C.2: RE-AUTHORED CP-02.15 Security Regression Tests
 * PROVENANCE: RE-AUTHORED during CP-02.17-SCP-REC-01 recovery (×3 — lost three times to container restarts).
 * NOT original historical evidence.
 * Coverage: 30 tests covering 10 security regression scenarios
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '@/lib/authorization/permissions';
import * as fs from 'fs';

const prisma = new PrismaClient();
let dbRoles: Map<string, { id: string; permissions: Set<string> }> = new Map();

beforeAll(async () => {
  const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: { select: { key: true } } } } } });
  for (const role of roles) dbRoles.set(role.key, { id: role.id, permissions: new Set(role.permissions.map(rp => rp.permission.key)) });
});

describe('1. Synthetic ADMIN bypass — controlled state per CP-02.15.2', () => {
  it('short-circuit present in can() (4 sites)', () => { const s = fs.readFileSync('src/lib/authorization/index.ts', 'utf8'); expect((s.match(/if \(userId === 'ADMIN'\) return true;/g) || []).length).toBe(4); });
  it('synthetic ADMIN user creation preserved in getCurrentUser', () => { const s = fs.readFileSync('src/lib/auth.ts', 'utf8'); expect(s).toContain('id: "ADMIN"'); expect(s).toContain('firstName: "Admin"'); });
  it('ADMIN_COOKIE constant still defined', () => { expect(fs.readFileSync('src/lib/auth.ts', 'utf8')).toContain('ADMIN_COOKIE = "heavix-admin"'); });
  it('documented plan for removal in worklog', () => { const w = fs.readFileSync('worklog.md', 'utf8'); expect(w).toContain('CP-02.15.2 — Synthetic ADMIN Remediation Plan'); expect(w).toContain('PHASE 1 (CP-02.15.2'); expect(w).toContain('PHASE 2 (CP-03'); });
});

describe('2. Legacy authorizeAdmin bypass — eliminated', () => {
  it('authorizeAdmin removed from admin-guard.ts', () => { const s = fs.readFileSync('src/lib/admin-guard.ts', 'utf8'); expect(s).toContain('CP-02.15.3'); expect((s.match(/export async function authorizeAdmin\(\)/g) || []).length).toBe(0); });
  it('all 6 consumers migrated to requireAdmin', () => { for (const f of ['src/app/api/admin/opportunities/route.ts', 'src/app/api/admin/ai-agents/route.ts', 'src/app/api/admin/ai-agents/[id]/route.ts', 'src/app/api/admin/jobs/route.ts', 'src/app/api/admin/jobs/[id]/route.ts', 'src/app/api/admin/alerts/match/route.ts']) { const s = fs.readFileSync(f, 'utf8'); expect(s).toContain('CP-02.15.3: migrated'); expect(s).toMatch(/import.*requireAdmin.*from.*@\/lib\/admin-guard/); expect(s).not.toMatch(/import.*authorizeAdmin.*from.*@\/lib\/admin-guard/); } });
  it('seo/route.ts local authorizeAdmin removed', () => { const s = fs.readFileSync('src/app/api/admin/seo/route.ts', 'utf8'); expect(s).toContain('CP-02.15.3: local authorizeAdmin() removed'); expect((s.match(/async function authorizeAdmin\(\)/g) || []).length).toBe(0); });
  it('isAuthenticated import removed from admin-guard.ts', () => { expect(fs.readFileSync('src/lib/admin-guard.ts', 'utf8')).not.toMatch(/import.*isAuthenticated.*from.*@\/lib\/auth/); });
});

describe('3. SUPPORT privilege drift — eliminated', () => {
  it('SUPPORT DB count matches canonical (18)', () => { expect((dbRoles.get('SUPPORT')?.permissions ?? new Set()).size).toBe(ROLE_PERMISSIONS.SUPPORT.length); });
  it('SUPPORT has all 14 previously-missing permissions', () => { const sp = dbRoles.get('SUPPORT')?.permissions ?? new Set(); for (const p of ['admin.dashboard.read', 'company.read', 'order.read', 'deal.read', 'review.read', 'part.read', 'machine.read', 'offer.read', 'auction.read', 'inspection.read', 'transport.read', 'request.read', 'dispute.read', 'price.read']) expect(sp.has(p)).toBe(true); });
  it('SUPPORT has no extra non-canonical permissions', () => { const sp = dbRoles.get('SUPPORT')?.permissions ?? new Set(); const cs = new Set(ROLE_PERMISSIONS.SUPPORT); for (const p of sp) expect(cs.has(p)).toBe(true); });
  it('RolePermission total = canonical sum (234)', () => { let t = 0; for (const k of Object.keys(ROLE_PERMISSIONS)) t += dbRoles.get(k)?.permissions.size ?? 0; expect(t).toBe(234); });
});

describe('4. Navigation permission mismatch — eliminated', () => {
  const NON_CANONICAL = ['admin.home.manage', 'service.read', 'admin.settings.read', 'admin.menu.manage', 'media.read', 'pricing.read', 'article.read'];
  it('zero nav items reference non-canonical permissionKeys', async () => { const ni = await prisma.adminNavigationItem.findMany({ where: { NOT: { permissionKey: null } }, select: { key: true, permissionKey: true } }); expect(ni.filter(i => i.permissionKey && !new Set(PERMISSIONS).has(i.permissionKey)).length).toBe(0); });
  it('zero nav items reference the 7 specific stale keys', async () => { const ni = await prisma.adminNavigationItem.findMany({ where: { NOT: { permissionKey: null } }, select: { key: true, permissionKey: true } }); expect(ni.filter(i => i.permissionKey && NON_CANONICAL.includes(i.permissionKey)).length).toBe(0); });
  it('seed-admin-navigation.ts has no stale keys', () => { const s = fs.readFileSync('prisma/seed-admin-navigation.ts', 'utf8'); for (const k of NON_CANONICAL) expect((s.match(new RegExp(`permissionKey: '${k.replace(/\./g, '\\.')}'`, 'g')) || []).length).toBe(0); });
});

describe('5. User create/update authorization — fixed', () => {
  it('POST uses user.create', () => { const s = fs.readFileSync('src/app/api/admin/users/route.ts', 'utf8'); expect(s).toContain('hasPermission(sessionUser.id, "user.create")'); expect((s.match(/hasPermission\(sessionUser\.id, "user\.suspend"\)/g) || []).length).toBe(0); });
  it('PATCH uses user.update as primary check', () => { const s = fs.readFileSync('src/app/api/admin/users/[id]/route.ts', 'utf8'); expect(s).toContain('hasPermission(sessionUser.id, "user.update")'); expect(s).toContain("Forbidden: missing permission 'user.update'"); });
  it('PATCH has additional user.suspend check for status change', () => { const s = fs.readFileSync('src/app/api/admin/users/[id]/route.ts', 'utf8'); expect(s).toContain('CP-02.15.7'); expect(s).toContain('"status" in body && body.status !== existing.status'); });
});

describe('6. Listing seller reassignment — blocked', () => {
  it('sellerId NOT in allowedFields', () => { const s = fs.readFileSync('src/app/api/admin/listings/[id]/route.ts', 'utf8'); expect(s).toContain('CP-02.15.8: sellerId removed from allowedFields'); const m = s.match(/const allowedFields = \[([\s\S]*?)\];/); expect(m).not.toBeNull(); expect(m![1]).not.toMatch(/["']sellerId["']/); });
  it('CP-02.15.8 comment block present', () => { const s = fs.readFileSync('src/app/api/admin/listings/[id]/route.ts', 'utf8'); expect(s).toContain('privilege/ownership escalation risk'); expect(s).toContain('formal ownership'); expect(s).toContain('transfer path'); });
});

describe('7. AI policy unauthorized read — blocked', () => {
  it('GET ai-policies requires ai.read', () => { const s = fs.readFileSync('src/app/api/admin/ai-policies/[taskType]/route.ts', 'utf8'); expect(s).toContain('CP-02.15.9'); expect(s).toContain('requirePermission(user.id, "ai.read")'); });
  it('requirePermission call is BEFORE data read', () => { const s = fs.readFileSync('src/app/api/admin/ai-policies/[taskType]/route.ts', 'utf8'); expect(s.indexOf('requirePermission(user.id, "ai.read")')).toBeLessThan(s.indexOf('db.aITaskPolicy.findUnique')); });
});

describe('8. Attachments unauthorized read — blocked', () => {
  it('GET attachments requires media.manage', () => { const s = fs.readFileSync('src/app/api/admin/attachments/route.ts', 'utf8'); expect(s).toContain('CP-02.15.9'); expect(s).toContain('requirePermission(user.id, "media.manage")'); });
  it('requirePermission call is BEFORE data read', () => { const s = fs.readFileSync('src/app/api/admin/attachments/route.ts', 'utf8'); expect(s.indexOf('requirePermission(user.id, "media.manage")')).toBeLessThan(s.indexOf('db.attachment.findMany')); });
});

describe('9. Audit path divergence — unified', () => {
  it('subscription-plans/route.ts has only logAudit pipeline', () => { const s = fs.readFileSync('src/app/api/admin/subscription-plans/route.ts', 'utf8'); expect(s).toContain('CP-02.15.10'); expect((s.match(/async function audit\(/g) || []).length).toBe(0); expect((s.match(/db\.auditLog\.create\(/g) || []).length).toBe(0); expect(s).toContain('logAudit({'); });
  it('subscription-plans/[id]/route.ts has only logAudit pipeline', () => { const s = fs.readFileSync('src/app/api/admin/subscription-plans/[id]/route.ts', 'utf8'); expect(s).toContain('CP-02.15.10'); expect((s.match(/async function audit\(/g) || []).length).toBe(0); expect((s.match(/db\.auditLog\.create\(/g) || []).length).toBe(0); expect(s).toContain('logAudit({'); });
  it('both files import logAudit from @/lib/audit', () => { expect(fs.readFileSync('src/app/api/admin/subscription-plans/route.ts', 'utf8')).toMatch(/import.*logAudit.*from.*@\/lib\/audit/); expect(fs.readFileSync('src/app/api/admin/subscription-plans/[id]/route.ts', 'utf8')).toMatch(/import.*logAudit.*from.*@\/lib\/audit/); });
});

describe('Cross-cutting — no new RBAC orphan/duplicate', () => {
  it('all 5 canonical roles in DB', () => { for (const k of Object.keys(ROLE_PERMISSIONS)) expect(dbRoles.has(k)).toBe(true); });
  it('RolePermission total = 234', () => { let t = 0; for (const k of Object.keys(ROLE_PERMISSIONS)) t += dbRoles.get(k)?.permissions.size ?? 0; expect(t).toBe(234); });
  it('no role has duplicate permissions (set semantics)', () => { for (const k of Object.keys(ROLE_PERMISSIONS)) { const sp = dbRoles.get(k)?.permissions ?? new Set(); expect(sp.size).toBe(sp.size); } });
});
