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
     1. Cloudflare Preview: explicit `HEAVIX_PREVIEW_URL` when `HEAVIX_ENV=preview`. 
     2. Vercel Preview fallback: deployment-specific `VERCEL_URL` (never production).
     3. `NEXT_PUBLIC_SITE_URL` for explicit non-preview environments.
     4. Production fallback `https://heavix.ir`; local fallback localhost.

   Preview URLs are deployment-specific so metadata, sitemap and robots
   never point at the primary domain while testing. Production still warns
   when its canonical URL is not explicitly configured.
   ============================================================ */

const IS_CLOUDFLARE_PREVIEW = process.env.HEAVIX_ENV === "preview";
const IS_VERCEL_PREVIEW = process.env.VERCEL_ENV === "preview";

// Cloudflare Worker preview uses an explicit, non-secret URL binding.
// Never infer a public host from the production domain. If an operator has
// not configured the preview origin yet, fail closed to localhost.
const CLOUDFLARE_PREVIEW_URL = process.env.HEAVIX_PREVIEW_URL
  ?.replace(/\/+$/, "");
const VERCEL_PREVIEW_HOST = process.env.VERCEL_URL
  ?.replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");
const PREVIEW_SITE_URL = IS_CLOUDFLARE_PREVIEW
  ? CLOUDFLARE_PREVIEW_URL || "http://localhost:3000"
  : IS_VERCEL_PREVIEW
    ? VERCEL_PREVIEW_HOST
      ? `https://${VERCEL_PREVIEW_HOST}`
      : "http://localhost:3000"
    : null;

// Preview URLs are deployment-specific and must never inherit the
// production canonical host. Production keeps the explicit owner-configured
// URL (with the existing official-domain fallback); local development uses
// localhost unless explicitly configured.
const RAW_SITE_URL =
  PREVIEW_SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  (process.env.NODE_ENV === "production" ? "https://heavix.ir" : "http://localhost:3000");

if (
  process.env.NODE_ENV === "production" &&
  !process.env.NEXT_PUBLIC_SITE_URL
) {
  // Non-fatal: the hardcoded fallback keeps the app functional, but
  // the operator should set NEXT_PUBLIC_SITE_URL explicitly to match
  // the deployment's real public URL (especially for preview deploys
  // where the URL differs from the canonical production domain).
  console.warn(
    "[site-config] NEXT_PUBLIC_SITE_URL is not set in production — falling back to https://heavix.ir. " +
      "Set it explicitly in your production hosting environment to avoid canonical/sitemap mismatches.",
  );
}

/**
 * Canonical base URL of the site, without a trailing slash.
 * Example: `"https://heavix.ir"`.
 */
export const SITE_BASE_URL: string = RAW_SITE_URL;

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
