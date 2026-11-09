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

// STEP 18.2.7.3.10 (Finding S-2, per review #6657234467):
// x-forwarded-host is a client-supplied header. Any external caller can set
// it to any value. The previous allowlist (workers.dev / heavix.ir suffix)
// only validated the FORMAT of the host — it did not validate the TRUST
// BOUNDARY: a request from an untrusted source (a direct HTTP request to the
// Worker, bypassing Cloudflare's proxy) could still supply a spoofed
// x-forwarded-host that matches the allowlist and redirect server-side fetch()
// to an attacker-controlled subdomain of heavixir.workers.dev.
//
// The correct fix is to gate the header-based origin resolution behind an
// explicit configuration flag: HEAVIX_TRUSTED_PROXY_HEADER. When this env var
// is set (e.g. to "x-forwarded-host"), the resolver trusts that header ONLY
// because the deployment is behind a trusted reverse proxy (Cloudflare) that
// overwrites client-supplied x-forwarded-* headers. When the env var is absent
// (default), the resolver ignores ALL forwarded headers and falls back to the
// configured base URL — fail-closed for direct-access deployments.
const TRUSTED_HEADER_ENV = "HEAVIX_TRUSTED_PROXY_HEADER";

function requestOrigin(env: WidgetDataUrlEnvironment, requestHeaders?: RequestHeaders): string | null {
  if (!requestHeaders) return null;
  // STEP 18.2.7.3.10 (Finding S-2): only honor forwarded headers when the
  // deployment has explicitly declared a trusted proxy. This prevents direct
  // HTTP access (bypassing Cloudflare) from being fooled by spoofed headers.
  const trustedHeader = env[TRUSTED_HEADER_ENV];
  if (!trustedHeader) return null;
  // Allow only the two well-known forwarded-host headers; reject arbitrary
  // header names to avoid config-injection confusion.
  if (trustedHeader !== "x-forwarded-host" && trustedHeader !== "host") return null;
  const rawHost = requestHeaders.get(trustedHeader) ?? requestHeaders.get("host");
  if (!rawHost) return null;
  const host = rawHost.split(",")[0].trim();
  // STEP 18.2.7.3.10 (SSRF hardening): reject userinfo (@), path/query
  // separators, whitespace, AND port numbers. A hostname with a port
  // (e.g. "trusted.dev:9000") could direct server-side fetch() to an
  // attacker-controlled service on the same host — block it.
  if (!host || /[\s/@?#:]/.test(host)) return null;
  const rawProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  const protocol = rawProtocol || "https";
  if (protocol !== "http" && protocol !== "https") return null;
  const origin = toHttpOrigin(protocol + "://" + host);
  if (!origin) return null;
  const url = new URL(origin);
  const hostname = url.hostname.toLowerCase();
  // Defense-in-depth: URL parsing should have stripped any port by now,
  // but double-check that the final URL has the default port for its protocol.
  if (url.port !== "") return null;
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
