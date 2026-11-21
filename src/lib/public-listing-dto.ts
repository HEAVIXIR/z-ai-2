/**
 * Explicit least-privilege DTO for unauthenticated listing search and compare APIs.
 * Never spread a Prisma Listing row into a public response.
 */
export function toPublicListingDTO(listing: any) {
  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    description: listing.description ?? null,
    shortDesc: listing.shortDesc ?? null,
    price: listing.price === null || listing.price === undefined
      ? null
      : listing.price.toString(),
    priceType: listing.priceType,
    listingType: listing.listingType,
    condition: listing.condition ?? null,
    province: listing.province ?? null,
    city: listing.city ?? null,
    year: listing.year ?? null,
    workingHours: listing.workingHours ?? null,
    featured: Boolean(listing.featured),
    verified: Boolean(listing.verified),
    publishedAt: listing.publishedAt ?? null,
    brand: listing.brand
      ? {
          id: listing.brand.id ?? null,
          name: listing.brand.name ?? null,
          nameEn: listing.brand.nameEn ?? null,
          slug: listing.brand.slug ?? null,
          country: listing.brand.country ?? null,
        }
      : null,
    category: listing.category
      ? {
          id: listing.category.id ?? null,
          name: listing.category.name ?? null,
          nameEn: listing.category.nameEn ?? null,
          slug: listing.category.slug ?? null,
          icon: listing.category.icon ?? null,
        }
      : null,
    images: Array.isArray(listing.images)
      ? listing.images
          .filter((image: any) => typeof image?.url === "string")
          .map((image: any) => ({ url: image.url }))
      : typeof listing.image === "string"
        ? [{ url: listing.image }]
        : [],
  };
}
