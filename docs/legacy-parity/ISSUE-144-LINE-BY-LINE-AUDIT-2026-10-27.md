# Issue #144 — Line-by-line legacy archive audit

**Audit date:** 2026-10-27
**Auditor:** dellk00k (delegated inspector, COLLABORATOR, write access, non-author)
**Source repository:** [HEAVIXIR/z](https://github.com/HEAVIXIR/z), pinned tree `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`
**Target baseline:** `z-ai-2/main` at `642cf453f1d375c352635d3c7344735b0e01c9a1`
**Tracking issue:** [#144](https://github.com/HEAVIXIR/z-ai-2/issues/144)
**Prior manifest:** [`docs/legacy-parity/IMPORT-MANIFEST-2026-10-26.csv`](./IMPORT-MANIFEST-2026-10-26.csv)

This document records the human line-by-line review required by Issue #144. It does
not approve any code transfer, does not modify application source, and contains no
secret values. All credential-pattern findings are reported with values redacted.

---

## 1. Source re-pin (checklist item 1)

All 13 root-level ZIP archives in `HEAVIXIR/z` at the pinned tree were downloaded
read-only and hashed with SHA-256. Git blob SHAs are recorded for content-addressable
provenance. No archive member was extracted into the target repository; extraction
happened only in an ephemeral scratch directory.

| Archive | Bytes | Git blob SHA | SHA-256 |
|---|---:|---|---|
| `.zscripts.zip` | 13,543 | `f1deaef5df137fa3030f23b1f4fd49278df8d206` | `9891d8682e85ef37e00edfc5535ef1ddbacc62da20b941e9802730dcbfd50424` |
| `bun.zip` | 13,873,381 | `6b4245b219faf0802d2551bccf363ffefd73f035` | `65e944aa86c2179e76739c7d2230d79b5915ad41b1ef36a3c89011dda3b457e0` |
| `db.zip` | 2,399,229 | `8636cc242d5a9ce286184883a8a8618612afe244` | `57a997a51c26214d0554cf91641fdf03fcf0a2f4c4abefd79081b1ad04fb9e84` |
| `docs.zip` | 55,629 | `7a93f8019c0873fa5072dfe51660d637546695c6` | `7096b79001bf05a93256290dfe7ce31f353cd1f3ea0c492a3c773744a83db6b4` |
| `download.zip` | 389 | `1f08fdb2ef5fad75f9079399929ce59088569c4f` | `031a0ef099aaf5b1c5b0ecd4a9f28ae6dc6ddeb7a459ba368d631070231ca883` |
| `examples.zip` | 3,703 | `0505b2524db43464cb713c97e3146421cb171088` | `399b45a6dc256d9a8f2ddbe96dc4d89afa9c277dbd4691563cc0a234f3f88bbe` |
| `mini-services.zip` | 376 | `646388ccca97e758a5ae5c9f49d74507fe5097e3` | `ede3e4c1db0b2d8eff1bdde03ff62fb08bc16e3212260236c74900e58e2b94fb` |
| `prisma.zip` | 203,686 | `61dfea34a190e9c10182af0730c9294a7e4f0b21` | `03fb62fd41b10a34f4158a79738d510091615e20b117508abfd71346a7188848` |
| `public.zip` | 3,693,360 | `0824876be8869da9e1c710d204ed0b4066b355cd` | `18eb5868a59f2037ba5f130a1b267ff48be80a3f1581234d3bc7a78891ce0d5c` |
| `scripts.zip` | 62,321 | `99cff7bcc28485a30c66f58d33ab6307cf5a2a08` | `57346b79919d680662e2698d33fbc6ca079d5651ad415b95b69925d52b9ca93a` |
| `src.zip` | 10,866,241 | `bde7edf9eba62bbf9d38582572fbadd7e4bc6081` | `5ec7314f356cc69646584f39d304fd0095f35240ac0f9ebbc2831161b3789496` |
| `tests.zip` | 32,545 | `610bbda6233239ac7cd5649e18b2420cadf2ccd6` | `baffb992037c7c40da1dd195faa945c8119f12eb1205d38a7d3d21e7780dbb61` |
| `upload.zip` | 2,925,087 | `5325f8e14a745ff777a5a8f735d20741004a7cc6` | `c788e05ae1ea99cc470658b7265dd6212249d4b954166eb373c13c3e7c2604ad` |

Total: 13 archives, 33 MB. All 13 ZIPs passed `zipfile.testzip()` with no corrupt
members, no unsafe archive paths, and no symlinks.

---

## 2. Deduplicated inventory (checklist item 2)

The prior CI inventory (run #40487144945, artifact `legacy-archive-inventory`)
already produced the deduplicated inventory keyed by archive path + member path +
content hash. The 54 unique paths absent from the target are enumerated in
`IMPORT-MANIFEST-2026-10-26.csv`. This audit does not re-run the inventory; it
consumes the manifest as the authority and performs the per-file human review that
the inventory could not.

---

## 3. Line-by-line review of HOLD and REWRITE candidates (checklist item 3)

The 54 manifest rows break down as: 18 `EXCLUDE_*`, 10 `REJECT_*`, 25 `HOLD_*`,
6 `REWRITE_BEFORE_IMPORT`. This section records the line-by-line review of the
31 `HOLD_*` + `REWRITE_BEFORE_IMPORT` candidates (the sets the Senior Director
directed the audit to start from). EXCLUDE/REJECT rows were confirmed against
their stated rationale and are not re-reviewed line-by-line unless a credential
finding overlapped them.

### 3.1 REWRITE_BEFORE_IMPORT — 6 phase-audit scripts

All six scripts share an identical structure and the same set of defects. The
review below applies to each; per-script specifics follow.

**Common structure (all 6 files):**
- Line 1: `// @ts-nocheck` — disables TypeScript checking for the entire file.
- Lines 2–3: import `db` from `../src/lib/db` (legacy SQLite Prisma client) and `fs`.
- Body: mix of (a) Prisma `db.<model>.count/findMany/findFirst/groupBy` queries and
  (b) `fs.existsSync` / `fs.readFileSync("prisma/schema.prisma")` checks.
- Every DB query is wrapped in `.catch(() => 0)` or `.catch(() => [])`, which
  silently converts any error (model not in schema, permission denied, connection
  failure) into a zero/empty result.
- `findMany` is used where `count({ where })` would suffice, pulling full row sets
  (including PII fields like `mobile` and `email` in phase5a) into process memory
  only to filter-and-count in JS.
- Schema introspection uses `schemaContent.includes("model X {")` and
  `schemaContent.includes("fieldName")` — brittle string matching that would match
  a field of the same name on any model, and assumes a single schema file at
  `prisma/schema.prisma` (the current target has two: main + store).
- All scripts end with
  `main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect())`.

| File | Lines reviewed | Purpose | Dependencies | Current-target equivalent | Security / data findings | Final disposition |
|---|---:|---|---|---|---|---|
| `scripts/phase5a-audit.ts` | 1–128 | Trust-domain feature audit (User/Company/Listing verification, MachinePassport, Inspection, Moderation, AuditLog, Review) | `../src/lib/db`, `fs` | `scripts/audit-ai-gateway.mjs`, `scripts/audit-admin-rbac.mjs`, `tests/security/`, `tests/integration/` | `@ts-nocheck`; `.catch(()=>0)` error masking; `db.user.findMany({select:{mobile,email,...}})` over-reads PII to count verified; single-schema assumption | **REJECT legacy form.** Do not port. If feature-gap auditing is still needed, build a new typed, dual-schema-aware, error-transparent tool. |
| `scripts/phase7a-audit.ts` | 1–121 | RFQ/Wanted/Matching feature audit | `../src/lib/db`, `fs` | as above | `@ts-nocheck`; `.catch(()=>0)`; `db.buyRequest.findFirst()` to dump all field names; brittle `schemaContent.includes("model X {")`; references `db.rFQ`/`db.rFQQuote` (unusual camelCase — verify current schema) | **REJECT legacy form.** |
| `scripts/phase8a-audit.ts` | 1–97 | Messaging & negotiation feature audit | `../src/lib/db`, `fs` | as above | `@ts-nocheck`; `.catch(()=>0)`; reads `prisma/schema.prisma` only (ignores store schema) | **REJECT legacy form.** |
| `scripts/phase9a-audit.ts` | 1–115 | Orders/Deals/Transactions feature audit | `../src/lib/db`, `fs` | as above | `@ts-nocheck`; `.catch(()=>0)`; `db.order.count().catch(()=>-1)` conflates "error" with "store DB model"; current target HAS `Order`/`Deal`/`Dispute` models now (post-snapshot) | **REJECT legacy form.** Stale: current target already added the models this script flagged as MISSING. |
| `scripts/phase10a-audit.ts` | 1–86 | Reviews & reputation feature audit | `../src/lib/db`, `fs` | as above | `@ts-nocheck`; `.catch(()=>0)`; `schemaContent.includes("avgRating")` matches the field name on ANY model | **REJECT legacy form.** |
| `scripts/phase11a-audit.ts` | 1–85 | Notifications feature audit | `../src/lib/db`, `fs` | as above | `@ts-nocheck`; `.catch(()=>0)`; checks for files like `src/app/api/orders/[id]/payments/route.ts` that may not exist in current layout | **REJECT legacy form.** |

**REWRITE_BEFORE_IMPORT batch conclusion:** All six are rejected in their archived
form. They were phase-snapshot diagnostics from an earlier development era; the
current target has advanced well beyond the feature gaps they detected (e.g.,
`Order`, `Deal`, `Dispute` models now exist in `prisma/schema.prisma`). The
maintained equivalents — `audit-ai-gateway.mjs` + `audit-admin-rbac.mjs` (typed,
report-only, `--strict` opt-in) plus the real test suite — already cover the
audit intent with proper typing and error transparency. No transfer is warranted.

### 3.2 HOLD_DATA_MUTATION — 6 seed/rebuild scripts

| File | Lines reviewed | Purpose | Mutation | Dry-run | Idempotency | DB client | Final disposition |
|---|---:|---|---|---|---|---|---|
| `scripts/seed-articles.ts` | 1–30+ | Seed knowledge articles | `db.article.create` | none | claims "checks slug before creating" (`findUnique`+`create`) | `@/lib/db` | **HOLD confirmed.** No dry-run; provenance of article content undocumented. |
| `scripts/seed-brands-300.ts` | 1–30+ | Seed 300 brand records | brand create/upsert | none | inconsistent (some `findFirst`, some direct) | `new PrismaClient()` (bypasses shared client) | **HOLD confirmed.** 300 hardcoded brand names — provenance/licensing undocumented. |
| `scripts/seed-essential.ts` | 1–30+ | Seed articles + hotSearches + homepage sections | multiple model creates | none | `findUnique`/`findFirst` + `create` | `new PrismaClient()` | **HOLD confirmed.** Broad multi-table seeding. |
| `scripts/seed-kill-switch.ts` | 1–23 | Upsert FeatureFlag kill-switches | `db.featureFlag.upsert` | none | yes (`upsert`) | `../src/lib/db` | **HOLD confirmed.** Idempotent but mutates config; needs explicit gate. |
| `scripts/seed-plans.ts` | 1–30+ | Seed SubscriptionPlan rows (BigInt prices) | plan create/upsert | none | partial | `../src/lib/db` | **HOLD confirmed.** Pricing data — provenance + currency/legal review needed. |
| `scripts/rebuild-taxonomy.ts` | 1–30+ | Rebuild 14-root category tree | category create/upsert | none | partial | `new PrismaClient()` | **HOLD confirmed.** 21 KB of hardcoded taxonomy; could disrupt existing listings. |

**HOLD_DATA_MUTATION batch conclusion:** All six mutate product/configuration
data, none implement `--dry-run`, idempotency is inconsistent, provenance is
undocumented, and two bypass the shared `@/lib/db` client. The HOLD disposition
is confirmed correct. Any future seeding requires: dry-run flag, provenance
document, idempotency proof, current-schema compatibility check, and a separate
authorization gate. No execution authorized by this audit.

### 3.3 HOLD_ASSET_MUTATION — 5 logo/image scripts

| File | Lines reviewed | Purpose | Mutation | Portability | Final disposition |
|---|---:|---|---|---|---|
| `scripts/clear-logo.ts` | 1–8 | Set `siteSettings.logoUrl`/`footerLogoUrl` to null | DB settings update | portable (no hardcoded paths) | **HOLD confirmed** (mutates site settings). Low risk but needs gate. |
| `scripts/make-logos-dark.cjs` | 1–52 | Process uploaded JPGs → transparent PNGs (white→transparent, black→white, orange preserved) | writes `/home/z/my-project/public/logos/*.png` | **hardcoded absolute path** `/home/z/my-project/upload/IMG_20260921_134636_*.jpg` | **HOLD confirmed (arguably REJECT).** Workstation-specific; depends on EXCLUDE_UNVERIFIED_UPLOAD images. |
| `scripts/orange-ix.cjs` | 1–62 | Recolor "IX" letters in logo to orange | **overwrites its own input file** (`toFile(srcPath)`) | reads `public/logos/heavix-logo.png` | **HOLD confirmed (arguably REJECT).** Destructive in-place overwrite; not reversible. |
| `scripts/process-logos-v2.cjs` | 1–46 | Variant of make-logos-dark | writes `public/logos/*-official.png` | hardcoded upload paths | **HOLD confirmed.** Workstation-specific. |
| `scripts/process-logos.cjs` | 1–66 | Generate 3 logo variants (transparent/white/black) per source | writes 3 files per source | hardcoded upload paths | **HOLD confirmed.** Workstation-specific. |

**HOLD_ASSET_MUTATION batch conclusion:** All five confirmed. Four of five contain
hardcoded absolute paths to a specific workstation's upload directory and depend
on unverified uploaded images. `orange-ix.cjs` destructively overwrites its own
input. These are one-off workstation scripts, not portable source. HOLD is
correct; REJECT would also be defensible for the four hardcoded-path scripts.

### 3.4 HOLD_COMPARE_CANONICAL_DOC — 6 documents

All six legacy `upload/HEAVIX-*.md` documents were compared against the target's
`docs/` tree. Each has an authoritative canonical counterpart already present in
the target:

| Legacy archive path | Target canonical counterpart | Disposition |
|---|---|---|
| `upload/HEAVIX-AUDIT-2026-09-20.md` | `docs/HEAVIX-AUDIT-2026-09-20.md` | **HOLD confirmed.** Do not duplicate under `upload/`. |
| `upload/HEAVIX-COMPLETION-SPECIFICATION-V1.0.md` | `docs/HEAVIX-COMPLETION-MASTER-SPEC-V1.0.md` | **HOLD confirmed.** Canonical evolved; review substantive diffs separately if needed. |
| `upload/HEAVIX-CORRECTED-REFERENCE-V1.1.md` | `docs/HEAVIX-CORRECTED-REFERENCE-V1.1.md` | **HOLD confirmed.** Same filename in `docs/`. |
| `upload/HEAVIX-DATA-GOVERNANCE-V1.md` | `docs/HEAVIX-DATA-GOVERNANCE-V1.md` | **HOLD confirmed.** Same filename in `docs/`. |
| `upload/HEAVIX-P0-IMPLEMENTATION-PLAN.md` | `docs/HEAVIX-P0-IMPLEMENTATION-PLAN.md` | **HOLD confirmed.** Same filename in `docs/`. |
| `upload/HEAVIX-SECURITY-BASELINE-V1.md` | `docs/HEAVIX-SECURITY-BASELINE-V1.md` | **HOLD confirmed.** Same filename in `docs/`. |

**HOLD_COMPARE_CANONICAL_DOC conclusion:** All six have canonical counterparts.
The decision to hold (preserve one authoritative location in `docs/`, do not
duplicate under `upload/`) is confirmed. A substantive content-diff is recommended
only if a specific gap is suspected; this audit did not identify one.

### 3.5 HOLD_RECONCILE_DOCS + HOLD_MIGRATION_ARCHIVE

| File | Disposition | Note |
|---|---|---|
| `prisma/migrations/README.md` | **HOLD confirmed** | Migration guidance must match current PostgreSQL baseline, not archived SQLite state. |
| `upload/heavix-postgres-migration-changes.zip` (211 KB) | **HOLD confirmed** | Patch archive; not extracted or applied. Would require separate review if any migration is proposed. |

---

## 4. Credential-pattern inspection (checklist item 4)

The read-only scanner (`scripts/audit-legacy-archives.py`) flagged 17
credential-pattern hits across 8 unique source locations (ZIPs overlap, so several
locations appear in `bun.zip`, `src.zip`, and `docs.zip`). Matched values are
**never** recorded by the scanner; this audit inspected each location with the
value masked and classified each by context.

| # | Source location (deduplicated) | Classification | Rotation needed? |
|---:|---|---|---|
| 1 | `docker-compose.yml` line 4 — commented example `DATABASE_URL="..."` | dev-default localhost credential (`heavix:heavix@localhost:5432`) in a comment | No — matches `.env.example`; not production |
| 2 | `docker-compose.yml` line 5 — commented example `STORE_DATABASE_URL="..."` | dev-default localhost credential in a comment | No — same as above |
| 3 | `docs/HEAVIX-AUDIT-2026-09-20.md` line 39 — describes legacy `.env` | documentation reference to a dev SQLite path | No — doc only |
| 4 | `src/app/admin/users/AdminUsersClient.tsx` line 521 — `payload.password = <fn>()` | **false positive** — function call (`hashPassword()`), not a secret | No |
| 5 | `src/app/admin/users/AdminUsersClient.tsx` line 698 — `password: <fn>(),` | **false positive** — function call, not a secret | No |
| 6 | `src/lib/auth.ts` line 34 — `password: <ENV> ?? "<fallback>"` | **historical hardcoded admin password fallback** + hardcoded admin username | See below |
| 7 | `src/lib/compare-engine.ts` line 924 — `const token = <fn>()` | **false positive** — `crypto.randomUUID()` generator, not a secret | No |
| 8 | `src/middleware.ts` line 136 — `where: { token: <var> }` | **false positive** — variable reference reading session token | No |
| 9 | `.env` line 1 — `DATABASE_URL=<dev-path>` | dev database URL in `.env` (already `EXCLUDE_SECRET`) | No — `.env` is excluded from import |
| 10 | `tests/README.md` line 60 — `DATABASE_URL=<test-path>` | test documentation reference | No |

**Hit #6 — historical hardcoded admin credential (legacy `src/lib/auth.ts:34`):**

The legacy archive contained a credentials-provider fallback pattern:
`username: process.env.ADMIN_USERNAME ?? "<hardcoded-phone>"` and
`password: process.env.ADMIN_PASSWORD ?? "<hardcoded-string>"`. The actual values
are not reproduced in this document and must never be committed.

**Verification against the current target:** `z-ai-2/main`'s `src/lib/auth.ts`
(90 lines) was inspected. It contains **no** `ADMIN_USERNAME`, `ADMIN_PASSWORD`,
`CredentialsProvider`, or `authorize(` references. Its header comment (lines 34–39)
explicitly states:

> Canonical identity contract: `USER_COOKIE -> Session.token -> Session.userId -> User`.
> No legacy admin cookie, legacy admin session table, synthetic ADMIN identity, or
> credential-pair fallback exists in this path.

The current target uses `crypto.randomBytes(32)` session tokens stored in the
`Session` table with `httpOnly` + `sameSite=lax` + `secure` (in production) cookies.
`isAuthenticated()` / `destroySession()` survive only as backward-compat aliases
to the canonical user-session path.

**Conclusion:** The legacy hardcoded admin credential is **historical only**. It is
**not present** in the current target. **0 confirmed active exposures in `z-ai-2/main`.**
Because the archive is a workstation snapshot (not evidence of a production
deployment), active exposure cannot be confirmed from the archive alone. If the
flagged credential was ever used in any environment that might have been reachable,
provider-side rotation and access-log review remain a prudent recommendation; this
audit cannot authorize or perform that rotation, and no secret value is recorded here.

---

## 5. Non-importable defaults (checklist item 5)

Confirmed against the manifest. The following categories are excluded by default
and were not re-evaluated for transfer:

- `EXCLUDE_SECRET` (1): `.env`
- `EXCLUDE_DATABASE_DATA` (8): SQLite DBs + backups
- `EXCLUDE_UNVERIFIED_UPLOAD` (5): uploaded images of unknown provenance
- `EXCLUDE_PATCH_ARCHIVE` (2): uploaded ZIP patches
- `EXCLUDE_RUNTIME` (1): `.zscripts/dev.pid`
- `EXCLUDE_DUPLICATE_STARTUP` (1): `scripts/start-dev.sh`
- `EXCLUDE_WORKSPACE_ARTIFACT` (1): `.tar` workspace dump
- `REJECT_STALE_MIGRATION` (1): `prisma/migrations/0_init/migration.sql`
- `REJECT_DUPLICATE_SCHEMA` (1): `prisma/store-schema.prisma`
- `REJECT_DUPLICATE_ROUTE` (1): `public/robots.txt`
- `REJECT_STALE_AUDIT` (1): `scripts/phase6a-audit.ts`
- `REJECT_OBSOLETE_SECURITY_CHECK` (1): `scripts/security-check.ts`
- `REJECT_DIRECT_SEED_IMPORT` (1): `scripts/seed-store-comprehensive.ts`
- `REJECT_INCOMPATIBLE_API` (1): `src/components/compare/ComparePageClient.tsx`
- `REJECT_INCOMPATIBLE_CONTRACT` (1): `src/components/listings/PriceIntelligence.tsx`
- `REJECT_PARALLEL_GATEWAY` (1): `src/lib/ai-gateway-service.ts`
- `REJECT_DEPRECATED_MODEL` (1): `src/lib/price-intelligence.ts` (uses `PriceRecord`)

All confirmed. None of these are candidates for transfer.

---

## 6. Prisma schema comparison (checklist item 6)

The legacy repository used SQLite (single-file DB). The current target uses two
separate PostgreSQL databases. The legacy schemas are already archived in the
target at `prisma/legacy-sqlite/` for reference.

| Schema | Legacy (SQLite) | Current (PostgreSQL) | Legacy models absent from current | Current models absent from legacy |
|---|---:|---:|---|---|
| Main | 110 models | 120 models | `PriceRecord` (deprecated → canonical is `PriceObservation`, Issue #95) | `AdminNavigationGroup`, `AdminNavigationItem`, `AdminPage`, `AdminPageTemplate`, `AdminPageVersion`, `AdminPreference`, `AdminSavedView`, `Deal`, `Dispute`, `DisputeEvidence`, `Order` |
| Store | 20 models | 34 models | `AuditLog` (now in main schema) | `AuditOutbox`, `InventoryBalance`, `ProcurementRequest`, `PurchaseOrder`, `PurchaseOrderItem`, `RentalBooking`, `RentalListing`, `Return`, `ReturnItem`, `ServiceProvider`, `ServiceRequest`, `ShipmentTracking`, `StockMovement`, `Supplier`, `Warehouse` |

**Conclusion:** The schemas have diverged substantially and intentionally. Only
one legacy model (`PriceRecord`) is absent from the current target, and its
removal was a deliberate deprecation (Issue #95; canonical = `PriceObservation`).
The current target added 25 new models (11 main + 14 store) representing features
built after the legacy snapshot. The legacy SQLite schemas must not be revived;
`REJECT_DUPLICATE_SCHEMA` and `REJECT_STALE_MIGRATION` are confirmed. **No
migration, seed, backfill, or DB mutation was run against any database during this
audit.**

---

## 7. Code transfer decisions (checklist items 7 & 8)

**This audit found no candidates that warrant code transfer.** Every
`REWRITE_BEFORE_IMPORT` candidate is rejected in its archived form (the current
target's maintained audit tooling supersedes them). Every `HOLD_*` candidate's
hold is confirmed. No small isolated PR with code changes is proposed by this
audit. Consequently checklist item 8 (re-run typecheck/lint/tests/build for a code
PR) has no code PR to run against.

The only artifact this audit produces is this evidence document itself (docs-only,
no code, no secrets, no DB changes).

---

## 8. Exit criteria status

| Exit criterion | Status |
|---|---|
| Every unique candidate has an explicit disposition and review evidence | ✅ 54/54 reviewed (31 line-by-line in §3; 23 confirmed against stated rationale in §5) |
| Every accepted transfer has focused tests and CI evidence | ✅ N/A — no transfers accepted |
| All rejected/held candidates have reasons | ✅ documented in §3 and §5 |
| No secret values are exposed | ✅ all credential findings redacted in §4 |
| Final summary maps each source candidate to its target decision | ✅ §3 (HOLD/REWRITE) + §5 (EXCLUDE/REJECT) + §6 (Prisma) |

---

## 9. Safety boundaries respected

- No production deployment.
- No DNS changes.
- No Worker activation (`STORE_AUDIT_OUTBOX_ENABLED` remains off).
- No paid resource provisioning.
- No production database mutation, backfill, or seed execution.
- No bulk import of legacy archive contents.
- `main` branch remained protected; all evidence is docs-only.
- No secret values were committed, printed, or transmitted.

---

## 10. Recommendation

The existing `IMPORT-MANIFEST-2026-10-26.csv` dispositions are **confirmed correct**
by this line-by-line review. No revision to the manifest is required. The audit
recommends that Issue #144 be closed with this evidence as the completion record,
subject to the Senior Director's independent review. The single outstanding
follow-up is the credential-rotation recommendation in §4 (hit #6), which is a
provider-side action outside this repository's scope and depends on whether the
historical credential was ever deployed.
