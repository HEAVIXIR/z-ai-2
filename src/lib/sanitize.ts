/* ============================================================
   HEAVIX — HTML sanitiser (Track E / T4 — F-007 + F-008 hardening)
   ------------------------------------------------------------
   Allowlist-based HTML sanitiser for admin-authored rich-text
   content rendered via `dangerouslySetInnerHTML`.

   DESIGN
   ------
   This is a pure-JS, dependency-free HTML *tokenizer* that walks
   the input character-by-character, identifies tags and their
   attributes, and rebuilds a safe HTML string by:

     1. Keeping ONLY a small allowlist of presentation tags
        (p, br, strong, em, ul, ol, li, h1-h3, a, img,
         blockquote, code, pre, span, div, ...).
     2. Dropping the ENTIRE SUBTREE of dangerous container tags
        (script, style, iframe, object, embed, svg, math, form,
         noscript, template, xml, frameset, frame, applet, ...).
     3. Dropping void "metadata" tags entirely (base, link, meta,
        embed, param, source, track) — never emitted.
     4. Unwrapping any other disallowed tag (e.g. <button>,
        <marquee>) — tag is dropped, inner content is kept and
        re-sanitised.
     5. For every kept tag, stripping ALL `on*` event-handler
        attributes and the `style` attribute (CSS expressions).
     6. For URL attributes (href/src/xlink:href/action/formaction),
        decoding HTML entities, stripping control characters, and
        allowing only http:, https:, mailto:, tel: schemes plus
        relative URLs. Rejects javascript:, vbscript:, data:,
        file:, and anything else.

   WHY NOT REGEX?
   --------------
   The previous implementation was a regex-based scrubber. It
   was bypassable via:
     • `<svg/onload=...>` — slash separator defeats `\s+on` regex
     • `<a href="java&#115;cript:...">` — entity-encoded scheme
     • `<style>@import url(evil)</style>` — CSS expression vector
     • `<object>`, `<embed>`, `<base>`, `<form>` tags not stripped
   A real tokenizer closes all of these vectors because it
   identifies tag boundaries independent of whitespace separators
   and decodes entities before validating URL schemes.

   WHY NOT DOMPurify?
   ------------------
   DOMPurify requires either `jsdom` (Node-only, ~6 MB) or a real
   DOM (browser/Edge runtime with `DOMParser`). The HEAVIX
   rich-text widget is a React Client Component that may render
   in either Node SSR or browser; we needed an isomorphic,
   zero-dependency solution. This module is ~250 LoC of auditable
   pure JS, no `eval`, no `Function`, no DOM access.

   RESIDUAL RISK (documented)
   --------------------------
   This sanitiser protects against reflected/stored XSS via
   admin-authored rich-text content. It does NOT sanitise:
     • JSON-LD structured data in `src/app/articles/[slug]/page.tsx`
       (line 312) — that uses `JSON.stringify(jsonLd)` which is
       safe-by-construction because jsonLd is built from typed
       Prisma fields, NOT user-supplied HTML. (Documented in
       STEP-15.37-C worklog.)
     • The shadcn/ui `<ChartStyle>` component in
       `src/components/ui/chart.tsx` (line 83) which emits CSS
       from `ChartConfig` props. That is a third-party component
       outside the scope of this fix; documented as residual.

   For untrusted user-generated content (e.g. marketplace
   reviews, comments), prefer a server-side DOMPurify pass at
   write-time — this module is defense-in-depth for admin content
   only.
   ============================================================ */

/* ----------------------------------------------------------------
   Allowlist of tags that are KEPT in the output.
   ---------------------------------------------------------------- */
const ALLOWED_TAGS = new Set<string>([
  // Paragraph / line breaks
  "p", "br", "wbr", "hr",
  // Inline text formatting
  "strong", "em", "b", "i", "u", "s", "del", "ins", "mark",
  "sub", "sup", "small", "abbr", "kbd", "samp", "var", "code",
  "span", "time", "q", "cite", "address",
  // Headings
  "h1", "h2", "h3", "h4", "h5", "h6",
  // Lists
  "ul", "ol", "li", "dl", "dt", "dd",
  // Links & media
  "a", "img",
  // Blocks
  "blockquote", "pre", "div", "figure", "figcaption",
  // Tables
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "caption", "colgroup", "col",
]);

/* Void (self-closing) HTML5 elements — emitted as `<tag ... />`. */
const VOID_TAGS = new Set<string>([
  "br", "wbr", "hr", "img", "col",
]);

/* Tags whose ENTIRE SUBTREE is dropped (tag + content + children).
   These are dangerous because their content is active code
   (script/style), an external-resource include (iframe/object/
   embed/svg/math), or a state-mutating container (form). */
const DROP_TREE_TAGS = new Set<string>([
  "script", "style", "iframe", "object", "svg", "math", "form",
  "noscript", "template", "noframes", "frameset", "frame",
  "applet", "xml", "title", "head", "html", "body",
  "button", "select", "option", "optgroup", "textarea",
  "input", "fieldset", "legend", "label", "datalist",
  "output", "progress", "meter",
]);

/* Void "metadata" tags that are dropped entirely (no subtree,
   just the start tag itself). These belong in `<head>`, never
   in rich-text body content. */
const VOID_DROP_TAGS = new Set<string>([
  "base", "link", "meta", "embed", "param", "source", "track",
  "area", "keygen", "command", "device",
]);

/* Attribute allowlist (in addition to data-* which is always safe). */
const ALLOWED_ATTRS = new Set<string>([
  "alt", "title", "name", "lang", "dir",
  "colspan", "rowspan", "headers", "scope",
  "width", "height",
  "href", "src",
  "target", "rel",
  "start", "type", "value",  // for <ol start>, <li value>
  "datetime",  // for <time>
  "cite",  // for <blockquote cite>, <q cite>
]);

/* URL-carrying attributes — scheme-validated. */
const URL_ATTRS = new Set<string>([
  "href", "src", "xlink:href", "action", "formaction", "poster",
  "background", "dynsrc", "lowsrc", "data",
]);

/* Allowed URL schemes (lowercase, no colon). Relative URLs and
   fragment-only URLs are always allowed. */
const SAFE_URL_SCHEMES = new Set<string>([
  "http", "https", "mailto", "tel",
]);

/* Common HTML named entities used to obfuscate URL schemes. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: " ", tab: "\t", newline: "\n", colon: ":",
  sol: "/", bsol: "\\", verbar: "|", lpar: "(", rpar: ")",
  period: ".", comma: ",", semi: ";", excl: "!", num: "#",
  dollar: "$", percnt: "%", ast: "*", plus: "+", minus: "-",
 equals: "=", quest: "?", commat: "@", exclam: "!",
};

/* ----------------------------------------------------------------
   Entity decoder — used ONLY for URL scheme detection, never on
   text content (text entities are passed through untouched so
   `&lt;script&gt;` stays as inert text).
   ---------------------------------------------------------------- */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d{1,8});/g, (_m, n: string) => {
      const code = parseInt(n, 10);
      if (code < 0 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_m, n: string) => {
      const code = parseInt(n, 16);
      if (code < 0 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,31});/g, (m, name: string) => {
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name.toLowerCase())
        ? NAMED_ENTITIES[name.toLowerCase()]
        : m;
    });
}

/* Escape a string for safe re-emission as an attribute value. */
function escapeAttrValue(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ----------------------------------------------------------------
   URL scheme validator.
   Returns true if `rawValue` (an attribute value as parsed from
   the source HTML) resolves to a safe URL.
   ---------------------------------------------------------------- */
function isSafeUrl(rawValue: string): boolean {
  if (rawValue.length === 0) return true; // empty href is benign
  // Decode HTML entities so `java&#115;cript:` is detected.
  const decoded = decodeEntities(rawValue);
  // Strip ALL control chars (0x00-0x1F, 0x7F) and quotes so
  // browsers can't smuggle a scheme past us with embedded
  // whitespace / line-noise.
  const stripped = decoded
    .replace(/[\x00-\x20\x7f'"`\\]/g, "")
    .toLowerCase();
  // No scheme → relative URL or fragment → safe.
  const schemeMatch = stripped.match(/^([a-z][a-z0-9+.\-]*):/);
  if (!schemeMatch) {
    // Reject protocol-relative `//evil.com` only if it carries
    // a scheme-like prefix elsewhere — but `//host/path` is
    // actually safe-ish (inherits page scheme). We allow it.
    return true;
  }
  return SAFE_URL_SCHEMES.has(schemeMatch[1]);
}

/* ----------------------------------------------------------------
   Parsed-tag descriptor.
   `type` is one of:
     - "comment"     <!-- ... -->
     - "cdata"       <![CDATA[ ... ]]>
     - "doctype"     <!DOCTYPE ...> or any <!...>
     - "pi"          <? ... ?>
     - "start"       <tag ...>
     - "end"         </tag>
   `end` is the index AFTER the closing `>` (or input length if
   the tag is unterminated).
   ---------------------------------------------------------------- */
interface ParsedTag {
  type: "comment" | "cdata" | "doctype" | "pi" | "start" | "end";
  tagName: string;
  rawAttrs: string;
  end: number;
}

/* Parse a tag starting at `start` (which must point at `<`).
   Returns null if the character sequence at `start` is not a
   recognisable tag (in which case the caller should treat the
   `<` as literal text). */
function parseTag(html: string, start: number): ParsedTag | null {
  const len = html.length;
  if (start + 1 >= len) return null;

  // Comment: <!-- ... -->
  if (html.startsWith("<!--", start)) {
    const endIdx = html.indexOf("-->", start + 4);
    return {
      type: "comment",
      tagName: "",
      rawAttrs: "",
      end: endIdx === -1 ? len : endIdx + 3,
    };
  }
  // CDATA: <![CDATA[ ... ]]>
  if (html.startsWith("<![CDATA[", start)) {
    const endIdx = html.indexOf("]]>", start + 9);
    return {
      type: "cdata",
      tagName: "",
      rawAttrs: "",
      end: endIdx === -1 ? len : endIdx + 3,
    };
  }
  // Doctype / declaration: <!...>
  if (html[start + 1] === "!") {
    const endIdx = html.indexOf(">", start + 2);
    return {
      type: "doctype",
      tagName: "",
      rawAttrs: "",
      end: endIdx === -1 ? len : endIdx + 1,
    };
  }
  // Processing instruction: <?...>
  if (html[start + 1] === "?") {
    const endIdx = html.indexOf(">", start + 2);
    return {
      type: "pi",
      tagName: "",
      rawAttrs: "",
      end: endIdx === -1 ? len : endIdx + 1,
    };
  }

  // End tag: </tagname ...>
  let idx = start + 1;
  let isEnd = false;
  if (idx < len && html[idx] === "/") {
    isEnd = true;
    idx++;
  }

  // Tag name: letters, digits, hyphen, underscore, colon (for
  // XML namespaced tags like svg:foo). Slash is NOT allowed so
  // that `<svg/onload=...>` parses tagName="svg" and the slash
  // falls into the attribute parser (which then drops `onload`
  // as an `on*` handler).
  let nameEnd = idx;
  while (nameEnd < len) {
    const c = html[nameEnd];
    if (
      (c >= "a" && c <= "z") ||
      (c >= "A" && c <= "Z") ||
      (c >= "0" && c <= "9") ||
      c === "-" || c === "_" || c === ":"
    ) {
      nameEnd++;
    } else {
      break;
    }
  }
  if (nameEnd === idx) {
    // No tag name — e.g. `< ` or `<<` — treat as text.
    return null;
  }
  const tagName = html.slice(idx, nameEnd);

  // Walk forward respecting quoted attribute values to find the
  // matching `>` (or end of input).
  let j = nameEnd;
  while (j < len) {
    const c = html[j];
    if (c === '"' || c === "'") {
      const quote = c;
      j++;
      while (j < len && html[j] !== quote) j++;
      if (j < len) j++; // skip closing quote
    } else if (c === ">") {
      break;
    } else {
      j++;
    }
  }
  const rawAttrs = html.slice(nameEnd, j);
  return {
    type: isEnd ? "end" : "start",
    tagName,
    rawAttrs,
    end: j >= len ? len : j + 1,
  };
}

/* Find the matching end tag for a DROP_TREE start tag. Returns
   the index AFTER the closing `</tagName>` (or input length if
   no matching close exists). Depth-tracks nested same-name
   start tags so `<script><script></script></script>` collapses
   correctly. */
function findMatchingEnd(html: string, start: number, tagName: string): number {
  const len = html.length;
  const lower = tagName.toLowerCase();
  let depth = 1;
  let i = start;
  while (i < len) {
    if (html[i] === "<") {
      const parsed = parseTag(html, i);
      if (parsed) {
        if (parsed.tagName.toLowerCase() === lower) {
          if (parsed.type === "start") depth++;
          else if (parsed.type === "end") {
            depth--;
            if (depth === 0) return parsed.end;
          }
        }
        i = parsed.end;
        continue;
      }
    }
    i++;
  }
  return len; // unterminated — drop everything to end (safe)
}

/* ----------------------------------------------------------------
   Attribute parser. Walks `rawAttrs` and returns a sanitised
   attribute string ready to be appended to `<tagname` in the
   output. Always begins with a single leading space if any
   attributes survive; empty string if none.
   ---------------------------------------------------------------- */
function sanitizeAttrs(rawAttrs: string): string {
  const kept: string[] = [];
  let i = 0;
  const len = rawAttrs.length;

  while (i < len) {
    // Skip separators: whitespace, stray slashes, commas.
    while (i < len) {
      const c = rawAttrs[i];
      if (
        c === " " || c === "\t" || c === "\n" || c === "\r" ||
        c === "/" || c === "," || c === "\\" || c === ";"
      ) {
        i++;
      } else {
        break;
      }
    }
    if (i >= len) break;

    // Parse attribute name.
    const nameStart = i;
    while (i < len) {
      const c = rawAttrs[i];
      if (
        c === "=" || c === " " || c === "\t" || c === "\n" ||
        c === "\r" || c === "/" || c === ">" || c === "<"
      ) {
        break;
      }
      i++;
    }
    if (i === nameStart) break; // no name char consumed — bail
    const attrName = rawAttrs.slice(nameStart, i).toLowerCase();
    if (!attrName) break;

    // Optional `=value` (value may be quoted or bare).
    let value: string | null = null;
    let j = i;
    while (
      j < len &&
      (rawAttrs[j] === " " || rawAttrs[j] === "\t" ||
       rawAttrs[j] === "\n" || rawAttrs[j] === "\r")
    ) {
      j++;
    }
    if (j < len && rawAttrs[j] === "=") {
      j++;
      while (
        j < len &&
        (rawAttrs[j] === " " || rawAttrs[j] === "\t" ||
         rawAttrs[j] === "\n" || rawAttrs[j] === "\r")
      ) {
        j++;
      }
      if (j < len && (rawAttrs[j] === '"' || rawAttrs[j] === "'")) {
        const quote = rawAttrs[j];
        j++;
        const valStart = j;
        while (j < len && rawAttrs[j] !== quote) j++;
        value = rawAttrs.slice(valStart, j);
        if (j < len) j++; // skip closing quote
      } else {
        const valStart = j;
        while (j < len) {
          const c = rawAttrs[j];
          if (
            c === " " || c === "\t" || c === "\n" || c === "\r" ||
            c === "/" || c === ">"
          ) {
            break;
          }
          j++;
        }
        value = rawAttrs.slice(valStart, j);
      }
      i = j;
    }

    // ---- Decision: keep or drop? ----

    // 1. Drop ALL `on*` event-handler attributes (onclick,
    //    onerror, onload, onpointerover, ...). Also drop any
    //    attribute beginning with `on` regardless of length, to
    //    cover future/non-standard handlers.
    if (attrName === "on" || attrName.startsWith("on")) continue;

    // 2. Drop `style` (CSS expression vector).
    if (attrName === "style") continue;

    // 3. Drop any XML-namespaced attribute EXCEPT `xlink:href`
    //    (which we URL-validate below) and `data-*`.
    if (attrName.includes(":") &&
        attrName !== "xlink:href" &&
        attrName !== "xml:lang") {
      continue;
    }

    // 4. URL-carrying attributes — validate scheme.
    if (URL_ATTRS.has(attrName)) {
      if (value === null) continue; // no value → drop
      if (!isSafeUrl(value)) continue; // bad scheme → drop
      kept.push(`${attrName}="${escapeAttrValue(value)}"`);
      continue;
    }

    // 5. `data-*` attributes — always safe (no scripting surface).
    if (attrName.startsWith("data-")) {
      if (value !== null) {
        kept.push(`${attrName}="${escapeAttrValue(value)}"`);
      } else {
        kept.push(attrName);
      }
      continue;
    }

    // 6. Other allowlisted attributes.
    if (ALLOWED_ATTRS.has(attrName)) {
      if (value !== null) {
        kept.push(`${attrName}="${escapeAttrValue(value)}"`);
      } else {
        kept.push(attrName);
      }
      continue;
    }
    // else: drop (not in allowlist)
  }

  if (kept.length === 0) return "";
  return " " + kept.join(" ");
}

/* ----------------------------------------------------------------
   Sanitise an HTML string for safe rendering.
   Returns "" for non-string / empty input — never throws.
   ---------------------------------------------------------------- */
export function sanitizeHtml(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) return "";

  const html = input;
  const len = html.length;
  let out = "";
  let i = 0;

  while (i < len) {
    const ch = html[i];
    if (ch !== "<") {
      out += ch;
      i++;
      continue;
    }

    // Try to parse a tag at this position.
    const parsed = parseTag(html, i);
    if (!parsed) {
      // Not a recognisable tag — treat `<` as literal text.
      out += ch;
      i++;
      continue;
    }

    // Comments, CDATA, doctypes, processing instructions → drop.
    if (
      parsed.type === "comment" ||
      parsed.type === "cdata" ||
      parsed.type === "doctype" ||
      parsed.type === "pi"
    ) {
      i = parsed.end;
      continue;
    }

    const lowerName = parsed.tagName.toLowerCase();

    // Void metadata tags (base, link, meta, embed, ...) → drop
    // just the start tag itself; content after it is processed
    // normally.
    if (VOID_DROP_TAGS.has(lowerName)) {
      i = parsed.end;
      continue;
    }

    // Dangerous container tags (script, style, iframe, object,
    // svg, math, form, ...) → drop entire subtree.
    if (DROP_TREE_TAGS.has(lowerName)) {
      if (parsed.type === "start") {
        i = findMatchingEnd(html, parsed.end, lowerName);
      } else {
        // Orphan end tag for a dropped container — drop it too.
        i = parsed.end;
      }
      continue;
    }

    // End tags: emit only for allowed tags; drop unknowns.
    if (parsed.type === "end") {
      if (ALLOWED_TAGS.has(lowerName) && !VOID_TAGS.has(lowerName)) {
        out += `</${lowerName}>`;
      }
      i = parsed.end;
      continue;
    }

    // Start tags.
    if (parsed.type === "start") {
      if (ALLOWED_TAGS.has(lowerName)) {
        const attrs = sanitizeAttrs(parsed.rawAttrs);
        if (VOID_TAGS.has(lowerName)) {
          out += `<${lowerName}${attrs} />`;
        } else {
          out += `<${lowerName}${attrs}>`;
        }
      }
      // else: disallowed non-dangerous tag → unwrap (drop tag,
      // keep content). Just advance past the tag.
      i = parsed.end;
      continue;
    }

    // Unreachable — defensive.
    i = parsed.end;
  }

  return out;
}

/* Back-compat alias — the page-renderer rich-text widget
   previously exported its own `sanitizeRichTextHtml`. Other
   consumers (if any) can keep importing this name. */
export const sanitizeRichTextHtml = sanitizeHtml;
