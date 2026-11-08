/* ============================================================
   HEAVIX — Canonical Site URL (single source of truth)
   ------------------------------------------------------------
   STEP 13.00 — Canonical Domain Hotfix

   All URL-emitting code (metadataBase, sitemap, robots, canonical,
   Open Graph, JSON-LD, absoluteUrl helpers) MUST consume the
   constants and helpers exported from this module. Repeating the
   domain string — or reading `process.env.NEXT_PUBLIC_SITE_URL`
   with different fallbacks — in multiple files is what caused the
   STEP 12.99 split-brain (heavix.ir vs havix.ir).

   Resolution order:
     1. `process.env.NEXT_PUBLIC_SITE_URL` (set per-environment in
        production; trailing slashes are stripped).
     2. Hardcoded fallback `https://heavix.ir` — the official
        HEAVIX domain per owner decision (STEP 13.00).

   Local dev:  env unset → falls back to `https://heavix.ir`
               (safe for metadataBase; no real crawling in dev).
   Production: MUST be set explicitly via the hosting platform's
               environment variables. A one-time console.warn is
               emitted at module load when unset in production so
               operators notice, but the code still works via the
               hardcoded fallback.
   ============================================================ */

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const heavixEnvironment = process.env.HEAVIX_ENV?.trim().toLowerCase();
const vercelEnvironment = process.env.VERCEL_ENV?.trim().toLowerCase();
const isProviderPreview =
  heavixEnvironment === "preview" || vercelEnvironment === "preview";

function isProductionCanonicalUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "heavix.ir" || hostname === "www.heavix.ir";
  } catch {
    return false;
  }
}

const vercelPreviewUrl =
  vercelEnvironment === "preview" && process.env.VERCEL_URL?.trim()
    ? `https://${process.env.VERCEL_URL.trim()}`
    : undefined;

// A Preview build must never silently inherit the production canonical host.
// Prefer an explicit non-production URL; otherwise use Vercel's deployment URL.
const safePreviewUrl = isProviderPreview
  ? (configuredSiteUrl && !isProductionCanonicalUrl(configuredSiteUrl)
      ? configuredSiteUrl
      : vercelPreviewUrl)
  : undefined;

if (isProviderPreview && !safePreviewUrl) {
  throw new Error(
    "[site-config] Preview deployment requires a non-production NEXT_PUBLIC_SITE_URL or VERCEL_URL; refusing to emit production canonical URLs.",
  );
}

const RAW_SITE_URL = (safePreviewUrl ?? configuredSiteUrl ?? "https://heavix.ir")
  .replace(/\\/+$/, "");

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
