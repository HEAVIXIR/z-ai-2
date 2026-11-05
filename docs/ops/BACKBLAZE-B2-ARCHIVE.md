# HEAVIX — Backblaze B2 Archive Foundation

**Status:** Client-side encrypted archive workflow authored; first real remote archive and restore are not yet verified.  
**Target bucket:** `heavix-db-backups` (proposed; not yet created)  
**Existing development bucket:** `heavix-dev-assets` (private; not a database-backup destination)  
**S3 endpoint:** `https://s3.us-east-005.backblazeb2.com`  
**Region:** `us-east-005`

## Purpose and safety model

Backblaze B2 is the off-site archive destination, not the only copy and not a substitute for source control or database restore rehearsals. This foundation archives independently recoverable copies of:

1. App Preview PostgreSQL database (`HEAVIX_APP_PREVIEW_DATABASE_URL`).
2. Store Preview PostgreSQL database (`HEAVIX_STORE_PREVIEW_DATABASE_URL`).
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

The workflow also requires repository variables `HEAVIX_APP_PREVIEW_BACKUP_ROLE`, `HEAVIX_STORE_PREVIEW_BACKUP_ROLE`, and the public age recipient `HEAVIX_B2_AGE_RECIPIENT`. The public recipient is not a secret; the corresponding private age identity must remain offline and must never be added to GitHub. Before any database contact, it performs a disposable encryption probe with the configured post-quantum recipient and a read-only `head-bucket` check against `heavix-db-backups`; failure of either stops the run before the DB preflight/dumps.

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

The preflight also requires the connected role to match the separately configured repository variables `HEAVIX_APP_PREVIEW_BACKUP_ROLE` and `HEAVIX_STORE_PREVIEW_BACKUP_ROLE`, rejects superuser/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS roles, and checks SELECT-only table/sequence access plus USAGE-without-CREATE on user schemas. A passing role-name check alone is not sufficient; the effective privilege checks must also pass. It also fails closed if any user table/view/materialized view/foreign table has row-level security enabled, because a non-bypass role could otherwise produce an incomplete dump. RLS must be explicitly reviewed and the backup policy designed before relaxing this check.

Before any archive dispatch:
1. Independently establish both destination identities using the approved non-secret metadata/OID verification process.
2. Confirm App Preview matches the expected App Preview database identity and Store Preview matches the expected Store Preview identity.
3. Confirm the credentials are read-only and cannot reach Production or any unapproved database.
4. Provision a separate private `heavix-db-backups` bucket; do not reuse `heavix-dev-assets`.
5. Verify a least-privilege B2 Application Key scoped only to the dedicated backup bucket.
6. Generate the age identity offline, store only its public recipient in `HEAVIX_B2_AGE_RECIPIENT`, and independently confirm private-key custody plus a successful disposable decryption test.
7. Provision a disposable PostgreSQL 17 restore target and document the full restore rehearsal.
8. Approve bounded retention, data caps, expected growth, and a zero-cost limit.
9. Review the evidence and update this runbook/workflow gate before dispatch.

The workflow enforces two fail-closed dispatch latches: `HEAVIX_B2_DB_IDENTITY_GATE=VERIFIED_PREVIEW_ONLY` and `HEAVIX_B2_ARCHIVE_READINESS_GATE=APPROVED_PREVIEW_ARCHIVE_V1`. Leave both unset until every prerequisite above is independently verified and approved. These variables are operational attestation latches, not independent proof of database identity, key scope, encryption, retention, or restore readiness; setting them without the underlying evidence would defeat the safety model.

Client-side encryption is now implemented in the workflow source using pinned `age v1.3.2` with post-quantum hybrid recipients (`age1pq1...`, ML-KEM-768 + X25519): all six DB/source payloads are encrypted before upload, plaintext staging files are removed, and the upload allowlist contains only `.age` payloads plus non-sensitive `manifest.json` and `SHA256SUMS`. The public recipient is read from `HEAVIX_B2_AGE_RECIPIENT`; no private identity is passed to the runner. The PR-only CI job tests age encrypt/decrypt round-trip and tamper rejection. The archive remains blocked until the owner configures and verifies the public recipient, confirms offline private-key custody and restore access, provisions the dedicated bucket/key, closes DB identity/read-only gates, and approves retention/cost limits.

Until all four conditions are satisfied, do not create/populate the two database URL secrets for this workflow, do not run `pg_dump`, and do not use a real database URL as a connectivity test. Git-only archival can be designed as a separate workflow if needed; this combined workflow remains blocked.

## Run

GitHub → `HEAVIXIR/z-ai-2` → Actions → **Backblaze B2 Archive** → Run workflow. This manual dispatch is blocked until the database identity hard gate above is independently satisfied.

The job fails closed if a required secret or repository variable is missing, either DB URL is not PostgreSQL or does not use the direct Prisma endpoint, a Preview server fingerprint or read-only role check fails, the Gitleaks history scan fails, a dump is empty, `pg_restore --list` cannot parse it, a Git bundle fails verification, age encryption fails, any plaintext payload remains in the upload allowlist, local checksums fail, B2 cannot be reached, a remote object size differs from its local file, or a downloaded post-upload object fails SHA-256 comparison against the local manifest.

After each upload, the workflow now downloads that exact object from B2 to the ephemeral runner and compares its SHA-256 digest with the locally generated `SHA256SUMS` entry. This is a read-after-write byte-integrity check; it is stronger than `ContentLength` alone, but it is not encryption, retention validation, or a restore rehearsal. `SHA256SUMS` covers every payload plus `manifest.json`; because a checksum file cannot contain its own digest, the workflow computes the local `SHA256SUMS` digest independently and compares it with the downloaded copy.

Object layout:

```
heavix-archive/YYYY/MM/DD/run-<run-id>-attempt-<n>/
  main.dump.age
  store.dump.age
  heavix-source.bundle.age
  heavix-source.tar.gz.age
  heavix-legacy.bundle.age
  heavix-legacy.tar.gz.age
  SHA256SUMS
  manifest.json
```

## Client-side encryption design

The implementation and custody design is recorded in [BACKUP-ENCRYPTION-DESIGN.md](./BACKUP-ENCRYPTION-DESIGN.md). The workflow encrypts each DB and source payload to the public recipient with age v1.3.2 before B2 upload; only ciphertext is included in the upload allowlist. The private identity is kept offline and is never sent to GitHub Actions. CI tests round-trip and authenticated tamper rejection. The owner must still generate the real keypair, store the public recipient in the repository variable, verify offline private-key custody, and prove decryption of a disposable fixture before archive readiness can be approved.

## Restore outline

1. Download the selected run's objects from B2 to a controlled restore host.
2. Run `sha256sum -c SHA256SUMS` before decryption.
3. Decrypt the corresponding `.age` files using the offline private identity.
4. Inspect decrypted dump metadata with PostgreSQL 17 `pg_restore --list`.
5. Restore Main and Store into two separate, newly provisioned, isolated PostgreSQL databases. Never overwrite a live target during a rehearsal.
6. Compare table counts, migration history, critical row counts, constraints, and application-level sentinels.
7. Record restore duration and evidence before declaring the archive recoverable.

Git recovery:

- First decrypt `heavix-source.bundle.age` with the offline age identity, then clone the resulting `heavix-source.bundle` to restore the captured target repository refs.
- First decrypt `heavix-legacy.bundle.age`, then clone the resulting `heavix-legacy.bundle` to restore the captured legacy repository refs.
- Decrypt the `.tar.gz.age` files before inspecting source snapshots. They are not substitutes for the Git bundles.

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

Read-only Prisma workspace metadata inventory (rechecked 2026-11-06):

| Resource | Prisma database ID | Expected system identifier | Status |
|---|---|---:|---|
| App Preview | `db_ew8d6duermpt125paxaqorr9` | `7701427422680793119` | Ready |
| Store Preview | `db_cmtgxfrfwxw5mi77020tcnc3` | `7701425043360235551` | Ready |
| Production | `db_rc9ln1df4rwgxducp2zsge2s` | Not an archive target | Ready; explicitly excluded |

- Prisma automated backup listings for App Preview and Store Preview are empty.
- No Prisma Object Store buckets exist in the workspace.
- These resource IDs/system identifiers are provider-side metadata evidence. The workflow additionally requires its point-in-time server-address/start-time preflight; neither evidence source should be silently substituted for the other.
- No database connection or SQL query was executed by this PR update.

- Existing bucket `heavix-dev-assets` exists and is private, but is reserved for development assets and must not receive database backups.
- Dedicated bucket `heavix-db-backups` has not been created; no database archive writes are permitted until it is provisioned and all readiness gates are satisfied.
- AWS CLI profile `heavix-b2` was configured locally by the operator.
- A prior single-object upload/download round-trip succeeded and SHA-256 matched:
  `A83A35F20962B88F225EAD001F15B85855343C6A6C37711D85398F780E9F7888`.
- That test object and its two local temporary files were subsequently deleted with operator approval.
- No current archive payload is known to exist in the bucket after cleanup.
- No B2 application key value is stored in this repository or this document.
