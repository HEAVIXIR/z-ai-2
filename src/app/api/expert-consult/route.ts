/**
 * HEAVIX — Expert Consult API
 * ------------------------------------------------------------
 * STEP 13.01 P0-3 FIX: This route previously referenced
 * `db.expertConsultation` which does NOT exist in either Prisma
 * schema (schema.prisma or store-schema.prisma). The @ts-nocheck
 * directive hid the type error, causing a runtime crash
 * (TypeError: Cannot read properties of undefined) on every call.
 *
 * Fix: The route is now DISABLED with a clear 503 response. The
 * ExpertConsultation model + full implementation should be added
 * in a separate feature PR when the product is ready.
 *
 * Routes:
 *   POST /api/expert-consult — DISABLED (returns 503)
 *   GET  /api/expert-consult — DISABLED (returns 503)
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISABLED_MESSAGE =
  "سرویس مشاوره تخصصی در حال حاضر فعال نیست. این قابلیت به‌زودی افزوده می‌شود.";

/* POST /api/expert-consult — DISABLED.
 * Returns 503 Service Unavailable. The previous implementation
 * crashed at runtime because db.expertConsultation does not exist. */
export async function POST() {
  return NextResponse.json(
    {
      error: DISABLED_MESSAGE,
      code: "FEATURE_DISABLED",
    },
    { status: 503 },
  );
}

/* GET /api/expert-consult — DISABLED.
 * Returns 503 Service Unavailable. */
export async function GET() {
  return NextResponse.json(
    {
      error: DISABLED_MESSAGE,
      code: "FEATURE_DISABLED",
    },
    { status: 503 },
  );
}
