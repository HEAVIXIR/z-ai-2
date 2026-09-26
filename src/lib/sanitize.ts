/* ============================================================
   HEAVIX — HTML sanitisation helper (Track E / T4)
   ------------------------------------------------------------
   Lightweight regex-based HTML XSS scrubber for admin-authored
   rich-text content. Strips the three highest-risk XSS vectors:

     1. <script>…</script> blocks
     2. <iframe>…</iframe> blocks (and orphans)
     3. inline on* event-handler attributes (onclick, onerror…)
     4. javascript: URLs

   This is a defense-in-depth layer for admin-authored content,
   NOT a full HTML allowlist. For untrusted user-generated content,
   prefer DOMPurify. No external dependencies — pure regex-based
   so it stays cheap, auditable, and Edge-runtime safe.

   The page-renderer rich-text widget also has a richer inline
   sanitiser (`sanitizeRichTextHtml`) that handles vbscript: and
   data:text/html URLs; this module is the standalone library
   surface used by API routes / server-side rendering paths that
   need to scrub HTML before persistence or response.
   ============================================================ */

/**
 * Sanitise an HTML string for safe storage / rendering.
 *
 * Strips:
 *   - `<script>…</script>` blocks (case-insensitive, multiline)
 *   - orphaned `<script>` / `</script>` tags
 *   - `<iframe>…</iframe>` blocks
 *   - orphaned `<iframe>` / `</iframe>` tags
 *   - inline `on*=` event-handler attributes (replaced with a
 *     benign `data-blocked=` attribute so the markup stays
 *     parseable)
 *   - `javascript:` URLs (the scheme is neutralised so the URL
 *     becomes inert)
 *
 * Returns "" for non-string / empty input — never throws.
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== "string" || html.length === 0) return "";

  let out = html;

  // 1. Remove <script>…</script> blocks (case-insensitive, multiline).
  out = out.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // 2. Remove orphaned <script> / </script> tags.
  out = out.replace(/<\/?\s*script\b[^>]*>/gi, "");

  // 3. Remove <iframe>…</iframe> blocks.
  out = out.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "");

  // 4. Remove orphaned <iframe> / </iframe> tags.
  out = out.replace(/<\/?\s*iframe\b[^>]*>/gi, "");

  // 5. Neutralise inline on* event-handler attributes by renaming
  //    them to `data-blocked=`. The benign name keeps the markup
  //    parseable while removing the active behaviour.
  out = out.replace(/on\w+\s*=/gi, "data-blocked=");

  // 6. Neutralise `javascript:` URLs wherever they appear.
  out = out.replace(/javascript:/gi, "");

  return out;
}
