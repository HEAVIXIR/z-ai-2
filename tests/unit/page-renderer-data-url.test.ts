import { describe, expect, it } from "vitest";
import { resolveWidgetDataBaseUrl, resolveWidgetDataPath } from "@/lib/admin/page-builder/widget-data-url";

describe("resolveWidgetDataBaseUrl", () => {
  // STEP 18.2.7.3.10 (Finding S-2): forwarded headers are only honored when
  // HEAVIX_TRUSTED_PROXY_HEADER is set. All header-based tests below pass
  // this env var to opt into the trusted-proxy path.

  it("prefers the current Cloudflare branch Preview host over the stable build-time URL", () => {
    const headers = new Headers({ "x-forwarded-host": "infra-prisma6-cloudflare-runtime-heavix-preview.heavixir.workers.dev", "x-forwarded-proto": "https" });
    expect(resolveWidgetDataBaseUrl({ HEAVIX_TRUSTED_PROXY_HEADER: "x-forwarded-host", NEXT_PUBLIC_SITE_URL: "https://heavix-preview.heavixir.workers.dev" }, headers))
      .toBe("https://infra-prisma6-cloudflare-runtime-heavix-preview.heavixir.workers.dev");
  });

  it("uses the current configured Vercel preview host (via 'host' trusted header)", () => {
    const headers = new Headers({ host: "heavix-git-feature-branch.vercel.app", "x-forwarded-proto": "https" });
    expect(resolveWidgetDataBaseUrl({ HEAVIX_TRUSTED_PROXY_HEADER: "host", VERCEL_URL: "heavix-git-feature-branch.vercel.app", NEXT_PUBLIC_SITE_URL: "https://heavix.ir" }, headers))
      .toBe("https://heavix-git-feature-branch.vercel.app");
  });

  it("rejects an untrusted request host and falls back to configured site URL", () => {
    const headers = new Headers({ "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" });
    expect(resolveWidgetDataBaseUrl({ HEAVIX_TRUSTED_PROXY_HEADER: "x-forwarded-host", NEXT_PUBLIC_SITE_URL: "https://heavix-preview.heavixir.workers.dev" }, headers))
      .toBe("https://heavix-preview.heavixir.workers.dev");
  });

  it("prefers an explicit base URL when request headers are absent", () => {
    expect(resolveWidgetDataBaseUrl({ NEXT_PUBLIC_BASE_URL: "https://base.example/path/", VERCEL_URL: "vercel.example", NEXT_PUBLIC_SITE_URL: "https://site.example" })).toBe("https://base.example");
  });

  it("uses Vercel deployment hostname when request headers are absent", () => {
    expect(resolveWidgetDataBaseUrl({ VERCEL_URL: "heavix-preview.vercel.app", NEXT_PUBLIC_SITE_URL: "https://heavix.ir" })).toBe("https://heavix-preview.vercel.app");
  });

  it("uses NEXT_PUBLIC_SITE_URL as the stable Cloudflare fallback", () => {
    expect(resolveWidgetDataBaseUrl({ NEXT_PUBLIC_SITE_URL: "https://heavix-preview.heavixir.workers.dev/" })).toBe("https://heavix-preview.heavixir.workers.dev");
  });

  it("falls back to localhost for local development", () => {
    expect(resolveWidgetDataBaseUrl({})).toBe("http://localhost:3000");
  });

  it("ignores non-HTTP URL schemes", () => {
    expect(resolveWidgetDataBaseUrl({ NEXT_PUBLIC_BASE_URL: "javascript:alert(1)", NEXT_PUBLIC_SITE_URL: "https://heavix-preview.heavixir.workers.dev" })).toBe("https://heavix-preview.heavixir.workers.dev");
  });

  // ── Trust boundary (STEP 18.2.7.3.10 Finding S-2, per review #6657234467) ──
  // x-forwarded-host is client-supplied. Without HEAVIX_TRUSTED_PROXY_HEADER,
  // the resolver MUST ignore all forwarded headers — fail-closed for
  // direct-access deployments.

  it("IGNORES x-forwarded-host when HEAVIX_TRUSTED_PROXY_HEADER is not set (fail-closed)", () => {
    // Even a perfectly-formatted trusted host must be ignored when the
    // deployment has not declared a trusted proxy.
    const headers = new Headers({ "x-forwarded-host": "heavix-preview.heavixir.workers.dev", "x-forwarded-proto": "https" });
    expect(resolveWidgetDataBaseUrl({ NEXT_PUBLIC_SITE_URL: "https://heavix.ir" }, headers))
      .toBe("https://heavix.ir");
  });

  it("IGNORES Host header when HEAVIX_TRUSTED_PROXY_HEADER is not set (fail-closed)", () => {
    const headers = new Headers({ host: "heavix-preview.heavixir.workers.dev" });
    expect(resolveWidgetDataBaseUrl({ NEXT_PUBLIC_SITE_URL: "https://heavix.ir" }, headers))
      .toBe("https://heavix.ir");
  });

  it("rejects an arbitrary HEAVIX_TRUSTED_PROXY_HEADER value (only x-forwarded-host and host allowed)", () => {
    // Prevent config-injection: a misconfigured env var like "x-custom-header"
    // must NOT cause the resolver to read an arbitrary header.
    const headers = new Headers({ "x-custom-header": "heavix-preview.heavixir.workers.dev", "x-forwarded-proto": "https" });
    expect(resolveWidgetDataBaseUrl({ HEAVIX_TRUSTED_PROXY_HEADER: "x-custom-header", NEXT_PUBLIC_SITE_URL: "https://heavix.ir" }, headers))
      .toBe("https://heavix.ir");
  });

  // ── SSRF hardening (STEP 18.2.7.3.10) ──────────────────────────
  // The resolved URL is used in server-side fetch() (page-renderer.tsx:67),
  // so x-forwarded-host MUST NOT allow an attacker to redirect requests to
  // arbitrary destinations. These tests run with HEAVIX_TRUSTED_PROXY_HEADER
  // set (simulating a deployment behind a trusted proxy) and verify the
  // allowlist + format validation still blocks spoofing attempts.

  it("rejects userinfo injection (attacker@legitimate-host)", () => {
    const headers = new Headers({ "x-forwarded-host": "attacker@heavixir.workers.dev", "x-forwarded-proto": "https" });
    expect(resolveWidgetDataBaseUrl({ HEAVIX_TRUSTED_PROXY_HEADER: "x-forwarded-host", NEXT_PUBLIC_SITE_URL: "https://heavix-preview.heavixir.workers.dev" }, headers))
      .toBe("https://heavix-preview.heavixir.workers.dev");
  });

  it("rejects userinfo injection on the Host header", () => {
    const headers = new Headers({ host: "attacker@heavixir.workers.dev" });
    expect(resolveWidgetDataBaseUrl({ HEAVIX_TRUSTED_PROXY_HEADER: "host", NEXT_PUBLIC_SITE_URL: "https://heavix.ir" }, headers))
      .toBe("https://heavix.ir");
  });

  it("rejects an attacker spoofing a trusted host via path prefix", () => {
    const headers = new Headers({ "x-forwarded-host": "heavixir.workers.dev.evil.example", "x-forwarded-proto": "https" });
    expect(resolveWidgetDataBaseUrl({ HEAVIX_TRUSTED_PROXY_HEADER: "x-forwarded-host", NEXT_PUBLIC_SITE_URL: "https://heavix-preview.heavixir.workers.dev" }, headers))
      .toBe("https://heavix-preview.heavixir.workers.dev");
  });

  it("rejects a hostname containing a port that would redirect to a different service", () => {
    const headers = new Headers({ "x-forwarded-host": "heavix-preview.heavixir.workers.dev:9000", "x-forwarded-proto": "https" });
    expect(resolveWidgetDataBaseUrl({ HEAVIX_TRUSTED_PROXY_HEADER: "x-forwarded-host", NEXT_PUBLIC_SITE_URL: "https://heavix-preview.heavixir.workers.dev" }, headers))
      .toBe("https://heavix-preview.heavixir.workers.dev");
  });

  it("rejects an x-forwarded-proto that is not http/https (file://, gopher://, etc.)", () => {
    const headers = new Headers({ "x-forwarded-host": "heavix-preview.heavixir.workers.dev", "x-forwarded-proto": "gopher" });
    expect(resolveWidgetDataBaseUrl({ HEAVIX_TRUSTED_PROXY_HEADER: "x-forwarded-host", NEXT_PUBLIC_SITE_URL: "https://heavix-preview.heavixir.workers.dev" }, headers))
      .toBe("https://heavix-preview.heavixir.workers.dev");
  });

  it("uses the first entry of a multi-value x-forwarded-host (no decoy attack)", () => {
    const headers = new Headers({ "x-forwarded-host": "heavix-preview.heavixir.workers.dev, evil.example", "x-forwarded-proto": "https" });
    expect(resolveWidgetDataBaseUrl({ HEAVIX_TRUSTED_PROXY_HEADER: "x-forwarded-host", NEXT_PUBLIC_SITE_URL: "https://heavix.ir" }, headers))
      .toBe("https://heavix-preview.heavixir.workers.dev");
  });
});

describe("resolveWidgetDataPath", () => {
  it("substitutes configured limits", () => { expect(resolveWidgetDataPath("/api/listings?limit={limit}", { limit: 12 })).toBe("/api/listings?limit=12"); });
  it("caps collection limits", () => { expect(resolveWidgetDataPath("/api/brands?limit={limit}", { limit: 999 })).toBe("/api/brands?limit=24"); });
  it("clamps negative limits to one", () => { expect(resolveWidgetDataPath("/api/brands?limit={limit}", { limit: -4 })).toBe("/api/brands?limit=1"); });
  it("uses a safe default for malformed limits", () => { expect(resolveWidgetDataPath("/api/brands?limit={limit}", { limit: "1&status=all" })).toBe("/api/brands?limit=8"); });
  it("URL-encodes non-limit values", () => { expect(resolveWidgetDataPath("/api/search?q={query}", { query: "cat & dog" })).toBe("/api/search?q=cat%20%26%20dog"); });
});
