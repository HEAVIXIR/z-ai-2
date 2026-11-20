import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { checkCsrf } from "@/lib/csrf";
import { logAuditStrict } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

/* ============================================================
   POST /api/attributes/[id]/categories — ADMIN link attribute
   to a category with link-level overrides.

   Body:
   {
     categoryId: string,
     required?: boolean,
     filterable?: boolean,
     searchable?: boolean,
     sortable?: boolean,
     displayOrder?: number
   }

   If the link already exists (categoryId+attributeId unique),
   returns 409. Use PATCH on the link instead.

   Returns: { ok: true, link }
   ============================================================ */
export async function POST(req: Request, { params }: Args) {
  const __auth = await requireAdminPermission("taxonomy.write"); if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    if (!body.categoryId) {
      return NextResponse.json(
        { error: "categoryId is required" },
        { status: 400 },
      );
    }

    const [attribute, category] = await Promise.all([
      db.attributeDefinition.findUnique({ where: { id }, select: { id: true } }),
      db.category.findUnique({
        where: { id: String(body.categoryId) },
        select: { id: true },
      }),
    ]);
    if (!attribute) {
      return NextResponse.json({ error: "Attribute not found" }, { status: 404 });
    }
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const existing = await db.categoryAttribute.findUnique({
      where: {
        categoryId_attributeId: {
          categoryId: category.id,
          attributeId: id,
        },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Link already exists", link: existing },
        { status: 409 },
      );
    }

    const link = await db.categoryAttribute.create({
      data: {
        categoryId: category.id,
        attributeId: id,
        active: body.active !== false,
        required: body.required === true,
        filterable: body.filterable === true,
        searchable: body.searchable === true,
        sortable: body.sortable === true,
        displayOrder: Number(body.displayOrder) || 0,
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    await logAuditStrict({
      actorId: __auth.user.id,
      actorType: "ADMIN",
      action: "taxonomy.category_attribute.create",
      entityType: "CategoryAttribute",
      entityId: link.id,
      after: {
        categoryId: link.categoryId,
        attributeId: link.attributeId,
        active: link.active,
        required: link.required,
        filterable: link.filterable,
        searchable: link.searchable,
        sortable: link.sortable,
        displayOrder: link.displayOrder,
      },
    });

    return NextResponse.json({ ok: true, link });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* ============================================================
   PATCH /api/attributes/[id]/categories?linkId=... — ADMIN
   Update category-scoped policy without changing stored listing values.
   active and required are independent: inactive fields are hidden and
   are not required, while their existing ListingAttributeValue rows remain.
   ============================================================ */
export async function PATCH(req: Request, { params }: Args) {
  const __auth = await requireAdminPermission("taxonomy.write"); if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const linkId = (url.searchParams.get("linkId") ?? "").trim();
    if (!linkId) {
      return NextResponse.json({ error: "linkId is required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const booleanFields = ["active", "required", "filterable", "searchable", "sortable"] as const;
    const data: Record<string, boolean | number> = {};
    for (const field of booleanFields) {
      if (field in body) {
        if (typeof body[field] !== "boolean") {
          return NextResponse.json({ error: `${field} must be boolean` }, { status: 400 });
        }
        data[field] = body[field];
      }
    }
    if ("displayOrder" in body) {
      const displayOrder = Number(body.displayOrder);
      if (!Number.isInteger(displayOrder) || displayOrder < 0) {
        return NextResponse.json({ error: "displayOrder must be a non-negative integer" }, { status: 400 });
      }
      data.displayOrder = displayOrder;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "At least one policy field is required" }, { status: 400 });
    }

    const existing = await db.categoryAttribute.findFirst({
      where: { id: linkId, attributeId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Category attribute link not found" }, { status: 404 });
    }

    const link = await db.categoryAttribute.update({
      where: { id: existing.id },
      data,
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    await logAuditStrict({
      actorId: __auth.user.id,
      actorType: "ADMIN",
      action: "taxonomy.category_attribute.update",
      entityType: "CategoryAttribute",
      entityId: link.id,
      before: {
        active: existing.active,
        required: existing.required,
        filterable: existing.filterable,
        searchable: existing.searchable,
        sortable: existing.sortable,
        displayOrder: existing.displayOrder,
      },
      after: {
        active: link.active,
        required: link.required,
        filterable: link.filterable,
        searchable: link.searchable,
        sortable: link.sortable,
        displayOrder: link.displayOrder,
      },
    });

    return NextResponse.json({ ok: true, link });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* ============================================================
   DELETE /api/attributes/[id]/categories?categoryId=... — ADMIN
   unlink an attribute from a category.

   Returns: { ok: true }
   ============================================================ */
export async function DELETE(req: Request, { params }: Args) {
  const __auth = await requireAdminPermission("taxonomy.write"); if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const categoryId = (url.searchParams.get("categoryId") ?? "").trim();
    const linkId = (url.searchParams.get("linkId") ?? "").trim();

    let where: { attributeId: string; categoryId?: string; id?: string };
    if (categoryId) {
      where = { attributeId: id, categoryId };
    } else if (linkId) {
      where = { id: linkId, attributeId: id };
    } else {
      return NextResponse.json(
        { error: "categoryId or linkId query param is required" },
        { status: 400 },
      );
    }

    const existingLinks = await db.categoryAttribute.findMany({ where });
    await db.categoryAttribute.deleteMany({ where });
    for (const existing of existingLinks) {
      await logAuditStrict({
        actorId: __auth.user.id,
        actorType: "ADMIN",
        action: "taxonomy.category_attribute.delete",
        entityType: "CategoryAttribute",
        entityId: existing.id,
        before: {
          categoryId: existing.categoryId,
          attributeId: existing.attributeId,
          active: existing.active,
          required: existing.required,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
