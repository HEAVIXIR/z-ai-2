/**
 * Normalize the response envelopes used by registered public/admin data sources.
 * Returns arrays for collection endpoints and preserves object payloads for
 * singleton widgets such as site statistics.
 */
export function extractWidgetData(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const root = payload as Record<string, unknown>;
  const nestedData =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;

  const candidates = [
    nestedData?.items,
    root.items,
    root.categories,
    root.brands,
    root.articles,
    root.services,
    root.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return root.data && typeof root.data === "object" ? root.data : null;
}
