/**
 * HEAVIX — Rental Service Layer (PHASE-P8-TRANSACTION)
 * ------------------------------------------------------------
 * Extracted business logic for the RENTAL domain — part-time leasing
 * of equipment / heavy machinery via the store.
 *
 * The RentalListing is the catalog row (rate + policy layer) and the
 * RentalBooking is the operational reservation row. The state machine:
 *
 *   REQUESTED  → (admin approve) →  APPROVED
 *   APPROVED   → (admin start)   →  ACTIVE      [requires depositPaid]
 *   ACTIVE     → (admin complete)→  COMPLETED
 *   any state  → (admin cancel)   →  CANCELLED
 *
 * Audit conventions (mirror store-procurement-service.ts):
 *   - Every state transition uses its own action verb so the audit
 *     trail records the business operation, not just the data mutation:
 *       store.rental.create
 *       store.rental.booking.request
 *       store.rental.booking.approve
 *       store.rental.start
 *       store.rental.complete
 *       store.rental.booking.cancel
 *   - Update-style audits include both `before` and `after` so the
 *     state-machine transition is reconstructable from the log alone.
 *   - All audits are best-effort (a thrown audit helper NEVER fails
 *     the service mutation).
 *
 * All DB calls go through the storeDb PrismaClient (separate SQLite
 * store schema). The route handlers stay thin: parse request, enforce
 * RBAC, call service, map thrown RentalServiceError → HTTP response.
 */

import { storeDb } from "@/lib/store-db";
import { logAudit } from "@/lib/audit";

// ── Service error (maps to HTTP status in route handler) ──
export class RentalServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RentalServiceError';
  }
}

// ── Lifecycle statuses ──────────────────────────────────────
export const RENTAL_BOOKING_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
] as const;
export type RentalBookingStatus = (typeof RENTAL_BOOKING_STATUSES)[number];

// ── Serializer (Date → ISO string for JSON transport) ────
function serializeListing(row: any) {
  return {
    ...row,
    dailyRate: row.dailyRate ?? null,
    weeklyRate: row.weeklyRate ?? null,
    monthlyRate: row.monthlyRate ?? null,
    deposit: row.deposit ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    bookings: (row.bookings ?? []).map((b: any) => serializeBooking(b)),
  };
}

function serializeBooking(b: any) {
  return {
    ...b,
    startDate: b.startDate?.toISOString?.() ?? null,
    endDate: b.endDate?.toISOString?.() ?? null,
    createdAt: b.createdAt?.toISOString?.() ?? null,
    updatedAt: b.updatedAt?.toISOString?.() ?? null,
  };
}

// ── checkAvailability ──────────────────────────────────────
/**
 * Return true iff the RentalListing is `available=true` AND there is
 * no overlapping ACTIVE or REQUESTED booking for the [startDate, endDate]
 * window (inclusive). CANCELLED or COMPLETED bookings do NOT block a
 * new request (the slot is freed).
 *
 * Validates:
 *   - listing exists + available=true
 *   - startDate < endDate
 *   - duration within [minDuration, maxDuration] of the listing
 *
 * @throws RentalServiceError on lookup (404) or validation (400).
 */
export async function checkAvailability(
  rentalListingId: string,
  startDate: Date,
  endDate: Date,
): Promise<boolean> {
  if (!rentalListingId) {
    throw new RentalServiceError(400, 'rentalListingId الزامی است');
  }
  if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new RentalServiceError(400, 'تاریخ شروع و پایان نامعتبر است');
  }
  if (endDate <= startDate) {
    throw new RentalServiceError(
      400,
      'تاریخ پایان باید بعد از تاریخ شروع باشد',
    );
  }

  const listing = await storeDb.rentalListing.findUnique({
    where: { id: rentalListingId },
  });
  if (!listing) {
    throw new RentalServiceError(404, 'اجاره‌ِ مورد نظر یافت نشد');
  }
  if (!listing.available) {
    return false;
  }

  // Duration check (day count, inclusive of both endpoints — i.e. a
  // 1-day rental is startDate===endDate shifted by 24h; we compute
  // ceil((end - start) / 86400000) so a same-day rental counts as 1).
  const ms = endDate.getTime() - startDate.getTime();
  const dayCount = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  if (dayCount < listing.minDuration) {
    return false;
  }
  if (listing.maxDuration !== null && dayCount > listing.maxDuration) {
    return false;
  }

  // Overlap check — a new booking conflicts iff an existing ACTIVE or
  // REQUESTED booking's [startDate, endDate] overlaps the requested
  // [startDate, endDate] window. We use the classic overlap test:
  //   overlap = (existing.start < new.end) && (new.start < existing.end)
  const conflicting = await storeDb.rentalBooking.findFirst({
    where: {
      rentalListingId,
      status: { in: ['ACTIVE', 'REQUESTED', 'APPROVED'] },
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    },
    select: { id: true },
  });

  return !conflicting;
}

// ── createRentalListing ────────────────────────────────────
/**
 * Create a new RentalListing (catalog row for a rentable Part or
 * HEAVIX Listing). Either partId or listingId SHOULD be provided
 * (the listing is otherwise an orphaned rate card) — but we don't
 * hard-require one so the admin can pre-provision rate cards before
 * the underlying Part/Listing is created.
 *
 * Audited as `store.rental.create`.
 *
 * @throws RentalServiceError(400) when dailyRate invalid / userId missing.
 */
export async function createRentalListing(params: {
  partId?: string | null;
  listingId?: string | null;
  dailyRate: number;
  weeklyRate?: number | null;
  monthlyRate?: number | null;
  deposit?: number | null;
  available?: boolean | null;
  minDuration?: number | null;
  maxDuration?: number | null;
  userId: string;
}): Promise<any> {
  const {
    partId = null,
    listingId = null,
    dailyRate,
    weeklyRate = null,
    monthlyRate = null,
    deposit = null,
    available = true,
    minDuration = 1,
    maxDuration = null,
    userId,
  } = params;

  if (!userId) {
    throw new RentalServiceError(400, 'userId الزامی است');
  }
  const dr = Number(dailyRate);
  if (!Number.isFinite(dr) || dr < 0) {
    throw new RentalServiceError(400, 'نرخ روزانه نامعتبر است');
  }
  const mn = Number(minDuration) || 1;
  if (!Number.isInteger(mn) || mn < 1) {
    throw new RentalServiceError(400, 'حداقل مدت باید عدد صحیح مثبت باشد');
  }
  const mx = maxDuration === null || maxDuration === undefined ? null : Number(maxDuration);
  if (mx !== null && (!Number.isInteger(mx) || mx < mn)) {
    throw new RentalServiceError(
      400,
      'حداکثر مدت باید بزرگتر یا مساوی حداقل مدت باشد',
    );
  }

  const listing = await storeDb.rentalListing.create({
    data: {
      partId: partId || null,
      listingId: listingId || null,
      dailyRate: dr,
      weeklyRate: weeklyRate === null || weeklyRate === undefined ? null : Number(weeklyRate),
      monthlyRate: monthlyRate === null || monthlyRate === undefined ? null : Number(monthlyRate),
      deposit: deposit === null || deposit === undefined ? null : Number(deposit),
      available: Boolean(available),
      minDuration: mn,
      maxDuration: mx,
    },
    include: {
      _count: { select: { bookings: true } },
    },
  });

  await logAudit({
    actorId: userId,
    actorType: 'ADMIN',
    action: 'store.rental.create',
    entityType: 'RentalListing',
    entityId: listing.id,
    after: {
      partId: listing.partId,
      listingId: listing.listingId,
      dailyRate: listing.dailyRate,
      weeklyRate: listing.weeklyRate,
      monthlyRate: listing.monthlyRate,
      deposit: listing.deposit,
      available: listing.available,
      minDuration: listing.minDuration,
      maxDuration: listing.maxDuration,
    },
    reason: `ایجاد اجاره جدید با نرخ روزانه ${dr}`,
  });

  return serializeListing(listing);
}

// ── requestBooking ─────────────────────────────────────────
/**
 * Create a new RentalBooking (status=REQUESTED) against a RentalListing.
 * Validates availability (no overlapping ACTIVE/REQUESTED/APPROVED
 * booking + duration within listing policy) + computes the total:
 *   totalAmount = dailyRate × dayCount
 *
 * `dailyRate` is snapshotted at booking time (immune to later rate
 * edits on the listing — mirrors the OrderItem.unitPrice pattern).
 *
 * Audited as `store.rental.booking.request`.
 *
 * @throws RentalServiceError on lookup (404) / availability (409) / validation (400).
 */
export async function requestBooking(params: {
  rentalListingId: string;
  customerId: string;
  startDate: Date;
  endDate: Date;
  notes?: string | null;
  userId?: string | null;
}): Promise<any> {
  const {
    rentalListingId,
    customerId,
    startDate,
    endDate,
    notes = null,
    userId = null,
  } = params;

  if (!rentalListingId || !customerId) {
    throw new RentalServiceError(400, 'rentalListingId و customerId الزامی هستند');
  }
  if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new RentalServiceError(400, 'تاریخ شروع و پایان نامعتبر است');
  }
  if (endDate <= startDate) {
    throw new RentalServiceError(
      400,
      'تاریخ پایان باید بعد از تاریخ شروع باشد',
    );
  }

  const listing = await storeDb.rentalListing.findUnique({
    where: { id: rentalListingId },
  });
  if (!listing) {
    throw new RentalServiceError(404, 'اجاره‌ِ مورد نظر یافت نشد');
  }
  if (!listing.available) {
    throw new RentalServiceError(409, 'این اجاره در دسترس نیست');
  }

  // Duration + min/max policy check.
  const ms = endDate.getTime() - startDate.getTime();
  const dayCount = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  if (dayCount < listing.minDuration) {
    throw new RentalServiceError(
      400,
      `حداقل مدت اجاره ${listing.minDuration} روز است`,
    );
  }
  if (listing.maxDuration !== null && dayCount > listing.maxDuration) {
    throw new RentalServiceError(
      400,
      `حداکثر مدت اجاره ${listing.maxDuration} روز است`,
    );
  }

  // Overlap check — same condition as checkAvailability but throws on
  // conflict so the route handler can return a clean 409.
  const conflicting = await storeDb.rentalBooking.findFirst({
    where: {
      rentalListingId,
      status: { in: ['ACTIVE', 'REQUESTED', 'APPROVED'] },
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    },
    select: { id: true },
  });
  if (conflicting) {
    throw new RentalServiceError(
      409,
      'بازه درخواستی با اجاره‌ِ دیگری هم‌پوشانی دارد',
    );
  }

  const totalAmount = Number((listing.dailyRate * dayCount).toFixed(2));

  const booking = await storeDb.rentalBooking.create({
    data: {
      rentalListingId,
      customerId,
      startDate,
      endDate,
      status: 'REQUESTED',
      dailyRate: listing.dailyRate,
      totalAmount,
      depositPaid: false,
      notes: notes || null,
    },
  });

  await logAudit({
    actorId: userId ?? customerId,
    actorType: 'USER',
    action: 'store.rental.booking.request',
    entityType: 'RentalBooking',
    entityId: booking.id,
    after: {
      rentalListingId,
      customerId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      status: 'REQUESTED',
      dailyRate: listing.dailyRate,
      totalAmount,
      dayCount,
    },
    reason: `درخواست رزرو اجاره به مدت ${dayCount} روز (مجموع: ${totalAmount})`,
  });

  return serializeBooking(booking);
}

// ── approveBooking ──────────────────────────────────────────
/**
 * Transition a booking from REQUESTED → APPROVED. Refuses if the
 * booking is not in REQUESTED state (idempotent re-approve blocked).
 *
 * Audited as `store.rental.booking.approve`.
 *
 * @throws RentalServiceError on lookup (404) / state-machine (400).
 */
export async function approveBooking(
  bookingId: string,
  userId?: string | null,
): Promise<any> {
  if (!bookingId) {
    throw new RentalServiceError(400, 'bookingId الزامی است');
  }

  const existing = await storeDb.rentalBooking.findUnique({
    where: { id: bookingId },
  });
  if (!existing) {
    throw new RentalServiceError(404, 'رزرو اجاره یافت نشد');
  }
  if (existing.status !== 'REQUESTED') {
    throw new RentalServiceError(
      400,
      `رزرو در وضعیت ${existing.status} قرار دارد و قابل تأیید نیست`,
    );
  }

  const booking = await storeDb.rentalBooking.update({
    where: { id: bookingId },
    data: { status: 'APPROVED' },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.rental.booking.approve',
    entityType: 'RentalBooking',
    entityId: bookingId,
    before: { status: existing.status },
    after: { status: booking.status },
    reason: `تأیید رزرو اجاره ${bookingId}`,
  });

  return serializeBooking(booking);
}

// ── startRental ─────────────────────────────────────────────
/**
 * Transition a booking from APPROVED → ACTIVE. This is the physical
 * handover — the customer takes possession of the equipment. We
 * require `depositPaid=true` before the transition (the admin marks
 * the deposit paid out-of-band; the store Payment flow can auto-flip
 * this in a future deepening, but for now it's a manual gate).
 *
 * Audited as `store.rental.start`.
 *
 * @throws RentalServiceError on lookup (404) / state-machine (400) / deposit (402).
 */
export async function startRental(
  bookingId: string,
  userId?: string | null,
): Promise<any> {
  if (!bookingId) {
    throw new RentalServiceError(400, 'bookingId الزامی است');
  }

  const existing = await storeDb.rentalBooking.findUnique({
    where: { id: bookingId },
  });
  if (!existing) {
    throw new RentalServiceError(404, 'رزرو اجاره یافت نشد');
  }
  if (existing.status !== 'APPROVED') {
    throw new RentalServiceError(
      400,
      `رزرو در وضعیت ${existing.status} قرار دارد و قابل شروع نیست`,
    );
  }
  if (!existing.depositPaid) {
    throw new RentalServiceError(
      402,
      'بیعانه پرداخت نشده است — اجاره قابل شروع نیست',
    );
  }

  const booking = await storeDb.rentalBooking.update({
    where: { id: bookingId },
    data: { status: 'ACTIVE' },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.rental.start',
    entityType: 'RentalBooking',
    entityId: bookingId,
    before: { status: existing.status },
    after: { status: booking.status },
    reason: `شروع اجاره ${bookingId}`,
  });

  return serializeBooking(booking);
}

// ── completeRental ──────────────────────────────────────────
/**
 * Transition a booking from ACTIVE → COMPLETED. The customer returns
 * the equipment. Idempotent re-complete blocked (COMPLETED is terminal
 * unless the booking is first re-opened — there's no re-open path here).
 *
 * Audited as `store.rental.complete`.
 *
 * @throws RentalServiceError on lookup (404) / state-machine (400).
 */
export async function completeRental(
  bookingId: string,
  userId?: string | null,
): Promise<any> {
  if (!bookingId) {
    throw new RentalServiceError(400, 'bookingId الزامی است');
  }

  const existing = await storeDb.rentalBooking.findUnique({
    where: { id: bookingId },
  });
  if (!existing) {
    throw new RentalServiceError(404, 'رزرو اجاره یافت نشد');
  }
  if (existing.status !== 'ACTIVE') {
    throw new RentalServiceError(
      400,
      `رزرو در وضعیت ${existing.status} قرار دارد و قابل اتمام نیست`,
    );
  }

  const booking = await storeDb.rentalBooking.update({
    where: { id: bookingId },
    data: { status: 'COMPLETED' },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.rental.complete',
    entityType: 'RentalBooking',
    entityId: bookingId,
    before: { status: existing.status },
    after: { status: booking.status },
    reason: `اتمام اجاره ${bookingId}`,
  });

  return serializeBooking(booking);
}

// ── cancelBooking ───────────────────────────────────────────
/**
 * Cancel a booking (any non-terminal state → CANCELLED). Idempotent
 * re-cancel refused (already-CANCELLED cannot be cancelled again).
 *
 * Audited as `store.rental.booking.cancel` with the supplied reason.
 *
 * @throws RentalServiceError on lookup (404) / state-machine (400).
 */
export async function cancelBooking(
  bookingId: string,
  reason?: string | null,
  userId?: string | null,
): Promise<any> {
  if (!bookingId) {
    throw new RentalServiceError(400, 'bookingId الزامی است');
  }

  const existing = await storeDb.rentalBooking.findUnique({
    where: { id: bookingId },
  });
  if (!existing) {
    throw new RentalServiceError(404, 'رزرو اجاره یافت نشد');
  }
  if (existing.status === 'CANCELLED') {
    throw new RentalServiceError(
      400,
      'رزرو قبلاً لغو شده است',
    );
  }
  if (existing.status === 'COMPLETED') {
    throw new RentalServiceError(
      400,
      'رزرو تکمیل‌شده قابل لغو نیست',
    );
  }

  const booking = await storeDb.rentalBooking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED' },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.rental.booking.cancel',
    entityType: 'RentalBooking',
    entityId: bookingId,
    before: { status: existing.status },
    after: { status: booking.status },
    reason: reason ? `لغو رزرو: ${reason}` : `لغو رزرو ${bookingId}`,
  });

  return serializeBooking(booking);
}
