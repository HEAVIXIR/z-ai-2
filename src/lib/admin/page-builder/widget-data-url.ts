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
