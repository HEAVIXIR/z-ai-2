/* ============================================================
   HEAVIX — Canonical Site URL (single source of truth)
   ------------------------------------------------------------
   Production canonical URLs are emitted only outside Preview.
   Cloudflare Preview must receive an explicit non-secret origin via
   HEAVIX_PREVIEW_URL or a safe NEXT_PUBLIC_SITE_URL. A Preview build
   must fail closed rather than silently emit the production domain.
   ============================================================ */

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const heavixEnvironment = process.env.HEAVIX_ENV?.trim().toLowerCase();
const isCloudflarePreview = heavixEnvironment === "preview";

function normalizePreviewOrigin(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    const url = new URL(candidate);
    if (url.protocol !== "https:") return undefined;
    if (url.username || url.password) return undefined;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (hostname === "heavix.ir" || hostname.endsWith(".heavix.ir")) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

const previewOrigin = isCloudflarePreview
  ? normalizePreviewOrigin(process.env.HEAVIX_PREVIEW_URL) ??
    normalizePreviewOrigin(configuredSiteUrl)
  : undefined;

if (
  isCloudflarePreview &&
  process.env.NODE_ENV === "production" &&
  !previewOrigin
) {
  throw new Error(
    "[site-config] Cloudflare Preview requires a non-production HTTPS HEAVIX_PREVIEW_URL or NEXT_PUBLIC_SITE_URL; refusing to emit production canonical URLs.",
  );
}

const RAW_SITE_URL = (
  isCloudflarePreview && previewOrigin
    ? previewOrigin
    : configuredSiteUrl || "https://heavix.ir"
).replace(/\/+$/, "");

if (
  process.env.NODE_ENV === "production" &&
  !configuredSiteUrl &&
  !isCloudflarePreview
) {
  console.warn(
    "[site-config] NEXT_PUBLIC_SITE_URL is not set in production — falling back to https://heavix.ir. Set it explicitly in the deployment environment to avoid canonical/sitemap mismatches.",
  );
}

/** Canonical base URL of the site, without a trailing slash. */
export const SITE_BASE_URL: string = RAW_SITE_URL;

/** Preview and local deployments must never be indexed as the public site. */
export const IS_PREVIEW_DEPLOYMENT =
  process.env.NODE_ENV === "development" || isCloudflarePreview;

/**
 * Detect Preview at request time as well as from Cloudflare runtime bindings.
 * Hostname matching is a fallback when HEAVIX_ENV is not exposed to the request.
 */
export function isPreviewDeployment(hostname?: string): boolean {
  const heavixEnv = process.env.HEAVIX_ENV?.trim().toLowerCase();
  const host = (hostname ?? "").split(":")[0].trim().toLowerCase().replace(/\.$/, "");

  if (heavixEnv === "preview") return true;
  return host.endsWith(".workers.dev") || host.endsWith(".pages.dev");
}

/** Site display name (Persian). */
export const SITE_NAME = "هویکس";

/**
 * Resolve a possibly-relative URL against the canonical site base.
 * Absolute URLs pass through; relative paths are resolved against SITE_BASE_URL.
 */
export function absoluteUrl(maybeRelative: string): string {
  if (!maybeRelative) return SITE_BASE_URL;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  if (maybeRelative.startsWith("//")) return `https:${maybeRelative}`;
  if (maybeRelative.startsWith("/")) return `${SITE_BASE_URL}${maybeRelative}`;
  return `${SITE_BASE_URL}/${maybeRelative}`;
}
