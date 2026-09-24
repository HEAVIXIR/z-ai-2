/**
 * HEAVIX — STEP 10: Admin Preferences API
 * GET  /api/admin/preferences — get current user's preferences
 * PUT  /api/admin/preferences — update current user's preferences
 *
 * Personal scope: each user has their own AdminPreference row.
 * System defaults: if no row exists, returns defaults.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';

export const dynamic = 'force-dynamic';

const DEFAULTS = {
  theme: 'system',
  density: 'comfortable',
  locale: 'fa',
  timezone: 'Asia/Tehran',
  sidebarCollapsed: false,
  pinnedItems: null,
  hiddenItems: null,
  dashboardLayout: null,
  defaultPageSize: 25,
};

// GET — fetch user's preferences
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let prefs = await db.adminPreference.findUnique({ where: { userId: user.id } });
  if (!prefs) {
    // Create defaults for this user
    prefs = await db.adminPreference.create({
      data: { userId: user.id, ...DEFAULTS },
    });
  }

  return NextResponse.json({ ok: true, data: prefs });
}

// PUT — update user's preferences
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  return NextResponse.json({ ok: true, data: prefs });
}
