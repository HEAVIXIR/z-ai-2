import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/* ============================================================
   STEP 13.00 — Canonical Domain Hotfix
   Unit tests for src/lib/site-config.ts (single source of truth)
   ------------------------------------------------------------
   These tests pin the resolution contract for SITE_BASE_URL and
   absoluteUrl so the split-brain (heavix.ir vs havix.ir) cannot
   silently regress. They are pure (no DB, no I/O) and run as part
   of the unit test suite in CI.

   Each test re-imports the module after mutating env to ensure the
   module-level constant SITE_BASE_URL picks up the change.
   ============================================================ */

describe("site-config — SITE_BASE_URL resolution", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    // Ensure the production-warning branch does not fire in tests.
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('falls back to "https://heavix.ir" when NEXT_PUBLIC_SITE_URL is unset', async () => {
    const mod = await import("@/lib/site-config");
    expect(mod.SITE_BASE_URL).toBe("https://heavix.ir");
  });

  it("respects NEXT_PUBLIC_SITE_URL when set (no trailing slash)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    const mod = await import("@/lib/site-config");
    expect(mod.SITE_BASE_URL).toBe("https://example.com");
  });

  it("strips a single trailing slash from NEXT_PUBLIC_SITE_URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://heavix.ir/";
    const mod = await import("@/lib/site-config");
    expect(mod.SITE_BASE_URL).toBe("https://heavix.ir");
  });

  it("strips multiple trailing slashes from NEXT_PUBLIC_SITE_URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://heavix.ir///";
    const mod = await import("@/lib/site-config");
    expect(mod.SITE_BASE_URL).toBe("https://heavix.ir");
  });

  it("never falls back to the legacy havix.ir (4-letter typo)", async () => {
    // Critical regression guard: the STEP 12.99 split-brain bug.
    const mod = await import("@/lib/site-config");
    expect(mod.SITE_BASE_URL).not.toContain("havix.ir");
    expect(mod.SITE_BASE_URL).toContain("heavix.ir");
  });

  it("exports the site display name in Persian", async () => {
    const mod = await import("@/lib/site-config");
    expect(mod.SITE_NAME).toBe("هویکس");
  });
});

describe("site-config — absoluteUrl helper", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NODE_ENV = "test";
  });

  it('returns the bare base URL for empty input (homepage canonical)', async () => {
    const { absoluteUrl } = await import("@/lib/site-config");
    expect(absoluteUrl("")).toBe("https://heavix.ir");
  });

  it('resolves "/" to base + "/"', async () => {
    const { absoluteUrl } = await import("@/lib/site-config");
    expect(absoluteUrl("/")).toBe("https://heavix.ir/");
  });

  it('resolves "/listings" to base + "/listings"', async () => {
    const { absoluteUrl } = await import("@/lib/site-config");
    expect(absoluteUrl("/listings")).toBe("https://heavix.ir/listings");
  });

  it('resolves "/listings/some-slug" with nested path', async () => {
    const { absoluteUrl } = await import("@/lib/site-config");
    expect(absoluteUrl("/listings/some-slug")).toBe(
      "https://heavix.ir/listings/some-slug",
    );
  });

  it("resolves bare path segments with a leading-slash separator", async () => {
    const { absoluteUrl } = await import("@/lib/site-config");
    expect(absoluteUrl("listings")).toBe("https://heavix.ir/listings");
  });

  it("passes absolute https URLs through unchanged", async () => {
    const { absoluteUrl } = await import("@/lib/site-config");
    expect(absoluteUrl("https://other.example.com/foo")).toBe(
      "https://other.example.com/foo",
    );
  });

  it("passes absolute http URLs through unchanged", async () => {
    const { absoluteUrl } = await import("@/lib/site-config");
    expect(absoluteUrl("http://localhost:3000/foo")).toBe(
      "http://localhost:3000/foo",
    );
  });

  it('upgrades protocol-relative "//host/path" to "https://host/path"', async () => {
    const { absoluteUrl } = await import("@/lib/site-config");
    expect(absoluteUrl("//cdn.example.com/asset.png")).toBe(
      "https://cdn.example.com/asset.png",
    );
  });

  it("respects a custom NEXT_PUBLIC_SITE_URL for absoluteUrl resolution", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.heavix.ir";
    const { absoluteUrl, SITE_BASE_URL } = await import("@/lib/site-config");
    expect(SITE_BASE_URL).toBe("https://staging.heavix.ir");
    expect(absoluteUrl("/listings")).toBe("https://staging.heavix.ir/listings");
  });

  it("resolves a Persian/Unicode slug path without corruption", async () => {
    const { absoluteUrl } = await import("@/lib/site-config");
    // Persian chars in the path are passed through verbatim; URL-encoding
    // is the browser's responsibility at fetch time. We only verify the
    // base is prepended correctly.
    const result = absoluteUrl("/companies/آریا-ماشین-جم");
    expect(result).toBe("https://heavix.ir/companies/آریا-ماشین-جم");
  });

  it("resolves a percent-encoded slug path without double-encoding", async () => {
    const { absoluteUrl } = await import("@/lib/site-config");
    // A pre-encoded URL must not be mutated by absoluteUrl.
    const result = absoluteUrl("/brands/%D8%A8%DB%8C%D9%84");
    expect(result).toBe("https://heavix.ir/brands/%D8%A8%DB%8C%D9%84");
  });
});

describe("site-config — backward compatibility re-export from @/lib/seo", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NODE_ENV = "test";
  });

  it("still exports absoluteUrl from @/lib/seo for existing consumers", async () => {
    const seo = await import("@/lib/seo");
    expect(typeof seo.absoluteUrl).toBe("function");
    expect(seo.absoluteUrl("/listings")).toBe("https://heavix.ir/listings");
  });
});
