# App Preview-only backup and migration execution gate — 2026-11-19

## Authorization and scope

The project owner explicitly authorized only migration `20261118152000_link_listing_service_rfq` on App Preview, conditional on a verified backup and restore. Store Preview and Production are explicitly excluded.

## Why a dedicated workflow is required

The existing paired backup workflow reads both App and Store Preview databases, and the existing paired migration workflow applies migrations to both App and Store. Neither is suitable for this authorization. A dedicated workflow was therefore added:

`.github/workflows/app-preview-single-migration.yml`

It is manually dispatched only on `integration/preview-readiness-workerd-2026-11-15`, protected by GitHub Environment `preview-backup`, and requires:
- target input exactly `APP_PREVIEW_ONLY`
- confirmation input exactly `APPLY_APP_PREVIEW_20261118152000`
- exact Integration branch and checked-out SHA
- App Preview database identity (pinned system identifier and protected database OID)
- exactly the six known successful migrations, no unfinished or rolled-back migrations
- expected App schema preconditions and exactly seven repository App migrations
- encrypted App-only PostgreSQL dump uploaded to B2, read back and checksum-verified
- decryption and restore into disposable PostgreSQL 17 with a nonzero table inventory
- a second App database identity and migration-history check immediately before apply
- post-apply proof of the exact seven-migration history, two columns, two indexes and two foreign keys

The job receives only `MAIN_PREVIEW_DATABASE_URL` and App Preview OID; it does not receive Store database credentials or any Production connection. No Store migration command exists in the workflow.

## Migration reviewed

The exact migration SQL is additive:
- adds nullable `Listing.serviceTypeId`
- adds nullable `RFQ.listingId`
- creates `Listing_serviceTypeId_idx`
- creates unique `RFQ_listingId_key`
- creates two foreign keys with `ON DELETE SET NULL ON UPDATE CASCADE`

No backfill, seed, delete, or existing-row mutation is included.

## Execution status

The workflow definition is prepared for owner-authorized manual dispatch. Creating/committing the workflow does not execute it. The GitHub Actions dispatch operation is not available through the connected GitHub action interface in this session; therefore the workflow must be run from the repository's Actions tab. The protected `preview-backup` Environment may require its configured reviewer approval.

Run:
https://github.com/HEAVIXIR/z-ai-2/actions/workflows/app-preview-single-migration.yml

Required inputs:
- `target`: `APP_PREVIEW_ONLY`
- `confirm`: `APPLY_APP_PREVIEW_20261118152000`

Do not substitute or run the paired backup/migration workflows. If any preflight, backup, restore, identity, migration-history or schema check fails, the job stops before migration. No Production operation is authorized.

---
Append-only execution gate. No migration or database write is implied by this document.
