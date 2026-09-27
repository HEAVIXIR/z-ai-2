/**
 * HEAVIX Phase 12 — Admin Navigation API
 * GET /api/admin/navigation
 *
 * Returns the DB-driven admin navigation tree (groups + items),
 * filtered by the current user's permissions.
 *
 * Legacy admin-cookie path shows ALL items (backward compat).
 * RBAC path shows only items where permissionKey is null OR
 * the user has that permission.
 *
 * TODO: add navigation-permission contract tests (Track C future)
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { getUserPermissions } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Legacy admin cookie → show everything
  const user = await getCurrentUser();
  const adminAuthed = !!user;
  if (adminAuthed) {
    try { await requirePermission(user.id, "admin.navigation.read"); } catch { /* permission denied — fall through to user check */ }
  }
  let userPermissions: Set<string> | null = null;

  if (!adminAuthed) {
    // RBAC path — check user session
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    const perms = await getUserPermissions(user.id);
    userPermissions = new Set(perms);
    // If user has no permissions at all, deny
    if (userPermissions.size === 0) {
      return NextResponse.json({ ok: false, error: 'No permissions' }, { status: 403 });
    }
  }

  // Fetch all active groups + items, ordered
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

  // Also fetch standalone items (no group)
  const standalone = await db.adminNavigationItem.findMany({
    where: { active: true, groupId: null },
    orderBy: { sortOrder: 'asc' },
  });

  // Filter items by permission (only in RBAC mode)
  const filterItems = (items: typeof groups[0]['items']) => {
    if (userPermissions === null) return items; // legacy mode — show all
    return items.filter((item) => {
      if (!item.permissionKey) return true; // no permission required
      return userPermissions!.has(item.permissionKey);
    });
  };

  // Build the response tree
  const resultGroups = groups
    .map((g) => ({
      key: g.key,
      titleFa: g.titleFa,
      titleEn: g.titleEn,
      icon: g.icon,
      sortOrder: g.sortOrder,
      items: filterItems(g.items).map((i) => ({
        key: i.key,
        titleFa: i.titleFa,
        titleEn: i.titleEn,
        href: i.href,
        icon: i.icon,
        permissionKey: i.permissionKey,
      })),
    }))
    .filter((g) => g.items.length > 0 || userPermissions === null);

  const resultStandalone = filterItems(standalone).map((i) => ({
    key: i.key,
    titleFa: i.titleFa,
    titleEn: i.titleEn,
    href: i.href,
    icon: i.icon,
    permissionKey: i.permissionKey,
  }));

  return NextResponse.json({
    ok: true,
    data: {
      groups: resultGroups,
      standalone: resultStandalone,
      mode: adminAuthed ? 'legacy' : 'rbac',
    },
  });
}
