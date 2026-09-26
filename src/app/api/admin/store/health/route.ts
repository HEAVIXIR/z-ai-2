import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = "1.0";

/* GET /api/admin/store/health
   Store Control Plane health-check (Monitoring stub, Layer A).
   Best-effort: reports DB status + basic stats. HTTP 503 if DB unreachable.
*/
export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus: "connected" | "error" = "error";
  let dbLatencyMs: number | undefined;
  let stats: Record<string, number> = {};

  try {
    const t0 = Date.now();
    await storeDb.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
    dbStatus = "connected";
    try {
      const [parts, brands, categories, orders] = await Promise.all([
        storeDb.part.count(),
        storeDb.brand.count(),
        storeDb.category.count(),
        storeDb.order.count(),
      ]);
      stats = { parts, brands, categories, orders };
    } catch { /* stats optional */ }
  } catch {
    return NextResponse.json(
      { status: "error", timestamp, db: dbStatus, version: VERSION, message: "Store DB unreachable" },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: "ok", timestamp, db: dbStatus, dbLatencyMs, version: VERSION, stats });
}
