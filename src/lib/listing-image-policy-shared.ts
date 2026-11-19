export type ListingImageTier = "FREE" | "PAID";

export interface ListingImagePolicy {
  tier: ListingImageTier;
  maxImages: number;
  maxImageBytes: number;
}

export const FREE_LISTING_IMAGE_POLICY: ListingImagePolicy = {
  tier: "FREE",
  maxImages: 4,
  maxImageBytes: 1 * 1024 * 1024,
};

export const PAID_LISTING_IMAGE_POLICY: ListingImagePolicy = {
  tier: "PAID",
  maxImages: 8,
  maxImageBytes: 2 * 1024 * 1024,
};
