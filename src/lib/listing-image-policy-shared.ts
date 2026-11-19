export type ListingImageTier = "FREE" | "PAID";

export interface ListingImagePolicy {
  tier: ListingImageTier;
  maxImages: number;
  maxImageBytes: number;
  /** Maximum simultaneously active supply listings; 0 means unlimited. */
  maxListings: number;
}

export const FREE_LISTING_IMAGE_POLICY: ListingImagePolicy = {
  tier: "FREE",
  maxImages: 4,
  maxImageBytes: 1 * 1024 * 1024,
  maxListings: 4,
};

export const PAID_LISTING_IMAGE_POLICY: ListingImagePolicy = {
  tier: "PAID",
  maxImages: 8,
  maxImageBytes: 2 * 1024 * 1024,
  maxListings: 10,
};
