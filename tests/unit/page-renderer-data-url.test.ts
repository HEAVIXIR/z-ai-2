import { describe, expect, it } from "vitest";
import { resolveWidgetDataBaseUrl } from "@/lib/admin/page-builder/widget-data-url";

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
