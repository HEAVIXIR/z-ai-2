# HEAVIX — Legacy Archive Refresh and Platform Decision

**Audit date:** 2026-10-27  
**Legacy source:** [HEAVIXIR/z](https://github.com/HEAVIXIR/z), pinned tree `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`  
**Target baseline:** `z-ai-2/main` at `09cfcc7927f8e8f8b8400f62f47e97b6deba308e`  
**Evidence:** [Legacy archive inventory CI run](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40487144945), [vinext compatibility run on main](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40488370632).

## Executive decision

**Do not bulk-import the legacy ZIP contents.** The legacy repository is a bundle of overlapping snapshots, not a canonical source tree. The current repository already contains a file-level disposition register in `docs/legacy-parity/IMPORT-MANIFEST-2026-10-26.csv` and supporting decisions. The fresh scan strengthens the need to preserve those exclusions and review held candidates individually.

No legacy application files, environment values, database files, migration scripts, or asset-mutating scripts are approved by this refresh for direct import or execution. Any feature transfer must be a focused, tested PR against the current Main/Store schemas, API contracts, authentication, and RBAC.

## 1. Fresh read-only inventory

The CI job downloaded the public legacy repository to an ephemeral runner and inspected ZIP members through Python's ZIP reader. It did not extract or execute archived files.

| Measure | Result |
|---|---:|
| Root ZIP archives | 13 |
| Valid ZIP archives | 13 |
| Archive entries | 2,751 |
| File entries | 1,715 |
| Text files scanned | 1,652 |
| Code/config candidate rows | 576 |
| Credential-pattern hits | 17 |
| Sensitive-path review findings | 7 |
| Total review findings | 24 |
| Unsafe archive paths | 0 |
| Symlinks | 0 |

These are **archive-entry and scan counts**, not unique files or unique secrets. Full-project and per-directory ZIPs overlap, so repeated paths can produce repeated findings. A pattern hit is an indicator for human review, not proof that an active credential was exposed. The scanner deliberately records only archive, path, category, and line; it never places matched values in the report.

## 2. Security findings and disposition

The scan identified:
- a legacy `.env` entry and a credential-pattern hit in it;
- credential-like assignments in archived Compose configuration, authentication, middleware, admin UI, comparison code, documentation, and test documentation;
- several SQLite database and backup files inside legacy bundles;
- additional copies of database backups in the upload bundle.

**Required controls before any file transfer:**
1. Never copy the legacy `.env` or any credential value into the target repository, issue, PR, or build log.
2. Determine whether any flagged value was ever active. If confirmed active or exposed, rotate/revoke it at the issuing provider and review relevant access logs. This scan alone cannot establish current validity.
3. Do not import SQLite databases, snapshots, production-like data, workspace tarballs, generated clients, vendor/dependency bundles, or archived patch ZIPs.
4. Keep the existing file-level manifest as the authority for path disposition; update it only with evidence from an individual review.

## 3. Import decisions

| File category | Decision |
|---|---|
| Existing canonical docs and assets already present in current `main` | Do not duplicate; update the canonical file only if a substantive gap is proven |
| Legacy application routes and UI | Do not copy verbatim; port verified behavior to current route/API contracts with tests |
| Legacy Prisma schemas and migrations | Reject stale/parallel schema paths; preserve `prisma/schema.prisma`, `prisma/store/schema.prisma`, and their independent PostgreSQL migration histories |
| Seed, backfill, taxonomy rebuild, backup/restore, or logo-processing scripts | Hold/reject direct import; require a separate dry-run, idempotency, provenance, rollback, and authorization review |
| Secrets, dotenv files, database files, uploads, workspace artifacts, generated/vendor files | Exclude from application source |
| Read-only diagnostics | Consider only after type-safety, error transparency, data minimization, and current-schema compatibility are verified |

The existing repository already contains decisions for the 54 unique missing paths from the earlier path-level audit. This refresh does not overturn those decisions. In particular, a missing path or different hash is not evidence that its implementation is safe or needed.

## 4. Cloudflare / Next.js compatibility evidence

The report-only job on `main` at `09cfcc7927f8e8f8b8400f62f47e97b6deba308e` completed and uploaded artifact `vinext-compatibility-report-09cfcc7927f8e8f8b8400f62f47e97b6deba308e`.

The artifact reports:
- **91% compatible** according to the static vinext checker;
- 6/6 checked Next.js imports fully supported;
- 9/10 checked libraries compatible;
- `next-auth` flagged because it relies on Next.js API route internals;
- `__dirname` / `__filename` flagged in tooling and generated-client files;
- partial `reactStrictMode` support.

The job's exit code is deliberately report-only and does not prove runtime compatibility. This result does not validate login/session behavior, both PostgreSQL connections, image processing, persistent uploads, or backup/restore. It is not a production deployment gate by itself.

## 5. Prisma account and database architecture

The owner has identified an existing Prisma Console account. This audit did not inspect the account's projects, credentials, billing, or provisioned resources; account existence alone is not evidence of an active database or usable connection.

Prisma is a candidate to evaluate for managed PostgreSQL/connection management, subject to account access and cost verification. Preserve the application's two independent PostgreSQL connection contracts:
- `DATABASE_URL` for the Main Prisma schema;
- `STORE_DATABASE_URL` for the separate Store Prisma schema.

Before choosing Prisma Postgres, Accelerate, or Hyperdrive, verify supported deployment topology, TLS, connection limits, regional latency, backup/restore, pricing, and compatibility with both generated clients. Do not replace PostgreSQL with D1, point tests at production, create paid resources, or run migrations/data imports as part of this audit.

## 6. Release and migration gate

- [x] Pin legacy source and target baseline.
- [x] Scan all 13 ZIP archives without extraction or execution.
- [x] Record redacted security indicators and archive/database artifact paths.
- [x] Retrieve the real vinext compatibility artifact.
- [ ] Independently review any candidate credential and rotate only if exposure/active use is confirmed.
- [ ] Compare each proposed feature against current implementation and acceptance tests.
- [ ] Validate Main and Store against non-production PostgreSQL using least-privilege credentials.
- [ ] Run auth/RBAC, upload, API contract, and integration tests for each focused port.
- [ ] Reassess deployment adapter and managed database choice with cost and runtime evidence.

**Current disposition: NO-GO for production deployment, production DB mutation, backfill, Worker activation, and wholesale legacy import.** This document is an evidence refresh, not a release approval.
