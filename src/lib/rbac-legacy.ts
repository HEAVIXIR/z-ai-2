/**
 * HEAVIX — Legacy RBAC helpers (kept for backward compatibility)
 *
 * getUserPermissions: resolves User → UserRole → Role → RolePermission → Permission
 * ForbiddenError: HTTP 403 error class
 *
 * The canonical authorization module is at src/lib/authorization/
 */

import { db } from '@/lib/db';

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  try {
    const userRoles = await db.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            permissions: {
              select: { permission: { select: { key: true } } },
            },
          },
        },
      },
    });

    const set = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.permissions) {
        set.add(rp.permission.key);
      }
    }
    return Array.from(set);
  } catch (err) {
    console.error('[rbac] getUserPermissions failed:', err);
    return [];
  }
}
