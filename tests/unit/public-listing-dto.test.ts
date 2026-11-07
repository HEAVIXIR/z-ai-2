import { describe, expect, it } from "vitest";
import { toPublicListingDTO } from "@/lib/public-listing-dto";

describe("public listing DTO", () => {
  it("keeps the documented public fields and excludes private/internal fields", () => {
    const result = toPublicListingDTO({
      id: "listing-1",
      slug: "excavator-1",
      title: "Excavator",
      description: "Public description",
      shortDesc: "Short description",
      price: 1200000000n,
      priceType: "FIXED",
      listingType: "SALE",
      condition: "USED",
      province: "Tehran",
      city: "Tehran",
      year: 2020,
      workingHours: 3500,
      featured: true,
      verified: false,
      publishedAt: new Date("2026-11-06T10:00:00.000Z"),
      brand: { id: "brand-1", name: "Caterpillar", nameEn: "Caterpillar", slug: "caterpillar", country: "US" },
      category: { id: "category-1", name: "Excavators", nameEn: "Excavators", slug: "excavators", icon: "🚜" },
      images: [{ url: "https://example.test/image.jpg", id: "private-image-id" }],
      sellerPhone: "09120000000",
      sellerName: "Private Seller",
      sellerId: "seller-1",
      companyId: "company-1",
      adminNotes: "Internal moderation note",
      sourceUrl: "https://private-source.test",
      sourceSite: "private-source",
      favoriteCount: 99,
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    });

    expect(result.price).toBe("1200000000");
    expect(result.images).toEqual([{ url: "https://example.test/image.jpg" }]);
    expect(result).not.toHaveProperty("sellerPhone");
    expect(result).not.toHaveProperty("sellerName");
    expect(result).not.toHaveProperty("sellerId");
    expect(result).not.toHaveProperty("companyId");
    expect(result).not.toHaveProperty("adminNotes");
    expect(result).not.toHaveProperty("sourceUrl");
    expect(result).not.toHaveProperty("sourceSite");
    expect(result).not.toHaveProperty("favoriteCount");
    expect(result).not.toHaveProperty("expiresAt");
  });

  it("supports the search fast-path image field without spreading the source object", () => {
    const result = toPublicListingDTO({
      id: "listing-2",
      slug: "loader-2",
      title: "Loader",
      price: null,
      priceType: "NEGOTIABLE",
      listingType: "SALE",
      featured: false,
      verified: false,
      image: "https://example.test/loader.jpg",
      sellerPhone: "09120000000",
    });
    expect(result.images).toEqual([{ url: "https://example.test/loader.jpg" }]);
    expect(result).not.toHaveProperty("sellerPhone");
  });
});
