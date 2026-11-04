type WidgetDataUrlEnvironment = Record<string, string | undefined>;
type RequestHeaders = Pick<Headers, "get">;

function toHttpOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const raw = value.trim();
    const url = new URL(raw.includes("://") ? raw : "https://" + raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function requestOrigin(env: WidgetDataUrlEnvironment, requestHeaders?: RequestHeaders): string | null {
  if (!requestHeaders) return null;
  const rawHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!rawHost) return null;
  const host = rawHost.split(",")[0].trim();
  if (!host || /[\s/@?#]/.test(host)) return null;
  const rawProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  const protocol = rawProtocol || "https";
  if (protocol !== "http" && protocol !== "https") return null;
  const origin = toHttpOrigin(protocol + "://" + host);
  if (!origin) return null;
  const hostname = new URL(origin).hostname.toLowerCase();
  const configuredHosts = [env.NEXT_PUBLIC_BASE_URL, env.VERCEL_URL, env.NEXT_PUBLIC_SITE_URL]
    .map(toHttpOrigin)
    .filter((value): value is string => value !== null)
    .map((value) => new URL(value).hostname.toLowerCase());
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const isKnownCloudflarePreview = hostname.endsWith(".heavixir.workers.dev");
  const isConfiguredHost = configuredHosts.some((configured) =>
    hostname === configured || (configured === "heavix.ir" && hostname.endsWith(".heavix.ir")),
  );
  return isLocal || isKnownCloudflarePreview || isConfiguredHost ? origin : null;
}

/** Prefer the current request host so branch Workers Previews call their own API. */
export function resolveWidgetDataBaseUrl(env: WidgetDataUrlEnvironment, requestHeaders?: RequestHeaders, fallback = "http://localhost:3000"): string {
  return requestOrigin(env, requestHeaders)
    ?? toHttpOrigin(env.NEXT_PUBLIC_BASE_URL)
    ?? toHttpOrigin(env.VERCEL_URL)
    ?? toHttpOrigin(env.NEXT_PUBLIC_SITE_URL)
    ?? fallback;
}

export function resolveWidgetDataPath(apiPath: string, props: Record<string, unknown>, maxLimit = 24): string {
  const rawLimit = props.limit;
  const parsedLimit = typeof rawLimit === "number" ? rawLimit : Number(rawLimit);
  const safeLimit = Number.isFinite(parsedLimit) ? Math.min(maxLimit, Math.max(1, Math.floor(parsedLimit))) : 8;
  let resolved = apiPath;
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    const safeValue = key === "limit" ? String(safeLimit) : encodeURIComponent(String(value).slice(0, 128));
    resolved = resolved.replaceAll("{" + key + "}", safeValue);
  }
  return resolved;
}
