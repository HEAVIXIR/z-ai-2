import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/categories/[id]/attributes — public, read-only.
 *
 * Resolves the selected category's complete ancestry and composes the
 * HBR three-layer attribute catalog:
 *   machinery/global -> domain (e.g. road-construction) -> machine type
 *   (e.g. loader, crane, excavator) -> optional subtype.
 *
 * The nearest category link wins for link-level flags. This lets a leaf
 * override required/filterable/order settings without duplicating the
 * global and domain definitions.
 *
 * Brand and model are intentionally omitted: those are selected in the
 * preceding wizard step and are persisted as first-class Listing relations.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const selected = await db.category.findFirst({
      where: { OR: [{ id }, { slug: id }], active: true },
      select: { id: true, parentId: true },
    });
    if (!selected) {
      return NextResponse.json({ error: "Category not found or inactive" }, { status: 404 });
    }

    // Follow the real parent relation; do not assume a fixed tree depth.
    const ancestryLeafFirst: string[] = [selected.id];
    const seen = new Set<string>(ancestryLeafFirst);
    let parentId = selected.parentId;
    let depth = 0;
    while (parentId && depth < 16) {
      if (seen.has(parentId)) {
        return NextResponse.json({ error: "Invalid category ancestry" }, { status: 409 });
      }
      seen.add(parentId);
      const parent = await db.category.findUnique({
        where: { id: parentId },
        select: { id: true, parentId: true, active: true },
      });
      if (!parent || !parent.active) break;
      ancestryLeafFirst.push(parent.id);
      parentId = parent.parentId;
      depth += 1;
    }

    const categoryIds = ancestryLeafFirst.reverse();
    const depthByCategory = new Map(categoryIds.map((categoryId, index) => [categoryId, index]));

    const url = new URL(req.url);
    const modelId = url.searchParams.get("modelId")?.trim() || null;
    let selectedModel: { id: string; brandId: string } | null = null;
    if (modelId) {
      const model = await db.productModel.findUnique({
        where: { id: modelId },
        select: {
          id: true,
          brandId: true,
          categoryId: true,
          status: true,
          modelCategories: { select: { categoryId: true } },
        },
      });
      const modelMatchesCategory =
        !!model &&
        (model.categoryId === selected.id ||
          model.modelCategories.some((link) => link.categoryId === selected.id));
      if (!model || model.status !== "ACTIVE" || !modelMatchesCategory) {
        return NextResponse.json(
          { error: "مدل انتخاب‌شده به دسته‌بندی فعال متصل نیست." },
          { status: 400 },
        );
      }
      selectedModel = { id: model.id, brandId: model.brandId };
    }

    const links = await db.categoryAttribute.findMany({
      where: { categoryId: { in: categoryIds } },
      include: {
        attribute: {
          include: {
            options: {
              orderBy: [{ sortOrder: "asc" }, { value: "asc" }],
            },
          },
        },
      },
    });

    // Process from broadest ancestor to most-specific leaf so the latter
    // overrides link-level flags and display order for shared attributes.
    links.sort((a, b) =>
      (depthByCategory.get(a.categoryId) ?? 0) - (depthByCategory.get(b.categoryId) ?? 0) ||
      a.displayOrder - b.displayOrder ||
      a.attribute.sortOrder - b.attribute.sortOrder ||
      a.attribute.name.localeCompare(b.attribute.name, "fa"),
    );

    const merged = new Map<string, {
      id: string;
      key: string | null;
      labelFa: string;
      labelEn: string | null;
      type: string;
      unit: string | null;
      required: boolean;
      filterable: boolean;
      searchable: boolean;
      sortable: boolean;
      displayOrder: number;
      sourceDepth: number;
      sortOrder: number;
      visibleOnCard: boolean;
      visibleOnDetail: boolean;
      options: Array<{ id: string; value: string; label: string | null; sortOrder: number }>;
    }>();

    for (const link of links) {
      const attribute = link.attribute;
      const key = attribute.key ?? attribute.id;
      // Brand/model are handled by the dedicated linked selectors before
      // this technical-specification step.
      if (key === "brand" || key === "model") continue;

      merged.set(key, {
        id: attribute.id,
        key: attribute.key,
        labelFa: attribute.labelFa ?? attribute.name,
        labelEn: attribute.labelEn ?? attribute.nameEn ?? null,
        type: attribute.type,
        unit: attribute.unit,
        required: link.required,
        filterable: link.filterable,
        searchable: link.searchable,
        sortable: link.sortable,
        displayOrder: link.displayOrder,
        sourceDepth: depthByCategory.get(link.categoryId) ?? 0,
        sortOrder: attribute.sortOrder,
        visibleOnCard: attribute.visibleOnCard,
        visibleOnDetail: attribute.visibleOnDetail,
        options: attribute.options.map((option) => ({
          id: option.id,
          value: option.value,
          label: option.label,
          sortOrder: option.sortOrder,
        })),
      });
    }

    // Optional model-specific links are the final, most-specific layer.
    // They can add fields or override required/filter/sort behavior for a
    // particular ProductModel without changing the shared machine template.
    if (selectedModel) {
      const modelLinks = await db.productModelAttribute.findMany({
        where: { modelId: selectedModel.id },
        include: {
          attribute: {
            include: {
              options: {
                orderBy: [{ sortOrder: "asc" }, { value: "asc" }],
              },
            },
          },
        },
      });
      for (const link of modelLinks) {
        const attribute = link.attribute;
        const key = attribute.key ?? attribute.id;
        if (key === "brand" || key === "model") continue;
        merged.set(key, {
          id: attribute.id,
          key: attribute.key,
          labelFa: attribute.labelFa ?? attribute.name,
          labelEn: attribute.labelEn ?? attribute.nameEn ?? null,
          type: attribute.type,
          unit: attribute.unit,
          required: link.required,
          filterable: link.filterable,
          searchable: link.searchable,
          sortable: link.sortable,
          displayOrder: link.displayOrder,
          sourceDepth: categoryIds.length,
          sortOrder: attribute.sortOrder,
          visibleOnCard: attribute.visibleOnCard,
          visibleOnDetail: attribute.visibleOnDetail,
          options: attribute.options.map((option) => ({
            id: option.id,
            value: option.value,
            label: option.label,
            sortOrder: option.sortOrder,
          })),
        });
      }
    }

    const attributes = [...merged.values()]
      .sort((a, b) =>
        a.sourceDepth - b.sourceDepth ||
        a.displayOrder - b.displayOrder ||
        a.sortOrder - b.sortOrder ||
        a.labelFa.localeCompare(b.labelFa, "fa"),
      )
      .map(({ sourceDepth: _sourceDepth, sortOrder: _sortOrder, ...attribute }) => ({
        ...attribute,
        options: attribute.options.map(({ sortOrder: _optionOrder, ...option }) => option),
      }));

    return NextResponse.json({
      categoryId: selected.id,
      modelId: selectedModel?.id ?? null,
      ancestry: categoryIds,
      attributes,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
