/**
 * HEAVIX — STEP 12.72 W-05 Behavioral Test: generateMetadata
 * ====================================================================
 *
 * REAL behavioral test that INVOKES the actual generateMetadata functions
 * with mocked db, and asserts the returned Metadata object.
 *
 * Tests:
 *   - listing found → unique title + description + canonical + OG
 *   - listing not found → fallback title
 *   - category found → unique title + description + canonical
 *   - category not found → fallback title
 *   - brand found → unique title + description + canonical
 *   - brand not found → fallback title
 *
 * Runs under `bun run test:security`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock data ──────────────────────────────────────────────
const mockListing = {
  title: "بیل مکانیکی کاترپیلار 320",
  shortDesc: "بیل مکانیکی کاترپیلار مدل 320، سال ۲۰۲۱، ساعات کار پایین",
  description: "توضیحات کامل...",
  price: BigInt(2500000000),
  priceType: "FIXED",
  condition: "USED",
  city: "تهران",
  province: "تهران",
  brand: { name: "Caterpillar" },
  category: { name: "بیل مکانیکی" },
  images: [{ url: "https://example.com/img1.jpg" }],
};

const mockCategory = { name: "بیل مکانیکی", slug: "excavator" };
const mockBrand = { name: "Caterpillar", slug: "caterpillar" };

vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      findUnique: vi.fn(async () => null), // overridden per-test
    },
    category: {
      findFirst: vi.fn(async () => null),
    },
  },
}));
vi.mock("@/lib/brand-resolve", () => ({
  resolveBrandBySlugOrAlias: vi.fn(async () => null),
}));

// Import AFTER mocks
const listingPage = await import("@/app/listings/[slug]/page");
const categoryPage = await import("@/app/categories/[slug]/page");
const brandPage = await import("@/app/brands/[slug]/page");
const { db } = await import("@/lib/db");
const { resolveBrandBySlugOrAlias } = await import("@/lib/brand-resolve");

beforeEach(() => {
  (db.listing.findUnique as any).mockResolvedValue(null);
  (db.category.findFirst as any).mockResolvedValue(null);
  (resolveBrandBySlugOrAlias as any).mockResolvedValue(null);
});

// ════════════════════════════════════════════════════════════
// W-05: listings/[slug] generateMetadata
// ════════════════════════════════════════════════════════════

describe("W-05: listings/[slug] generateMetadata", () => {
  it("POSITIVE: listing found → unique title with brand, description, canonical, OG", async () => {
    (db.listing.findUnique as any).mockResolvedValue(mockListing);
    const meta = await listingPage.generateMetadata({ params: Promise.resolve({ slug: "test-listing" }) });
    expect(meta.title).toContain("بیل مکانیکی کاترپیلار 320");
    expect(meta.title).toContain("Caterpillar");
    expect(meta.description).toBeTruthy();
    expect(meta.alternates?.canonical).toBe("/listings/test-listing");
    expect(meta.openGraph?.title).toContain("Caterpillar");
    expect(meta.openGraph?.locale).toBe("fa_IR");
  });

  it("POSITIVE: listing with no brand → title without brand suffix", async () => {
    (db.listing.findUnique as any).mockResolvedValue({ ...mockListing, brand: null });
    const meta = await listingPage.generateMetadata({ params: Promise.resolve({ slug: "no-brand" }) });
    expect(meta.title).toBe("بیل مکانیکی کاترپیلار 320");
  });

  it("NEGATIVE: listing not found → fallback title", async () => {
    (db.listing.findUnique as any).mockResolvedValue(null);
    const meta = await listingPage.generateMetadata({ params: Promise.resolve({ slug: "nonexistent" }) });
    expect(meta.title).toBe("آگهی یافت نشد");
  });

  it("POSITIVE: OG image present when listing has image", async () => {
    (db.listing.findUnique as any).mockResolvedValue(mockListing);
    const meta: any = await listingPage.generateMetadata({ params: Promise.resolve({ slug: "x" }) });
    expect(meta.openGraph?.images).toBeDefined();
    expect(meta.openGraph?.images[0]?.url).toBe("https://example.com/img1.jpg");
  });

  it("POSITIVE: OG image absent when listing has no image", async () => {
    (db.listing.findUnique as any).mockResolvedValue({ ...mockListing, images: [] });
    const meta: any = await listingPage.generateMetadata({ params: Promise.resolve({ slug: "x" }) });
    expect(meta.openGraph?.images).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════
// W-05: categories/[slug] generateMetadata
// ════════════════════════════════════════════════════════════

describe("W-05: categories/[slug] generateMetadata", () => {
  it("POSITIVE: category found → unique title, description, canonical", async () => {
    (db.category.findFirst as any).mockResolvedValue(mockCategory);
    const meta = await categoryPage.generateMetadata({ params: Promise.resolve({ slug: "excavator" }) });
    expect(meta.title).toContain("بیل مکانیکی");
    expect(meta.title).toContain("خرید و اجاره");
    expect(meta.description).toContain("بیل مکانیکی");
    expect(meta.alternates?.canonical).toBe("/categories/excavator");
    expect(meta.openGraph?.locale).toBe("fa_IR");
  });

  it("NEGATIVE: category not found → fallback title", async () => {
    (db.category.findFirst as any).mockResolvedValue(null);
    const meta = await categoryPage.generateMetadata({ params: Promise.resolve({ slug: "nonexistent" }) });
    expect(meta.title).toBe("دسته‌بندی یافت نشد");
  });
});

// ════════════════════════════════════════════════════════════
// W-05: brands/[slug] generateMetadata
// ════════════════════════════════════════════════════════════

describe("W-05: brands/[slug] generateMetadata", () => {
  it("POSITIVE: brand found → unique title, description, canonical", async () => {
    (resolveBrandBySlugOrAlias as any).mockResolvedValue(mockBrand);
    const meta = await brandPage.generateMetadata({ params: Promise.resolve({ slug: "caterpillar" }) });
    expect(meta.title).toContain("Caterpillar");
    expect(meta.title).toContain("ماشین‌آلات سنگین");
    expect(meta.description).toContain("Caterpillar");
    expect(meta.alternates?.canonical).toBe("/brands/caterpillar");
    expect(meta.openGraph?.locale).toBe("fa_IR");
  });

  it("NEGATIVE: brand not found → fallback title", async () => {
    (resolveBrandBySlugOrAlias as any).mockResolvedValue(null);
    const meta = await brandPage.generateMetadata({ params: Promise.resolve({ slug: "nonexistent" }) });
    expect(meta.title).toBe("برند یافت نشد");
  });
});
