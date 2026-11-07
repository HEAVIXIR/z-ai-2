/**
 * HEAVIX — Admin Navigation API
 * GET /api/admin/navigation
 *
 * Returns the database-driven navigation tree for authenticated users
 * who hold the explicit admin.navigation.read permission. Every item is
 * filtered by its own permissionKey. There is no legacy/session bypass.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { getUserPermissions } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }

  // The navigation endpoint itself is privileged. A valid user session
  // is not an admin grant and must never activate a legacy bypass.
  try {
    await requirePermission(user.id, 'admin.navigation.read');
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Permission denied' },
      { status: 403 },
    );
  }

  // Resolve the complete permission set for per-item filtering. Re-check
  // the gate so a permission lookup failure cannot degrade to a partial
  // or unfiltered response.
  const permissions = await getUserPermissions(user.id);
  const userPermissions = new Set(permissions);
  if (!userPermissions.has('admin.navigation.read')) {
    return NextResponse.json(
      { ok: false, error: 'Permission denied' },
      { status: 403 },
    );
  }

  const groups = await db.adminNavigationGroup.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  const standalone = await db.adminNavigationItem.findMany({
    where: { active: true, groupId: null },
    orderBy: { sortOrder: 'asc' },
  });

  const filterItems = <T extends { permissionKey: string | null }>(
    items: T[],
  ): T[] =>
    items.filter(
      (item) =>
        item.permissionKey === null ||
        userPermissions.has(item.permissionKey),
    );

  const resultGroups = groups
    .map((group) => ({
      key: group.key,
      titleFa: group.titleFa,
      titleEn: group.titleEn,
      icon: group.icon,
      sortOrder: group.sortOrder,
      items: filterItems(group.items).map((item) => ({
        key: item.key,
        titleFa: item.titleFa,
        titleEn: item.titleEn,
        href: item.href,
        icon: item.icon,
        permissionKey: item.permissionKey,
      })),
    }))
    .filter((group) => group.items.length > 0);

  const resultStandalone = filterItems(standalone).map((item) => ({
    key: item.key,
    titleFa: item.titleFa,
    titleEn: item.titleEn,
    href: item.href,
    icon: item.icon,
    permissionKey: item.permissionKey,
  }));

  return NextResponse.json({
    ok: true,
    data: {
      groups: resultGroups,
      standalone: resultStandalone,
      mode: 'rbac',
    },
  });
}
