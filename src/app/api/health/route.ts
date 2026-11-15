import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_CHECK_TIMEOUT_MS = 8_000;

/* ============================================================
   GET /api/health — liveness + readiness check.

   Returns 200 when the main application database is reachable.
   Does NOT expose secrets, connection strings, or internal details.

   Response: { status: "ok" | "degraded", checks: { db, storeDb } }

   The store database is checked best-effort and does not affect
   the overall status because marketplace core functionality does
   not depend on the store DB.

   Both database checks run concurrently and have a bounded wait.
   Promise.race bounds this response; it does not cancel an underlying
   Prisma query that has already started.
   ============================================================ */

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`[health] ${label} check timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function checkAppDb(): Promise<"up" | "down"> {
  try {
    await withTimeout(db.$queryRaw`SELECT 1`, DB_CHECK_TIMEOUT_MS, "App DB");
    return "up";
  } catch (error) {
    console.warn(
      "[health] App DB check failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return "down";
  }
}

async function checkStoreDb(): Promise<"up" | "down"> {
  try {
    await withTimeout(
      (async () => {
        const { storeDb } = await import("@/lib/store-db");
        await storeDb.$queryRaw`SELECT 1`;
      })(),
      DB_CHECK_TIMEOUT_MS,
      "Store DB",
    );
    return "up";
  } catch (error) {
    console.warn(
      "[health] Store DB check failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return "down";
  }
}

export async function GET() {
  const [dbStatus, storeDbStatus] = await Promise.all([
    checkAppDb(),
    checkStoreDb(),
  ]);

  const checks: Record<string, string> = {
    db: dbStatus,
    storeDb: storeDbStatus,
  };
  const allOk = dbStatus === "up";
  const status = allOk ? "ok" : "degraded";
  const httpStatus = allOk ? 200 : 503;

  return NextResponse.json(
    { status, checks, timestamp: new Date().toISOString() },
    { status: httpStatus },
  );
}
