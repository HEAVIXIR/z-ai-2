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

interface Params {
  params: Promise<{ id: string }>;
}

function auditSnapshot(value: any) {
  if (!value) return null;
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}

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

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await requirePermission(user.id, "subscription.manage");

  try {
    const { id } = await params;
    const plan = await db.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) return NextResponse.json({ success: false, error: "طرح یافت نشد" }, { status: 404 });
    return NextResponse.json({ success: true, plan: await serialize(plan) });
  } catch {
    return NextResponse.json({ success: false, error: "خطای داخلی سرور" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await requirePermission(user.id, "subscription.manage");

  const parsedBody = await readSubscriptionPlanBody(req);
  if (!parsedBody.ok) {
    return NextResponse.json({ success: false, error: parsedBody.error }, { status: 400 });
  }
  const parsed = parseSubscriptionPlanInput(parsedBody.data, "update");
  if (!parsed.ok) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  }

  try {
    const { id } = await params;
    const outcome = await db.$transaction(async (tx) => {
      const before = await tx.subscriptionPlan.findUnique({ where: { id } });
      if (!before) return { kind: "not-found" as const };

      if (typeof parsed.data.code === "string" && parsed.data.code !== before.code) {
        const conflict = await tx.subscriptionPlan.findUnique({
          where: { code: parsed.data.code },
        });
        if (conflict) return { kind: "conflict" as const };
      }

      const updated = await tx.subscriptionPlan.update({
        where: { id },
        data: parsed.data as any,
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: "ADMIN",
          action: "admin.subscriptionPlans.update",
          entityType: "SubscriptionPlan",
          entityId: updated.id,
          beforeJson: auditSnapshot(before),
          afterJson: auditSnapshot(updated),
          reason: "via admin API",
        },
      });
      return { kind: "ok" as const, plan: updated };
    });

    if (outcome.kind === "not-found") {
      return NextResponse.json({ success: false, error: "طرح یافت نشد" }, { status: 404 });
    }
    if (outcome.kind === "conflict") {
      return NextResponse.json({ success: false, error: "کد این پلن قبلاً ثبت شده است" }, { status: 409 });
    }
    return NextResponse.json({ success: true, plan: await serialize(outcome.plan) });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ success: false, error: "کد این پلن قبلاً ثبت شده است" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "خطای داخلی سرور" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await requirePermission(user.id, "subscription.manage");

  try {
    const { id } = await params;
    const outcome = await db.$transaction(async (tx) => {
      const before = await tx.subscriptionPlan.findUnique({ where: { id } });
      if (!before) return { kind: "not-found" as const };

      const subscribers = await tx.premiumSubscription.count({
        where: { plan: before.code },
      });
      if (subscribers > 0) return { kind: "in-use" as const, subscribers };

      await tx.subscriptionPlan.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorType: "ADMIN",
          action: "admin.subscriptionPlans.delete",
          entityType: "SubscriptionPlan",
          entityId: id,
          beforeJson: auditSnapshot(before),
          afterJson: null,
          reason: "via admin API",
        },
      });
      return { kind: "ok" as const };
    });

    if (outcome.kind === "not-found") {
      return NextResponse.json({ success: false, error: "طرح یافت نشد" }, { status: 404 });
    }
    if (outcome.kind === "in-use") {
      return NextResponse.json({
        success: false,
        error: `این طرح به ${outcome.subscribers} اشتراک اختصاص دارد و قابل حذف نیست. ابتدا اشتراک‌ها را به طرح دیگری منتقل کنید.`,
      }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "خطای داخلی سرور" }, { status: 500 });
  }
}
