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


## Append-only continuation — PR exposure and checksum correction (2026-11-19)

- Dedicated workflow-only PR: https://github.com/HEAVIXIR/z-ai-2/pull/347
- PR base: `main` at `e49327ee94c2c1a618a4c0bcdcf79f73edb73367`.
- PR head after correction: `4b68a33fa501ebb1a8308718a594a9f02b74f07a`.
- PR remains Draft, open and unmerged. It contains exactly one changed path: `.github/workflows/app-preview-single-migration.yml`; no Integration application code is included.
- Initial PR checks on commit `55ec3bede68b4812a30ac4064c063f4f2c83142c`: six checks succeeded and `Legacy archive inventory (read-only)` was skipped. These results do not validate the subsequent correction.
- Static review found that checksum manifests used absolute file paths, while read-back/restore verification runs from a different directory. This would cause checksum verification to target the original runner path rather than the downloaded/restored file.
- Corrected both checksum-generation commands to execute from the backup working directory and store relative filenames. The manifest and B2 read-back verification now resolve filenames relative to their verification directories.
- Correction commit: `4b68a33fa501ebb1a8308718a594a9f02b74f07a`.
- CI run for the corrected commit was observed queued at run `44484268815`; no result has yet been verified.
- No workflow dispatch, backup, B2 upload, restore, database migration, Store operation or Production operation was performed in this continuation.
- Branch protection prevents treating the PR as mergeable solely from successful checks; review/required gates remain. Do not bypass protection or merge without explicit approval.


## Append-only CI completion — corrected workflow commit (2026-11-19)

- CI run `44484268815` for `4b68a33fa501ebb1a8308718a594a9f02b74f07a` completed with conclusion `success`.
- Successful jobs: `verify`, `phase-tests`, `audit-transaction`, `tls-proof`, `docker-build-proof`, and Cloudflare compatibility (report-only).
- `Legacy archive inventory (read-only)` was skipped; this is not a failure but remains a skipped check, not a passed execution.
- PR #347 remains Draft/open/unmerged and contains exactly one changed file: `.github/workflows/app-preview-single-migration.yml`.
- A PR conversation comment records this CI outcome and reiterates that no database workflow has been dispatched.
- No backup, B2 upload, restore, migration, Store Preview operation, Production operation, or Main update occurred.
- Next gate: owner review/decision on making PR #347 ready for normal protected-branch review. Do not merge or bypass protections without explicit authorization.
