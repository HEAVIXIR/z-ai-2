import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { parseBig } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serialize a SubscriptionPlan row (BigInt → string) and include subscriber count. */
async function serialize(p: any) {
  const count = await db.premiumSubscription.count({
    where: { plan: p.code },
  });
  return {
    ...p,
    priceMonthly: p.priceMonthly?.toString() ?? "0",
    priceYearly: p.priceYearly?.toString() ?? null,
    subscriberCount: count,
  };
}

/* GET /api/admin/subscription-plans — list all plans ordered by sortOrder. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "subscription.manage");
  try {
    const plans = await db.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const out = await Promise.all(plans.map(serialize));
    return NextResponse.json({ success: true, plans: out });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/admin/subscription-plans — create a new plan. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "subscription.manage");
  try {
    const body = await req.json().catch(() => ({}));

    const code = String(body.code ?? "").trim();
    const nameFa = String(body.nameFa ?? "").trim();

    if (!code) {
      return NextResponse.json(
        { success: false, error: "code الزامی است" },
        { status: 400 },
      );
    }
    if (!nameFa) {
      return NextResponse.json(
        { success: false, error: "nameFa الزامی است" },
        { status: 400 },
      );
    }

    const existing = await db.subscriptionPlan.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `طرح با کد «${code}» قبلاً ثبت شده است`,
        },
        { status: 409 },
      );
    }

    const data: any = {
      code,
      nameFa,
      nameEn: body.nameEn ? String(body.nameEn) : null,
      description: body.description ? String(body.description) : null,
      priceMonthly: parseBig(body.priceMonthly) ?? BigInt(0),
      priceYearly: parseBig(body.priceYearly),
      currency: body.currency ? String(body.currency) : "IRR",
      featuredCredits: num(body.featuredCredits, 0),
      analyticsAccess: Boolean(body.analyticsAccess),
      aiAssistantAccess: Boolean(body.aiAssistantAccess),
      priorityLeads: Boolean(body.priorityLeads),
      companyPage: Boolean(body.companyPage),
      maxListings: num(body.maxListings, 0),
      maxImages: num(body.maxImages, 8),
      verifiedBadge: Boolean(body.verifiedBadge),
      supportLevel: body.supportLevel ? String(body.supportLevel) : null,
      sortOrder: num(body.sortOrder, 0),
      active: body.active !== false,
      popular: Boolean(body.popular),
      featuresJson: normalizeJson(body.featuresJson),
    };

    const plan = await db.subscriptionPlan.create({ data });

    // CP-02.15.10: local audit() function removed; canonical logAudit() captures
    // actorId/actorType/action/entityType/entityId/after/reason with full context
    // (ip/userAgent/requestId captured automatically by logAudit).
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "admin.subscriptionPlans.create",
      entityType: "SubscriptionPlan",
      entityId: plan.id,
      after: { code: plan.code, nameFa: plan.nameFa, priceMonthly: plan.priceMonthly?.toString() ?? null, active: plan.active, sortOrder: plan.sortOrder },
      reason: "via admin API",
    });

    return NextResponse.json({
      success: true,
      plan: await serialize(plan),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* ── helpers ── */
function num(v: any, def: number): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}

function normalizeJson(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

// CP-02.15.10: local audit() function REMOVED.
// All audit logging now goes through the canonical `logAudit()` from
// `@/lib/audit`, which captures actorId, ip, userAgent, requestId in
// addition to action/entityType/entityId/before/after. One audit pipeline.
