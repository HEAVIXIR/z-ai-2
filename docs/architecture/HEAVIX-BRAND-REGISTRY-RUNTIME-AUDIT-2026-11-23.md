# HEAVIX Global Brand Registry — Runtime Audit

**Date:** 2026-11-23  
**Branch:** `fix/global-brand-registry-unification`  
**Baseline:** `integration/preview-readiness-workerd-2026-11-15`  
**Status:** Source audit and code corrections prepared; pending CI/review. No seed, migration, Preview DB mutation, merge, or deployment was performed.

## 1. Canonical contract

The accepted decision in `ADR-001-global-brand-catalog.md` is the source of truth:

- A Brand is a canonical global entity, independent of the selected category.
- Category/industry links are optional descriptive and ranking metadata, never a visibility gate in the public picker.
- Users may select an existing active Brand but must not create one by typing arbitrary text.
- Brand creation, verification, merging, deactivation, and enrichment belong to authorized admin/owner workflows.
- ProductModel is separate from Brand. The listing wizard may store a free-text model name without automatically creating a canonical ProductModel.
- Persian and English names and aliases must use the shared normalizer.

The Prisma model supports these boundaries with `Brand`, `BrandAlias`, `BrandIndustry`, `BrandCategory`, `BrandDomain`, `BrandFamily`, and `ProductModel`.

Two different relationships must remain distinct:
- `BrandFamily`: corporate/group family membership.
- `parentBrandId`: a direct brand/sub-brand relationship.

Neither relationship is a category hierarchy.

## 2. Seed-source audit (not a live database count)

The Preview seed runbook records the following source inventory:

- Phase A: 197 brand object rows.
- Phase B: 433 brand object rows.
- Combined: 630 source rows and 605 unique canonical slugs after English-name slugification; 24 slug values repeat (25 extra rows).
- The legacy/demo `prisma/seed.ts` contains 45 demo brands, 8 of which are not in Phase A/B. It is not a canonical parity source.
- Phase A defines 39 industries and 18 BrandFamily entries.
- Historical records such as Joy, P&H, LeTourneau, and Bucyrus are explicitly marked `LEGACY`.

These are source-code counts documented in `docs/operations/HEAVIX-PREVIEW-SEED-RUNBOOK.md`, **not a fresh query of the current Preview database**. The actual Preview brand count, alias collisions, family assignments, and category-link completeness remain unverified until a safe read-only database audit is available.

The seed scripts are additive/idempotent by slug, add aliases and industry links, and preserve curated identity fields on existing brands unless `refreshIdentity` is explicitly enabled. They require `--apply` and `HEAVIX_ENV=preview`. Do not run them without the documented paired encrypted Preview backup and exact target validation.

## 3. Runtime defects found and corrections prepared

### 3.1 Listing wizard brand picker

**Before:** the Step 3 picker only displayed a message when the field was focused empty. Search began only after typing. This behaved unlike a selectable drawer and made the central bank appear unavailable until the user guessed a query.

**Correction:** opening the empty picker requests up to 20 curated active suggestions; typing continues to search the full global registry. No category constraint is sent. The model remains a separate free-text field after Brand selection.

**Legacy behavior:** the search service and listing-create API previously required both `active=true` and `status=ACTIVE`. That hid active `LEGACY`, `HISTORICAL`, and `DISCONTINUED` brands even though the Brand record remained active and the catalog explicitly retains historical manufacturers. The active boolean is now the availability gate; status remains descriptive and is labeled in the picker. Records with `active=false` remain unavailable. Homepage trust curation remains restricted to `status=ACTIVE`.

### 3.2 Admin brand center

**Before:** the canonical list page linked “new brand” to `/admin/brands/new`, whose placeholder redirected back to the list. The actual create page is `/admin/taxonomy/brands/new`.

**Correction:** the action now points to the canonical taxonomy create page. Admin list search now includes normalized aliases, not only Persian/English canonical names.

The shared BrandManagementNav already presents the central management concept across:
- canonical brand records;
- BrandFamily and direct parent/child relationships;
- homepage display curation.

### 3.3 Homepage brand discovery

**Before:** the homepage suppresses the old duplicate `brands` section and renders `trusted-brands` as its canonical brand display, but ticker chips sent users to `/listings?brand=...` rather than the canonical brand profile. The “all brands” action also went to listings rather than the `/brands` directory.

**Correction:** brand chips now open `/brands/{slug}`; the directory action opens `/brands`. Brand detail pages already expose family and parent/child brand links, and family detail pages list member brands.

### 3.4 Homepage selection precedence

**Before:** the homepage formed its display set as the union of `BrandDisplay.showOnHomepage=true` and `Brand.featured=true`. Consequently, unchecking a featured brand could not reliably remove it: the legacy featured flag re-added it.

**Correction:** an explicit BrandDisplay row is authoritative, including `showOnHomepage=false`. The legacy `featured` flag is only a fallback for brands without an explicit display row. The admin curation endpoint and public feed now use the same active-brand eligibility.

### 3.5 Mutation protection

BrandFamily create/update/delete and homepage brand curation mutations did not consistently apply the shared CSRF check. The corrections add `checkCsrf` to those mutation handlers while retaining the existing RBAC permission checks.

## 4. Resulting user and admin rules

| Actor | Allowed behavior |
|---|---|
| Visitor / seller | Search and select an existing active canonical Brand; use Persian, English, or alias spellings |
| Visitor / seller | Enter a model name as free text after selecting a Brand; this does not create a ProductModel |
| Visitor / seller | Cannot create or modify a canonical Brand by typing into the picker |
| Admin / authorized owner | Create and enrich canonical Brands; manage aliases, status, verification, family, parent/child, industry/domain metadata |
| Admin / authorized owner | Curate homepage display independently of Brand identity and legacy featured flags |

## 5. Remaining audit work

1. Read-only inventory of the actual Integration Preview database: distinct brands, active/status distribution, alias counts and collisions, duplicate canonical candidates, family membership, parent/child links, and brand-to-category links.
2. Reconcile the 24 repeated seed slugs and the duplicate display names that intentionally use slug overrides. Confirm whether each represents a true distinct brand identity or should be a single canonical entity with multiple industries.
3. Validate all 18 seeded families and their child assignments against current official corporate structures; preserve historical parentage as provenance where appropriate.
4. Audit legacy BrandCategory links and listing dependencies before any backfill or merge.
5. Do not execute seed scripts or change Preview data until the read-only inventory and backup gate are complete.

## 6. Validation and release

The code changes are isolated in a draft PR against Integration. CI must pass before review. No migration is required for these code-only corrections. Merge and Cloudflare Preview deployment are separate owner decisions; no deployment has been initiated.
