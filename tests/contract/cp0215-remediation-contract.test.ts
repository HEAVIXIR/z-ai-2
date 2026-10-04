/**
 * HEAVIX — CP-02.17-IR-01 Phase C §C.2: RE-AUTHORED CP-02.15 Contract Tests
 * PROVENANCE: RE-AUTHORED during CP-02.17-SCP-REC-01 recovery (×3 — lost three times to container restarts).
 * NOT original historical evidence.
 * Coverage: 45 tests covering CP-02.15.3/4/5/6/7/8/9/10 + RBAC Integrity
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '@/lib/authorization/permissions';
import * as fs from 'fs';

const prisma = new PrismaClient();
let dbRoles: Map<string, { id: string; permissions: Set<string> }> = new Map();
let dbPermissions: Set<string> = new Set();
let dbNavItems: { key: string; permissionKey: string | null; href: string }[] = [];

beforeAll(async () => {
  const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: { select: { key: true } } } } } });
  for (const role of roles) dbRoles.set(role.key, { id: role.id, permissions: new Set(role.permissions.map(rp => rp.permission.key)) });
  const perms = await prisma.permission.findMany({ select: { key: true } });
  dbPermissions = new Set(perms.map(p => p.key));
  dbNavItems = await prisma.adminNavigationItem.findMany({ select: { key: true, permissionKey: true, href: true } });
});

function dbRoleHasPermission(roleKey: string, permKey: string): boolean {
  const role = dbRoles.get(roleKey); return role ? role.permissions.has(permKey) : false;
}

describe('CP-02.15.4 — SUPPORT Role Canonical Reconciliation', () => {
  it('SUPPORT role exists in DB', () => { expect(dbRoles.has('SUPPORT')).toBe(true); });
  it('SUPPORT DB count == canonical (18)', () => { expect((dbRoles.get('SUPPORT')?.permissions ?? new Set()).size).toBe(ROLE_PERMISSIONS.SUPPORT.length); });
  it('every canonical SUPPORT permission exists in DB', () => { const sp = dbRoles.get('SUPPORT')?.permissions ?? new Set(); for (const p of ROLE_PERMISSIONS.SUPPORT) expect(sp.has(p)).toBe(true); });
  it('DB SUPPORT contains no non-canonical permissions', () => { const sp = dbRoles.get('SUPPORT')?.permissions ?? new Set(); const cs = new Set(ROLE_PERMISSIONS.SUPPORT); for (const p of sp) expect(cs.has(p)).toBe(true); });
  it('SUPPORT has admin.dashboard.read', () => { expect(dbRoleHasPermission('SUPPORT', 'admin.dashboard.read')).toBe(true); });
  it('SUPPORT has company.read', () => { expect(dbRoleHasPermission('SUPPORT', 'company.read')).toBe(true); });
  it('SUPPORT has order.read', () => { expect(dbRoleHasPermission('SUPPORT', 'order.read')).toBe(true); });
  it('SUPPORT has deal.read', () => { expect(dbRoleHasPermission('SUPPORT', 'deal.read')).toBe(true); });
  it('SUPPORT has part.read, machine.read, offer.read, auction.read', () => { const sp = dbRoles.get('SUPPORT')?.permissions ?? new Set(); expect(sp.has('part.read')).toBe(true); expect(sp.has('machine.read')).toBe(true); expect(sp.has('offer.read')).toBe(true); expect(sp.has('auction.read')).toBe(true); });
  it('SUPPORT has inspection.read, transport.read, request.read, dispute.read, price.read', () => { const sp = dbRoles.get('SUPPORT')?.permissions ?? new Set(); expect(sp.has('inspection.read')).toBe(true); expect(sp.has('transport.read')).toBe(true); expect(sp.has('request.read')).toBe(true); expect(sp.has('dispute.read')).toBe(true); expect(sp.has('price.read')).toBe(true); });
  it('SUPPORT still has the original 4 permissions', () => { expect(dbRoleHasPermission('SUPPORT', 'user.read')).toBe(true); expect(dbRoleHasPermission('SUPPORT', 'user.suspend')).toBe(true); expect(dbRoleHasPermission('SUPPORT', 'listing.read')).toBe(true); expect(dbRoleHasPermission('SUPPORT', 'audit.read')).toBe(true); });
});

describe('CP-02.15.5 — Navigation Permission Reconciliation', () => {
  const NON_CANONICAL = ['admin.home.manage', 'service.read', 'admin.settings.read', 'admin.menu.manage', 'media.read', 'pricing.read', 'article.read'];
  it('no nav items reference non-canonical permissionKey', () => { const cs = new Set(PERMISSIONS); expect(dbNavItems.filter(i => i.permissionKey && !cs.has(i.permissionKey)).length).toBe(0); });
  it('no nav items reference the 7 specific stale keys', () => { expect(dbNavItems.filter(i => i.permissionKey && NON_CANONICAL.includes(i.permissionKey)).length).toBe(0); });
  it('home group items use canonical admin.homepage.manage', () => { const hi = dbNavItems.filter(i => i.href.startsWith('/admin/home') || i.href === '/admin/homepage-layout'); for (const item of hi) { if (item.permissionKey) { expect(item.permissionKey).not.toBe('admin.home.manage'); expect(PERMISSIONS).toContain(item.permissionKey); } } });
  it('admin menu uses admin.navigation.manage', () => { const m = dbNavItems.find(i => i.href === '/admin/menu'); if (m?.permissionKey) expect(m.permissionKey).toBe('admin.navigation.manage'); });
  it('admin services uses service.manage', () => { const s = dbNavItems.find(i => i.href === '/admin/services'); if (s?.permissionKey) expect(s.permissionKey).toBe('service.manage'); });
  it('admin media uses media.manage', () => { const m = dbNavItems.find(i => i.href === '/admin/media'); if (m?.permissionKey) expect(m.permissionKey).toBe('media.manage'); });
  it('admin price-intelligence uses price.read', () => { const p = dbNavItems.find(i => i.href === '/admin/price-intelligence'); if (p?.permissionKey) expect(p.permissionKey).toBe('price.read'); });
  it('admin articles uses content.manage', () => { const a = dbNavItems.find(i => i.href === '/admin/articles'); if (a?.permissionKey) expect(a.permissionKey).toBe('content.manage'); });
  it('admin site-stats uses admin.settings.manage', () => { const s = dbNavItems.find(i => i.href === '/admin/site-stats'); if (s?.permissionKey) expect(s.permissionKey).toBe('admin.settings.manage'); });
});

describe('CP-02.15.6 — SiteSettings Authorization Contract', () => {
  it('GET requires admin.settings.manage', () => { const s = fs.readFileSync('src/app/api/admin/site-settings/route.ts', 'utf8'); expect(s).toContain('hasPermission(sessionUser.id, "admin.settings.manage")'); });
  it('PUT requires admin.settings.manage (unified)', () => { const s = fs.readFileSync('src/app/api/admin/site-settings/route.ts', 'utf8'); const m = s.match(/hasPermission\(sessionUser\.id, "admin\.settings\.manage"\)/g) || []; expect(m.length).toBeGreaterThanOrEqual(2); });
  it('admin.settings.manage exists in DB', () => { expect(dbPermissions.has('admin.settings.manage')).toBe(true); });
});

describe('CP-02.15.7 — User API Authorization Contract', () => {
  it('POST uses user.create', () => { const s = fs.readFileSync('src/app/api/admin/users/route.ts', 'utf8'); expect(s).toContain('hasPermission(sessionUser.id, "user.create")'); expect((s.match(/hasPermission\(sessionUser\.id, "user\.suspend"\)/g) || []).length).toBe(0); });
  it('PATCH uses user.update as primary check', () => { const s = fs.readFileSync('src/app/api/admin/users/[id]/route.ts', 'utf8'); expect(s).toContain('hasPermission(sessionUser.id, "user.update")'); expect(s).toContain("Forbidden: missing permission 'user.update'"); });
  it('PATCH has additional user.suspend check for status change', () => { const s = fs.readFileSync('src/app/api/admin/users/[id]/route.ts', 'utf8'); expect(s).toContain('CP-02.15.7'); expect(s).toContain('"status" in body && body.status !== existing.status'); });
  it('user.create exists in DB', () => { expect(dbPermissions.has('user.create')).toBe(true); });
  it('user.update exists in DB', () => { expect(dbPermissions.has('user.update')).toBe(true); });
});

describe('CP-02.15.8 — Listing PATCH sellerId immutability', () => {
  it('sellerId NOT in allowedFields', () => { const s = fs.readFileSync('src/app/api/admin/listings/[id]/route.ts', 'utf8'); expect(s).toContain('CP-02.15.8: sellerId removed from allowedFields'); const m = s.match(/const allowedFields = \[([\s\S]*?)\];/); expect(m).not.toBeNull(); expect(m![1]).not.toMatch(/["']sellerId["']/); });
  it('CP-02.15.8 comment block present', () => { const s = fs.readFileSync('src/app/api/admin/listings/[id]/route.ts', 'utf8'); expect(s).toContain('privilege/ownership escalation risk'); expect(s).toContain('formal ownership'); expect(s).toContain('transfer path'); });
});

describe('CP-02.15.9 — AI Policy / Attachment Authorization', () => {
  it('GET ai-policies requires ai.read', () => { const s = fs.readFileSync('src/app/api/admin/ai-policies/[taskType]/route.ts', 'utf8'); expect(s).toContain('CP-02.15.9'); expect(s).toContain('requirePermission(user.id, "ai.read")'); });
  it('GET attachments requires media.manage', () => { const s = fs.readFileSync('src/app/api/admin/attachments/route.ts', 'utf8'); expect(s).toContain('CP-02.15.9'); expect(s).toContain('requirePermission(user.id, "media.manage")'); });
  it('ai.read exists in DB', () => { expect(dbPermissions.has('ai.read')).toBe(true); });
  it('media.manage exists in DB', () => { expect(dbPermissions.has('media.manage')).toBe(true); });
});

describe('CP-02.15.10 — Audit Path Reconciliation', () => {
  it('subscription-plans/route.ts has no local audit()', () => { const s = fs.readFileSync('src/app/api/admin/subscription-plans/route.ts', 'utf8'); expect(s).toContain('CP-02.15.10'); expect((s.match(/async function audit\(/g) || []).length).toBe(0); expect((s.match(/db\.auditLog\.create\(/g) || []).length).toBe(0); });
  it('subscription-plans/[id]/route.ts has no local audit()', () => { const s = fs.readFileSync('src/app/api/admin/subscription-plans/[id]/route.ts', 'utf8'); expect(s).toContain('CP-02.15.10'); expect((s.match(/async function audit\(/g) || []).length).toBe(0); expect((s.match(/db\.auditLog\.create\(/g) || []).length).toBe(0); });
  it('both files import logAudit from @/lib/audit', () => { const s1 = fs.readFileSync('src/app/api/admin/subscription-plans/route.ts', 'utf8'); const s2 = fs.readFileSync('src/app/api/admin/subscription-plans/[id]/route.ts', 'utf8'); expect(s1).toMatch(/import.*logAudit.*from.*@\/lib\/audit/); expect(s2).toMatch(/import.*logAudit.*from.*@\/lib\/audit/); expect(s1).toContain('logAudit({'); expect(s2).toContain('logAudit({'); });
});

describe('CP-02.15.3 — Legacy authorizeAdmin() removed', () => {
  it('admin-guard.ts does NOT export authorizeAdmin', () => { const s = fs.readFileSync('src/lib/admin-guard.ts', 'utf8'); expect(s).toContain('CP-02.15.3'); expect((s.match(/export async function authorizeAdmin\(\)/g) || []).length).toBe(0); });
  it('no route file imports authorizeAdmin from @/lib/admin-guard', () => { const walk = (dir: string): string[] => { const out: string[] = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = `${dir}/${e.name}`; if (e.isDirectory()) out.push(...walk(f)); else if (e.name === 'route.ts') out.push(f); } return out; }; for (const f of walk('src/app/api/admin')) { const s = fs.readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); expect((s.match(/[^'"]\bauthorizeAdmin\(\)/g) || []).length).toBe(0); } });
  it('all 6 former consumers use requireAdmin', () => { for (const f of ['src/app/api/admin/opportunities/route.ts', 'src/app/api/admin/ai-agents/route.ts', 'src/app/api/admin/ai-agents/[id]/route.ts', 'src/app/api/admin/jobs/route.ts', 'src/app/api/admin/jobs/[id]/route.ts', 'src/app/api/admin/alerts/match/route.ts']) { const s = fs.readFileSync(f, 'utf8'); expect(s).toContain('CP-02.15.3: migrated'); expect(s).toMatch(/import.*requireAdmin.*from.*@\/lib\/admin-guard/); expect(s).toContain('requireAdmin('); } });
  it('seo/route.ts has no local authorizeAdmin', () => { const s = fs.readFileSync('src/app/api/admin/seo/route.ts', 'utf8'); expect(s).toContain('CP-02.15.3: local authorizeAdmin() removed'); expect((s.match(/async function authorizeAdmin\(\)/g) || []).length).toBe(0); });
});

describe('RBAC Integrity — Post-CP-02.15.4', () => {
  it('all 5 roles have at least 1 permission', () => { for (const k of Object.keys(ROLE_PERMISSIONS)) expect((dbRoles.get(k)?.permissions ?? new Set()).size).toBeGreaterThan(0); });
  it('ADMIN has ALL canonical permissions', () => { const ap = dbRoles.get('ADMIN')?.permissions ?? new Set(); for (const p of PERMISSIONS) expect(ap.has(p)).toBe(true); });
  it('every role-permission binding is canonical', () => { const cs = new Set(PERMISSIONS); for (const k of Object.keys(ROLE_PERMISSIONS)) for (const p of (dbRoles.get(k)?.permissions ?? new Set())) expect(cs.has(p)).toBe(true); });
  it('no duplicate RolePermission bindings', async () => { const all = await prisma.rolePermission.findMany({ select: { roleId: true, permissionId: true } }); const seen = new Set<string>(); for (const rp of all) { const k = `${rp.roleId}:${rp.permissionId}`; expect(seen.has(k)).toBe(false); seen.add(k); } });
});
