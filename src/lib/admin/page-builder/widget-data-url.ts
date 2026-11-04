type WidgetDataUrlEnvironment = Record<string, string | undefined>;

function toHttpOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const raw = value.trim();
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the origin used by server-rendered Page Builder widgets when they
 * call the app's public data APIs.
 *
 * Vercel provides VERCEL_URL automatically. Cloudflare Workers does not, but
 * HEAVIX's preview environment explicitly provides NEXT_PUBLIC_SITE_URL.
 * Falling straight back to localhost in a Worker makes homepage data widgets
 * silently render empty because localhost is not the deployed Worker.
 */
export function resolveWidgetDataBaseUrl(
  env: WidgetDataUrlEnvironment,
  fallback = "http://localhost:3000",
): string {
  return (
    toHttpOrigin(env.NEXT_PUBLIC_BASE_URL) ??
    toHttpOrigin(env.VERCEL_URL) ??
    toHttpOrigin(env.NEXT_PUBLIC_SITE_URL) ??
    fallback
  );
}

/**
 * Resolve registry placeholders without allowing malformed widget props to
 * inject query parameters or request unbounded collection sizes.
 */
export function resolveWidgetDataPath(
  apiPath: string,
  props: Record<string, unknown>,
  maxLimit = 24,
): string {
  const rawLimit = props.limit;
  const parsedLimit = typeof rawLimit === "number" ? rawLimit : Number(rawLimit);
  const safeLimit = Number.isFinite(parsedLimit)
    ? Math.min(maxLimit, Math.max(1, Math.floor(parsedLimit)))
    : 8;

  let resolved = apiPath;
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    const safeValue =
      key === "limit"
        ? String(safeLimit)
        : encodeURIComponent(String(value).slice(0, 128));
    resolved = resolved.replaceAll(`{${key}}`, safeValue);
  }
  return resolved;
}
