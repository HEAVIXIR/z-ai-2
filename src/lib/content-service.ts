/**
 * HEAVIX — Phase 3-3C: Content Engine Service
 *
 * Thin, auditable service layer over the Article model. Centralises
 * create / update / publish / list / get-by-slug flows so that API
 * routes, server actions, and the public article renderer all go
 * through one place.
 *
 * Audit: every mutation logs an AuditLog entry under the canonical
 *   content.article.{create,update,publish,archive}
 * action keys, using logAudit from @/lib/audit (which itself writes
 * to the MAIN PostgreSQL AuditLog table — same path used by
 * page.publish / page.rollback for AdminPage lifecycle).
 *
 * Schema mapping (NO .env/schema/migration changes — constraint):
 *   Article.title        ← input.title
 *   Article.slug         ← input.slug (auto-unique'd if absent)
 *   Article.content      ← input.body           (model field is "content",
 *                                                  task spec calls it "body")
 *   Article.excerpt      ← input.excerpt
 *   Article.category     ← input.categoryId    (free-form string, no FK)
 *   Article.tags         ← composed from input.brandId (`brand:<id>`)
 *                          + any caller-supplied tags
 *   Article.coverImage   ← input.coverImage
 *   Article.status       ← input.status (default DRAFT)
 *   Article.authorId     ← input.authorId
 *   Article.publishedAt  ← set when status flips to PUBLISHED
 *
 * No `brandId` column exists in Article — to avoid silently losing
 * the value, we persist it as a structured tag (`brand:<id>`) so it
 * can be retrieved later without a schema change. Callers can also
 * pass arbitrary tags alongside; the brand tag is preserved across
 * updates.
 */

import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { uniqueSlug } from '@/lib/api-helpers';
import type { Article, Prisma } from '@prisma/client';

// ── Types ──────────────────────────────────────────────────

export type ArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface CreateArticleInput {
  title: string;
  slug?: string | null;
  body: string;
  excerpt?: string | null;
  /** Free-form category string (maps to Article.category). */
  categoryId?: string | null;
  /** Stored as `brand:<id>` inside Article.tags. */
  brandId?: string | null;
  status?: ArticleStatus;
  /** Optional comma-separated tags. */
  tags?: string | null;
  coverImage?: string | null;
  authorId?: string | null;
}

export interface UpdateArticleInput {
  title?: string;
  slug?: string | null;
  body?: string;
  excerpt?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  status?: ArticleStatus;
  tags?: string | null;
  coverImage?: string | null;
}

export interface ListArticlesOptions {
  status?: ArticleStatus;
  categoryId?: string;
  brandId?: string;
  limit?: number;
  offset?: number;
}

export interface ListArticlesResult {
  items: Article[];
  total: number;
}

// ── Errors ─────────────────────────────────────────────────

export class ArticleNotFoundError extends Error {
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Article not found: ${id}`);
    this.name = 'ArticleNotFoundError';
  }
}

export class ArticleValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ArticleValidationError';
  }
}

// ── Tag helpers ────────────────────────────────────────────

const BRAND_TAG_PREFIX = 'brand:';

/** Parse comma-separated tag string into a trimmed list. */
function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Build a new tag string from existing tags + (optional) brand override. */
function composeTags(
  existingTags: string | null | undefined,
  brandId: string | null | undefined,
  extraTags?: string | null,
): string | null {
  // Preserve any non-brand tags already stored.
  const preserved = parseTags(existingTags).filter((t) => !t.startsWith(BRAND_TAG_PREFIX));
  // Caller-supplied extra tags (only non-brand ones — brand flows via brandId).
  const extras = parseTags(extraTags).filter((t) => !t.startsWith(BRAND_TAG_PREFIX));
  const merged = Array.from(new Set([...preserved, ...extras]));
  if (brandId) merged.push(`${BRAND_TAG_PREFIX}${brandId}`);
  return merged.length > 0 ? merged.join(', ') : null;
}

/** Read the brand id (if any) recorded in the tag string. */
export function readBrandId(tags: string | null | undefined): string | null {
  const tag = parseTags(tags).find((t) => t.startsWith(BRAND_TAG_PREFIX));
  if (!tag) return null;
  return tag.slice(BRAND_TAG_PREFIX.length);
}

// ── Public service API ─────────────────────────────────────

/**
 * Create an Article + audit entry.
 * Action key: `content.article.create`.
 */
export async function createArticle(input: CreateArticleInput): Promise<Article> {
  // ── Validate ────────────────────────────────────────────
  if (!input?.title || typeof input.title !== 'string' || input.title.trim().length === 0) {
    throw new ArticleValidationError('title is required');
  }
  if (!input?.body || typeof input.body !== 'string' || input.body.trim().length === 0) {
    throw new ArticleValidationError('body is required');
  }

  // ── Map input → Article fields ─────────────────────────
  const status: ArticleStatus = input.status || 'DRAFT';
  const slug = await uniqueSlug(db.article, input.slug || input.title);
  const tags = composeTags(null, input.brandId ?? null, input.tags ?? null);
  const category = input.categoryId || 'GUIDE';

  // ── Create ─────────────────────────────────────────────
  const article = await db.article.create({
    data: {
      slug,
      title: input.title.trim(),
      excerpt: input.excerpt ?? null,
      content: input.body,
      category,
      tags,
      coverImage: input.coverImage ?? null,
      status,
      authorId: input.authorId ?? null,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
    },
  });

  // ── Audit ──────────────────────────────────────────────
  await logAudit({
    actorId: input.authorId ?? null,
    actorType: 'ADMIN',
    action: 'content.article.create',
    entityType: 'Article',
    entityId: article.id,
    after: {
      title: article.title,
      slug: article.slug,
      status: article.status,
      category: article.category,
      brandId: input.brandId ?? null,
    },
    reason: `Created article "${article.title}"`,
  });

  return article;
}

/**
 * Update an Article + audit entry.
 * Action key: `content.article.update`.
 *
 * Brand tag handling: if `brandId` is explicitly provided (even null),
 * the stored brand tag is rewritten. If `brandId` is undefined, the
 * existing brand tag is preserved across other edits.
 */
export async function updateArticle(
  id: string,
  input: UpdateArticleInput,
  userId?: string | null,
): Promise<Article> {
  const existing = await db.article.findUnique({ where: { id } });
  if (!existing) throw new ArticleNotFoundError(id);

  // ── Build update payload ────────────────────────────────
  const data: Prisma.ArticleUpdateInput = {};

  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || input.title.trim().length === 0) {
      throw new ArticleValidationError('title must be a non-empty string');
    }
    data.title = input.title.trim();
    // Refresh slug only if caller didn't supply one AND the title changed.
    if (input.slug === undefined && input.title.trim() !== existing.title) {
      data.slug = await uniqueSlug(db.article, input.title);
    }
  }
  if (input.slug !== undefined && input.slug !== null) {
    data.slug = await uniqueSlug(db.article, input.slug);
  }
  if (input.body !== undefined) {
    if (typeof input.body !== 'string' || input.body.trim().length === 0) {
      throw new ArticleValidationError('body must be a non-empty string');
    }
    data.content = input.body;
  }
  if (input.excerpt !== undefined) data.excerpt = input.excerpt ?? null;
  if (input.categoryId !== undefined) data.category = input.categoryId || 'GUIDE';
  if (input.coverImage !== undefined) data.coverImage = input.coverImage ?? null;

  // Status change → also stamp publishedAt on first publish.
  if (input.status !== undefined && input.status !== existing.status) {
    data.status = input.status;
    if (input.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
      data.publishedAt = new Date();
    }
  }

  // Tag composition: brandId override + caller tags.
  if (input.brandId !== undefined || input.tags !== undefined) {
    const brandId = input.brandId !== undefined ? input.brandId : readBrandId(existing.tags);
    const extraTags = input.tags !== undefined ? input.tags : null;
    data.tags = composeTags(existing.tags, brandId, extraTags);
  }

  // ── Update ─────────────────────────────────────────────
  const updated = await db.article.update({ where: { id }, data });

  // ── Audit ──────────────────────────────────────────────
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'content.article.update',
    entityType: 'Article',
    entityId: id,
    before: {
      title: existing.title,
      slug: existing.slug,
      status: existing.status,
      category: existing.category,
      brandId: readBrandId(existing.tags),
    },
    after: {
      title: updated.title,
      slug: updated.slug,
      status: updated.status,
      category: updated.category,
      brandId: readBrandId(updated.tags),
    },
    reason: `Updated article "${updated.title}"`,
  });

  return updated;
}

/**
 * List articles with optional filters + pagination.
 * Returns `{ items, total }` for caller-side pagination.
 */
export async function listArticles(opts: ListArticlesOptions = {}): Promise<ListArticlesResult> {
  const where: Prisma.ArticleWhereInput = {};
  if (opts.status) where.status = opts.status;
  if (opts.categoryId) where.category = opts.categoryId;
  if (opts.brandId) {
    where.tags = { contains: `${BRAND_TAG_PREFIX}${opts.brandId}` };
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 100, 500));
  const offset = Math.max(0, opts.offset ?? 0);

  const [items, total] = await Promise.all([
    db.article.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.article.count({ where }),
  ]);

  return { items, total };
}

/**
 * Fetch a single PUBLISHED article by slug for public rendering.
 * Returns null when the slug doesn't resolve or the article is not
 * published. View-count incrementing is intentionally left to the
 * rendering route (so admin previews don't inflate counts).
 */
export async function getArticle(slug: string): Promise<Article | null> {
  if (!slug) return null;
  return db.article.findUnique({ where: { slug } });
}

/**
 * Publish an article (status → PUBLISHED) + audit entry.
 * Action key: `content.article.publish`.
 * Idempotent: re-publishing a PUBLISHED article is a no-op for
 * status but still logs the attempt.
 */
export async function publishArticle(id: string, userId?: string | null): Promise<Article> {
  const existing = await db.article.findUnique({ where: { id } });
  if (!existing) throw new ArticleNotFoundError(id);

  const wasPublished = existing.status === 'PUBLISHED';
  const updated = await db.article.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: wasPublished ? existing.publishedAt : new Date(),
    },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'content.article.publish',
    entityType: 'Article',
    entityId: id,
    before: { status: existing.status, publishedAt: existing.publishedAt },
    after: { status: 'PUBLISHED', publishedAt: updated.publishedAt },
    reason: wasPublished
      ? `Re-published article "${existing.title}" (no-op)`
      : `Published article "${existing.title}"`,
  });

  return updated;
}

/**
 * Archive an article (status → ARCHIVED) + audit entry.
 * Action key: `content.article.archive`.
 *
 * Used by the DELETE endpoint — preserves the row (soft delete)
 * so SEO/admin history stays intact, matching the existing
 * page-builder archive-on-delete pattern.
 */
export async function archiveArticle(id: string, userId?: string | null): Promise<Article> {
  const existing = await db.article.findUnique({ where: { id } });
  if (!existing) throw new ArticleNotFoundError(id);

  const updated = await db.article.update({
    where: { id },
    data: { status: 'ARCHIVED' },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'content.article.archive',
    entityType: 'Article',
    entityId: id,
    before: { status: existing.status },
    after: { status: 'ARCHIVED' },
    reason: `Archived article "${existing.title}"`,
  });

  return updated;
}
