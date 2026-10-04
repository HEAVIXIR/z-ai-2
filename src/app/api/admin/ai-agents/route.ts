import { NextResponse } from "next/server";
import { listAgents, runAgent } from "@/lib/ai-agents";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/ai-agents — AI Agents platform (P2-26)
   HEAVIX-P0-IMPLEMENTATION-PLAN.md P2-26
   ------------------------------------------------------------
   GET  — list all agents with status.
   POST — { key } run an agent (admin only). Returns { ok, summary }.

   AI SUGGESTS — admin APPROVES (HBR-1.0 law 8). Running an agent
   does NOT mutate any DB-truth row; it only writes AI_SUGGESTED
   rows with verified=false or side-effect-free audit entries.
   ============================================================ */

export async function GET() {
  // CP-02.15.3: migrated from authorizeAdmin() legacy hybrid to canonical requireAdmin(perm)
  const [, error] = await requireAdmin("ai.read");
  if (error) return error;
  try {
    const agents = await listAgents();
    return NextResponse.json({ ok: true, agents });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  // CP-02.15.3: migrated from authorizeAdmin() legacy hybrid to canonical requireAdmin(perm)
  const [user, error] = await requireAdmin("ai.manage");
  if (error) return error;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.key !== "string" || !body.key.trim()) {
      return NextResponse.json(
        { error: "فیلد key الزامی است." },
        { status: 400 },
      );
    }
    const key = body.key.trim();

    // Audit the admin's run request (the agent itself also logs an
    // AI-action audit entry; this entry records the admin trigger).
    await logAudit({
      actorId: user?.id ?? null,
      actorType: "ADMIN",
      action: "ai.agent.run",
      entityType: "AIAgent",
      entityId: null,
      after: { key },
      reason: `اجرا از سوی ادمین: ${key}`,
    });

    const result = await runAgent(key);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
