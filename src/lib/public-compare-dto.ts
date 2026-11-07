import type { ComparisonData } from "@/lib/compare-engine";

/**
 * Least-privilege projection for unauthenticated share-token responses.
 * Internal provenance references and verifier user IDs are not public fields.
 */
export function toPublicComparisonDTO(data: ComparisonData): ComparisonData {
  return {
    ...data,
    rows: data.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({
        ...cell,
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
  };
}
