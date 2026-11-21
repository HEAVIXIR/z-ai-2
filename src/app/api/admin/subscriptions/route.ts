import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseBig } from "@/lib/api-helpers";
import { hasPermission } from "@/lib/rbac";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SUBSCRIPTION_BODY_BYTES = 16 * 1024;

async function readBoundedSubscriptionBody(req: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SUBSCRIPTION_BODY_BYTES) return null;
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SUBSCRIPTION_BODY_BYTES) {
      try { await reader.cancel(); } catch { /* request already closed */ }
      return null;
    }
    chunks.push(value);
  }
  if (total === 0) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function serialize(s: any) {
  return {
    ...s,
    amount: s.amount == null ? null : s.amount.toString(),
  };
}

/* GET /api/admin/subscriptions — list + stats. */
export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "subscription.read"))) {
    return NextResponse.json(
      { error: "Forbidden: missing permission 'subscription.read'" },
      { status: 403 },
    );
  }
  try {
    const [items, stats] = await Promise.all([
      db.premiumSubscription.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, firstName: true, lastName: true, mobile: true } } },
      }),
      {
        total: await db.premiumSubscription.count(),
        active: await db.premiumSubscription.count({ where: { status: "ACTIVE" } }),
        expired: await db.premiumSubscription.count({
          where: { expiresAt: { lt: new Date() } },
        }),
        basic: await db.premiumSubscription.count({ where: { plan: "BASIC" } }),
        pro: await db.premiumSubscription.count({ where: { plan: "PRO" } }),
        enterprise: await db.premiumSubscription.count({ where: { plan: "ENTERPRISE" } }),
      },
    ]);
    return NextResponse.json({
      subscriptions: items.map(serialize),
      stats,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Unable to process subscription request" },
      { status: 500 },
    );
  }
}

/* POST /api/admin/subscriptions — create/update. Body: { userId, plan?, ... } */
export async function POST(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "subscription.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: missing permission 'subscription.manage'" },
      { status: 403 },
    );
  }
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  const contentType = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  try {
    const body = await readBoundedSubscriptionBody(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid or oversized request body" }, { status: 400 });
    }
    const allowedFields = new Set([
      "userId", "plan", "status", "featuredCredits", "analyticsAccess",
      "aiAssistantAccess", "priorityLeads", "companyPage", "paymentRef",
      "amount", "expiresAt",
    ]);
    if (Object.keys(body).some((key) => !allowedFields.has(key))) {
      return NextResponse.json({ error: "Unknown request field" }, { status: 400 });
    }

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId || userId.length > 128) {
      return NextResponse.json({ error: "A valid userId is required" }, { status: 400 });
    }
    const mutableFields = Object.keys(body).filter((key) => key !== "userId");
    if (mutableFields.length === 0) {
      return NextResponse.json({ error: "At least one subscription field is required" }, { status: 400 });
    }

    const plan = body.plan === undefined
      ? "BASIC"
      : typeof body.plan === "string" ? body.plan.trim() : "";
    const status = body.status === undefined
      ? "ACTIVE"
      : typeof body.status === "string" ? body.status.trim() : "";
    if (!plan || plan.length > 64 || !status || status.length > 32) {
      return NextResponse.json({ error: "Invalid plan or subscription status" }, { status: 400 });
    }

    const featuredCredits = body.featuredCredits === undefined ? 0 : Number(body.featuredCredits);
    if (!Number.isSafeInteger(featuredCredits) || featuredCredits < 0 || featuredCredits > 1_000_000) {
      return NextResponse.json({ error: "featuredCredits must be a non-negative integer" }, { status: 400 });
    }

    const featureFields = ["analyticsAccess", "aiAssistantAccess", "priorityLeads", "companyPage"] as const;
    for (const field of featureFields) {
      if (body[field] !== undefined && typeof body[field] !== "boolean") {
        return NextResponse.json({ error: field + " must be a boolean" }, { status: 400 });
      }
    }

    if (body.paymentRef !== undefined && body.paymentRef !== null &&
        (typeof body.paymentRef !== "string" || body.paymentRef.length > 128)) {
      return NextResponse.json({ error: "paymentRef is invalid" }, { status: 400 });
    }

    // Create defaults are intentionally separate from PATCH-like upsert updates.
    // Omitted fields must preserve the existing administrative entitlement.
    const createData: any = {
      userId,
      plan,
      status,
      featuredCredits,
      analyticsAccess: body.analyticsAccess ?? false,
      aiAssistantAccess: body.aiAssistantAccess ?? false,
      priorityLeads: body.priorityLeads ?? false,
      companyPage: body.companyPage ?? false,
      paymentRef: body.paymentRef ?? null,
      startedAt: new Date(),
    };
    const updateData: any = {};
    if ("plan" in body) updateData.plan = plan;
    if ("status" in body) updateData.status = status;
    if ("featuredCredits" in body) updateData.featuredCredits = featuredCredits;
    for (const field of ["analyticsAccess", "aiAssistantAccess", "priorityLeads", "companyPage"] as const) {
      if (field in body) updateData[field] = body[field];
    }
    if ("paymentRef" in body) updateData.paymentRef = body.paymentRef;

    if (body.amount !== undefined) {
      const amount = parseBig(body.amount);
      if (amount === null || amount < 0n || amount > 9223372036854775807n) {
        return NextResponse.json({ error: "amount is invalid" }, { status: 400 });
      }
      createData.amount = amount;
      updateData.amount = amount;
    }
    if (body.expiresAt !== undefined) {
      if (body.expiresAt === null) {
        createData.expiresAt = null;
        updateData.expiresAt = null;
      } else {
        if (typeof body.expiresAt !== "string" && typeof body.expiresAt !== "number") {
          return NextResponse.json({ error: "expiresAt must be a valid date" }, { status: 400 });
        }
        const expiresAt = new Date(body.expiresAt);
        if (!Number.isFinite(expiresAt.getTime())) {
          return NextResponse.json({ error: "expiresAt must be a valid date" }, { status: 400 });
        }
        createData.expiresAt = expiresAt;
        updateData.expiresAt = expiresAt;
      }
    }

    const result = await db.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!targetUser) return { kind: "USER_NOT_FOUND" as const };

      const before = await tx.premiumSubscription.findUnique({
        where: { userId },
      });
      const subscription = await tx.premiumSubscription.upsert({
        where: { userId },
        create: createData,
        update: updateData,
      });

      await tx.auditLog.create({
        data: {
          actorId: sessionUser.id,
          actorType: "ADMIN",
          action: "admin.premiumSubscriptions.upsert",
          entityType: "PremiumSubscription",
          entityId: subscription.id,
          beforeJson: before ? JSON.stringify({
            plan: before.plan,
            status: before.status,
            amount: before.amount?.toString() ?? null,
            expiresAt: before.expiresAt,
            featuredCredits: before.featuredCredits,
            analyticsAccess: before.analyticsAccess,
            aiAssistantAccess: before.aiAssistantAccess,
            priorityLeads: before.priorityLeads,
            companyPage: before.companyPage,
            paymentRef: before.paymentRef,
          }) : null,
          afterJson: JSON.stringify({
            plan: subscription.plan,
            status: subscription.status,
            amount: subscription.amount?.toString() ?? null,
            expiresAt: subscription.expiresAt,
            featuredCredits: subscription.featuredCredits,
            analyticsAccess: subscription.analyticsAccess,
            aiAssistantAccess: subscription.aiAssistantAccess,
            priorityLeads: subscription.priorityLeads,
            companyPage: subscription.companyPage,
            paymentRef: subscription.paymentRef,
          }),
          reason: "via admin API",
        },
      });

      return { kind: "OK" as const, subscription };
    });

    if (result.kind === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const s = result.subscription;
    return NextResponse.json({ ok: true, subscription: serialize(s) });
  } catch (err: any) {
    console.error("[admin/subscriptions] request failed:", err);
    return NextResponse.json(
      { error: "Unable to process subscription request" },
      { status: 500 },
    );
  }
}
