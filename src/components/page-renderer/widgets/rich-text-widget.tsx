'use client';

/* ============================================================
   Rich-text widget — renders admin-authored HTML content.
   ------------------------------------------------------------
   SECURITY: the `content` string is sanitised before being
   injected via `dangerouslySetInnerHTML`. The sanitiser strips
   the three highest-risk XSS vectors:

     1. <script>…</script> blocks (tag + body)
     2. inline on* event-handler attributes (onclick, onerror…)
     3. `javascript:` / `vbscript:` / `data:text/html` URLs in
        href/src attributes

   This is a defense-in-depth layer for admin-authored content,
   NOT a full HTML allowlist. For untrusted user-generated
   content, prefer DOMPurify. No external dependencies — pure
   regex-based so it stays cheap and auditable.
   ============================================================ */

/**
 * Sanitise an HTML string for safe rendering. Strips <script>,
 * on* attributes, and javascript:/vbscript:/data:text/html URLs.
 */
export function sanitizeRichTextHtml(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) return "";

  let html = input;

  // 1. Remove <script>…</script> blocks (case-insensitive, multiline).
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");

  // 2. Remove any leftover <script> or </script> self-references
  //    (e.g. unclosed <script src=…> or orphaned closing tag).
  html = html.replace(/<\/?\s*script\b[^>]*>/gi, "");

  // 3. Strip inline on* event-handler attributes:
  //    on*="…", on*='…', on*=value
  html = html.replace(
    /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    "",
  );

  // 4. Neutralise dangerous URLs in href/src attributes by blanking
  //    the value when it starts with javascript:/vbscript:/
  //    data:text/html.
  html = html.replace(
    /(\b(?:href|src)\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/gi,
    (match, prefix: string, val: string) => {
      const inner = val.replace(/^["']|["']$/g, "").trim();
      if (
        /^\s*(?:javascript|vbscript|data:text\/html)\s*:/i.test(inner)
      ) {
        // Preserve the quote style of the original attribute.
        const quote = val.startsWith('"') ? '"' : val.startsWith("'") ? "'" : '"';
        return `${prefix}${quote}${quote}`;
      }
      return match;
    },
  );

  return html;
}

export default function RichTextWidget({ props }: { props: Record<string, any>; data?: any }) {
  const rawContent = typeof props.content === "string" ? props.content : "";
  const safeContent = sanitizeRichTextHtml(rawContent);

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
