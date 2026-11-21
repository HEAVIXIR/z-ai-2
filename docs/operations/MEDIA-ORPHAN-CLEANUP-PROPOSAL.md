# Proposal — Media Orphan Cleanup (SALE/RENT/AUCTION/SERVICE)

**Status:** Design (no implementation — tracked for a follow-up).
**Branch:** `integration/preview-readiness-workerd-2026-11-15`
**Date:** 2026-11-19 (PHASE H.2 §4 audit finding)

## 1. Finding (from the H.2 media audit)

The SALE/RENT/AUCTION/SERVICE media pipeline is otherwise sound:

- Upload → `POST /api/media/staging` (auth + CSRF + `UPLOAD` rate-limit +
  `MAX_UPLOAD_BYTES` Content-Length cap) writes the binary + JSON sidecar to
  Backblaze B2 under `staging/{userId}/{assetId}.{ext}` with `status=STAGED`.
- Listing create → `POST /api/listings` validates each image URL
  (`^/api/media/[a-f0-9]{24}$`), verifies ownership + STAGED + PRIVATE +
  `entityType=Listing` + `entityId=null`, then creates `ListingImage` rows
  **inside the same `$transaction`** as the listing (no orphan listing on
  image-row failure).
- Attach → `attachAsset` copies the B2 object from `staging/` to `objects/`,
  rewrites the sidecar to `status=ATTACHED` + `entityId=listing.id`.
- Retry → `POST /api/listings/[id]/media` re-walks `listing.images` and
  re-invokes `attachAsset`; idempotent for already-attached-to-this-listing
  assets (no duplicate `ListingImage` rows).
- Display → `GET /listings/[slug]` reads the persisted `listing.images`
  relation (not upload status); `GET /api/media/[id]` resolves the signed B2
  read URL.

**Gap (orphan staging):** if a user uploads to `/api/media/staging` but
never completes a listing POST (or the POST fails before `attachAsset`), the
staged B2 object + sidecar remain under `staging/{userId}/` indefinitely.
There is **no sweeper**. The `UPLOAD` rate-limit (20/hour/user) is the only
throttle. This is a storage-leak + minor privacy concern, NOT a correctness
bug for any single listing.

**Gap (orphan on listing delete):** `DELETE /api/listings/[id]` calls
`db.listing.delete` (which cascades `ListingImage` rows) but does NOT invoke
a `detachAsset`/`deleteAsset` for the B2 objects. The B2 objects + sidecars
in `objects/` keep `entityId` pointing at a deleted listing (stale).

## 2. Proposed design (no implementation this phase)

A single idempotent sweeper, runnable on-demand (admin action) or on a
schedule, that:

1. Lists B2 objects under `staging/` whose sidecar `status=STAGED` and
   `createdAt < now - N hours` (default 24h), and for which NO
   `ListingImage.url` references the asset id. Deletes the B2 object +
   sidecar. Idempotent (a re-run is a no-op for already-deleted objects).
2. Lists B2 objects under `objects/` whose sidecar `entityId` points to a
   non-existent `Listing` (cascade-deleted). Re-tags the sidecar to
   `status=ORPHANED` for a retention-window review, or deletes outright
   per the retention policy. Idempotent.

Both operations must be:
- **Ownership-safe:** the sweeper only touches assets whose `uploadedBy`
  matches the staging path owner (or admin-invoked).
- **Rate-limited:** bounded B2 API calls per run to avoid cost spikes.
- **Audited:** each sweep logs `media.orphan.sweep` (count deleted, by bucket).

## 3. Why not implemented in H.2

- It requires a scheduling surface (cron / admin button) + B2 list/delete
  API wiring that is out of scope for the listing-form-completion directive.
- The leak is bounded by the `UPLOAD` rate-limit; it is not a correctness
  blocker for the SALE/RENT/AUCTION/SERVICE create path.
- Tracked as a follow-up; the audit (this document) satisfies the directive
  §4 "audit ... orphan cleanup" deliverable.

## 4. Acceptance for the audit deliverable

The directive §4 asks to "verify actual persisted media relations, not just
upload success." Verified: `ListingImage` is a real Postgres relation with
`onDelete: Cascade`; the listing detail page reads `listing.images` (the
relation), not `mediaStatus`; the retry endpoint is idempotent. The orphan
gap is documented above and is the only open media item.
