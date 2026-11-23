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

// Old scattered destinations remain valid as direct URLs from the hub, but are
// no longer emitted as independent sidebar items. This is read-only and does
// not delete or rewrite persisted navigation rows.
const LEGACY_BRAND_NAV_HREFS = new Set([
  '/admin/taxonomy/brands',
  '/admin/brand-families',
  '/admin/home/trusted-brands',
]);

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

  // Read active AND inactive rows. An inactive stored row is an intentional
  // administrator decision; a missing row is a seed gap and may use canonical
  // defaults. This repairs partial seeds without resurrecting disabled items.
  const [storedGroups, storedStandalone] = await Promise.all([
    db.adminNavigationGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
      },
    }),
    db.adminNavigationItem.findMany({
      where: { groupId: null },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

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

  const storedGroupByKey = new Map(storedGroups.map((group) => [group.key, group]));
  const canonicalGroupKeys = new Set(ADMIN_NAVIGATION_GROUPS.map((group) => group.key));
  const sourceGroups: NavigationGroup[] = [
    ...ADMIN_NAVIGATION_GROUPS.flatMap((canonical) => {
      const stored = storedGroupByKey.get(canonical.key);
      if (stored && !stored.active) return [];

      const storedItems = new Map((stored?.items ?? []).map((item) => [item.key, item]));
      const canonicalItemKeys = new Set(
        canonical.items.map((item) => `${canonical.key}_${item.href.replace(/[^a-z0-9]/gi, "_")}`),
      );
      const mergedItems: NavigationItem[] = canonical.items.flatMap((item) => {
        const key = `${canonical.key}_${item.href.replace(/[^a-z0-9]/gi, "_")}`;
        const saved = storedItems.get(key);
        if (saved && !saved.active) return [];
        return [{
          key,
          titleFa: saved?.titleFa ?? item.titleFa,
          titleEn: saved?.titleEn ?? item.href,
          href: saved?.href ?? item.href,
          icon: saved?.icon ?? item.icon ?? null,
          permissionKey: saved?.permissionKey ?? item.permissionKey ?? null,
        }];
      });
      const customItems: NavigationItem[] = (stored?.items ?? [])
        .filter((item) => item.active && !canonicalItemKeys.has(item.key) && !LEGACY_BRAND_NAV_HREFS.has(item.href))
        .map((item) => ({
          key: item.key,
          titleFa: item.titleFa,
          titleEn: item.titleEn,
          href: item.href,
          icon: item.icon,
          permissionKey: item.permissionKey,
        }));

      return [{
        key: canonical.key,
        titleFa: stored?.titleFa ?? canonical.titleFa,
        titleEn: stored?.titleEn ?? canonical.key,
        icon: stored?.icon ?? canonical.icon,
        sortOrder: stored?.sortOrder ?? canonical.sortOrder,
        items: [...mergedItems, ...customItems],
      }];
    }),
    ...storedGroups
      .filter((group) => group.active && !canonicalGroupKeys.has(group.key))
      .map((group) => ({
        key: group.key,
        titleFa: group.titleFa,
        titleEn: group.titleEn,
        icon: group.icon,
        sortOrder: group.sortOrder,
        items: group.items.filter((item) => item.active).map((item) => ({
          key: item.key,
          titleFa: item.titleFa,
          titleEn: item.titleEn,
          href: item.href,
          icon: item.icon,
          permissionKey: item.permissionKey,
        })),
      })),
  ].filter((group) => group.items.length > 0)
   .sort((a, b) => a.sortOrder - b.sortOrder);

  const canonicalStandaloneKeys = new Set(ADMIN_NAVIGATION_STANDALONES.map((item) => item.key));
  const storedStandaloneByKey = new Map(storedStandalone.map((item) => [item.key, item]));
  const sourceStandalone: NavigationItem[] = [
    ...ADMIN_NAVIGATION_STANDALONES.flatMap((canonical) => {
      const saved = storedStandaloneByKey.get(canonical.key);
      if (saved && !saved.active) return [];
      return [{
        key: canonical.key,
        titleFa: saved?.titleFa ?? canonical.titleFa,
        titleEn: saved?.titleEn ?? canonical.key,
        href: saved?.href ?? canonical.href,
        icon: saved?.icon ?? canonical.icon,
        permissionKey: saved?.permissionKey ?? canonical.permissionKey ?? null,
      }];
    }),
    ...storedStandalone
      .filter((item) => item.active && !canonicalStandaloneKeys.has(item.key) && !LEGACY_BRAND_NAV_HREFS.has(item.href))
      .map((item) => ({
        key: item.key,
        titleFa: item.titleFa,
        titleEn: item.titleEn,
        href: item.href,
        icon: item.icon,
        permissionKey: item.permissionKey,
      })),
  ];

  const hasStoredNavigation = storedGroups.length > 0 || storedStandalone.length > 0;

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
      source: hasStoredNavigation ? "merged-database-canonical" : "canonical-defaults",
    },
  });
}