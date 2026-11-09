import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/settings — public site settings (safe fields only). */
export async function GET() {
  try {
    const s = await db.siteSettings.findUnique({ where: { id: "main" } });
    // GET is read-only: an absent settings row must not be created as a side effect.
    // Only expose safe public fields; unset values use non-persistent UI defaults.
    return NextResponse.json({
      settings: {
        about: s?.about ?? null,
        phone: s?.phone ?? null,
        email: s?.email ?? null,
        address: s?.address ?? null,
        workingHours: s?.workingHours ?? null,
        copyright: s?.copyright ?? null,
        newsletterEnabled: s?.newsletterEnabled ?? false,
        // Public brand assets for header/footer rendering.
        logoUrl: s?.logoUrl ?? null,
        footerLogoUrl: s?.footerLogoUrl ?? null,
        logoText: s?.logoText ?? null,
        // Logo size, position and Persian name.
        logoHeight: s?.logoHeight ?? null,
        footerLogoHeight: s?.footerLogoHeight ?? null,
        showPersianName: s?.showPersianName ?? false,
        logoPosition: s?.logoPosition ?? null,
        footerLogoPosition: s?.footerLogoPosition ?? null,
        // Tri-brand footer logos (3 separate slots).
        footerHeavixLogoUrl: s?.footerHeavixLogoUrl ?? null,
        footerMekanixLogoUrl: s?.footerMekanixLogoUrl ?? null,
        footerAriaLogoUrl: s?.footerAriaLogoUrl ?? null,
        // Public Header animation default; never persisted by a GET.
        logoAnimationDurationMs: s?.logoAnimationDurationMs ?? 10000,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
