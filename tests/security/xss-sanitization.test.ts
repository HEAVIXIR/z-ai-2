/**
 * HEAVIX — Security Tests: XSS Sanitisation (STEP 15.37 / F-007 + F-008)
 * ------------------------------------------------------------------------
 * Regression tests for the allowlist-based HTML sanitiser in
 * `src/lib/sanitize.ts` and its consumer `rich-text-widget.tsx`.
 *
 * Background
 * ----------
 * The previous implementation (regex-based `sanitizeRichTextHtml`)
 * was bypassable via:
 *   • `<svg/onload=…>`          — slash separator defeats `\s+on`
 *   • `<a href="java&#115;cript:…">`  — entity-encoded scheme
 *   • `<style>@import url(evil)</style>` — CSS expression vector
 *   • `<object>`, `<embed>`, `<base>`, `<form>` tags not stripped
 *
 * This file exercises each of those vectors plus positive cases
 * (legitimate rich-text is preserved verbatim) and edge cases
 * (null/undefined/empty input).
 *
 * Test methodology
 * ----------------
 * Each test feeds an XSS payload to `sanitizeHtml()` and asserts
 * that the output contains NO executable construct:
 *   - no `<script` substring (case-insensitive)
 *   - no `<iframe`, `<object`, `<embed`, `<svg`, `<math`,
 *     `<style`, `<base`, `<form` substrings
 *   - no `on*=` event-handler attributes
 *   - no `javascript:`, `vbscript:`, `data:text/html` URL schemes
 *
 * Positive cases assert that legitimate rich-text markup is
 * preserved (whitespace-normalised comparison).
 */

import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeRichTextHtml } from "@/lib/sanitize";

/* Helper: assert the sanitised output contains no executable
   HTML construct. Used by every negative (XSS) test. */
function assertNoExecutableHtml(output: string): void {
  expect(output).not.toMatch(/<script[\s>]/i);
  expect(output).not.toMatch(/<\/script/i);
  expect(output).not.toMatch(/<iframe[\s>]/i);
  expect(output).not.toMatch(/<object[\s>]/i);
  expect(output).not.toMatch(/<embed[\s>]/i);
  expect(output).not.toMatch(/<svg[\s>]/i);
  expect(output).not.toMatch(/<math[\s>]/i);
  expect(output).not.toMatch(/<style[\s>]/i);
  expect(output).not.toMatch(/<base[\s>]/i);
  expect(output).not.toMatch(/<form[\s>]/i);
  // No on* event-handler attributes (onclick, onerror, onload, …)
  expect(output).not.toMatch(/\son[a-z]+\s*=/i);
  // No dangerous URL schemes inside href/src values
  expect(output).not.toMatch(/(href|src)\s*=\s*["']?\s*(javascript|vbscript):/i);
  expect(output).not.toMatch(/(href|src)\s*=\s*["']?\s*data:text\/html/i);
}

describe("sanitizeHtml — XSS payload regression suite", () => {
  it("strips <script>alert(1)</script> blocks", () => {
    const out = sanitizeHtml("<p>hi</p><script>alert(1)</script><p>bye</p>");
    assertNoExecutableHtml(out);
    expect(out).toMatch(/<p>hi<\/p>/);
    expect(out).toMatch(/<p>bye<\/p>/);
    expect(out).not.toContain("alert");
  });

  it("strips <svg/onload=alert(1)> — slash-separator bypass", () => {
    // The legacy regex `\s+on` was defeated because the slash
    // between `svg` and `onload` is not whitespace. The new
    // tokenizer parses `svg` as the tag name (stops at `/`) and
    // then drops the entire <svg> subtree, AND any `on*`
    // attribute on any surviving tag is dropped by the
    // attribute sanitiser.
    const out = sanitizeHtml("<svg/onload=alert(1)>");
    assertNoExecutableHtml(out);
    expect(out).not.toContain("onload");
    expect(out).not.toContain("alert");
  });

  it("strips onerror from <img src=x onerror=alert(1)>", () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    assertNoExecutableHtml(out);
    // The <img> tag survives (it is allowlisted), but onerror is
    // stripped and src is preserved (relative URL).
    expect(out).toMatch(/<img\s+src="x"\s*\/>/);
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("alert");
  });

  it("neutralises <a href=\"javascript:alert(1)\"> href", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    assertNoExecutableHtml(out);
    // The href must be dropped because javascript: is not in the
    // safe-scheme allowlist; the <a> tag survives without href.
    expect(out).toMatch(/<a>/);
    expect(out).toContain("click");
    expect(out).not.toContain("javascript");
  });

  it("neutralises <a href=\"javascript:alert(1)\" > with trailing space", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)" >click</a>');
    assertNoExecutableHtml(out);
    expect(out).toContain("click");
    expect(out).not.toContain("javascript");
  });

  it("strips <iframe src=\"evil\"></iframe> entirely", () => {
    const out = sanitizeHtml('<p>before</p><iframe src="evil"></iframe><p>after</p>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("evil");
    expect(out).not.toContain("iframe");
    expect(out).toMatch(/<p>before<\/p>/);
    expect(out).toMatch(/<p>after<\/p>/);
  });

  it("strips <object data=\"evil\"></object> entirely", () => {
    const out = sanitizeHtml('<p>x</p><object data="evil"></object><p>y</p>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("evil");
    expect(out).not.toContain("object");
  });

  it("strips <style>@import url(evil)</style> entirely", () => {
    const out = sanitizeHtml("<p>x</p><style>@import url(evil)</style><p>y</p>");
    assertNoExecutableHtml(out);
    expect(out).not.toContain("@import");
    expect(out).not.toContain("evil");
    expect(out).not.toContain("style");
  });

  it("strips <base href=\"evil\"> (void metadata tag)", () => {
    const out = sanitizeHtml('<base href="evil"><p>content</p>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("base");
    expect(out).not.toContain("evil");
    expect(out).toMatch(/<p>content<\/p>/);
  });

  it("strips <form action=\"evil\">...</form> entirely", () => {
    const out = sanitizeHtml(
      '<form action="evil"><button>go</button></form><p>after</p>',
    );
    assertNoExecutableHtml(out);
    expect(out).not.toContain("form");
    expect(out).not.toContain("evil");
    expect(out).not.toContain("button");
  });

  it("strips <embed src=\"evil\"> (void metadata tag)", () => {
    const out = sanitizeHtml('<embed src="evil"><p>after</p>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("embed");
    expect(out).not.toContain("evil");
  });
});

describe("sanitizeHtml — entity-encoded URL bypasses", () => {
  it("rejects entity-encoded javascript: scheme (decimal)", () => {
    // `&#106;` = j, so `java&#115;cript:` decodes to `javascript:`.
    const out = sanitizeHtml('<a href="java&#115;cript:alert(1)">x</a>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("alert");
  });

  it("rejects entity-encoded javascript: scheme (hex)", () => {
    // `&#x6a;` = j, so `java&#x73;cript:` decodes to `javascript:`.
    const out = sanitizeHtml('<a href="java&#x73;cript:alert(1)">x</a>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("alert");
  });

  it("rejects entity-encoded colon (javascript&colon;alert(1))", () => {
    const out = sanitizeHtml('<a href="javascript&colon;alert(1)">x</a>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("alert");
  });

  it("rejects control-char-smuggled javascript: scheme", () => {
    // Browsers strip 0x00-0x20 from URLs before scheme detection;
    // the sanitiser must do the same.
    const out = sanitizeHtml('<a href="java\tscript:alert(1)">x</a>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("alert");
  });

  it("rejects leading-whitespace javascript: scheme", () => {
    const out = sanitizeHtml('<a href="  javascript:alert(1)">x</a>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("alert");
  });

  it("rejects vbscript: URL scheme", () => {
    const out = sanitizeHtml('<a href="vbscript:msgbox(1)">x</a>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("vbscript");
    expect(out).not.toContain("msgbox");
  });

  it("rejects data:text/html URL scheme", () => {
    const out = sanitizeHtml(
      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    );
    assertNoExecutableHtml(out);
    expect(out).not.toContain("data:text/html");
  });
});

describe("sanitizeHtml — legitimate rich-text is preserved", () => {
  it("preserves <p>Hello <strong>world</strong></p>", () => {
    const out = sanitizeHtml("<p>Hello <strong>world</strong></p>");
    expect(out).toBe("<p>Hello <strong>world</strong></p>");
  });

  it("preserves <a href=\"https://example.com\">link</a>", () => {
    const out = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(out).toBe('<a href="https://example.com">link</a>');
  });

  it("preserves mailto: and tel: links", () => {
    const out = sanitizeHtml(
      '<a href="mailto:hi@example.com">mail</a><a href="tel:+15551234567">call</a>',
    );
    expect(out).toContain('href="mailto:hi@example.com"');
    expect(out).toContain('href="tel:+15551234567"');
  });

  it("preserves relative URLs and fragments", () => {
    const out = sanitizeHtml('<a href="/articles/foo">foo</a><a href="#section">jump</a>');
    expect(out).toContain('href="/articles/foo"');
    expect(out).toContain('href="#section"');
  });

  it("preserves <img src=\"/img.png\" alt=\"pic\" />", () => {
    const out = sanitizeHtml('<img src="/img.png" alt="pic">');
    expect(out).toBe('<img src="/img.png" alt="pic" />');
  });

  it("preserves headings, lists, blockquotes, code, pre", () => {
    const out = sanitizeHtml(
      "<h1>Title</h1><h2>Sub</h2><h3>Sub-sub</h3>" +
      "<ul><li>one</li><li>two</li></ul>" +
      "<blockquote>quoted</blockquote><pre><code>x = 1</code></pre>",
    );
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<h2>Sub</h2>");
    expect(out).toContain("<h3>Sub-sub</h3>");
    expect(out).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(out).toContain("<blockquote>quoted</blockquote>");
    expect(out).toContain("<pre><code>x = 1</code></pre>");
  });

  it("preserves table structure", () => {
    const out = sanitizeHtml(
      "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>",
    );
    expect(out).toBe(
      "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>",
    );
  });
});

describe("sanitizeHtml — nested encoding edge cases", () => {
  it("leaves &lt;script&gt; as inert text (no decoding to executable)", () => {
    // The browser will decode `&lt;` to `<` for DISPLAY, but it
    // will never parse it as a tag boundary — so this is safe.
    // The sanitiser must NOT decode entities on text content
    // (which would turn it into an executable tag) NOR drop it
    // (which would lose legitimate escaped text).
    const out = sanitizeHtml("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    // Confirm the sanitised output does not contain a real
    // <script> tag (it should only contain the entity-encoded
    // form which the browser renders as inert text).
    assertNoExecutableHtml(out);
  });

  it("leaves double-encoded &amp;lt;script&amp;gt; untouched", () => {
    const out = sanitizeHtml("&amp;lt;script&amp;gt;");
    expect(out).toBe("&amp;lt;script&amp;gt;");
    assertNoExecutableHtml(out);
  });
});

describe("sanitizeHtml — input edge cases", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("returns empty string for null input", () => {
    expect(sanitizeHtml(null as unknown as string)).toBe("");
  });

  it("returns empty string for undefined input", () => {
    expect(sanitizeHtml(undefined as unknown as string)).toBe("");
  });

  it("returns empty string for non-string input (number)", () => {
    expect(sanitizeHtml(42 as unknown as string)).toBe("");
  });

  it("returns empty string for object input", () => {
    expect(sanitizeHtml({ evil: true } as unknown as string)).toBe("");
  });

  it("never throws on malformed input (unclosed tag)", () => {
    expect(() => sanitizeHtml("<p>unclosed")).not.toThrow();
    expect(() => sanitizeHtml("<<<<<")).not.toThrow();
    expect(() => sanitizeHtml("<a href=")).not.toThrow();
  });
});

describe("sanitizeHtml — advanced XSS vectors (defense-in-depth)", () => {
  it("strips <a onclick=alert(1)> — unquoted on* attribute", () => {
    const out = sanitizeHtml("<a onclick=alert(1)>x</a>");
    assertNoExecutableHtml(out);
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("alert");
  });

  it("strips on* attribute on a tag whose name is followed by a slash", () => {
    // Mimics the <svg/onload=…> vector but on an allowlisted
    // tag — the on* attribute must still be stripped because
    // the attribute parser treats `/` as a separator.
    const out = sanitizeHtml("<a/onmouseover=alert(1)>x</a>");
    assertNoExecutableHtml(out);
    expect(out).not.toContain("onmouseover");
    expect(out).not.toContain("alert");
    // The <a> tag itself survives (it is allowlisted).
    expect(out).toContain("x");
  });

  it("strips the inline style attribute (CSS expression vector)", () => {
    const out = sanitizeHtml('<p style="background:url(javascript:alert(1))">x</p>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("style");
    expect(out).not.toContain("javascript");
    expect(out).toContain("x");
  });

  it("strips <script src=evil.js></script> with src attribute", () => {
    const out = sanitizeHtml('<script src="evil.js"></script><p>after</p>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("evil.js");
    expect(out).toMatch(/<p>after<\/p>/);
  });

  it("strips nested <svg><script>alert(1)</script></svg>", () => {
    const out = sanitizeHtml("<p>x</p><svg><script>alert(1)</script></svg><p>y</p>");
    assertNoExecutableHtml(out);
    expect(out).not.toContain("alert");
    expect(out).toMatch(/<p>x<\/p>/);
    expect(out).toMatch(/<p>y<\/p>/);
  });

  it("strips <iframe> with arbitrary attributes", () => {
    const out = sanitizeHtml('<iframe srcdoc="<script>alert(1)</script>"></iframe>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("alert");
    expect(out).not.toContain("iframe");
  });

  it("strips data: URL on img src (reject all data: schemes)", () => {
    const out = sanitizeHtml('<img src="data:image/svg+xml,<svg onload=alert(1)>">');
    assertNoExecutableHtml(out);
    // The img tag survives (allowlisted) but the data: src is
    // dropped because data: is not in the safe-scheme allowlist.
    expect(out).toMatch(/<img\s*\/>/);
    expect(out).not.toContain("data:");
    expect(out).not.toContain("alert");
  });

  it("strips mixed-case <ScRiPt>alert(1)</ScRiPt>", () => {
    const out = sanitizeHtml("<ScRiPt>alert(1)</ScRiPt>");
    assertNoExecutableHtml(out);
    expect(out).not.toContain("alert");
  });

  it("strips HTML comment containing script-like content", () => {
    // `<!-- <script>alert(1)</script> -->` — the comment is
    // dropped entirely, so even if a browser bug re-enabled
    // comments, no script would execute.
    const out = sanitizeHtml("<!-- <script>alert(1)</script> -->");
    assertNoExecutableHtml(out);
    expect(out).not.toContain("alert");
  });

  it("strips CDATA section", () => {
    const out = sanitizeHtml("<![CDATA[<script>alert(1)</script>]]>");
    assertNoExecutableHtml(out);
    expect(out).not.toContain("alert");
  });

  it("strips processing instruction <?xml ... ?>", () => {
    const out = sanitizeHtml('<?xml version="1.0"?><p>x</p>');
    expect(out).not.toContain("<?xml");
    expect(out).toMatch(/<p>x<\/p>/);
  });

  it("strips <meta http-equiv=refresh> redirect", () => {
    const out = sanitizeHtml('<meta http-equiv="refresh" content="0;url=evil"><p>x</p>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("meta");
    expect(out).not.toContain("evil");
    expect(out).toMatch(/<p>x<\/p>/);
  });

  it("strips <link rel=stylesheet href=evil>", () => {
    const out = sanitizeHtml('<link rel="stylesheet" href="evil.css"><p>x</p>');
    assertNoExecutableHtml(out);
    expect(out).not.toContain("link");
    expect(out).not.toContain("evil");
  });
});

describe("sanitizeRichTextHtml — back-compat alias", () => {
  it("sanitizeRichTextHtml === sanitizeHtml (same function)", () => {
    expect(sanitizeRichTextHtml).toBe(sanitizeHtml);
  });

  it("strips <script> via the legacy-named export too", () => {
    const out = sanitizeRichTextHtml("<script>alert(1)</script>");
    assertNoExecutableHtml(out);
    expect(out).toBe("");
  });
});
