import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { isAdmin as rbacIsAdmin } from "@/lib/authorization";
import { validateListingAttributeValues } from "@/lib/listing-attributes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

/* ============================================================
   GET /api/listings/[id]/attributes — PUBLIC

   Returns all ListingAttributeValue rows for a listing with the
   attribute definition joined. Used by the listing detail page
   to render the spec table.

   Response shape:
   {
     values: [{
       id, attributeId, key, labelFa, labelEn, type, unit,
       textValue, numberValue, booleanValue, dateValue, optionId,
       optionValue, optionLabel, unit (overrides),
       sourceType, confidence, verifiedAt, verifiedBy,
       createdAt, updatedAt
     }]
   }
   ============================================================ */
export async function GET(_req: Request, { params }: Args) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const listing = await db.listing.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const rows = await db.listingAttributeValue.findMany({
      where: { listingId: id },
      include: {
        attribute: {
          include: {
            options: {
              orderBy: [{ sortOrder: "asc" }, { value: "asc" }],
            },
          },
        },
      },
      orderBy: [{ attribute: { sortOrder: "asc" } }, { attribute: { name: "asc" } }],
    });

    const values = rows.map((r) => {
      const opt = r.optionId
        ? r.attribute.options.find((o) => o.id === r.optionId)
        : null;
      return {
        id: r.id,
        attributeId: r.attributeId,
        key: r.attribute.key,
        labelFa: r.attribute.labelFa ?? r.attribute.name,
        labelEn: r.attribute.labelEn ?? r.attribute.nameEn ?? null,
        type: r.attribute.type,
        unit: r.unit ?? r.attribute.unit,
        textValue: r.textValue,
        numberValue: r.numberValue,
        booleanValue: r.booleanValue,
        dateValue: r.dateValue,
        optionId: r.optionId,
        optionValue: opt?.value ?? null,
        optionLabel: opt?.label ?? null,
        sourceType: r.sourceType,
        confidence: r.confidence,
        sourceReference: r.sourceReference,
        verifiedAt: r.verifiedAt,
        verifiedBy: r.verifiedBy,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    return NextResponse.json({ values });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* ============================================================
   PUT /api/listings/[id]/attributes — admin / seller upsert.

   Body:
   {
     values: [{
       attributeId,
       textValue?, numberValue?, booleanValue?,
       dateValue?, optionId?, unit?,
       sourceType?, confidence?, sourceReference?
     }]
   }

   Strategy: upsert by @@unique([listingId, attributeId]).
   Returns: { ok: true, count }
   ============================================================ */
export async function PUT(req: Request, { params }: Args) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Auth: admin OR the listing's seller.
    // STEP 11.33 NEW-C2 FIX: use RBAC isAdmin (not isAuthenticated which
    // returns true for ANY logged-in user). Same fix as the sibling route.
    const userId = await getCurrentUserId();
    const isAdmin = userId ? await rbacIsAdmin(userId) : false;
    if (!isAdmin && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const listing = await db.listing.findUnique({
      where: { id },
      select: { id: true, sellerId: true, categoryId: true, modelId: true },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (!isAdmin && listing.sellerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const incoming: unknown[] = Array.isArray(body?.values) ? body.values : [];
    const validation = await validateListingAttributeValues(
      db,
      { categoryId: listing.categoryId, modelId: listing.modelId },
      incoming,
      isAdmin,
    );
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    if (validation.values.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    const ops = validation.values.map((value) =>
      db.listingAttributeValue.upsert({
        where: {
          listingId_attributeId: { listingId: id, attributeId: value.attributeId },
        },
        create: { listingId: id, ...value },
        update: value,
      }),
    );

    await db.$transaction(ops);

    return NextResponse.json({ ok: true, count: ops.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
