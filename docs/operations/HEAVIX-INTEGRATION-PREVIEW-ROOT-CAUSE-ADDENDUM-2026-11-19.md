# HEAVIX Integration Preview Root-Cause Addendum — 2026-11-19

This append-only addendum supersedes any earlier provisional hypothesis about the Integration Preview homepage HTTP 500.

## Exact state examined

- Repository: `HEAVIXIR/z-ai-2`
- Branch: `integration/preview-readiness-workerd-2026-11-15`
- Exact Integration SHA: `a28569da5da47a7ee72ea5909180945a19977389`
- Preview Worker: `heavix-preview`
- Preview URL: https://integration-preview-readiness-workerd-2026-11-15-heavix-preview.heavixir.workers.dev
- Preview deployment version: `cc6cf435-52c2-4527-9ad9-1ed8b3d86f73`
- PR #340 remains Draft/open/unmerged. No Main merge or Production deploy.

## Approved read-only database diagnostics

Run: https://github.com/HEAVIXIR/z-ai-2/actions/runs/44415442132

- Exact Integration branch guard passed.
- App Preview and Store Preview database identity guards and TLS connections passed.
- App Preview migration history: 6 successful, 0 unfinished, 0 rolled back.
- App Preview has the previously checked 10 homepage Listing columns, but that check did not include `serviceTypeId`.
- The Integration repository includes `prisma/migrations/20261118152000_link_listing_service_rfq/migration.sql`. It adds nullable `Listing.serviceTypeId`, an index and FK to `ServiceType`; it also adds nullable `RFQ.listingId`, a unique index and FK to `Listing`.
- That seventh migration is absent from the App Preview migration history observed by the diagnostic.

## Confirmed runtime root cause

Cloudflare Workers Observability for the exact deployed Preview version returned these safe, allowlisted adapter fields for all three failing homepage reads:

- PostgreSQL code: `42703` (undefined column)
- Prisma adapter kind: `ColumnNotFound`
- Missing column: `Listing.serviceTypeId`
- Prisma client: `6.19.3`
- Affected query labels: `listing.featured`, `listing.verified`, `listing.latest`

Therefore the Preview runtime schema is behind the Integration Prisma model/query expectations for `Listing.serviceTypeId`. The earlier `publishedAt` sort hypothesis is superseded and not the root cause.

## Preview checks on the same SHA

- CI run #44415539515: success.
- OpenNext real-route smoke run #44415548794: success.
- Integration Preview run #44415539351: build and Integration Worker deployment succeeded; HTTP acceptance failed because `GET /` returned 500.
- The independent `GET /api/health` check returned HTTP 200 and reported `db=up`, `storeDb=up`.
- No migration, seed, DDL, DML, Production connection, Production deployment, secret mutation, or DNS mutation was performed.

## Next gated action

Prepare a narrowly scoped Preview-only apply plan for the already-present migration `20261118152000_link_listing_service_rfq`. Before any apply:
1. Verify the exact App Preview DB identity again immediately before execution.
2. Confirm a fresh backup/restore point and a tested recovery path.
3. Review the complete migration SQL and confirm its additive/nullable semantics against the exact Preview schema and migration history.
4. Obtain explicit authorization for the migration apply.

Do not run the migration or seed, and do not touch Production, until those gates are satisfied. After an authorized Preview-only apply, rerun the read-only schema check and deploy/test the exact resulting Integration SHA; require root HTTP 200 and separately retain the health result.

## Issue tracking

Detailed evidence and the proposed gated next action are recorded in [Issue #346](https://github.com/HEAVIXIR/z-ai-2/issues/346).

---
Append-only operational record. No background execution is implied.
