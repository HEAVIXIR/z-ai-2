import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseBool, parseNumber } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { getAIBudget } from "@/lib/ai-policy";
import { hasPermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/ai-budget
   ------------------------------------------------------------
   P0-7 (HEAVIX-SECURITY-BASELINE-V1.md §8): Admin control over the
   AI budget singleton + a listing of all task policies.

   GET   — returns { budget, policies }
   PATCH — updates the budget limits (dailyLimitUsd, monthlyLimitUsd,
           active) and/or resets the spend counters
           (resetDaily, resetMonthly).
   ============================================================ */

export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "ai.read"))) {
    return NextResponse.json(
      { error: "Forbidden: requires ai.read" },
      { status: 403 },
    );
  }
  try {
    const [budget, policies] = await Promise.all([
      getAIBudget(),
      db.aITaskPolicy.findMany({
        orderBy: { taskType: "asc" },
      }),
    ]);
    return NextResponse.json({ success: true, budget, policies });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "ai.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires ai.manage" },
      { status: 403 },
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const before = await getAIBudget();

    const patch: Record<string, unknown> = {};
    const dailyLimit = parseNumber(body.dailyLimitUsd);
    const monthlyLimit = parseNumber(body.monthlyLimitUsd);
    if (dailyLimit !== null && dailyLimit >= 0) patch.dailyLimitUsd = dailyLimit;
    if (monthlyLimit !== null && monthlyLimit >= 0)
      patch.monthlyLimitUsd = monthlyLimit;
    if (typeof body.active === "boolean") patch.active = body.active;

    // Reset spend counters — admin "panic button" when a runaway
    // task has consumed the daily/monthly budget.
    if (parseBool(body.resetDaily)) {
      patch.dailySpendUsd = 0.0;
      patch.dailyResetAt = new Date();
    }
    if (parseBool(body.resetMonthly)) {
      patch.monthlySpendUsd = 0.0;
      patch.monthlyResetAt = new Date();
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const updated = await db.aIBudget.update({
      where: { id: "main" },
      data: patch,
    });

    await logAudit({
      actorType: "ADMIN",
      action: "ai.budget.update",
      entityType: "AIBudget",
      entityId: "main",
      before,
      after: updated,
      reason: "Admin updated AI budget limits / reset spend",
    });

    return NextResponse.json({ success: true, budget: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
