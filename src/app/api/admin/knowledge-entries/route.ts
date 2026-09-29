import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

/* ============================================================
   /api/admin/knowledge-entries
   GET  — list all knowledge entries
   POST — create or update entry
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "knowledge.read"))) {
    return NextResponse.json(
      { error: "Forbidden: requires knowledge.read" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType") || "";
  const verified = url.searchParams.get("verified");

  const where: Record<string, unknown> = {};
  if (entityType) where.entityType = entityType;
  if (verified === "true") where.verified = true;
  if (verified === "false") where.verified = false;

  const entries = await db.knowledgeEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const stats = {
    total: entries.length,
    verified: entries.filter((e) => e.verified).length,
    aiSuggested: entries.filter((e) => e.aiSuggested).length,
    bySource: entries.reduce((acc, e) => { acc[e.source] = (acc[e.source] || 0) + 1; return acc; }, {} as Record<string, number>),
  };

  return NextResponse.json({
    success: true,
    stats,
    data: entries.map((e) => ({
      ...e,
      verifiedAt: e.verifiedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "knowledge.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires knowledge.manage" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();

    // Upsert by unique [entityType, entityId, key]
    const existing = await db.knowledgeEntry.findUnique({
      where: { entityType_entityId_key: { entityType: body.entityType, entityId: body.entityId, key: body.key } },
    });

    if (existing) {
      const updated = await db.knowledgeEntry.update({
        where: { id: existing.id },
        data: {
          value: body.value,
          unit: body.unit || null,
          source: body.source || "HEAVIX",
          sourceUrl: body.sourceUrl || null,
          verified: body.verified ?? false,
          aiSuggested: body.aiSuggested ?? false,
        },
      });
      await logAudit({
        actorId: sessionUser.id,
        actorType: "ADMIN",
        action: "admin.knowledgeEntries.update",
        entityType: "KnowledgeEntry",
        entityId: updated.id,
        before: { value: existing.value, unit: existing.unit, source: existing.source, verified: existing.verified, aiSuggested: existing.aiSuggested },
        after: { value: updated.value, unit: updated.unit, source: updated.source, verified: updated.verified, aiSuggested: updated.aiSuggested },
        reason: "via admin API",
      });
      return NextResponse.json({ success: true, data: updated });
    } else {
      const created = await db.knowledgeEntry.create({
        data: {
          entityType: body.entityType,
          entityId: body.entityId,
          title: body.title || `${body.entityType} ${body.key}`,
          key: body.key,
          value: body.value,
          unit: body.unit || null,
          source: body.source || "HEAVIX",
          sourceUrl: body.sourceUrl || null,
          verified: body.verified ?? false,
          aiSuggested: body.aiSuggested ?? false,
        },
      });
      await logAudit({
        actorId: sessionUser.id,
        actorType: "ADMIN",
        action: "admin.knowledgeEntries.create",
        entityType: "KnowledgeEntry",
        entityId: created.id,
        after: { entityType: created.entityType, entityId: created.entityId, key: created.key, value: created.value, source: created.source, verified: created.verified, aiSuggested: created.aiSuggested },
        reason: "via admin API",
      });
      return NextResponse.json({ success: true, data: created });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
