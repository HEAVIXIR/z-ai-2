import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = "1.0";

/* GET /api/admin/marketplace/health
   Marketplace Control Plane health-check (Monitoring stub, Layer A).
   Best-effort: reports DB status + basic listing stats. HTTP 503 if DB unreachable.
*/
export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus: "connected" | "error" = "error";
  let dbLatencyMs: number | undefined;
  let stats: Record<string, number> = {};

  try {
    const t0 = Date.now();
    await db.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
    dbStatus = "connected";
    try {
      const [listings, products, offers, bids] = await Promise.all([
        db.listing.count(),
        db.product.count(),
        db.listingOffer.count(),
        db.auctionBid.count(),
      ]);
      stats = { listings, products, offers, bids };
    } catch { /* stats optional */ }
  } catch {
    return NextResponse.json(
      { status: "error", timestamp, db: dbStatus, version: VERSION, message: "Marketplace DB unreachable" },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: "ok", timestamp, db: dbStatus, dbLatencyMs, version: VERSION, stats });
}
