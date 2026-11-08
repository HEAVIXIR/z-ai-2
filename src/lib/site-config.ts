/* ============================================================
   HEAVIX — Canonical Site URL (single source of truth)
   ------------------------------------------------------------
   All URL-emitting code must use this module.

   Resolution:
     1. A valid, non-production NEXT_PUBLIC_SITE_URL for Preview.
     2. VERCEL_URL for Vercel Preview when no safe explicit URL exists.
     3. NEXT_PUBLIC_SITE_URL for other environments.
     4. https://heavix.ir fallback only outside provider Preview.

   Preview fails closed if it cannot resolve a non-production origin.
   This prevents canonical, Open Graph, JSON-LD, robots, and sitemap
   URLs from accidentally pointing at the production domain.
   ============================================================ */

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const heavixEnvironment = process.env.HEAVIX_ENV?.trim().toLowerCase();
const vercelEnvironment = process.env.VERCEL_ENV?.trim().toLowerCase();
const isProviderPreview =
  heavixEnvironment === "preview" || vercelEnvironment === "preview";

function normalizePreviewOrigin(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    const url = new URL(candidate);
    if (url.protocol !== "https:") return undefined;
    if (url.hostname.toLowerCase() === "heavix.ir" ||
        url.hostname.toLowerCase() === "www.heavix.ir") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

const vercelPreviewUrl =
  vercelEnvironment === "preview"
    ? normalizePreviewOrigin(process.env.VERCEL_URL)
    : undefined;

const safePreviewUrl = isProviderPreview
  ? normalizePreviewOrigin(configuredSiteUrl) ?? vercelPreviewUrl
  : undefined;

if (isProviderPreview && !safePreviewUrl) {
  throw new Error(
    "[site-config] Preview deployment requires a non-production NEXT_PUBLIC_SITE_URL or VERCEL_URL; refusing to emit production canonical URLs.",
  );
}

const RAW_SITE_URL = (safePreviewUrl ?? configuredSiteUrl ?? "https://heavix.ir")
  .replace(/\/+$/, "");

if (
  process.env.NODE_ENV === "production" &&
  !configuredSiteUrl &&
  !vercelPreviewUrl &&
  !isProviderPreview
) {
  console.warn(
    "[site-config] NEXT_PUBLIC_SITE_URL is not set in production — falling back to https://heavix.ir. Set it explicitly in your hosting environment to avoid canonical/sitemap mismatches.",
  );
}

/**
 * Canonical base URL of the site, without a trailing slash.
 * Example: `"https://heavix.ir"`.
 */
export const SITE_BASE_URL: string = RAW_SITE_URL;

/**
 * Preview and local deployments must never be indexed as the public site.
 * Cloudflare sets HEAVIX_ENV=preview; Vercel supplies VERCEL_ENV=preview.
 */
export const IS_PREVIEW_DEPLOYMENT =
  process.env.NODE_ENV === "development" ||
  process.env.HEAVIX_ENV?.toLowerCase() === "preview" ||
  process.env.VERCEL_ENV?.toLowerCase() === "preview";

/**
 * Detect Preview at request time as well as from provider runtime bindings.
 * Hostname matching is a fallback for Workers/Vercel/Pages when a binding
 * is not exposed to the request module. Local development remains covered
 * by IS_PREVIEW_DEPLOYMENT for build-time metadata and response headers.
 */
export function isPreviewDeployment(hostname?: string): boolean {
  const heavixEnv = process.env.HEAVIX_ENV?.trim().toLowerCase();
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  const host = (hostname ?? "").split(":")[0].trim().toLowerCase().replace(/\.$/, "");

  if (heavixEnv === "preview" || vercelEnv === "preview") return true;
  return (
    host.endsWith(".workers.dev") ||
    host.endsWith(".vercel.app") ||
    host.endsWith(".pages.dev")
  );
}

/** Site display name (Persian). */
export const SITE_NAME = "هویکس";

/**
 * Resolve a possibly-relative URL against the canonical site base.
 *
 * - Absolute `http(s)://` URLs are returned unchanged.
 * - Protocol-relative `//host/path` URLs are upgraded to `https:`.
 * - Leading-slash paths (`/listings`) are appended to `SITE_BASE_URL`.
 * - Bare path segments (`listings`) are appended with a `/` separator.
 * - Empty input returns `SITE_BASE_URL` (useful for the homepage canonical).
 */
export function absoluteUrl(maybeRelative: string): string {
  if (!maybeRelative) return SITE_BASE_URL;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  if (maybeRelative.startsWith("//")) return `https:${maybeRelative}`;
  if (maybeRelative.startsWith("/")) return `${SITE_BASE_URL}${maybeRelative}`;
  return `${SITE_BASE_URL}/${maybeRelative}`;
}
