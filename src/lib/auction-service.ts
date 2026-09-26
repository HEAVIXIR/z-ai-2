/**
 * HEAVIX — Auction Service Layer (PHASE-P8-TRANSACTION)
 * ------------------------------------------------------------
 * Extracted business logic for the AUCTION domain — the existing
 * Auction + AuctionBid models (main HEAVIX schema, BigInt prices).
 *
 * Responsibilities:
 *   - createAuction({ listingId, startTime, endTime, startPrice,
 *       reservePrice?, userId })
 *       Create an Auction in SCHEDULED state against an existing
 *       Listing. Maps the task-spec field names (startTime/endTime)
 *       onto the actual schema fields (startDate/endDate). Computes
 *       a sensible minIncrement from startPrice (10% by default).
 *       Audited as `marketplace.auction.create`.
 *
 *   - placeBid(auctionId, bidderId, amount)
 *       Validate the auction is LIVE + amount > current leading bid +
 *       persist (demote prior leading bid). Audited as
 *       `marketplace.auction.bid`.
 *
 *   - endAuction(auctionId, userId)
 *       Find highest bid; if it >= reservePrice, set winner + winningBid
 *       + flag the bid `isWinning=true`; flip auction status to ENDED.
 *       No-reserve: highest bid always wins. No-bids: status → ENDED
 *       with no winner. Audited as `marketplace.auction.end`.
 *
 *   - getAuctionDetail(auctionId)
 *       Return auction + listing + bids (ordered desc by amount).
 *
 * Audit conventions (mirror wanted-service.ts):
 *   - Action keys: `marketplace.auction.create` | `marketplace.auction.bid`
 *     | `marketplace.auction.end`.
 *   - entityType: `Auction`.
 *   - actorType: `ADMIN` for create/end; `USER` for bid.
 *   - All audits are best-effort (a thrown audit helper NEVER fails
 *     the service mutation).
 *
 * All DB calls go through the main HEAVIX PrismaClient (db) — the
 * Auction model lives in the main schema, NOT in store-schema.
 */

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";

// ── Service error (maps to HTTP status in route handler) ──
export class AuctionServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuctionServiceError';
  }
}

// ── Serializer (BigInt → string for JSON transport) ────
function serializeAuction(a: any) {
  return {
    ...a,
    startPrice: a.startPrice?.toString?.() ?? null,
    reservePrice: a.reservePrice?.toString?.() ?? null,
    minIncrement: a.minIncrement?.toString?.() ?? null,
    winningBid: a.winningBid?.toString?.() ?? null,
    startDate: a.startDate?.toISOString?.() ?? null,
    endDate: a.endDate?.toISOString?.() ?? null,
    createdAt: a.createdAt?.toISOString?.() ?? null,
    updatedAt: a.updatedAt?.toISOString?.() ?? null,
    bids: (a.bids ?? []).map((b: any) => ({
      ...b,
      amount: b.amount?.toString?.() ?? null,
      createdAt: b.createdAt?.toISOString?.() ?? null,
    })),
    listing: a.listing
      ? {
          ...a.listing,
          price: a.listing.price ? a.listing.price.toString() : null,
        }
      : a.listing,
  };
}

// ── Helper: coerce a value into a BigInt (or null on failure) ──
function toBigInt(v: unknown): bigint | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number') return BigInt(Math.trunc(v));
    const s = String(v).replace(/[^\d-]/g, '');
    if (s === '' || s === '-') return null;
    return BigInt(s);
  } catch {
    return null;
  }
}

// ── createAuction ──────────────────────────────────────────
/**
 * Create a new Auction (status=SCHEDULED) against an existing Listing.
 *
 * Field mapping (task-spec → schema):
 *   - listingId    → Auction.listingId (required, references Listing)
 *   - startTime    → Auction.startDate (the schema field is `startDate`
 *                    but it's a DateTime; we treat it as the auction's
 *                    start time-of-day too)
 *   - endTime      → Auction.endDate
 *   - startPrice   → Auction.startPrice (BigInt)
 *   - reservePrice → Auction.reservePrice (BigInt?, optional)
 *   - userId       → actorId on the audit log
 *
 * We also synthesize:
 *   - title       = Listing.title (the schema requires a title)
 *   - minIncrement = max(100, ceil(startPrice * 0.1)) — a sensible
 *                   default of 10% of start price, min 100 Toman.
 *
 * @throws AuctionServiceError(400) on validation/lookup failure.
 * @throws AuctionServiceError(404) when listing doesn't exist.
 */
export async function createAuction(params: {
  listingId: string;
  startTime: Date;
  endTime: Date;
  startPrice: bigint | number | string;
  reservePrice?: bigint | number | string | null;
  userId: string;
}): Promise<any> {
  const {
    listingId,
    startTime,
    endTime,
    startPrice,
    reservePrice = null,
    userId,
  } = params;

  if (!listingId) {
    throw new AuctionServiceError(400, 'listingId الزامی است');
  }
  if (!userId) {
    throw new AuctionServiceError(400, 'userId الزامی است');
  }
  if (!startTime || !endTime || isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    throw new AuctionServiceError(400, 'زمان شروع/پایان نامعتبر است');
  }
  if (endTime <= startTime) {
    throw new AuctionServiceError(
      400,
      'زمان پایان باید بعد از زمان شروع باشد',
    );
  }
  const sp = toBigInt(startPrice);
  if (sp === null || sp <= 0n) {
    throw new AuctionServiceError(400, 'قیمت شروع نامعتبر است');
  }
  const rp = reservePrice === null || reservePrice === undefined ? null : toBigInt(reservePrice);
  if (rp !== null && rp < 0n) {
    throw new AuctionServiceError(400, 'قیمت رزرو نامعتبر است');
  }

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, title: true, price: true, status: true },
  });
  if (!listing) {
    throw new AuctionServiceError(404, 'آگهی یافت نشد');
  }

  // minIncrement = max(100, ceil(startPrice * 0.1))
  const minIncrement = (() => {
    const tenPct = (sp * 10n) / 100n;
    return tenPct < 100n ? 100n : tenPct;
  })();

  const auction = await db.auction.create({
    data: {
      listingId,
      title: listing.title,
      description: null,
      startPrice: sp,
      reservePrice: rp,
      minIncrement,
      startDate: startTime,
      endDate: endTime,
      status: 'SCHEDULED',
    },
    include: {
      listing: { select: { id: true, title: true, slug: true, price: true } },
    },
  });

  await logAudit({
    actorId: userId,
    actorType: 'ADMIN',
    action: 'marketplace.auction.create',
    entityType: 'Auction',
    entityId: auction.id,
    after: {
      listingId,
      startDate: startTime.toISOString(),
      endDate: endTime.toISOString(),
      startPrice: sp.toString(),
      reservePrice: rp ? rp.toString() : null,
      minIncrement: minIncrement.toString(),
      status: 'SCHEDULED',
    },
    reason: `ایجاد مزایده برای آگهی ${listing.title}`,
  });

  return serializeAuction(auction);
}

// ── placeBid ──────────────────────────────────────────────
/**
 * Place a bid on an auction. Validates:
 *   - auction exists + status is LIVE (SCHEDULED/ENDED/CANCELLED refused)
 *   - current time is within [startDate, endDate]
 *   - amount > current leading bid (or startPrice if no bids) + minIncrement
 *   - bidder is resolved from the session (bidderId is the User.id)
 *
 * Demotes any prior `isWinning=true` bid + flags the new bid as winning.
 * Audited as `marketplace.auction.bid`.
 *
 * @throws AuctionServiceError(400) on validation/state-machine failure.
 * @throws AuctionServiceError(404) when auction doesn't exist.
 */
export async function placeBid(
  auctionId: string,
  bidderId: string,
  amount: bigint | number | string,
): Promise<any> {
  if (!auctionId) {
    throw new AuctionServiceError(400, 'auctionId الزامی است');
  }
  if (!bidderId) {
    throw new AuctionServiceError(401, 'برای شرکت در مزایده باید وارد شوید');
  }
  const amt = toBigInt(amount);
  if (amt === null || amt <= 0n) {
    throw new AuctionServiceError(400, 'مبلغ پیشنهاد نامعتبر است');
  }

  const auction = await db.auction.findUnique({
    where: { id: auctionId },
    include: {
      bids: {
        orderBy: { amount: 'desc' },
        take: 1,
        select: { id: true, amount: true, bidderId: true, isWinning: true },
      },
    },
  });
  if (!auction) {
    throw new AuctionServiceError(404, 'مزایده یافت نشد');
  }

  const now = new Date();
  if (auction.status === 'CANCELLED') {
    throw new AuctionServiceError(400, 'این مزایده لغو شده است');
  }
  if (auction.status === 'ENDED' || now > auction.endDate) {
    throw new AuctionServiceError(400, 'مزایده پایان یافته است');
  }
  if (now < auction.startDate) {
    throw new AuctionServiceError(400, 'مزایده هنوز آغاز نشده است');
  }

  const leading = auction.bids[0];
  const currentHighest = leading ? leading.amount : auction.startPrice;
  const minNext = currentHighest + auction.minIncrement;
  if (amt < minNext) {
    throw new AuctionServiceError(
      400,
      `مبلغ پیشنهاد باید حداقل ${minNext.toLocaleString('fa-IR')} تومان باشد`,
    );
  }

  // Demote prior winning bid (if any).
  if (leading && leading.isWinning) {
    await db.auctionBid.update({
      where: { id: leading.id },
      data: { isWinning: false },
    });
  }

  // Resolve bidder display fields (best-effort — never blocks the bid).
  let bidderName = '';
  let bidderPhone = '';
  try {
    const u = await db.user.findUnique({
      where: { id: bidderId },
      select: { id: true, firstName: true, lastName: true, mobile: true },
    });
    if (u) {
      bidderName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.mobile || '';
      bidderPhone = u.mobile || '';
    }
  } catch {
    /* non-fatal */
  }

  const bid = await db.auctionBid.create({
    data: {
      auctionId: auction.id,
      bidderName: bidderName || `کاربر ${bidderId.slice(-6)}`,
      bidderPhone: bidderPhone || '',
      bidderId,
      amount: amt,
      isWinning: true,
    },
  });

  await logAudit({
    actorId: bidderId,
    actorType: 'USER',
    action: 'marketplace.auction.bid',
    entityType: 'AuctionBid',
    entityId: bid.id,
    after: {
      auctionId: auction.id,
      bidderId,
      amount: amt.toString(),
      previousHigh: currentHighest.toString(),
      minNext: minNext.toString(),
      isWinning: true,
    },
    reason: `پیشنهاد ${amt.toString()} تومان برای مزایده ${auction.id}`,
  });

  return {
    id: bid.id,
    amount: bid.amount.toString(),
    createdAt: bid.createdAt.toISOString(),
    isWinning: bid.isWinning,
    minimumNextBid: (amt + auction.minIncrement).toString(),
  };
}

// ── endAuction ────────────────────────────────────────────
/**
 * End an auction (status → ENDED). Selects the highest bid as the
 * winner IF its amount >= reservePrice (or there's no reserve).
 * Flags the winning bid `isWinning=true` + writes winnerId +
 * winnerName + winningBid onto the auction row.
 *
 * No-bids → status ENDED with no winner.
 * Highest-bid-below-reserve → status ENDED with no winner (the
 *   seller isn't obligated to sell).
 *
 * Idempotent: ending an already-ENDED auction is a no-op.
 *
 * @throws AuctionServiceError(404) when auction doesn't exist.
 * @throws AuctionServiceError(400) when auction is CANCELLED (can't end).
 */
export async function endAuction(
  auctionId: string,
  userId?: string | null,
): Promise<any> {
  if (!auctionId) {
    throw new AuctionServiceError(400, 'auctionId الزامی است');
  }

  const existing = await db.auction.findUnique({
    where: { id: auctionId },
    include: {
      bids: {
        orderBy: { amount: 'desc' },
        take: 1,
      },
    },
  });
  if (!existing) {
    throw new AuctionServiceError(404, 'مزایده یافت نشد');
  }
  // Idempotent — already ended.
  if (existing.status === 'ENDED') {
    return serializeAuction(existing);
  }
  if (existing.status === 'CANCELLED') {
    throw new AuctionServiceError(400, 'مزایده لغوشده قابل اتمام نیست');
  }

  const topBid = existing.bids[0] ?? null;
  const meetsReserve =
    topBid !== null &&
    (existing.reservePrice === null || topBid.amount >= existing.reservePrice);

  const data: any = { status: 'ENDED' };
  if (topBid && meetsReserve) {
    data.winnerId = topBid.bidderId ?? null;
    data.winnerName = topBid.bidderName;
    data.winningBid = topBid.amount;
    // Flag the winning bid.
    try {
      await db.auctionBid.update({
        where: { id: topBid.id },
        data: { isWinning: true },
      });
    } catch {
      /* non-fatal */
    }
  }

  const auction = await db.auction.update({
    where: { id: auctionId },
    data,
    include: {
      listing: { select: { id: true, title: true, slug: true, price: true } },
      bids: { orderBy: { amount: 'desc' } },
    },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'marketplace.auction.end',
    entityType: 'Auction',
    entityId: auctionId,
    before: {
      status: existing.status,
      winnerId: existing.winnerId,
      winningBid: existing.winningBid?.toString?.() ?? null,
    },
    after: {
      status: auction.status,
      winnerId: auction.winnerId,
      winnerName: auction.winnerName,
      winningBid: auction.winningBid?.toString?.() ?? null,
      hadBids: topBid !== null,
      metReserve: meetsReserve,
    },
    reason: topBid
      ? meetsReserve
        ? `اتمام مزایده — برنده: ${topBid.bidderName ?? topBid.bidderId ?? 'ناشناس'} با ${topBid.amount.toString()} تومان`
        : `اتمام مزایده — بالاترین پیشنهاد زیر قیمت رزرو (برنده‌ای ندارد)`
      : `اتمام مزایده — بدون پیشنهاد`,
  });

  return serializeAuction(auction);
}

// ── getAuctionDetail ──────────────────────────────────────
/**
 * Return a single auction with its listing + all bids (ordered desc
 * by amount). Best-effort: appends the current user's bidderId if
 * available (for the UI to highlight "your bid").
 *
 * @throws AuctionServiceError(404) when auction doesn't exist.
 */
export async function getAuctionDetail(
  auctionId: string,
  viewerUserId?: string | null,
): Promise<any> {
  if (!auctionId) {
    throw new AuctionServiceError(400, 'auctionId الزامی است');
  }

  const auction = await db.auction.findUnique({
    where: { id: auctionId },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          slug: true,
          price: true,
          status: true,
          listingType: true,
        },
      },
      bids: {
        orderBy: { amount: 'desc' },
      },
      _count: { select: { bids: true } },
    },
  });
  if (!auction) {
    throw new AuctionServiceError(404, 'مزایده یافت نشد');
  }

  const serialized = serializeAuction({
    ...auction,
    _count: undefined,
  });
  serialized.bidCount = auction._count.bids;

  // Best-effort: mark "isMine" on each bid so the UI can highlight.
  if (viewerUserId) {
    try {
      const user = await getCurrentUser();
      if (user?.id) {
        serialized.bids = (serialized.bids ?? []).map((b: any) => ({
          ...b,
          isMine: b.bidderId === user.id,
        }));
      }
    } catch {
      /* non-fatal — getCurrentUser is best-effort here */
    }
  }

  return serialized;
}
