import type { ComparisonData } from "@/lib/compare-engine";

/**
 * Explicit public projection for comparison responses.
 *
 * Keep this as an allowlist: never spread engine objects into an
 * unauthenticated response. New internal fields must remain private
 * unless they are deliberately added here and covered by tests.
 */
export function toPublicComparisonDTO(data: ComparisonData): ComparisonData {
  return {
    items: data.items.map((item) => ({
      id: item.id,
      sortOrder: item.sortOrder,
      type: item.type,
      title: item.title,
      slug: item.slug ?? null,
      image: item.image ?? null,
      categoryId: item.categoryId ?? null,
      categoryName: item.categoryName ?? null,
      brandId: item.brandId ?? null,
      brandName: item.brandName ?? null,
      modelId: item.modelId ?? null,
      modelName: item.modelName ?? null,
      productId: item.productId ?? null,
      year: item.year ?? null,
      city: item.city ?? null,
      province: item.province ?? null,
      listingId: item.listingId ?? null,
    })),
    rows: data.rows.map((row) => ({
      key: row.key,
      label: row.label,
      category: row.category,
      unit: row.unit ?? null,
      isDifferent: row.isDifferent,
      isPrice: row.isPrice ?? false,
      priceRanges: row.priceRanges?.map((range) => ({
        min: range.min,
        max: range.max,
        avg: range.avg,
        currency: range.currency,
        confidence: range.confidence,
        sampleSize: range.sampleSize,
      })),
      cells: row.cells.map((cell) => ({
        itemId: cell.itemId,
        display: cell.display,
        raw: cell.raw,
        unit: cell.unit ?? null,
        normalized: cell.normalized,
        ...(cell.provenance
          ? {
              provenance: {
                source: cell.provenance.source ?? null,
                confidence: cell.provenance.confidence ?? null,
                verifiedAt: cell.provenance.verifiedAt ?? null,
              },
            }
          : {}),
      })),
    })),
    attributes: [...data.attributes],
    differences: [...data.differences],
    crossCategoryWarning: data.crossCategoryWarning,
    categories: data.categories.map((category) => ({
      id: category.id,
      name: category.name,
    })),
  };
}
