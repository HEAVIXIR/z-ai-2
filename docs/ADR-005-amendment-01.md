# ADR-005 Amendment 01 — Schema-Reality Reconciliation

- **Status:** Accepted — STEP 11.29 (PR-SC-01)
- **Date:** 2026-10-09
- **Amends:** ADR-005 (Store Center Architecture, STEP 11.28)
- **Supersedes:** the schema-claim portions of ADR-005 §1, §2, §3, §5, §6 only. All other ADR-005 decisions stand.
- **Evidence base:** direct read of `prisma/schema.prisma` (main DB) and `prisma/store-schema.prisma` (store DB) at main `4566efd`; cross-checked by the /Critic, /analyst, /detailed, and /expert reviews of STEP 11.29.

## Why this amendment exists

ADR-005 (PR #8) recorded the Store Center architecture direction. An independent adversarial review (/Critic) and three parallel deep reviews (/analyst, /detailed, /expert) found that five of ADR-005's schema claims were **factually inaccurate** against the current codebase. None of the inaccuracies break the design *direction* — they break the *migration premises*. This amendment corrects the premises so PR-SC-01 and subsequent PRs build on true ground.

## Corrections

### §1 — Store Identity (Company branding)

**ADR-005 claim:** "Company already has: name, description, phone, email, address, verification status, documents. Adding `logoUrl`, `bannerUrl`, `brandColor`, `storeDescription`, `storeSlug` is additive."

**Actual schema (`prisma/schema.prisma`, Company model):**
| Field ADR-005 calls "NEW" | Actual state | Verdict |
|---|---|---|
| `logoUrl` | **Already exists** (`String?`, line ~23) | Do NOT re-add — migration would fail |
| `bannerUrl` | Overlaps existing `coverImage` (`String?`) | Reuse `coverImage`; do NOT add `bannerUrl` |
| `storeSlug` | Overlaps existing `slug` (`String @unique`) | Reuse `slug`; do NOT add `storeSlug` unless a separate showroom slug is genuinely needed |
| `brandColor` | Does not exist | Genuinely new — additive |
| `storeDescription` | Does not exist (only generic `description`) | Genuinely new — additive |

**Corrected migration scope (PR-SC-04, not PR-SC-01):** add only `brandColor String?` and `storeDescription String?` to Company. `logoUrl`, `coverImage`, `slug` are reused as-is. This shrinks the Company migration to 2 additive columns.

### §2 — VIP Showroom (PremiumSubscription linkage)

**ADR-005 claim:** "Check `Company.PremiumSubscription` is valid" / "user's Company has active PremiumSubscription."

**Actual schema:** `PremiumSubscription` has `userId String @unique` — it is **per-USER, not per-COMPANY**. There is no `companyId` on `PremiumSubscription` and no `Company → PremiumSubscription` relation.

**Corrected enforcement (PR-SC-08):** VIP status is resolved via the Company's owner/admin User. The helper `companyHasActivePremium(companyId)` must query `PremiumSubscription` where `user.companyId = companyId AND status = "ACTIVE" AND (expiresAt IS NULL OR expiresAt > now())`. This requires no schema change. Alternatively, a future PR may add `companyId` to `PremiumSubscription` or create a `CompanySubscription` join — but the MVP enforcement path needs no migration.

### §3 — Lead Status (sellerId access path)

**ADR-005 claim:** Lead gets a `status` field. (Correct.)

**Additional fact uncovered by /expert (BLOCKER-A2):** Lead has **no `sellerId` column**. Lead reaches the seller via `Lead.listing.sellerId` (or `Lead.listing.companyId`). Any KPI or query that filters leads by seller MUST use a relation filter (`where: { listing: { sellerId } }`), not a direct `where: { sellerId }`. The Implementation Plan PR-SC-05 dashboard query `db.lead.count({ where: { sellerId, status: 'NEW' } })` is **incorrect as written** and must be `db.lead.count({ where: { listing: { sellerId }, status: 'NEW' } })`.

PR-SC-01 adds `Lead.status` (and score fields) but does NOT add `sellerId` — the relation path is sufficient and avoids a redundant denormalized column.

### §5 — Smart Inventory Score (model location)

**ADR-005 claim:** Add `inventoryScore` / `inventoryScoreVersion` to `Part`.

**Actual schema:** `Part` lives in **`store-schema.prisma` (store DB)**, while the Store Center Spec §5.2 and all six score factors source from **main-DB** models (Listing, ListingAttributeValue, Inspection, etc.). Putting the score on `Part` would force a cross-DB read on every Store Center dashboard render, violating ADR-003 §5 (no cross-DB transactions).

**Corrected decision (per /analyst recommendation):** relocate the Smart Inventory Score to **`Listing` (main DB)**. The Listing is the machine being scored; all six factors (spec completeness, media, verification, inspection freshness, documentation, engagement) live in main DB. A separate, lower-priority "Part Catalog Score" may later be added to `Part` in the store DB for the parts-catalog domain, but that is a P2 concern, not the Store Center machine score.

PR-SC-01 does NOT touch Part or Listing score fields. The Listing-side score migration is PR-SC-03 (revised).

### §6 — Machine Passport (per-section verification)

**ADR-005 claim:** "MachinePassport already exists with `source` and `verification` fields. Extend with per-section verification status."

**Actual schema (`prisma/schema.prisma`, MachinePassport model):** fields are `id, listingId, serialNumber, inspectionDate, inspectionResult, events, createdAt, updatedAt`. There is **no `source` field and no `verification` field**. The ADR's premise is false.

**Corrected decision:** all eight per-section verification fields (`specsVerifiedAt/By`, `ownershipVerifiedAt/By`, `inspectionVerifiedAt/By`, `serviceHistoryVerifiedAt/By`) plus `passportScore` / `passportScoreVersion` are **genuinely new**, not extensions of existing fields. PR-SC-03 adds them as additive nullable columns. No existing data is affected.

## What does NOT change in ADR-005

- §4 (SalesTeamMember — new model): stands. Mechanic is a different domain; correct to not reuse it.
- §7 (Permission matrix — unified): stands. The 11 new keys remain the target; PR-SC-01 ships the first 2 (`store.crm.read`, `store.crm.manage`).
- §8 (AI advisory-only, no mutations): stands and is reinforced. The /detailed review (R11) found existing `/api/ai-sales-agent` and `/api/ai-seller-assistant` routes bypass the AI Gateway — PR-SC-09 must refactor/deprecate them.
- All migrations remain additive. No destructive changes. Rollback = drop new columns/tables.

## New finding recorded for future PRs

**BLOCKER-A4 (from /expert):** the Universal Resource API (`src/app/api/admin/resources/[resource]/...`) has **no tenant-scoping**. `canAccessResource` and `requireOwnership` exist but have **zero callers**. Any user with `*.read` can currently list ALL records across all sellers. This is a pre-existing security gap, not introduced by PR-SC-01. It MUST be fixed (via a `buildTenantWhere(userId, config)` helper wired into all universal routes) in a dedicated security PR **before** any seller-scoped UI/API ships (i.e., before PR-SC-04). PR-SC-01 itself ships no seller-scoped API, so it is not blocked by A4 — but A4 is now an explicit gate for PR-SC-04 onward.

## Rollback

This amendment is documentation-only. No code, schema, or migration is changed by this file. Rollback = remove this file.
