import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { getStoreMonitoringStatus } from "@/lib/admin/store-monitoring-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = "2.0";

/* GET /api/admin/store/health
   Store Control Plane health-check (Batch C upgrade).
   Reports domain-level DB status + per-resource monitoring for all 13
   Store CP resources (count, latency, audit/service/test wiring status).
   HTTP 503 if DB unreachable.
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

  // Batch C: per-resource monitoring — check each Store CP resource
  // individually (count, latency, audit/service/test wiring status).
  // This upgrades monitoring from domain-level to resource-level.
  let resourceMonitoring: unknown[] = [];
  try {
    resourceMonitoring = await getStoreMonitoringStatus();
  } catch { /* per-resource monitoring is best-effort */ }

  return NextResponse.json({
    status: "ok",
    timestamp,
    db: dbStatus,
    dbLatencyMs,
    version: VERSION,
    stats,
    resourceMonitoring,
  });
}
