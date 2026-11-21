import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteArgs = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/models/[id]/attributes
 * PUT /api/admin/models/[id]/attributes
 *
 * Manages model-specific specification overrides. Category ancestry remains
 * the base template; these rows are the final model-specific layer.
 */
export async function GET(req: Request, { params }: RouteArgs) {
  const auth = await requireAdminPermission("taxonomy.write");
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const categoryId = new URL(req.url).searchParams.get("categoryId")?.trim();
    if (!categoryId) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }
    const model = await db.productModel.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        brandId: true,
        categoryId: true,
        modelCategories: { select: { categoryId: true } },
      },
    });
    if (!model) return NextResponse.json({ error: "Model not found" }, { status: 404 });
    const modelMatchesCategory =
      model.categoryId === categoryId ||
      model.modelCategories.some((link) => link.categoryId === categoryId);
    if (!modelMatchesCategory) {
      return NextResponse.json({ error: "Model is not linked to this category" }, { status: 400 });
    }

    const attributes = await db.productModelAttribute.findMany({
      where: { modelId: id, categoryId },
      include: {
        attribute: {
          select: { id: true, key: true, name: true, labelFa: true, labelEn: true, type: true, unit: true },
        },
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ model, categoryId, attributes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, { params }: RouteArgs) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  const auth = await requireAdminPermission("taxonomy.write");
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const model = await db.productModel.findUnique({
      where: { id },
      select: {
        id: true,
        categoryId: true,
        modelCategories: { select: { categoryId: true } },
      },
    });
    if (!model) return NextResponse.json({ error: "Model not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const categoryId = String(body?.categoryId ?? "").trim();
    if (!categoryId) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }
    const modelMatchesCategory =
      model.categoryId === categoryId ||
      model.modelCategories.some((link) => link.categoryId === categoryId);
    if (!modelMatchesCategory) {
      return NextResponse.json({ error: "Model is not linked to this category" }, { status: 400 });
    }

    if (!Array.isArray(body?.attributes) || body.attributes.length > 100) {
      return NextResponse.json(
        { error: "attributes must be an array with at most 100 entries" },
        { status: 400 },
      );
    }

    const rows = body.attributes.map((item: any, index: number) => ({
      attributeId: String(item?.attributeId ?? "").trim(),
      required: item?.required === true,
      filterable: item?.filterable === true,
      searchable: item?.searchable === true,
      sortable: item?.sortable === true,
      displayOrder: Number.isFinite(Number(item?.displayOrder))
        ? Math.max(0, Math.trunc(Number(item.displayOrder)))
        : index,
    }));

    if (rows.some((row) => !row.attributeId)) {
      return NextResponse.json({ error: "هر ویژگی باید attributeId معتبر داشته باشد." }, { status: 400 });
    }
    if (new Set(rows.map((row) => row.attributeId)).size !== rows.length) {
      return NextResponse.json({ error: "ویژگی تکراری در درخواست وجود دارد." }, { status: 400 });
    }

    const existing = await db.attributeDefinition.findMany({
      where: { id: { in: rows.map((row) => row.attributeId) } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((attribute) => attribute.id));
    if (rows.some((row) => !existingIds.has(row.attributeId))) {
      return NextResponse.json({ error: "یکی از شناسه‌های ویژگی معتبر نیست." }, { status: 400 });
    }

    await db.$transaction(async (tx) => {
      await tx.productModelAttribute.deleteMany({ where: { modelId: id, categoryId } });
      if (rows.length > 0) {
        await tx.productModelAttribute.createMany({
          data: rows.map((row) => ({ modelId: id, categoryId, ...row })),
        });
      }
    });

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 },
    );
  }
}
