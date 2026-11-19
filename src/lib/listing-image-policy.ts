import { db } from "@/lib/db";
import {
  FREE_LISTING_IMAGE_POLICY,
  PRO_LISTING_IMAGE_POLICY,
  PREMIUM_LISTING_IMAGE_POLICY,
  type ListingImagePolicy,
} from "@/lib/listing-image-policy-shared";

/**
 * Resolve media entitlements from the authenticated user's persisted
 * subscription. Client-provided plan names or image limits are never trusted.
 * BASIC, inactive, expired, missing, and unconfigured plans fail closed to FREE.
 */
export async function getListingImagePolicy(userId: string): Promise<ListingImagePolicy> {
  const now = new Date();
  const subscription = await db.premiumSubscription.findUnique({
    where: { userId },
    select: { plan: true, status: true, expiresAt: true },
  });

  if (
    !subscription ||
    subscription.status !== "ACTIVE" ||
    subscription.plan.trim().toUpperCase() === "BASIC" ||
    (subscription.expiresAt !== null && subscription.expiresAt.getTime() <= now.getTime())
  ) {
    return FREE_LISTING_IMAGE_POLICY;
  }

  const planCode = subscription.plan.trim().toUpperCase();
  const plan = await db.subscriptionPlan.findUnique({
    where: { code: planCode },
    select: { active: true, priceMonthly: true, priceYearly: true, maxImages: true },
  });

  const isPaidPlan = Boolean(
    plan?.active &&
    ((plan.priceMonthly ?? 0n) > 0n || (plan.priceYearly ?? 0n) > 0n),
  );

  if (!isPaidPlan) return FREE_LISTING_IMAGE_POLICY;

  const tierPolicy = planCode === "PREMIUM"
    ? PREMIUM_LISTING_IMAGE_POLICY
    : PRO_LISTING_IMAGE_POLICY;

  // Plan DB values may still be stale until the approved seed is applied.
  // The commercial caps remain authoritative and DB values can only tighten them.
  const configuredMaxImages = Number(plan?.maxImages ?? 0);

  return {
    ...tierPolicy,
    maxListings: tierPolicy.maxListings,
    maxImages: configuredMaxImages > 0
      ? Math.min(configuredMaxImages, tierPolicy.maxImages)
      : tierPolicy.maxImages,
  };
}
