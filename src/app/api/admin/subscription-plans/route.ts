import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import {
  parseSubscriptionPlanInput,
  readSubscriptionPlanBody,
} from "@/lib/admin/subscription-plan-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function auditSnapshot(value: any) {
  if (!value) return null;
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item,
  ).slice(0, 4000);
}

/** Serialize a plan without leaking BigInt values into JSON. */
async function serialize(plan: any) {
  const subscriberCount = await db.premiumSubscription.count({
    where: { plan: plan.code },
  });
  return {
    ...plan,
    priceMonthly: plan.priceMonthly?.toString() ?? "0",
    priceYearly: plan.priceYearly?.toString() ?? null,
    subscriberCount,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await requirePermission(user.id, "subscription.manage");

  try {
    const plans = await db.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({
      success: true,
      plans: await Promise.all(plans.map(serialize)),
    });
  } catch {
    return NextResponse.json({ success: false, error: "خطای داخلی سرور" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await requirePermission(user.id, "subscription.manage");

  const parsedBody = await readSubscriptionPlanBody(req);
  if (!parsedBody.ok) {
    return NextResponse.json({ success: false, error: parsedBody.error }, { status: 400 });
  }
  const parsed = parseSubscriptionPlanInput(parsedBody.data, "create");
  if (!parsed.ok) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  }

  try {
    const plan = await db.$transaction(async (tx) => {
      const created = await tx.subscriptionPlan.create({ data: parsed.data as any });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: "ADMIN",
          action: "admin.subscriptionPlans.create",
          entityType: "SubscriptionPlan",
          entityId: created.id,
          beforeJson: null,
          afterJson: auditSnapshot(created),
          reason: "via admin API",
        },
      });
      return created;
    });
    return NextResponse.json({ success: true, plan: await serialize(plan) });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ success: false, error: "کد این پلن قبلاً ثبت شده است" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "خطای داخلی سرور" }, { status: 500 });
  }
}
