'use client';

/* ============================================================
   Rich-text widget — renders admin-authored HTML content.
   ------------------------------------------------------------
   SECURITY: the `content` string is sanitised BEFORE being
   injected via `dangerouslySetInnerHTML`. Sanitisation is
   performed by the allowlist-based HTML tokenizer exported from
   `@/lib/sanitize` (`sanitizeHtml`). That sanitiser is a pure-JS,
   dependency-free, Edge-runtime-safe implementation that:

     1. Parses every tag (handling `<svg/onload=…>` slash-bypass
        and orphan end tags).
     2. Keeps ONLY an allowlist of presentation tags
        (p, br, strong, em, ul, ol, li, h1-h3, a, img,
         blockquote, code, pre, span, div, …).
     3. Drops the ENTIRE SUBTREE of dangerous container tags:
        <script>, <style>, <iframe>, <object>, <embed>, <svg>,
        <math>, <form>, <base>, <noscript>, <template>, …
     4. Strips ALL `on*` event-handler attributes (onclick,
        onerror, onload, …) — including `on*=` written without
        a space after the tag name.
     5. Strips the `style` attribute (CSS `expression()` /
        `@import` vectors).
     6. Validates href/src/xlink:href URLs — only http:, https:,
        mailto:, tel: schemes plus relative URLs are kept.
        `javascript:`, `vbscript:`, `data:text/html`,
        `data:image/svg+xml`, entity-encoded `java&#115;cript:`,
        and control-character-smuggled schemes are ALL rejected.

   This is defense-in-depth for admin-authored rich-text content.
   For untrusted user-generated content (marketplace reviews,
   comments, etc.) prefer a server-side DOMPurify pass at
   write-time.
   ============================================================ */

import { sanitizeHtml } from "@/lib/sanitize";

/**
 * Sanitise an HTML string for safe rendering. Re-exported here
 * for backwards compatibility with older imports; new code
 * should import `sanitizeHtml` directly from `@/lib/sanitize`.
 *
 * Strips <script>, <iframe>, <object>, <embed>, <svg>, <math>,
 * <style>, <base>, <form>, on* event-handler attributes, the
 * `style` attribute, and `javascript:` / `vbscript:` / `data:`
 * URLs in href/src.
 */
export const sanitizeRichTextHtml = sanitizeHtml;

export default function RichTextWidget({ props }: { props: Record<string, any>; data?: any }) {
  const rawContent = typeof props.content === "string" ? props.content : "";
  const safeContent = sanitizeHtml(rawContent);

  return (
    <div className="prose prose-sm max-w-none">
      {props.title && <h2 className="mb-2 font-bold">{props.title}</h2>}
      {safeContent ? (
        <div
          className="text-sm text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: safeContent }}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {props.content ?? ""}
        </p>
      )}
    </div>
  );
}
