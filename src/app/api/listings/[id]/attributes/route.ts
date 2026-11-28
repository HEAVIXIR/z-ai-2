import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { isAdmin as rbacIsAdmin } from "@/lib/authorization";
import { getCategoryAttributeIds } from "@/lib/category-attributes";
import { logAudit } from "@/lib/audit";
import { validateListingAttributeBatch } from "@/lib/listing-attribute-validation";

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
      select: { id: true, sellerId: true, categoryId: true },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (!isAdmin && listing.sellerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const incoming: any[] = Array.isArray(body?.values) ? body.values : [];
    if (incoming.length > 0 || listing.categoryId) {
      const validation = await validateListingAttributeBatch(
        db,
        listing.categoryId,
        incoming,
        { enforceRequired: true },
      );
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.error, ...(validation.details ?? {}) },
          { status: 400 },
        );
      }
    }
    if (incoming.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }
    if (incoming.some((value) => !value || typeof value.attributeId !== "string" || !value.attributeId.trim())) {
      return NextResponse.json({ error: "attributeId is required for each value" }, { status: 400 });
    }

    const rawAttributeIds = incoming.map((value) => String(value.attributeId));
    if (new Set(rawAttributeIds).size !== rawAttributeIds.length) {
      return NextResponse.json({ error: "Duplicate attributeIds are not allowed" }, { status: 400 });
    }
    const attrIds = rawAttributeIds;
    if (attrIds.length === 0) {
      return NextResponse.json(
        { error: "attributeId is required for each value" },
        { status: 400 },
      );
    }
    const attrs = await db.attributeDefinition.findMany({
      where: { id: { in: attrIds } },
      select: { id: true, type: true },
    });
    const attrMap = new Map(attrs.map((a) => [a.id, a]));
    const missing = attrIds.filter((aid) => !attrMap.has(aid));
    if (missing.length) {
      return NextResponse.json(
        { error: `Unknown attributeId: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    // Attribute definitions must be explicitly attached to this listing's category.
    if (!listing.categoryId) {
      return NextResponse.json({ error: "Listing has no category for technical attributes" }, { status: 400 });
    }
    const allowedAttributeIds = await getCategoryAttributeIds(db, listing.categoryId);
    const disallowedAttributeIds = attrIds.filter((attributeId) => !allowedAttributeIds.has(attributeId));
    if (disallowedAttributeIds.length) {
      return NextResponse.json(
        { error: "One or more attributes are not available for this listing category", invalidAttributeIds: disallowedAttributeIds },
        { status: 400 },
      );
    }

    const invalidNumbers = incoming.filter((value) =>
      value.numberValue !== undefined && value.numberValue !== null && value.numberValue !== "" &&
      !Number.isFinite(Number(value.numberValue))
    );
    if (invalidNumbers.length) {
      return NextResponse.json({ error: "Numeric attribute values must be finite numbers" }, { status: 400 });
    }
    const invalidDates = incoming.filter((value) =>
      value.dateValue !== undefined && value.dateValue !== null && value.dateValue !== "" &&
      Number.isNaN(new Date(value.dateValue).getTime())
    );
    if (invalidDates.length) {
      return NextResponse.json({ error: "Date attribute values must be valid dates" }, { status: 400 });
    }

    const optionRefs = incoming
      .filter((value) => value.optionId !== undefined && value.optionId !== null && value.optionId !== "")
      .map((value) => ({ attributeId: String(value.attributeId), optionId: String(value.optionId) }));
    if (optionRefs.length) {
      const optionRows = await db.attributeOption.findMany({
        where: { id: { in: optionRefs.map((option) => option.optionId) } },
        select: { id: true, attributeId: true },
      });
      const optionsById = new Map(optionRows.map((option) => [option.id, option.attributeId]));
      const invalidOptions = optionRefs.filter((option) =>
        attrMap.get(option.attributeId)?.type !== "SELECT" ||
        optionsById.get(option.optionId) !== option.attributeId
      );
      if (invalidOptions.length) {
        return NextResponse.json({ error: "One or more selected options do not belong to their attributes" }, { status: 400 });
      }
    }

    const invalidConfidence = incoming.some((value) =>
      value.confidence !== undefined && value.confidence !== null &&
      (!Number.isFinite(Number(value.confidence)) || Number(value.confidence) < 0 || Number(value.confidence) > 1)
    );
    if (invalidConfidence && isAdmin) {
      return NextResponse.json({ error: "Confidence must be between 0 and 1" }, { status: 400 });
    }

    // Build the upsert operations
    const ops = incoming
      .filter((v) => v && v.attributeId && attrMap.has(String(v.attributeId)))
      .map((v) => {
        const aid = String(v.attributeId);
        const dateValue =
          v.dateValue === undefined || v.dateValue === null || v.dateValue === ""
            ? null
            : new Date(v.dateValue);
        return db.listingAttributeValue.upsert({
          where: {
            listingId_attributeId: { listingId: id, attributeId: aid },
          },
          create: {
            listingId: id,
            attributeId: aid,
            textValue:
              v.textValue === undefined || v.textValue === null
                ? null
                : String(v.textValue),
            numberValue:
              v.numberValue === undefined || v.numberValue === null || v.numberValue === ""
                ? null
                : Number(v.numberValue),
            booleanValue:
              v.booleanValue === undefined || v.booleanValue === null
                ? null
                : Boolean(v.booleanValue),
            dateValue: isNaN(dateValue?.getTime() ?? NaN) ? null : dateValue,
            optionId:
              v.optionId === undefined || v.optionId === null || v.optionId === ""
                ? null
                : String(v.optionId),
            unit:
              v.unit === undefined || v.unit === null || v.unit === ""
                ? null
                : String(v.unit),
            sourceType: isAdmin ? "ADMIN_VERIFIED" : "SELLER_INPUT",
            confidence: isAdmin && v.confidence != null ? Number(v.confidence) : null,
            sourceReference: isAdmin && v.sourceReference != null ? String(v.sourceReference) : null,
            verifiedAt: isAdmin ? new Date() : null,
            verifiedBy: isAdmin ? "admin" : null,
          },
          update: {
            textValue:
              v.textValue === undefined || v.textValue === null
                ? null
                : String(v.textValue),
            numberValue:
              v.numberValue === undefined || v.numberValue === null || v.numberValue === ""
                ? null
                : Number(v.numberValue),
            booleanValue:
              v.booleanValue === undefined || v.booleanValue === null
                ? null
                : Boolean(v.booleanValue),
            dateValue: isNaN(dateValue?.getTime() ?? NaN) ? null : dateValue,
            optionId:
              v.optionId === undefined || v.optionId === null || v.optionId === ""
                ? null
                : String(v.optionId),
            unit:
              v.unit === undefined || v.unit === null || v.unit === ""
                ? null
                : String(v.unit),
            sourceType: isAdmin ? "ADMIN_VERIFIED" : "SELLER_INPUT",
            confidence: isAdmin && v.confidence != null ? Number(v.confidence) : null,
            sourceReference: isAdmin && v.sourceReference != null ? String(v.sourceReference) : null,
            verifiedAt: isAdmin ? new Date() : null,
            verifiedBy: isAdmin ? "admin" : null,
          },
        });
      });

    await db.$transaction(ops);

    // Record the successful batch after the value transaction commits.
    // Technical values are intentionally excluded from the audit payload.
    await logAudit({
      actorId: userId,
      actorType: isAdmin ? "ADMIN" : "USER",
      action: "marketplace.listing_attribute_value.bulk_upsert",
      entityType: "ListingAttributeValue",
      entityId: id,
      after: { count: ops.length, attributeIds: attrIds },
    });

    return NextResponse.json({ ok: true, count: ops.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
