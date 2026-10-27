# Prisma workspace and legacy-transfer gate

**Audit date:** 2026-10-27  
**Target repository:** `HEAVIXIR/z-ai-2`  
**Legacy source:** `HEAVIXIR/z` at `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`  
**Target baseline:** `main` at `9a64fbaa5d5d92349f100c093ad00931ea2ec265`

## Executive decision

- **Do not bulk-copy or extract legacy ZIP contents directly into the application.** Transfer only a feature with a demonstrated current-product gap, a reviewed implementation path, and tests.
- **No Prisma resource is currently configured in the connected workspace.** The workspace exists, but read-only inventory returned zero projects, zero Compute apps, zero object-store buckets, zero GitHub installations, and no Prisma Postgres databases. No resource was created during this audit.
- **Production remains NO-GO.** No deployment, DNS change, production database operation, migration, backfill, or worker activation is part of this work.

## Legacy archive inventory (metadata only)

The legacy repository currently consists of ZIP archives rather than a normal source tree. Its pinned recursive tree contains these 13 files:

| Archive | Bytes | Initial disposition |
|---|---:|---|
| `.zscripts.zip` | 13,543 | Inspect scripts; never execute blindly |
| `bun.zip` | 13,873,381 | Inspect package/runtime payload; do not import binaries blindly |
| `db.zip` | 2,399,229 | HOLD pending schema/data provenance and secret scan |
| `docs.zip` | 55,629 | Candidate for selective documentation transfer |
| `download.zip` | 389 | Inspect before use |
| `examples.zip` | 3,703 | Candidate only if still relevant and licensed |
| `mini-services.zip` | 376 | Inspect; likely incomplete metadata/payload |
| `prisma.zip` | 203,686 | Compare schemas and migrations; never apply to production |
| `public.zip` | 3,693,360 | Inspect assets, licensing, personal data, and embedded secrets |
| `scripts.zip` | 62,321 | Security review before any execution |
| `src.zip` | 10,866,241 | Feature-by-feature source review; no bulk replacement |
| `tests.zip` | 32,545 | Reuse relevant tests only after validating assumptions/contracts |
| `upload.zip` | 2,925,087 | Inspect for user data, generated artifacts, and credentials |

The existing archive audit reports 13 valid ZIPs, 2,751 archive entries, 576 candidate paths, 17 credential-pattern signals, 24 items requiring review, and zero confirmed unsafe paths. These are inventory findings, **not** proof that all archive contents are safe. Credential matches are deliberately not reproduced here. The archive repository is public, so any real credential found in an archive must be treated as exposed and rotated through its owner-controlled provider.

## Transfer decision rules

Each candidate must be recorded as one of:

- **KEEP** — equivalent current implementation already exists.
- **PORT** — behavior is valuable and missing; port through current architecture and tests.
- **REWRITE** — behavior is valuable but legacy implementation is incompatible or unsafe.
- **REJECT** — obsolete, duplicated, insecure, unlicensed, or irrelevant.
- **HOLD** — evidence is incomplete.

No legacy SQLite schema, generated runtime artifact, dependency directory, upload/user data, credentials, stale API contract, or unreviewed shell script may be copied into the production application. Preserve current PostgreSQL schemas and the separate main/store database boundary.

## Prisma workspace: observed state and implications

Read-only Prisma connector checks on 2026-10-27 found:

- Workspace: `Personal workspace` (`wksp_sikhfufb5ydpgt5pakar7acp`).
- Projects: 0.
- Prisma Postgres databases: none.
- Prisma Compute apps: 0.
- Object-store buckets: 0.
- GitHub App installations: 0.

The user-provided Console URL is consistent with a workspace identifier, but the connected workspace inventory does not show an application or database already provisioned. Do not assume the app's two existing PostgreSQL databases live in Prisma; the repo uses `DATABASE_URL` and `STORE_DATABASE_URL`, and their provider/endpoints must be identified from secure configuration without printing secrets.

**No Prisma project, database, connection string, bucket, or deployment was created.** Provisioning should wait until the hosting/database architecture is selected and cost, region, backup, and data-residency requirements are known.

## Prisma Accelerate retirement

Prisma's official documentation says Prisma Accelerate, including hosted Accelerate connections for Prisma Postgres, will retire on **2026-12-01**. This is a time-bound compatibility gate, not evidence that this application currently uses Accelerate.

Before any change:
1. Inspect dependency manifests, lockfile, generated client configuration, code imports, and connection-string *scheme only* (never print connection values).
2. Determine whether either database URL uses `prisma://` or `prisma+postgres://accelerate.prisma-data.net`.
3. If Accelerate is not used, record that evidence and do not migrate for the sake of the deadline.
4. If used, test the correct replacement for each database and runtime; preserve pooled connections under concurrency and account for loss of Accelerate query caching.
5. Verify backup/restore and both database clients against non-production data before proposing a cutover.

Official references:
- https://www.prisma.io/docs/accelerate
- https://www.prisma.io/docs/accelerate/keep-your-database
- https://www.prisma.io/docs/postgres/database/switch-from-accelerate

## Required next gates

1. Run archive extraction and secret scanning in an isolated, disposable workspace with no production credentials; record filenames and hashes, not secret values.
2. Produce a capability matrix from archive entry to current UI/API/service/model/tests and decision (KEEP/PORT/REWRITE/REJECT/HOLD).
3. Prioritize P0 security work tracked in issues #111 (AI provider boundary) and #112 (admin API authorization). Static scan counts are review queues, not vulnerability verdicts.
4. Keep each capability transfer small, contract-tested, and independently reviewable. Never transfer all files in one commit.
5. Only after database and hosting choices are evidence-backed, request explicit approval for any paid resource or production-affecting action.
