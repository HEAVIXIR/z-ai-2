/**
 * Canonical public visibility rules for marketplace listings.
 *
 * The expiry worker is an eventual consistency mechanism, not an access
 * control boundary. Every public query must independently exclude listings
 * whose expiresAt is in the past.
 */
export function getPublicListingWhere(now: Date = new Date()) {
  return {
    status: "PUBLISHED",
    AND: [
      {
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    ],
  };
}

export function isPublicListingActive(
  listing: { status?: string | null; expiresAt?: Date | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  return Boolean(
    listing &&
      listing.status === "PUBLISHED" &&
      (listing.expiresAt == null || listing.expiresAt > now),
  );
}
