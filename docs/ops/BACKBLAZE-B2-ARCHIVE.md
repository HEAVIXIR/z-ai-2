# HEAVIX — Backblaze B2 Archive Foundation

**Status:** Foundation workflow authored; first remote archive run is not yet verified.  
**Target bucket:** `heavix-db-backups` (proposed; not yet created)  
**Existing development bucket:** `heavix-dev-assets` (private; not a database-backup destination)  
**S3 endpoint:** `https://s3.us-east-005.backblazeb2.com`  
**Region:** `us-east-005`

## Purpose and safety model

Backblaze B2 is the off-site archive destination, not the only copy and not a substitute for source control or database restore rehearsals. This foundation archives independently recoverable copies of:

1. Main PostgreSQL database (`DATABASE_URL`).
2. Store PostgreSQL database (`STORE_DATABASE_URL`).
3. Complete Git history bundle and source snapshot for `HEAVIXIR/z-ai-2`.
4. Complete Git history bundle and source snapshot for legacy `HEAVIXIR/z`.
5. SHA-256 manifest and archive metadata.

The workflow is deliberately manual (`workflow_dispatch`) for its first operational phase. Do not schedule repeated full dumps until actual database sizes, B2 free allowance, expected growth, and retention/cost have been measured. The bucket currently uses Keep all versions; no automated deletion or lifecycle expiration is configured by this change. A pull-request-only static-validation job also parses the workflow YAML and runs `bash -n` against embedded Bash blocks; the archive job is explicitly skipped for pull-request events and runs only after a manual dispatch.

## Required GitHub Actions secrets

Create these repository Actions secrets. Values must be entered in GitHub's secret UI and must never be committed or pasted into issues/logs:

| Secret | Purpose |
|---|---|
| `HEAVIX_APP_PREVIEW_DATABASE_URL` | Direct PostgreSQL URL for App Preview only; dedicated read-only backup role |
| `HEAVIX_STORE_PREVIEW_DATABASE_URL` | Direct PostgreSQL URL for Store Preview only; dedicated read-only backup role |
| `HEAVIX_DB_BACKUPS_B2_KEY_ID` | Backblaze application key ID scoped only to `heavix-db-backups` |
| `HEAVIX_DB_BACKUPS_B2_KEY` | Backblaze application key secret scoped only to `heavix-db-backups` |

The B2 key must be restricted to the dedicated `heavix-db-backups` bucket and only the operations needed to list/write/read archive objects. Do not reuse the account master key. Credentials are scoped to only the workflow steps that need them; transformed PostgreSQL DSNs are masked before being passed to the dump step. The existing `heavix-dev-assets` bucket must never receive database dumps.

## Pre-archive secret scanning

Before any Git bundle is created or uploaded, the workflow downloads the pinned Gitleaks CLI release `8.30.1`, verifies its archive against the release-published SHA-256 checksum file, and scans the complete history of both repositories with redaction enabled. The CLI is used directly rather than the Gitleaks GitHub Action, avoiding that Action's separate organization-license requirement.

Any detected finding fails the workflow before database dump/upload steps proceed. Do not add broad allowlists or silently suppress findings. Each result must be reviewed; confirmed exposed credentials must be rotated/revoked through their owning provider before the archive proceeds. A clean Gitleaks result reduces risk but is not proof that no secret exists.

## Database identity hard gate

**Do not dispatch the archive job yet.**

The workflow currently requires the explicitly Preview-named Actions secrets above and rejects any connection URL whose host is not the direct Prisma endpoint `db.prisma.io`. It also runs a read-only preflight before `pg_dump` that compares the server address and PostgreSQL postmaster start timestamp with the last independently reviewed Preview fingerprints:

| Target | Expected `inet_server_addr()` | Expected UTC postmaster start |
|---|---|---|
| App Preview | `172.16.163.89` | `2026-11-03 10:11:45.178128` |
| Store Preview | `172.16.163.49` | `2026-11-03 10:11:37.778073` |

These are point-in-time infrastructure fingerprints, not permanent database IDs. Any restart, failover, address change, or Prisma topology change must stop the workflow. Re-verify the database resource identity through Prisma's non-secret metadata and a separately reviewed read-only connection before changing the expected values. Do not merely update a timestamp to make the check pass.

The preflight also requires the connected role to match the separately configured repository variables `HEAVIX_APP_PREVIEW_BACKUP_ROLE` and `HEAVIX_STORE_PREVIEW_BACKUP_ROLE`, rejects superuser/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS roles, and checks SELECT-only table/sequence access plus USAGE-without-CREATE on user schemas. A passing role-name check alone is not sufficient; the effective privilege checks must also pass.

 The workflow currently accepts generic `HEAVIX_DATABASE_URL` and `HEAVIX_STORE_DATABASE_URL` secrets, but it does not independently prove that they target the dedicated App Preview and Store Preview databases. Secret names, connection-string labels, successful TCP/TLS connectivity, or a successful PostgreSQL login are not database identity evidence.

Before any archive dispatch:
1. Independently establish both destination identities using the approved non-secret metadata/OID verification process.
2. Confirm App Preview matches the expected App Preview database identity and Store Preview matches the expected Store Preview identity.
3. Confirm the credentials are read-only and cannot reach Production or any unapproved database.
4. Provision a separate private `heavix-db-backups` bucket; do not reuse `heavix-dev-assets`.
5. Verify a least-privilege B2 Application Key scoped only to the dedicated backup bucket.
6. Implement client-side encryption and document recovery-key custody; bucket-level encryption alone is insufficient.
7. Approve bounded retention, data caps, expected growth, and a zero-cost limit.
8. Prepare an isolated PostgreSQL 17 restore target and a documented restore rehearsal procedure.
9. Review the evidence and update this runbook/workflow gate before dispatch.

The workflow enforces two fail-closed dispatch latches: `HEAVIX_B2_DB_IDENTITY_GATE=VERIFIED_PREVIEW_ONLY` and `HEAVIX_B2_ARCHIVE_READINESS_GATE=APPROVED_PREVIEW_ARCHIVE_V1`. Leave both unset until every prerequisite above is independently verified and approved. These variables are operational attestation latches, not independent proof of database identity, key scope, encryption, retention, or restore readiness; setting them without the underlying evidence would defeat the safety model. In addition, the workflow currently hard-codes `ENCRYPTION_IMPLEMENTATION=false` and fails the dispatch gate even if both repository variables are mistakenly set. This code-level blocker must remain until client-side encryption is implemented in the workflow, its recovery-key custody is documented, and encrypted-payload/restore tests pass. The current workflow must not upload plaintext database dumps.

Until all four conditions are satisfied, do not create/populate the two database URL secrets for this workflow, do not run `pg_dump`, and do not use a real database URL as a connectivity test. Git-only archival can be designed as a separate workflow if needed; this combined workflow remains blocked.

## Run

GitHub → `HEAVIXIR/z-ai-2` → Actions → **Backblaze B2 Archive** → Run workflow. This manual dispatch is blocked until the database identity hard gate above is independently satisfied.

The job fails closed if a required secret is missing, either DB URL is not PostgreSQL, the Gitleaks history scan fails, a dump is empty, `pg_restore --list` cannot parse it, a Git bundle fails verification, local checksums fail, B2 cannot be reached, a remote object size differs from its local file, or a downloaded post-upload object fails SHA-256 comparison against the local manifest.

After each upload, the workflow now downloads that exact object from B2 to the ephemeral runner and compares its SHA-256 digest with the locally generated `SHA256SUMS` entry. This is a read-after-write byte-integrity check; it is stronger than `ContentLength` alone, but it is not encryption, retention validation, or a restore rehearsal. `SHA256SUMS` covers every payload plus `manifest.json`; because a checksum file cannot contain its own digest, the workflow computes the local `SHA256SUMS` digest independently and compares it with the downloaded copy.

Object layout:

```
heavix-archive/YYYY/MM/DD/run-<run-id>-attempt-<n>/
  main.dump
  store.dump
  heavix-source.bundle
  heavix-source.tar.gz
  heavix-legacy.bundle
  heavix-legacy.tar.gz
  SHA256SUMS
  manifest.json
```

## Client-side encryption design

The implementation design is recorded in [BACKUP-ENCRYPTION-DESIGN.md](./BACKUP-ENCRYPTION-DESIGN.md). It selects the upstream age format with an offline owner-held private identity and a public recipient supplied to GitHub Actions. The runner must never receive the private identity. The current archive workflow still has a code-level encryption blocker and must not be dispatched until encryption is implemented, CI proves round-trip and tamper rejection, and the offline restore operator has confirmed key custody.

## Restore outline

1. Download the selected run's objects from B2 to a controlled restore host.
2. Run `sha256sum -c SHA256SUMS`.
3. Inspect dump metadata with PostgreSQL 17 `pg_restore --list`.
4. Restore Main and Store into two separate, newly provisioned, isolated PostgreSQL databases. Never overwrite a live target during a rehearsal.
5. Compare table counts, migration history, critical row counts, constraints, and application-level sentinels.
6. Record restore duration and evidence before declaring the archive recoverable.

Git recovery:

- `git clone heavix-source.bundle` restores the captured target repository refs included in the bundle.
- `git clone heavix-legacy.bundle` restores the captured legacy repository refs.
- The `.tar.gz` files are source snapshots for inspection, not substitutes for the Git bundles.

## Explicitly not covered yet

This workflow does **not** claim to archive all HEAVIX state. The following require separate integration or inventory:

- Media binary objects currently written by `src/lib/media-service.ts` to `public/uploads/YYYY/MM`, plus their `.meta.json` sidecars. These files live on the application host/volume and are not accessible to this GitHub Actions runner. The app still returns relative `/uploads/...` URLs.
- Other user-generated files, documents, video, exports, or attachments outside the two database dumps and Git repositories.
- Deployment configuration, DNS, Cloudflare settings, provider-side secrets, and environment variables. Secrets must be backed up through their owning secret manager, never exported as plaintext into B2.
- A live restore rehearsal against representative real backup data. `pg_restore --list` is a format check, not proof of successful restoration.
- Database roles/ownership/global objects and extensions not represented in ordinary per-database dumps. Inventory and restore them separately where required.

## Architecture work required before media cutover

The current canonical media service uses local filesystem writes, recursive sidecar JSON scans, and relative public URLs. Do not bolt B2 calls into API routes. Introduce a storage port behind the existing media service, retain the current validation/Sharp pipeline, and persist stable object keys rather than expiring presigned URLs. Because the bucket is private, public media delivery must be deliberately designed (authenticated/proxy route or short-lived signed reads) without leaking application keys. Existing API contracts and consumers must remain compatible or be migrated with tests.

Do not enable public bucket access as a shortcut. Do not delete local media after upload until remote object integrity, metadata parity, URL delivery, rollback, and restore have all passed.

## Current verified evidence

- Existing bucket `heavix-dev-assets` exists and is private, but is reserved for development assets and must not receive database backups.
- Dedicated bucket `heavix-db-backups` has not been created; no database archive writes are permitted until it is provisioned and all readiness gates are satisfied.
- AWS CLI profile `heavix-b2` was configured locally by the operator.
- A prior single-object upload/download round-trip succeeded and SHA-256 matched:
  `A83A35F20962B88F225EAD001F15B85855343C6A6C37711D85398F780E9F7888`.
- That test object and its two local temporary files were subsequently deleted with operator approval.
- No current archive payload is known to exist in the bucket after cleanup.
- No B2 application key value is stored in this repository or this document.
