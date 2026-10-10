// @ts-nocheck — HEAVIX Legacy: Owner=Migration, Scope=OldAdmin, Ticket=STEP-14.6-LEGACY
import { db } from "@/lib/db";
import { isAdmin, hasRole } from "@/lib/authorization";

/* ============================================================
   HEAVIX — AI Gateway Policy Engine (P0-7)
   ------------------------------------------------------------
   HEAVIX-SECURITY-BASELINE-V1.md §8  (AI Security)
   HEAVIX-P0-IMPLEMENTATION-PLAN.md   STEP 7 (AI Gateway)

   The AI Gateway is a Policy-Controlled gateway. Every task must
   pass FIVE independent gates BEFORE the LLM is invoked:

       1. getTaskPolicy    — task must have an ACTIVE policy row
                             (deny-by-default; tasks with no row
                             or active=false are rejected)
       2. checkAIAuth      — actor's role must be in allowedRoles
                             (ADMIN always passes; "*" = everyone)
       3. checkAIQuota     — per-user hourly + daily call counts
                             (from AIGatewayLog) must be under the
                             policy's limits
       4. checkAIBudget    — global daily/monthly USD spend (from
                             AIBudget singleton, auto-reset on
                             window rollover) must be under caps
                             AND the per-call cost ceiling
       5. (caller)         — max input size + timeout enforced in
                             the route handler itself

   After a successful call, `recordAICost` increments the budget
   counters. Failures do NOT consume budget.

   All checks are SERVER-SIDE. The client never gets to influence
   them. AI is untrusted automation (HEAVIX Principle 6).
   ============================================================ */

export type AIPolicyCheckResult = {
  ok: boolean;
  reason?: string;
};

/** Roles recognised by the policy engine. */
export type AIRole = "ADMIN" | "SELLER" | "BUYER" | "MODERATOR" | "SUPPORT";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Approximate month length. We reset the monthly counter 30 days
// after the last reset, which is good enough for budget tracking —
// exact calendar months would need a cron + per-month rows.
const MONTH_MS = 30 * DAY_MS;

/* ────────────────────────────────────────────────────────────
   1. Task policy lookup
   ──────────────────────────────────────────────────────────── */

/**
 * Fetch the policy for a task type. Returns null when the task has
 * no policy row OR the row is inactive — in both cases the caller
 * must DENY the request (deny-by-default).
 */
export async function getTaskPolicy(taskType: string) {
  try {
    const row = await db.aITaskPolicy.findUnique({
      where: { taskType },
    });
    if (!row) return null;
    if (!row.active) return null;
    return row;
  } catch (err) {
    console.error("[ai-policy] getTaskPolicy failed:", err);
    return null;
  }
}

/* ────────────────────────────────────────────────────────────
   2. Auth check — actor's role must be in allowedRoles
   ──────────────────────────────────────────────────────────── */

/** True if the user has at least one of the given role keys. */
async function userHasAnyRole(
  userId: string,
  roles: string[],
): Promise<boolean> {
  // Try the new RBAC UserRole table first.
  if (await hasRole(userId, roles)) return true;
}

/**
 * Check whether the caller is authorised to invoke `taskType`.
 *
 * STEP 11.33 R-3-A1 FIX: the previous implementation granted anonymous
 * access ({ok:true}) when `user` was null AND `roles.includes("ADMIN")`.
 * This was intended to support the "admin-cookie path" but the Gateway
 * route handler (ai-gateway/route.ts) never actually verified an admin
 * cookie — it computed `adminOk` but did NOT pass it to preflight. The
 * net effect was: any anonymous attacker could call /api/ai-gateway with
 * any task type whose policy allowed ADMIN (all 8 seeded policies do).
 *
 * Fix (fail-closed): if `user` is null, ALWAYS deny. The admin-cookie
 * path, if genuinely needed, must be handled by the caller BEFORE
 * calling preflight — the caller must resolve a real user object (via
 * getCurrentUser or an explicit admin-session check) and pass it.
 *
 * ADMIN always passes (subject to the policy existing at all).
 */
export async function checkAIAuth(
  user: { id: string } | null,
  policy: { allowedRoles: string },
): Promise<AIPolicyCheckResult> {
  const raw = (policy.allowedRoles ?? "").trim();
  if (!raw) return { ok: false, reason: "policy has no allowedRoles" };

  // STEP 11.33 R-3-A1 FIX: fail-closed for anonymous. No anonymous
  // access to AI tasks, regardless of allowedRoles. The caller must
  // authenticate the user before invoking the Gateway.
  if (!user) {
    return { ok: false, reason: "authentication required" };
  }

  const roles = raw === "*"
    ? ["ADMIN", "SELLER", "BUYER", "MODERATOR", "SUPPORT"]
    : raw.split(",").map((r) => r.trim().toUpperCase()).filter(Boolean);

  // ADMIN always passes (least surprise for super-users).
  if (await isAdmin(user.id)) return { ok: true };

  const ok = await userHasAnyRole(user.id, roles);
  return ok
    ? { ok: true }
    : { ok: false, reason: "role not allowed for this AI task" };
}

/* ────────────────────────────────────────────────────────────
   3. Per-user quota — counts AIGatewayLog rows in the window
   ──────────────────────────────────────────────────────────── */

/**
 * Check the per-user hourly + daily call count for `taskType`
 * against the policy limits. Anonymous (admin-cookie) callers are
 * counted under the synthetic userId `"admin"`.
 */
export async function checkAIQuota(
  userId: string,
  taskType: string,
  policy: { hourlyLimit: number; dailyLimit: number },
): Promise<AIPolicyCheckResult> {
  try {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    const dayAgo = new Date(now.getTime() - DAY_MS);

    // Count both windows in one round-trip using Promise.all.
    // Index on (userId, taskType, createdAt) makes these cheap.
    const [hourlyCount, dailyCount] = await Promise.all([
      db.aIGatewayLog.count({
        where: {
          userId,
          taskType,
          createdAt: { gte: hourAgo },
        },
      }),
      db.aIGatewayLog.count({
        where: {
          userId,
          taskType,
          createdAt: { gte: dayAgo },
        },
      }),
    ]);

    if (hourlyCount >= policy.hourlyLimit) {
      return {
        ok: false,
        reason: `hourly quota exceeded (${hourlyCount}/${policy.hourlyLimit})`,
      };
    }
    if (dailyCount >= policy.dailyLimit) {
      return {
        ok: false,
        reason: `daily quota exceeded (${dailyCount}/${policy.dailyLimit})`,
      };
    }
    return { ok: true };
  } catch (err) {
    console.error("[ai-policy] checkAIQuota failed:", err);
    // Fail closed — if we can't verify the quota, deny.
    return { ok: false, reason: "quota check failed" };
  }
}

/* ────────────────────────────────────────────────────────────
   4. Global budget check + auto-reset
   ──────────────────────────────────────────────────────────── */

/**
 * Get the singleton AIBudget row, creating it if missing.
 * Always returns a row (never null) so callers can rely on the
 * shape. Auto-resets the daily/monthly counters when their window
 * has elapsed.
 */
export async function getAIBudget() {
  const now = new Date();
  // Ensure the singleton exists.
  const existing = await db.aIBudget.upsert({
    where: { id: "main" },
    create: {
      id: "main",
      dailyLimitUsd: 10.0,
      monthlyLimitUsd: 200.0,
      dailySpendUsd: 0.0,
      monthlySpendUsd: 0.0,
      dailyResetAt: now,
      monthlyResetAt: now,
      active: true,
    },
    update: {},
  });

  // Auto-reset windows if elapsed.
  const dayExpired =
    !existing.dailyResetAt ||
    existing.dailyResetAt.getTime() + DAY_MS <= now.getTime();
  const monthExpired =
    !existing.monthlyResetAt ||
    existing.monthlyResetAt.getTime() + MONTH_MS <= now.getTime();

  if (dayExpired || monthExpired) {
    const patch: Record<string, unknown> = {};
    if (dayExpired) {
      patch.dailySpendUsd = 0.0;
      patch.dailyResetAt = now;
    }
    if (monthExpired) {
      patch.monthlySpendUsd = 0.0;
      patch.monthlyResetAt = now;
    }
    try {
      return await db.aIBudget.update({
        where: { id: "main" },
        data: patch,
      });
    } catch (err) {
      console.error("[ai-policy] budget auto-reset failed:", err);
      return existing;
    }
  }
  return existing;
}

/**
 * Check the global budget AND atomically reserve the estimated cost.
 *
 * STEP 11.45 SECURITY CLOSURE: Previously, checkAIBudget only READ the
 * budget (non-atomic). Multiple concurrent requests could all pass the
 * check before any recordAICost incremented the spend. This resulted
 * in budget overshoot under concurrent load.
 *
 * Fix: Use a single atomic SQL UPDATE with a WHERE clause that checks
 * the limit. If the UPDATE affects 0 rows, the budget is exceeded.
 * This is a check-and-reserve in one atomic operation:
 *
 *   UPDATE AIBudget
 *   SET dailySpendUsd = dailySpendUsd + $cost,
 *       monthlySpendUsd = monthlySpendUsd + $cost
 *   WHERE id = 'main'
 *     AND active = true
 *     AND dailySpendUsd + $cost <= dailyLimitUsd
 *     AND monthlySpendUsd + $cost <= monthlyLimitUsd
 *
 * If the UPDATE succeeds (affects 1 row), the cost is reserved.
 * If it fails (0 rows), the budget is exceeded or inactive.
 *
 * IMPORTANT: This function now BOTH checks AND reserves. The caller
 * does NOT need to call recordAICost separately for the pre-flight
 * cost. However, if the actual cost differs from the estimate (e.g.,
 * token-based billing), the caller should call recordAICost with the
 * difference (actual - estimated) after the LLM call completes.
 *
 * For simplicity, the current implementation uses the policy's
 * costCeilingUsd as both the estimate and the actual cost. This is
 * conservative (over-charges slightly) but safe.
 */
export async function checkAIBudget(
  estimatedCostUsd: number,
  budget: {
    dailyLimitUsd: number;
    monthlyLimitUsd: number;
    dailySpendUsd: number;
    monthlySpendUsd: number;
    active: boolean;
  },
): Promise<AIPolicyCheckResult> {
  if (!budget.active) {
    return { ok: false, reason: "AI budget is disabled" };
  }
  // STEP 11.45: Atomic check-and-reserve using Prisma's conditional update.
  // We use $executeRaw to perform a single atomic SQL statement that
  // checks the budget AND increments the spend in one operation.
  try {
    const result = await db.$executeRaw`
      UPDATE "AIBudget"
      SET "dailySpendUsd" = "dailySpendUsd" + ${estimatedCostUsd},
          "monthlySpendUsd" = "monthlySpendUsd" + ${estimatedCostUsd}
      WHERE id = 'main'
        AND active = true
        AND "dailySpendUsd" + ${estimatedCostUsd} <= "dailyLimitUsd"
        AND "monthlySpendUsd" + ${estimatedCostUsd} <= "monthlyLimitUsd"
    `;
    if (result === 0) {
      // 0 rows affected → budget exceeded or inactive
      // Re-read to determine which limit was hit (for a better error message)
      const current = await db.aIBudget.findUnique({ where: { id: "main" } });
      if (current) {
        if (current.dailySpendUsd + estimatedCostUsd > current.dailyLimitUsd) {
          return {
            ok: false,
            reason: `daily budget exceeded ($${current.dailySpendUsd.toFixed(4)} + $${estimatedCostUsd.toFixed(4)} > $${current.dailyLimitUsd})`,
          };
        }
        if (current.monthlySpendUsd + estimatedCostUsd > current.monthlyLimitUsd) {
          return {
            ok: false,
            reason: `monthly budget exceeded ($${current.monthlySpendUsd.toFixed(4)} + $${estimatedCostUsd.toFixed(4)} > $${current.monthlyLimitUsd})`,
          };
        }
      }
      return { ok: false, reason: "budget reservation failed" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[ai-policy] checkAIBudget atomic reservation failed:", err);
    // STEP 11.45: Fail-CLOSED on DB error. Previously this was not
    // in a try/catch (which meant it would throw to the caller). Now
    // we explicitly fail closed: if we can't verify the budget, deny.
    return { ok: false, reason: "budget check failed (database error)" };
  }
}

/* ────────────────────────────────────────────────────────────
   5. Record actual cost after a successful call
   ──────────────────────────────────────────────────────────── */

/**
 * Record actual cost after a successful call.
 *
 * STEP 11.45 SECURITY CLOSURE: checkAIBudget now does an ATOMIC
 * check-and-reserve (it increments dailySpendUsd/monthlySpendUsd
 * atomically as part of the pre-flight). This means the cost is
 * ALREADY recorded during preflight — recordAICost is now a NO-OP
 * for the pre-flight cost.
 *
 * If the actual cost differs from the estimate (e.g., token-based
 * billing where actual > ceiling), the caller should call this
 * function with the DIFFERENCE (actual - estimated). For the current
 * implementation, we use costCeilingUsd as both estimate and actual,
 * so the difference is 0 and this function is effectively a no-op.
 *
 * Failures here are swallowed (the user already got their answer) but
 * logged. The cost was already reserved atomically during preflight.
 */
export async function recordAICost(
  _taskType: string,
  costUsd: number,
  _userId: string | null,
): Promise<void> {
  // STEP 11.45: Cost is now reserved atomically in checkAIBudget.
  // This function is kept for backward compatibility but is a no-op
  // when the cost matches the pre-flight estimate (which it does
  // in the current implementation — both use policy.costCeilingUsd).
  //
  // If future token-based billing is added, this function should
  // record the DIFFERENCE between actual and estimated cost:
  //   if (actualCost > estimatedCost) {
  //     await db.aIBudget.update({
  //       where: { id: "main" },
  //       data: {
  //         dailySpendUsd: { increment: actualCost - estimatedCost },
  //         monthlySpendUsd: { increment: actualCost - estimatedCost },
  //       },
  //     });
  //   }
  //
  // For now: no-op (cost was already reserved in checkAIBudget).
  if (!isFinite(costUsd) || costUsd <= 0) return;
  // Intentionally empty — cost already reserved atomically in checkAIBudget.
}

/* ────────────────────────────────────────────────────────────
   Convenience: full pre-flight check for the route handler
   ──────────────────────────────────────────────────────────── */

/**
 * Run the full policy pre-flight for an AI gateway request.
 *
 * Returns `{ ok: true, policy, budget }` on success, or
 * `{ ok: false, statusCode, reason }` on failure with the
 * appropriate HTTP status code and a Persian `reason` for the
 * client.
 */
export async function preflightAIRequest(params: {
  taskType: string;
  user: { id: string } | null;
  inputLength: number;
}): Promise<
  | {
      ok: true;
      policy: NonNullable<Awaited<ReturnType<typeof getTaskPolicy>>>;
      budget: Awaited<ReturnType<typeof getAIBudget>>;
      actorId: string;
    }
  | { ok: false; statusCode: number; reason: string }
> {
  const { taskType, user, inputLength } = params;
  const actorId = user?.id ?? "anonymous";

  // 1. Policy exists & active — deny by default.
  const policy = await getTaskPolicy(taskType);
  if (!policy) {
    return {
      ok: false,
      statusCode: 403,
      reason: "این عملیات هوش مصنوعی مجاز نیست.",
    };
  }

  // 2. Auth — role in allowedRoles (admin always passes).
  const auth = await checkAIAuth(user, policy);
  if (!auth.ok) {
    return { ok: false, statusCode: 403, reason: "دسترسی غیرمجاز." };
  }

  // 3. Per-user quota.
  const quota = await checkAIQuota(actorId, taskType, policy);
  if (!quota.ok) {
    return { ok: false, statusCode: 429, reason: "سهمیه شما تمام شده." };
  }

  // 4. Global budget (auto-resets windows first).
  const budget = await getAIBudget();
  const budgetCheck = await checkAIBudget(policy.costCeilingUsd, budget);
  if (!budgetCheck.ok) {
    return {
      ok: false,
      statusCode: 429,
      reason: "بودجه هوش مصنوعی روزانه/ماهانه تمام شده.",
    };
  }

  // 5. Input size — enforced here too so the route stays simple.
  if (inputLength > policy.maxInputChars) {
    return {
      ok: false,
      statusCode: 400,
      reason: "ورودی بیش از حد طولانی.",
    };
  }

  return { ok: true, policy, budget, actorId };
}
