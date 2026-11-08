# Preview paired backup to Backblaze B2 — implementation gate

## Decision

Use a GitHub Actions runner for paired Main + Store Preview backups. Do not invoke
`scripts/backup.sh` from the Cloudflare Worker: that route currently shells out to
`pg_dump` and writes to the local filesystem, which is not a supported Cloudflare
Workers execution model.

This document is a release-safe implementation plan, not a claim that B2 backup is live.
No B2 bucket, application key, encryption key, GitHub environment, workflow, or secret
has been created or configured by this audit.

## Mandatory preconditions

1. Create/confirm a dedicated Backblaze B2 bucket for HEAVIX Preview backups only.
2. Create a least-privilege B2 application key scoped to that bucket, with only the
   object operations required for upload, read-back, and retention verification.
3. Configure B2 lifecycle/retention and versioning/Object Lock policy deliberately.
   Record the exact policy and verify it through B2's control plane before first backup.
4. Create a GitHub Environment named `preview-backup`, protected by required reviewers.
5. Add the following values to that environment only; never to repository-wide secrets:
   - `MAIN_PREVIEW_DATABASE_URL`
   - `STORE_PREVIEW_DATABASE_URL`
   - `B2_S3_ENDPOINT`
   - `B2_BUCKET`
   - `B2_APPLICATION_KEY_ID`
   - `B2_APPLICATION_KEY`
   - `AGE_RECIPIENT` (public encryption recipient)
   - `AGE_IDENTITY` (private decrypt identity; required only by the restore-verification job)
6. Before using either DB URL, attest its destination independently against the intended
   Prisma Preview database resource IDs and expected database names. Do not use
   Cloudflare Worker secret binding names as proof of destination.
7. Ensure the runner can reach both Preview databases over TLS and verify certificate
   validation is enabled. Do not use `sslmode=require` as a substitute for verifying
   the server certificate when the provider supports `verify-full`.

## Workflow design

The workflow must be `workflow_dispatch` only, with no schedule, push, pull-request,
or deployment trigger. It must:

1. Require the caller to select the explicit target `preview`; reject any other value.
2. Run only from the approved security/integration branch until the release owner
   deliberately changes that policy.
3. Bind the protected `preview-backup` GitHub Environment before reading its secrets.
4. Verify the DB destination allowlist (host, port, database name, and provider resource
   identity attestation) before any dump begins; fail closed on mismatch.
5. Use `pg_dump --format=custom --no-owner --no-acl` independently for Main and Store.
6. Require both dumps to be non-empty; write a manifest with UTC timestamp, target
   resource IDs, database names, tool versions, byte counts, and SHA-256 checksums.
   The manifest must not contain connection URLs, usernames, passwords, or secret data.
7. Encrypt each dump and the manifest with `age` before upload. Do not upload plaintext.
8. Upload to a deterministic, date-partitioned B2 object prefix using the B2 S3 endpoint.
   Do not place backup files in GitHub artifacts as a long-term backup store.
9. Read the uploaded objects back from B2, verify checksums, decrypt in the protected
   runner, and restore both dumps into disposable PostgreSQL 17 databases.
10. Run restore smoke checks and publish a non-secret evidence summary. A successful
    upload without a successful read-back and restore must not be reported as a
    successful backup.
11. Apply and verify retention policy without deleting the newest known-good paired
    backup. Never perform retention deletion in the first implementation until an
    explicit dry-run report has been reviewed.
12. Use `permissions: contents: read`, pin third-party actions to immutable commit
    SHAs, set a concurrency group, disable shell tracing, and avoid printing command
    arguments or environment values.

## Required evidence for acceptance

- Verified B2 bucket identity, endpoint, region, lifecycle/retention policy, and
  least-privilege key scope.
- Database destination attestation for both Preview resources.
- TLS connection evidence for both database connections.
- One complete paired backup with encrypted objects in B2.
- Read-back, decryption, checksum, and restore proof for both databases.
- A documented restore procedure and a measured restore duration.
- A second paired run proving the process is repeatable.

## Current blockers

- No B2 bucket or credentials are connected to this project session.
- No B2 integration exists in the current backup script or admin route.
- Preview Worker bindings expose secret names, but their destination resources have not
  been proven to match the two Preview database IDs.
- No B2 restore test has been performed.
- The current CI backup/restore tests run against disposable local PostgreSQL 17
  databases and are not Preview backups.

## Safety boundary

Until every precondition and acceptance item is satisfied, keep the existing backup API
out of Cloudflare Worker production paths and do not create a workflow that can dump
unattested or Production databases. Do not create B2 resources or store credentials
without explicit resource/account configuration. Production remains untouched.
