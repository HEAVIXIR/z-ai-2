/**
 * HEAVIX — Store Rentals Detail API (PHASE-P8-TRANSACTION)
 * GET    /api/admin/store/rentals/[id] — get a rental listing + bookings
 * PATCH  /api/admin/store/rentals/[id] — update listing fields + available flag
 * DELETE /api/admin/store/rentals/[id] — hard delete (cascades bookings)
 *
 * Permission: store.read (GET) / store.manage (PATCH, DELETE).
 * NOTE: the PATCH here is a thin inline field-update (no service mutation
 * required — the listing is the static catalog row, no state machine).
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function serialize(row: any) {
  return {
    ...row,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    bookings: (row.bookings ?? []).map((b: any) => ({
      ...b,
      startDate: b.startDate?.toISOString?.() ?? null,
      endDate: b.endDate?.toISOString?.() ?? null,
      createdAt: b.createdAt?.toISOString?.() ?? null,
      updatedAt: b.updatedAt?.toISOString?.() ?? null,
    })),
    bookingCount: row._count?.bookings ?? row.bookings?.length ?? 0,
    _count: undefined,
  };
}

/* GET /api/admin/store/rentals/[id] */
export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires store.read' },
      { status: 403 },
    );
  }
  const { id } = await params;
  try {
    const listing = await storeDb.rentalListing.findUnique({
      where: { id },
      include: {
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        _count: { select: { bookings: true } },
      },
    });
    if (!listing) {
      return NextResponse.json(
        { success: false, error: 'یافت نشد' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: serialize(listing) });
  } catch (e: any) {
    console.error('[store/rentals/[id] GET] error:', e);
    return NextResponse.json(
      { success: false, error: e?.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}

/* PATCH /api/admin/store/rentals/[id] */
export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires store.manage' },
      { status: 403 },
    );
  }
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const existing = await storeDb.rentalListing.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'یافت نشد' },
        { status: 404 },
      );
    }

    const data: any = {};
    if (body.dailyRate !== undefined) {
      const v = Number(body.dailyRate);
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json(
          { success: false, error: 'نرخ روزانه نامعتبر است' },
          { status: 400 },
        );
      }
      data.dailyRate = v;
    }
    if (body.weeklyRate !== undefined) {
      const v = body.weeklyRate === null ? null : Number(body.weeklyRate);
      if (v !== null && (!Number.isFinite(v) || v < 0)) {
        return NextResponse.json(
          { success: false, error: 'نرخ هفتگی نامعتبر است' },
          { status: 400 },
        );
      }
      data.weeklyRate = v;
    }
    if (body.monthlyRate !== undefined) {
      const v = body.monthlyRate === null ? null : Number(body.monthlyRate);
      if (v !== null && (!Number.isFinite(v) || v < 0)) {
        return NextResponse.json(
          { success: false, error: 'نرخ ماهانه نامعتبر است' },
          { status: 400 },
        );
      }
      data.monthlyRate = v;
    }
    if (body.deposit !== undefined) {
      const v = body.deposit === null ? null : Number(body.deposit);
      if (v !== null && (!Number.isFinite(v) || v < 0)) {
        return NextResponse.json(
          { success: false, error: 'بیعانه نامعتبر است' },
          { status: 400 },
        );
      }
      data.deposit = v;
    }
    if (body.available !== undefined) {
      data.available = Boolean(body.available);
    }
    if (body.partId !== undefined) {
      data.partId = body.partId || null;
    }
    if (body.listingId !== undefined) {
      data.listingId = body.listingId || null;
    }
    if (body.minDuration !== undefined) {
      const v = Number(body.minDuration);
      if (!Number.isInteger(v) || v < 1) {
        return NextResponse.json(
          { success: false, error: 'حداقل مدت نامعتبر است' },
          { status: 400 },
        );
      }
      data.minDuration = v;
    }
    if (body.maxDuration !== undefined) {
      const v = body.maxDuration === null ? null : Number(body.maxDuration);
      if (v !== null && (!Number.isInteger(v) || v < (data.minDuration ?? existing.minDuration))) {
        return NextResponse.json(
          { success: false, error: 'حداکثر مدت نامعتبر است' },
          { status: 400 },
        );
      }
      data.maxDuration = v;
    }

    const updated = await storeDb.rentalListing.update({
      where: { id },
      data,
      include: {
        _count: { select: { bookings: true } },
      },
    });

    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.rental.update',
      entityType: 'RentalListing',
      entityId: id,
      before: existing,
      after: updated,
      reason: `ویرایش اجاره ${id}`,
    });

    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: any) {
    console.error('[store/rentals/[id] PATCH] error:', e);
    return NextResponse.json(
      { success: false, error: e?.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}

/* DELETE /api/admin/store/rentals/[id] — hard delete (cascades bookings) */
export async function DELETE(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires store.manage' },
      { status: 403 },
    );
  }
  const { id } = await params;
  try {
    const existing = await storeDb.rentalListing.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'یافت نشد' },
        { status: 404 },
      );
    }
    await storeDb.rentalListing.delete({ where: { id } });

    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.rental.delete',
      entityType: 'RentalListing',
      entityId: id,
      before: { dailyRate: existing.dailyRate, available: existing.available, bookingCount: existing._count.bookings },
      reason: `حذف اجاره ${id} و ${existing._count.bookings} رزرو مرتبط`,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[store/rentals/[id] DELETE] error:', e);
    return NextResponse.json(
      { success: false, error: e?.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}
