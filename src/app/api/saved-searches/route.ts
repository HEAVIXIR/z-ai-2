import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { parseBig } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-context";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(s: any) {
  return {
    ...s,
    minPrice: s.minPrice ? s.minPrice.toString() : null,
    maxPrice: s.maxPrice ? s.maxPrice.toString() : null,
  };
}

/* GET /api/saved-searches */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const items = await db.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ savedSearches: items.map(serialize) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/saved-searches
 *
 * Phase 4 deepening (P4-SEARCH-DISCOVERY):
 *   - Accepts `alertEnabled` as a top-level alias for notifyEmail+notifyPush
 *     (both turn on when alertEnabled=true, both turn off when =false).
 *   - Accepts a structured `filters` object as an alternative to the
 *     flat categorySlug / brandSlug / minPrice / maxPrice / condition /
 *     city fields — useful when the client is composing the search from
 *     a faceted UI state.
 *   - Logs `search.saved.create` to the AuditLog (best-effort, never
 *     throws).
 */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // `filters` is an OPTIONAL structured payload that the client may
    // supply instead of the flat fields. We destructure it onto the
    // flat fields if the flat field isn't already set.
    const filters: Record<string, unknown> =
      (body.filters && typeof body.filters === "object") ? body.filters : {};

    const categorySlug = body.categorySlug ?? filters.categorySlug ?? filters.category ?? null;
    const brandSlug = body.brandSlug ?? filters.brandSlug ?? filters.brand ?? null;
    const minPrice = body.minPrice ?? filters.priceMin ?? filters.minPrice ?? null;
    const maxPrice = body.maxPrice ?? filters.priceMax ?? filters.maxPrice ?? null;
    const condition = body.condition ?? filters.condition ?? null;
    const city = body.city ?? filters.city ?? filters.cityId ?? null;

    // `alertEnabled` alias: when supplied, override notifyEmail +
    // notifyPush to the same value (so a single "alerts on/off"
    // toggle in the UI maps to both channels).
    const alertEnabled = body.alertEnabled ?? filters.alertEnabled;
    const notifyEmail =
      alertEnabled !== undefined ? Boolean(alertEnabled) : body.notifyEmail !== false;
    const notifyPush =
      alertEnabled !== undefined ? Boolean(alertEnabled) : Boolean(body.notifyPush);

    const s = await db.savedSearch.create({
      data: {
        name: String(body.name),
        query: body.query ?? filters.query ?? null,
        categorySlug: categorySlug ?? null,
        brandSlug: brandSlug ?? null,
        minPrice: parseBig(minPrice),
        maxPrice: parseBig(maxPrice),
        condition: condition ?? null,
        city: city ?? null,
        notifyEmail,
        notifyPush,
        active: body.active !== false,
        userId,
      },
    });

    // Phase 4 deepening — audit log: search.saved.create
    // (best-effort, never throws, fire-and-forget).
    Promise.resolve()
      .then(async () => {
        await logAudit({
          actorId: userId,
          actorType: "USER",
          action: "search.saved.create",
          entityType: "SavedSearch",
          entityId: s.id,
          after: {
            name: s.name,
            query: s.query,
            categorySlug: s.categorySlug,
            brandSlug: s.brandSlug,
            condition: s.condition,
            city: s.city,
            alertEnabled: notifyEmail || notifyPush,
          },
          ip: getClientIp(req),
        });
      })
      .catch(() => {
        /* audit logging must never break the request */
      });

    return NextResponse.json({ ok: true, savedSearch: serialize(s) });
  } catch (err: any) {
    trackError(err, { endpoint: "POST /api/saved-searches" });
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* PATCH /api/saved-searches?id=... */
export async function PATCH(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const data: any = {};
    const allowed = [
      "name", "query", "categorySlug", "brandSlug", "condition",
      "city", "notifyEmail", "notifyPush", "active",
    ];
    for (const k of allowed) {
      if (k in body) {
        if (k === "notifyEmail" || k === "notifyPush" || k === "active") data[k] = Boolean(body[k]);
        else data[k] = body[k] === undefined ? null : body[k];
      }
    }
    if ("minPrice" in body) data.minPrice = parseBig(body.minPrice);
    if ("maxPrice" in body) data.maxPrice = parseBig(body.maxPrice);
    const s = await db.savedSearch.update({ where: { id, userId }, data });
    return NextResponse.json({ ok: true, savedSearch: serialize(s) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* DELETE /api/saved-searches?id=... */
export async function DELETE(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await db.savedSearch.deleteMany({ where: { id, userId } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
