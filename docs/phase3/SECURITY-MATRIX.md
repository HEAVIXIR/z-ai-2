# HEAVIX — Phase 3 Security Matrix

**Source:** `src/lib/admin/production-readiness-gate.ts`
**Extracted:** 2026-10-20 (STEP 14.70-E4)
**Total gate items:** 74 (73 PASS + 1 PENDING; `MIG-05` is the pending item)

## Security-Relevant Controls

Security-relevant categories: RBAC, Audit, Security, PageBuilder (injection), E2E (admin access), Build/TS (@ts-nocheck)

| Gate ID | Category | Severity | Status | Title | Evidence |
|---|---|---|---|---|---|
| RBAC-01 | RBAC | CRITICAL | PASS | 71 permissions defined across 5 roles | src/lib/authorization/permissions.ts |
| RBAC-02 | RBAC | CRITICAL | PASS | No User.role fallback (isAdmin uses RBAC only) | src/lib/authorization/index.ts: isAdmin() |
| RBAC-03 | RBAC | HIGH | PASS | canBulkAction + canExport enforced | src/lib/authorization/index.ts |
| RBAC-04 | RBAC | HIGH | PASS | Resource-level access (canAccessResource) | src/lib/authorization/index.ts |
| RBAC-05 | RBAC | HIGH | PASS | Field-level authorization (applyFieldPolicy) | src/lib/admin/field-policy.ts |
| RBAC-06 | RBAC | CRITICAL | PASS | 63 RBAC matrix tests pass (allow + deny) | tests/contract/rbac-matrix.test.ts (63 tests) |
| AUDIT-01 | Audit | CRITICAL | PASS | AuditLog schema has before/after/reason | prisma/schema.prisma: AuditLog model |
| AUDIT-02 | Audit | CRITICAL | PASS | logAudit() helper matches HEAVIX AuditLog schema | src/lib/admin/audit.ts |
| AUDIT-03 | Audit | HIGH | PASS | auditMutation + requirePermissionAndAudit | src/lib/audit-foundation.ts |
| AUDIT-04 | Audit | HIGH | PASS | Page publish/rollback audited with before/after | src/app/api/admin/pages/[id]/{publish,rollback}/route.ts |
| AUDIT-05 | Audit | HIGH | PASS | All 8 action-engine processors log audit | src/lib/admin/action-engine.ts |
| PB-04 | PageBuilder | CRITICAL | PASS | validateLayout rejects SQL injection | tests/contract/page-builder.test.ts: SQL injection tests |
| CONTRACT-01 | E2E | CRITICAL | PASS | 373 resource contract tests pass | tests/contract/resource-contract.test.ts |
| CONTRACT-02 | E2E | CRITICAL | PASS | All 18 resources have list/view/create/edit/delete schema | tests/contract/resource-contract.test.ts: per-resource schema validation |
| SEC-01 | Security | HIGH | PASS | @ts-nocheck inventory: 55 files (all marked Owner=Migration) | 55 files with @ts-nocheck + Owner=Migration TODO |
| SEC-02 | Security | CRITICAL | PASS | No arbitrary SQL in page builder | validateLayout rejects SQL + tests |
| SEC-03 | Security | CRITICAL | PASS | No arbitrary JS eval in page builder | validateLayout rejects eval/( + tests |
| SEC-04 | Security | HIGH | PASS | z-ai-web-dev-sdk used server-side only | no client-side imports of z-ai-web-dev-sdk |
| SEC-05 | Security | HIGH | PASS | Field-level authorization separated from resource-level | src/lib/admin/field-policy.ts |
| E2E-01 | E2E | CRITICAL | PASS | Home page renders (HTTP 200) | dev.log: GET / 200 |
| E2E-02 | E2E | HIGH | PASS | /listings renders (HTTP 200) | dev.log: GET /listings 200 |
| E2E-03 | E2E | HIGH | PASS | Preview route requires admin | src/app/preview/page/[key]/page.tsx: isAdmin gate |
| E2E-04 | E2E | HIGH | PASS | Agent Browser smoke test of / route | agent-browser open http://localhost:81/ → snapshot showed HEAVIX logo, navigatio |
| BUILD-02 | Security | CRITICAL | PASS | No stale imports masked by @ts-nocheck at build time | 12 build errors fixed in 14.8-B (hasPermission/hasRole/findJob/cancelJob/retryJo |
| SMOKE-01 | E2E | CRITICAL | PASS | Production-build runtime: / returns 200 | node .next/standalone/server.js → curl http://localhost:81/ = HTTP 200 |
| SMOKE-02 | E2E | HIGH | PASS | Production-build runtime: /listings returns 200 | curl /listings = 200 |
| SMOKE-03 | E2E | HIGH | PASS | Production-build runtime: /brands returns 200 | curl /brands = 200 |
| SMOKE-04 | E2E | HIGH | PASS | Production-build runtime: /login returns 200 | curl /login = 200 |
| SMOKE-05 | E2E | CRITICAL | PASS | Admin routes redirect to /login (NOT 200) | 17 /admin/resources/* routes all return 307 → /login (no accidental 200 for unau |
| INT-02 | Audit | HIGH | PASS | Mutation path covered (Form → API → Permission → Field Policy → Mutation → Audit) | tests/contract/crud-pipeline.test.ts (28 PASS) + tests/contract/page-builder.tes |
| TS-01 | Security | CRITICAL | PASS | Universal Engine files have @ts-nocheck = 0 | src/app/api/admin/resources/[resource]/route.ts, src/components/admin/universal- |
| TS-02 | Security | HIGH | PASS | @ts-nocheck inventory classified (A/B/C) and frozen | docs/verification/ts-nocheck-inventory.md: 0 Class A (deletable), 52 Class B (ne |
| TS-03 | Security | MEDIUM | PASS | Total @ts-nocheck files: 52 (was 55) | Removed 3 Universal Engine files; 52 Class B files remain with V2.5 acceptance c |

## All Gate Items by Category

### Audit (6 items)

| Gate ID | Severity | Status | Title | Evidence |
|---|---|---|---|---|
| AUDIT-01 | CRITICAL | PASS | AuditLog schema has before/after/reason | prisma/schema.prisma: AuditLog model |
| AUDIT-02 | CRITICAL | PASS | logAudit() helper matches HEAVIX AuditLog schema | src/lib/admin/audit.ts |
| AUDIT-03 | HIGH | PASS | auditMutation + requirePermissionAndAudit | src/lib/audit-foundation.ts |
| AUDIT-04 | HIGH | PASS | Page publish/rollback audited with before/after | src/app/api/admin/pages/[id]/{publish,rollback}/route.ts |
| AUDIT-05 | HIGH | PASS | All 8 action-engine processors log audit | src/lib/admin/action-engine.ts |
| INT-02 | HIGH | PASS | Mutation path covered (Form → API → Permission → Field Policy → Mutation → Audit) | tests/contract/crud-pipeline.test.ts (28 PASS) + tests/contract/page-builder.tes |

### CRUD (8 items)

| Gate ID | Severity | Status | Title | Evidence |
|---|---|---|---|---|
| CRUD-01 | CRITICAL | PASS | 18 resources registered in registry | src/lib/admin/resource-index.ts |
| CRUD-02 | HIGH | PASS | Filter engine (14 operators) | src/lib/admin/query/filter-engine.ts |
| CRUD-03 | HIGH | PASS | Sort + pagination + search | src/lib/admin/query/{sort-engine,pagination-search}.ts |
| CRUD-04 | CRITICAL | PASS | Generic data adapter (no per-resource if/else) | src/lib/admin/data-adapter.ts |
| CRUD-05 | HIGH | PASS | Action engine (8 processors: publish/unpublish/feature/...) | src/lib/admin/action-engine.ts |
| CRUD-06 | HIGH | PASS | Bulk engine (batch=50, partial failure) | src/lib/admin/bulk-export-engine.ts |
| CRUD-07 | MEDIUM | PASS | Export engine (CSV + JSON) | src/lib/admin/bulk-export-engine.ts: executeExport |
| CRUD-08 | CRITICAL | PASS | 28 CRUD pipeline tests pass | tests/contract/crud-pipeline.test.ts (28 tests) |

### Documentation (6 items)

| Gate ID | Severity | Status | Title | Evidence |
|---|---|---|---|---|
| DOC-01 | MEDIUM | PASS | PostgreSQL setup guide | docs/database/POSTGRES-SETUP.md |
| DOC-02 | HIGH | PASS | Backup + restore runbooks | docs/database/POSTGRES-BACKUP.md + RESTORE.md |
| DOC-03 | HIGH | PASS | Categorized test report (V2.4) | docs/TEST-REPORT-V2.4.md |
| DOC-04 | HIGH | PASS | Legacy migration checklist documented | src/lib/admin/legacy-migration-checklist.ts |
| DOC-05 | MEDIUM | PASS | Worklog kept up to date | /home/z/my-project/worklog.md |
| MIG-08 | HIGH | PASS | Evidence Freeze document published (STEP-14.8-EVIDENCE.md) | docs/verification/STEP-14.8-EVIDENCE.md — 14 sections covering git anchor, DB ba |

### E2E (11 items)

| Gate ID | Severity | Status | Title | Evidence |
|---|---|---|---|---|
| CONTRACT-01 | CRITICAL | PASS | 373 resource contract tests pass | tests/contract/resource-contract.test.ts |
| CONTRACT-02 | CRITICAL | PASS | All 18 resources have list/view/create/edit/delete schema | tests/contract/resource-contract.test.ts: per-resource schema validation |
| E2E-01 | CRITICAL | PASS | Home page renders (HTTP 200) | dev.log: GET / 200 |
| E2E-02 | HIGH | PASS | /listings renders (HTTP 200) | dev.log: GET /listings 200 |
| E2E-03 | HIGH | PASS | Preview route requires admin | src/app/preview/page/[key]/page.tsx: isAdmin gate |
| E2E-04 | HIGH | PASS | Agent Browser smoke test of / route | agent-browser open http://localhost:81/ → snapshot showed HEAVIX logo, navigatio |
| SMOKE-01 | CRITICAL | PASS | Production-build runtime: / returns 200 | node .next/standalone/server.js → curl http://localhost:81/ = HTTP 200 |
| SMOKE-02 | HIGH | PASS | Production-build runtime: /listings returns 200 | curl /listings = 200 |
| SMOKE-03 | HIGH | PASS | Production-build runtime: /brands returns 200 | curl /brands = 200 |
| SMOKE-04 | HIGH | PASS | Production-build runtime: /login returns 200 | curl /login = 200 |
| SMOKE-05 | CRITICAL | PASS | Admin routes redirect to /login (NOT 200) | 17 /admin/resources/* routes all return 307 → /login (no accidental 200 for unau |

### Migration (7 items)

| Gate ID | Severity | Status | Title | Evidence |
|---|---|---|---|---|
| MIG-01 | CRITICAL | PASS | 104 legacy admin pages cataloged | src/lib/admin/legacy-migration-checklist.ts |
| MIG-02 | HIGH | PASS | Each page has legacyPath/resource/replacementPath/risk/owner | src/lib/admin/legacy-migration-checklist.ts: LegacyPageEntry |
| MIG-03 | HIGH | PASS | 60% of pages addressed (MIGRATED + KEEP_AS_IS + DEPRECATED) | migrationStats().progressPct = 60 |
| MIG-04 | HIGH | PASS | No HIGH-risk page left PENDING without owner | all HIGH-risk entries have owner field set |
| MIG-05 | MEDIUM | PENDING | 42 pages PENDING migration (post-launch) | migrationStats().pending = 42 |
| MIG-06 | HIGH | PASS | All 38 PENDING legacy pages have a frozen decision (KEEP_AS_IS / MIGRATE_TO_RESOURCE / MIGRATE_TO_PAGE_BUILDER / DEPRECATE) | docs/verification/legacy-migration-decisions.md: 27 MIGRATE_TO_RESOURCE, 4 MIGRA |
| MIG-07 | HIGH | PASS | Each PENDING page has resource replacement + owner + risk + blocking dependency + acceptance criteria | docs/verification/legacy-migration-decisions.md §2 — all 38 rows have all 5 fiel |

### PageBuilder (10 items)

| Gate ID | Severity | Status | Title | Evidence |
|---|---|---|---|---|
| PB-01 | HIGH | PASS | 10 widgets registered (code-defined, not DB) | src/lib/admin/page-builder/widget-registry.ts |
| PB-02 | HIGH | PASS | 7 data sources (API paths, not SQL) | src/lib/admin/page-builder/widget-registry.ts: DATA_SOURCES |
| PB-03 | CRITICAL | PASS | validateLayout rejects unknown widgets | tests/contract/page-builder.test.ts: "should reject unknown widget key" |
| PB-04 | CRITICAL | PASS | validateLayout rejects SQL injection | tests/contract/page-builder.test.ts: SQL injection tests |
| PB-05 | CRITICAL | PASS | validateLayout rejects JS / <script> | tests/contract/page-builder.test.ts: JS + script tag tests |
| PB-06 | CRITICAL | PASS | Preview = Production renderer (single PageRenderer) | src/components/page-renderer/page-renderer.tsx + tests/contract/page-builder.tes |
| PB-07 | CRITICAL | PASS | Rollback creates new version (immutable) | src/app/api/admin/pages/[id]/rollback/route.ts + GOLDEN INVARIANT tests |
| PB-08 | HIGH | PASS | Cache invalidation after publish + rollback | revalidatePath() in publish + rollback routes |
| PB-09 | HIGH | PASS | 34 page-builder regression tests pass | tests/contract/page-builder.test.ts (34 tests) |
| INT-01 | CRITICAL | PASS | All 18 resources verified end-to-end (Registry → Prisma → Columns → API → Route → Nav → DB) | scripts/verify-18-resources.ts: 18/18 PASS — 29 listings, 629 brands, 1 user pop |

### Performance (5 items)

| Gate ID | Severity | Status | Title | Evidence |
|---|---|---|---|---|
| PERF-01 | MEDIUM | PASS | Listings query < 200ms on home page | dev.log: GET / 385ms |
| PERF-02 | MEDIUM | PASS | Page renderer fetches with revalidate TTL | src/components/page-renderer/page-renderer.tsx: next.revalidate |
| PERF-03 | MEDIUM | PASS | Bulk action batch size 50 (memory-safe) | src/lib/admin/bulk-export-engine.ts: BATCH_SIZE=50 |
| BUILD-01 | CRITICAL | PASS | next build succeeds (production artifact) | docs/verification/STEP-14.8-EVIDENCE.md §9: bunx next build → exit 0, 62s, 406MB |
| BUILD-03 | HIGH | PASS | Static pages prerender successfully | Build output: 18 static (○) + ~80 dynamic (ƒ) routes — /community, /companies, / |

### RBAC (6 items)

| Gate ID | Severity | Status | Title | Evidence |
|---|---|---|---|---|
| RBAC-01 | CRITICAL | PASS | 71 permissions defined across 5 roles | src/lib/authorization/permissions.ts |
| RBAC-02 | CRITICAL | PASS | No User.role fallback (isAdmin uses RBAC only) | src/lib/authorization/index.ts: isAdmin() |
| RBAC-03 | HIGH | PASS | canBulkAction + canExport enforced | src/lib/authorization/index.ts |
| RBAC-04 | HIGH | PASS | Resource-level access (canAccessResource) | src/lib/authorization/index.ts |
| RBAC-05 | HIGH | PASS | Field-level authorization (applyFieldPolicy) | src/lib/admin/field-policy.ts |
| RBAC-06 | CRITICAL | PASS | 63 RBAC matrix tests pass (allow + deny) | tests/contract/rbac-matrix.test.ts (63 tests) |

### Schema (6 items)

| Gate ID | Severity | Status | Title | Evidence |
|---|---|---|---|---|
| SCHEMA-01 | CRITICAL | PASS | Prisma schema uses PostgreSQL provider | prisma/schema.prisma: provider="postgresql" |
| SCHEMA-02 | CRITICAL | PASS | 113 models defined (HEAVIX full schema) | prisma/schema.prisma line count + prisma db push |
| SCHEMA-03 | HIGH | PASS | binaryTargets includes debian-openssl-3.0.x | prisma/schema.prisma: binaryTargets=["native","debian-openssl-3.0.x"] |
| SCHEMA-04 | CRITICAL | PASS | All 113 tables created in PG | information_schema.tables count = 113 |
| SCHEMA-05 | HIGH | PASS | Data reconciled (5215+ rows, 74 tables) | scripts/migrate-pg-reconcile.ts |
| SCHEMA-06 | HIGH | PASS | Backup/restore docs published | docs/database/POSTGRES-BACKUP.md + POSTGRES-RESTORE.md |

### Security (9 items)

| Gate ID | Severity | Status | Title | Evidence |
|---|---|---|---|---|
| SEC-01 | HIGH | PASS | @ts-nocheck inventory: 55 files (all marked Owner=Migration) | 55 files with @ts-nocheck + Owner=Migration TODO |
| SEC-02 | CRITICAL | PASS | No arbitrary SQL in page builder | validateLayout rejects SQL + tests |
| SEC-03 | CRITICAL | PASS | No arbitrary JS eval in page builder | validateLayout rejects eval/( + tests |
| SEC-04 | HIGH | PASS | z-ai-web-dev-sdk used server-side only | no client-side imports of z-ai-web-dev-sdk |
| SEC-05 | HIGH | PASS | Field-level authorization separated from resource-level | src/lib/admin/field-policy.ts |
| BUILD-02 | CRITICAL | PASS | No stale imports masked by @ts-nocheck at build time | 12 build errors fixed in 14.8-B (hasPermission/hasRole/findJob/cancelJob/retryJo |
| TS-01 | CRITICAL | PASS | Universal Engine files have @ts-nocheck = 0 | src/app/api/admin/resources/[resource]/route.ts, src/components/admin/universal- |
| TS-02 | HIGH | PASS | @ts-nocheck inventory classified (A/B/C) and frozen | docs/verification/ts-nocheck-inventory.md: 0 Class A (deletable), 52 Class B (ne |
| TS-03 | MEDIUM | PASS | Total @ts-nocheck files: 52 (was 55) | Removed 3 Universal Engine files; 52 Class B files remain with V2.5 acceptance c |

## S1-S14 Note

The S1-S14 numbering was introduced in conversation (STEP 14.19) and does NOT exist in project documentation.
The project uses its own gate IDs: SCHEMA-01, RBAC-01, AUDIT-01, SEC-01, etc.
No S1-S14 controls were invented or assumed.

## Test Execution Status

Independent evidence: GitHub Actions CI run [39419476047](https://github.com/HEAVIXIR/z-ai-2/actions/runs/39419476047), PR #61 HEAD `a124ca430b004003080abdbaf541f6cb766e0e81`. The verify-job log confirms the listed tests below ran and passed in that run. This corroborates test execution only; it does **not** independently prove every production gate item or replace backup/restore rehearsal.

| Test | File | Status / Evidence |
|---|---|---|
| RBAC matrix (63 tests) | tests/contract/rbac-matrix.test.ts | PASS — CI log: 63 tests |
| Page builder (34 tests) | tests/contract/page-builder.test.ts | PASS — CI log: 34 tests |
| CRUD pipeline (28 tests) | tests/contract/crud-pipeline.test.ts | PASS — CI log: 28 tests |
| Order contract (15 invariants) | tests/contract/order-contract.test.ts | NOT VERIFIED in the cited log evidence |
| Payment contract (17 invariants) | tests/contract/payment-contract.test.ts | NOT VERIFIED in the cited log evidence |
| E2E smoke | tests/e2e/smoke.test.ts | PASS — CI log: 16 tests |
| RFQ integration (7 tests) | tests/integration/rfq-quote-visibility-real.test.ts | PASS — CI log: 7 tests; real PostgreSQL 17 service; 0 skipped for this file |

## Backup/Restore

- Backup docs: docs/database/POSTGRES-BACKUP.md
- Restore docs: docs/database/POSTGRES-RESTORE.md
- Latest backup referenced: heavix-20260924-110650.sql (616KB, 120 tables)
- Backup file on disk: NOT FOUND in this sandbox
- Restore rehearsal: NOT EXECUTED (no PostgreSQL available)
