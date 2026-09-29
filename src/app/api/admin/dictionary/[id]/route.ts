import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseBool } from "@/lib/api-helpers";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const ENTITY_LABELS: Record<string, string> = {
  MACHINE: "ماشین‌آلات",
  BRAND: "برند",
  MODEL: "مدل",
  PART: "قطعه",
  CATEGORY: "دسته‌بندی",
};

const ALIAS_LABELS: Record<string, string> = {
  SYNONYM: "مترادف",
  COMMON_NAME: "نام رایج",
  ENGLISH: "انگلیسی",
  ABBREVIATION: "اختصار",
  MISSPELLING: "املای غلط",
};

/* GET /api/admin/dictionary/[id] — single term detail. */
export async function GET(_req: Request, { params }: Params) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "dictionary.read"))) {
    return NextResponse.json(
      { error: "Forbidden: requires dictionary.read" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;
    const term = await db.industrialTerm.findUnique({
      where: { id },
      include: { aliases: { orderBy: { aliasType: "asc" } } },
    });
    if (!term) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: {
        ...term,
        entityLabel: term.entityType
          ? ENTITY_LABELS[term.entityType] ?? term.entityType
          : null,
        aliases: term.aliases.map((a) => ({
          ...a,
          aliasLabel: ALIAS_LABELS[a.aliasType] ?? a.aliasType,
        })),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* PATCH /api/admin/dictionary/[id] — admin update.
   Body fields: canonical, entityType, entityId, description, active, aliases[].
   Aliases are handled with a REPLACE strategy (delete all, recreate).
*/
export async function PATCH(req: Request, { params }: Params) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "dictionary.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires dictionary.manage" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.industrialTerm.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: any = {};
    if ("canonical" in body) {
      const c = String(body.canonical ?? "").trim();
      if (!c) {
        return NextResponse.json(
          { error: "canonical cannot be empty" },
          { status: 400 },
        );
      }
      data.canonical = c;
    }
    if ("entityType" in body) {
      data.entityType = body.entityType ? String(body.entityType) : null;
    }
    if ("entityId" in body) {
      data.entityId = body.entityId ? String(body.entityId) : null;
    }
    if ("description" in body) {
      data.description = body.description ? String(body.description) : null;
    }
    if ("active" in body) {
      data.active = parseBool(body.active);
    }

    // Update scalar fields first.
    const updated = await db.industrialTerm.update({
      where: { id },
      data,
    });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.industrialTerms.update",
      entityType: "IndustrialTerm",
      entityId: updated.id,
      before: { canonical: existing.canonical, entityType: existing.entityType, entityId: existing.entityId, description: existing.description, active: existing.active },
      after: { canonical: updated.canonical, entityType: updated.entityType, entityId: updated.entityId, description: updated.description, active: updated.active },
      reason: "via admin API",
    });

    // Aliases — REPLACE strategy if provided.
    if (Array.isArray(body.aliases)) {
      const incomingAliases: Array<{ alias: string; aliasType: string }> =
        body.aliases
          .map((a: any) => ({
            alias: String(a?.alias ?? "").trim(),
            aliasType: String(a?.aliasType ?? "SYNONYM").toUpperCase(),
          }))
          .filter((a: { alias: string }) => a.alias.length > 0);

      // Wipe existing aliases.
      await db.termAlias.deleteMany({ where: { termId: id } });
      await logAudit({
        actorId: sessionUser.id,
        actorType: "ADMIN",
        action: "admin.termAliases.deleteMany",
        entityType: "TermAlias",
        entityId: id,
        before: { termId: id },
        reason: "via admin API",
      });

      // Recreate (skipping duplicates within the same payload).
      const seen = new Set<string>();
      for (const a of incomingAliases) {
        if (seen.has(a.alias)) continue;
        seen.add(a.alias);
        try {
          const createdAlias = await db.termAlias.create({
            data: { termId: id, alias: a.alias, aliasType: a.aliasType },
          });
          await logAudit({
            actorId: sessionUser.id,
            actorType: "ADMIN",
            action: "admin.termAliases.create",
            entityType: "TermAlias",
            entityId: createdAlias.id,
            after: { termId: id, alias: a.alias, aliasType: a.aliasType },
            reason: "via admin API",
          });
        } catch {
          // ignore individual insert failures (e.g. race condition)
        }
      }
    }

    const refreshed = await db.industrialTerm.findUnique({
      where: { id },
      include: { aliases: { orderBy: { aliasType: "asc" } } },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...refreshed,
        entityLabel: refreshed?.entityType
          ? ENTITY_LABELS[refreshed.entityType] ?? refreshed.entityType
          : null,
        aliases: refreshed?.aliases.map((a) => ({
          ...a,
          aliasLabel: ALIAS_LABELS[a.aliasType] ?? a.aliasType,
        })),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* DELETE /api/admin/dictionary/[id] — admin delete.
   TermAlias rows cascade-delete via onDelete: Cascade in the schema. */
export async function DELETE(_req: Request, { params }: Params) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "dictionary.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires dictionary.manage" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;
    const existing = await db.industrialTerm.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await db.industrialTerm.delete({ where: { id } });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.industrialTerms.delete",
      entityType: "IndustrialTerm",
      entityId: id,
      before: { canonical: existing.canonical, entityType: existing.entityType, entityId: existing.entityId, description: existing.description, active: existing.active },
      reason: "via admin API",
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
