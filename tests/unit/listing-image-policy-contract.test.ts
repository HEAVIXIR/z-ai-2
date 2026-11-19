import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("listing image subscription policy", () => {
  it("defines the agreed free and paid quotas", () => {
    const shared = read("src/lib/listing-image-policy-shared.ts");
    const seed = read("prisma/seed-phase6-7-automation-monetization.ts");
    expect(shared).toContain("maxImages: 4");
    expect(shared).toContain("maxImageBytes: 1 * 1024 * 1024");
    expect(shared).toContain("maxImages: 8");
    expect(shared).toContain("maxImageBytes: 2 * 1024 * 1024");
    expect(seed).toContain("maxImages: 4");
    expect(seed).toContain("maxImages: 8");
    expect(seed).toContain("۴ تصویر برای هر آگهی");
    expect(seed.match(/۸ تصویر برای هر آگهی/g)?.length).toBe(2);
    expect(seed).not.toContain("۱۶ تصویر برای هر آگهی");
    expect(seed).not.toContain("۳۲ تصویر برای هر آگهی");
  });

  it("defines the approved active-listing and monthly featured quotas for all tiers", () => {
    const seed = read("prisma/seed-phase6-7-automation-monetization.ts");
    const shared = read("src/lib/listing-image-policy-shared.ts");
    const resolver = read("src/lib/listing-image-policy.ts");
    const adminComparison = read("src/app/admin/subscriptions/page.tsx");
    expect(shared).toContain("maxListings: 4");
    expect(shared).toContain("maxListings: 10");
    expect(shared).toContain("maxListings: 20");
    expect(shared).toContain('tier: "PRO"');
    expect(shared).toContain('tier: "PREMIUM"');
    expect(seed).toContain("maxListings: 4");
    expect(seed).toContain("maxListings: 10");
    expect(seed).toContain("maxListings: 20");
    expect(seed).toContain("featuredCredits: 0");
    expect(seed).toContain("featuredCredits: 2");
    expect(seed).toContain("featuredCredits: 5");
    expect(seed).toContain("دسترسی به هوش مصنوعی");
    expect(seed).toContain("سرنخ‌های اولویت‌دار");
    expect(resolver).toContain("maxListings: true");
    expect(resolver).toContain("plan?.maxListings");
    expect(resolver).toContain("PREMIUM_LISTING_IMAGE_POLICY");
    expect(resolver).toContain("PRO_LISTING_IMAGE_POLICY");
    expect(resolver).toContain("maxListings: tierPolicy.maxListings");
    expect(adminComparison).toContain("تا ۴ آگهی فعال");
    expect(adminComparison).toContain("تا ۱۰ آگهی فعال");
    expect(adminComparison).toContain("تا ۲۰ آگهی فعال");
  });

  it("enforces active listing caps at the authenticated listing API boundary", () => {
    const route = read("src/app/api/listings/route.ts");
    expect(route).toContain('status: { in: ["PENDING", "PUBLISHED", "SCHEDULED"] }');
    expect(route).toContain("db.listing.count({ where: activeListingWhere })");
    expect(route).toContain("tx.listing.count({ where: activeListingWhere })");
    expect(route).toContain("ACTIVE_LISTING_LIMIT_REACHED");
  });

  it("derives paid status only from an active, non-expired, configured paid subscription", () => {
    const resolver = read("src/lib/listing-image-policy.ts");
    expect(resolver).toContain("db.premiumSubscription.findUnique");
    expect(resolver).toContain('subscription.status !== "ACTIVE"');
    expect(resolver).toContain("subscription.expiresAt.getTime() <= now.getTime()");
    expect(resolver).toContain('subscription.plan.trim().toUpperCase() === "BASIC"');
    expect(resolver).toContain("db.subscriptionPlan.findUnique");
    expect(resolver).toContain("plan?.active");
    expect(resolver).toContain("plan.priceMonthly");
    expect(resolver).toContain("plan.priceYearly");
    expect(resolver).toContain("FREE_LISTING_IMAGE_POLICY");
  });

  it("enforces the same entitlement at upload and listing creation boundaries", () => {
    const staging = read("src/app/api/media/staging/route.ts");
    const listings = read("src/app/api/listings/route.ts");
    const media = read("src/lib/media-service.ts");
    const optimizer = read("src/lib/media-image-optimizer.ts");
    expect(staging).toContain("maxOutputBytes: policy.maxImageBytes");
    expect(listings).toContain("rawImages.length > imagePolicy.maxImages");
    expect(listings).toContain("asset.size > imagePolicy.maxImageBytes");
    expect(media).toContain("optimizeImageBuffer(buffer, validation.type, input.maxOutputBytes)");
    expect(optimizer).toContain("output.length <= maxOutputBytes");
  });
});
