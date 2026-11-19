import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { createWanted, WantedServiceError } from "@/lib/wanted-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(r: any) {
  return {
    ...r,
    budgetMin: r.budgetMin ? r.budgetMin.toString() : null,
    budgetMax: r.budgetMax ? r.budgetMax.toString() : null,
  };
}

/* GET /api/requests — public list (only ACTIVE). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(100, Number(url.searchParams.get("limit")) || 30);
    const offset = Number(url.searchParams.get("offset")) || 0;
    const q = url.searchParams.get("q")?.trim() || undefined;
    const category = url.searchParams.get("category") || undefined;
    const province = url.searchParams.get("province") || undefined;

    const where: any = { status: "ACTIVE" };
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } },
      ];
    }
    if (category) where.category = category;
    if (province) where.province = province;

    const [items, total] = await Promise.all([
      db.buyRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.buyRequest.count({ where }),
    ]);

    return NextResponse.json({
      requests: items.map(serialize),
      total,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/requests — compatibility adapter to canonical BuyRequest service.
 * Authenticated only; the request body never supplies the actor identity. */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "برای ثبت درخواست ابتدا وارد شوید" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const created = await createWanted({
      title: String(body.title ?? ""),
      description: body.description ?? null,
      category: body.category ?? null,
      brandPref: body.brandPref ?? null,
      transactionType: body.transaction ?? "SALE",
      budgetMin: body.budgetMin ?? null,
      budgetMax: body.budgetMax ?? null,
      city: body.city ?? null,
      province: body.province ?? null,
      deadline: body.deadline ?? null,
      requesterName: body.requesterName ?? null,
      requesterPhone: body.requesterPhone ?? null,
      userId,
    });

    try {
      revalidateTag(HOMEPAGE_CACHE_TAGS.requests, "default");
    } catch (e) {
      console.error("[requests] revalidateTag failed:", e);
    }

    return NextResponse.json({ ok: true, id: created.id, status: created.status });
  } catch (err: any) {
    if (err instanceof WantedServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
