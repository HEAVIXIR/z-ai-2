/**
 * HEAVIX — Phase 3-3C: Content Engine API — Article Detail
 *
 * GET    /api/admin/articles/:id   — fetch a single article
 * PATCH  /api/admin/articles/:id   — update an article
 * DELETE /api/admin/articles/:id   — archive (soft delete)
 *
 * Permission gate: `content.manage`
 *   Mutations route through content-service.ts, which writes
 *   `content.article.{update,archive}` audit rows via logAudit.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { can } from '@/lib/authorization';
import {
  updateArticle,
  archiveArticle,
  type ArticleStatus,
} from '@/lib/content-service';
import { createAuthContext } from '@/lib/authorization-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

// ── Auth helper (same gate as the list route) ─────────────
async function requireContentManager() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const allowed = await can(user.id, 'content.manage');
  if (!allowed) {
    return {
      user: null,
      response: NextResponse.json(
        { error: 'Forbidden: requires content.manage' },
        { status: 403 },
      ),
    };
  }
  return { user, response: null };
}

// ── GET /api/admin/articles/:id ───────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { response } = await requireContentManager();
  if (response) return response;

  try {
    const { id } = await params;
    // Lazy-import db to keep the auth helper side-effect-free at
    // module load (db import triggers Prisma client init).
    const { db } = await import('@/lib/db');
    const article = await db.article.findUnique({ where: { id } });
    if (!article) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, article });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}

// ── PATCH /api/admin/articles/:id ─────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const { user, response } = await requireContentManager();
  if (response) return response;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    // Allow callers that still send the legacy `content` field name
    // (the old admin articles form does) — normalise to `body`.
    const normalised: any = { ...body };
    if (body.body === undefined && body.content !== undefined) {
      normalised.body = body.content;
    }
    // Allow `category` field-name as alias for `categoryId`.
    if (body.categoryId === undefined && body.category !== undefined) {
      normalised.categoryId = body.category;
    }

    const article = await updateArticle(
      id,
      {
        title: normalised.title,
        slug: normalised.slug,
        body: normalised.body,
        excerpt: normalised.excerpt,
        categoryId: normalised.categoryId,
        brandId: normalised.brandId,
        status: normalised.status as ArticleStatus | undefined,
        tags: normalised.tags,
        coverImage: normalised.coverImage,
      },
      user.id,
      createAuthContext(user.id)
    );

    return NextResponse.json({ ok: true, article });
  } catch (err: any) {
    const status = err?.statusCode ?? 500;
    return NextResponse.json(
      { error: err?.message ?? 'Server error' },
      { status },
    );
  }
}

// ── DELETE /api/admin/articles/:id ────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { user, response } = await requireContentManager();
  if (response) return response;

  try {
    const { id } = await params;
    const article = await archiveArticle(id, user.id,
      createAuthContext(user.id));
    return NextResponse.json({ ok: true, article });
  } catch (err: any) {
    const status = err?.statusCode ?? 500;
    return NextResponse.json(
      { error: err?.message ?? 'Server error' },
      { status },
    );
  }
}
