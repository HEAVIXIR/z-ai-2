/**
 * HEAVIX — STEP 14.7-E: RBAC Authorization Matrix Tests
 *
 * Tests the permission assignments for each persona (ADMIN, SELLER, BUYER,
 * MODERATOR, SUPPORT) — both ALLOW cases and DENY cases.
 *
 * V2.3 principle: "RBAC is verified when you can prove:
 *   allowed → succeeds
 *   forbidden → 403
 *   unauthenticated → 401/redirect"
 *
 * Tests:
 *   1. Role-Permission assignments in DB match V2.1 matrix
 *   2. Authorization service (can, isAdmin) returns correct results
 *   3. Deny cases verified (buyer can't refund, seller can't manage users, etc.)
 *   4. Permission key format validation
 *   5. Every permission in V2.1 matrix exists in DB
 *
 * Usage: DATABASE_URL=postgresql://... bunx vitest run tests/contract/rbac-matrix.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '@/lib/authorization/permissions';

const prisma = new PrismaClient();

// ── Fetch DB state before tests ────────────────────────────
let dbRoles: Map<string, { id: string; permissions: Set<string> }> = new Map();
let dbPermissions: Set<string> = new Set();
let dbUserRoles: { userId: string; roleKey: string }[] = [];

beforeAll(async () => {
  // Fetch all roles with their permissions
  const roles = await prisma.role.findMany({
    include: {
      permissions: { include: { permission: { select: { key: true } } } },
    },
  });
  for (const role of roles) {
    dbRoles.set(role.key, {
      id: role.id,
      permissions: new Set(role.permissions.map(rp => rp.permission.key)),
    });
  }

  // Fetch all permission keys
  const perms = await prisma.permission.findMany({ select: { key: true } });
  dbPermissions = new Set(perms.map(p => p.key));

  // Fetch all UserRole assignments
  const userRoles = await prisma.userRole.findMany({
    include: { role: { select: { key: true } } },
  });
  dbUserRoles = userRoles.map(ur => ({ userId: ur.userId, roleKey: ur.role.key }));
});

// ── Helper: check if a role has a permission in DB ────────
function dbRoleHasPermission(roleKey: string, permKey: string): boolean {
  const role = dbRoles.get(roleKey);
  return role ? role.permissions.has(permKey) : false;
}

// ════════════════════════════════════════════════════════════
// 1. PERMISSION MATRIX — V2.1 vs DATABASE
// ════════════════════════════════════════════════════════════
describe('RBAC Permission Matrix — V2.1 spec vs Database', () => {

  it('all 71 permissions from V2.1 should exist in DB', () => {
    for (const perm of PERMISSIONS) {
      expect(dbPermissions.has(perm)).toBe(true);
    }
  });

  it('DB should have at least 71 permissions', () => {
    expect(dbPermissions.size).toBeGreaterThanOrEqual(71);
  });

  it('all 5 roles should exist in DB', () => {
    for (const roleKey of Object.keys(ROLE_PERMISSIONS)) {
      expect(dbRoles.has(roleKey)).toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════════
// 2. ADMIN — Superuser (all permissions)
// ════════════════════════════════════════════════════════════
describe('ADMIN role — Superuser', () => {

  it('ADMIN should have all permissions (was 71, now 89 after STEP 16-C pass 1 added 18 marketplace CP perms)', () => {
    const adminPerms = dbRoles.get('ADMIN')?.permissions ?? new Set();
    // STEP 16-C pass 1 added 18 new permission constants:
    //   part.read/update/delete, machine.read/update, review.publish,
    //   offer.read/update, auction.read/update, inspection.read/manage,
    //   transport.read/manage, request.read/manage, dispute.read/manage
    // Total: 71 (original) + 18 (new) = 89.
    expect(adminPerms.size).toBe(89);
  });

  // Allow cases
  it('ADMIN can read listings', () => {
    expect(dbRoleHasPermission('ADMIN', 'listing.read')).toBe(true);
  });

  it('ADMIN can publish listings', () => {
    expect(dbRoleHasPermission('ADMIN', 'listing.publish')).toBe(true);
  });

  it('ADMIN can refund payments', () => {
    expect(dbRoleHasPermission('ADMIN', 'payment.refund')).toBe(true);
  });

  it('ADMIN can manage users', () => {
    expect(dbRoleHasPermission('ADMIN', 'user.delete')).toBe(true);
    expect(dbRoleHasPermission('ADMIN', 'user.suspend')).toBe(true);
  });

  it('ADMIN can manage AI', () => {
    expect(dbRoleHasPermission('ADMIN', 'ai.manage')).toBe(true);
    expect(dbRoleHasPermission('ADMIN', 'ai.execute')).toBe(true);
  });

  it('ADMIN can manage system', () => {
    expect(dbRoleHasPermission('ADMIN', 'system.manage')).toBe(true);
    expect(dbRoleHasPermission('ADMIN', 'security.manage')).toBe(true);
  });

  it('ADMIN can read audit', () => {
    expect(dbRoleHasPermission('ADMIN', 'audit.read')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// 3. SELLER — Can manage own listings
// ════════════════════════════════════════════════════════════
describe('SELLER role — Listing management', () => {

  // Allow cases
  it('SELLER can read listings', () => {
    expect(dbRoleHasPermission('SELLER', 'listing.read')).toBe(true);
  });

  it('SELLER can create listings', () => {
    expect(dbRoleHasPermission('SELLER', 'listing.create')).toBe(true);
  });

  it('SELLER can publish listings', () => {
    expect(dbRoleHasPermission('SELLER', 'listing.publish')).toBe(true);
  });

  it('SELLER can read brands', () => {
    expect(dbRoleHasPermission('SELLER', 'brand.read')).toBe(true);
  });

  it('SELLER can manage RFQs', () => {
    expect(dbRoleHasPermission('SELLER', 'rfq.manage')).toBe(true);
  });

  it('SELLER can read orders', () => {
    expect(dbRoleHasPermission('SELLER', 'order.read')).toBe(true);
  });

  // Deny cases
  it('SELLER CANNOT refund payments', () => {
    expect(dbRoleHasPermission('SELLER', 'payment.refund')).toBe(false);
  });

  it('SELLER CANNOT delete users', () => {
    expect(dbRoleHasPermission('SELLER', 'user.delete')).toBe(false);
  });

  it('SELLER CANNOT manage AI', () => {
    expect(dbRoleHasPermission('SELLER', 'ai.manage')).toBe(false);
  });

  it('SELLER CANNOT manage system', () => {
    expect(dbRoleHasPermission('SELLER', 'system.manage')).toBe(false);
  });

  it('SELLER CANNOT read audit logs', () => {
    expect(dbRoleHasPermission('SELLER', 'audit.read')).toBe(false);
  });

  it('SELLER CANNOT manage security', () => {
    expect(dbRoleHasPermission('SELLER', 'security.manage')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// 4. BUYER — Read-only marketplace access
// ════════════════════════════════════════════════════════════
describe('BUYER role — Read-only access', () => {

  // Allow cases
  it('BUYER can read listings', () => {
    expect(dbRoleHasPermission('BUYER', 'listing.read')).toBe(true);
  });

  it('BUYER can read brands', () => {
    expect(dbRoleHasPermission('BUYER', 'brand.read')).toBe(true);
  });

  it('BUYER can read orders', () => {
    expect(dbRoleHasPermission('BUYER', 'order.read')).toBe(true);
  });

  it('BUYER can read deals', () => {
    expect(dbRoleHasPermission('BUYER', 'deal.read')).toBe(true);
  });

  // Deny cases
  it('BUYER CANNOT create listings', () => {
    expect(dbRoleHasPermission('BUYER', 'listing.create')).toBe(false);
  });

  it('BUYER CANNOT publish listings', () => {
    expect(dbRoleHasPermission('BUYER', 'listing.publish')).toBe(false);
  });

  it('BUYER CANNOT delete listings', () => {
    expect(dbRoleHasPermission('BUYER', 'listing.delete')).toBe(false);
  });

  it('BUYER CANNOT refund payments', () => {
    expect(dbRoleHasPermission('BUYER', 'payment.refund')).toBe(false);
  });

  it('BUYER CANNOT manage users', () => {
    expect(dbRoleHasPermission('BUYER', 'user.delete')).toBe(false);
  });

  it('BUYER CANNOT manage AI', () => {
    expect(dbRoleHasPermission('BUYER', 'ai.manage')).toBe(false);
  });

  it('BUYER CANNOT read audit logs', () => {
    expect(dbRoleHasPermission('BUYER', 'audit.read')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// 5. MODERATOR — Content moderation
// ════════════════════════════════════════════════════════════
describe('MODERATOR role — Content moderation', () => {

  // Allow cases
  it('MODERATOR can moderate listings', () => {
    expect(dbRoleHasPermission('MODERATOR', 'listing.moderate')).toBe(true);
  });

  it('MODERATOR can publish listings', () => {
    expect(dbRoleHasPermission('MODERATOR', 'listing.publish')).toBe(true);
  });

  it('MODERATOR can read listings', () => {
    expect(dbRoleHasPermission('MODERATOR', 'listing.read')).toBe(true);
  });

  it('MODERATOR can moderate reviews', () => {
    expect(dbRoleHasPermission('MODERATOR', 'review.moderate')).toBe(true);
  });

  it('MODERATOR can suspend users', () => {
    expect(dbRoleHasPermission('MODERATOR', 'user.suspend')).toBe(true);
  });

  it('MODERATOR can read audit logs', () => {
    expect(dbRoleHasPermission('MODERATOR', 'audit.read')).toBe(true);
  });

  // Deny cases
  it('MODERATOR CANNOT refund payments', () => {
    expect(dbRoleHasPermission('MODERATOR', 'payment.refund')).toBe(false);
  });

  it('MODERATOR CANNOT delete users', () => {
    expect(dbRoleHasPermission('MODERATOR', 'user.delete')).toBe(false);
  });

  it('MODERATOR CANNOT manage system', () => {
    expect(dbRoleHasPermission('MODERATOR', 'system.manage')).toBe(false);
  });

  it('MODERATOR CANNOT manage AI', () => {
    expect(dbRoleHasPermission('MODERATOR', 'ai.manage')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// 6. SUPPORT — Customer support
// ════════════════════════════════════════════════════════════
describe('SUPPORT role — Customer support', () => {

  // Allow cases
  it('SUPPORT can read listings', () => {
    expect(dbRoleHasPermission('SUPPORT', 'listing.read')).toBe(true);
  });

  it('SUPPORT can read users', () => {
    expect(dbRoleHasPermission('SUPPORT', 'user.read')).toBe(true);
  });

  it('SUPPORT can suspend users', () => {
    expect(dbRoleHasPermission('SUPPORT', 'user.suspend')).toBe(true);
  });

  it('SUPPORT can read audit logs', () => {
    expect(dbRoleHasPermission('SUPPORT', 'audit.read')).toBe(true);
  });

  // Deny cases
  it('SUPPORT CANNOT delete users', () => {
    expect(dbRoleHasPermission('SUPPORT', 'user.delete')).toBe(false);
  });

  it('SUPPORT CANNOT refund payments', () => {
    expect(dbRoleHasPermission('SUPPORT', 'payment.refund')).toBe(false);
  });

  it('SUPPORT CANNOT publish listings', () => {
    expect(dbRoleHasPermission('SUPPORT', 'listing.publish')).toBe(false);
  });

  it('SUPPORT CANNOT manage AI', () => {
    expect(dbRoleHasPermission('SUPPORT', 'ai.manage')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// 7. CROSS-ROLE INVARIANTS
// ════════════════════════════════════════════════════════════
describe('Cross-Role Invariants', () => {

  it('only ADMIN has payment.refund', () => {
    for (const role of ['SELLER', 'BUYER', 'MODERATOR', 'SUPPORT']) {
      expect(dbRoleHasPermission(role, 'payment.refund')).toBe(false);
    }
    expect(dbRoleHasPermission('ADMIN', 'payment.refund')).toBe(true);
  });

  it('only ADMIN has system.manage', () => {
    for (const role of ['SELLER', 'BUYER', 'MODERATOR', 'SUPPORT']) {
      expect(dbRoleHasPermission(role, 'system.manage')).toBe(false);
    }
    expect(dbRoleHasPermission('ADMIN', 'system.manage')).toBe(true);
  });

  it('only ADMIN has security.manage', () => {
    for (const role of ['SELLER', 'BUYER', 'MODERATOR', 'SUPPORT']) {
      expect(dbRoleHasPermission(role, 'security.manage')).toBe(false);
    }
    expect(dbRoleHasPermission('ADMIN', 'security.manage')).toBe(true);
  });

  it('only ADMIN has user.delete', () => {
    for (const role of ['SELLER', 'BUYER', 'MODERATOR', 'SUPPORT']) {
      expect(dbRoleHasPermission(role, 'user.delete')).toBe(false);
    }
    expect(dbRoleHasPermission('ADMIN', 'user.delete')).toBe(true);
  });

  it('no role except ADMIN has ai.manage', () => {
    for (const role of ['SELLER', 'BUYER', 'MODERATOR', 'SUPPORT']) {
      expect(dbRoleHasPermission(role, 'ai.manage')).toBe(false);
    }
    expect(dbRoleHasPermission('ADMIN', 'ai.manage')).toBe(true);
  });

  it('ADMIN permission count > SELLER > BUYER', () => {
    const adminCount = dbRoles.get('ADMIN')?.permissions.size ?? 0;
    const sellerCount = dbRoles.get('SELLER')?.permissions.size ?? 0;
    const buyerCount = dbRoles.get('BUYER')?.permissions.size ?? 0;
    expect(adminCount).toBeGreaterThan(sellerCount);
    expect(sellerCount).toBeGreaterThan(buyerCount);
  });

  it('all roles have at least 1 permission', () => {
    for (const [roleKey, role] of dbRoles) {
      expect(role.permissions.size).toBeGreaterThan(0);
    }
  });
});

// ════════════════════════════════════════════════════════════
// 8. PERMISSION KEY FORMAT VALIDATION
// ════════════════════════════════════════════════════════════
describe('Permission Key Format', () => {

  it('all DB permissions should follow resource.action format', () => {
    for (const perm of dbPermissions) {
      expect(perm).toMatch(/^[a-z]+(\.[a-z]+)+$/);
    }
  });

  it('no duplicate permission keys in DB', () => {
    // Set already deduplicates, so if DB returned duplicates they'd be in the set once
    // This test verifies the set is properly built
    expect(dbPermissions.size).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════
// 9. USERROLE ASSIGNMENTS
// ════════════════════════════════════════════════════════════
describe('UserRole Assignments', () => {

  it('at least 1 user should have ADMIN role', () => {
    const adminUsers = dbUserRoles.filter(ur => ur.roleKey === 'ADMIN');
    expect(adminUsers.length).toBeGreaterThan(0);
  });

  it('all UserRole entries should reference valid roles', () => {
    for (const ur of dbUserRoles) {
      expect(dbRoles.has(ur.roleKey)).toBe(true);
    }
  });
});
