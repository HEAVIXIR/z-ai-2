import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/health — liveness + readiness check.

   Returns 200 if the application process is alive and the main
   database is reachable. Does NOT expose secrets, connection
   strings, or internal details.

   Response: { status: "ok" | "degraded", checks: { db: "up" | "down" } }

   The store database is checked best-effort — if it's down, the
   health status is "degraded" (not "down") because the main
   marketplace functionality (listings, search, auth) does not
   depend on the store DB.
   ============================================================ */

export async function GET() {
  const checks: Record<string, string> = {};
  let allOk = true;

  // Check main database
  try {
    await db.$queryRaw`SELECT 1`;
    checks.db = "up";
  } catch {
    checks.db = "down";
    allOk = false;
  }

  // Check store database (best-effort — degraded, not down)
  try {
    const { storeDb } = await import("@/lib/store-db");
    await storeDb.$queryRaw`SELECT 1`;
    checks.storeDb = "up";
  } catch {
    checks.storeDb = "down";
    // Don't set allOk = false — store DB is not critical for main marketplace
  }

  const status = allOk ? "ok" : "degraded";
  const httpStatus = allOk ? 200 : 503;

  return NextResponse.json(
    { status, checks, timestamp: new Date().toISOString() },
    { status: httpStatus },
  );
}
