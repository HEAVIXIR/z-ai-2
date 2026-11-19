import { db } from "@/lib/db";
import {
  FREE_LISTING_IMAGE_POLICY,
  PAID_LISTING_IMAGE_POLICY,
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

  const plan = await db.subscriptionPlan.findUnique({
    where: { code: subscription.plan.trim().toUpperCase() },
    select: { active: true, priceMonthly: true, priceYearly: true, maxListings: true },
  });

  const isPaidPlan = Boolean(
    plan?.active &&
    ((plan.priceMonthly ?? 0n) > 0n || (plan.priceYearly ?? 0n) > 0n),
  );

  return isPaidPlan
    ? { ...PAID_LISTING_IMAGE_POLICY, maxListings: Math.max(0, plan?.maxListings ?? PAID_LISTING_IMAGE_POLICY.maxListings) }
    : FREE_LISTING_IMAGE_POLICY;
}
