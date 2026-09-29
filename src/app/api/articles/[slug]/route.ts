/**
 * HEAVIX — Legacy article mutation route (slug-keyed).
 *
 * Phase 7 — STEP 2 SECURITY CLOSURE (Directive 47, SEC-1 / G-1):
 *   Previously used `isAuthenticated()` only — any authenticated user
 *   (incl. BUYER) could mutate/delete any article. Now hardened with
 *   `content.manage` RBAC + mandatory audit via `logAudit`.
 *
 * The canonical admin route `/api/admin/articles/[id]` (id-keyed,
 * routed through content-service.ts) remains the preferred path.
 * This slug-keyed route is retained for backward compatibility but
 * now enforces the same authorization + audit contract.
 *
 * Audit vocabulary mirrors content-service.ts:
 *   PATCH  → content.article.update
 *   DELETE → content.article.delete  (hard delete; distinct from
 *            content.article.archive which is the soft-archive
 *            performed by the canonical admin route)
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ slug: string }>;
}

// ── Authorization helper (mirrors /api/admin/articles/[id] gate) ──────
async function requireContentManager() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null as null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const allowed = await can(user.id, "content.manage");
  if (!allowed) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Forbidden: requires content.manage" },
        { status: 403 },
      ),
    };
  }
  return { user, response: null };
}

/* PATCH /api/articles/[slug] — update article (requires content.manage, audited). */
export async function PATCH(req: Request, { params }: Params) {
  const { user, response } = await requireContentManager();
  if (response) return response;

  try {
    const { slug } = await params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.article.findUnique({ where: { slug } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: any = {};
    const allowed = [
      "title", "excerpt", "content", "category", "tags", "coverImage",
      "status", "publishedAt",
    ];
    for (const k of allowed) {
      if (k in body) data[k] = body[k] === undefined ? null : body[k];
    }
    // If title changed, update slug too (preserves legacy behaviour)
    if (body.title && body.title !== existing.title) {
      const newSlug = `${body.title
        .toLowerCase()
        .replace(/[^\w\u0600-\u06FF-]+/g, "-")
        .replace(/^-+|-+$/g, "")}-${Date.now().toString(36)}`;
      data.slug = newSlug;
    }

    const article = await db.article.update({
      where: { id: existing.id },
      data,
    });

    // ── Audit (matches content-service.ts vocabulary) ──────────────
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "content.article.update",
      entityType: "Article",
      entityId: existing.id,
      before: {
        title: existing.title,
        slug: existing.slug,
        status: existing.status,
        category: existing.category,
      },
      after: {
        title: article.title,
        slug: article.slug,
        status: article.status,
        category: article.category,
        changedFields: Object.keys(data),
      },
      reason: "legacy-slug-route:PATCH",
    });

    return NextResponse.json({ ok: true, article });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* DELETE /api/articles/[slug] — hard delete (requires content.manage, audited). */
export async function DELETE(_req: Request, { params }: Params) {
  const { user, response } = await requireContentManager();
  if (response) return response;

  try {
    const { slug } = await params;
    const existing = await db.article.findUnique({ where: { slug } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.article.delete({ where: { id: existing.id } });

    // ── Audit (hard-delete — distinct from soft-archive) ────────────
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "content.article.delete",
      entityType: "Article",
      entityId: existing.id,
      before: {
        title: existing.title,
        slug: existing.slug,
        status: existing.status,
        category: existing.category,
      },
      reason: "legacy-slug-route:DELETE",
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
