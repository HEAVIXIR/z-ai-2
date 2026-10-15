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

const RAW_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://heavix.ir";

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
      "Set it explicitly in your hosting environment to avoid canonical/sitemap mismatches.",
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
