# Preview paired backup to Backblaze B2 — implementation and acceptance gate

## Decision

Paired Main + Store Preview backups run from a manually dispatched GitHub Actions
runner. The Cloudflare Worker backup route is not used: it shells out to `pg_dump`
and writes to a local filesystem, neither of which is a supported Workers execution
model.

The implementation is `.github/workflows/prisma-preview-backup-to-b2.yml`. It is
workflow_dispatch-only, restricted to the security branch, requires explicit
`PREVIEW_ONLY` and `BACKUP_PREVIEW_ONLY` confirmations, and binds the
`preview-backup` GitHub Environment. It performs no Production operations and has
no schedule, push, pull-request, deployment, or retention-deletion trigger.

## Backblaze bucket inventory (owner-provided, not API-verified)

The following values were copied from the owner's Backblaze console on 2026-11-09.
They are user-provided evidence, not independently verified control-plane results:

| Purpose | Bucket | Bucket ID | Endpoint | Visibility | Encryption | Current objects |
|---|---|---|---|---|---|---|
| Preview DB backups | `heavix-db-backups` | `253da133c22ba1fdac1c0411` | `s3.us-east-005.backblazeb2.com` | Private | Enabled | 0 |
| Development assets | `heavix-dev-assets` | `356d017312aba16dac1c0411` | `s3.us-east-005.backblazeb2.com` | Private | Enabled | 2 (43 bytes) |

Both buckets report Object Lock disabled. The backup bucket reports custom lifecycle
rules; the assets bucket reports keep-all-versions. Only `heavix-db-backups` is an
approved backup destination. Never place database backups in `heavix-dev-assets`.
The reported zero-object state means no backup object is currently visible in the
designated bucket.

## Workflow safeguards and behavior

Before dumping, the workflow:
1. Verifies the exact branch, triggering commit, explicit Preview-only input, and
   protected environment values.
2. Requires the exact B2 endpoint `s3.us-east-005.backblazeb2.com` and bucket
   `heavix-db-backups`; no other bucket is accepted.
3. Connects with PostgreSQL TLS `verify-full` and checks the exact previously
   inventoried system identifiers:
   - Main Preview: `7701427422680793119`
   - Store Preview: `7701425043360235551`
4. Fails closed unless both sessions and roles prove read-only defaults, read-only
   transaction state, no elevated role attributes, no `pg_write_all_data` membership,
   and no database/schema CREATE privileges. It additionally verifies `default_transaction_read_only=on` in `pg_db_role_setting` for the exact login role (not merely a session-level GUC override).
5. Creates paired custom-format dumps with `pg_dump --format=custom --no-owner --no-acl`.
6. Creates a non-secret manifest and SHA-256 checksums, encrypts both dumps and the
   manifest with `age`, uploads only encrypted objects, reads them back, verifies
   encrypted-object hashes, decrypts, verifies plaintext hashes, and restores both
   into disposable PostgreSQL 17 databases.
7. Requires non-empty user-table inventories after both restores. It never deletes
   objects or changes retention policy.

A successful workflow run is the minimum acceptance evidence. An upload alone is not
a successful backup; both restores must pass.

## Protected GitHub Environment configuration

Create a GitHub Environment named `preview-backup`, protected by required reviewers.
Add these values as Environment secrets only, not repository-wide secrets:

- `MAIN_PREVIEW_DATABASE_URL`
- `STORE_PREVIEW_DATABASE_URL`
- `B2_S3_ENDPOINT` = `s3.us-east-005.backblazeb2.com`
- `B2_BUCKET` = `heavix-db-backups`
- `B2_APPLICATION_KEY_ID`
- `B2_APPLICATION_KEY`
- `AGE_RECIPIENT` (public recipient)
- `AGE_IDENTITY` (private identity used by restore verification)

The B2 application key must be scoped only to `heavix-db-backups` and grant only the
object permissions required to upload and read back. Never use the B2 master key.
The private age identity must be restricted to the protected Environment. Do not send
any secret values in chat, issues, commits, or logs.

## Current blockers

- The bucket metadata above is owner-provided; bucket ID, lifecycle rules, versioning,
  encryption, and key scope have not been independently verified through B2 API.
- No B2 application key or age identity has been configured in the protected GitHub
  Environment as far as this session can verify.
- The latest SELECT-only Preview audit found the current `prisma_application` roles
  have `rolreplication=true`, membership in `pg_write_all_data`, effective table
  write access, and no role-level `default_transaction_read_only=on`. Therefore the
  new workflow's least-privilege preflight is expected to reject current credentials.
  Do not weaken or bypass that gate. Dedicated Preview backup roles require a separate
  reviewed and explicitly authorized database privilege change.
- No successful B2 upload, read-back, decryption, or restore has been performed.
- Existing local PostgreSQL 17 backup/restore tests are not evidence of Preview backup.

## Acceptance sequence

1. Independently verify B2 bucket identity, endpoint, region, encryption, lifecycle,
   versioning/Object Lock settings, and the least-privilege application key scope.
2. Review and approve the GitHub Environment protection rules and populate its secrets.
3. Separately review and authorize dedicated Preview-only database backup roles; then
   verify their exact resource IDs, TLS, role attributes, memberships, and effective
   privileges using the read-only audit. Do not mutate roles/grants as part of this
   workflow.
4. Dispatch the workflow on the approved branch and enter both explicit confirmations.
5. Retain the workflow run URL, encrypted object prefix, manifest evidence, and restore
   smoke-test output as the backup acceptance record.
6. Repeat a second paired run to prove repeatability.
7. Review lifecycle retention as a dry run before authorizing any deletion policy.

## Safety boundary

Until all acceptance steps pass, no backup is considered operational. Do not connect
this flow to Production, Cloudflare Worker deployment, automatic schedules, or
retention deletion. Production remains untouched.
