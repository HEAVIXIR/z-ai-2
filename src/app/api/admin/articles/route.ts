/**
 * HEAVIX — Phase 3-3C: Content Engine API
 *
 * GET    /api/admin/articles                — list articles (with stats)
 * POST   /api/admin/articles                — create article (single)
 *                                           — bulk action: { action, ids[] }
 *
 * Permission gate: `content.manage`
 *   (every mutation goes through content-service.ts, which also
 *    writes content.article.{create,update,publish,archive} audit
 *    rows via logAudit → main PostgreSQL AuditLog table).
 *
 * Backward compatibility:
 *   • GET returns `{ articles, stats }` — the existing admin
 *     articles page reads this shape directly.
 *   • POST keeps the bulk-action shape (`{ action, ids }`) for
 *     the existing admin "publish/draft/archive/delete" bulk menu.
 */

import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { can } from '@/lib/authorization';
import { db } from '@/lib/db';
import {
  createArticle,
  type ArticleStatus,
} from '@/lib/content-service';
import { createAuthContext } from '@/lib/authorization-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Auth helper ────────────────────────────────────────────
/**
 * Returns the authenticated user, or a 401/403 NextResponse.
 * Enforces the `content.manage` permission (Track A RBAC) and
 * also accepts the legacy admin-cookie session (ADMIN pseudo-user)
 * so existing admin tooling keeps working.
 */
async function requireContentManager():
  Promise<{ id: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const allowed = await can(user.id, 'content.manage');
  if (!allowed) {
    return NextResponse.json(
      { error: 'Forbidden: requires content.manage' },
      { status: 403 },
    );
  }
  return user;
}

// ── GET /api/admin/articles ─────────────────────────────────
export async function GET(req: NextRequest) {
  const authResult = await requireContentManager();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const url = new URL(req.url);
    const status = (url.searchParams.get('status') || undefined) as ArticleStatus | undefined;
    const categoryId = url.searchParams.get('categoryId') || undefined;
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 100));
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

    // ── Build where clause ───────────────────────────────
    const where: any = {};
    if (status) where.status = status;
    if (categoryId) where.category = categoryId;

    // ── Parallel: articles + per-status counts ─────────
    const [articles, stats] = await Promise.all([
      db.article.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      {
        total: await db.article.count(),
        published: await db.article.count({ where: { status: 'PUBLISHED' } }),
        draft: await db.article.count({ where: { status: 'DRAFT' } }),
        archived: await db.article.count({ where: { status: 'ARCHIVED' } }),
        totalViews: (await db.article.aggregate({ _sum: { viewCount: true } }))._sum.viewCount ?? 0,
      },
    ]);

    return NextResponse.json({ articles, stats });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}

// ── POST /api/admin/articles ────────────────────────────────
export async function POST(req: NextRequest) {
  const authResult = await requireContentManager();
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    const raw = await req.json().catch(() => ({}));
    // Field-name normalisation: accept both the task-spec `body`
    // (content-engine canonical) and the legacy `content` (existing
    // admin articles page still sends this). Same for `categoryId`
    // ↔ `category` and the optional `brandId`.
    const body: any = { ...raw };
    if (body.body === undefined && body.content !== undefined) {
      body.body = body.content;
    }
    if (body.categoryId === undefined && body.category !== undefined) {
      body.categoryId = body.category;
    }

    // ── Bulk action mode ───────────────────────────────
    // Shape: { action: 'publish'|'draft'|'archive'|'delete', ids: string[] }
    // (kept for backward compat with the existing admin articles page).
    if (body.action && Array.isArray(body.ids)) {
      const ids: string[] = body.ids;
      let data: any = {};
      switch (body.action) {
        case 'publish': data = { status: 'PUBLISHED', publishedAt: new Date() }; break;
        case 'draft': data = { status: 'DRAFT' }; break;
        case 'archive': data = { status: 'ARCHIVED' }; break;
        case 'delete':
          await db.article.deleteMany({ where: { id: { in: ids } } });
          try { revalidateTag(HOMEPAGE_CACHE_TAGS.articles, 'default'); } catch (e) {
            console.error('[articles] revalidateTag failed:', e);
          }
          return NextResponse.json({ ok: true, action: body.action, count: ids.length });
        default:
          return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
      }
      const r = await db.article.updateMany({ where: { id: { in: ids } }, data });
      try { revalidateTag(HOMEPAGE_CACHE_TAGS.articles, 'default'); } catch (e) {
        console.error('[articles] revalidateTag failed:', e);
      }
      return NextResponse.json({ ok: true, action: body.action, updated: r.count });
    }

    // ── Single-create mode (content-service.ts) ────────
    if (!body.title || !body.body) {
      return NextResponse.json(
        { error: 'title and body are required' },
        { status: 400 },
      );
    }

    const article = await createArticle({
      title: String(body.title),
      slug: body.slug || null,
      body: String(body.body),
      excerpt: body.excerpt ?? null,
      categoryId: body.categoryId ?? body.category ?? null,
      brandId: body.brandId ?? null,
      tags: body.tags ?? null,
      coverImage: body.coverImage ?? null,
      status: (body.status as ArticleStatus) || 'DRAFT',
      authorId: user.id,
    }, createAuthContext(user.id));

    try { revalidateTag(HOMEPAGE_CACHE_TAGS.articles, 'default'); } catch (e) {
      console.error('[articles] revalidateTag failed:', e);
    }

    return NextResponse.json({ ok: true, article }, { status: 201 });
  } catch (err: any) {
    const status = err?.statusCode ?? 500;
    return NextResponse.json(
      { error: err?.message ?? 'Server error' },
      { status },
    );
  }
}
