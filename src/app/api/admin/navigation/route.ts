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
import { ADMIN_NAVIGATION_GROUPS, ADMIN_NAVIGATION_STANDALONES } from '@/lib/admin/navigation-defaults';

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

  // Preview environments may not have received the navigation seed yet.
  // Keep GET read-only: serve the canonical code registry when the DB has no
  // active navigation rows, while applying the exact same RBAC filter.
  const hasStoredNavigation =
    groups.some((group) => group.items.length > 0) || standalone.length > 0;

  type NavigationItem = {
    key: string;
    titleFa: string;
    titleEn?: string | null;
    href: string;
    icon?: string | null;
    permissionKey?: string | null;
  };
  type NavigationGroup = {
    key: string;
    titleFa: string;
    titleEn?: string | null;
    icon?: string | null;
    sortOrder: number;
    items: NavigationItem[];
  };

  const sourceGroups: NavigationGroup[] = hasStoredNavigation
    ? groups
    : ADMIN_NAVIGATION_GROUPS.map((group) => ({
        ...group,
        titleEn: group.key,
        items: group.items.map((item) => ({
          key: `${group.key}_${item.href.replace(/[^a-z0-9]/gi, '_')}`,
          titleFa: item.titleFa,
          titleEn: item.href,
          href: item.href,
          icon: item.icon ?? null,
          permissionKey: item.permissionKey ?? null,
        })),
      }));

  const sourceStandalone: NavigationItem[] = hasStoredNavigation
    ? standalone
    : ADMIN_NAVIGATION_STANDALONES;

  const filterItems = (items: NavigationItem[]) =>
    items.filter((item) => {
      if (!item.permissionKey) return true;
      return userPermissions.has(item.permissionKey);
    });

  const resultGroups = sourceGroups
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

  const resultStandalone = filterItems(sourceStandalone).map((item) => ({
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
      source: hasStoredNavigation ? "database" : "canonical-defaults",
    },
  });
}