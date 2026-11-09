export function normalizePublicWidgetCollection(payload: unknown): unknown[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const response = payload as Record<string, unknown>;
  const nestedData =
    response.data && typeof response.data === "object" && !Array.isArray(response.data)
      ? (response.data as Record<string, unknown>)
      : null;

  const candidates: unknown[] = [
    nestedData?.items,
    response.items,
    response.categories,
    response.brands,
    response.articles,
    response.services,
    response.data,
  ];

  return (candidates.find(Array.isArray) as unknown[] | undefined) ?? null;
}
