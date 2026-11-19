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
