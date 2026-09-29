import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  getSEO,
  fetchEntity,
  searchEntities,
  generateMetaTitle,
  generateMetaDescription,
  generateStructuredData,
  SEO_ENTITY_TYPES,
} from "@/lib/seo";
import {
  updateSEO,
  listSEO,
  type UpdateSEOInput,
} from "@/lib/seo-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/seo — SEO metadata CRUD (P2-28 + Wave 3B)
   ------------------------------------------------------------
   GET    ?entityType=&entityId=            — get SEO for an entity
          ?search=&entityType=               — search entities for picker
          ?entityType=&list=1                — list all SEO rows for an
                                                entity type (Wave 3B)
   POST   { entityType, entityId, ...seo }  — upsert via seo-service
   PUT    { entityType, entityId, ...seo }  — legacy upsert (still works)
   PATCH  { entityType, entityId, ...seo }  — alias for POST/PUT
   DELETE { entityType, entityId }          — delete SEO row
   ------------------------------------------------------------
   Phase 7 — STEP 5 (Directive 47, SEC-3/4/5):
     • Auth unified to `requireAdmin('seo.read' | 'seo.manage')`
       (central RBAC permission check — no longer a bare isAdmin role gate).
     • Field-level validation enforced inline (matches seoConfig.fields
       maxLength/min/max rules; previously the dedicated route bypassed
       validateResourcePayload, allowing unbounded payloads).
     • DELETE handler added (previously the UI's Delete button 405'd;
       seoConfig.actions.delete declared DELETE but no handler existed).
   ============================================================ */

function isValidEntityType(t: string): boolean {
  return (SEO_ENTITY_TYPES as readonly string[]).includes(t);
}

// ── Phase 7 STEP 5.2 — field-level validation (matches seoConfig.fields) ──
const SITEMAP_FREQS = new Set([
  "always", "hourly", "daily", "weekly", "monthly", "yearly", "never",
]);

interface FieldError { field: string; reason: string }

function validateSEOFields(body: Record<string, unknown>): FieldError[] {
  const errs: FieldError[] = [];
  const str = (v: unknown, max: number, field: string) => {
    if (v === undefined || v === null) return; // optional
    if (typeof v !== "string") { errs.push({ field, reason: `${field} must be a string` }); return; }
    if (v.length > max) errs.push({ field, reason: `${field} exceeds ${max} chars` });
  };
  // Accept both Wave 3B task names and legacy schema names.
  str(body.title ?? body.metaTitle, 200, "metaTitle");
  str(body.description ?? body.metaDescription, 500, "metaDescription");
  str(body.keywords, 500, "keywords");
  str(body.canonical ?? body.canonicalUrl, 500, "canonicalUrl");
  str(body.ogTitle, 200, "ogTitle");
  str(body.ogDescription, 500, "ogDescription");
  str(body.ogImage, 500, "ogImage");
  str(body.structuredData, 5000, "structuredData");
  // sitemapPriority: 0..1
  const sp = body.sitemapPriority;
  if (sp !== undefined && sp !== null) {
    const n = Number(sp);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      errs.push({ field: "sitemapPriority", reason: "must be a number 0..1" });
    }
  }
  // sitemapChangeFreq: enum
  const sf = body.sitemapChangeFreq;
  if (sf !== undefined && sf !== null) {
    if (typeof sf !== "string" || !SITEMAP_FREQS.has(sf)) {
      errs.push({ field: "sitemapChangeFreq", reason: "invalid frequency" });
    }
  }
  return errs;
}

export async function GET(req: Request) {
  const [user, error] = await requireAdmin("seo.read");
  if (error) return error;
  try {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType")?.trim() || "";
    const entityId = url.searchParams.get("entityId")?.trim() || "";
    const searchQ = url.searchParams.get("search")?.trim() || "";
    const listFlag = url.searchParams.get("list");
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    // ── List mode (Wave 3B)
    if (listFlag === "1" || listFlag === "true") {
      if (entityType && !isValidEntityType(entityType)) {
        return NextResponse.json(
          { error: "entityType نامعتبر است." },
          { status: 400 },
        );
      }
      const rows = await listSEO({
        entityType: entityType || undefined,
        entityId: entityId || undefined,
        limit: Number.isFinite(limit) ? (limit as number) : undefined,
      });
      return NextResponse.json({ ok: true, rows, count: rows.length });
    }

    if (!entityType || !isValidEntityType(entityType)) {
      return NextResponse.json(
        { error: "entityType نامعتبر است." },
        { status: 400 },
      );
    }

    // Entity search mode (for the admin picker).
    if (searchQ) {
      const results = await searchEntities(entityType, searchQ);
      return NextResponse.json({ ok: true, results });
    }

    if (!entityId) {
      return NextResponse.json(
        { error: "entityId الزامی است." },
        { status: 400 },
      );
    }

    const [seo, entity] = await Promise.all([
      getSEO(entityType, entityId),
      fetchEntity(entityType, entityId),
    ]);

    const generated = entity
      ? {
          metaTitle: generateMetaTitle(entityType, entity),
          metaDescription: generateMetaDescription(entityType, entity),
          structuredData: generateStructuredData(entityType, entity),
        }
      : null;

    return NextResponse.json({
      ok: true,
      seo,
      entity: entity
        ? {
            id: entity.id,
            name:
              entity.name ??
              entity.title ??
              entity.canonicalName ??
              entity.slug ??
              entityId,
            slug: entity.slug ?? null,
          }
        : null,
      generated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/**
 * Shared body for POST / PUT / PATCH. All three accept the same
 * body shape; we route through the Wave 3B `updateSEO` service
 * so mutations are consistently audit-logged as `seo.update`.
 * Phase 7 STEP 5.2: field-level validation now enforced before upsert.
 */
async function handleUpsert(req: Request): Promise<Response> {
  const [user, error] = await requireAdmin("seo.manage");
  if (error) return error;
  try {
    const body = await req.json().catch(() => null);
    if (
      !body ||
      typeof body.entityType !== "string" ||
      typeof body.entityId !== "string"
    ) {
      return NextResponse.json(
        { error: "entityType و entityId الزامی هستند." },
        { status: 400 },
      );
    }
    if (!isValidEntityType(body.entityType)) {
      return NextResponse.json(
        { error: "entityType نامعتبر است." },
        { status: 400 },
      );
    }

    // ── Phase 7 STEP 5.2: field-level validation (no more unbounded payloads)
    const fieldErrs = validateSEOFields(body);
    if (fieldErrs.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", fields: fieldErrs },
        { status: 400 },
      );
    }

    const input: UpdateSEOInput = {
      entityType: body.entityType,
      entityId: body.entityId,
      actorId: user!.id,
      title: body.title ?? body.metaTitle,
      description: body.description ?? body.metaDescription,
      keywords: body.keywords,
      canonical: body.canonical ?? body.canonicalUrl,
      robots: body.robots ?? robotsStringFromFlags(body.robotsIndex, body.robotsFollow),
      ogTitle: body.ogTitle,
      ogDescription: body.ogDescription,
      ogImage: body.ogImage,
      structuredData: body.structuredData,
      sitemapPriority: body.sitemapPriority,
      sitemapChangeFreq: body.sitemapChangeFreq,
    };

    const seo = await updateSEO(input);

    return NextResponse.json({ ok: true, seo });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

function robotsStringFromFlags(
  robotsIndex: unknown,
  robotsFollow: unknown,
): string | undefined {
  if (robotsIndex === undefined && robotsFollow === undefined) return undefined;
  const idx = robotsIndex === false ? "noindex" : "index";
  const follow = robotsFollow === false ? "nofollow" : "follow";
  return `${idx}, ${follow}`;
}

export async function POST(req: Request) {
  return handleUpsert(req);
}

export async function PUT(req: Request) {
  return handleUpsert(req);
}

export async function PATCH(req: Request) {
  return handleUpsert(req);
}

// ── Phase 7 STEP 5.3: DELETE handler (previously missing — UI Delete 405'd)
//    Deletes the SEOMetadata row by (entityType, entityId) compound unique key.
export async function DELETE(req: Request) {
  const [user, error] = await requireAdmin("seo.manage");
  if (error) return error;
  try {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType")?.trim() || "";
    const entityId = url.searchParams.get("entityId")?.trim() || "";
    if (!entityType || !entityId || !isValidEntityType(entityType)) {
      return NextResponse.json(
        { error: "entityType و entityId معتبر الزامی هستند." },
        { status: 400 },
      );
    }

    // Compound unique key (entityType, entityId) — delete is a no-op if not found.
    const existing = await db.sEOMetadata.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "SEO row not found." },
        { status: 404 },
      );
    }
    await db.sEOMetadata.delete({
      where: { entityType_entityId: { entityType, entityId } },
    });

    await logAudit({
      actorId: user!.id,
      actorType: "ADMIN",
      action: "seo.delete",
      entityType: "SEOMetadata",
      entityId: existing.id,
      before: {
        entityType: existing.entityType,
        entityId: existing.entityId,
        metaTitle: existing.metaTitle,
        canonicalUrl: existing.canonicalUrl,
      },
      reason: `Deleted SEO for ${entityType}/${entityId}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
