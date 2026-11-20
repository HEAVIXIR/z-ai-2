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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }
    for (const field of ["active", "required", "filterable", "searchable", "sortable"] as const) {
      if (field in body && typeof body[field] !== "boolean") {
        return NextResponse.json({ error: `${field} must be boolean` }, { status: 400 });
      }
    }
    const displayOrder = body.displayOrder === undefined ? 0 : Number(body.displayOrder);
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      return NextResponse.json({ error: "displayOrder must be a non-negative integer" }, { status: 400 });
    }
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

    const link = await db.$transaction(async (tx: any) => {
      const created = await tx.categoryAttribute.create({
        data: {
          categoryId: category.id,
          attributeId: id,
          active: body.active !== false,
          required: body.required === true,
          filterable: body.filterable === true,
          searchable: body.searchable === true,
          sortable: body.sortable === true,
          displayOrder,
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
        entityId: created.id,
        after: {
          categoryId: created.categoryId,
          attributeId: created.attributeId,
          active: created.active,
          required: created.required,
          filterable: created.filterable,
          searchable: created.searchable,
          sortable: created.sortable,
          displayOrder: created.displayOrder,
        },
      }, tx);
      return created;
    });

    return NextResponse.json({ ok: true, link });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: err?.statusCode === 404 ? 404 : 500 },
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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }
    const booleanFields = ["active", "required", "filterable", "searchable", "sortable"] as const;
    const data: any = {};
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

    const link = await db.$transaction(async (tx: any) => {
      const existing = await tx.categoryAttribute.findFirst({
        where: { id: linkId, attributeId: id },
      });
      if (!existing) {
        throw Object.assign(new Error("Category attribute link not found"), { statusCode: 404 });
      }

      const updated = await tx.categoryAttribute.update({
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
        entityId: updated.id,
        before: {
          active: existing.active,
          required: existing.required,
          filterable: existing.filterable,
          searchable: existing.searchable,
          sortable: existing.sortable,
          displayOrder: existing.displayOrder,
        },
        after: {
          active: updated.active,
          required: updated.required,
          filterable: updated.filterable,
          searchable: updated.searchable,
          sortable: updated.sortable,
          displayOrder: updated.displayOrder,
        },
      }, tx);
      return updated;
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

    let where: any;
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

    const deletedCount = await db.$transaction(async (tx: any) => {
      const existingLinks = await tx.categoryAttribute.findMany({ where });
      await tx.categoryAttribute.deleteMany({ where });
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
        }, tx);
      }
      return existingLinks.length;
    });

    return NextResponse.json({ ok: true, deletedCount });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
