import { describe, expect, it } from "vitest";
import { resolveWidgetDataBaseUrl, resolveWidgetDataPath } from "@/lib/admin/page-builder/widget-data-url";

describe("resolveWidgetDataBaseUrl", () => {
  it("prefers an explicit base URL", () => {
    expect(resolveWidgetDataBaseUrl({
      NEXT_PUBLIC_BASE_URL: "https://base.example/path/",
      VERCEL_URL: "vercel.example",
      NEXT_PUBLIC_SITE_URL: "https://site.example",
    })).toBe("https://base.example");
  });

  it("uses Vercel's deployment hostname before the canonical site URL", () => {
    expect(resolveWidgetDataBaseUrl({
      VERCEL_URL: "heavix-preview.vercel.app",
      NEXT_PUBLIC_SITE_URL: "https://heavix.ir",
    })).toBe("https://heavix-preview.vercel.app");
  });

  it("uses NEXT_PUBLIC_SITE_URL for Cloudflare Workers where VERCEL_URL is absent", () => {
    expect(resolveWidgetDataBaseUrl({
      NEXT_PUBLIC_SITE_URL: "https://heavix-preview.heavixir.workers.dev/",
    })).toBe("https://heavix-preview.heavixir.workers.dev");
  });

  it("falls back to localhost for local development", () => {
    expect(resolveWidgetDataBaseUrl({})).toBe("http://localhost:3000");
  });

  it("ignores non-HTTP URL schemes", () => {
    expect(resolveWidgetDataBaseUrl({
      NEXT_PUBLIC_BASE_URL: "javascript:alert(1)",
      NEXT_PUBLIC_SITE_URL: "https://heavix-preview.heavixir.workers.dev",
    })).toBe("https://heavix-preview.heavixir.workers.dev");
  });
});

describe("resolveWidgetDataPath", () => {
  it("substitutes configured limits", () => {
    expect(resolveWidgetDataPath("/api/listings?limit={limit}", { limit: 12 }))
      .toBe("/api/listings?limit=12");
  });

  it("caps collection limits", () => {
    expect(resolveWidgetDataPath("/api/brands?limit={limit}", { limit: 999 }))
      .toBe("/api/brands?limit=24");
  });

  it("clamps negative limits to one", () => {
    expect(resolveWidgetDataPath("/api/brands?limit={limit}", { limit: -4 }))
      .toBe("/api/brands?limit=1");
  });

  it("uses a safe default for malformed limits rather than interpolating arbitrary query text", () => {
    expect(resolveWidgetDataPath("/api/brands?limit={limit}", { limit: "1&status=all" }))
      .toBe("/api/brands?limit=8");
  });

  it("URL-encodes non-limit values before substitution", () => {
    expect(resolveWidgetDataPath("/api/search?q={query}", { query: "cat & dog" }))
      .toBe("/api/search?q=cat%20%26%20dog");
  });
});
