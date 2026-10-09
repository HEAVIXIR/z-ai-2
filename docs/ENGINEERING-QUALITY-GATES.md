# HEAVIX — Engineering Quality Gates (Pre-Implementation Review for PR-SC-01 onward)

- **Status:** MANDATORY — every execution PR (PR-SC-01 … PR-SC-09) must pass this gate before merge
- **Author:** /expert (STEP 11.29-E)
- **Baseline reviewed:** local HEAD `35b3a30` (PR #8 branch, "docs: Store Center UX prototype + ADR-005 + implementation plan"). Owner brief cites `main=4566efd`; actual main on this clone is `710df93` (post-PR #7 merge). The discrepancy is documented in `/home/z/heavix/docs/product/HEAVIX-INNOVATION-PROGRAM.md` §9.1 and does NOT affect this review — every claim below is grounded in the working-tree source at HEAD `35b3a30`.
- **Scope:** Architecture + Security + AI quality gates for the Store Center execution sequence (PR-SC-01 … PR-SC-09). Documentation only — NO code, schema, migration, or PR was modified.
- **Ground rule:** Every claim cites a real file:line. "AI works" / "tests green" without reviewable evidence is rejected.

---

## 0. How to use this document

This document is the **merge gate** for the Store Center execution PRs. Each PR-SC-XX must:

1. **Cite this document** in its PR description ("Passes ENGINEERING-QUALITY-GATES.md §N.M").
2. **Run the Pre-PR checklist** (§6) and tick every box.
3. **Run every gate** in §3, §4, §5 that is in scope for the PR (see §6 scope matrix).
4. **Attach an independent critic report** (separate from the implementer) that re-runs §3-§5 against the merged result.

PRs that skip a gate must explicitly mark it `N/A — justification: …`. "Forgot" is not a justification.

---

## 1. Architecture Gates

### 1.1 ADR-005 vs actual schema/code alignment

The table below cross-checks each ADR-005 decision (`/home/z/heavix/docs/ADR-005-store-center-architecture.md`) against the actual schema and code at HEAD `35b3a30`. Misalignments must be resolved (in ADR-005, in schema, or in the PR scope) BEFORE the dependent PR-SC-XX opens.

| # | ADR-005 decision | Real schema/code state (file:line) | Aligned? | Fix needed |
|---|---|---|---|---|
| 1 | §1 — Extend `Company` with `logoUrl`, `bannerUrl`, `brandColor`, `storeDescription`, `storeSlug` | `prisma/schema.prisma:1177-1215` — `Company` already has `logoUrl` (L1182), `coverImage` (L1183), `slug` (L1180), `metaTitle` (L1193), `metaDescription` (L1194), `verified` (L1190), `premium` (L1191). Missing: `bannerUrl` (only `coverImage` exists — rename or alias), `brandColor`, `storeDescription`, `storeSlug`. | **PARTIAL** (B1 confirmed) | ADR-005 §1 must acknowledge the 5 fields that already exist; PR-SC-01 must add only the 4 truly-new fields. Decide `bannerUrl` vs reusing `coverImage`. |
| 2 | §2 — `Showroom` model with `companyId @unique`, `isActive`, `template`, `layout`, `featuredListingIds` | `prisma/schema.prisma` — NO `Showroom` model exists. `grep -n "^model Showroom" prisma/schema.prisma` returns nothing. | NOT YET (expected — ADR-005 is a proposal) | PR-SC-02 must create the model. ✓ ADR-005 §2 schema is correct as written. |
| 3 | §2 — VIP enforcement: "Check Showroom.isActive + **Company.PremiumSubscription** validity" | `prisma/schema.prisma:1126-1143` — `PremiumSubscription.userId @unique` — per-USER, NOT per-Company. NO `companyId` on `PremiumSubscription`. | **MISALIGNED** (H1/H2 confirmed) | PR-SC-02 MUST either (a) add `companyId String?` to `PremiumSubscription` + index, OR (b) define a `CompanySubscription` join table. ADR-005 §2 must be amended to reflect this. Without this fix, "Company has active PremiumSubscription" is unenforceable. |
| 4 | §3 — Add `status String @default("NEW")` enum to `Lead` | `prisma/schema.prisma:618-627` — `Lead` has `leadType` only, NO `status` field. | NOT YET (expected) | PR-SC-01 must add `status String @default("NEW")`. ✓ |
| 5 | §3 + Implementation Plan PR-SC-05 — Dashboard KPI `db.lead.count({ where: { sellerId, status: 'NEW' } })` | `prisma/schema.prisma:618-627` — `Lead` has `listingId` only, NO `sellerId` column. To filter by seller must JOIN `Lead → Listing.sellerId`. | **MISALIGNED** with implementation plan | PR-SC-05 KPI query must be `db.lead.count({ where: { status: 'NEW', listing: { sellerId } } })`. ADR-005 §3 must note this. PR-SC-06 (CRM) must do the same. |
| 6 | §4 — `SalesTeamMember` model with `companyId`, `userId?`, `name`, `role`, `phone`, `email`, `photoUrl`, `isActive` | `prisma/schema.prisma` — NO `SalesTeamMember` model. | NOT YET (expected) | PR-SC-02 must create the model. ✓ ADR-005 §4 schema is correct. |
| 7 | §5 — `inventoryScore Int?` + `inventoryScoreVersion String?` on `Part` | `prisma/schema.prisma:1800-1811` — main `Part` has only `productId, partNumber, oemNumber, condition, status, createdAt, updatedAt` (catalog Part). `prisma/store-schema.prisma:123-165` — store `Part` has `sku, name, priceUsd, stock, images, compatibleCars, carModels, sourceUrl, soldCount` (inventory Part). ADR-005 §5 says "factors come from existing Part/Listing fields" — the algorithm in §5 (`has_partNumber`, `has_oemNumber`, `has_images`, `has_documents`, `has_specifications`, `stock_accuracy`, `recent_movement`) draws from BOTH models. | **MISALIGNED** (B2 confirmed by /analyst) | ADR-005 §5 must specify WHICH Part. /analyst recommended relocating to `Listing` (main DB) because factors (priceObservations, viewCount, leadCount, inspectionScore) are all on Listing. PR-SC-03 must implement the /analyst recommendation OR explicitly justify the Part placement with the cross-DB cost. |
| 8 | §6 — "MachinePassport already exists with `source` and `verification` fields. Extend with per-section verification status." | `prisma/schema.prisma:1149-1159` — `MachinePassport` has ONLY `serialNumber`, `inspectionDate`, `inspectionResult`, `events`. NO `source` field. NO `verification` field. | **MISALIGNED** (B3 confirmed) | ADR-005 §6 has a factual error. The prelude "MachinePassport already exists with `source` and `verification` fields" is FALSE. PR-SC-03 must add ALL the proposed per-section fields as new (not "extend"). ADR-005 §6 must be corrected. |
| 9 | §7 — 11 new permission keys (`store.profile.read/manage`, `showroom.read/manage/admin`, `passport.read/manage`, `store.crm.read/manage`, `store.reports.read`, `store.analytics.read`) | `src/lib/authorization/permissions.ts:34-232` — NONE of the 11 keys exist in `PERMISSIONS` array. Existing related keys: `store.read`, `store.manage` (L114-115), `inventory.read/manage` (L118-119). | NOT YET (expected) | PR-SC-02 must add all 11 keys to `PERMISSIONS` array AND to `ROLE_PERMISSIONS.SELLER` (and `ADMIN` auto-inherits via `[...PERMISSIONS]` at L238). PR-SC-02 must also update `prisma/seed-rbac.ts` to seed them. |
| 10 | §8 — AI Assistant advisory-only. "AI Gateway returns text suggestions (not function calls)" | `src/app/api/ai-gateway/route.ts:139-224` — ZAI `chat.completions.create` calls pass NO `tools` parameter → no function-calling capability. Structurally compliant. BUT: there is NO static-analysis gate or test preventing a future PR from adding `tools: [{ name: 'publishListing', ... }]`. | **PARTIAL** (architecture compliant, no enforcement) | PR-SC-09 must add (a) a test that asserts no ZAI call passes `tools`, (b) a code-review checklist item, (c) optionally an ESLint rule. ADR-005 §8 should be amended to require this gate. |
| 11 | §1 — `storeSlug String? @unique` (separate from existing `slug`) | `prisma/schema.prisma:1180` — `Company.slug` is already `@unique`. ADR-005 §1 adds `storeSlug @unique` separately. The decision is sound: `slug` = company page URL (`/companies/[slug]`), `storeSlug` = showroom URL (`/showroom/[slug]`). | ALIGNED | None. Note for PR-SC-01: ensure `storeSlug` is null until set by seller (don't auto-derive from `slug`). |
| 12 | §5 + §6 — Additive migrations only, no data loss | Verified: all proposed changes are `String?`/`Int?`/`DateTime?` (nullable) or new tables. No destructive changes. | ALIGNED | None. Pre-PR checklist (§6) must verify every PR-SC migration remains additive. |

**Misalignment count: 7 of 12 rows have at least one misalignment** (rows 1, 3, 5, 7, 8, 10, plus 2/3/6/9 are "NOT YET — expected"). Of these, **3 are BLOCKERS that must be resolved in PR-SC-01 or PR-SC-02 before dependent PRs can open**:

- **BLOCKER-A1 (row 3):** PremiumSubscription is per-USER, not per-Company. PR-SC-02 must add `companyId` (or a join table) — otherwise VIP showroom enforcement (PR-SC-08) is unimplementable.
- **BLOCKER-A2 (row 5):** Lead has no `sellerId`. PR-SC-05/06 dashboard/CRM KPIs cannot filter by seller without a JOIN — implementation plan must be corrected.
- **BLOCKER-A3 (row 8):** ADR-005 §6 makes a false claim about existing MachinePassport fields. PR-SC-03 must treat ALL per-section verification fields as new (not "extend"). ADR-005 §6 must be corrected.

### 1.2 Record ownership — which Company owns which records; tenant boundary

**Main DB ownership fields** (verified by direct schema read):

| Model | Ownership field | File:line |
|---|---|---|
| `Listing` | `sellerId String?` + `companyId String?` | `schema.prisma:489-492` |
| `BuyRequest` | `userId String?` | `schema.prisma:571` |
| `Article` | `authorId String?` | `schema.prisma:647` |
| `Lead` | NONE directly — ownership via `listingId → Listing.sellerId` | `schema.prisma:620-621` |
| `Deal` | (via `listingId` — check `schema.prisma` `Deal` model) | — |
| `Company` | (self — `id`) | `schema.prisma:1177` |

**Store DB ownership fields** (verified by direct schema read of `prisma/store-schema.prisma`):

| Model | Ownership field | File:line |
|---|---|---|
| `Part` | NONE | `store-schema.prisma:123-165` |
| `Order` | `customerId` + `userId String?` (optional HEAVIX User link) | `store-schema.prisma:170-202` |
| `Payment` | NONE (only `orderId`, `customerId`) | `store-schema.prisma:222-247` |
| `Shipment` | NONE (only `orderId`) | `store-schema.prisma:249-275` |
| `Customer` | NONE (only `phone @unique`) | `store-schema.prisma:39-60` |
| `StockMovement`, `Warehouse`, `InventoryBalance`, `Return`, `ProcurementRequest`, `PurchaseOrder`, `RentalListing`, `RentalBooking` | NONE | `store-schema.prisma:416-740` |

**Critical observation:** The store DB (`heavix_store`) is **single-tenant for the MEKANIX auto-parts marketplace** — there is NO `sellerId`/`companyId` on ANY store-domain model. This is the architectural reality; ADR-005's "Store Center" vision implicitly assumes per-Company ownership of store-domain records, but the schema does not support it.

**Tenant-scoping enforcement today (verified by code read):**

- `src/lib/authorization/index.ts:172-196` — `canAccessResource(userId, resource, resourceId, { ownerField, moderatePermission })` exists. **ZERO callers** in the Universal Resource API. (`grep -rn "canAccessResource" src/app/api/` returns nothing.)
- `src/lib/admin-guard.ts:112-120` — `requireOwnership(userId, resourceOwnerId)` exists. **ZERO callers** in the Universal Resource API.
- `src/lib/admin/data-adapter.ts:63-92` (`listResources`) — does NOT inject `{ sellerId: userId }` or `{ companyId: userCompanyId }` based on the calling user. The Prisma `where` is built purely from URL query params (`buildPrismaQuery(params, config)`).
- `src/lib/admin/resources/listing.ts` (`listingConfig`) — has NO tenant-scope declaration. A SELLER with `listing.read` sees ALL listings.
- `src/lib/admin/resources/store-resources.ts` (`partConfig`, `orderConfig`, `paymentConfig`, etc.) — same: NO tenant-scope.

**BLOCKER-A4 (cross-cutting):** The Universal Resource API has **NO tenant-scoping mechanism**. Any user with `*.read` permission sees ALL records of that resource, including other sellers' listings, leads, orders. PR-SC-04, PR-SC-05, PR-SC-06, PR-SC-07, PR-SC-09 all state "Seller A cannot see Seller B's X" in their acceptance criteria — but the engine cannot enforce this today.

**Required fix (PR-SC-01 scope OR a PR-SC-00 prerequisite):**

1. Add a tenant-scope declaration to `AdminResourceConfig` (in `src/lib/admin/types.ts`):
   ```ts
   tenantScope?: {
     ownerField: 'sellerId' | 'companyId' | 'userId';  // which column to filter on
     userToOwner: 'userId' | 'userCompanyId';            // how to derive the owner value from the calling user
     moderatePermission?: string;                        // if user has this, bypass tenant filter (admin/moderator)
   };
   ```
2. Add a `buildTenantWhere(userId, config)` helper in `src/lib/admin/data-adapter.ts` that returns `{ [ownerField]: derivedOwnerValue }` or `{}` if the user has `moderatePermission`.
3. Wire it into `listResources`, `getResource`, `createResource` (force-set `ownerField`), `updateResource`, `deleteResource`, `executeAction`, `executeBulkAction`, `executeExport`.
4. For store-domain resources (no `sellerId`/`companyId` column), `tenantScope` cannot be applied — these resources remain admin-only (SELLER cannot access them via Universal Resource API until a per-Company ownership migration is done).

**Negative-test pattern (mandatory for PR-SC-04 onward):**

```ts
// tests/security/tenant-isolation.test.ts
test('Seller A cannot read Seller B listings', async () => {
  const sellerA = await createTestUser({ roles: ['SELLER'] });
  const sellerB = await createTestUser({ roles: ['SELLER'] });
  const listingB = await db.listing.create({ data: { ..., sellerId: sellerB.id } });

  const res = await callUniversalApi('GET', `/api/admin/resources/listings`, sellerA);
  expect(res.status).toBe(200);
  const ids = res.body.data.items.map(l => l.id);
  expect(ids).not.toContain(listingB.id);  // ← tenant filter enforced
});
```

### 1.3 Duplicate-model prevention

Verified by direct schema read:

| Model name | Main DB (`schema.prisma`) | Store DB (`store-schema.prisma`) | Collision risk |
|---|---|---|---|
| `Brand` | `schema.prisma` (rich taxonomy: BrandAlias, BrandIndustry, BrandDomain, BrandSEO, BrandFamily, ProductModel, Generation) | `store-schema.prisma:111-121` (simple: name, nameFa, slug, logoUrl, country, active) | **DIFFERENT MODELS, SAME NAME** — admin code uses `model: 'brand'` with `database: 'main'` (`src/lib/admin/resources/brand.ts`) → correct. Store-brand resource (`storeBrandsConfig` in `store-domain-resources.ts`) uses `database: 'store'` → correct. Confusing but functionally safe. |
| `Part` | `schema.prisma:1800-1811` (catalog: partNumber, oemNumber, condition, status) | `store-schema.prisma:123-165` (inventory: sku, price, stock, images) | **DIFFERENT MODELS, SAME NAME** — `partConfig` (`store-resources.ts:88`) uses `database: 'main'` (catalog Part). No store-Part resource registered in `resource-index.ts`. Confusing but functionally safe. |
| `Category` | `schema.prisma` (main — marketplace taxonomy) | `store-schema.prisma:97-109` (store — auto-parts taxonomy) | **DIFFERENT MODELS, SAME NAME** — `storeCategoriesConfig` uses `database: 'store'`. Main Category is accessed via... (check). Confusing. |
| `Payment` | `schema.prisma:2260+` (marketplace deal payment) | `store-schema.prisma:222-247` (store order payment) | **DIFFERENT MODELS, SAME NAME** — `paymentConfig` (`store-resources.ts`) uses `database: 'main'`. The transactional refund path (`action-engine.ts:240-258`) operates on MAIN Payment only. Store Payment refund goes through best-effort `auditMutation` (cross-DB limitation). |
| `Order` | `schema.prisma:2384+` (marketplace order) | `store-schema.prisma:170-202` (store order) | **DIFFERENT MODELS, SAME NAME** — same situation as Payment. |
| `Machine` | `schema.prisma:1782+` (catalog machine) | NONE | No collision. |
| `Review` | `schema.prisma` (marketplace review) | `store-schema.prisma:313-327` (store part review) | **DIFFERENT MODELS, SAME NAME**. |
| `Company` | `schema.prisma:1177-1215` | NONE | ADR-005 §1 correctly extends Company (no parallel StoreProfile). ✓ |

**ADR-005 §1 explicitly rejects** the parallel `StoreProfile` model — correct decision, avoids duplication. ✓

**Risk for PR-SC:** PR-SC-03 proposes `inventoryScore` on "Part" — must explicitly disambiguate main-Part vs store-Part in the PR description and ADR-005 §5 (see §1.1 row 7 above).

### 1.4 Migration review checklist (every PR-SC that touches schema)

Each PR-SC migration MUST document the following 7 items in its PR description:

| # | Item | Requirement |
|---|---|---|
| M1 | Additive? | `ALTER TABLE ADD COLUMN` with nullable type, OR `CREATE TABLE`. NO `DROP COLUMN`, NO `ALTER COLUMN TYPE` (except widening), NO `NOT NULL` without a default. |
| M2 | Defaults? | New columns must have either `NULL` default OR a `DEFAULT` value. Existing rows must remain queryable without code change. |
| M3 | Backfill plan? | If new column needs values for existing rows (e.g., `Lead.status`), document the backfill: DB default (`@default("NEW")`) OR a `scripts/backfill-*.ts` script (PR-SC-03 must ship `scripts/calculate-inventory-score.ts` per the implementation plan L62-63). |
| M4 | Index needed? | New FK columns must have `@@index`. ADR-005 §4 `SalesTeamMember.companyId` has `@@index([companyId])` ✓. ADR-005 §2 `Showroom.companyId @unique` is auto-indexed ✓. NEW: `PremiumSubscription.companyId` (BLOCKER-A1) must have `@@index([companyId])`. |
| M5 | Rollback safe? | `DROP COLUMN`/`DROP TABLE` must be safe — no other code path writes to the new field yet at the time of rollback. Document the rollback order: (1) revert application code, (2) run `DROP COLUMN/TABLE` migration. For PR-SC-01, rollback is `ALTER TABLE "Company" DROP COLUMN "storeSlug"; ALTER TABLE "Lead" DROP COLUMN "status";`. |
| M6 | Impact on existing API paths? | Universal Resource API configs that touch the modified model must be checked. Example: PR-SC-01 adds `Lead.status` — `leadConfig` (if registered) must declare `status` as a field, filter, and column; otherwise the new field is invisible to the admin UI. PR description must list every affected config file. |
| M7 | Seed update? | New permission keys (PR-SC-02, PR-SC-06) must be added to `prisma/seed-rbac.ts` AND `src/lib/authorization/permissions.ts` `PERMISSIONS` array AND `ROLE_PERMISSIONS` map. Missing any one of the three = silent 403 at runtime (per worklog STEP 16-C Class A.2 finding). |

### 1.5 main-DB vs store-DB boundary

**Main DB (`prisma/schema.prisma`, Prisma client `db`):**
- Marketplace domain: `Listing`, `Lead`, `BuyRequest`, `Deal`, `ListingOffer`, `Auction`, `RFQ`, `RFQQuote`
- Catalog domain: `Product`, `Machine`, `Part` (catalog), `Attachment`, `Brand`, `Category`, `ProductModel`, `Generation`
- Identity domain: `User`, `Company`, `CompanyDocument`, `CompanyVerification`, `CompanyBranch`, `CompanyPartner`, `CompanyClaim`
- Trust domain: `Inspection`, `MachinePassport`, `PassportEvent`, `Review`
- AI domain: `AIGatewayLog`, `AIBudget`, `AITaskPolicy`
- Security domain: `AuditLog`, `Role`, `Permission`, `RolePermission`, `UserRole`
- Subscription domain: `PremiumSubscription`, `SubscriptionPlan`
- Analytics domain: `AnalyticsEvent`, `DemandSignal`, `ModerationLog`

**Store DB (`prisma/store-schema.prisma`, Prisma client `storeDb`):**
- Auto-parts catalog: `Part` (inventory), `CarModel`, `Category`, `Brand`
- Order/payment domain: `Order`, `OrderItem`, `Payment`, `Shipment`, `ShipmentTracking`, `Return`, `ReturnItem`
- Inventory domain: `StockMovement`, `Warehouse`, `InventoryBalance`
- Procurement domain: `ProcurementRequest`, `PurchaseOrder`, `PurchaseOrderItem`, `Supplier`
- Rental domain: `RentalListing`, `RentalBooking`
- Customer domain: `Customer`, `Mechanic`, `AdminUser`
- Service domain: `ServiceProvider`, `ServiceRequest`
- Operations: `CurrencyRate`, `CurrencySetting`, `Setting`, `Notification`, `Coupon`, `WalletTransaction`, `Review` (store)

**Cross-DB transaction limitation (ADR-003 §5, verified at `docs/ADR-003-audit-transactionality.md:108-129`):**
- Prisma does NOT support cross-database transactions.
- `auditMutationTransactional` (`src/lib/audit-foundation.ts:243-297`) uses `db.$transaction` — main client only.
- `AuditLog` table lives in MAIN DB only.
- Store-domain mutations use best-effort `auditMutation` (audit gap risk: mutation commits, audit silently fails).

**Operations that MUST stay single-DB:**

| Operation | DB | Why | Code path |
|---|---|---|---|
| `payment.refund` (marketplace Payment) | MAIN | `auditMutationTransactional` requires main client | `action-engine.ts:240-258, 386-445` |
| `payment.verify` (marketplace Payment) | MAIN | Same | `action-engine.ts:124-142` |
| Store-DB Payment refund | STORE (best-effort audit) | Cross-DB tx impossible — KNOWN LIMITATION | `action-engine.ts:446-469` (falls back to `auditMutation`) |
| `Listing.update` with TOCTOU protection | MAIN | `db.$transaction` + `SELECT FOR UPDATE` | `data-adapter.ts:172-218` |
| Store-domain update with TOCTOU protection | STORE (non-transactional) | Cross-DB tx impossible — falls back to `updateResourceNonTransactional` | `data-adapter.ts:222-258` |
| Audit log writes | MAIN always | `AuditLog` is main-only | `audit-foundation.ts:272` (`tx.auditLog.create`) |

**BLOCKER-A5 (store-DB TOCTOU):** Store-domain updates (store Payment refund, store Order status change, Inventory adjust) have **NO TOCTOU protection** — `updateResourceNonTransactional` (`data-adapter.ts:222-258`) reads persisted state without `SELECT FOR UPDATE`. A concurrent request can change the controlling field between the read and the write. ADR-003 §5 documents this as a KNOWN ARCHITECTURAL LIMITATION. PR-SC that touches store-domain financial ops (none currently in PR-SC-01..09, but flagged for future) MUST either (a) accept the limitation and document it, OR (b) ship the StoreAuditLog outbox proposed in ADR-003 §5 mitigation.

---

## 2. Security Gates

### 2.1 Server-side permission enforcement — Universal Resource API

Every Universal Resource API route MUST call `requireAdmin(permissionKey)` (or equivalent) with a non-null permission key. Verified by direct code read of all 5 routes:

| Route | File:line | Permission check | Verdict |
|---|---|---|---|
| List GET | `src/app/api/admin/resources/[resource]/route.ts:76-88` | `requireAdmin(readPerm)` + `can(user, readPerm)` | ✓ |
| Create POST | `src/app/api/admin/resources/[resource]/route.ts:142-148` | `requireAdmin(createPerm)` | ✓ |
| Detail GET | `src/app/api/admin/resources/[resource]/[id]/route.ts:37-47` | `requireAdmin(readPerm)` + `can(user, readPerm)` | ✓ |
| Update PATCH | `src/app/api/admin/resources/[resource]/[id]/route.ts:76-79` | `requireAdmin(updatePerm)` | ✓ |
| Delete DELETE | `src/app/api/admin/resources/[resource]/[id]/route.ts:147-150` | `requireAdmin(deletePerm)` | ✓ |
| Bulk POST | `src/app/api/admin/resources/[resource]/bulk/route.ts:50-61` | `requireAdmin(actionDef.permission)` + `canBulkAction(userId, 'bulk-${action}', resourceKey)` | ✓ |
| Export GET | `src/app/api/admin/resources/[resource]/export/route.ts:48-54` | `requireAdmin(exportPerm)` where `exportPerm = config.permissions.export \|\| config.permissions.read` | ⚠ Weak — see §2.5 |
| Action POST | `src/app/api/admin/resources/[resource]/[id]/action/route.ts:38-44` | `requireAdmin(actionDef.permission)` + `can(user, actionDef.permission)` | ✓ |

**ADMIN-bypass eliminated:** `src/lib/admin-guard.ts:67-82` (Model B contract) — `if (permissionKey) { const hasPerm = await can(user.id, permissionKey); if (!hasPerm) return false; }`. The previous empty-body bypass (STEP 11.5 audit finding) is gone. ADMIN must have the permission via RBAC (auto-granted via `ROLE_PERMISSIONS.ADMIN = [...PERMISSIONS]` at `permissions.ts:238`). ✓

**AI gateway permission:** `src/app/api/ai-gateway/route.ts:97-120` — `preflightAIRequest` runs 5 gates (policy exists, auth, quota, budget, size). ADMIN always passes via `isAdmin` (`ai-policy.ts:117`). ✓

### 2.2 Cross-seller access — negative test requirement

**Current state:** NO tenant-scoping in the Universal Resource API (see §1.2). A SELLER with `listing.read` sees ALL listings. This is a **BLOCKER-A4** — must be fixed before PR-SC-04.

**Mandatory negative-test pattern** (every PR-SC that exposes a seller-facing resource MUST include this test):

```ts
// tests/security/tenant-isolation-<resource>.test.ts
// Pattern: Seller A creates a record. Seller B (same role, different userId/companyId)
// attempts to READ, WRITE, DELETE, EXPORT, ACTION it. Every attempt MUST fail.

describe(`Tenant isolation: ${resource}`, () => {
  let sellerA: User, sellerB: User, recordA: Record;

  beforeAll(async () => {
    sellerA = await createTestUser({ roles: ['SELLER'] });
    sellerB = await createTestUser({ roles: ['SELLER'] });
    recordA = await createTestRecord(resource, { ownerUserId: sellerA.id });
  });

  test('Seller B cannot READ Seller A record via List', async () => {
    const res = await callApi('GET', `/api/admin/resources/${resource}`, sellerB);
    expect(res.body.data.items.map(r => r.id)).not.toContain(recordA.id);
  });

  test('Seller B cannot READ Seller A record via Detail', async () => {
    const res = await callApi('GET', `/api/admin/resources/${resource}/${recordA.id}`, sellerB);
    expect(res.status).toBe(404);  // 404, not 403 — don't leak existence
  });

  test('Seller B cannot WRITE Seller A record', async () => {
    const res = await callApi('PATCH', `/api/admin/resources/${resource}/${recordA.id}`, sellerB, { someField: 'evil' });
    expect([403, 404]).toContain(res.status);
  });

  test('Seller B cannot DELETE Seller A record', async () => {
    const res = await callApi('DELETE', `/api/admin/resources/${resource}/${recordA.id}`, sellerB);
    expect([403, 404]).toContain(res.status);
  });

  test('Seller B cannot ACTION Seller A record', async () => {
    const res = await callApi('POST', `/api/admin/resources/${resource}/${recordA.id}/action`, sellerB, { action: 'publish' });
    expect([403, 404]).toContain(res.status);
  });

  test('Seller B cannot EXPORT Seller A record', async () => {
    const res = await callApi('GET', `/api/admin/resources/${resource}/export?format=csv`, sellerB);
    const ids = parseCsv(res.body).map(r => r.id);
    expect(ids).not.toContain(recordA.id);
  });

  test('Seller B cannot BULK-ACTION Seller A record', async () => {
    const res = await callApi('POST', `/api/admin/resources/${resource}/bulk`, sellerB, { action: 'delete', ids: [recordA.id] });
    // Either the entire bulk is denied, OR the individual record is filtered out and reported as failed
    const stillExists = await db[resource].findUnique({ where: { id: recordA.id } });
    expect(stillExists).not.toBeNull();
  });
});
```

**Decision required for PR-SC-01:** Detail GET on a record the user doesn't own — should it return 404 or 403?
- 404 (don't leak existence) is the safer default for tenant isolation.
- 403 is acceptable for admin-facing resources where the user already has `*.read` permission (the existence is implied).
- Recommendation: **404 for seller-facing resources** (Lead, Listing, Showroom, SalesTeamMember), **403 for admin-facing resources** (the universal admin table).

### 2.3 Sensitive field + controller-status change must NOT bypass readonly policy

**The bypass scenario:** A user submits a PATCH that simultaneously (a) changes the controlling field (`status: 'DRAFT'`) and (b) changes the protected field (`price: 100`) in one request. If `readonlyWhen` evaluates against the MERGED submitted data, the condition `status === 'PUBLISHED'` is false → price is writable → user bypasses the readonly rule.

**Enforcement in code** (verified):

1. `src/lib/admin/field-policy.ts:124-216` — `applyFieldWritePolicyAsync(config, data, ctx, persistedRecord)`:
   - L146-148: `readonlyWhenState = persistedRecord ? { ...persistedRecord } : { ...data }`. For UPDATEs, uses PERSISTED state only (NOT merged with submitted data). ✓
   - L162-195: `readonlyWhen.every(cond => evaluate against readonlyWhenState)`. If all conditions met → field is readonly → return `{ ok: false, rejectedField, requiredPermission: 'FIELD_IS_READONLY' }`.
   - L174-187: Unknown operator → fail-closed (`FIELD_READONLY_UNKNOWN_OPERATOR`). ✓

2. `src/lib/admin/data-adapter.ts:152-218` — `updateResource` for main-DB resources:
   - L172: wraps read-evaluate-update in `db.$transaction`.
   - L186-188: `await tx.$queryRaw\`SELECT * FROM "${tableName}" WHERE "id" = ${id} FOR UPDATE\`` — acquires row-level lock. ✓
   - L202: `applyFieldWritePolicyAsync(config, data, fieldCtx, persistedRecord)` — passes the LOCKED persisted record to field policy. ✓
   - L216: `txModel.update` runs INSIDE the same transaction (row still locked). ✓

3. `src/lib/admin/action-engine.ts:386-445` — for `transactional === true` actions:
   - L404-419: re-fetches entity INSIDE the tx (`txModel.findUnique`).
   - L422-432: re-checks precondition INSIDE the tx.
   - L437-439: handler runs against the FRESH tx-tagged item.
   - Note: action-engine uses `findUnique` (not `SELECT FOR UPDATE`). This is a weaker guarantee than `data-adapter.ts` — under PostgreSQL Read Committed, `findUnique` does NOT lock the row. A concurrent transaction could still modify the row between the re-fetch and the handler's `update`. **MINOR GAP** — action-engine should use `$queryRaw SELECT FOR UPDATE` for consistency with data-adapter.

**Store-DB TOCTOU gap:** `data-adapter.ts:222-258` `updateResourceNonTransactional` — store-DB resources have NO `SELECT FOR UPDATE`. KNOWN LIMITATION per ADR-003 §5. PR-SC that touches store-domain controller-status fields (none currently) must document this.

**Required test for every PR-SC that adds a `readonlyWhen` rule:**

```ts
// tests/security/readonly-when-bypass.test.ts
test('Cannot bypass readonlyWhen by changing controller field in same request', async () => {
  const record = await db.listing.create({ data: { status: 'PUBLISHED', price: 1000n, ... } });
  // Attempt: simultaneously set status=DRAFT and price=999
  const res = await callApi('PATCH', `/api/admin/resources/listings/${record.id}`, user, {
    status: 'DRAFT',
    price: 999,
  });
  expect(res.status).toBe(403);
  expect(res.body.field).toBe('price');
  expect(res.body.requiredPermission).toBe('FIELD_IS_READONLY');
  // Verify record unchanged
  const after = await db.listing.findUnique({ where: { id: record.id } });
  expect(after.status).toBe('PUBLISHED');
  expect(after.price).toBe(1000n);
});
```

### 2.4 Financial/sensitive ops must be idempotent + audited

**Idempotency pattern** (verified in code):

- `src/lib/admin/action-engine.ts:124-142` (`verify` on `payment` model):
  ```ts
  const verifyResult = await model.updateMany({
    where: { id: item.id, status: currentStatus },  // ← atomic precondition
    data: { status: 'PAID', paidAt: new Date() },
  });
  if (verifyResult.count === 0) {
    throw new Error(`ATOMIC_UPDATE_FAILED: Payment ${item.id} status is no longer "${currentStatus}" — concurrent modification detected`);
  }
  ```
  ✓ Two concurrent verify requests cannot both succeed — exactly one gets `count=1`, the other gets `count=0`.

- `src/lib/admin/action-engine.ts:240-258` (`refund` on `payment` model): same `updateMany` with `where: { id, status: currentStatus }` pattern. ✓

**Audit transactionality** (verified):

- `src/lib/admin/action-engine.ts:386-387`: `const useTransactional = action.transactional === true && config.database !== 'store';`
- L390-445: `auditMutationTransactional` wraps mutation + audit insert in `db.$transaction`. If audit insert fails → mutation rolled back. ✓
- `src/lib/audit-foundation.ts:243-297` — `auditMutationTransactional`:
  - L255: `db.$transaction(async (tx) => { ... })`.
  - L258: `opResult = await operation(tx)` (mutation through tx client).
  - L272-286: `await tx.auditLog.create({ data: { ... } })` (audit insert through tx). ✓

**Production configs declaring `transactional: true`** (per ADR-003 §4 table):
- `payments.refund` — precondition: `status ∈ {PAID, AUTHORIZED}` — transactional ✓
- `payments.verify` — precondition: `status === PENDING` — transactional ✓

Only 2 of 36 resources declare transactional actions. Future CRITICAL ops (`user.suspend`, `user.role-manage`, `listing.delete`) should declare it (ADR-003 §4 explicitly notes this as a follow-up).

**Required test for every PR-SC that adds a financial/sensitive action:**

```ts
// tests/security/concurrent-action.test.ts
test('Concurrent refund requests: exactly one succeeds', async () => {
  const payment = await db.payment.create({ data: { status: 'PAID', ... } });
  const [r1, r2] = await Promise.all([
    callAction('payments', payment.id, 'refund', adminUser),
    callAction('payments', payment.id, 'refund', adminUser),
  ]);
  const successes = [r1, r2].filter(r => r.body.ok).length;
  const failures = [r1, r2].filter(r => !r.body.ok).length;
  expect(successes).toBe(1);
  expect(failures).toBe(1);
  expect(failures[0].body.error).toContain('ATOMIC_UPDATE_FAILED');
  // Both requests must be audited (one success, one .failed)
  const audits = await db.auditLog.findMany({ where: { entityId: payment.id, action: { contains: 'refund' } } });
  expect(audits.length).toBe(2);  // success + failed
});
```

### 2.5 Export + PII access need INDEPENDENT permission

**Code enforcement** (verified):

- `src/lib/admin/field-policy.ts:261-283` — `buildExportPermissionMap(config)` walks BOTH `config.columns` and `config.fields` for `permissions.export` (independent from `permissions.read`). ✓
- `src/lib/admin/field-policy.ts:342-371` — `filterExportableFieldsAsync` strips fields the user lacks `permissions.export` for. ✓
- `src/lib/authorization/index.ts:298-334` — `canExport(userId, resource)` is a SEPARATE function from `can`. ✓

**Weakness in the export route:**

- `src/app/api/admin/resources/[resource]/export/route.ts:48`: `const exportPerm = config.permissions.export || config.permissions.read;`
- The `||` fallback means: **if a resource doesn't declare `permissions.export`, READ grants EXPORT**. This weakens the "independent permission" guarantee.
- Per worklog STEP 11.25 R3: only **3 of 36 resources** declare `permissions.export` distinct from read (`listing.export`, plus 2 others). The other 33 fall back to `*.read` — so bulk export of PII is granted to anyone with read.
- `listingConfig` (`src/lib/admin/resources/listing.ts:13-18`) declares `export: 'listing.export'` ✓ — distinct from `read: 'listing.read'`.

**Required for PR-SC:**

- Every new resource that has PII (phone, email, name, address, payment info) MUST declare `permissions.export` explicitly. Resources in scope:
  - `Showroom` (PR-SC-02) — has `featuredListingIds` (not PII, but competitive intel) → declare `showroom.read` for export.
  - `SalesTeamMember` (PR-SC-02) — has `phone`, `email`, `photoUrl` (PII) → MUST declare `permissions.export: 'store.profile.manage'` (more restrictive than read).
  - `Lead` (PR-SC-06) — has `viewerPhone`, `viewerName` (PII) → MUST declare `permissions.export: 'store.crm.manage'`.
  - `MachinePassport` (PR-SC-07) — has `specsVerifiedBy` etc. (user IDs, not direct PII) → declare `passport.read` for export.
- The `||` fallback in `export/route.ts:48` should be REMOVED in a future hardening PR — require explicit `permissions.export` on every resource. (Out of scope for PR-SC-01, but tracked.)

**Required test:**

```ts
// tests/security/export-permission.test.ts
test('User with read but NOT export cannot export PII', async () => {
  const user = await createTestUser({ permissions: ['store.crm.read'] });  // read but NOT store.crm.manage
  await db.lead.create({ data: { viewerPhone: '09120000000', ... } });
  const res = await callApi('GET', `/api/admin/resources/leads/export?format=csv`, user);
  expect(res.status).toBe(403);
  // OR if export perm falls back to read, verify PII columns are stripped:
  // const csv = res.body;
  // expect(csv).not.toContain('09120000000');
});
```

### 2.6 VIP Showroom server-side enforcement on EVERY path

ADR-005 §2 specifies 3 path types with 3 different failure modes. Currently NONE are implemented (no `/showroom` route exists — confirmed by SEO audit in worklog STEP 11.29-D). PR-SC-08 must implement and test all 4 paths below (the implementation plan L174-198 lists 3; this gate adds the public data API as a 4th).

| # | Path | Enforcement | Failure mode | Required test |
|---|---|---|---|---|
| VIP-1 | Public page `/showroom/[slug]` | Check `Showroom.isActive === true` AND Company has valid `PremiumSubscription` (not expired) | **404** (not 403 — don't leak existence of inactive showrooms) | `GET /showroom/inactive-slug → 404`; `GET /showroom/active-vip-slug → 200` |
| VIP-2 | Management page `/seller/showroom` | Check user's Company has active `PremiumSubscription` | **403** (user is authenticated, just not VIP) | `GET /seller/showroom as non-VIP → 403`; `GET /seller/showroom as VIP → 200` |
| VIP-3 | Management data API `/api/seller/showroom` (GET, PATCH) | Same as VIP-2 | **403** | `PATCH /api/seller/showroom as non-VIP → 403` |
| VIP-4 | Public data API `/api/showroom/[slug]` (GET) | Same as VIP-1 | **404** | `GET /api/showroom/inactive-slug → 404` |

**BLOCKER-A1 dependency:** VIP-1 through VIP-4 all require "Company has active PremiumSubscription." `PremiumSubscription.userId @unique` is per-USER — there is NO `companyId` field. PR-SC-02 MUST add `companyId` to PremiumSubscription (or a CompanySubscription join) before PR-SC-08 can implement these checks.

**Server-side check helper** (proposed for `src/lib/showroom-auth.ts` per implementation plan L182):

```ts
// src/lib/showroom-auth.ts
export async function assertCompanyVip(companyId: string): Promise<boolean> {
  // BLOCKER-A1: requires PremiumSubscription.companyId (PR-SC-02)
  const sub = await db.premiumSubscription.findFirst({
    where: {
      companyId,           // ← requires PR-SC-02 migration
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  return sub !== null;
}

export async function assertShowroomPublicAccess(storeSlug: string): Promise<Showroom> {
  const showroom = await db.showroom.findFirst({
    where: { company: { storeSlug } },
    include: { company: { include: { premiumSubscription: true } } },
  });
  if (!showroom || !showroom.isActive) throw new NotFoundError();  // → 404
  if (!await assertCompanyVip(showroom.companyId)) throw new NotFoundError();  // → 404 (not 403)
  return showroom;
}
```

**Required test (PR-SC-08):**

```ts
// tests/security/vip-showroom.test.ts
describe('VIP Showroom enforcement', () => {
  test('VIP-1: Public page returns 404 for inactive showroom', async () => {
    const company = await createCompany({ storeSlug: 'inactive-co' });
    await db.showroom.create({ data: { companyId: company.id, isActive: false } });
    const res = await callPublicApi('GET', '/showroom/inactive-co');
    expect(res.status).toBe(404);
  });

  test('VIP-1: Public page returns 404 for active showroom of non-VIP company', async () => {
    const company = await createCompany({ storeSlug: 'non-vip-co' });
    await db.showroom.create({ data: { companyId: company.id, isActive: true } });
    // No PremiumSubscription for this company
    const res = await callPublicApi('GET', '/showroom/non-vip-co');
    expect(res.status).toBe(404);  // NOT 403 — don't leak existence
  });

  test('VIP-1: Public page returns 200 for active VIP showroom', async () => {
    const company = await createVipCompany({ storeSlug: 'vip-co' });
    await db.showroom.create({ data: { companyId: company.id, isActive: true } });
    const res = await callPublicApi('GET', '/showroom/vip-co');
    expect(res.status).toBe(200);
  });

  test('VIP-2: Non-VIP seller cannot access management page', async () => {
    const seller = await createTestUser({ roles: ['SELLER'] });  // no PremiumSubscription
    const res = await callApi('GET', '/seller/showroom', seller);
    expect(res.status).toBe(403);
  });

  test('VIP-3: Non-VIP seller cannot PATCH showroom', async () => {
    const seller = await createTestUser({ roles: ['SELLER'] });
    const res = await callApi('PATCH', '/api/seller/showroom', seller, { template: 'manufacturer' });
    expect(res.status).toBe(403);
  });

  test('VIP-4: Public API returns 404 for inactive showroom', async () => {
    const res = await callPublicApi('GET', '/api/showroom/inactive-co');
    expect(res.status).toBe(404);
  });

  test('VIP expired: page returns 404 when PremiumSubscription.expiresAt < now', async () => {
    const company = await createCompany({ storeSlug: 'expired-vip' });
    await db.premiumSubscription.create({ data: { companyId: company.id, status: 'ACTIVE', expiresAt: new Date('2020-01-01') } });
    await db.showroom.create({ data: { companyId: company.id, isActive: true } });
    const res = await callPublicApi('GET', '/showroom/expired-vip');
    expect(res.status).toBe(404);
  });
});
```

---

## 3. AI Gates

### 3.1 Only permitted data sent to model — input-filtering contract

**Current state** (verified at `src/app/api/ai-gateway/route.ts:139-224`):

- `SEARCH` / `SEMANTIC_SEARCH` (L141-156): passes `input.query` directly to ZAI. No whitelist, no PII stripping.
- `LISTING_BUILDER` (L159-176): passes `input.description` directly. No whitelist.
- `MODERATION` (L199-216): passes `input.text` directly. No whitelist.
- `SELLER_ASSISTANT` (L192-197): returns `{ message: "Use /api/ai-seller-assistant for seller analysis" }` — NOT IMPLEMENTED. PR-SC-09 will implement this.
- `PRICE_ANALYSIS` / `MARKET_ANALYST` (L178-190): redirect to other endpoints — not in scope here.

**Input truncation for LOGGING only** (L264): `input: JSON.stringify(input).substring(0, 500)` — but the FULL `input` is passed to the LLM. Logging truncation does NOT protect against PII leakage to the model.

**BLOCKER-AI-1 (PR-SC-09):** SELLER_ASSISTANT input-filtering contract MUST be specified and enforced:

```ts
// src/lib/ai-input-filter.ts (NEW — PR-SC-09)
const SELLER_ASSISTANT_WHITELIST = {
  listing: ['id', 'title', 'status', 'price', 'createdAt', 'viewCount', 'favoriteCount', 'leadCount'],
  lead: ['id', 'leadType', 'status', 'createdAt'],  // ← NO viewerPhone, NO viewerName
  // ... other allowed models
};

export function filterSellerAssistantInput(userId: string, data: unknown): unknown {
  // 1. Walk the data tree.
  // 2. For each record, keep only whitelisted fields.
  // 3. Strip PII fields (phone, email, name, address) UNLESS the user has 'user.read' permission.
  // 4. Strip other-seller data: any record where ownerUserId !== userId (unless user has admin/moderate perm).
  // 5. Return the filtered payload.
}
```

**Required test:**

```ts
// tests/security/ai-input-filter.test.ts
test('SELLER_ASSISTANT input strips PII from Lead', async () => {
  const input = {
    leads: [{ id: '1', viewerPhone: '09120000000', viewerName: 'Ahmad', status: 'NEW' }],
  };
  const filtered = filterSellerAssistantInput(sellerUser, input);
  expect(JSON.stringify(filtered)).not.toContain('09120000000');
  expect(JSON.stringify(filtered)).not.toContain('Ahmad');
  expect(filtered.leads[0].status).toBe('NEW');  // whitelisted field retained
});

test('SELLER_ASSISTANT input strips other-seller listings', async () => {
  const input = {
    listings: [
      { id: 'L1', sellerId: sellerUser.id, title: 'My listing' },
      { id: 'L2', sellerId: 'other-seller-id', title: 'Competitor listing' },
    ],
  };
  const filtered = filterSellerAssistantInput(sellerUser, input);
  expect(filtered.listings.map(l => l.id)).toEqual(['L1']);  // L2 stripped
});
```

### 3.2 Model output = untrusted input — validation schema

**Current state** (verified):

- `src/app/api/ai-gateway/route.ts:173-174` (LISTING_BUILDER):
  ```ts
  const m = content.match(/\{[\s\S]*\}/);
  result = m ? JSON.parse(m[0]) : { title: desc.substring(0, 80) };
  ```
  - Regex-extracts the first `{...}` block from LLM output.
  - `JSON.parse` with NO schema validation.
  - If the LLM returns `{ "title": "evil", "__proto__": { "polluted": true } }` — prototype pollution risk.
  - If the LLM returns extra keys (`{ title, script: "<script>alert(1)</script>" })` — they pass through to the caller unchecked.

- `src/lib/ai-gateway-service.ts:107-113` (DEAD CODE — zero callers per `grep -rn "aiGateway.execute" src/`):
  - Same `JSON.parse(trimmed)` with no validation.
  - This file is a parallel AI gateway that BYPASSES the `preflightAIRequest` policy engine (L60-90 of `ai-gateway-service.ts` does its own ad-hoc policy check, NOT the 5-gate preflight).
  - **MINOR RISK:** unused, but a future PR could import it by accident. Should be deleted or marked `@deprecated` with a redirect to `/api/ai-gateway`.

**BLOCKER-AI-2 (PR-SC-09):** Every AI task handler MUST validate output with a zod (or valibot) schema BEFORE returning to the caller:

```ts
// src/lib/ai-output-schemas.ts (NEW — PR-SC-09)
import { z } from 'zod';

export const ListingBuilderOutputSchema = z.object({
  title: z.string().min(5).max(200),
  brand: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  hours: z.number().nonnegative().optional(),
  condition: z.enum(['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_REPAIR']).optional(),
  price: z.number().nonnegative().optional(),
  description: z.string().max(10000).optional(),
}).strict();  // ← reject unknown keys

export const SellerAssistantOutputSchema = z.object({
  suggestions: z.array(z.object({
    type: z.enum(['listings', 'leads', 'inventory', 'pricing', 'passport']),
    priority: z.enum(['high', 'medium', 'low']),
    title: z.string(),
    body: z.string(),
    ctaUrl: z.string().startsWith('/'),  // ← internal URL only, no external
    evidence: z.array(z.object({
      recordType: z.string(),
      recordId: z.string(),
      field: z.string(),
    })),
    confidence: z.number().min(0).max(1),
    uncertainty: z.string().optional(),  // ← mandatory when confidence < 0.7
  })).max(10),  // ← cap suggestions per response
}).strict();
```

**Rules:**
1. Output MUST be parsed with the schema (`Schema.safeParse(parsedJson)`).
2. On parse failure → return `{ success: false, error: 'AI_OUTPUT_INVALID' }` and log the raw output to `AIGatewayLog.output` for diagnosis.
3. Output MUST NEVER be written directly to the DB. The caller (UI) must re-submit the suggestion through a normal authenticated/authorized/audited API path.
4. Output MUST NOT be used to change permissions. No AI output field maps to a permission/role assignment.

### 3.3 AI cannot change permissions or bypass sensitive ops

**ADR-005 §8** (verified at `docs/ADR-005-store-center-architecture.md:194-205`):
- "AI Gateway returns text suggestions (not function calls)" ✓
- "Each suggestion includes a link to the relevant page" ✓ (proposed in `SellerAssistantOutputSchema.suggestions[].ctaUrl`)
- "User must manually navigate and perform the action" ✓
- "All actions go through normal authenticated, authorized, audited paths" ✓
- "No 'AI executes action' pattern — even with user approval" ✓

**Structural enforcement** (verified at `src/app/api/ai-gateway/route.ts:139-224`):
- ZAI `chat.completions.create` calls pass NO `tools` parameter → no function-calling capability. ✓
- ZAI `chat.completions.create` calls pass NO `function_call` parameter (legacy function-calling). ✓

**Gaps in enforcement:**

1. **No static-analysis gate:** Nothing prevents a future PR from adding `tools: [{ name: 'publishListing', ... }]` to a ZAI call. PR-SC-09 MUST add:
   - A test (`tests/security/ai-no-function-calling.test.ts`) that scans the codebase for `tools:` or `function_call:` parameters in ZAI calls.
   - A code-review checklist item (in `CONTRIBUTING.md` or this document §6).
   - Optionally, an ESLint rule.

2. **No audit trail for "AI suggested X, user accepted/rejected":** AIGatewayLog (schema.prisma:726-741) records the AI call but not the user's accept/reject decision. See §3.4.

3. **`src/lib/ai-gateway-service.ts` is a parallel gateway** that bypasses the policy engine. Currently unused (zero callers) but a footgun. PR-SC-09 MUST either delete it or mark it `@deprecated` with a redirect.

**Required test (PR-SC-09):**

```ts
// tests/security/ai-no-function-calling.test.ts
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

test('No ZAI call in src/ passes tools or function_call parameter', () => {
  const srcFiles = walkDir('src');
  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf8');
    // Look for ZAI chat.completions.create calls that pass tools/function_call
    const zaiCallRegex = /chat\.completions\.create\s*\(\s*\{[\s\S]*?\}\s*\)/g;
    const matches = content.match(zaiCallRegex) || [];
    for (const match of matches) {
      expect(match).not.toMatch(/\btools\s*:/);
      expect(match).not.toMatch(/\bfunction_call\s*:/);
      expect(match).not.toMatch(/\btool_choice\s*:/);
    }
  }
});
```

### 3.4 Cost / latency / quality / error / usage monitoring — AIGatewayLog fields

**Current AIGatewayLog fields** (verified at `prisma/schema.prisma:726-741`):

| Field | Type | Purpose | Present? |
|---|---|---|---|
| `taskType` | String | Which AI task | ✓ |
| `model` | String | Which AI model | ✓ |
| `input` | String? | Truncated input (500 chars) | ✓ |
| `output` | String? | Truncated output (500 chars) | ✓ |
| `latencyMs` | Int? | Wall-clock latency | ✓ |
| `tokensUsed` | Int? | Token usage | ✓ (but NOT populated in `/api/ai-gateway/route.ts` — see below) |
| `cost` | Float? | Estimated USD cost | ✓ (set to `policy.costCeilingUsd` at L253 — ceiling, not actual) |
| `success` | Boolean | Whether the call succeeded | ✓ |
| `error` | String? | Error message on failure | ✓ |
| `userId` | String? | Who triggered the call | ✓ |
| `createdAt` | DateTime | Timestamp | ✓ |

**MISSING fields** (per /analyst finding in worklog STEP 11.29-C):

| Missing field | Purpose | Proposed type |
|---|---|---|
| `accepted` | Did a human review and accept the suggestion? | Boolean? |
| `rejectedReason` | If rejected, why? | String? |
| `confidence` | Model self-reported confidence | Float? |
| `evidenceJson` | What records grounded the suggestion? | String? (JSON array of `{recordType, recordId, field}`) |
| `promptTemplateId` | Which prompt version produced this? | String? |
| `qualityScore` | Human feedback (thumbs up/down) | Int? |
| `modelVersion` | Full model version string (not just `"default"`) | String? |

**Gaps in current code:**

- `tokensUsed` is declared in schema but NEVER populated in `/api/ai-gateway/route.ts` (L260-272 `db.aIGatewayLog.create` does NOT set `tokensUsed`). ZAI returns token usage in `completion.usage` — should be captured.
- `cost` is set to `policy.costCeilingUsd` (L253) — this is the CEILING, not the actual cost. For budget tracking this is conservative (over-charges), but for cost analytics it's misleading. Should record both `costEstimated` (ceiling) and `costActual` (token-based, if provider returns it).
- `model` is set to `"z-ai-default"` (L127) when `policy.model === "default"` — not the actual model name. Should record the actual model returned by ZAI.

**BLOCKER-AI-3 (PR-SC-09):** Choose ONE of two paths for accept/reject tracking:

**Option A — Extend AIGatewayLog (additive migration):**
```prisma
model AIGatewayLog {
  // ... existing fields ...
  accepted         Boolean?  // NEW — true if user accepted, false if rejected
  rejectedReason   String?   // NEW — free-text reason
  confidence       Float?    // NEW — model self-reported confidence 0-1
  evidenceJson     String?   // NEW — JSON array of grounding records
  promptTemplateId String?   // NEW — which prompt version
  qualityScore     Int?      // NEW — human feedback (-1, 0, +1)
  modelVersion     String?   // NEW — full model version
  @@index([accepted])        // NEW — for "show me all rejected suggestions"
  @@index([promptTemplateId, createdAt])  // NEW — for prompt-version analytics
}
```

**Option B — New AISuggestion model (recommended):**
```prisma
model AISuggestion {
  id              String   @id @default(cuid())
  gatewayLogId    String   // ← links to AIGatewayLog
  gatewayLog      AIGatewayLog @relation(fields: [gatewayLogId], references: [id], onDelete: Cascade)
  suggestionType  String   // e.g. "listing.draft", "lead.score", "price.suggest"
  suggestionJson  String   // the structured suggestion payload
  status          String   @default("PENDING")  // PENDING | ACCEPTED | REJECTED | DISMISSED
  rejectedReason  String?
  acceptedAt      DateTime?
  acceptedBy      String?  // userId
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([gatewayLogId])
  @@index([status, createdAt])
  @@index([suggestionType, status])
}
```

**Recommendation:** Option B (new `AISuggestion` model) — keeps AIGatewayLog focused on the AI call (cost/latency/model), and AISuggestion focused on the human-review lifecycle. A single AIGatewayLog can produce multiple suggestions (e.g., SELLER_ASSISTANT returns 3 suggestions → 1 AIGatewayLog + 3 AISuggestion rows).

**Required test:**

```ts
// tests/integration/ai-suggestion-lifecycle.test.ts
test('AI suggestion lifecycle: PENDING → ACCEPTED, audited', async () => {
  const gatewayLog = await db.aIGatewayLog.create({ data: { taskType: 'SELLER_ASSISTANT', ... } });
  const suggestion = await db.aISuggestion.create({ data: { gatewayLogId: gatewayLog.id, suggestionType: 'listing.draft', suggestionJson: '...', status: 'PENDING' } });

  // User accepts
  const res = await callApi('POST', `/api/seller/assistant/suggestions/${suggestion.id}/accept`, sellerUser, {});
  expect(res.status).toBe(200);

  const updated = await db.aISuggestion.findUnique({ where: { id: suggestion.id } });
  expect(updated.status).toBe('ACCEPTED');
  expect(updated.acceptedBy).toBe(sellerUser.id);
  expect(updated.acceptedAt).not.toBeNull();

  // Audit log entry created
  const audit = await db.auditLog.findFirst({ where: { entityId: suggestion.id, action: 'ai.suggestion.accept' } });
  expect(audit).not.toBeNull();
});
```

### 3.5 AI response must state uncertainty + evidence limits

**Current state** (verified at `src/app/api/ai-gateway/route.ts:144-153, 161-170, 201-211`): system prompts do NOT instruct the model to state uncertainty or cite evidence.

**BLOCKER-AI-4 (PR-SC-09):** Every SELLER_ASSISTANT system prompt MUST include the following clauses:

```
You are a HEAVIX Business Assistant. Your role is advisory — you cannot perform actions.

RULES:
1. If evidence is insufficient to answer confidently, state "اطلاعات کافی نیست" (insufficient information) and list what data is missing.
2. Every suggestion MUST cite the records you used as evidence. Format: [{recordType, recordId, field}].
3. If your confidence in a suggestion is below 0.7, set the `uncertainty` field with a brief explanation.
4. Do NOT fabricate data. If a field is missing from the input, say "missing" — do not guess.
5. Do NOT suggest actions you are not authorized to recommend (e.g., legal advice, financial guarantees, price predictions).
6. All suggestions are drafts — the user must manually review and act on them.
```

**Required test:**

```ts
// tests/security/ai-uncertainty.test.ts
test('SELLER_ASSISTANT response includes uncertainty when evidence is insufficient', async () => {
  const input = { listings: [{ id: 'L1', title: 'Empty listing', status: 'DRAFT' }] };  // ← no leads, no views
  const res = await callApi('POST', '/api/ai-gateway', sellerUser, { task: 'SELLER_ASSISTANT', input });
  const parsed = SellerAssistantOutputSchema.parse(res.body.result);
  // When evidence is insufficient, the model should either:
  // (a) return zero suggestions with a top-level "insufficient data" message, OR
  // (b) return suggestions with confidence < 0.7 and uncertainty field set
  const hasUncertainty = parsed.suggestions.every(s => s.confidence >= 0.7 || s.uncertainty);
  expect(hasUncertainty).toBe(true);
});

test('SELLER_ASSISTANT suggestion cites evidence records', async () => {
  const input = { listings: [{ id: 'L1', title: 'My listing', viewCount: 0 }] };
  const res = await callApi('POST', '/api/ai-gateway', sellerUser, { task: 'SELLER_ASSISTANT', input });
  const parsed = SellerAssistantOutputSchema.parse(res.body.result);
  for (const s of parsed.suggestions) {
    expect(s.evidence.length).toBeGreaterThan(0);  // ← every suggestion cites evidence
    for (const e of s.evidence) {
      expect(e.recordType).toMatch(/^(listing|lead|order|payment|inventory)$/);
      expect(e.recordId).toBeTruthy();
    }
  }
});
```

---

## 4. Per-PR Test Requirements

Every PR-SC-XX MUST include tests in the categories below, scoped to the PR's changes. The Pre-PR checklist (§6) requires explicit enumeration of which test files cover which category.

### 4.1 Test category matrix

| Category | What it covers | Required for PR-SC | Mandatory files |
|---|---|---|---|
| **Unit** | Algorithm correctness (score calculation), validation (zod schemas), permission logic (can/canExport/canBulkAction), input filtering, output schema parsing | ALL PRs | `tests/unit/<feature>.test.ts` |
| **Integration** | Real DB, real API route, audit row created, side effects (cache invalidation, notifications) | ALL PRs that touch API routes or DB | `tests/integration/<feature>.test.ts` |
| **Security** | Negative tests: unauthorized (401), forbidden (403), cross-tenant (Seller A vs Seller B), readonly bypass, field-policy bypass, export-permission bypass | ALL PRs that expose seller-facing resources | `tests/security/<feature>-security.test.ts` |
| **Regression** | Existing flows still work after the change (e.g., admin can still list all listings; existing API consumers don't break) | ALL PRs | `tests/regression/<feature>.test.ts` |
| **Migration** | Migration is reversible; backfill script runs; rollback SQL works | PR-SC-01, PR-SC-02, PR-SC-03 | `tests/migration/<pr-id>.test.ts` |
| **Accessibility** | Keyboard nav, screen reader, color contrast, focus management | PR-SC with UI changes (PR-SC-04, PR-SC-05, PR-SC-06, PR-SC-07, PR-SC-08, PR-SC-09) | `tests/a11y/<page>.test.ts` (axe-core) |
| **Responsive** | Layout at 320px, 768px, 1280px breakpoints; no horizontal scroll; tap targets ≥44px | PR-SC with UI changes | `tests/responsive/<page>.test.ts` (Playwright) |
| **AI cost cap** | Single AI call ≤ `policy.costCeilingUsd`; daily budget not exceeded; monthly budget not exceeded | PR-SC-09 (and any PR adding AI tasks) | `tests/security/ai-cost-cap.test.ts` |
| **AI quality eval** | Golden dataset: 20+ inputs with expected output shape; LLM output passes schema; confidence/uncertainty populated | PR-SC-09 | `tests/ai-eval/seller-assistant-golden.test.ts` |
| **AI forbidden-data leakage** | Input contains PII → output does not echo it; input contains other-seller data → output does not reference it | PR-SC-09 | `tests/security/ai-leakage.test.ts` |
| **Concurrency** | Two simultaneous requests: exactly one succeeds (atomic updateMany); audit rows for both success and failure | PR-SC that adds transactional actions | `tests/concurrency/<action>.test.ts` |

### 4.2 Coverage thresholds

- **Unit:** ≥90% line coverage for new lib files (`src/lib/<feature>.ts`).
- **Integration:** ≥80% line coverage for new API routes.
- **Security:** 100% of negative-test scenarios in §2.2, §2.3, §2.5, §2.6 must have a corresponding test file.
- **AI:** 100% of input-filtering and output-schema rules must have a test.
- The PR description MUST include the coverage report (`bun run test:coverage`).

### 4.3 Test data fixtures

- Use `prisma/seed-test-fixtures.ts` (already exists) for shared fixtures.
- Each test file should create its own data in a `beforeAll` and clean up in `afterAll` (or use a transaction that rolls back).
- NEVER share state between test files — tests must be order-independent.
- NEVER use production data — even anonymized production data is forbidden in test fixtures (PII leak risk).

---

## 5. Pre-PR Checklist (Gate Template)

Every PR-SC-XX MUST pass this checklist before merge. Copy this template into the PR description and tick every box.

```markdown
## Pre-PR Checklist — PR-SC-XX

### Scope manifest
- [ ] PR scope matches `docs/product/STORE-CENTER-IMPLEMENTATION-PLAN.md` PR-SC-XX section
- [ ] No out-of-scope changes (file diff matches the PR-SC-XX "Files" list)
- [ ] Dependency graph respected (PR-SC-XX depends on PR-SC-YY which is MERGED)

### CI
- [ ] CI on HEAD (not the PR branch) is green
- [ ] `bun run typecheck` — 0 errors
- [ ] `bun run lint` — 0 errors
- [ ] `bun run test` — all pass
- [ ] `bun run test:coverage` — meets §4.2 thresholds
- [ ] `bun run build` — PASS

### Tests by category (§4)
- [ ] Unit — files: <list>
- [ ] Integration — files: <list>
- [ ] Security — files: <list> (mandatory if PR exposes seller-facing resource)
- [ ] Regression — files: <list>
- [ ] Migration — files: <list> (PR-SC-01/02/03 only)
- [ ] Accessibility — files: <list> (PR-SC-04..09 if UI)
- [ ] Responsive — files: <list> (PR-SC-04..09 if UI)
- [ ] AI cost cap — files: <list> (PR-SC-09 only)
- [ ] AI quality eval — files: <list> (PR-SC-09 only)
- [ ] AI forbidden-data leakage — files: <list> (PR-SC-09 only)
- [ ] Concurrency — files: <list> (if PR adds transactional actions)

### Migration review (§1.4 — PR-SC-01/02/03 only)
- [ ] M1 Additive (no DROP, no narrowing type changes)
- [ ] M2 Defaults (NULL or DEFAULT value on every new column)
- [ ] M3 Backfill plan documented
- [ ] M4 Indexes declared (FK columns, query-hot columns)
- [ ] M5 Rollback SQL documented (DROP COLUMN/TABLE; rollback order)
- [ ] M6 Impact on existing API paths listed
- [ ] M7 Seed updated (permissions.ts + seed-rbac.ts + ROLE_PERMISSIONS)

### Architecture (§1)
- [ ] ADR-005 alignment: this PR does NOT introduce new misalignments (cite §1.1 row)
- [ ] Record ownership: tenant-scope declared on new resources (§1.2)
- [ ] Duplicate-model: no new parallel models (§1.3)
- [ ] main-DB vs store-DB: new code uses correct Prisma client (§1.5)

### Security (§2)
- [ ] Permission enforcement: every new API route uses `requireAdmin(permKey)` (§2.1)
- [ ] Cross-seller negative test included (§2.2)
- [ ] Sensitive field + controller-status: readonlyWhen uses persistedRecord; TOCTOU test included (§2.3)
- [ ] Financial/sensitive ops: idempotent (updateMany with precondition) + audited (auditMutationTransactional) (§2.4)
- [ ] Export + PII: `permissions.export` declared explicitly (NOT relying on `|| read` fallback) (§2.5)
- [ ] VIP Showroom: all 4 paths (VIP-1..VIP-4) tested (§2.6, PR-SC-08 only)

### AI (§3, PR-SC-09 only)
- [ ] Input whitelist + PII strip + other-seller-data strip (§3.1)
- [ ] Output validated with zod schema; never written directly to DB; never changes permissions (§3.2)
- [ ] No `tools`/`function_call`/`tool_choice` parameter in ZAI calls (§3.3)
- [ ] AIGatewayLog extended OR AISuggestion model created (§3.4)
- [ ] System prompt includes uncertainty + evidence clauses (§3.5)

### Rollback
- [ ] Rollback plan documented (revert PR + DROP COLUMN/TABLE)
- [ ] Rollback tested (apply migration, run tests, rollback migration, run tests again)

### Permissions in code + seed + test
- [ ] Permission key added to `src/lib/authorization/permissions.ts` PERMISSIONS array
- [ ] Permission key added to `ROLE_PERMISSIONS` map (SELLER, BUYER, MODERATOR as appropriate)
- [ ] Permission key seeded in `prisma/seed-rbac.ts`
- [ ] Permission key asserted in a test (`can(sellerUser, 'store.crm.read') === true`)

### Multi-tenant negative test (mandatory for seller-facing resources)
- [ ] Seller A cannot read Seller B's records (List, Detail, Export) (§2.2)
- [ ] Seller A cannot write/delete/action Seller B's records (§2.2)
- [ ] Test file: `tests/security/tenant-isolation-<resource>.test.ts`

### Accessibility + responsive (UI PRs only)
- [ ] axe-core scan: 0 violations
- [ ] Keyboard navigation: tab order logical, focus visible, no traps
- [ ] Screen reader: ARIA labels present, semantic HTML
- [ ] Color contrast: WCAG AA (4.5:1 for body text, 3:1 for large text)
- [ ] Responsive: 320px / 768px / 1280px breakpoints pass
- [ ] Tap targets: ≥44×44px on mobile

### AI cost / quality (AI PRs only — PR-SC-09)
- [ ] Cost cap test: single call ≤ `policy.costCeilingUsd`
- [ ] Daily budget test: 100 calls in a day → 101st denied
- [ ] Monthly budget test: budget exhausted → all calls denied
- [ ] Quality eval: golden dataset (20+ inputs) passes schema + confidence/uncertainty checks
- [ ] Forbidden-data leakage: PII in input not echoed in output; other-seller data not referenced

### Independent critic report
- [ ] Critic report attached (separate from implementer)
- [ ] Critic re-ran §3 (Architecture), §4 (Security), §5 (AI) against the merged result
- [ ] Critic signed off OR listed remaining gaps with severity

### Final status
- [ ] IMPLEMENTED — code complete, compiles, lint clean
- [ ] FUNCTIONAL — manual smoke test passes (implementer)
- [ ] VERIFIED — automated tests pass on CI
- [ ] COMPLETE — critic report attached, all gates green, ready to merge
```

---

## 6. Per-PR Scope Matrix

Which gates apply to which PR. `✓` = mandatory, `—` = not applicable, `⚠` = conditional (see note).

| Gate | PR-SC-01 | PR-SC-02 | PR-SC-03 | PR-SC-04 | PR-SC-05 | PR-SC-06 | PR-SC-07 | PR-SC-08 | PR-SC-09 |
|---|---|---|---|---|---|---|---|---|---|
| §1.1 ADR-005 alignment (row 1) | ✓ | ✓ (row 3) | ✓ (rows 7, 8) | — | ✓ (row 5) | ✓ (row 5) | ✓ (row 8) | ✓ (row 3) | ✓ (row 10) |
| §1.2 Tenant scope | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| §1.3 Duplicate-model | — | — | ✓ (Part disambiguation) | — | — | — | — | — | — |
| §1.4 Migration review | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| §1.5 main vs store DB | — | — | ✓ | — | ✓ (cross-DB KPI) | — | — | — | — |
| §2.1 Permission enforcement | — | ✓ (new perms) | — | ✓ | — | ✓ (new perms) | ✓ (new perms) | ✓ (new perms) | ✓ (AI perms) |
| §2.2 Cross-seller negative test | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| §2.3 readonlyWhen + TOCTOU | — | — | — | ✓ | — | ✓ | ✓ | ✓ | — |
| §2.4 Idempotent + audited | — | — | — | — | — | — | — | — | — |
| §2.5 Export + PII | — | ✓ (SalesTeamMember PII) | — | — | — | ✓ (Lead PII) | — | — | — |
| §2.6 VIP Showroom (4 paths) | — | — | — | — | — | — | — | ✓ | — |
| §3.1 AI input whitelist | — | — | — | — | — | — | — | — | ✓ |
| §3.2 AI output schema | — | — | — | — | — | — | — | — | ✓ |
| §3.3 AI no function-calling | — | — | — | — | — | — | — | — | ✓ |
| §3.4 AIGatewayLog / AISuggestion | — | — | — | — | — | — | — | — | ✓ |
| §3.5 AI uncertainty + evidence | — | — | — | — | — | — | — | — | ✓ |
| §4 Test categories | Migration | Migration | Migration | UI + Security | UI | UI + Security | UI + Security | UI + Security | UI + AI |
| §5 Pre-PR checklist | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 7. BLOCKER Summary

The following BLOCKERs MUST be resolved before the named PR can merge. BLOCKERs are not optional — a PR that ships with an unresolved BLOCKER is rejected at review.

| ID | Title | Must be resolved by | Affects |
|---|---|---|---|
| **BLOCKER-A1** | `PremiumSubscription` is per-USER, not per-Company — VIP showroom enforcement unimplementable | PR-SC-02 (add `companyId` to PremiumSubscription OR create CompanySubscription join) | PR-SC-02, PR-SC-08 |
| **BLOCKER-A2** | `Lead` has no `sellerId` column — dashboard/CRM KPIs cannot filter by seller | PR-SC-01 (acknowledge in ADR-005 §3) + PR-SC-05/06 (use JOIN via `listing.sellerId`) | PR-SC-05, PR-SC-06 |
| **BLOCKER-A3** | ADR-005 §6 falsely claims `MachinePassport` has `source` and `verification` fields | PR-SC-03 (treat all per-section verification fields as new) + ADR-005 §6 correction | PR-SC-03 |
| **BLOCKER-A4** | Universal Resource API has NO tenant-scoping — any user with `*.read` sees ALL records | PR-SC-01 (ship `buildTenantWhere` helper + wire into data-adapter) OR a PR-SC-00 prerequisite | PR-SC-04 onward |
| **BLOCKER-A5** | Store-DB TOCTOU: `updateResourceNonTransactional` has no `SELECT FOR UPDATE` | Document as KNOWN LIMITATION in PR-SC that touches store-domain controller-status fields (none currently in PR-SC-01..09) | Future PRs |
| **BLOCKER-AI-1** | SELLER_ASSISTANT input has no whitelist/PII-strip/other-seller filter | PR-SC-09 (ship `src/lib/ai-input-filter.ts`) | PR-SC-09 |
| **BLOCKER-AI-2** | AI output has no zod schema validation; raw `JSON.parse` with regex extraction | PR-SC-09 (ship `src/lib/ai-output-schemas.ts`) | PR-SC-09 |
| **BLOCKER-AI-3** | AIGatewayLog lacks accept/reject/confidence/evidence/promptTemplate fields; `tokensUsed` declared but never populated | PR-SC-09 (extend AIGatewayLog OR create AISuggestion model) | PR-SC-09 |
| **BLOCKER-AI-4** | SELLER_ASSISTANT system prompt does not require uncertainty/evidence clauses | PR-SC-09 (update system prompt + add test) | PR-SC-09 |

**PR-SC-01 BLOCKERs that must be satisfied at merge time:**

1. **BLOCKER-A2** acknowledged in ADR-005 §3 (Lead has no `sellerId` — JOIN via `listing.sellerId` required for KPI queries).
2. **BLOCKER-A4** — PR-SC-01 MUST ship the `buildTenantWhere(userId, config)` helper and wire it into `data-adapter.ts` (`listResources`, `getResource`, `createResource`, `updateResource`, `deleteResource`), OR open a PR-SC-00 prerequisite that does so. Without this, PR-SC-04 through PR-SC-09 cannot pass §2.2 cross-seller negative tests.
3. **BLOCKER-A5** acknowledged in PR-SC-01 description (store-DB TOCTOU is a KNOWN LIMITATION per ADR-003 §5 — no PR-SC-01..09 touches store-domain controller-status fields, so this is documentation-only for now).
4. **§1.4 Migration review** — all 7 items (M1-M7) documented in the PR description.
5. **§1.1 ADR-005 alignment** — row 1 (Company branding) must be reconciled: ADR-005 §1 must acknowledge the 5 fields that already exist on Company (`logoUrl`, `coverImage`, `slug`, `metaTitle`, `metaDescription`); PR-SC-01 must add only the 4 truly-new fields (`bannerUrl` OR reuse `coverImage`, `brandColor`, `storeDescription`, `storeSlug`).

PRs PR-SC-02 through PR-SC-09 inherit BLOCKER-A4 (tenant scope) from PR-SC-01 — if PR-SC-01 does not ship the tenant-scope helper, every subsequent PR is blocked.

---

## 8. Document maintenance

- This document is a LIVING gate. Update it when:
  - ADR-005 is amended (add a new row to §1.1 alignment table).
  - A new BLOCKER is discovered (add to §7).
  - A gate is found to be insufficient (tighten the rule, add a test pattern).
  - A PR-SC merge reveals a gap (add a regression test to §4).
- Changes to this document require approval from the /expert agent (or the engineering lead if /expert is unavailable).
- The /critic agent should re-audit this document quarterly (every 90 days) to ensure it remains grounded in the actual codebase.

---

**End of document.**
