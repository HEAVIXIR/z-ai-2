export type ListingImageTier = "FREE" | "PRO" | "PREMIUM";

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

export const PRO_LISTING_IMAGE_POLICY: ListingImagePolicy = {
  tier: "PRO",
  maxImages: 8,
  maxImageBytes: 2 * 1024 * 1024,
  maxListings: 10,
};

export const PREMIUM_LISTING_IMAGE_POLICY: ListingImagePolicy = {
  tier: "PREMIUM",
  maxImages: 8,
  maxImageBytes: 2 * 1024 * 1024,
  maxListings: 20,
};
