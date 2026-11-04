# HEAVIX — Backblaze B2 Archive Foundation

**Status:** Foundation workflow authored; first remote archive run is not yet verified.  
**Bucket:** `heavix-dev-assets` (private)  
**S3 endpoint:** `https://s3.us-east-005.backblazeb2.com`  
**Region:** `us-east-005`

## Purpose and safety model

Backblaze B2 is the off-site archive destination, not the only copy and not a substitute for source control or database restore rehearsals. This foundation archives independently recoverable copies of:

1. Main PostgreSQL database (`DATABASE_URL`).
2. Store PostgreSQL database (`STORE_DATABASE_URL`).
3. Complete Git history bundle and source snapshot for `HEAVIXIR/z-ai-2`.
4. Complete Git history bundle and source snapshot for legacy `HEAVIXIR/z`.
5. SHA-256 manifest and archive metadata.

The workflow is deliberately manual (`workflow_dispatch`) for its first operational phase. Do not schedule repeated full dumps until actual database sizes, B2 free allowance, expected growth, and retention/cost have been measured. The bucket currently uses Keep all versions; no automated deletion or lifecycle expiration is configured by this change.

## Required GitHub Actions secrets

Create these repository Actions secrets. Values must be entered in GitHub's secret UI and must never be committed or pasted into issues/logs:

| Secret | Purpose |
|---|---|
| `HEAVIX_DATABASE_URL` | Main PostgreSQL connection URL, read-only backup role preferred |
| `HEAVIX_STORE_DATABASE_URL` | Store PostgreSQL connection URL, read-only backup role preferred |
| `B2_APPLICATION_KEY_ID` | Backblaze application key ID scoped to this bucket |
| `B2_APPLICATION_KEY` | Backblaze application key secret |

The B2 key should be restricted to `heavix-dev-assets` and only the operations needed to list/write/read archive objects. Do not reuse the account master key. Credentials are scoped to only the workflow steps that need them; transformed PostgreSQL DSNs are masked before being passed to the dump step.

## Pre-archive secret scanning

Before any Git bundle is created or uploaded, the workflow downloads the pinned Gitleaks CLI release `8.30.1`, verifies its archive against the release-published SHA-256 checksum file, and scans the complete history of both repositories with redaction enabled. The CLI is used directly rather than the Gitleaks GitHub Action, avoiding that Action's separate organization-license requirement.

Any detected finding fails the workflow before database dump/upload steps proceed. Do not add broad allowlists or silently suppress findings. Each result must be reviewed; confirmed exposed credentials must be rotated/revoked through their owning provider before the archive proceeds. A clean Gitleaks result reduces risk but is not proof that no secret exists.

## Run

GitHub → `HEAVIXIR/z-ai-2` → Actions → **Backblaze B2 Archive** → Run workflow.

The job fails closed if a required secret is missing, either DB URL is not PostgreSQL, the Gitleaks history scan fails, a dump is empty, `pg_restore --list` cannot parse it, a Git bundle fails verification, local checksums fail, B2 cannot be reached, or a remote object size differs from its local file.

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

- Bucket `heavix-dev-assets` exists and is private.
- AWS CLI profile `heavix-b2` was configured locally by the operator.
- A prior single-object upload/download round-trip succeeded and SHA-256 matched:
  `A83A35F20962B88F225EAD001F15B85855343C6A6C37711D85398F780E9F7888`.
- That test object and its two local temporary files were subsequently deleted with operator approval.
- No current archive payload is known to exist in the bucket after cleanup.
- No B2 application key value is stored in this repository or this document.
