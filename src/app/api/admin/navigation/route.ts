/**
 * HEAVIX Phase 12 — Admin Navigation API
 * GET /api/admin/navigation
 *
 * Returns the DB-driven admin navigation tree filtered by the
 * authenticated user's canonical RBAC permissions. No legacy
 * cookie or unrestricted navigation fallback is permitted.
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
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  try {
    await requirePermission(user.id, "admin.navigation.read");
  } catch {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const userPermissions = new Set(await getUserPermissions(user.id));
  if (userPermissions.size === 0) {
    return NextResponse.json(
      { ok: false, error: "No permissions" },
      { status: 403 },
    );
  }

  const groups = await db.adminNavigationGroup.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  const standalone = await db.adminNavigationItem.findMany({
    where: { active: true, groupId: null },
    orderBy: { sortOrder: "asc" },
  });

  const filterItems = (items: typeof groups[number]["items"]) =>
    items.filter((item) => {
      if (!item.permissionKey) return true;
      return userPermissions.has(item.permissionKey);
    });

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
      mode: "rbac",
    },
  });
}