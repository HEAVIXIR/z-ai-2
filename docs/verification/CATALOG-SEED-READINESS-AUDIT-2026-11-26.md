# Catalog Seed Readiness Audit — 2026-11-26

## Scope and safety

Read-only inspection of the Integration branch:
`integration/preview-readiness-workerd-2026-11-15`.

Preview diagnostics run `45771289138` completed successfully and confirmed:
- App Preview: 14 successful migrations; 0 unfinished; 0 rolled back.
- Store Preview: 3 successful migrations; 0 unfinished; 0 rolled back.
- Catalog data gaps: ProductModel 0, AttributeDefinition 0, AttributeOption 0, CategoryAttribute 0, Country/Province/City 0.
- Category rows exist (279), but no active CategoryAttribute links were found.

No database writes, migrations, deploys, or seed executions were performed as part of this audit.

## Findings

### F1 — Seed scripts exist; Preview data is absent (high confidence)

The repo has several candidate seed programs, but the CI seed stage only invokes:
- `seed-brands-a.ts`
- `seed-brands-b.ts`
- `seed-user-roles`
- `seed-test-fixtures`

It does not invoke the canonical taxonomy, dynamic attribute, catalog-model, product, or location seeds. This explains why the Preview database may have a healthy schema but empty Catalog entities. CI's seed target is the disposable `heavix_test` database and is not evidence that Preview has been seeded.

### F2 — Multiple overlapping ProductModel/Product seed implementations (high risk)

Reviewed:
- `prisma/seed-catalog.ts`: 35 ProductModels across 9 brands; natural-key upserts; product/attachment/part/compatibility seeds. It requires `--apply` and `HEAVIX_ENV=preview`, but does **not** pin/verify the exact Preview database identity before writing.
- `prisma/seed-phase2-catalog-core.ts`: creates another model set with a different slug convention and adds products; links unlinked Listings to the first product found by brand. No explicit Preview identity guard was found.
- `prisma/seed-phase3-catalog.ts`: overlapping Product data, location records and compatibility edges; no explicit Preview identity guard was found in the reviewed script.

These are not interchangeable canonical import paths. Running more than one without reconciliation can create duplicate model/product records or unintended Listing links.

### F3 — Dynamic attribute catalog is guarded, but is legacy/overwrite mode (high risk)

`prisma/seed-attribute-catalog.ts` requires both `--legacy-overwrite` and `--confirm-legacy-overwrite`, plus `HEAVIX_ENV=preview`. It explicitly states that it is not canonical bootstrap and directs operators to category-specific and service/mineral attribute seeds.

The script upserts AttributeDefinitions and CategoryAttribute links, and applies metadata fixups to existing AttributeDefinitions. It does not pin the exact Preview DB identity. Do not run this as the first/automatic seed.

### F4 — Taxonomy seed has significant reconciliation behavior (high risk)

`prisma/seed-taxonomy-v11.ts` creates TransactionType, ServiceType, ApplicationIndustry, Category tree, and Iran locations. It upserts category rows by slug and **reparents/recanonicalizes matching legacy category rows** (parentId/level/taxPath), and may correct a legacy province spelling. This is more than additive data import. The reviewed runner has a check-only mode, but no exact Preview database identity guard was found.

### F5 — Location import has the strongest safety contract (positive finding)

`scripts/geospatial/seed-iran-location-catalog.ts` defaults to dry-run without opening a DB connection. Apply requires explicit flags and Preview-only environment approvals, exact App Preview database OID + PostgreSQL system identifier verification, a SHA-256 verified dataset/manifest, and approved rights metadata. The committed manifest records APPROVED project authorization while retaining upstream GPL-3.0 attribution/license metadata.

Canonical dataset is 1 country, 31 provinces, 1,479 distinct cities. Prefer this guarded import path over the smaller legacy location seeds. Avoid running `seed-phase3-catalog.ts` or `seed-taxonomy-v11.ts` for locations until the overlapping sources and merge rules are reconciled.

### F6 — Phase 3 seed has a role-assignment hazard (high risk)

`prisma/seed-phase3-catalog.ts` selects `db.user.findFirst()` and assigns ADMIN to that first user when a role/user is found. This is nondeterministic/unsafe in a populated environment and must not be run against Preview as-is. It also uses a small hard-coded location subset and overlaps the catalog products.

### F7 — Phase C fixture seed is test-only (positive finding)

`prisma/seed-phase-catalog.ts` calls `assertTestSeedTarget` before writes and uses deterministic `phase-cat-` fixture keys. It is intended to repair phase contract-test fixtures, not seed the Preview Catalog.

## Recommended parallel workstreams (audit-first; no DB writes)

1. **Seed inventory + dependency graph:** consolidate scripts, identify one canonical owner for each entity, map dependencies and duplicate source sets.
2. **Catalog reconciliation:** compare the 35-model `seed-catalog.ts` set, Phase 2 and Phase 3 model/product sets by normalized (brand, model) and product natural key; produce duplicate/slug/link conflict report.
3. **Attribute catalog review:** identify the canonical category-specific/service/mineral attribute seeds; map coverage to current 279 categories without running legacy overwrite.
4. **Taxonomy reconciliation:** diff current 279 Category rows against taxonomy V1.1 plan; list reparenting, legacy rows, and any destructive/semantic changes for approval.
5. **Location source verification:** use the hash-verified 1,479-city dataset and guarded import plan; keep location writes isolated from other seeds.
6. **Seed safety engineering:** propose a Preview-only orchestrator with dry-run default, explicit apply confirmation, exact database OID/system identifier pinning, transactional batches, report-before-write, and post-seed read-only verification. Add CI tests to prove wrong DB identities fail closed.

## Execution gate

Do not execute seeds or mutate App Preview/Store Preview in this audit. Before a write phase, present the exact seed order, entity counts, reconciliation conflicts, target DB identity, rollback/recovery plan, and expected diff; then obtain explicit approval.
