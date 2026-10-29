/**
 * HEAVIX — STEP 10: Admin Preferences API
 * GET  /api/admin/preferences — get current user's preferences
 * PUT  /api/admin/preferences — update current user's preferences
 *
 * Personal scope: each user has their own AdminPreference row.
 * System defaults: if no row exists, returns defaults.
 *
 * Track C — CP Foundation Gap (2025-09):
 *   Removed legacy `@ts-nocheck`; enforced `admin.preferences.read`
 *   on GET and `admin.preferences.manage` on PUT using the Store 2A
 *   getCurrentUser + requirePermission pattern.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Initial values used when a user has no AdminPreference row yet.
// Nullable JSON columns (`pinnedItems`, `hiddenItems`, `dashboardLayout`)
// must use the Prisma JSON-null sentinel rather than the literal `null`
// (Prisma 6 rejects raw null on `Json?` create inputs — see TS2322).
const DEFAULTS = {
  theme: 'system',
  density: 'comfortable',
  locale: 'fa',
  timezone: 'Asia/Tehran',
  sidebarCollapsed: false,
  pinnedItems: Prisma.DbNull,
  hiddenItems: Prisma.DbNull,
  dashboardLayout: Prisma.DbNull,
  defaultPageSize: 25,
};

// GET — fetch user's preferences
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await requirePermission(user.id, 'admin.preferences.read');
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires admin.preferences.read' },
      { status: 403 },
    );
  }

  let prefs = await db.adminPreference.findUnique({ where: { userId: user.id } });
  if (!prefs) {
    // Create defaults for this user
    prefs = await db.adminPreference.create({
      data: { userId: user.id, ...DEFAULTS },
    });
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "admin.preferences.create",
      entityType: "AdminPreference",
      entityId: prefs.id,
      after: { userId: prefs.userId, theme: prefs.theme, locale: prefs.locale },
      reason: "via admin API",
    });
  }

  return NextResponse.json({ ok: true, data: prefs });
}

// PUT — update user's preferences
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await requirePermission(user.id, 'admin.preferences.manage');
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires admin.preferences.manage' },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  // Only allow specific fields to be updated
  const allowedFields = [
    'theme', 'density', 'locale', 'timezone',
    'sidebarCollapsed', 'pinnedItems', 'hiddenItems',
    'dashboardLayout', 'defaultPageSize',
  ];
  const updateData: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) updateData[key] = body[key];
  }

  const prefs = await db.adminPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...DEFAULTS, ...updateData },
    update: updateData,
  });

  await logAudit({
    actorId: user.id,
    actorType: "ADMIN",
    action: "admin.preferences.upsert",
    entityType: "AdminPreference",
    entityId: prefs.id,
    after: { userId: prefs.userId, theme: prefs.theme, locale: prefs.locale, density: prefs.density, defaultPageSize: prefs.defaultPageSize },
    reason: "via admin API",
  });

  return NextResponse.json({ ok: true, data: prefs });
}
