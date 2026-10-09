import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/authorization";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/ai-seller-assistant?listingId=...
   Returns listing improvement suggestions.

   STEP 11.32 R-3 FIX: added getCurrentUser() auth check + ownership
   check (IDOR fix). Previously this route had NO authentication —
   anyone could call it and read any listing's data. Now only the
   listing's owner or an admin can access it.
*/
export async function GET(req: Request) {
  // STEP 11.32 R-3 FIX: require authentication.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("listingId");
    if (!id) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    const listing = await db.listing.findUnique({
      where: { id },
      include: {
        brand: true,
        category: true,
        images: true,
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // STEP 11.32 R-3 FIX: ownership check (IDOR fix). Only the listing's
    // seller or an admin can access AI suggestions for this listing.
    const isOwner = listing.sellerId === user.id;
    const is_admin = await isAdmin(user.id);
    if (!isOwner && !is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Heuristic checks
    const issues: Array<{ field: string; severity: "high" | "medium" | "low"; message: string }> = [];
    if (listing.images.length === 0) {
      issues.push({ field: "images", severity: "high", message: "آگهی تصویر ندارد. حداقل ۳ تصویر اضافه کنید." });
    } else if (listing.images.length < 3) {
      issues.push({ field: "images", severity: "medium", message: `تنها ${listing.images.length} تصویر دارید. افزودن تصاویر بیشتر فروش را افزایش می‌دهد.` });
    }
    if (!listing.description || listing.description.length < 100) {
      issues.push({ field: "description", severity: "high", message: "توضیحات آگهی کوتاه است. جزئیات فنی، وضعیت و تاریخچه ماشین را اضافه کنید." });
    }
    if (!listing.price) {
      issues.push({ field: "price", severity: "high", message: "قیمت وارد نشده است. آگهی‌های دارای قیمت ۴ برابر بیشتر دیده می‌شوند." });
    }
    if (!listing.year) {
      issues.push({ field: "year", severity: "medium", message: "سال تولید را وارد کنید." });
    }
    if (listing.workingHours === null) {
      issues.push({ field: "workingHours", severity: "medium", message: "کارکرد ماشین را وارد کنید." });
    }
    if (!listing.province) {
      issues.push({ field: "province", severity: "low", message: "استان را مشخص کنید." });
    }
    if (!listing.brandId) {
      issues.push({ field: "brand", severity: "medium", message: "برند ماشین را مشخص کنید." });
    }

    // LLM suggestions
    let aiSuggestions: string[] = [];
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are HEAVIX seller coach. Given a listing's data, return 3-5 actionable Persian bullet-point suggestions to improve its saleability. Return ONLY a JSON array of strings.",
          },
          {
            role: "user",
            content: JSON.stringify({
              title: listing.title,
              hasDescription: Boolean(listing.description),
              descLength: listing.description?.length ?? 0,
              hasPrice: Boolean(listing.price),
              year: listing.year,
              hours: listing.workingHours,
              brand: listing.brand?.name,
              category: listing.category?.name,
              imageCount: listing.images.length,
              province: listing.province,
              city: listing.city,
              condition: listing.condition,
            }),
          },
        ],
        thinking: { type: "disabled" },
      });
      const raw = completion?.choices?.[0]?.message?.content || "";
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr)) aiSuggestions = arr.map(String);
      }
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      listingId: listing.id,
      title: listing.title,
      issues,
      aiSuggestions,
      completeness: Math.max(0, 100 - issues.length * 12),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
