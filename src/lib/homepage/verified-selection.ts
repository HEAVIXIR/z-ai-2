/**
 * HEAVIX — Deterministic verified-section listing selection.
 *
 * Replaces the fixed 20-row candidate pool (commit 2e18ff1e) with a
 * deterministic two-query approach. The homepage batch-1 Promise.all
 * now fetches two parallel listing sets:
 *
 *   - strict:    8 newest PUBLISHED + verified:true  (DB-level filter)
 *   - inclusive: 8 newest PUBLISHED                   (no verified filter)
 *
 * The admin-configured `siteSettings.verifiedSectionVerifiedOnly` flag
 * selects which set is rendered. Because both queries already constrain
 * `take: 8` at the database level, the result is deterministic: the
 * verified section always shows 8 cards (or fewer ONLY when the DB
 * genuinely has fewer qualifying rows).
 *
 * This eliminates the pool-of-20 limitation where fewer than 8 verified
 * listings could appear when the newest 20 published listings happened
 * to be mostly unverified — even though older verified listings existed
 * beyond the pool boundary.
 *
 * Batch invariant: both queries run inside the existing batch-1
 * Promise.all (16 -> 17 parallel queries). No new sequential PPG
 * round-trip is introduced.
 */

/**
 * Select the final verified-section listings based on the admin setting.
 *
 * @param strictRows    - 8 newest PUBLISHED + verified:true rows (DB-filtered)
 * @param inclusiveRows - 8 newest PUBLISHED rows (no verified filter)
 * @param verifiedOnlyFlag - `siteSettings.verifiedSectionVerifiedOnly`.
 *                           `null`/`undefined` defaults to `true` (safe
 *                           verified-only behavior, matching the original
 *                           SQL semantics before the batch-merge).
 * @returns the appropriate row array (already capped at 8 by the DB query)
 */
export function selectVerifiedListings<T>(
  strictRows: T[],
  inclusiveRows: T[],
  verifiedOnlyFlag: boolean | null | undefined,
): T[] {
  const useStrict = verifiedOnlyFlag ?? true;
  return useStrict ? strictRows : inclusiveRows;
}
