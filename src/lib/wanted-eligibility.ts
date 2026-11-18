export type BuyRequestMatchEligibilityInput = {
  status: string;
  publishedAt: Date | null;
  expiresAt: Date | null;
};

/**
 * A request is matchable only while it is publicly active, published,
 * and not expired. Keep this rule shared by interactive and batch matching.
 */
export function isBuyRequestMatchEligible(
  request: BuyRequestMatchEligibilityInput,
  now: Date = new Date(),
): boolean {
  if (request.status !== "ACTIVE") return false;
  if (!(request.publishedAt instanceof Date) || !Number.isFinite(request.publishedAt.getTime())) return false;
  if (request.publishedAt.getTime() > now.getTime()) return false;
  if (request.expiresAt !== null) {
    if (!(request.expiresAt instanceof Date) || !Number.isFinite(request.expiresAt.getTime())) return false;
    if (request.expiresAt.getTime() <= now.getTime()) return false;
  }
  return true;
}
