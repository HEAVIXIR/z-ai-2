import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/auth/logout — revoke the canonical user session. */
export async function POST(req: Request) {
  // F-006: CSRF defense — fail-closed Origin/Referer verification.
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  try {
    // destroySession is the compatibility alias for destroyUserSession.
    // Calling both performed the same revocation twice.
    await destroySession();
    return NextResponse.json({ ok: true, message: "خروج موفقیت‌آمیز بود" });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
