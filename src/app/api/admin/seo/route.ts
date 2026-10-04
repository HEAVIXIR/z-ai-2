import { NextResponse } from "next/server";
import {
  getSEO,
  upsertSEO,
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
import { requireAdmin } from "@/lib/admin-guard";

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
   Permission: seo.read (GET), seo.manage (POST/PUT/PATCH)
   ============================================================ */

// CP-02.15.3: local authorizeAdmin() removed; replaced with canonical requireAdmin("seo.read") / requireAdmin("seo.manage")

function isValidEntityType(t: string): boolean {
  return (SEO_ENTITY_TYPES as readonly string[]).includes(t);
}

export async function GET(req: Request) {
  // CP-02.15.3: migrated from local authorizeAdmin() to canonical requireAdmin(perm)
  const [, error] = await requireAdmin("seo.read");
  if (error) return error;
  try {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType")?.trim() || "";
    const entityId = url.searchParams.get("entityId")?.trim() || "";
    const searchQ = url.searchParams.get("search")?.trim() || "";
    const listFlag = url.searchParams.get("list");
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    // ── List mode (Wave 3B): ?list=1[&entityType=][&entityId=][&limit=]
    // Returns all SEO rows (optionally filtered by entityType/entityId).
    // entityType is OPTIONAL here — if omitted, list across all types.
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

    // Provide auto-generated defaults so the admin UI can offer
    // a "تولید خودکار" button even when no SEO row exists yet.
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
 */
async function handleUpsert(req: Request): Promise<Response> {
  // CP-02.15.3: migrated from local authorizeAdmin() to canonical requireAdmin(perm)
  const [user, error] = await requireAdmin("seo.manage");
  if (error) return error;
  const userId = user?.id ?? null;
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

    // Wave 3B task field names + legacy schema field names — accept both.
    const input: UpdateSEOInput = {
      entityType: body.entityType,
      entityId: body.entityId,
      actorId: userId,
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

/* ── Legacy: keep the old `upsertSEO`-direct path available for any
   callers that bypassed the service — used by tests that mock the
   raw upsert. Exposed as a default-export-less helper. */
export async function legacyUpsertSEO(
  entityType: string,
  entityId: string,
  fields: Record<string, unknown>,
) {
  return upsertSEO(entityType, entityId, fields as any);
}
