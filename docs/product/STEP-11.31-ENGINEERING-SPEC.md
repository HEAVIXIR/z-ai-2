# HEAVIX Store Center — STEP 11.31 Engineering Spec (PR-by-PR)

- **Status:** IMPLEMENTATION-READY — for owner sign-off before opening PR-SC-04 onward
- **Date:** 2026-10-10
- **Author:** /detailed agent (STEP 11.31, Task ID 11.31-/detailed)
- **Baseline:** `main` = `f597562` (PR #8 + PR #9 + PR #10 merged; PR-SC-01 Lead CRM Foundation is LIVE on `main`)
- **PR-SC-00 status:** IMPLEMENTED on branch `security/pr-sc-00-tenant-scoping` (HEAD `4a2f579`); CI green; integration test wired into CI; **NOT yet merged** to `main`. **Gate:** no seller-scoped UI PR (PR-SC-04 onward) may merge until PR-SC-00 is COMPLETE (merged + `tests/integration/tenant-scope-real.ts` passes in a PG environment + independent /Critic review).
- **Repository:** `/home/z/heavix`; GitHub: HEAVIXIR/z-ai-2.
- **Scope:** Per-PR engineering specs for PR-SC-04, PR-SC-05, PR-SC-06, PR-SC-03, PR-SC-07, PR-SC-08, PR-SC-09 (the 7 PRs mandated by the /strategy directive for STEP 11.31). Each PR is small, independent, revertible, and has API contract + acceptance test defined BEFORE coding.
- **Related docs:** `docs/ADR-005-store-center-architecture.md`, `docs/ADR-005-amendment-01.md`, `docs/product/STORE-CENTER-DETAILED-DESIGN.md`, `docs/product/STORE-CENTER-IMPLEMENTATION-PLAN.md`, `docs/product/STORE-CENTER-ROADMAP.md`, `docs/product/PR-SC-00-SCOPE.md`, `docs/product/PR-SC-01-SCOPE.md`, `docs/ADR-003-audit-transactionality.md`.

---

## 0. How To Read This Document

- **Existing** = verified to exist in `prisma/schema.prisma`, `prisma/store-schema.prisma`, or `src/**` at the baseline commit. Every claim cites the file + line.
- **NEW** = does NOT exist on baseline; the resolving PR is named.
- **No route/model is presented as "existing" without verification.** Every "exists" claim below has a file:line citation in §3 (Grounding Facts).
- **No field is added to the schema just because the UX prototype shows it.** ADR-005-amendment-01 §1/§2/§5/§6 corrected 5 false premises; this spec applies those corrections. The genuinely-new field count is computed in §11.
- **AI is advisory-only everywhere** (ADR-005 §8). No AI route may mutate DB state. Every AI surface has a human-confirmation gate.
- **VIP enforcement is server-side on every publish + receive path** (ADR-005 §2). No client-only gating.
- **Cross-DB transactions are NOT supported** (ADR-003). Every spec below states the main DB vs store DB boundary per surface.

### 0.1 Hard Rules (carry forward from the task brief)

1. Audit existing code/models/APIs FIRST. Reconcile docs with implementation.
2. No route/model presented as "existing" without verification.
3. AI is advisory-only (ADR-005 §8). No autonomous mutations.
4. VIP enforcement is server-side on EVERY publish + receive path (ADR-005 §2).
5. Each PR is small, independent, revertible.
6. Each PR has API contract + acceptance test defined BEFORE coding.
7. No seller-scoped UI may ship without verified server-side ownership enforcement (PR-SC-00 must be COMPLETE first).
8. Documentation only — no code, schema, or PR changes by this task.

---

## 1. PR-SC-00 — Tenant-Scoping Gate (prerequisite, NOT in the 7-PR scope)

PR-SC-00 is the hard prerequisite for every PR specified in this document. It is **already IMPLEMENTED** on branch `security/pr-sc-00-tenant-scoping` (HEAD `4a2f579`, off `main` `f597562`) but **NOT yet merged**. The /strategy directive + the task brief mandate: PR-SC-00 must be COMPLETE before any seller-scoped UI PR (PR-SC-04 onward) merges.

### 1.1 What PR-SC-00 ships (verified against actual files on the branch)

- `src/lib/admin/tenant-scope.ts` (NEW, pure functions): `buildTenantWhere`, `mergeTenantWhere`, `assertCreateOwner`, `checkRowOwnership`, `DENY_ALL` sentinel, `TenantAccessContext` type. Fail-closed: anonymous on a seller-scoped resource → `denyAll`; misconfigured ownership → `denyAll`. **Source: `src/lib/admin/tenant-scope.ts:1-289`.**
- `src/lib/admin/types.ts` (EXTENDED): `AdminResourceConfig.ownership?: AdminOwnershipConfig` (L313) + `AdminOwnershipConfig` interface (L316-341) with `ownerField` (direct), `relation: { field, ownerField }` (indirect), `moderatePermission` (cross-tenant bypass). **Source: `src/lib/admin/types.ts:291-341`.**
- `src/lib/admin/data-adapter.ts` (EXTENDED): all 5 functions (`listResources`, `getResource`, `createResource`, `updateResource`, `deleteResource`) accept an optional `tenantCtx: TenantAccessContext` and apply the tenant filter (via `mergeTenantWhere`) to BOTH the `findMany.where` and `count.where` (so pagination total is correct), and the transactional `SELECT FOR UPDATE` path AND the non-transactional store-DB path. `createResource` uses `assertCreateOwner`; `updateResource`/`deleteResource` use `findFirst` (non-owner → null → 404) + `checkRowOwnership` defense-in-depth.
- `src/app/api/admin/resources/[resource]/route.ts` (EXTENDED): `resolveTenantCtx(userId, config)` helper (L70-81) resolves `isAdmin` + `hasModeratePerm` via RBAC (NEVER from request body/query). `GET` (L98) + `POST` (L172, L186) thread `tenantCtx` into the data-adapter.
- `src/app/api/admin/resources/[resource]/[id]/route.ts`, `bulk/route.ts`, `export/route.ts`, `[id]/action/route.ts` (EXTENDED): each resolves + threads `tenantCtx`; `executeAction` checks ownership after loading `before`.
- `src/lib/admin/resources/listing.ts` (EXTENDED): `ownership: { ownerField: 'sellerId', moderatePermission: 'listing.moderate' }` (L25-28). **The first (and only, as of baseline) seller-scoped resource with ownership declared.**
- **No other resource has `ownership` declared.** Verified by `grep "ownership:" src/lib/admin/resources/` — only `listing.ts:25` matches.
- `tests/security/tenant-scope.test.ts` (NEW, 40 unit tests — pure-function logic).
- `tests/security/tenant-scope-wiring.test.ts` (NEW, 11 wiring contract tests — mocks Prisma model via Proxy).
- `tests/integration/tenant-scope-real.ts` (NEW, 13 real-API-path assertions — requires PostgreSQL; **NOT run in CI sandbox**; wired into CI in commit `4a2f579`).

### 1.2 Gate for PR-SC-04 onward (per task brief + /strategy)

PR-SC-04 (the first seller-scoped UI PR) may NOT merge until ALL of:

1. PR-SC-00 is merged to `main`.
2. `tests/integration/tenant-scope-real.ts` passes in a PostgreSQL environment (proves Seller A cannot LIST/GET/UPDATE/DELETE Seller B's listings via the real API path).
3. Independent /Critic review confirms the wiring (no `requireOwnership`/`canAccessResource`/`buildTenantWhere` zero-caller regressions; tenant filter actually applied on every universal route).

**Each PR in this document that introduces seller-scoped data must add a `ownership` config for its resource (or use a custom route with explicit ownership check) AND ship a dynamic cross-seller negative test as a merge gate.** The mechanism is general; adding config is additive.

---

## 2. PR-SC-01 — Lead CRM Foundation (prerequisite, ALREADY on `main`)

PR-SC-01 was merged to `main` as commit `c66e060`. The following are LIVE on `main` and cited as existing in every spec below:

- **`Lead` model** extended with 10 nullable columns + 3 indexes + 2 User back-relations. **Source: `prisma/schema.prisma:618-660`.**
  - `status String @default("NEW")` (L635) — CRM pipeline (NEW|CONTACTED|QUALIFIED|CLOSED|LOST), app-layer-validated.
  - `assignedToId String?` + `assignedTo User? @relation("LeadAssignee")` (L639-640).
  - `score Int?`, `scoreVersion String?`, `scoreBreakdown Json?`, `scoredAt DateTime?` (L645-648).
  - `scoreOverrideById String?` + `scoreOverrideBy User? @relation("LeadScoreOverride")` (L651-652).
  - `scoreOverrideReason String?`, `scoreOverrideNote String?`, `scoreOverrideAt DateTime?` (L653-655).
  - Indexes: `@@index([status])`, `@@index([assignedToId])`, `@@index([listingId, status])` (L657-659).
  - **`Lead.sellerId` was deliberately NOT added** (per ADR-005-amendment-01 §3). Ownership resolves via `Lead.listing.sellerId` (relation-based).
- **`src/lib/crm/lead-score.ts`** (NEW): pure function, 6 factors, 0-100 clamped, `LEAD_SCORE_VERSION = "v1"`, explainable `breakdown[]` + `reason`, `leadScoreBand(score)` → HOT/WARM/COLD.
- **`src/lib/crm/lead-status.ts`** (NEW): 5 canonical statuses + `ALLOWED_TRANSITIONS` + `validateTransition(from, to)` (fail-closed) + `isTerminalStatus()`.
- **Permission keys** added to `PERMISSIONS` array (`src/lib/authorization/permissions.ts:119-120`) + `ROLE_PERMISSIONS.SELLER` (L269-270): `store.crm.read`, `store.crm.manage`. ADMIN gets both via `[...PERMISSIONS]` spread. BUYER + MODERATOR explicitly excluded.
- **Seed**: `prisma/seed-rbac.ts` has hand-crafted Persian entries for both keys.
- **Tests** (68 total, all green on `main`): `tests/unit/lead-score.test.ts` (40), `tests/unit/lead-status.test.ts` (19), `tests/security/lead-crm-permissions.test.ts` (9).
- **ADR-005-amendment-01.md** shipped with PR-SC-01 → on `main`.

### 2.1 What PR-SC-01 did NOT add (deferred per `docs/product/PR-SC-01-SCOPE.md`)

| Deferred item | Target PR |
|---|---|
| `Company.brandColor` + `Company.storeDescription` | PR-SC-04 (this spec) |
| `Showroom` + `SalesTeamMember` models | PR-SC-08 (this spec, self-contained) |
| `MachinePassport` 8 verification fields + `Listing.inventoryScore` | PR-SC-03 (this spec) |
| Lead CRM API route (GET/PATCH leads) | PR-SC-06 (this spec) |
| Lead CRM UI (Kanban) | PR-SC-06 (this spec) |
| Lead Score recalc background job | PR-SC-06 (this spec) |
| BLOCKER-A4 tenant-scoping fix | PR-SC-00 (IMPLEMENTED, gate pending) |

---

## 3. Grounding Facts (verified at baseline `main` = `f597562`)

Every spec below cites these facts. Any spec statement that conflicts with these is a documentation bug.

### 3.1 Main DB (`prisma/schema.prisma`)

| # | Model | Relevant fields (verified) | File ref |
|---|---|---|---|
| M1 | `Listing` | `id, slug @unique, title, description?, shortDesc?, price? BigInt, priceType, listingType, condition?, province?, city?, year?, workingHours?, status, featured, verified, showInLatest, viewCount, favoriteCount, publishedAt?, expiresAt?, soldAt?, sellerPhone?, sellerName?, brandId?, categoryId?, modelId?, sellerId?, companyId?, ...` + `images ListingImage[]`, `offers ListingOffer[]`, `leads Lead[]`, `passport MachinePassport?`, `inspections Inspection[]`, `deals Deal[]` | `schema.prisma:444-533` |
| M2 | `ListingImage` | `id, listingId, url, alt?, isPrimary, sortOrder, listing` | `schema.prisma:535-544` |
| M3 | `Lead` | `id, listingId, listing, leadType, viewerPhone?, viewerName?, note?, createdAt` + PR-SC-01 columns: `status @default("NEW"), assignedToId?, assignedTo?, score?, scoreVersion?, scoreBreakdown?, scoredAt?, scoreOverrideById?, scoreOverrideBy?, scoreOverrideReason?, scoreOverrideNote?, scoreOverrideAt?` + 3 indexes. **NO `sellerId`, NO `companyId`** — ownership resolves via `Lead.listing.sellerId` | `schema.prisma:618-660` |
| M4 | `ListingOffer` | `id, listingId, offerAmount BigInt, message?, status @default("PENDING"), counterAmount?, buyerName?, buyerPhone, buyerEmail?, buyerId?, sellerNote?, respondedAt?, createdAt, updatedAt` | `schema.prisma:1028-1050` (approx) |
| M5 | `PremiumSubscription` | `id, userId @unique, user, plan @default("BASIC"), status @default("ACTIVE"), startedAt, expiresAt?, featuredCredits, analyticsAccess, aiAssistantAccess, priorityLeads, companyPage, amount? BigInt, paymentRef?, createdAt, updatedAt`. **Per-USER, NOT per-Company. No `companyId`.** | `schema.prisma:1157-1175` |
| M6 | `MachinePassport` | `id, listingId @unique, listing, serialNumber?, inspectionDate?, inspectionResult?, events PassportEvent[], createdAt, updatedAt`. **NO `source`, NO `verification`, NO per-section `verifiedAt/By`.** All 8 per-section fields proposed in ADR-005 §6 are genuinely NEW (per ADR-005-amendment-01 §6). | `schema.prisma:1180-1189` |
| M7 | `PassportEvent` | `id, passportId, passport, eventType, title, description?, date, performedBy?, createdAt` | `schema.prisma:1192-1201` |
| M8 | `Company` | `id, name, slug @unique, description?, logoUrl?, coverImage?, website?, phone?, email?, address?, city?, province?, verified, premium, status @default("ACTIVE"), metaTitle?, metaDescription?, viewCount, createdAt, updatedAt, users User[], listings Listing[], documents CompanyDocument[], branches CompanyBranch[], verifications CompanyVerification[], partners/partnerOf, avgRating Float?, reviewCount, reviews Review[]`. **`logoUrl`, `coverImage`, `slug`, `metaTitle`, `metaDescription` ALREADY exist. `brandColor`, `storeDescription` DO NOT exist.** | `schema.prisma:1208-1245` |
| M9 | `DealRoom` | `id, listingId, listing, buyerId?, buyer?, sellerId?, seller?, buyerPhone, sellerPhone?, status @default("OPEN"), ...` | `schema.prisma:1330-1356` (approx) |
| M10 | `Inspection` | `id, listingId, listing, dealRoomId?, requestedBy, inspectorId?, status @default("REQUESTED"), scheduledDate?, completedAt?, checklist? String (JSON), score? Float, reportUrl?, photos? String (JSON), notes?, price? BigInt, createdAt, updatedAt`. Indexes: `@@index([listingId])`, `@@index([status])` | `schema.prisma:1382-1404` |
| M11 | `Deal` | `id, dealNumber @unique, sourceType, sourceId, buyerId?, buyer?, sellerId?, seller?, listingId?, listing?, agreedAmount BigInt?, currency @default("IRR"), transactionType @default("SALE"), status @default("DRAFT"), agreedAt?, confirmedAt?, completedAt?, cancelledAt?, cancelReason?, notes?, createdAt, updatedAt`. Indexes: `@@index([buyerId])`, `@@index([sellerId])`, `@@index([listingId])`, `@@index([status])` | `schema.prisma:2378-2419` |
| M12 | `AIGatewayLog` | `id, taskType, model, input?, output?, latencyMs?, tokensUsed?, cost? Float, success @default(true), error?, userId?, createdAt`. `taskType` is plain String (not enum) — values used: `SEARCH | LISTING_BUILDER | PRICE_ANALYSIS | MARKET_ANALYST | SELLER_ASSISTANT | SCRAPER | MODERATION | SEMANTIC_SEARCH`. Indexes: `@@index([taskType])`, `@@index([userId, taskType, createdAt])`. **`tokensUsed` declared but never populated** (BLOCKER-AI-3). | `schema.prisma:757-772` |
| M13 | `AIBudget` (singleton, `id @default("main")` + `@id`) | `dailyLimitUsd @default(10.0)`, `monthlyLimitUsd @default(200.0)`, `dailySpendUsd @default(0.0)`, `monthlySpendUsd @default(0.0)`, `dailyResetAt?`, `monthlyResetAt?`, `active @default(true)`, `createdAt`, `updatedAt` | `schema.prisma:783-804` |
| M14 | `AITaskPolicy` | `id, taskType @unique, allowedRoles (csv), hourlyLimit @default(30), dailyLimit @default(100), maxInputChars @default(5000), maxOutputTokens @default(2000), model @default("default"), timeoutMs @default(30000), costCeilingUsd @default(0.05), active @default(true)`. **Deny-by-default: tasks without an active policy row are rejected.** | `schema.prisma:806-821` |
| M15 | `AdminPreference` | `id, userId @unique, theme, density, locale, timezone, sidebarCollapsed, pinnedItems? Json, hiddenItems? Json, dashboardLayout? Json, defaultPageSize, createdAt, updatedAt`. **`hiddenItems Json?` exists** — reusable for AI suggestion dismissal per ADR-005-amendment-01 §20 (R20). | `schema.prisma:2548-2564` |
| M16 | `AuditLog` | `id, actorId?, actorType @default("USER") (USER|ADMIN|SYSTEM|AI), action, entityType, entityId?, beforeJson?, afterJson?, ip?, userAgent?, requestId?, reason?, createdAt`. Indexes: `@@index([actorId])`, `@@index([entityType, entityId])`, `@@index([action])`, `@@index([createdAt])` | `schema.prisma:1715-1733` |
| M17 | `User` | `id, firstName, lastName, email @unique, mobile @unique, role (ADMIN|SELLER|BUYER|MODERATOR|SUPPORT), status, companyName?, companyId?, ...` (no `storeSlug`, no `brandColor`) + PR-SC-01 back-relations `assignedLeads Lead[]`, `scoreOverrideLeads Lead[]` | `schema.prisma:1547+` |

### 3.2 Store DB (`prisma/store-schema.prisma`, separate PostgreSQL DB)

| # | Model | Relevant fields (verified) | File ref |
|---|---|---|---|
| S1 | `Part` | `id, name, nameFa?, sku @unique, categoryId, brandId?, description?, priceUsd Float, oldPriceUsd?, contactForPrice, stock, lowStockThreshold @default(5), images String @default("[]"), compatibleCars String @default("[]"), carModels CarModel[], sourceUrl?, active, featured, views, soldCount, createdAt, updatedAt`. **NO `inventoryScore`, NO `partNumber`, NO `oemNumber`, NO `documents`, NO `specifications`, NO `sellerId`, NO `companyId`.** | `store-schema.prisma:124-166` |
| S2 | `Order` | `id, orderNumber @unique, customerId, customer, userId? (nullable link to main-DB HEAVIX User), mechanicId?, mechanic?, status @default("PENDING"), subtotalUsd, shippingUsd, discountIrr, totalUsd, totalIrr, currencyRateAtOrder, marginPercentAtOrder, couponCode?, shippingAddress?, notes?, paymentStatus @default("UNPAID"), createdAt, updatedAt`. **NO `sellerId`, NO `companyId`** — orders are tied to customers/mechanics, not sellers (R13). | `store-schema.prisma:171-200` |
| S3 | `InventoryBalance` | `id, partId, part, warehouseId, warehouse, quantity @default(0), reserved @default(0), lowStockThreshold @default(5), createdAt, updatedAt`. `@@unique([partId, warehouseId])`, `@@index([warehouseId])`, `@@index([partId])`. **NO `sellerId`/`companyId` — store-domain resources are admin-only via Universal Resource API.** | `store-schema.prisma:469-487` |
| S4 | `StockMovement` | `id, partId, part, type (RECEIVE|SALE|RETURN|TRANSFER|ADJUSTMENT|DAMAGE), quantity (positive=in, negative=out), balanceAfter, reason?, reference?, createdBy?, warehouseId?, warehouse?, createdAt`. Indexes: `@@index([partId])`, `@@index([type])`, `@@index([createdAt])`. | `store-schema.prisma:418-435` |
| S5 | `Warehouse` | `id, name, code @unique, address?, active @default(true), createdAt, updatedAt`. | `store-schema.prisma:444-454` |

### 3.3 Permissions (`src/lib/authorization/permissions.ts`)

- `PERMISSIONS` array (L34-228): includes `admin.dashboard.read` (L36), `listing.read` (L52), `listing.moderate` (L57), `company.read` (L45), `company.update` (L46), `store.read` (L114), `store.manage` (L115), `store.crm.read` (L119), `store.crm.manage` (L120, both from PR-SC-01), `inventory.read` (L124), `inventory.manage` (L125), `analytics.read` (L150), `media.upload` (L167), `audit.read` (L164), `ai.execute` (L162), `listing.export` (L58).
- **Does NOT include** (verified — 0 matches for each): `store.profile.read`, `store.profile.manage`, `showroom.read`, `showroom.manage`, `showroom.admin`, `passport.read`, `passport.manage`, `store.reports.read`, `store.analytics.read`. These 9 keys are NEW and must be added by their resolving PR.
- `ROLE_PERMISSIONS` map:
  - `ADMIN: [...PERMISSIONS]` (L246) — ADMIN gets every key automatically.
  - `SELLER` (L248-271): includes `admin.dashboard.read`, `listing.{read,create,update,publish}`, `brand.read`, `category.read`, `product.read`, `part.read`, `machine.read`, `company.{read,update}`, `order.read`, `deal.{read,manage}`, `review.read`, `rfq.{read,manage}`, `offer.{read,update}`, `auction.read`, `request.read`, `dispute.read`, `inspection.read`, `transport.read`, `media.upload`, `analytics.read`, `price.read`, `store.crm.read`, `store.crm.manage`.
  - `BUYER` (L273-289): does NOT include `store.crm.*` (verified L273-289).
  - `MODERATOR` (L291-318): does NOT include `store.crm.*`.
  - `SUPPORT` (L320-333): does NOT include `store.crm.*`.

### 3.4 Resource configs (`src/lib/admin/resources/`)

- `listingConfig` (L1-): `ownership: { ownerField: 'sellerId', moderatePermission: 'listing.moderate' }` (L25-28). **ONLY seller-scoped resource with ownership declared** as of baseline.
- `companyConfig` (store-resources.ts:406-): **NO `ownership` declared** — Company is not yet seller-scoped via the Universal Resource API.
- `partConfig`, `orderConfig`, `paymentConfig` (store-resources.ts:88-, 164-, 254-): **NO `ownership` declared** — store-domain resources, admin-only.
- `inspectionConfig`, `transportConfig`, `disputeConfig`, `buyRequestConfig`, `dealConfig`, `rfqConfig`, `offerConfig`, `auctionConfig` (marketplace-resources.ts): **NO `ownership` declared** as of baseline.
- Resource registry: `src/lib/admin/resource-index.ts` registers 27 resources (lines 40-75).

### 3.5 Routes verified on baseline

- `/seller` — hub page, public, no auth gate. File: `src/app/seller/page.tsx`.
- `/seller/dashboard` — server component, `getCurrentUser()` → redirect on miss; queries `db.listing.findMany({ where: { sellerId: user.id } })`. **No RBAC permission check.** File: `src/app/seller/dashboard/page.tsx`.
- `/seller/leads` — **client component**, calls `GET /api/ai-sales-agent` (line 33). **No RBAC permission check.** File: `src/app/seller/leads/page.tsx`.
- `/admin/store/inventory` — server component, `requirePermission(user.id, 'store.read')`, queries `storeDb.stockMovement.findMany`. File: `src/app/admin/store/inventory/page.tsx`.
- `/api/seller/leads` — `GET` only, 73 lines. Uses `getCurrentUser()` (no permission check); scopes via `db.listing.findMany({ where: { sellerId: user.id } })` (line 26); comment on L43 confirms "Lead doesn't have status field, so we skip status filter for now" — **but PR-SC-01 has now added `status`, so this comment is stale**. File: `src/app/api/seller/leads/route.ts:1-73`.
- `/api/ai-sales-agent` — `GET`, calls `ZAI.create()` directly (no `/api/ai-gateway`, no `AITaskPolicy`, no `AIBudget`, no `AIGatewayLog`). **R11 violation — bypasses AI Gateway.** File: `src/app/api/ai-sales-agent/route.ts`.
- `/api/ai-seller-assistant` — `GET ?listingId=`, same direct-ZAI pattern. **R11 violation.** File: `src/app/api/ai-seller-assistant/route.ts`.
- `/api/ai-gateway` — `POST`, central AI router with 5 gates (rate limit, task policy, auth, quota, budget). File: `src/app/api/ai-gateway/route.ts:1-60+`.
- Universal Resource API: `src/app/api/admin/resources/[resource]/route.ts` (GET list + POST create), `[id]/route.ts` (GET/PATCH/DELETE), `bulk/route.ts`, `export/route.ts`, `[id]/action/route.ts`. **PR-SC-00 has wired tenant-scoping into all 5.**
- **Does NOT exist on baseline**: `/seller/identity`, `/seller/reports`, `/seller/showroom`, `/showroom/[slug]`, `/admin/store/passport/[listingId]`, `/api/seller/identity`, `/api/seller/dashboard`, `/api/seller/passport/*`, `/api/seller/showroom*`, `/api/seller/reports`, `/api/seller/assistant*`, `/seller/layout.tsx` (no shared seller sidebar).

### 3.6 Cross-DB constraint (ADR-003)

- Main DB (`db` from `@/lib/db`) and Store DB (`storeDb` from `@/lib/store-db`) are separate PostgreSQL databases via two Prisma clients.
- **Cross-DB transactions are NOT supported.** Mutations touching both DBs MUST use the non-transactional compensating-action pattern (write main → write store → on store failure, log + best-effort rollback of main).
- Audit logs for store actions are written to the **MAIN** DB `AuditLog` table (see `src/lib/admin/audit.ts:9-14`).
- `auditMutationTransactional` (`src/lib/audit-foundation.ts:243`) wraps mutation + audit in `db.$transaction` — **only effective for main-DB resources**. Store-DB resources MUST use the non-transactional `auditMutation` path (ADR-003 §5, BLOCKER-A5).

### 3.7 Tenant-scoping mechanism (PR-SC-00, on branch)

- Pure functions in `src/lib/admin/tenant-scope.ts:1-289`.
- `AdminOwnershipConfig` (`src/lib/admin/types.ts:316-341`): `{ ownerField?: string, relation?: { field, ownerField }, moderatePermission?: string }`.
- `TenantAccessContext`: `{ userId: string | null, isAdmin: boolean, hasModeratePerm: boolean }` — resolved server-side from session + RBAC, never from request.
- Fail-closed: anonymous on a seller-scoped resource → `denyAll`; misconfigured ownership → `denyAll`; owner field NULL on a row → treated as not-owned → 404 (read) / 403 (write).

### 3.8 Audit helper

- `logAudit(params)` — best-effort, never throws (`src/lib/admin/audit.ts:46-75`). Writes to MAIN DB `AuditLog`.
- `auditMutation(ctx, operation)` — non-transactional wrapper with before/after capture (`src/lib/audit-foundation.ts:120`).
- `auditMutationTransactional(ctx, operation)` — wraps mutation + audit in `db.$transaction`; **MAIN DB only** (`src/lib/audit-foundation.ts:243`).

---

## 4. Cross-Cutting Decisions (apply to every PR in this spec)

### 4.1 Authorization model — dual-gate pattern for every seller-scoped route

Every new seller-scoped route in this spec MUST satisfy:

1. `getCurrentUser()` → 401 if null (existing pattern at `src/app/seller/dashboard/page.tsx`).
2. `requirePermission(user.id, '<perm.key>')` → 403 if missing (canonical RBAC via `src/lib/admin-guard.ts`).
3. **Ownership scope** — only rows the seller owns are visible/mutable. Two valid paths:
   - **(a) Universal Resource API path**: declare `AdminResourceConfig.ownership` and use the existing 5 universal routes. Tenant filter is applied automatically. Seller A cannot see Seller B's rows (PR-SC-00 enforces).
   - **(b) Custom route path** (e.g., `/api/seller/identity`): explicitly build the seller-scoped `where` predicate: `user.companyId ? { OR: [{ sellerId: user.id }, { companyId: user.companyId }] } : { sellerId: user.id }` and verify ownership before every write.
4. Audit every mutation via `logAudit` (best-effort) or `auditMutationTransactional` (MAIN DB, atomic mutation+audit).

### 4.2 main DB vs store DB boundary

- Each PR spec below states which DB(s) it touches and confirms NO cross-DB transaction is required.
- For pages that aggregate KPIs from BOTH DBs (e.g., dashboard, reports), use `Promise.all` of two parallel branches — one `db.*` (main) and one `storeDb.*` (store). Store DB queries are **best-effort**: if Store DB is unreachable, render main-DB KPIs and show "—" for store KPIs with a retry button (NOT a full-page error).

### 4.3 AI enforcement contract (ADR-005 §8 — advisory-only)

Every AI surface in this spec MUST satisfy ALL of:

| # | Requirement | Enforcement |
|---|---|---|
| A1 | AI returns text/JSON only — NO function calls, NO DB writes | AI Gateway returns string content; route handler parses + returns to UI; no `db.*.create/update/delete` in AI path |
| A2 | Every AI response logged to `AIGatewayLog` with cost, latency, tokens, success/error | AI Gateway writes the row |
| A3 | `AITaskPolicy` deny-by-default — no policy row → 403 | AI Gateway checks before invoking LLM |
| A4 | `AIBudget` enforced — daily + monthly caps | AI Gateway checks before invoking LLM; returns 429 if exceeded |
| A5 | Each suggestion includes a link to the relevant page (no autonomous navigation) | UI contract: every suggestion object has `{ id, severity, message, ctaHref, ctaLabel, dismissible }` |
| A6 | User manually performs the action via the normal authenticated/authorized/audited path | UI: CTA is a `<Link href={ctaHref}>` (no fetch on click) |
| A7 | No PII crosses to the LLM | `sanitizeAiInput(payload)` helper strips `viewerPhone`, `viewerName`, `buyerPhone`, `buyerEmail`, `buyerName`, `paymentRef` before LLM call |
| A8 | No other-seller data crosses to the LLM | Seller-scoped query (§4.1) runs BEFORE the LLM input is assembled |
| A9 | Output schema validated (zod) — reject malformed | `src/lib/ai-output-schemas.ts` (NEW in PR-SC-09) |
| A10 | No `tools`/`function_call`/`tool_choice` in any ZAI call | Static test: grep + assertion (PR-SC-09) |

### 4.4 VIP enforcement contract (ADR-005 §2 — server-side, every path)

| Path | Enforcement | Failure response |
|---|---|---|
| `GET /showroom/[slug]` (public) | `Showroom.isActive === true` AND `companyHasActivePremium(companyId) === true` | `notFound()` (404) — DO NOT leak existence |
| `GET /api/showroom/[slug]` (public) | Same as above | `404` JSON |
| `GET /seller/showroom` (management) | `getCurrentUser()` + `user.companyId` set + `companyHasActivePremium(user.companyId)` + `requirePermission(user.id, 'showroom.manage')` | `403` Forbidden UI |
| `PATCH /api/seller/showroom` | Server re-validates VIP BEFORE write | `403` (VIP lapsed) |
| `POST /api/seller/showroom/feature` | Server re-validates VIP + ownership of the listing being featured | `403` |
| `POST /api/seller/showroom/publish` (set `isActive=true`) | Server re-validates VIP + `featuredListingIds.length >= 1` | `403` (VIP lapsed) / `409` (empty showroom) |

`companyHasActivePremium(companyId)` (NO migration required per ADR-005-amendment-01 §2):
```ts
async function companyHasActivePremium(companyId: string): Promise<boolean> {
  const sub = await db.premiumSubscription.findFirst({
    where: {
      user: { companyId },
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  return Boolean(sub);
}
```

### 4.5 Audit contract (every mutation)

All audit writes go to the MAIN DB `AuditLog` (per `src/lib/admin/audit.ts:9-14`). Audit is best-effort (`logAudit` never throws) OR atomic-with-mutation (`auditMutationTransactional` for main-DB mutations). Action keys are listed per-PR in §5-§11.

### 4.6 Empty data, pagination, filter, sort, transaction, concurrency — universal rules

| Concern | Rule (applies to every API in this spec) |
|---|---|
| **Empty data** | Empty list → `{ success: true, data: [], pagination: { total: 0, ... } }` (NOT 404). Empty single-resource → `404`. Empty form (no entity yet) → `404` with onboarding CTA in the UI. Empty KPI (denominator 0) → `null` or `"—"` in response, NOT `0` (avoid implying a real measurement). |
| **Pagination** | `?page=1&limit=50` (1-indexed page, default limit 50, max 200). Response includes `pagination: { page, limit, total, totalPages }`. `totalPages = ceil(total / limit)`. Page > totalPages → empty `data: []` (NOT error). |
| **Filter** | Only fields declared as `filterable` in the resource config OR explicitly listed in the route's query-param spec. Unknown filters → 400. Empty filter value (e.g., `?status=`) → treated as omitted. |
| **Sort** | `?sort=field` (asc) or `?sort=-field` (desc). Only fields declared as `sortable`. Unknown sort field → 400. Default sort per route. |
| **Transaction** | MAIN DB mutations use `auditMutationTransactional` (atomic mutation+audit). Store DB mutations use `auditMutation` (non-transactional — ADR-003 §5, BLOCKER-A5). Multi-DB operations use the compensating-action pattern (write main → write store → on store failure, log + best-effort rollback of main). |
| **Concurrency** | MAIN DB writes use `SELECT FOR UPDATE` (transactional path) OR optimistic re-check after load. Store DB writes have a known TOCTOU (BLOCKER-A5) — document per-route. Status transitions use `validateTransition` (from `src/lib/crm/lead-status.ts` for Lead; equivalent pattern for Showroom isActive, Passport verify) with the persisted `before` state (NEVER the request body's claimed state). |
| **Idempotency** | `PATCH` is idempotent (same body twice → same result; second call is a no-op + 200, not 409). `POST` for "add to set" operations (e.g., showroom featured-listing add) returns 409 on duplicate. |

### 4.7 Allowed/forbidden file policy (universal)

- **Each PR's "Allowed files" list is exhaustive.** Files NOT in the list are forbidden.
- **No unrelated refactor.** Touching a file outside the allowed list requires owner pre-approval + a justification note in the PR description.
- **No edits to:** `prisma/schema.prisma` outside the explicitly-allowed additions per PR; `src/lib/authorization/permissions.ts` beyond the explicitly-allowed new keys per PR; `src/lib/admin/tenant-scope.ts` (frozen post-PR-SC-00); `src/lib/admin/data-adapter.ts` (frozen post-PR-SC-00); universal resource API routes (frozen post-PR-SC-00) except for adding new `ownership` config in resource files.
- **No new migrations to existing tables** beyond the explicitly-allowed additive `ALTER TABLE`/`CREATE TABLE` per PR. Rollback = `DROP COLUMN`/`DROP TABLE` (additive only — no data loss).

---

## 5. PR-SC-04 — Store Identity (Company Branding)

**Stage:** 2 (Store Identity & Dashboard). **Branch:** `feature/pr-sc-04-store-identity` (NEW, off `main` post-PR-SC-00 merge). **Type:** UI + API + additive schema (2 new fields only).

### 5.1 Scope — IN

| Surface | Detail |
|---|---|
| Schema | `prisma/schema.prisma` — add 2 columns to `Company` (M8, L1208-1245): `brandColor String?` and `storeDescription String?`. **Only these 2 — NOT `logoUrl`, `bannerUrl`, `storeSlug`** (already exist or overlap with `coverImage`/`slug` per ADR-005-amendment-01 §1). Both additive, nullable, no default. |
| Permissions | Add 2 keys to `PERMISSIONS` array (`src/lib/authorization/permissions.ts`): `store.profile.read`, `store.profile.manage`. Add both to `ROLE_PERMISSIONS.SELLER` (so sellers can manage their own Company's identity) and `ROLE_PERMISSIONS.ADMIN` (via spread). **NOT** to BUYER or MODERATOR. Add hand-crafted Persian entries to `prisma/seed-rbac.ts`. |
| API | `src/app/api/seller/identity/route.ts` (NEW): `GET` returns the seller's own Company branding; `PATCH` updates the seller's own Company branding. Custom route (NOT universal Resource API) — see §5.5. |
| UI | `src/app/seller/identity/page.tsx` (NEW): server-component shell + client form. Reads via GET, writes via PATCH. |
| Layout | Reuses `src/app/seller/layout.tsx` (shipped by PR-SC-05 — see §6.1 dependency). If PR-SC-05 has not landed, this PR renders its own header/footer (matches existing `/seller/dashboard` pattern). |
| Validation | `src/lib/seller/identity-validation.ts` (NEW): pure functions — `validateBrandColor(hex)` (regex `^#[0-9A-Fa-f]{6}$`), `validateStoreDescription(text)` (max 2000 chars), `validateLogoUrlPath(path)` (relative path under `/uploads/` OR CDN allowlist). |
| Tests | `tests/unit/identity-validation.test.ts`, `tests/integration/identity-patch.test.ts`, `tests/security/tenant-isolation-identity.test.ts` (Seller A cannot GET/PATCH Seller B's Company → 403), `tests/security/identity-permissions.test.ts` (non-seller → 403), `tests/a11y/identity-page.test.ts`. |

### 5.2 Scope — OUT (explicitly deferred; NO field added because the UX prototype shows it)

| Out item | Reason | Target |
|---|---|---|
| `Company.logoUrl` | ALREADY EXISTS (`schema.prisma:1216`). Per ADR-005-amendment-01 §1, adding it again would fail migration. REUSE. | None — reuse |
| `Company.bannerUrl` | Overlaps existing `coverImage` (`schema.prisma:1217`). Per ADR-005-amendment-01 §1, REUSE `coverImage` for banner. | None — reuse |
| `Company.storeSlug` | Overlaps existing `slug @unique` (`schema.prisma:1212`). Per ADR-005-amendment-01 §1, REUSE `slug` for `/showroom/[slug]`. | None — reuse |
| `Company.metaTitle` / `metaDescription` | ALREADY EXIST (`schema.prisma:1224-1225`). PATCH may update them but NO migration. | None — reuse |
| Company verification flow (`Company.verified`) | Already exists (`schema.prisma:1221`); admin verification flow is a separate concern. | Future PR |
| Company document upload (`CompanyDocument`) | Already exists (`schema.prisma:1287-1300`); outside Store Identity scope. | Future PR |
| Multi-branch management (`CompanyBranch`) | Already exists (`schema.prisma:1302-1314`); outside Store Identity scope. | Future PR |
| Public showroom page (`/showroom/[slug]`) | PR-SC-08 (this spec, §10). | PR-SC-08 |

### 5.3 API contracts

#### `GET /api/seller/identity`

- **Auth:** `getCurrentUser()` → 401 if null. `requirePermission(user.id, 'store.profile.read')` → 403 if missing.
- **Ownership:** `user.companyId` MUST be set. If `user.companyId IS NULL` → 404 with `{ error: "شرکتی ثبت نشده", code: "NO_COMPANY" }`. The 404 includes a hint to call `/seller/identity/create` (out of scope — UI shows an onboarding card).
- **Query params:** none.
- **Response 200:**
  ```json
  {
    "success": true,
    "company": {
      "id": "...",
      "name": "...",
      "description": "...",
      "storeDescription": "...",
      "logoUrl": "...",
      "coverImage": "...",
      "brandColor": "#F58220",
      "phone": "...",
      "email": "...",
      "address": "...",
      "city": "...",
      "province": "...",
      "website": "...",
      "slug": "...",
      "metaTitle": "...",
      "metaDescription": "...",
      "verified": false,
      "premium": false,
      "viewCount": 0,
      "avgRating": null,
      "reviewCount": 0
    },
    "completion": { "percent": 60, "missing": ["brandColor", "storeDescription"] }
  }
  ```
- **Error codes:**
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — SELLER without `store.profile.read`, or BUYER/MODERATOR.
  - `404 Not Found` — `user.companyId` is null.
  - `500 Internal Server Error` — DB query failure.
- **Rate limit:** 60 req/min per user (standard seller API limit, applied via `src/lib/rate-limit.ts`).
- **Pagination:** N/A (single resource).
- **Filter/sort:** N/A.

#### `PATCH /api/seller/identity`

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'store.profile.manage')` → 403. **Server re-checks ownership** (`Company.id === user.companyId`) before write.
- **Request body** (all optional, partial update):
  ```json
  {
    "name": "...",
    "description": "...",
    "storeDescription": "...",
    "logoUrl": "...",
    "coverImage": "...",
    "brandColor": "#F58220",
    "phone": "...",
    "email": "...",
    "address": "...",
    "city": "...",
    "province": "...",
    "website": "...",
    "metaTitle": "...",
    "metaDescription": "..."
  }
  ```
  - The 2 NEW fields (`brandColor`, `storeDescription`) are writable. Existing fields (`name`, `description`, `logoUrl`, `coverImage`, `phone`, `email`, `address`, `city`, `province`, `website`, `metaTitle`, `metaDescription`) are also writable (this is the canonical branding edit surface).
  - **NOT writable** (server-ignored even if present in body): `id`, `slug`, `verified`, `premium`, `status`, `viewCount`, `avgRating`, `reviewCount`, `createdAt`, `updatedAt`. If any of these appears in the body, the route returns 400 with `{ error: "Field '<x>' is not editable", code: "IMMUTABLE_FIELD" }`.
- **Validation:**
  - `brandColor`: regex `^#[0-9A-Fa-f]{6}$` → 400 if invalid.
  - `email`: email format → 400 if invalid.
  - `website`: URL format → 400 if invalid.
  - `logoUrl`, `coverImage`: relative path under `/uploads/` OR a URL on the CDN allowlist → 400 otherwise.
  - `storeDescription`: max 2000 chars → 400.
  - `name`: 3..100 chars, required → 400.
- **Response 200:** same shape as GET (with the updated Company + completion).
- **Error codes:**
  - `400 Bad Request` — validation failure (per-field `errors[]` in response body).
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — SELLER without `store.profile.manage`, OR SELLER attempting to PATCH a Company whose `id !== user.companyId` (defense-in-depth — also enforced by the WHERE clause: `db.company.update({ where: { id: user.companyId }, data })`).
  - `404 Not Found` — `user.companyId` is null.
  - `409 Conflict` — NOT used (slug is NOT editable in this PR; no collision possible).
  - `500 Internal Server Error` — DB write failure.
- **Transaction:** MAIN DB only. Uses `auditMutationTransactional` — atomic mutation + audit (single DB, safe).
- **Concurrency:** Optimistic re-check. Route loads `Company` by `user.companyId`, applies validated patch, writes via `db.company.update({ where: { id: user.companyId } })`. Two concurrent PATCHes both succeed (last-writer-wins on each field). No `SELECT FOR UPDATE` needed (no cross-row invariant).
- **Audit:** `logAudit({ action: 'store.profile.update', entityType: 'Company', entityId: company.id, before, after, actorId: user.id })`. The `before`/`after` snapshots are the full Company row (read once before PATCH, once after).

### 5.4 Empty data, pagination, filter, sort, transaction, concurrency behavior

- **Empty (no company):** `user.companyId` is null → 404 + onboarding CTA. UI shows a card: "شرکتی ثبت نشده. برای مدیریت هویت فروشگاه، ابتدا یک شرکت ثبت کنید." + link to `/seller/identity/create` (out of scope).
- **Empty (new company, no branding):** GET returns the Company with `brandColor: null`, `storeDescription: null`, `logoUrl: null`, etc. `completion.percent = 0`, `missing = ["brandColor", "storeDescription", "logoUrl", ...]`. UI shows the form with empty fields + a hint: "تکمیل هویت فروشگاه باعث اعتماد خریداران می‌شود."
- **Pagination:** N/A (single resource).
- **Filter/sort:** N/A.
- **Transaction:** MAIN DB only — `auditMutationTransactional` (atomic).
- **Concurrency:** Last-writer-wins per field. No cross-row invariant. No `SELECT FOR UPDATE`.

### 5.5 main DB vs store DB boundary

- **MAIN DB only.** `db.company.update` / `db.company.findUnique`. **No store-DB query.** No cross-DB concern.

### 5.6 Ownership config

- **Custom route path (§4.1 path b).** The Company resource is NOT a good fit for the Universal Resource API because (i) the `companyConfig` (`src/lib/admin/resources/store-resources.ts:406-`) does NOT declare `ownership` (Company has a `users[]` back-relation — complex Company→User→role ownership, deferred per PR-SC-00-SCOPE.md), and (ii) the `/api/seller/identity` route is a single-row GET/PATCH for the current user's own Company, not a list/detail resource.
- **Server-side ownership enforcement:** `db.company.findUnique({ where: { id: user.companyId } })` (returns null if `user.companyId` is null or no such Company). PATCH uses `db.company.update({ where: { id: user.companyId }, data: validatedPatch })` — the WHERE clause is the ownership filter; a seller CANNOT pass another Company's `id` because `user.companyId` comes from the session, not the request body. The route explicitly 403s if a seller somehow attempts to PATCH with a foreign `id` (defense-in-depth).
- **No `AdminResourceConfig.ownership` change in this PR.** The `companyConfig` resource stays admin-only via the Universal Resource API (no seller-scoped listings/companies via that path). Seller-side Company editing goes through the custom `/api/seller/identity` route.
- **Negative test (mandatory merge gate):** `tests/security/tenant-isolation-identity.test.ts` — Seller A logs in, attempts `GET /api/seller/identity` after manually setting their session to reference Seller B's `companyId` (via a test fixture) → route returns 404 (the test fixture's `user.companyId` is Seller A's; the route always reads from session, not body). Also: Seller A attempts `PATCH /api/seller/identity` with body `{ "id": sellerB.companyId }` → route ignores `id` field (or 400s per §5.3), writes only to Seller A's Company.

### 5.7 Allowed files (exhaustive)

| File | Action | Notes |
|---|---|---|
| `prisma/schema.prisma` | EDIT (additive) | Add 2 columns to `Company`: `brandColor String?`, `storeDescription String?`. No other model touched. |
| `src/lib/authorization/permissions.ts` | EDIT | Add 2 keys to `PERMISSIONS` array; add both to `ROLE_PERMISSIONS.SELLER`. |
| `prisma/seed-rbac.ts` | EDIT | Add hand-crafted Persian entries for `store.profile.read` + `store.profile.manage`. |
| `src/app/api/seller/identity/route.ts` | NEW | `GET` + `PATCH`. |
| `src/app/seller/identity/page.tsx` | NEW | Server-component shell + client form. |
| `src/lib/seller/identity-validation.ts` | NEW | Pure validation functions. |
| `tests/unit/identity-validation.test.ts` | NEW | Unit tests for validation. |
| `tests/integration/identity-patch.test.ts` | NEW | Integration: PATCH updates Company + audit row created. |
| `tests/security/tenant-isolation-identity.test.ts` | NEW | Dynamic cross-seller negative test. |
| `tests/security/identity-permissions.test.ts` | NEW | Non-seller → 403. |
| `tests/a11y/identity-page.test.ts` | NEW | axe-core 0 violations. |
| `prisma/migrations/<timestamp>_pr_sc_04_company_branding/migration.sql` | NEW | Additive `ALTER TABLE "Company" ADD COLUMN "brandColor" TEXT, ADD COLUMN "storeDescription" TEXT;`. |
| `docs/product/PR-SC-04-SCOPE.md` | NEW | Scope manifest (mirrors §5.1-§5.13). |

### 5.8 Forbidden files

- `src/lib/admin/tenant-scope.ts` (frozen post-PR-SC-00).
- `src/lib/admin/data-adapter.ts` (frozen post-PR-SC-00).
- `src/app/api/admin/resources/**` (universal API — frozen post-PR-SC-00).
- `src/lib/admin/resources/company.ts` or `store-resources.ts` (do NOT add `ownership` to `companyConfig` — that is a separate follow-up PR per PR-SC-00-SCOPE.md).
- `prisma/store-schema.prisma` (no store-DB change).
- `src/app/seller/leads/**`, `src/app/seller/dashboard/**` (other PRs' surfaces).
- `src/app/admin/store/passport/**`, `src/app/showroom/**`, `src/app/seller/showroom/**`, `src/app/seller/reports/**` (other PRs' surfaces).
- `src/lib/crm/**` (PR-SC-01 surface, frozen).
- `src/lib/ai-*/**`, `src/app/api/ai-*/**`, `src/app/api/ai-gateway/**` (PR-SC-09 surface).

### 5.9 Dependencies (prior PRs must be COMPLETE)

- **PR-SC-00 — COMPLETE (merged + integration test passing).** Mandatory: this is the first seller-scoped UI PR. Without PR-SC-00's mechanism, the cross-seller negative test cannot be wired into the Universal Resource API pattern; the custom-route path still works but the broader seller-scoped UI gate is unmet.
- **PR-SC-01 — COMPLETE (already merged at `c66e060`).** Not strictly required for PR-SC-04 (no Lead dependency), but baseline alignment: PR-SC-01's permission pattern + seed pattern is the template for PR-SC-04's permission additions.
- **NOT a dependency:** PR-SC-05 (Dashboard), PR-SC-06 (CRM), PR-SC-03 (Passport schema), PR-SC-07 (Passport UI), PR-SC-08 (Showroom), PR-SC-09 (Reports).

### 5.10 Rollback

1. `git revert <PR-SC-04 merge SHA>`.
2. `ALTER TABLE "Company" DROP COLUMN "brandColor", DROP COLUMN "storeDescription";` (additive only — no data loss; existing rows unaffected).
3. `bun run db:seed-rbac` to remove the 2 permission keys (or leave them — orphan permission keys are harmless; the seed is idempotent and will not re-add them after the keys are removed from `permissions.ts`).
4. UI reverts to 404 on `/seller/identity`.
5. **Rollback order if PR-SC-05 has landed:** revert PR-SC-05 first (it adopts the seller layout that PR-SC-04 also adopts), then PR-SC-04.

### 5.11 Definition of Done (measurable, evidence-based)

- [ ] `bun run db:validate` passes (schema valid).
- [ ] `bun run typecheck` passes (0 errors).
- [ ] `bun run lint` passes (changed files clean).
- [ ] `bun run test` passes (existing + new tests green).
- [ ] `tests/unit/identity-validation.test.ts` — `brandColor` regex, `storeDescription` length cap, logo path validation all pinned.
- [ ] `tests/integration/identity-patch.test.ts` — PATCH updates `Company.brandColor` + `Company.storeDescription`; `AuditLog` row written with `action: 'store.profile.update'`, `entityType: 'Company'`, `entityId: <companyId>`, `beforeJson`/`afterJson` populated.
- [ ] `tests/security/tenant-isolation-identity.test.ts` — Seller A cannot read/patch Seller B's Company (PATCH body with foreign `id` → 400 immutable-field OR ignored; route writes only to `user.companyId`'s Company).
- [ ] `tests/security/identity-permissions.test.ts` — BUYER without `store.profile.read` → 403; MODERATOR without `store.profile.read` → 403; SELLER with `store.profile.read` → 200.
- [ ] `tests/a11y/identity-page.test.ts` — axe-core 0 violations on `/seller/identity`.
- [ ] Manual smoke: SELLER logs in → navigates to `/seller/identity` → form pre-filled with current Company data → edits `brandColor` to `#FF0000` → clicks Save → 200 → DB row updated → audit log entry visible in admin Audit Log viewer.
- [ ] Manual smoke: SELLER with `user.companyId = null` → `/seller/identity` → onboarding CTA card visible.
- [ ] CI `verify` workflow green on PR HEAD.
- [ ] Independent /Critic review: no BLOCKER findings on this PR's diff.

### 5.12 Audit action keys

| Mutation | Audit action key | EntityType | EntityId |
|---|---|---|---|
| Update Company branding (PATCH `/api/seller/identity`) | `store.profile.update` | `Company` | `company.id` |

### 5.13 Acceptance test summary (Playwright E2E)

1. Login as SELLER with `companyId` → navigate to `/seller/identity` → assert form pre-filled.
2. Edit `brandColor` to `#FF0000` → Save → assert 200, DB row updated, `AuditLog` entry `store.profile.update` written with `before/after` JSON.
3. Submit `brandColor: "red"` → assert 400 with field-level error.
4. Login as SELLER A → attempt `PATCH /api/seller/identity` with body `{ id: companyB.id, brandColor: "#000000" }` → assert 400 (immutable field) OR 200 with the write applied to Seller A's Company only (route ignores `id`).
5. Login as BUYER → assert 403.
6. Mobile 375px: form renders single-column, no horizontal scroll, all touch targets ≥ 44px.

---

## 6. PR-SC-05 — Dashboard (Real KPIs)

**Stage:** 2 (Store Identity & Dashboard). **Branch:** `feature/pr-sc-05-dashboard` (NEW, off `main` post-PR-SC-00 merge). **Type:** UI + API + new shared layout. **No schema change.**

### 6.1 Scope — IN

| Surface | Detail |
|---|---|
| API | `src/app/api/seller/dashboard/route.ts` (NEW): `GET` returns aggregated KPIs. **Real Prisma counts only — no sample numbers, no fabricated baseline.** |
| UI | `src/app/seller/dashboard/page.tsx` (REWRITE — currently 305 lines, server component, no RBAC check): refactor to call `GET /api/seller/dashboard`; add RBAC check (`admin.dashboard.read` already in `ROLE_PERMISSIONS.SELLER` per `permissions.ts:249`); add loading skeleton, empty state, error state, cross-DB best-effort state. |
| Layout | `src/app/seller/layout.tsx` (NEW): shared sidebar for all seller pages (R21 resolved). Sidebar entries: Dashboard, Identity, Leads, Reports (and Passport/Showroom once their PRs land — placeholder `hidden` until then). Mobile: bottom tab bar (Dashboard / Identity / Leads / Reports). All seller pages adopt this layout. |
| KPI computation | KPIs (per `docs/product/STORE-ANALYTICS-BI.md` KPI-1..KPI-4 + dashboard page spec `STORE-CENTER-DETAILED-DESIGN.md` §3.3): Active Listings, New Leads (7d), Open Offers, Total Views (lifetime — labeled explicitly per R10), Low-Stock Parts (store DB, best-effort), Open Store Orders (store DB, ADMIN-only for seller per R13), Conversion Rate. |
| Tests | `tests/integration/dashboard-real-data.test.ts` (sentinel: no sample numbers), `tests/integration/dashboard-empty-state.test.ts`, `tests/security/tenant-isolation-dashboard.test.ts`, `tests/a11y/dashboard-page.test.ts`, `tests/responsive/dashboard-page.test.ts`. |

### 6.2 Scope — OUT

| Out item | Reason | Target |
|---|---|---|
| "Views (30d)" KPI | `Listing.viewCount` is lifetime, not time-bounded (`schema.prisma:462`). `AnalyticsEvent` exists but is not instrumented for `LISTING_VIEW`. MVP shows lifetime views with explicit label "بازدید کل (از ابتدا)". | Future PR (instrument `AnalyticsEvent` for `LISTING_VIEW`) |
| Seller-scoped "Open Store Orders" KPI | `Order` (store-schema.prisma:171-200) has NO `sellerId`/`companyId` (R13). Cannot scope to seller. MVP shows this KPI as `null` for SELLERs with a tooltip; ADMIN sees the global count. | Future PR (add `sellerId`/`companyId` to Order + Part — separate ADR) |
| Seller-scoped "Low-Stock Parts" KPI | `Part` (store-schema.prisma:124-166) has NO `sellerId`/`companyId`. MVP shows the global count to ADMIN only; SELLER sees `null` with a tooltip. | Future PR |
| Smart Inventory Score column | Requires `Listing.inventoryScore` (PR-SC-03). | PR-SC-03 + future dashboard enhancement |
| AI Business Assistant widget | Requires PR-SC-09. | PR-SC-09 (this spec, §11) |
| Time-bounded revenue KPI | `Deal.agreedAmount` (schema.prisma:2392) is the closest field, but Deal→Seller attribution requires `Deal.sellerId` filter. MVP computes "Revenue (30d)" as `sum(Deal.agreedAmount where sellerId = user.id AND status = 'COMPLETED' AND completedAt > now-30d)`. | None — Deal has `sellerId` |
| Lead Score column on dashboard | Lead Score exists (PR-SC-01) but the dashboard is a KPI roll-up, not a lead list. | PR-SC-06 (CRM) |

### 6.3 API contract

#### `GET /api/seller/dashboard`

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'admin.dashboard.read')` → 403 (key already in `ROLE_PERMISSIONS.SELLER` per `permissions.ts:249`).
- **Ownership scope:** `user.companyId ? { OR: [{ sellerId: user.id }, { companyId: user.companyId }] } : { sellerId: user.id }` (the §4.1 dual-gate predicate). **Lead KPIs use `where: { listing: { ...sellerScope } }` per ADR-005-amendment-01 §3 (BLOCKER-A2) — NOT `where: { sellerId }`.**
- **Query params:** `?range=7d|30d|90d` (default `30d`); `?sellerId=<id>` (ADMIN-only — 403 for SELLER role attempting to query another seller's dashboard).
- **Response 200:**
  ```json
  {
    "success": true,
    "range": "30d",
    "kpis": {
      "activeListings": 12,
      "newLeads": 5,
      "openOffers": 3,
      "totalViews": 1234,
      "lowStockParts": null,
      "openStoreOrders": null,
      "conversionRate": 0.25
    },
    "recentLeads": [
      { "id": "...", "leadType": "CONTACT", "listingTitle": "...", "createdAt": "ISO" }
    ],
    "inventoryAlerts": [],
    "storeDbReachable": true
  }
  ```
  - `lowStockParts` and `openStoreOrders` are `null` for SELLER (R13 — no seller-scoped store data in MVP); real counts for ADMIN.
  - `conversionRate` is `openOffers / activeListings` (or `null` if `activeListings = 0`).
  - `recentLeads` is the latest 10 leads for the seller's listings (`select: { id, leadType, listing: { select: { title } }, createdAt }`, ordered by `createdAt desc`).
  - `inventoryAlerts` is `[]` for SELLER (no seller-scoped store data); for ADMIN, the latest 10 low-stock `InventoryBalance` rows (`where: { quantity: { lte: lowStockThreshold } }`).
- **Error codes:**
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — SELLER attempting `?sellerId=<other>`; or BUYER/MODERATOR without `admin.dashboard.read`.
  - `500 Internal Server Error` — main DB query failure. Store DB failure does NOT 500 (sets `storeDbReachable: false`).
- **Rate limit:** 60 req/min per user.
- **Pagination:** N/A (KPI aggregate; `recentLeads` is fixed-cap 10, `inventoryAlerts` is fixed-cap 10).
- **Filter/sort:** `?range=` only.

### 6.4 Empty data, pagination, filter, sort, transaction, concurrency behavior

- **Empty (new seller, 0 listings):** `kpis.activeListings = 0`, `newLeads = 0`, `openOffers = 0`, `totalViews = 0`, `conversionRate = null`. `recentLeads = []`. UI shows onboarding CTA card: "هنوز آگهی ثبت نکرده‌اید." + primary button "ثبت اولین آگهی" (`/listings/new`) + secondary "تکمیل هویت فروشگاه" (`/seller/identity`).
- **Empty (filter returns 0):** N/A (no list filter — `range` only affects `newLeads`/`recentLeads` recency windows).
- **Pagination:** N/A.
- **Filter/sort:** `?range=` only.
- **Transaction:** NO mutation. All reads. `Promise.all` of two branches: (a) main-DB queries via `db.*`, (b) store-DB queries via `storeDb.*`. Store branch is wrapped in try/catch — on failure, `storeDbReachable: false` and store KPIs become `null` (NOT a 500).
- **Concurrency:** Read-only; no concurrency concern.

### 6.5 main DB vs store DB boundary

- **MAIN DB:** `db.listing.count` (active listings), `db.lead.count` + `db.lead.findMany` (new leads + recent leads — via `where: { listing: { sellerId } }` relation filter per BLOCKER-A2), `db.listingOffer.count` (open offers), `db.listing.aggregate({ _sum: viewCount })` (total views), `db.deal.aggregate({ _sum: agreedAmount })` (revenue, ADMIN or seller-scoped via `sellerId`).
- **STORE DB:** `storeDb.inventoryBalance.count` (low-stock parts — ADMIN only), `storeDb.order.count` (open orders — ADMIN only). Best-effort.
- **NO cross-DB transaction.** Two parallel `Promise.all` branches. Store DB failure does NOT fail the page.

### 6.6 Ownership config

- **Custom route path (§4.1 path b).** The dashboard is a KPI aggregate, not a list/detail resource — Universal Resource API does not apply.
- **Server-side ownership enforcement:** the `sellerScope` predicate (§6.3) is built from `user.id` and `user.companyId` (session-derived, never from request body). ADMIN bypasses the predicate (sees global counts). `?sellerId=` is ADMIN-only (403 for SELLER).
- **No `AdminResourceConfig.ownership` change in this PR.**
- **Negative test (mandatory merge gate):** `tests/security/tenant-isolation-dashboard.test.ts` — Seller A logs in, GET `/api/seller/dashboard` → response contains ONLY Seller A's listings/leads/offers (no Seller B data). Seller A attempts `?sellerId=sellerB.id` → 403. Verify by seeding Seller A + Seller B with distinct listings and asserting Seller A's `kpis.activeListings === <A's count>`, not `<A+B count>`.

### 6.7 Allowed files (exhaustive)

| File | Action | Notes |
|---|---|---|
| `src/app/api/seller/dashboard/route.ts` | NEW | `GET` aggregate KPIs. |
| `src/app/seller/dashboard/page.tsx` | REWRITE | Refactor existing 305-line page to call the new API + add states. |
| `src/app/seller/layout.tsx` | NEW | Shared sidebar + mobile bottom tab bar. |
| `tests/integration/dashboard-real-data.test.ts` | NEW | Sentinel: no sample numbers; all KPIs from real Prisma queries. |
| `tests/integration/dashboard-empty-state.test.ts` | NEW | New seller → 0 KPIs + onboarding CTA. |
| `tests/security/tenant-isolation-dashboard.test.ts` | NEW | Cross-seller negative test. |
| `tests/a11y/dashboard-page.test.ts` | NEW | axe-core 0 violations. |
| `tests/responsive/dashboard-page.test.ts` | NEW | 375/768/1280 breakpoints. |
| `docs/product/PR-SC-05-SCOPE.md` | NEW | Scope manifest. |

### 6.8 Forbidden files

- `prisma/schema.prisma` (no schema change).
- `prisma/store-schema.prisma` (no store-DB change).
- `src/lib/admin/**` (frozen — no tenant-scope / data-adapter / resource config change).
- `src/app/admin/store/**` (admin store pages — out of scope).
- `src/app/api/admin/**` (universal API — frozen).
- `src/lib/crm/**` (PR-SC-01 surface, frozen).
- `src/app/seller/identity/**` (PR-SC-04 surface).
- `src/app/seller/leads/**`, `src/app/api/seller/leads/**` (PR-SC-06 surface).
- `src/app/seller/reports/**`, `src/app/api/seller/reports/**`, `src/app/api/seller/assistant/**` (PR-SC-09 surface).
- `src/app/showroom/**`, `src/app/seller/showroom/**`, `src/app/api/seller/showroom/**`, `src/app/api/showroom/**` (PR-SC-08 surface).
- `src/app/admin/store/passport/**`, `src/app/api/seller/passport/**` (PR-SC-07 surface).
- `src/lib/ai-*/**`, `src/app/api/ai-*/**` (PR-SC-09 surface).

### 6.9 Dependencies

- **PR-SC-00 — COMPLETE** (mandatory — first seller-scoped UI; cross-seller negative test gate).
- **PR-SC-01 — COMPLETE** (already merged). The "New Leads (7d)" KPI uses `Lead.status` (`schema.prisma:635`) + `Lead.createdAt`; the `Lead.listing.sellerId` relation filter (BLOCKER-A2) is required.
- **NOT a dependency:** PR-SC-04 (Dashboard and Identity are independent — both may land in parallel). PR-SC-03/06/07/08/09 not required.

### 6.10 Rollback

1. `git revert <PR-SC-05 merge SHA>`.
2. **No schema impact.** Dashboard reverts to the existing 305-line page (which queries `db.listing.findMany({ where: { sellerId: user.id } })` directly — pre-PR-SC-05 behavior).
3. The shared `src/app/seller/layout.tsx` is removed — each seller page renders its own header/footer (pre-PR-SC-05 behavior). PR-SC-04 (if landed) reverts to per-page headers; if PR-SC-04 has not landed, no impact.
4. **Rollback order if PR-SC-04 has landed:** revert PR-SC-04 first (it adopts the seller layout), then PR-SC-05.

### 6.11 Definition of Done

- [ ] `bun run typecheck` + `bun run lint` pass.
- [ ] `bun run test` passes (existing + new).
- [ ] `tests/integration/dashboard-real-data.test.ts` — **sentinel test**: hard-coded sample numbers are forbidden. Test reads the route's source file and asserts no literal numbers (other than 0/null defaults) appear in KPI computation paths. Every KPI value in the response must trace to a real Prisma `count()` / `aggregate()` call.
- [ ] `tests/integration/dashboard-empty-state.test.ts` — new seller (0 listings, 0 leads) → `kpis.activeListings === 0`, `conversionRate === null`, onboarding CTA visible.
- [ ] `tests/security/tenant-isolation-dashboard.test.ts` — Seller A sees ONLY Seller A's data; `?sellerId=sellerB.id` → 403.
- [ ] `tests/a11y/dashboard-page.test.ts` — axe-core 0 violations.
- [ ] `tests/responsive/dashboard-page.test.ts` — 375/768/1280 breakpoints pass; KPI grid is `grid-cols-2 sm:grid-cols-4`.
- [ ] Manual smoke: dashboard renders under 800ms TTFB on staging with 100 listings + 50 leads + 20 store orders.
- [ ] Manual smoke: stop Store DB → reload dashboard → main KPIs still render, store KPIs show `—`, `storeDbReachable: false`.
- [ ] CI `verify` green on PR HEAD.
- [ ] Independent /Critic review: no BLOCKER findings.

### 6.12 Audit action keys

| Mutation | Audit action key | EntityType | EntityId |
|---|---|---|---|
| (none — read-only) | N/A — best-effort `logAudit({ action: 'store.dashboard.view', entityType: 'Seller', entityId: user.id })` once per page load (not per KPI). | — | — |

### 6.13 Acceptance test summary

1. Login as SELLER with 3 PUBLISHED listings + 2 PENDING offers + 5 leads in last 7d → assert KPI cards show `3 / 5 / 2` and `totalViews` reflects `sum(viewCount)` for those 3 listings.
2. Login as SELLER with 0 listings → assert onboarding CTA visible with `/listings/new` link.
3. Login as BUYER → assert 403 card with link to `/seller`.
4. Stop Store DB (mock) → reload → assert main KPIs still render, store KPIs show `—`, `storeDbReachable: false`.
5. Seller A attempts `GET /api/seller/dashboard?sellerId=sellerB.id` → assert 403.
6. Seller A GET → response contains ONLY Seller A's listings/leads (no Seller B data).

---

## 7. PR-SC-06 — CRM API/UI (Lead Status Workflow + Dynamic Cross-Seller Negative Test)

**Stage:** 3 (Inventory & CRM). **Branch:** `feature/pr-sc-06-lead-crm-ui` (NEW, off `main` post-PR-SC-00 + PR-SC-01). **Type:** UI + API. **No schema change** (Lead.status already in PR-SC-01).

### 7.1 Scope — IN

| Surface | Detail |
|---|---|
| API | `src/app/api/seller/leads/route.ts` (REWRITE — currently 73 lines, GET only, no permission check, comment "Lead doesn't have status field" is stale per PR-SC-01): add `requirePermission('store.crm.read')` (403 if missing); add status filter; add Lead Intelligence labels (deterministic); add pagination; return KPIs by status. |
| API | `src/app/api/seller/leads/[id]/route.ts` (NEW): `PATCH` updates Lead status (uses `validateTransition` from `src/lib/crm/lead-status.ts`); wraps in `auditMutationTransactional`; ownership via `Lead.listing.sellerId === user.id` (relation-based — BLOCKER-A2). |
| API | `src/app/api/seller/leads/[id]/intelligence-explain/route.ts` (NEW): `POST` — AI advisory route. Calls `/api/ai-gateway` with `taskType: 'SELLER_ASSISTANT'`. Input sanitized (no `viewerPhone`/`viewerName` — replaced with counts). Returns explanation in Persian. **Advisory-only — no mutation.** |
| UI | `src/app/seller/leads/page.tsx` (REWRITE — currently a client component calling `/api/ai-sales-agent`): server-component shell + client islands. Kanban desktop (NEW/CONTACTED/QUALIFIED/CLOSED columns; LOST in collapsed tray), select-mobile per `STORE-CENTER-DETAILED-DESIGN.md` §6.6. |
| Algorithm | `src/lib/crm/lead-intelligence.ts` (NEW): deterministic Hot/Warm/Cold per `STORE-CENTER-DETAILED-DESIGN.md` §6.3. Hot: ≥3 leads from same `viewerPhone` OR `status = QUALIFIED`. Warm: 1-2 leads, last lead ≤7d. Cold: last lead ≥14d. Pure function (no LLM). |
| Algorithm | `src/lib/crm/lead-score-recalc.ts` (NEW): background recalc job. Idempotent (compares hash of breakdown inputs; only recomputes if changed). Invoked from API PATCH + scheduled. |
| Sanitizer | `src/lib/ai-sanitize.ts` (NEW): `sanitizeAiInput(payload)` strips known PII keys (`viewerPhone`, `viewerName`, `buyerPhone`, `buyerEmail`, `buyerName`, `paymentRef`) before LLM call. Pure function. Unit-tested with a fixture containing all forbidden keys. |
| Permissions | **No new keys.** `store.crm.read` + `store.crm.manage` already in `permissions.ts:119-120` + `ROLE_PERMISSIONS.SELLER:269-270` (from PR-SC-01). |
| Tests | `tests/integration/lead-crm-patch.test.ts`, `tests/security/tenant-isolation-leads.test.ts` (**dynamic cross-seller negative test — mandatory merge gate, deferred from PR-SC-01**), `tests/unit/lead-intelligence.test.ts`, `tests/regression/leads-page-no-ai-sales-agent.test.ts` (R11 partial fix — confirms old route is no longer called), `tests/security/ai-leakage.test.ts` (PII not echoed in intelligence-explain), `tests/a11y/leads-page.test.ts`, `tests/responsive/leads-page.test.ts`. |

### 7.2 Scope — OUT

| Out item | Reason | Target |
|---|---|---|
| Lead Score v2 / factor weight changes | Lead Score v1 algorithm is frozen (PR-SC-01). This PR uses the existing `src/lib/crm/lead-score.ts`. | Future PR |
| `/api/ai-sales-agent` full deprecation | R11 fix (refactor or 410 Gone) is in PR-SC-09. This PR stops calling it from `/seller/leads` (R11 partial fix — full deprecation in PR-SC-09). | PR-SC-09 |
| Lead export to CSV | Not in MVP scope. Use `AdminPreference.hiddenItems` for dismissal; export is a follow-up. | Future PR |
| Bulk lead status change | Out of MVP scope. | Future PR |
| Lead attribution to specific SalesTeamMember | Requires `SalesTeamMember` model (PR-SC-08). | PR-SC-08 |
| AI auto-status-change | **Forbidden by ADR-005 §8.** AI is advisory-only. The `intelligence-explain` route returns text; the user manually PATCHes status via `/api/seller/leads/[id]`. | Never |

### 7.3 API contracts

#### `GET /api/seller/leads`

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'store.crm.read')` → 403.
- **Ownership scope:** `where: { listing: { OR: [{ sellerId: user.id }, { companyId: user.companyId }] } }` (BLOCKER-A2 — relation filter via `Lead.listing.sellerId`, NOT `where: { sellerId }`).
- **Query params:**
  - `?status=NEW|CONTACTED|QUALIFIED|CLOSED|LOST` (filter, single value; invalid value → 400).
  - `?intelligence=hot|warm|cold` (filter; computed post-fetch).
  - `?page=1&limit=50` (default 50, max 200).
  - `?sort=-createdAt` (default) or `?sort=createdAt` (asc). Other sort fields → 400.
- **Response 200:**
  ```json
  {
    "success": true,
    "kpis": {
      "total": 45,
      "byStatus": { "NEW": 5, "CONTACTED": 3, "QUALIFIED": 1, "CLOSED": 2, "LOST": 0 },
      "pendingOffers": 3,
      "conversionRate": 0.04
    },
    "data": [
      {
        "id": "...",
        "listingId": "...",
        "leadType": "CONTACT",
        "viewerName": "...",
        "viewerPhone": "...",
        "note": "...",
        "status": "NEW",
        "intelligence": "hot",
        "intelligenceReason": "3 سرنخ از این شماره",
        "leadCount": 3,
        "firstLeadAt": "ISO",
        "lastLeadAt": "ISO",
        "createdAt": "ISO",
        "listing": { "id": "...", "title": "...", "slug": "..." }
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 45, "totalPages": 1 }
  }
  ```
  - `viewerPhone` and `viewerName` are returned to the seller (they own the listing → entitled). **NOT sent to any LLM** (§4.3 A7 — sanitized before LLM call in `intelligence-explain`).
  - `intelligence` is computed post-fetch by `lead-intelligence.ts` (Hot/Warm/Cold + reason string).
  - `leadCount` is the number of leads from the same `viewerPhone` (or `null` if `viewerPhone` is null).
- **Error codes:**
  - `400 Bad Request` — invalid `status` or `intelligence` value; unknown sort field.
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — SELLER without `store.crm.read`; BUYER/MODERATOR.
  - `500 Internal Server Error` — DB query failure.
- **Rate limit:** 60 req/min per user.
- **Pagination:** `?page=&limit=` per §4.6. `total` is the count after applying `status` filter (but BEFORE `intelligence` filter, which is post-fetch — see Concurrency below).
- **Filter:** `?status=` is a DB-level filter (Prisma `where.status`). `?intelligence=` is a post-fetch filter (computed in JS); when applied, the response's `pagination.total` reflects the post-intelligence count (the route fetches with `take: limit * 3` to allow post-filter headroom, then truncates to `limit`; if `total > limit * 3`, returns `total: <fetched>` with a `truncated: true` flag).
- **Sort:** `?sort=-createdAt` (desc, default) or `?sort=createdAt` (asc).

#### `PATCH /api/seller/leads/[id]`

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'store.crm.manage')` → 403. **Ownership check:** load `Lead` with `include: { listing: { select: { sellerId: true, companyId: true } } }`; verify `lead.listing.sellerId === user.id` OR `lead.listing.companyId === user.companyId` OR `isAdmin` (else 403).
- **Request body:**
  ```json
  {
    "status": "CONTACTED",
    "note": "تماس گرفته شد، منتظر پاسخ"
  }
  ```
  - `status` (optional): one of `NEW|CONTACTED|QUALIFIED|CLOSED|LOST`. If omitted, status is unchanged.
  - `note` (optional): max 1000 chars. If omitted, note is unchanged. If `null`, note is cleared.
  - `assignedToId` (optional, future): NOT writable in this PR (SalesTeamMember model doesn't exist yet). 400 if present.
  - `scoreOverrideReason`/`scoreOverrideNote` (optional, future): NOT writable in this PR. 400 if present.
- **Validation:**
  - `status` value must be one of the 5 canonical statuses (else 400).
  - **`validateTransition(lead.status, body.status)` MUST pass** (from `src/lib/crm/lead-status.ts`). Illegal transition → 409 with `{ error: "Invalid transition: <from> → <to>", code: "INVALID_TRANSITION", allowed: [...] }`. Same-status (idempotent) → 200, no-op.
  - `note` max 1000 chars → 400.
- **Response 200:** the updated Lead (same shape as GET's `data[0]`, without the `intelligence` field).
- **Error codes:**
  - `400 Bad Request` — invalid `status` value; `note` too long; immutable field present.
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — SELLER without `store.crm.manage`; OR SELLER attempting to PATCH a Lead whose `listing.sellerId !== user.id` (and not ADMIN, and not in same Company).
  - `404 Not Found` — Lead not found OR Lead exists but ownership check failed (do NOT distinguish — return 404 in both cases to avoid leaking existence).
  - `409 Conflict` — illegal status transition.
  - `500 Internal Server Error` — DB write failure.
- **Transaction:** MAIN DB only. Uses `auditMutationTransactional` — atomic mutation + audit. The `validateTransition` check uses the **persisted** `lead.status` (loaded fresh at the start of the transaction), NOT the request body's claimed state. This is the §4.6 concurrency rule for status transitions.
- **Concurrency:** Two concurrent PATCHes (e.g., SELLER A and SUPPORT both moving the same Lead from `NEW` to `CONTACTED`):
  - Both load `lead.status = 'NEW'` (transactional `SELECT FOR UPDATE`).
  - First PATCH succeeds: `NEW → CONTACTED` (legal). Audit logged.
  - Second PATCH retries the validation against the now-persisted `CONTACTED` status: `CONTACTED → CONTACTED` (idempotent) → 200 no-op. OR `CONTACTED → NEW` (illegal per `ALLOWED_TRANSITIONS`) → 409.
- **Audit:** `logAudit({ action: 'store.lead.status_update', entityType: 'Lead', entityId: lead.id, before: { status, note }, after: { status, note }, actorId: user.id })`.

#### `POST /api/seller/leads/[id]/intelligence-explain`

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'store.crm.read')` → 403. Ownership check on Lead (same as PATCH).
- **Request body:** `{}` (no params — the route loads the Lead + computes the sanitized summary).
- **Behavior:**
  1. Load Lead with `include: { listing: { select: { title: true, category: { select: { name: true } } } } }`. Verify ownership.
  2. Compute `leadSummary` (sanitized): `{ leadType, daysSinceCreated, listingTitle, listingCategory, leadCountFromSamePhone: number (NOT the phone itself), offerCount, lastOfferDaysAgo }`. **NO PII** (`viewerPhone` replaced with a count; `viewerName` omitted).
  3. Compute `intelligenceLabel` + `intelligenceReason` via `lead-intelligence.ts`.
  4. Call `/api/ai-gateway` (server-side) with `taskType: 'SELLER_ASSISTANT'`, `input: { leadSummary, intelligenceLabel, intelligenceReason }`. The Gateway enforces `AITaskPolicy` (deny-by-default), `AIBudget` (daily/monthly caps), logs to `AIGatewayLog`.
  5. Validate the LLM output against the zod schema (PR-SC-09 introduces `src/lib/ai-output-schemas.ts`; in PR-SC-06 a minimal inline schema is acceptable as a placeholder — PR-SC-09 will refactor).
  6. Return the explanation + factors.
- **Response 200:**
  ```json
  {
    "success": true,
    "explanation": "متن توضیح فارسی",
    "factors": [
      { "label": "تعداد سرنخ", "value": 3, "weight": 0.4 },
      { "label": "وضعیت", "value": "QUALIFIED", "weight": 0.3 },
      { "label": "آخرین تماس", "value": "2 روز پیش", "weight": 0.3 }
    ],
    "costUsd": 0.008,
    "model": "default"
  }
  ```
  - `factors` MUST sum to 1.0 (validated).
- **Error codes:**
  - `400 Bad Request` — invalid Lead ID format.
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — no `store.crm.read`; OR not owner.
  - `404 Not Found` — Lead not found OR not owner.
  - `429 Too Many Requests` — AI budget exceeded (daily/monthly cap from `AIBudget`); OR per-user rate limit.
  - `500 Internal Server Error` — LLM 500 (fallback: return deterministic `{ explanation: intelligenceReason, factors: [] }`).
- **Advisory-only:** No `db.*.create/update/delete` in this route. Verified by integration test.

### 7.4 Empty data, pagination, filter, sort, transaction, concurrency behavior

- **Empty (no leads ever):** `kpis.total = 0`, `kpis.byStatus = { NEW: 0, CONTACTED: 0, ... }`, `data: []`, `pagination.total = 0`. UI shows: "هنوز سرنخی دریافت نکرده‌اید." + hint "آگهی‌های خود را منتشر کنید تا سرنخ دریافت کنید." + link to `/listings/new`.
- **Empty (filter returns 0):** "هیچ سرنخی با این فیلتر یافت نشد." + "پاک کردن فیلتر" button.
- **Pagination:** per §4.6. `total` is post-`status`-filter count; `intelligence` is post-fetch (see §7.3 GET response shape — `truncated: true` if hit headroom).
- **Filter:** `?status=` (DB-level), `?intelligence=` (post-fetch).
- **Sort:** `?sort=-createdAt` (default) or `?sort=createdAt`.
- **Transaction:** MAIN DB only. PATCH uses `auditMutationTransactional`. AI route is read-only (no transaction).
- **Concurrency:** PATCH uses `SELECT FOR UPDATE` + `validateTransition` against persisted state (§7.3 PATCH).

### 7.5 main DB vs store DB boundary

- **MAIN DB only.** `db.lead.*`, `db.listingOffer.count`. **No store-DB query.** No cross-DB concern.

### 7.6 Ownership config

- **Custom route path (§4.1 path b).** The Lead resource is registered in the Universal Resource API but with NO `ownership` declared (verified — `Lead` is not in the registry; leads are accessed only via `/api/seller/leads` custom route).
- **Server-side ownership enforcement:** `where: { listing: { OR: [{ sellerId: user.id }, { companyId: user.companyId }] } }` (BLOCKER-A2 — relation filter via `Lead.listing.sellerId`).
- **Future option:** register a `leadConfig` with `ownership: { relation: { field: 'listing', ownerField: 'sellerId' }, moderatePermission: 'store.crm.manage' }` to use the Universal Resource API. NOT in this PR — the custom route is simpler and the Universal Resource API for Lead would inherit the data-adapter's `SELECT FOR UPDATE` semantics, which is desirable but not required for MVP. **Recommendation:** open a follow-up PR after PR-SC-06 to register Lead as a universal resource with relation-based ownership (uses the PR-SC-00 mechanism that supports `relation: { field, ownerField }` per `src/lib/admin/types.ts:329-334`).
- **Negative test (mandatory merge gate):** `tests/security/tenant-isolation-leads.test.ts` — Seller A + Seller B seeded with distinct listings + leads. Seller A GET `/api/seller/leads` → response contains ONLY Seller A's leads (no Seller B). Seller A PATCH `/api/seller/leads/{sellerB_lead_id}` → 404 (not 403 — do not leak existence). Seller A POST `/api/seller/leads/{sellerB_lead_id}/intelligence-explain` → 404. This is the **dynamic cross-seller negative test deferred from PR-SC-01** per `docs/product/PR-SC-01-SCOPE.md` §"Permissions + unauthorized-access test".

### 7.7 Allowed files (exhaustive)

| File | Action | Notes |
|---|---|---|
| `src/app/api/seller/leads/route.ts` | REWRITE | Add RBAC + status filter + Lead Intelligence + pagination + KPIs. |
| `src/app/api/seller/leads/[id]/route.ts` | NEW | `PATCH` status. |
| `src/app/api/seller/leads/[id]/intelligence-explain/route.ts` | NEW | `POST` AI advisory. |
| `src/app/seller/leads/page.tsx` | REWRITE | Server-component shell + Kanban + select-mobile. |
| `src/lib/crm/lead-intelligence.ts` | NEW | Deterministic Hot/Warm/Cold. |
| `src/lib/crm/lead-score-recalc.ts` | NEW | Background recalc job (idempotent). |
| `src/lib/ai-sanitize.ts` | NEW | `sanitizeAiInput(payload)` — strips PII. |
| `tests/integration/lead-crm-patch.test.ts` | NEW | PATCH + audit + validateTransition. |
| `tests/security/tenant-isolation-leads.test.ts` | NEW | **Dynamic cross-seller negative test (mandatory merge gate).** |
| `tests/unit/lead-intelligence.test.ts` | NEW | Hot/Warm/Cold + edge cases. |
| `tests/regression/leads-page-no-ai-sales-agent.test.ts` | NEW | R11 partial fix — old route no longer called. |
| `tests/security/ai-leakage.test.ts` | NEW | PII not echoed in intelligence-explain. |
| `tests/a11y/leads-page.test.ts` | NEW | Kanban keyboard nav (arrow keys, Enter). |
| `tests/responsive/leads-page.test.ts` | NEW | 375/768/1280 breakpoints. |
| `docs/product/PR-SC-06-SCOPE.md` | NEW | Scope manifest. |

### 7.8 Forbidden files

- `prisma/schema.prisma` (no schema change — Lead columns from PR-SC-01).
- `prisma/store-schema.prisma` (no store-DB change).
- `src/lib/crm/lead-score.ts`, `src/lib/crm/lead-status.ts` (PR-SC-01 surface — frozen).
- `src/lib/authorization/permissions.ts` (no new keys in this PR).
- `src/lib/admin/**` (frozen).
- `src/app/api/ai-sales-agent/**`, `src/app/api/ai-seller-assistant/**` (R11 full deprecation in PR-SC-09 — this PR only stops calling them).
- `src/app/seller/dashboard/**`, `src/app/seller/identity/**` (PR-SC-04/05 surfaces).
- `src/app/seller/reports/**`, `src/app/api/seller/assistant/**`, `src/app/api/seller/reports/**` (PR-SC-09 surface).
- `src/app/admin/store/passport/**`, `src/app/api/seller/passport/**` (PR-SC-07 surface).
- `src/app/showroom/**`, `src/app/seller/showroom/**`, `src/app/api/seller/showroom/**`, `src/app/api/showroom/**` (PR-SC-08 surface).

### 7.9 Dependencies

- **PR-SC-00 — COMPLETE** (mandatory — first seller-scoped CRM UI; cross-seller negative test gate).
- **PR-SC-01 — COMPLETE** (already merged). Requires `Lead.status` + `Lead.listing.sellerId` relation + `src/lib/crm/lead-score.ts` + `src/lib/crm/lead-status.ts` + `store.crm.read/manage` permissions.
- **NOT a dependency:** PR-SC-04, PR-SC-05 (CRM is independent — may land in parallel with Stage 2). PR-SC-03/07/08/09 not required.

### 7.10 Rollback

1. `git revert <PR-SC-06 merge SHA>`.
2. **No schema impact.** Lead columns from PR-SC-01 remain. UI reverts to the old client component (which calls `/api/ai-sales-agent` — R11 unfixed, acceptable). The old route still exists (PR-SC-09 will deprecate it).
3. **Rollback order if PR-SC-09 has landed:** revert PR-SC-09 first (it depends on PR-SC-06's CRM API), then PR-SC-06.

### 7.11 Definition of Done

- [ ] `bun run typecheck` + `bun run lint` pass.
- [ ] `bun run test` passes (existing + new).
- [ ] `tests/integration/lead-crm-patch.test.ts` — PATCH updates `Lead.status`; `AuditLog` row written with `action: 'store.lead.status_update'`, `entityType: 'Lead'`, `before`/`after` JSON; `validateTransition` rejects illegal transitions (e.g., `CLOSED → NEW` → 409).
- [ ] `tests/security/tenant-isolation-leads.test.ts` — **dynamic cross-seller negative test passes**: Seller A cannot list/patch Seller B's leads (GET returns only A's leads; PATCH → 404; intelligence-explain → 404). This is the deferred merge gate from PR-SC-01.
- [ ] `tests/unit/lead-intelligence.test.ts` — Hot (3+ leads OR QUALIFIED), Warm (1-2 leads ≤7d), Cold (last lead ≥14d); edge cases (no inquiries, exactly 3, exactly 14 days).
- [ ] `tests/regression/leads-page-no-ai-sales-agent.test.ts` — `/seller/leads` no longer calls `/api/ai-sales-agent` (R11 partial fix — full deprecation in PR-SC-09).
- [ ] `tests/security/ai-leakage.test.ts` — `viewerPhone`/`viewerName` not in the LLM input (server log inspection or input-capture fixture); `leadCountFromSamePhone` is a number, not the phone string.
- [ ] `tests/a11y/leads-page.test.ts` — Kanban keyboard nav (arrow keys between columns, Enter to open card); select-mobile works.
- [ ] Manual smoke: Seller sees leads in Kanban; drags NEW → CONTACTED (desktop) or uses `<select>` (mobile); audit log entry visible; Lead Intelligence labels render.
- [ ] CI `verify` green on PR HEAD.
- [ ] Independent /Critic review: no BLOCKER findings; cross-seller negative test confirmed real (not stubbed).

### 7.12 Audit action keys

| Mutation | Audit action key | EntityType | EntityId |
|---|---|---|---|
| Update Lead status (PATCH `/api/seller/leads/[id]`) | `store.lead.status_update` | `Lead` | `lead.id` |
| Lead Intelligence explain (POST `/api/seller/leads/[id]/intelligence-explain`) | `AIGatewayLog` row (`taskType: 'SELLER_ASSISTANT'`) — no AuditLog row (read-only + advisory) | — | — |

### 7.13 Acceptance test summary

1. Seed 5 leads across 3 statuses. Login as SELLER → navigate to `/seller/leads` → assert Kanban shows correct counts per column.
2. Drag a lead from NEW to CONTACTED (desktop) → assert PATCH fires, audit log written, column counts update.
3. Mobile 375px: use `<select>` to change status → same assertions.
4. Login as SELLER B → attempt `PATCH /api/seller/leads/{sellerA_lead_id}` → assert 404 (not 403 — do not leak existence).
5. Click "Explain with AI" on a Hot lead → assert 200, explanation in Persian, no PII in network response (verify `viewerPhone` not in request body to LLM — check via input-capture fixture).
6. AI budget exhausted (mock `AIBudget.dailySpendUsd > dailyLimitUsd`) → click "Explain with AI" → assert 429 with friendly message.
7. Attempt `PATCH` with status `CLOSED` on a `NEW` lead (illegal transition: NEW→CLOSED is NOT in `ALLOWED_TRANSITIONS` per `src/lib/crm/lead-status.ts`) → assert 409.

---

## 8. PR-SC-03 — Machine Passport Schema + Algorithm + Backfill (NO UI)

**Stage:** 3 (Inventory & CRM). **Branch:** `feature/pr-sc-03-inventory-passport-schema` (NEW, off `main` post-PR-SC-00). **Type:** Schema + algorithm + backfill scripts. **NO UI, NO API route.**

### 8.1 Scope — IN

| Surface | Detail |
|---|---|
| Schema | `prisma/schema.prisma` — `MachinePassport` (M6, L1180-1189) += 8 NEW per-section verification fields + 2 score fields: `specsVerifiedAt DateTime?`, `specsVerifiedBy String?`, `ownershipVerifiedAt DateTime?`, `ownershipVerifiedBy String?`, `inspectionVerifiedAt DateTime?`, `inspectionVerifiedBy String?`, `serviceHistoryVerifiedAt DateTime?`, `serviceHistoryVerifiedBy String?`, `passportScore Int?`, `passportScoreVersion String?`. **All 8 verification fields are genuinely new per ADR-005-amendment-01 §6 (B2 critic finding).** Add `@@index([listingId])` (already present via `listingId @unique`); add `@@index([passportScore])` for future filter. |
| Schema | `prisma/schema.prisma` — `Listing` (M1, L444-533) += 4 NEW Smart Inventory Score fields: `inventoryScore Int?`, `inventoryScoreVersion String?`, `inventoryScoredAt DateTime?`, `inventoryScoreBreakdown Json?`. Add `@@index([inventoryScore])`. **RELOCATED from Part per ADR-005-amendment-01 §5** — Listing lives in main DB; all 6 score factors source from main-DB models. **DO NOT add `Part.inventoryScore` in store-schema.prisma** — that is a separate P2 follow-up (Part Catalog Score, not the Store Center machine score). |
| Schema | `MachinePassport.specsVerifiedBy` / `ownershipVerifiedBy` / `inspectionVerifiedBy` / `serviceHistoryVerifiedBy` — add FK relations to `User` (optional, `onDelete: SetNull`). 4 new User back-relations: `specsVerifiedByLeads`/etc. — actually `*VerifiedBy MachinePassport[]` (4 back-relations on User). |
| Algorithm | `src/lib/passport/passport-score.ts` (NEW): pure function. Passport Score v1 per `STORE-CENTER-DETAILED-DESIGN.md` §7.3: `specs_verified(25) + ownership_verified(20) + inspection_current(25) + service_history(15) + photos_3plus(15) = 100`. `PASSPORT_SCORE_VERSION = "v1"`. Explainable `breakdown[]`. |
| Algorithm | `src/lib/inventory/inventory-score.ts` (NEW): pure function. Smart Inventory Score v1 per `STORE-ANALYTICS-BI.md` §3.2 (reduced to existing main-DB fields per `STORE-CENTER-DETAILED-DESIGN.md` §5.3 R7): `has_images(20) + image_count_3plus(10) + has_description_50chars(10) + has_price(15) + has_year_hours(10) + verified(15) + recent_inspection(10) + views_above_median(10) = 100`. `INVENTORY_SCORE_VERSION = "v1"`. Explainable `breakdown[]`. |
| Backfill | `scripts/calculate-passport-score.ts` (NEW): idempotent backfill script. Batched (1000 passports per tick). Tolerates partial failure. |
| Backfill | `scripts/calculate-inventory-score.ts` (NEW): idempotent backfill script. Batched (1000 listings per tick). |
| Tests | `tests/unit/passport-score.test.ts` (5-section scoring, clamping, structure), `tests/unit/inventory-score.test.ts` (6-factor scoring, clamping, structure), `tests/migration/pr-sc-03-reversibility.test.ts` (apply migration → run backfill → run tests → rollback → run tests). |

### 8.2 Scope — OUT

| Out item | Reason | Target |
|---|---|---|
| `MachinePassport.source` field | ADR-005 §6 falsely claimed it exists. It does NOT (per ADR-005-amendment-01 §6). The `source` concept is covered by `PassportEvent.eventType = 'DOCUMENT'` + `description` = URL (R17). **Do NOT add a `source` field** — `PassportEvent` is the source-of-truth for events. | None — use PassportEvent |
| `MachinePassport.verification` field | Same as above — ADR-005 §6 false claim. Per-section `*VerifiedAt/By` (8 fields) replace the singular `verification` concept. | None — 8 per-section fields |
| `Part.inventoryScore` (store-DB) | ADR-005-amendment-01 §5 — Part is in store DB; putting the score there forces cross-DB read on every dashboard render. The Store Center machine score is on `Listing` (main DB). A separate Part Catalog Score is P2 follow-up. | Future P2 PR (store-DB Part Catalog Score) |
| `Part.partNumber`/`oemNumber`/`documents`/`specifications` | ADR-005 §5 v1 algorithm referenced these but they do NOT exist on `Part` (R7). MVP uses the v1-reduced algorithm (existing fields only). | Future PR (if full v1 algorithm desired) |
| `PassportDocument` model | Documents (manual, inspection report) are modeled via `PassportEvent` with `eventType: 'DOCUMENT'` in MVP (R17). A dedicated `PassportDocument` model is a future enhancement. | Future PR |
| Passport UI (`/admin/store/passport/[listingId]`) | PR-SC-07 (this spec, §9). | PR-SC-07 |
| Passport API (`/api/seller/passport/*`) | PR-SC-07. | PR-SC-07 |
| Inventory page enhancement (`?view=parts`) | Future PR — not in this schema PR. | Future PR |
| `Listing.inventoryScore` recalc background job | Future PR — schema + algorithm + backfill ship here; the recalc-on-write hook is in PR-SC-07 (Passport UI writes trigger recalc). | PR-SC-07 + future |

### 8.3 No API contract (schema-only PR)

This PR ships NO API route and NO UI. The schema + algorithm + backfill scripts are the deliverable. API contracts are in PR-SC-07 (§9).

### 8.4 Empty data, pagination, filter, sort, transaction, concurrency behavior

- **Empty (no passports exist):** Backfill script runs without error; no rows updated. `MachinePassport.passportScore` remains NULL for all rows until PR-SC-07 UI verifies a section (or the backfill runs after a passport is created).
- **Empty (no listings exist):** Inventory score backfill runs without error; no rows updated.
- **Pagination:** N/A (backfill scripts batch internally; no API).
- **Filter/sort:** N/A.
- **Transaction:** Backfill scripts use a non-transactional batch update pattern (each batch of 1000 is independent; partial failure is logged and the script continues). **No cross-DB transaction** — both `MachinePassport` and `Listing` are in MAIN DB.
- **Concurrency:** Backfill scripts are idempotent. Re-running produces the same scores (deterministic algorithms). Safe to resume from any point.

### 8.5 main DB vs store DB boundary

- **MAIN DB only.** `db.machinePassport.*`, `db.listing.*`. **No store-DB query.** No cross-DB concern.

### 8.6 Ownership config

- **None in this PR.** This is a schema + algorithm + backfill PR. The `MachinePassport` resource is NOT yet registered in the Universal Resource API (verified — `src/lib/admin/resource-index.ts` does not register `machinePassport`). PR-SC-07 may either register `MachinePassport` with `ownership: { relation: { field: 'listing', ownerField: 'sellerId' }, moderatePermission: 'passport.manage' }` (relation-based — uses PR-SC-00's mechanism per `src/lib/admin/types.ts:329-334`) OR use a custom route. The decision is in PR-SC-07 (§9.6).

### 8.7 Allowed files (exhaustive)

| File | Action | Notes |
|---|---|---|
| `prisma/schema.prisma` | EDIT (additive) | Add 10 columns to `MachinePassport` + 4 columns to `Listing` + 4 User back-relations + 2 indexes. |
| `src/lib/passport/passport-score.ts` | NEW | Pure function, Passport Score v1. |
| `src/lib/inventory/inventory-score.ts` | NEW | Pure function, Smart Inventory Score v1 (reduced). |
| `scripts/calculate-passport-score.ts` | NEW | Idempotent backfill. |
| `scripts/calculate-inventory-score.ts` | NEW | Idempotent backfill. |
| `tests/unit/passport-score.test.ts` | NEW | 5-section scoring. |
| `tests/unit/inventory-score.test.ts` | NEW | 6-factor scoring. |
| `tests/migration/pr-sc-03-reversibility.test.ts` | NEW | Apply → backfill → test → rollback → test. |
| `prisma/migrations/<timestamp>_pr_sc_03_passport_inventory_score/migration.sql` | NEW | Additive `ALTER TABLE` for both models. |
| `docs/product/PR-SC-03-SCOPE.md` | NEW | Scope manifest. |

### 8.8 Forbidden files

- `prisma/store-schema.prisma` (no store-DB change — `Part.inventoryScore` is explicitly OUT per §8.2).
- `src/lib/authorization/permissions.ts` (no new keys in this PR — `passport.read`/`passport.manage` are added in PR-SC-07).
- `src/lib/admin/**` (frozen — no resource config change).
- `src/app/api/seller/passport/**`, `src/app/admin/store/passport/**` (PR-SC-07 surface).
- `src/app/api/seller/leads/**`, `src/app/seller/leads/**` (PR-SC-06 surface).
- `src/lib/crm/**` (PR-SC-01 surface, frozen).

### 8.9 Dependencies

- **PR-SC-00 — COMPLETE** (not strictly required for schema PR, but baseline alignment — the integration test pattern from PR-SC-00 is the template for PR-SC-07's passport tenant-isolation test).
- **PR-SC-01 — COMPLETE** (already merged). Not strictly required for PR-SC-03, but baseline alignment.
- **NOT a dependency:** PR-SC-04, PR-SC-05, PR-SC-06 (PR-SC-03 is independent — schema + algorithm only, no UI). PR-SC-07 depends on PR-SC-03.

### 8.10 Rollback

1. `git revert <PR-SC-03 merge SHA>`.
2. `ALTER TABLE "MachinePassport" DROP COLUMN "specsVerifiedAt", "specsVerifiedBy", "ownershipVerifiedAt", "ownershipVerifiedBy", "inspectionVerifiedAt", "inspectionVerifiedBy", "serviceHistoryVerifiedAt", "serviceHistoryVerifiedBy", "passportScore", "passportScoreVersion";`
3. `ALTER TABLE "Listing" DROP COLUMN "inventoryScore", "inventoryScoreVersion", "inventoryScoredAt", "inventoryScoreBreakdown";`
4. `DROP INDEX "Listing_inventoryScore_idx";` (and the MachinePassport passportScore index if added).
5. **No data loss** — all new columns were nullable; scores were computed by backfill (recomputable on re-apply).
6. **Rollback order if PR-SC-07 has landed:** revert PR-SC-07 first (it consumes the new columns), then PR-SC-03.

### 8.11 Definition of Done

- [ ] `bun run db:validate` passes (schema valid).
- [ ] `bun run typecheck` + `bun run lint` pass.
- [ ] `bun run test` passes (existing + new).
- [ ] `tests/unit/passport-score.test.ts` — Passport Score v1 algorithm: `specs_verified(25) + ownership_verified(20) + inspection_current(25) + service_history(15) + photos_3plus(15) = 100`; clamping; structure (`breakdown[]` with 5 factors, each `{ factor, points, max, detail }`); determinism (same input → same output).
- [ ] `tests/unit/inventory-score.test.ts` — Smart Inventory Score v1-reduced algorithm: 6 factors summing to 100; clamping; structure; determinism.
- [ ] `tests/migration/pr-sc-03-reversibility.test.ts` — apply migration → run backfill → run unit tests → rollback migration → run unit tests (algorithms still pass on the in-memory inputs; DB-dependent assertions skipped after rollback).
- [ ] `bunx tsx scripts/calculate-passport-score.ts --dry-run` runs without error (no DB write in dry-run mode).
- [ ] `bunx tsx scripts/calculate-inventory-score.ts --dry-run` runs without error.
- [ ] CI `verify` green on PR HEAD.
- [ ] Independent /Critic review: no BLOCKER findings; migration is purely additive; no existing column modified.

### 8.12 Audit action keys

| Mutation | Audit action key | EntityType | EntityId |
|---|---|---|
| (none — schema + algorithm + backfill only) | N/A — backfill scripts log to stdout (not AuditLog). PR-SC-07 introduces the `passport.section.verify` audit action. | — | — |

### 8.13 Acceptance test summary

1. Apply migration on a staging DB → `prisma validate` passes.
2. Run `bunx tsx scripts/calculate-passport-score.ts` → script exits 0; passports with all-sections-unverified get `passportScore = 0`; passports with `specsVerifiedAt != null` get `passportScore += 25`.
3. Run `bunx tsx scripts/calculate-inventory-score.ts` → script exits 0; listings with 3+ images get `inventoryScore += 20 (has_images) + 10 (image_count_3plus)`; verified listings get `+= 15`.
4. Re-run both scripts → same scores (idempotent).
5. Rollback migration → schema reverts to baseline; `MachinePassport` has only the original 7 fields; `Listing` has no inventory-score fields.
6. Re-apply migration → scripts run again without error.

---

## 9. PR-SC-07 — Machine Passport UI (Trust Validation & Experience)

**Stage:** 4 (Machine Passport). **Branch:** `feature/pr-sc-07-passport-ui` (NEW, off `main` post-PR-SC-03). **Type:** UI + API. **No schema change** (schema from PR-SC-03).

### 9.1 Scope — IN

| Surface | Detail |
|---|---|
| API | `src/app/api/seller/passport/[listingId]/route.ts` (NEW): `GET` returns the passport + 5 sections + Passport Score + breakdown; `PATCH` updates per-section verification (`{ section, verified }`). |
| API | `src/app/api/seller/passport/[listingId]/request-inspection/route.ts` (NEW): `POST` creates an `Inspection` row (`status: 'REQUESTED'`, `requestedBy: user.id`, `listingId`). |
| UI | `src/app/admin/store/passport/[listingId]/page.tsx` (NEW): server component. Renders 5 sections (Specs, Ownership, Inspection, Service History, Documents) with verification status + Passport Score gauge + "Request Inspection" CTA. The route is under `/admin/store/` per `STORE-CENTER-DETAILED-DESIGN.md` §7.1 because the existing inventory/passport domain is admin-scoped; sellers access via the same route (server-side ownership check redirects non-owners to 404). A seller-facing mirror at `/seller/passport/[listingId]` is a future enhancement (R8). |
| Permissions | Add 2 keys to `PERMISSIONS` array (`src/lib/authorization/permissions.ts`): `passport.read`, `passport.manage`. Add `passport.read` to `ROLE_PERMISSIONS.SELLER` + `ROLE_PERMISSIONS.MODERATOR` + `ROLE_PERMISSIONS.SUPPORT`. Add `passport.manage` to `ROLE_PERMISSIONS.SELLER` + `ROLE_PERMISSIONS.ADMIN` (via spread). Add hand-crafted Persian entries to `prisma/seed-rbac.ts`. |
| Algorithm usage | Uses `src/lib/passport/passport-score.ts` (from PR-SC-03) to compute the score on-the-fly in the GET response (and recompute on PATCH). |
| Tests | `tests/integration/passport-get.test.ts`, `tests/integration/passport-patch.test.ts`, `tests/integration/passport-request-inspection.test.ts`, `tests/security/tenant-isolation-passport.test.ts`, `tests/unit/passport-score-display.test.ts`, `tests/a11y/passport-page.test.ts`, `tests/responsive/passport-page.test.ts`. |

### 9.2 Scope — OUT

| Out item | Reason | Target |
|---|---|---|
| Seller-facing mirror route `/seller/passport/[listingId]` | R8 — out of MVP scope. The `/admin/store/passport/[listingId]` route works for both admin and seller (ownership-checked). | Future PR |
| `PassportDocument` model + document management UI | R17 — documents are modeled via `PassportEvent` with `eventType: 'DOCUMENT'` in MVP. A dedicated model + upload UI is a future enhancement. | Future PR |
| Auto-assign ServiceProvider on Request Inspection | Future enhancement. MVP: Inspection record status=REQUESTED, admin manually assigns. | Future PR |
| Public Passport view (`/passport/[slug]`) | Out of MVP scope — passport is seller/admin-only. | Future PR |
| AI-assisted spec extraction | AI advisory-only — out of scope for MVP passport. | Future PR |
| Cross-listing passport comparison | Out of MVP scope. | Future PR |
| Machine Intelligence Profile surfacing (D7 idea B) | Optional PR-SC-09b per roadmap — may ship with this PR or as a follow-up. | PR-SC-09b (optional) |

### 9.3 API contracts

#### `GET /api/seller/passport/[listingId]`

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'passport.read')` → 403.
- **Ownership:** load `Listing` by `listingId` (select `sellerId`, `companyId`); verify `listing.sellerId === user.id` OR `listing.companyId === user.companyId` OR `isAdmin` (else 404 — do NOT leak existence).
- **Query params:** none.
- **Response 200:**
  ```json
  {
    "success": true,
    "listing": {
      "id": "...", "title": "...", "slug": "...", "year": 2021, "workingHours": 3200,
      "brand": { "name": "Caterpillar" }, "model": { "name": "320 Excavator" }
    },
    "passport": {
      "id": "...", "serialNumber": "CAT-320-2021-0042",
      "inspectionDate": "ISO", "inspectionResult": "PASSED",
      "createdAt": "ISO", "updatedAt": "ISO",
      "specsVerifiedAt": "ISO", "specsVerifiedBy": "user-id",
      "ownershipVerifiedAt": null, "ownershipVerifiedBy": null,
      "inspectionVerifiedAt": "ISO", "inspectionVerifiedBy": "user-id",
      "serviceHistoryVerifiedAt": null, "serviceHistoryVerifiedBy": null
    },
    "events": [
      { "id": "...", "eventType": "SERVICE", "title": "...", "description": "...", "date": "ISO", "performedBy": "..." }
    ],
    "inspections": [
      { "id": "...", "status": "COMPLETED", "completedAt": "ISO", "score": 85, "reportUrl": "..." }
    ],
    "images": [
      { "id": "...", "url": "...", "isPrimary": true, "alt": "..." }
    ],
    "score": 60,
    "scoreBreakdown": {
      "specs": 25, "ownership": 0, "inspection": 25, "service": 0, "photos": 15
    }
  }
  ```
  - If no `MachinePassport` exists for the `listingId` → 404 with `{ error: "پاسپورتی برای این آگهی ثبت نشده", code: "NO_PASSPORT" }`. UI shows "ایجاد پاسپورت" button (POST to create a blank passport — see §9.3 POST below).
- **Error codes:**
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — SELLER without `passport.read`; BUYER (no `passport.read`).
  - `404 Not Found` — Listing not found OR not owner (do NOT distinguish); OR no passport for the listing.
  - `500 Internal Server Error` — DB query failure.
- **Rate limit:** 60 req/min per user.
- **Pagination:** N/A.
- **Filter/sort:** N/A.

#### `POST /api/seller/passport/[listingId]` (create blank passport)

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'passport.manage')` → 403. Ownership check on Listing.
- **Request body:** `{}` (no params).
- **Behavior:** creates a `MachinePassport` row with `listingId` (1:1 — `listingId @unique`). If a passport already exists → 409.
- **Response 201:** the created passport (same shape as GET's `passport` field, all verification fields null).
- **Error codes:** 400 (invalid listingId), 401, 403, 404 (Listing not found / not owner), 409 (passport already exists), 500.
- **Audit:** `logAudit({ action: 'passport.create', entityType: 'MachinePassport', entityId: passport.id, actorId: user.id })`.

#### `PATCH /api/seller/passport/[listingId]`

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'passport.manage')` → 403. Ownership check on Listing.
- **Request body:**
  ```json
  {
    "section": "specs",
    "verified": true
  }
  ```
  - `section`: one of `"specs" | "ownership" | "inspection" | "serviceHistory"` (NOT `"documents"` — documents are managed via `PassportEvent`).
  - `verified`: boolean. `true` → set `{section}VerifiedAt = now`, `{section}VerifiedBy = user.id`. `false` → set both to `null`.
- **Behavior:**
  1. Load `MachinePassport` by `listingId` (with `Listing` include for ownership check).
  2. Verify ownership.
  3. Update the section fields.
  4. Append a `PassportEvent` with `eventType: 'VERIFICATION'`, `title: "تأیید بخش {section}"` (or "لغو تأیید بخش {section}" if `verified: false`), `date: now`, `performedBy: user.id`.
  5. Recompute `passportScore` via `src/lib/passport/passport-score.ts`; persist `passportScore` + `passportScoreVersion`.
  6. Return the updated passport (same shape as GET).
- **Response 200:** updated passport + score + breakdown.
- **Error codes:**
  - `400 Bad Request` — invalid `section` value; missing `verified` field.
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — SELLER without `passport.manage`; OR not owner.
  - `404 Not Found` — Listing/Passport not found OR not owner.
  - `500 Internal Server Error` — DB write failure.
- **Transaction:** MAIN DB only. Uses `auditMutationTransactional` — atomic: (a) update `MachinePassport` section fields + score, (b) append `PassportEvent`, (c) write `AuditLog`. All in one `db.$transaction`.
- **Concurrency:** `SELECT FOR UPDATE` on the `MachinePassport` row at the start of the transaction. Two concurrent PATCHes on the same section: first succeeds, second is a no-op (idempotent — section is already verified, `verified: true` again → 200 no-op). Two concurrent PATCHes on DIFFERENT sections: both succeed (no cross-section invariant).
- **Audit:** `logAudit({ action: 'passport.section.verify', entityType: 'MachinePassport', entityId: passport.id, before: { section, verifiedAt, verifiedBy }, after: { section, verifiedAt, verifiedBy }, actorId: user.id })`.

#### `POST /api/seller/passport/[listingId]/request-inspection`

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'passport.manage')` → 403. Ownership check on Listing.
- **Request body:**
  ```json
  { "notes": "optional notes for the inspector" }
  ```
  - `notes` (optional): max 1000 chars.
- **Behavior:**
  1. Load Listing + verify ownership.
  2. Create `Inspection` row with `status: 'REQUESTED'`, `requestedBy: user.id`, `listingId`, `notes` (if provided). (Schema: `prisma/schema.prisma:1382-1404` — `requestedBy` is required, `status` defaults to `REQUESTED`.)
  3. Append a `PassportEvent` with `eventType: 'INSPECTION_REQUESTED'`, `title: "درخواست بازرسی"`, `date: now`, `performedBy: user.id`.
- **Response 201:** `{ success: true, inspectionId: "..." }`.
- **Error codes:**
  - `400 Bad Request` — `notes` too long.
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — SELLER without `passport.manage`; OR not owner.
  - `404 Not Found` — Listing not found / not owner.
  - `500 Internal Server Error` — DB write failure.
- **Transaction:** MAIN DB only. `auditMutationTransactional`.
- **Audit:** `logAudit({ action: 'passport.inspection.request', entityType: 'Inspection', entityId: inspection.id, actorId: user.id })`.

### 9.4 Empty data, pagination, filter, sort, transaction, concurrency behavior

- **Empty (no passport):** GET → 404 with `code: 'NO_PASSPORT'`. UI shows "ایجاد پاسپورت" button. POST creates a blank passport → all 4 sections ❌, score 0.
- **Empty (no events):** GET → `events: []`. UI shows "هیچ رویدادی ثبت نشده" in the Service History section.
- **Empty (no inspections):** GET → `inspections: []`. UI shows "هیچ بازرسی ثبت نشده" in the Inspection section.
- **Empty (no images):** GET → `images: []`. Score breakdown `photos: 0` (need 3+ images for 15 pts).
- **Pagination:** N/A.
- **Filter/sort:** N/A.
- **Transaction:** MAIN DB only. PATCH + POST use `auditMutationTransactional`.
- **Concurrency:** `SELECT FOR UPDATE` on `MachinePassport` for PATCH; idempotent for same-section re-verify.

### 9.5 main DB vs store DB boundary

- **MAIN DB only.** `db.machinePassport.*`, `db.passportEvent.*`, `db.inspection.*`, `db.listingImage.*`. **No store-DB query.** No cross-DB concern.

### 9.6 Ownership config

- **Custom route path (§4.1 path b).** The `MachinePassport` resource is NOT yet registered in the Universal Resource API. PR-SC-07 uses a custom route (`/api/seller/passport/[listingId]`) with explicit ownership check via `Lead.listing.sellerId`-equivalent pattern: `passport.listing.sellerId === user.id` OR `passport.listing.companyId === user.companyId` OR `isAdmin`.
- **Future option:** register `MachinePassport` as a universal resource with `ownership: { relation: { field: 'listing', ownerField: 'sellerId' }, moderatePermission: 'passport.manage' }`. The PR-SC-00 mechanism supports relation-based ownership per `src/lib/admin/types.ts:329-334`. NOT in this PR — the custom route is simpler. **Recommendation:** open a follow-up PR after PR-SC-07 to register `MachinePassport` (and `Lead` from PR-SC-06) as universal resources.
- **Negative test (mandatory merge gate):** `tests/security/tenant-isolation-passport.test.ts` — Seller A + Seller B seeded with distinct listings + passports. Seller A GET `/api/seller/passport/{sellerB_listing_id}` → 404 (not 403 — do not leak). Seller A PATCH `/api/seller/passport/{sellerB_listing_id}` → 404. Seller A POST `/api/seller/passport/{sellerB_listing_id}/request-inspection` → 404.

### 9.7 Allowed files (exhaustive)

| File | Action | Notes |
|---|---|---|
| `src/lib/authorization/permissions.ts` | EDIT | Add `passport.read`, `passport.manage` to `PERMISSIONS`; add to `ROLE_PERMISSIONS.SELLER` (both), `ROLE_PERMISSIONS.MODERATOR` + `ROLE_PERMISSIONS.SUPPORT` (`passport.read` only). |
| `prisma/seed-rbac.ts` | EDIT | Hand-crafted Persian entries for both keys. |
| `src/app/api/seller/passport/[listingId]/route.ts` | NEW | `GET` + `POST` (create blank) + `PATCH` (verify section). |
| `src/app/api/seller/passport/[listingId]/request-inspection/route.ts` | NEW | `POST` creates `Inspection`. |
| `src/app/admin/store/passport/[listingId]/page.tsx` | NEW | Server component UI. |
| `tests/integration/passport-get.test.ts` | NEW | GET returns 5 sections + score. |
| `tests/integration/passport-patch.test.ts` | NEW | PATCH sets `specsVerifiedAt/By`; audit row; PassportEvent appended; score recomputed. |
| `tests/integration/passport-request-inspection.test.ts` | NEW | POST creates `Inspection`. |
| `tests/security/tenant-isolation-passport.test.ts` | NEW | Cross-seller negative test. |
| `tests/unit/passport-score-display.test.ts` | NEW | Score renders with breakdown tooltip. |
| `tests/a11y/passport-page.test.ts` | NEW | axe-core 0 violations; legal disclaimer present ("verified by seller/admin, NOT guaranteed by HEAVIX"). |
| `tests/responsive/passport-page.test.ts` | NEW | 375/768/1280 breakpoints. |
| `docs/product/PR-SC-07-SCOPE.md` | NEW | Scope manifest. |

### 9.8 Forbidden files

- `prisma/schema.prisma` (no schema change — schema from PR-SC-03).
- `prisma/store-schema.prisma` (no store-DB change).
- `src/lib/passport/passport-score.ts`, `src/lib/inventory/inventory-score.ts` (PR-SC-03 surface — frozen).
- `src/lib/admin/**` (frozen — no resource config change; the `MachinePassport` resource is NOT registered as a universal resource in this PR).
- `src/app/api/admin/resources/**` (universal API — frozen).
- `src/app/seller/leads/**`, `src/app/api/seller/leads/**` (PR-SC-06 surface).
- `src/app/seller/dashboard/**`, `src/app/seller/identity/**` (PR-SC-04/05 surfaces).
- `src/app/showroom/**`, `src/app/seller/showroom/**`, `src/app/api/seller/showroom/**`, `src/app/api/showroom/**` (PR-SC-08 surface).
- `src/app/seller/reports/**`, `src/app/api/seller/reports/**`, `src/app/api/seller/assistant/**` (PR-SC-09 surface).
- `src/lib/crm/**` (PR-SC-01 surface, frozen).
- `src/lib/ai-*/**`, `src/app/api/ai-*/**` (PR-SC-09 surface).

### 9.9 Dependencies

- **PR-SC-03 — COMPLETE** (mandatory — schema + algorithm + backfill from PR-SC-03).
- **PR-SC-00 — COMPLETE** (mandatory — first seller-scoped Passport UI; cross-seller negative test gate).
- **NOT a dependency:** PR-SC-04, PR-SC-05, PR-SC-06 (PR-SC-07 is independent — may land in parallel with Stage 2/3 PRs as long as PR-SC-03 is complete). PR-SC-08, PR-SC-09 not required.

### 9.10 Rollback

1. `git revert <PR-SC-07 merge SHA>`.
2. **No schema impact.** Verification fields from PR-SC-03 remain in DB but no UI renders them. `/admin/store/passport/[listingId]` returns 404.
3. **Rollback order if PR-SC-08 has landed:** PR-SC-08 (Showroom) feeds Passport Score into the showroom "verified machine" badge. If PR-SC-07 is reverted, PR-SC-08's badge degrades to "no passport" (acceptable — UI shows fallback). No forced rollback of PR-SC-08.

### 9.11 Definition of Done

- [ ] `bun run typecheck` + `bun run lint` pass.
- [ ] `bun run test` passes (existing + new).
- [ ] `tests/integration/passport-get.test.ts` — GET returns all 5 sections with verification status + score + breakdown.
- [ ] `tests/integration/passport-patch.test.ts` — PATCH sets `specsVerifiedAt` + `specsVerifiedBy`; `AuditLog` row written with `action: 'passport.section.verify'`; `PassportEvent` appended with `eventType: 'VERIFICATION'`; `passportScore` recomputed (e.g., verifying `specs` adds 25 points).
- [ ] `tests/integration/passport-request-inspection.test.ts` — POST creates `Inspection` row with `status: 'REQUESTED'`, `requestedBy: user.id`; `PassportEvent` appended with `eventType: 'INSPECTION_REQUESTED'`.
- [ ] `tests/security/tenant-isolation-passport.test.ts` — Seller A cannot GET/PATCH/POST-inspection on Seller B's listing (all → 404).
- [ ] `tests/unit/passport-score-display.test.ts` — score renders with breakdown tooltip; gauge has `role="meter"` + `aria-valuenow` + `aria-valuemin=0` + `aria-valuemax=100`.
- [ ] `tests/a11y/passport-page.test.ts` — axe-core 0 violations; **legal disclaimer text present** ("تأیید شده توسط فروشنده/ادمین، تضمین HEAVIX نیست" — verified by seller/admin, NOT guaranteed by HEAVIX).
- [ ] `tests/responsive/passport-page.test.ts` — 375/768/1280 breakpoints pass; score gauge readable on mobile.
- [ ] Manual smoke: Seller navigates to `/admin/store/passport/{own-listing-id}` → empty state (no passport) → clicks "ایجاد پاسپورت" → passport created → all sections ❌ → score 0 → clicks "تأیید بخش specs" → section ✅ → score 25 → audit log visible.
- [ ] Manual smoke: Seller clicks "درخواست بازرسی" → `Inspection` row created with `status: 'REQUESTED'`.
- [ ] CI `verify` green on PR HEAD.
- [ ] Independent /Critic review: no BLOCKER findings; legal disclaimer present; ownership enforced.

### 9.12 Audit action keys

| Mutation | Audit action key | EntityType | EntityId |
|---|---|---|---|
| Create blank passport (POST `/api/seller/passport/[listingId]`) | `passport.create` | `MachinePassport` | `passport.id` |
| Verify/un-verify section (PATCH `/api/seller/passport/[listingId]`) | `passport.section.verify` | `MachinePassport` | `passport.id` |
| Request inspection (POST `/api/seller/passport/[listingId]/request-inspection`) | `passport.inspection.request` | `Inspection` | `inspection.id` |

### 9.13 Acceptance test summary

1. Seed a Listing with no Passport. Navigate to `/admin/store/passport/{listingId}` → assert empty state + "ایجاد پاسپورت" button.
2. Click "ایجاد پاسپورت" → assert `MachinePassport` row created, page re-renders with all sections ❌.
3. Click "تأیید بخش specs" → assert `specsVerifiedAt` set, score += 25, audit log written, PassportEvent appended.
4. Add 3 images to the listing → reload → assert `photos` section ✅, score += 15.
5. Click "درخواست بازرسی" → assert `Inspection` row created with `status: 'REQUESTED'`.
6. Login as SELLER B → attempt `GET /api/seller/passport/{sellerA_listing_id}` → assert 404.
7. Mobile 375px: single-column, all touch targets ≥ 44px, score gauge readable.
8. Assert legal disclaimer text present on the page.

---

## 10. PR-SC-08 — VIP Showroom (Self-Contained: Schema + API + UI + Server-Side Subscription Enforcement)

**Stage:** 5 (VIP Showroom). **Branch:** `feature/pr-sc-08-vip-showroom` (NEW, off `main` post-PR-SC-00 + PR-SC-04). **Type:** Schema (NEW tables) + API + UI + server-side enforcement. **Self-contained** — does NOT depend on a separate PR-SC-02 schema PR; the Showroom + SalesTeamMember migrations are included in this PR.

### 10.1 Scope — IN

| Surface | Detail |
|---|---|
| Schema | `prisma/schema.prisma` — `Showroom` model (NEW): `id, companyId @unique, company, isActive Boolean @default(false), template String @default("dealer") (dealer\|manufacturer\|used_equipment), layout Json?, featuredListingIds String[] (PG native array), viewCount Int @default(0), createdAt, updatedAt`. `@@index([isActive])`. |
| Schema | `prisma/schema.prisma` — `SalesTeamMember` model (NEW): `id, companyId, company, userId? (optional link to User), name, role String (MANAGER\|SALES\|TECHNICAL_SALES), phone?, email?, photoUrl?, isActive Boolean @default(true), createdAt, updatedAt`. `@@index([companyId])`. |
| Schema | `prisma/schema.prisma` — `Company` (M8) += 2 back-relations (NO new columns): `showroom Showroom?`, `salesTeamMembers SalesTeamMember[]`. |
| Helper | `src/lib/showroom/premium.ts` (NEW): `companyHasActivePremium(companyId)` — queries `PremiumSubscription` where `user.companyId = companyId AND status = 'ACTIVE' AND (expiresAt IS NULL OR expiresAt > now)`. NO migration to `PremiumSubscription` (per ADR-005-amendment-01 §2). Pure function (takes a Prisma client). |
| Helper | `src/lib/showroom/showroom-auth.ts` (NEW): `assertPublicShowroomAccessible(slug)` (returns showroom or throws `notFound`), `assertManagementAccessible(user)` (returns showroom or throws 403). All 4 VIP enforcement paths tested. |
| API | `src/app/api/showroom/[slug]/route.ts` (NEW): public `GET` JSON. VIP-1 path (active + premium → 200) / VIP-2 path (inactive or no premium → 404 + noindex). |
| API | `src/app/api/seller/showroom/route.ts` (NEW): `GET` returns management view (VIP-3 active → 200 / VIP-4 non-VIP → 403); `PATCH` updates template/layout/isActive (server re-validates VIP BEFORE write). |
| API | `src/app/api/seller/showroom/feature/route.ts` (NEW): `POST` adds listing to `featuredListingIds` (max 12). Server re-validates VIP + ownership of the listing. |
| API | `src/app/api/seller/showroom/feature/[listingId]/route.ts` (NEW): `DELETE` removes listing from `featuredListingIds`. |
| UI | `src/app/showroom/[slug]/page.tsx` (NEW): public showroom. Server component. `generateMetadata` for SEO. VIP-1/VIP-2 enforcement. |
| UI | `src/app/seller/showroom/page.tsx` (NEW): management UI. Server-component shell + client form. VIP-3/VIP-4 enforcement. |
| Permissions | Add 3 keys to `PERMISSIONS` array: `showroom.read`, `showroom.manage`, `showroom.admin`. Add `showroom.read` + `showroom.manage` to `ROLE_PERMISSIONS.SELLER`. Add `showroom.admin` to ADMIN (via spread). `showroom.read` is for authenticated admin oversight — anonymous users do NOT call `requirePermission` (the public route checks `Showroom.isActive + companyHasActivePremium` directly). |
| SalesTeamMember section | Feature-flagged: `NEXT_PUBLIC_SHOWROOM_SALES_TEAM_ENABLED=false` by default. When enabled, only `name` + `role` + `photoUrl` are public; `phone`/`email` require a `Lead` to be created first (R30 — out of MVP; CTAs are `tel:`/`mailto:`). |
| Tests | `tests/unit/company-has-active-premium.test.ts`, `tests/security/showroom-vip-paths.test.ts` (all 4 paths), `tests/security/tenant-isolation-showroom.test.ts`, `tests/integration/showroom-feature-toggle.test.ts`, `tests/integration/showroom-seo.test.ts` (`generateMetadata` + `robots` + `X-Robots-Tag`), `tests/a11y/showroom-page.test.ts`, `tests/responsive/showroom-page.test.ts`, `tests/migration/pr-sc-08-reversibility.test.ts`. |

### 10.2 Scope — OUT

| Out item | Reason | Target |
|---|---|---|
| `PremiumSubscription.companyId` migration | ADR-005-amendment-01 §2 — MVP uses `companyHasActivePremium(companyId)` helper (queries `PremiumSubscription.user.companyId`). NO migration. | Future ADR (PremiumSubscription → companyId @unique OR CompanySubscription join) |
| `Showroom.bannerUrl` / `Showroom.logoUrl` | REUSE `Company.coverImage` / `Company.logoUrl` (already exist per M8). DO NOT add to Showroom. | None — reuse Company fields |
| `Showroom.slug` | REUSE `Company.slug` for `/showroom/[slug]` (per ADR-005-amendment-01 §1, R1). DO NOT add a separate `Showroom.slug`. | None — reuse Company.slug |
| `POST /api/showroom/[slug]/contact` (creates a Lead from showroom) | R30 — MVP CTAs are `tel:` link to `Company.phone` + `mailto:` to `Company.email`. | Future PR |
| Showroom analytics dashboard | Out of MVP scope. View count is incremented on each public render. | Future PR |
| Showroom template editor (custom layout) | MVP ships 3 fixed templates (`dealer`, `manufacturer`, `used_equipment`). `layout Json?` is for future customization. | Future PR |
| Multi-showroom per Company | `Showroom.companyId @unique` — one showroom per company in MVP. | Future PR |
| Showroom comments/reviews | Out of MVP scope. Reviews are anchored to Listings, not Showrooms. | Future PR |

### 10.3 API contracts

#### `GET /showroom/[slug]` (public page)

- **No auth.** Server component.
- **Logic:**
  1. `const showroom = await db.showroom.findFirst({ where: { company: { slug: params.slug } }, include: { company: true } })`.
  2. If `!showroom` → `notFound()` (404 — DO NOT leak existence).
  3. If `!showroom.isActive` → `notFound()` (404).
  4. If `!(await companyHasActivePremium(showroom.companyId))` → `notFound()` (404).
  5. Increment `showroom.viewCount` (debounced via upstash/redis or skip on every Nth request — TBD infra; for MVP, increment on every render and accept the write load).
  6. Render with `<meta name="robots" content="index, follow">`.
- **Headers:** `X-Robots-Tag: index, follow` on 200; `X-Robots-Tag: noindex, nofollow` on 404.

#### `GET /api/showroom/[slug]` (public JSON)

- Same logic as the page; returns JSON for client-side fetching.
- **Response 200:**
  ```json
  {
    "success": true,
    "showroom": { "id": "...", "template": "dealer", "layout": null, "viewCount": 1234 },
    "company": {
      "name": "...", "slug": "...", "logoUrl": "...", "coverImage": "...",
      "brandColor": "#F58220", "storeDescription": "...",
      "verified": true, "premium": true, "avgRating": 4.5, "reviewCount": 23
    },
    "featuredMachines": [
      {
        "id": "...", "title": "...", "price": "...", "slug": "...",
        "primaryImage": "...", "passportScore": 80
      }
    ],
    "salesTeam": [
      { "id": "...", "name": "...", "role": "MANAGER", "photoUrl": "..." }
    ]
  }
  ```
  - `salesTeam` is included only if `NEXT_PUBLIC_SHOWROOM_SALES_TEAM_ENABLED=true`. Phone/email are NOT included in the public response (R30 — buyer must create a Lead first).
  - `passportScore` per featured machine is computed via `src/lib/passport/passport-score.ts` (from PR-SC-03). If PR-SC-03 is not yet landed, this field is `null`.
- **Error codes:**
  - `404 Not Found` — not found / inactive / not VIP (do NOT distinguish).
  - `500 Internal Server Error` — DB failure.
- **Pagination:** N/A.
- **Filter/sort:** N/A.

#### `GET /api/seller/showroom` (management)

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'showroom.manage')` → 403. **Server re-validates VIP**: `companyHasActivePremium(user.companyId)` → 403 if not VIP. If `user.companyId` is null → 403.
- **Query params:** none.
- **Response 200:** same shape as public, plus `layout` editable config + `isVip: true`.
- **Error codes:**
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — not VIP (with message: "نمایشگاه VIP فقط برای فروشندگان ویژه فعال است."); OR SELLER without `showroom.manage`; OR `user.companyId` is null.
  - `404 Not Found` — Showroom not yet created for the Company (UI shows "شروع تنظیم نمایشگاه" button → POST to create).
  - `500 Internal Server Error` — DB failure.
- **Rate limit:** 60 req/min per user.

#### `POST /api/seller/showroom` (create showroom)

- **Auth:** same as GET management. VIP re-validation.
- **Request body:** `{ template?: "dealer"|"manufacturer"|"used_equipment" }` (default `dealer`).
- **Behavior:** creates a `Showroom` row for `user.companyId` (1:1 via `companyId @unique`). If a showroom already exists → 409.
- **Response 201:** the created showroom.
- **Error codes:** 400 (invalid template), 401, 403 (not VIP), 409 (already exists), 500.
- **Audit:** `logAudit({ action: 'showroom.create', entityType: 'Showroom', entityId, actorId: user.id })`.

#### `PATCH /api/seller/showroom`

- **Auth:** same as GET management. **Server re-validates VIP BEFORE write** (§4.4).
- **Request body:**
  ```json
  {
    "template": "dealer",
    "layout": { ... },
    "isActive": true
  }
  ```
  - `template` (optional): one of 3 values → 400 if invalid.
  - `layout` (optional): JSON, must match the template's schema (validated server-side) → 400 if invalid.
  - `isActive` (optional): boolean. If `true` → requires `featuredListingIds.length >= 1` → 409 if empty showroom.
  - **NOT writable**: `id`, `companyId`, `viewCount`, `createdAt`, `updatedAt`, `featuredListingIds` (use the feature-add/remove routes). If any appears in body → 400 immutable-field.
- **Response 200:** updated showroom.
- **Error codes:**
  - `400 Bad Request` — validation failure.
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — not VIP; OR VIP lapsed mid-session (server re-checks before write); OR not owner.
  - `404 Not Found` — Showroom not found for `user.companyId`.
  - `409 Conflict` — `isActive: true` with empty `featuredListingIds`.
  - `500 Internal Server Error` — DB write failure.
- **Transaction:** MAIN DB only. `auditMutationTransactional`.
- **Concurrency:** Optimistic re-check. VIP status is re-validated at the start of the transaction (within the `SELECT FOR UPDATE`). If VIP lapsed between GET and PATCH → 403 with message "اشتراک VIP شما منقضی شده است."
- **Audit:** `logAudit({ action: 'showroom.layout.update', entityType: 'Showroom', entityId, before, after, actorId: user.id })`.

#### `POST /api/seller/showroom/feature`

- **Auth:** `showroom.manage` + VIP re-validation + ownership of the listing being featured.
- **Request body:** `{ listingId: string }`.
- **Behavior:**
  1. Load Showroom for `user.companyId`. Verify VIP + ownership.
  2. Load Listing by `listingId`. Verify `listing.companyId === user.companyId` AND `listing.status === 'PUBLISHED'`. Else 400 (cannot feature another seller's machine or a draft).
  3. If `listingId` already in `featuredListingIds` → 409 (already featured).
  4. If `featuredListingIds.length >= 12` → 409 (max reached).
  5. Append `listingId` to `featuredListingIds`.
- **Response 200:** updated `featuredListingIds`.
- **Error codes:** 400 (not owned / not published), 401, 403 (not VIP / not owner), 404 (showroom not found), 409 (already featured / max reached), 500.
- **Audit:** `logAudit({ action: 'showroom.featured.add', entityType: 'Showroom', entityId, before: { featuredListingIds }, after: { featuredListingIds }, actorId: user.id })`.

#### `DELETE /api/seller/showroom/feature/[listingId]`

- **Auth:** `showroom.manage` + VIP re-validation + ownership.
- **Behavior:** removes `listingId` from `featuredListingIds`. If `featuredListingIds.length === 0` after removal AND `showroom.isActive === true` → set `isActive = false` (auto-unpublish empty showroom — prevents 404 → 200 flip-flop on the public route). Audit: `showroom.featured.remove`.
- **Response 200:** updated `featuredListingIds` + `isActive`.
- **Error codes:** 401, 403, 404 (showroom not found), 409 (listingId not in `featuredListingIds`), 500.

### 10.4 Empty data, pagination, filter, sort, transaction, concurrency behavior

- **Empty (no showroom for company):** GET management → 404 with `code: 'NO_SHOWROOM'`. UI shows "شروع تنظیم نمایشگاه" button → POST creates a showroom with `isActive: false`.
- **Empty (showroom exists but no featured machines):** GET management → 200 with `featuredMachines: []`. UI shows "نمایشگاه خالی است" + "افزودن ماشین ویژه" button. Public GET → 404 (because `isActive: false` until at least 1 featured machine is added; `PATCH isActive: true` with empty `featuredListingIds` → 409).
- **Empty (not VIP):** GET management → 403 with "اشتراک VIP فعال نیست." + link to `/pricing`.
- **Pagination:** N/A.
- **Filter/sort:** N/A.
- **Transaction:** MAIN DB only. PATCH + POST/DELETE feature use `auditMutationTransactional`.
- **Concurrency:** `SELECT FOR UPDATE` on `Showroom` for PATCH/POST/DELETE. VIP status re-checked inside the transaction (mid-session lapse → 403). Two concurrent `POST /feature` for the same `listingId`: first succeeds, second → 409 (already featured). Two concurrent `DELETE /feature/[listingId]`: first succeeds, second → 409 (not in array).

### 10.5 main DB vs store DB boundary

- **MAIN DB only.** `db.showroom.*`, `db.salesTeamMember.*`, `db.company.*`, `db.listing.*`, `db.premiumSubscription.*`. **No store-DB query.** No cross-DB concern.

### 10.6 Ownership config

- **Custom route path (§4.1 path b).** Showroom is a 1:1 per-Company resource — Universal Resource API is overkill. The `/api/seller/showroom` route enforces ownership via `user.companyId` (session-derived) + `Showroom.companyId === user.companyId` (WHERE clause).
- **Server-side ownership enforcement:** every route loads the Showroom by `user.companyId` (NOT by a request-body-supplied ID). A seller CANNOT operate on another Company's Showroom — the WHERE clause is the ownership filter.
- **VIP enforcement** (§4.4): all 4 paths (public-active, public-inactive-404, management-active, management-non-VIP-403) tested in `tests/security/showroom-vip-paths.test.ts`.
- **Negative test (mandatory merge gate):** `tests/security/tenant-isolation-showroom.test.ts` — Seller A (VIP, Company A) + Seller B (VIP, Company B). Seller A attempts `PATCH /api/seller/showroom` with body containing `id: showroomB.id` → 400 immutable-field OR ignored (route writes only to `user.companyId`'s Showroom). Seller A attempts `POST /api/seller/showroom/feature` with `{ listingId: sellerB_listing_id }` → 400 (listing not owned by Company A). Seller A attempts `GET /api/seller/showroom` while not VIP (mock `PremiumSubscription.expiresAt = past`) → 403. Public `GET /showroom/{sellerB_slug}` while Seller B's showroom `isActive = false` → 404 (not 403 — do not leak existence). Public `GET /showroom/{sellerB_slug}` while Seller B's premium expired → 404.

### 10.7 Allowed files (exhaustive)

| File | Action | Notes |
|---|---|---|
| `prisma/schema.prisma` | EDIT (additive) | Add `Showroom` + `SalesTeamMember` models + `Company` back-relations. |
| `src/lib/authorization/permissions.ts` | EDIT | Add `showroom.read`, `showroom.manage`, `showroom.admin` to `PERMISSIONS`; add `showroom.read` + `showroom.manage` to `ROLE_PERMISSIONS.SELLER`. |
| `prisma/seed-rbac.ts` | EDIT | Hand-crafted Persian entries for the 3 keys. |
| `src/lib/showroom/premium.ts` | NEW | `companyHasActivePremium(companyId)` helper. |
| `src/lib/showroom/showroom-auth.ts` | NEW | `assertPublicShowroomAccessible`, `assertManagementAccessible`. |
| `src/app/api/showroom/[slug]/route.ts` | NEW | Public GET JSON. |
| `src/app/api/seller/showroom/route.ts` | NEW | `GET` + `POST` (create) + `PATCH`. |
| `src/app/api/seller/showroom/feature/route.ts` | NEW | `POST` add featured. |
| `src/app/api/seller/showroom/feature/[listingId]/route.ts` | NEW | `DELETE` remove featured. |
| `src/app/showroom/[slug]/page.tsx` | NEW | Public showroom page (with `generateMetadata`). |
| `src/app/seller/showroom/page.tsx` | NEW | Management UI. |
| `tests/unit/company-has-active-premium.test.ts` | NEW | Helper returns true/false correctly. |
| `tests/security/showroom-vip-paths.test.ts` | NEW | All 4 VIP enforcement paths. |
| `tests/security/tenant-isolation-showroom.test.ts` | NEW | Cross-seller negative test. |
| `tests/integration/showroom-feature-toggle.test.ts` | NEW | POST/DELETE featured listing. |
| `tests/integration/showroom-seo.test.ts` | NEW | `generateMetadata` + `robots` + `X-Robots-Tag`. |
| `tests/a11y/showroom-page.test.ts` | NEW | axe-core 0 violations on public + management. |
| `tests/responsive/showroom-page.test.ts` | NEW | 375/768/1280 breakpoints. |
| `tests/migration/pr-sc-08-reversibility.test.ts` | NEW | Apply → test → rollback → test. |
| `prisma/migrations/<timestamp>_pr_sc_08_showroom_sales_team/migration.sql` | NEW | Additive `CREATE TABLE`. |
| `docs/product/PR-SC-08-SCOPE.md` | NEW | Scope manifest. |

### 10.8 Forbidden files

- `prisma/store-schema.prisma` (no store-DB change).
- `src/lib/admin/**` (frozen — no resource config change; Showroom is NOT registered as a universal resource in this PR).
- `src/app/api/admin/resources/**` (universal API — frozen).
- `src/app/seller/dashboard/**`, `src/app/seller/identity/**`, `src/app/seller/leads/**`, `src/app/admin/store/passport/**`, `src/app/seller/reports/**` (other PRs' surfaces).
- `src/lib/crm/**`, `src/lib/passport/**`, `src/lib/inventory/**` (PR-SC-01/03 surfaces, frozen).
- `src/lib/ai-*/**`, `src/app/api/ai-*/**` (PR-SC-09 surface).
- `prisma/schema.prisma` `PremiumSubscription` model (do NOT add `companyId` — per ADR-005-amendment-01 §2, MVP uses the helper, not a migration).

### 10.9 Dependencies

- **PR-SC-00 — COMPLETE** (mandatory — first seller-scoped Showroom UI; cross-seller negative test gate).
- **PR-SC-04 — COMPLETE** (soft dependency — Showroom uses `Company.brandColor` + `Company.storeDescription` for rendering. If PR-SC-04 has not landed, Showroom falls back to default HEAVIX orange + null `storeDescription` — degraded UX but functional).
- **PR-SC-03 — COMPLETE** (soft dependency — Showroom renders `passportScore` per featured machine. If PR-SC-03 has not landed, the `passportScore` field is `null` in the public response — degraded UX but functional).
- **NOT a dependency:** PR-SC-05, PR-SC-06, PR-SC-07, PR-SC-09.

### 10.10 Rollback

1. `git revert <PR-SC-08 merge SHA>`.
2. `DROP TABLE "Showroom", "SalesTeamMember";` (additive — no existing data affected; `Company` back-relations are Prisma-virtual, no DB column to drop).
3. `bun run db:seed-rbac` to remove the 3 permission keys.
4. UI reverts to 404 on `/showroom/[slug]` and `/seller/showroom`.
5. **Rollback order if PR-SC-09 has landed:** revert PR-SC-09 first (it may reference Showroom for AI suggestions), then PR-SC-08.

### 10.11 Definition of Done

- [ ] `bun run db:validate` passes (schema valid).
- [ ] `bun run typecheck` + `bun run lint` pass.
- [ ] `bun run test` passes (existing + new).
- [ ] `tests/unit/company-has-active-premium.test.ts` — helper returns true when Company has a user with active PremiumSubscription; false when expired; false when no subscription; false when Company has no users.
- [ ] `tests/security/showroom-vip-paths.test.ts` — all 4 paths:
  - VIP-1: public `GET /showroom/{slug}` with active showroom + active premium → 200 + `X-Robots-Tag: index, follow`.
  - VIP-2: public `GET /showroom/{slug}` with `isActive=false` OR expired premium → 404 + `X-Robots-Tag: noindex, nofollow`.
  - VIP-3: management `GET /api/seller/showroom` with VIP → 200.
  - VIP-4: management `GET /api/seller/showroom` without VIP → 403 with "اشتراک VIP فعال نیست."
- [ ] `tests/security/tenant-isolation-showroom.test.ts` — Seller A cannot PATCH Seller B's showroom (route writes only to `user.companyId`'s showroom); cannot feature Seller B's listing (400 not-owned); cannot access Seller B's showroom via public URL when inactive (404).
- [ ] `tests/integration/showroom-feature-toggle.test.ts` — POST adds listing to `featuredListingIds` (max 12); DELETE removes; auto-unpublish when empty.
- [ ] `tests/integration/showroom-seo.test.ts` — `generateMetadata` returns correct title/description/canonical; `robots: { index: false }` when inactive; `X-Robots-Tag: noindex` header on 404.
- [ ] `tests/migration/pr-sc-08-reversibility.test.ts` — apply → run tests → rollback → run tests.
- [ ] `tests/a11y/showroom-page.test.ts` — axe-core 0 violations on public + management pages.
- [ ] `tests/responsive/showroom-page.test.ts` — 375/768/1280 breakpoints pass; mobile sticky CTA bar visible; no horizontal scroll on machine grid (1-column).
- [ ] Manual smoke: VIP seller creates showroom → adds 3 featured machines → sets `isActive: true` → public URL `/showroom/{slug}` renders all 3 machines + `X-Robots-Tag: index, follow`.
- [ ] Manual smoke: VIP seller's premium expires mid-session → `PATCH /api/seller/showroom` → 403 with "اشتراک VIP منقضی شده است."
- [ ] Manual smoke: Non-VIP seller → `GET /api/seller/showroom` → 403 + link to `/pricing`.
- [ ] CI `verify` green on PR HEAD.
- [ ] Independent /Critic review: no BLOCKER findings; all 4 VIP paths enforced; no existence leak (404, not 403, on public inactive).

### 10.12 Audit action keys

| Mutation | Audit action key | EntityType | EntityId |
|---|---|---|---|
| Create showroom (POST `/api/seller/showroom`) | `showroom.create` | `Showroom` | `showroom.id` |
| Update showroom layout/isActive (PATCH `/api/seller/showroom`) | `showroom.layout.update` | `Showroom` | `showroom.id` |
| Add featured machine (POST `/api/seller/showroom/feature`) | `showroom.featured.add` | `Showroom` | `showroom.id` |
| Remove featured machine (DELETE `/api/seller/showroom/feature/[listingId]`) | `showroom.featured.remove` | `Showroom` | `showroom.id` |
| Auto-unpublish empty showroom (DELETE with `featuredListingIds.length === 0`) | `showroom.auto_unpublish` | `Showroom` | `showroom.id` |

### 10.13 Acceptance test summary

1. Seed Company A with active PremiumSubscription + Showroom `isActive=true` + 3 featured machines. `GET /showroom/{slug}` → 200, all 3 machines rendered, `X-Robots-Tag: index, follow`.
2. Set `Showroom.isActive=false` → `GET /showroom/{slug}` → 404, `X-Robots-Tag: noindex`.
3. Expire Company A's PremiumSubscription (`expiresAt = past`) → `GET /showroom/{slug}` → 404 (VIP lapsed).
4. Login as SELLER A (VIP) → `PATCH /api/seller/showroom` with `featuredListingIds: [otherCompanyListingId]` → 400 (ownership — note: `featuredListingIds` is not writable via PATCH; this test uses `POST /feature`).
5. Login as SELLER A (VIP) → `POST /api/seller/showroom/feature` with `{ listingId: otherCompanyListingId }` → 400 (listing not owned by Company A).
6. Login as SELLER B (not VIP) → `GET /api/seller/showroom` → 403.
7. Login as SELLER A → `PATCH /api/seller/showroom` with `isActive: true, featuredListingIds: []` → 409 (empty showroom — note: `featuredListingIds` is not writable via PATCH; this test sets `isActive: true` after removing all featured via DELETE → auto-unpublish kicks in).
8. Mid-session: expire SELLER A's subscription → `PATCH /api/seller/showroom` → 403 with "اشتراک VIP منقضی شده است."
9. Mobile 375px: public showroom renders, sticky CTA bar visible, no horizontal scroll on machine grid (1-column).

---

## 11. PR-SC-09 — AI Business Layer (Reports + Business Assistant, Advisory-Only)

**Stage:** 6 (AI Business Layer). **Branch:** `feature/pr-sc-09-reports-assistant` (NEW, off `main` post-PR-SC-05 + PR-SC-06). **Type:** UI + API + schema (1 new model + 1 column populated) + AI gateway integration + R11 refactor.

### 11.1 Scope — IN

| Surface | Detail |
|---|---|
| Schema | `prisma/schema.prisma` — `AISuggestion` model (NEW): `id, gatewayLogId String, gatewayLog AIGatewayLog @relation(...), suggestionType String, suggestionJson String, status String @default("PENDING") (PENDING\|ACCEPTED\|REJECTED\|DISMISSED), rejectedReason String?, acceptedAt DateTime?, acceptedBy String?, createdAt, updatedAt`. Indexes: `@@index([gatewayLogId])`, `@@index([status, createdAt])`, `@@index([suggestionType, status])`. **NO back-relation to AIGatewayLog unless AIGatewayLog is also extended** — to avoid a schema collision, `AISuggestion.gatewayLogId` is a plain FK without a Prisma relation (or, if a relation is desired, `AIGatewayLog` gets a `suggestions AISuggestion[]` back-relation). Decision: add the back-relation on `AIGatewayLog` (1 column on AISuggestion + 1 virtual back-relation on AIGatewayLog — additive, no migration to AIGatewayLog columns). |
| Schema | `prisma/schema.prisma` — `AIGatewayLog.tokensUsed` is already declared (`schema.prisma:765`) but never populated. This PR fixes the population in `/api/ai-gateway/route.ts` (reads `completion.usage.total_tokens` and writes it). **No schema change for this** — just code. |
| API | `src/app/api/seller/reports/route.ts` (NEW): `GET` returns 30-day KPI cards (views, leads, conversion, revenue) + `lastAssistantRun` (cost, latency, success from `AIGatewayLog`). Cross-DB flag for inventory health. |
| API | `src/app/api/seller/assistant/route.ts` (NEW): `POST` calls `/api/ai-gateway` (server-side) with `taskType: 'SELLER_ASSISTANT'`. Input sanitized (no PII, no other-seller data). Returns suggestions. Creates `AISuggestion` rows (status PENDING). |
| API | `src/app/api/seller/assistant/suggestions/[id]/accept/route.ts` (NEW): `POST` marks suggestion ACCEPTED. `auditMutationTransactional`. |
| API | `src/app/api/seller/assistant/suggestions/[id]/reject/route.ts` (NEW): `POST` marks suggestion REJECTED with reason. `auditMutationTransactional`. |
| API | `src/app/api/seller/assistant/dismiss/route.ts` (NEW): `POST` dismisses suggestion (status=DISMISSED). Appends `suggestionId` to `AdminPreference.hiddenItems` JSON (R20 reuse). |
| API | `src/app/api/seller/leads/[id]/intelligence-explain/route.ts` (REFACTOR from PR-SC-06) — if PR-SC-06 shipped a minimal inline zod schema, this PR refactors it to use `src/lib/ai-output-schemas.ts`. If PR-SC-06 has not landed, this PR creates the route. **Dependency:** PR-SC-06 should land first; if it hasn't, this PR absorbs the route. |
| UI | `src/app/seller/reports/page.tsx` (NEW): 30-day KPI cards + Business Assistant card with "Run assistant" button + suggestions list with accept/reject/dismiss + CTA links. |
| AI helpers | `src/lib/ai-input-filter.ts` (NEW): whitelist + PII strip + other-seller-data strip (BLOCKER-AI-1). Pure function. |
| AI helpers | `src/lib/ai-output-schemas.ts` (NEW): zod schemas for SELLER_ASSISTANT, LISTING_BUILDER, SEMANTIC_SEARCH outputs (BLOCKER-AI-2). |
| AI helpers | `src/lib/ai/prompts/seller-assistant.ts` (NEW): system prompt with 6 uncertainty/evidence clauses (BLOCKER-AI-4): (1) "اطلاعات کافی نیست" uncertainty clause, (2) evidence citation required, (3) confidence threshold 0.7, (4) no-fabrication, (5) no-legal/financial advice, (6) draft-only. |
| R11 refactor | `/api/ai-sales-agent/route.ts` — refactor to call `/api/ai-gateway` (server-side) OR mark `@deprecated` and route traffic to `/api/seller/assistant`. **2-step deprecation**: (1) this PR marks `@deprecated` + routes through Gateway (still returns same shape to avoid breaking old `/seller/leads` if PR-SC-06 hasn't landed), (2) future PR returns 410 Gone after one release cycle. |
| R11 refactor | `/api/ai-seller-assistant/route.ts` — same pattern. |
| Permissions | Add 2 keys to `PERMISSIONS` array: `store.reports.read`, `store.analytics.read`. Add both to `ROLE_PERMISSIONS.SELLER` (SELLER already has `analytics.read` per L268 — `store.analytics.read` is the granular key for the Store Center reports page; if absent, fall back to `analytics.read`). Add hand-crafted Persian entries to `prisma/seed-rbac.ts`. |
| Tests | `tests/security/ai-cost-cap.test.ts`, `tests/ai-eval/seller-assistant-golden.test.ts` (20+ golden inputs), `tests/security/ai-leakage.test.ts`, `tests/security/ai-no-function-calling.test.ts` (static), `tests/integration/ai-suggestion-lifecycle.test.ts`, `tests/security/tenant-isolation-assistant.test.ts`, `tests/integration/reports-real-data.test.ts` (sentinel), `tests/regression/old-ai-routes-deprecated.test.ts`, `tests/a11y/reports-page.test.ts`, `tests/responsive/reports-page.test.ts`. |

### 11.2 Scope — OUT

| Out item | Reason | Target |
|---|---|---|
| HEAVIX Copilot daily briefing (PR-SC-09a) | Optional per roadmap — may ship with this PR or as a follow-up. | PR-SC-09a (optional) |
| Machine Intelligence Profile surfacing (PR-SC-09b) | Optional per roadmap — pure surfacing on `ListingAttributeValue` provenance. May ship with PR-SC-07. | PR-SC-09b (optional) |
| AI-driven listing draft generation (LISTING_BUILDER) | The `LISTING_BUILDER` task type exists in `AITaskPolicy`; this PR does NOT add a new UI for it (existing `/api/ai-gateway` route handles it). The output zod schema in `src/lib/ai-output-schemas.ts` covers it for when consumers call it. | Future PR (listing draft UI) |
| Semantic search (SEMANTIC_SEARCH) | Same — task type exists; this PR adds the output schema only. No new UI. | Future PR |
| AI auto-execute suggestion | **Forbidden by ADR-005 §8.** Every CTA is a `<Link>` to the canonical authorized page. NO "AI does X for you" button. | Never |
| Time-bounded revenue KPI (30d) | `Deal.agreedAmount` exists; the 30d filter uses `Deal.completedAt > now-30d`. MVP supports this — NOT out of scope. | None |
| `AISuggestion` archival job | Out of MVP scope. Status index allows efficient cleanup. | Future PR (delete DISMISSED/REJECTED >90d old) |
| AI suggestion quality dashboard (admin) | Out of MVP scope. KPI-8 (cost per task + acceptance rate) is computed from `AIGatewayLog.cost` + `AISuggestion.status` — but no admin UI in this PR. | Future PR |

### 11.3 API contracts

#### `GET /api/seller/reports`

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'store.reports.read')` → 403 (or fall back to `analytics.read` if `store.reports.read` not yet seeded — but this PR adds it, so the fallback is unnecessary).
- **Ownership scope:** `sellerScope` predicate (§4.1).
- **Query params:** `?range=7d|30d|90d` (default `30d`).
- **Response 200:**
  ```json
  {
    "success": true,
    "range": "30d",
    "performance": {
      "views": 1234,
      "leads": 45,
      "conversion": 0.036,
      "revenue": 2500000000,
      "revenueCurrency": "IRR",
      "series": {
        "views": [/* 30 points */],
        "leads": [/* 30 points */]
      }
    },
    "inventoryHealth": {
      "avgScore": 72,
      "lowStock": 7,
      "stale": 3,
      "storeDbReachable": true
    },
    "lastAssistantRun": {
      "at": "ISO",
      "costUsd": 0.012,
      "success": true
    }
  }
  ```
  - `performance.views` is lifetime (R10 — labeled explicitly in UI as "بازدید کل (از ابتدا)"). `series.views` is a 30-point rolling window computed by subtracting the 30d-ago snapshot from the current `viewCount` (approximation — accurate only if `AnalyticsEvent` is not instrumented; document this in the UI as "تقریبی").
  - `performance.revenue` is `sum(Deal.agreedAmount where sellerId = user.id AND status = 'COMPLETED' AND completedAt > now-30d)` ( Deal has `sellerId` per M11).
  - `inventoryHealth.avgScore` is `avg(Listing.inventoryScore)` for the seller's listings (requires PR-SC-03; if not landed, `null`).
  - `lastAssistantRun` is the latest `AIGatewayLog` row for `taskType: 'SELLER_ASSISTANT'` + `userId: user.id`.
- **Error codes:** 401, 403, 500 (main DB failure — store DB failure sets `storeDbReachable: false`).
- **Rate limit:** 60 req/min per user.

#### `POST /api/seller/assistant`

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'ai.execute')` → 403 (key exists per `permissions.ts:162`; already in `ROLE_PERMISSIONS.SELLER`? — NO, verify; if SELLER doesn't have `ai.execute`, this PR adds it OR the route uses a different permission. Decision: this PR adds `ai.execute` to `ROLE_PERMISSIONS.SELLER` — verified MISSING from SELLER per `permissions.ts:248-271`).
- **Ownership scope:** seller-scoped query (§4.1) BEFORE the LLM input is assembled.
- **Request body:** `{ range?: "7d"|"30d"|"90d" }` (default `30d`).
- **Behavior:**
  1. Assemble sanitized data snapshot: `{ sellerStats: { activeListings, totalViews, totalLeads, totalOffers, conversionRate, lowStockCount, avgInventoryScore, stalePartsCount }, topListings: [{ title, viewCount, leadCount, offerCount, complete: boolean }], recentMovements: [{ type, daysAgo }] }`. **NO PII** (no `viewerPhone`, `viewerName`, `buyerPhone`, `buyerEmail`, `buyerName`); **NO other-seller data** (ownership-scoped query before assembly). Run through `sanitizeAiInput(payload)` as defense-in-depth.
  2. Call `/api/ai-gateway` (server-side) with `taskType: 'SELLER_ASSISTANT'`, `input: sanitizedPayload`. Gateway enforces `AITaskPolicy` (deny-by-default), `AIBudget` (daily/monthly caps), logs to `AIGatewayLog`.
  3. Validate the LLM output against the zod schema (`src/lib/ai-output-schemas.ts`).
  4. Create `AISuggestion` rows (status PENDING) for each suggestion in the validated output.
  5. Return suggestions + cost + model.
- **Response 200:**
  ```json
  {
    "success": true,
    "suggestions": [
      {
        "id": "sugg-1",
        "severity": "warning",
        "message": "۳ آگهی دارای مشخصات ناقص هستند.",
        "ctaHref": "/listings?filter=incomplete",
        "ctaLabel": "بررسی آگهی‌ها",
        "dismissible": true,
        "status": "PENDING"
      }
    ],
    "costUsd": 0.012,
    "model": "default"
  }
  ```
- **Error codes:**
  - `400 Bad Request` — invalid `range` value.
  - `401 Unauthorized` — no session.
  - `403 Forbidden` — no `ai.execute`; OR `AITaskPolicy` missing for `SELLER_ASSISTANT` (deny-by-default).
  - `429 Too Many Requests` — `AIBudget` daily/monthly cap exceeded; OR per-user rate limit.
  - `500 Internal Server Error` — LLM 500 (fallback: return deterministic fallback suggestions — 3 generic tips).
- **Advisory-only:** No `db.*.create/update/delete` in the LLM path. The only DB writes are `AIGatewayLog.create` (by the Gateway) + `AISuggestion.create` (PENDING rows — these are NOT mutations to business data; they are records of AI output for the acceptance-rate KPI). Verified by integration test.
- **Cost discipline:** every call logs `cost` to `AIGatewayLog`. `AITaskPolicy.costCeilingUsd` default 0.05 enforced by the Gateway. Daily/monthly caps in `AIBudget` (10/200 USD).
- **Quality evaluation:** 20-fixture golden set in `tests/ai-eval/seller-assistant-golden.test.ts` — each fixture's LLM output checked for schema validity, CTA href validity, Persian language, no PII leak, ≤5 suggestions. Confidence threshold 0.7 (suggestions with confidence <0.7 suppressed).

#### `POST /api/seller/assistant/suggestions/[id]/accept`

- **Auth:** `getCurrentUser()` → 401. `requirePermission(user.id, 'ai.execute')` → 403. Ownership: `AISuggestion.gatewayLog.userId === user.id` (verify via the join).
- **Request body:** `{}` (no params).
- **Behavior:** sets `AISuggestion.status = 'ACCEPTED'`, `acceptedAt = now`, `acceptedBy = user.id`.
- **Response 200:** `{ success: true, suggestion: { ...status: 'ACCEPTED' } }`.
- **Error codes:** 401, 403 (not owner), 404 (suggestion not found / not owner), 409 (already ACCEPTED/REJECTED/DISMISSED), 500.
- **Transaction:** MAIN DB only. `auditMutationTransactional`.
- **Audit:** `logAudit({ action: 'ai.suggestion.accept', entityType: 'AISuggestion', entityId, actorId: user.id })`.

#### `POST /api/seller/assistant/suggestions/[id]/reject`

- **Auth:** same as accept.
- **Request body:** `{ reason: string (required, max 500 chars) }`.
- **Behavior:** sets `status = 'REJECTED'`, `rejectedReason = reason`.
- **Response 200:** `{ success: true, suggestion: { ...status: 'REJECTED' } }`.
- **Error codes:** 400 (missing/long reason), 401, 403, 404, 409, 500.
- **Audit:** `logAudit({ action: 'ai.suggestion.reject', entityType: 'AISuggestion', entityId, actorId: user.id, reason })`.

#### `POST /api/seller/assistant/dismiss`

- **Auth:** `getCurrentUser()` → 401. (No specific permission — dismissal is a personal preference.)
- **Request body:** `{ suggestionId: string }`.
- **Behavior:**
  1. Sets `AISuggestion.status = 'DISMISSED'` (if the suggestion belongs to the user).
  2. Appends `suggestionId` to `AdminPreference.hiddenItems` JSON array (upsert the preference row).
- **Response 200:** `{ success: true }`.
- **Error codes:** 400 (missing `suggestionId`), 401, 404 (suggestion not found / not owner), 500.
- **Audit:** `logAudit({ action: 'ai.suggestion.dismiss', entityType: 'AdminPreference', entityId: preference.id, actorId: user.id })`.

### 11.4 Empty data, pagination, filter, sort, transaction, concurrency behavior

- **Empty (no data, <7d activity):** Reports → `performance.views = 0`, `leads = 0`, `conversion = null`, `revenue = 0`, `series = { views: [0,0,...], leads: [0,0,...] }`. UI shows "گزارشی موجود نیست. گزارش‌ها پس از ۷ روز فعالیت تولید می‌شوند."
- **Empty (no suggestions):** Assistant → `{ success: true, suggestions: [] }`. UI shows "هیچ پیشنهادی موجود نیست."
- **Empty (AI budget exhausted):** Assistant → 429 with "سقف هوش مصنوعی روزانه پر شده است. فردا دوباره تلاش کنید."
- **Pagination:** N/A (suggestions list is fixed-cap 5 per call; reports is aggregate).
- **Filter/sort:** `?range=` only on reports.
- **Transaction:** MAIN DB only. Accept/reject/dismiss use `auditMutationTransactional`. The LLM call is NOT in a transaction (it's an external HTTP call to the AI Gateway).
- **Concurrency:** Suggestion accept/reject use `SELECT FOR UPDATE` on the `AISuggestion` row. Two concurrent accepts: first succeeds (status PENDING → ACCEPTED), second → 409 (already ACCEPTED).

### 11.5 main DB vs store DB boundary

- **MAIN DB:** `db.aISuggestion.*`, `db.aIGatewayLog.*`, `db.aIBudget.*`, `db.aITaskPolicy.*`, `db.deal.aggregate`, `db.lead.count`, `db.listing.*`, `db.adminPreference.*`.
- **STORE DB:** `storeDb.inventoryBalance.count` (low-stock KPI), `storeDb.stockMovement.findMany` (stale parts KPI). Best-effort.
- **NO cross-DB transaction.** Two parallel `Promise.all` branches. Store DB failure does NOT fail the page.

### 11.6 Ownership config

- **Custom route path (§4.1 path b).** `AISuggestion` is per-user (via `gatewayLog.userId`). The route loads suggestions by `userId` from the session. A seller CANNOT see another seller's suggestions.
- **AI input ownership:** the seller-scoped query (§4.1) runs BEFORE the LLM input is assembled. `tests/security/tenant-isolation-assistant.test.ts` — Seller A's suggestions do not reference Seller B's data (verified by inspecting the LLM input payload via an input-capture fixture).
- **Negative test (mandatory merge gate):** `tests/security/tenant-isolation-assistant.test.ts` — Seller A + Seller B seeded with distinct listings/leads. Seller A POST `/api/seller/assistant` → capture the LLM input payload → assert it contains ONLY Seller A's data (no Seller B listing titles, no Seller B lead counts). Seller A attempts `POST /api/seller/assistant/suggestions/{sellerB_suggestion_id}/accept` → 404.

### 11.7 Allowed files (exhaustive)

| File | Action | Notes |
|---|---|---|
| `prisma/schema.prisma` | EDIT (additive) | Add `AISuggestion` model + `AIGatewayLog.suggestions AISuggestion[]` back-relation (virtual). No `AIGatewayLog` column change. |
| `src/lib/authorization/permissions.ts` | EDIT | Add `store.reports.read`, `store.analytics.read` to `PERMISSIONS`; add both + `ai.execute` to `ROLE_PERMISSIONS.SELLER`. |
| `prisma/seed-rbac.ts` | EDIT | Hand-crafted Persian entries for the 2 new keys. |
| `src/app/api/seller/reports/route.ts` | NEW | `GET` aggregate KPIs. |
| `src/app/api/seller/assistant/route.ts` | NEW | `POST` AI advisory. |
| `src/app/api/seller/assistant/suggestions/[id]/accept/route.ts` | NEW | `POST` accept. |
| `src/app/api/seller/assistant/suggestions/[id]/reject/route.ts` | NEW | `POST` reject. |
| `src/app/api/seller/assistant/dismiss/route.ts` | NEW | `POST` dismiss. |
| `src/app/seller/reports/page.tsx` | NEW | Reports + Assistant UI. |
| `src/lib/ai-input-filter.ts` | NEW | `sanitizeAiInput(payload)` — PII strip + other-seller-data strip. |
| `src/lib/ai-output-schemas.ts` | NEW | Zod schemas for SELLER_ASSISTANT, LISTING_BUILDER, SEMANTIC_SEARCH. |
| `src/lib/ai/prompts/seller-assistant.ts` | NEW | System prompt with 6 uncertainty/evidence clauses. |
| `src/app/api/ai-gateway/route.ts` | EDIT | Populate `AIGatewayLog.tokensUsed` from `completion.usage.total_tokens`. NO other change to the 5 gates. |
| `src/app/api/ai-sales-agent/route.ts` | EDIT (R11 refactor) | Mark `@deprecated` + route through `/api/ai-gateway` (server-side) OR keep the route and redirect to `/api/seller/assistant`. 2-step deprecation. |
| `src/app/api/ai-seller-assistant/route.ts` | EDIT (R11 refactor) | Same pattern. |
| `tests/security/ai-cost-cap.test.ts` | NEW | Single call ≤ `costCeilingUsd`; 100 calls → 101st denied; monthly exhausted → all denied. |
| `tests/ai-eval/seller-assistant-golden.test.ts` | NEW | 20+ golden inputs; schema pass; confidence/uncertainty populated. |
| `tests/security/ai-leakage.test.ts` | NEW | PII not echoed; other-seller data not referenced. |
| `tests/security/ai-no-function-calling.test.ts` | NEW | Static assertion: no ZAI call in codebase passes `tools`/`function_call`/`tool_choice`. |
| `tests/integration/ai-suggestion-lifecycle.test.ts` | NEW | PENDING → ACCEPTED/REJECTED/DISMISSED, audited. |
| `tests/security/tenant-isolation-assistant.test.ts` | NEW | Seller A's suggestions do not reference Seller B's data. |
| `tests/integration/reports-real-data.test.ts` | NEW | Sentinel: no sample numbers; KPI-8 cost-per-task from real `AIGatewayLog.cost`. |
| `tests/regression/old-ai-routes-deprecated.test.ts` | NEW | `/api/ai-sales-agent` + `/api/ai-seller-assistant` route through Gateway OR return 410. |
| `tests/a11y/reports-page.test.ts` | NEW | axe-core 0 violations. |
| `tests/responsive/reports-page.test.ts` | NEW | 375/768/1280 breakpoints. |
| `prisma/migrations/<timestamp>_pr_sc_09_ai_suggestion/migration.sql` | NEW | Additive `CREATE TABLE "AISuggestion"`. |
| `docs/product/PR-SC-09-SCOPE.md` | NEW | Scope manifest. |

### 11.8 Forbidden files

- `prisma/store-schema.prisma` (no store-DB change).
- `src/lib/admin/**` (frozen).
- `src/app/api/admin/resources/**` (universal API — frozen).
- `src/app/api/ai-gateway/route.ts` **beyond the `tokensUsed` population** — do NOT change the 5 gates (rate limit, task policy, auth, quota, budget).
- `src/lib/crm/**` (PR-SC-01 surface, frozen).
- `src/lib/passport/**`, `src/lib/inventory/**` (PR-SC-03 surface, frozen).
- `src/app/seller/dashboard/**`, `src/app/seller/identity/**`, `src/app/seller/leads/**`, `src/app/admin/store/passport/**`, `src/app/showroom/**`, `src/app/seller/showroom/**` (other PRs' surfaces — DO NOT touch unless absorbing the intelligence-explain route from PR-SC-06 per §11.1).
- `prisma/schema.prisma` `AIGatewayLog` model beyond the virtual `suggestions AISuggestion[]` back-relation — do NOT add columns to `AIGatewayLog` (BLOCKER-AI-3 is resolved by the `AISuggestion` table, NOT by extending `AIGatewayLog`).

### 11.9 Dependencies

- **PR-SC-00 — COMPLETE** (mandatory — seller-scoped AI input; cross-seller negative test gate).
- **PR-SC-05 — COMPLETE** (mandatory — Reports page adopts the dashboard layout + sidebar; KPI baseline captured).
- **PR-SC-06 — COMPLETE** (mandatory — Lead Intelligence explanation is an AI feature; the `/api/seller/leads/[id]/intelligence-explain` route is refactored here to use `src/lib/ai-output-schemas.ts`).
- **PR-SC-01 — COMPLETE** (already merged — `ai.execute` permission context, AI Gateway task type `SELLER_ASSISTANT`).
- **NOT a dependency:** PR-SC-04, PR-SC-03, PR-SC-07, PR-SC-08 (Reports can ship without Passport/Showroom; Copilot suggestions are richer with them but not blocked).

### 11.10 Rollback

1. `git revert <PR-SC-09 merge SHA>`.
2. `DROP TABLE "AISuggestion";` (additive — no data loss; `AIGatewayLog` back-relation is virtual, no column to drop).
3. `bun run db:seed-rbac` to remove the 2 permission keys.
4. Old `/api/ai-sales-agent` + `/api/ai-seller-assistant` routes restored (R11 unfixed — they call ZAI directly again; acceptable, regression to pre-PR-SC-09 state).
5. `AIGatewayLog.tokensUsed` reverts to never-set (no-op — the column is nullable; existing rows keep their values).
6. **No rollback of PR-SC-06 needed** — the intelligence-explain route in PR-SC-06 used a minimal inline zod schema; reverting PR-SC-09 restores that inline schema (acceptable).

### 11.11 Definition of Done

- [ ] `bun run db:validate` passes.
- [ ] `bun run typecheck` + `bun run lint` pass.
- [ ] `bun run test` passes (existing + new).
- [ ] `tests/security/ai-cost-cap.test.ts` — single call ≤ `policy.costCeilingUsd` (default 0.05); 100 daily calls → 101st denied (429); monthly budget exhausted → all denied (429).
- [ ] `tests/ai-eval/seller-assistant-golden.test.ts` — 20+ golden inputs; each output passes the zod schema; confidence ≥0.7 OR suppressed; uncertainty clause present ("اطلاعات کافی نیست" when applicable); evidence cited; no fabrication; ≤5 suggestions.
- [ ] `tests/security/ai-leakage.test.ts` — `viewerPhone`, `viewerName`, `buyerPhone`, `buyerEmail`, `buyerName` not echoed in the LLM output; other-seller data not referenced (verified via input-capture + output-inspection fixtures).
- [ ] `tests/security/ai-no-function-calling.test.ts` — static assertion: `grep -r "tools\|function_call\|tool_choice" src/app/api/seller/assistant/ src/app/api/seller/leads/[id]/intelligence-explain/ src/lib/ai-input-filter.ts src/lib/ai-output-schemas.ts src/lib/ai/prompts/seller-assistant.ts` returns 0 matches in the ZAI call sites (the `/api/ai-gateway` route is exempt — it's the central gateway).
- [ ] `tests/integration/ai-suggestion-lifecycle.test.ts` — PENDING → ACCEPTED (audited); PENDING → REJECTED with reason (audited); PENDING → DISMISSED + `AdminPreference.hiddenItems` updated.
- [ ] `tests/security/tenant-isolation-assistant.test.ts` — Seller A's suggestions do not reference Seller B's data; Seller A cannot accept Seller B's suggestion (404).
- [ ] `tests/integration/reports-real-data.test.ts` — sentinel: no sample numbers; KPI-8 cost-per-task computed from real `AIGatewayLog.cost`; `lastAssistantRun` populated from the latest `AIGatewayLog` row.
- [ ] `tests/regression/old-ai-routes-deprecated.test.ts` — `/api/ai-sales-agent` + `/api/ai-seller-assistant` either route through `/api/ai-gateway` (verified by `AIGatewayLog` row created on call) OR return 410 Gone.
- [ ] `tests/a11y/reports-page.test.ts` — axe-core 0 violations.
- [ ] `tests/responsive/reports-page.test.ts` — 375/768/1280 breakpoints pass.
- [ ] Manual smoke: Seller sees 30-day reports with real KPIs; clicks "تحلیل با دستیار فروش" → 3+ suggestions returned; clicks accept on one → audit log visible; clicks dismiss on another → suggestion removed + `AdminPreference.hiddenItems` updated.
- [ ] Manual smoke: AI budget exhausted (mock `AIBudget.dailySpendUsd > dailyLimitUsd`) → click assistant → 429 with friendly message.
- [ ] Manual smoke: Verify NO PII in the LLM input (server log inspection or input-capture fixture): `viewerPhone`, `buyerPhone` stripped before LLM call.
- [ ] CI `verify` green on PR HEAD.
- [ ] Independent /Critic review: no BLOCKER findings; all 4 AI BLOCKERs (AI-1..AI-4) resolved; advisory-only enforced (no `db.*.create/update/delete` in AI path); R11 fixed (old routes refactored or deprecated).

### 11.12 Audit action keys

| Mutation | Audit action key | EntityType | EntityId |
|---|---|---|---|
| Run assistant (POST `/api/seller/assistant`) | `AIGatewayLog` row (`taskType: 'SELLER_ASSISTANT'`, `userId`, `cost`, `latencyMs`, `success`) — no AuditLog row (read-only + advisory; the only DB writes are `AIGatewayLog.create` by the Gateway + `AISuggestion.create` PENDING rows). | — | — |
| Accept suggestion (POST `/api/seller/assistant/suggestions/[id]/accept`) | `ai.suggestion.accept` | `AISuggestion` | `suggestion.id` |
| Reject suggestion (POST `/api/seller/assistant/suggestions/[id]/reject`) | `ai.suggestion.reject` | `AISuggestion` | `suggestion.id` |
| Dismiss suggestion (POST `/api/seller/assistant/dismiss`) | `ai.suggestion.dismiss` | `AdminPreference` | `preference.id` |

### 11.13 Acceptance test summary

1. Login as SELLER with 30d activity → `GET /api/seller/reports?range=30d` → assert real numbers (no fabrication); `lastAssistantRun` populated from the latest `AIGatewayLog` row.
2. Click "تحلیل با دستیار فروش" → assert POST fires, 3+ suggestions returned, each with `ctaHref` + `ctaLabel` + `severity` + `dismissible`.
3. Click accept on a suggestion → assert POST accept, suggestion status → ACCEPTED, `AuditLog` row `ai.suggestion.accept` written.
4. Click dismiss on a suggestion → assert POST dismiss, suggestion removed from DOM, `AdminPreference.hiddenItems` updated.
5. Reload → dismissed suggestions do NOT reappear.
6. Exhaust AI budget (mock `AIBudget.dailySpendUsd > dailyLimitUsd`) → click assistant → assert 429 with friendly message.
7. Verify NO PII in the LLM input (input-capture fixture): `viewerPhone`, `buyerPhone` stripped before LLM call.
8. Verify AI output schema validated (zod) — malformed LLM output → fallback suggestions returned (3 generic tips).
9. Verify no `tools`/`function_call`/`tool_choice` in any ZAI call (static test).
10. Mobile 375px: single-column, charts readable, all touch targets ≥ 44px.

---

## 12. Aggregate Summary

### 12.1 PRs specified

| PR | Stage | Type | Schema change | New permission keys | New files | Dependencies |
|---|---|---|---|---|---|---|
| PR-SC-04 | 2 | UI + API + additive schema | `Company.brandColor`, `Company.storeDescription` (2 cols) | `store.profile.read`, `store.profile.manage` | 12 | PR-SC-00 COMPLETE |
| PR-SC-05 | 2 | UI + API + layout | NONE | NONE | 9 | PR-SC-00 + PR-SC-01 COMPLETE |
| PR-SC-06 | 3 | UI + API | NONE | NONE | 14 | PR-SC-00 + PR-SC-01 COMPLETE |
| PR-SC-03 | 3 | Schema + algorithm + backfill | `MachinePassport` +10 cols; `Listing` +4 cols; 4 User back-relations; 2 indexes | NONE | 10 | PR-SC-00 COMPLETE |
| PR-SC-07 | 4 | UI + API | NONE | `passport.read`, `passport.manage` | 13 | PR-SC-03 + PR-SC-00 COMPLETE |
| PR-SC-08 | 5 | UI + API + additive schema | `Showroom` (new table); `SalesTeamMember` (new table); `Company` back-relations (virtual) | `showroom.read`, `showroom.manage`, `showroom.admin` | 21 | PR-SC-00 + PR-SC-04 (soft) + PR-SC-03 (soft) COMPLETE |
| PR-SC-09 | 6 | UI + API + additive schema + AI gateway integration + R11 refactor | `AISuggestion` (new table); `AIGatewayLog.suggestions` back-relation (virtual) | `store.reports.read`, `store.analytics.read` | 26 | PR-SC-00 + PR-SC-05 + PR-SC-06 + PR-SC-01 COMPLETE |

**Total: 7 PRs specified.**

### 12.2 API contracts specified

| PR | Routes | Total |
|---|---|---|
| PR-SC-04 | `GET /api/seller/identity`, `PATCH /api/seller/identity` | 2 |
| PR-SC-05 | `GET /api/seller/dashboard` | 1 |
| PR-SC-06 | `GET /api/seller/leads`, `PATCH /api/seller/leads/[id]`, `POST /api/seller/leads/[id]/intelligence-explain` | 3 |
| PR-SC-03 | (schema + algorithm + backfill — NO API) | 0 |
| PR-SC-07 | `GET /api/seller/passport/[listingId]`, `POST /api/seller/passport/[listingId]` (create blank), `PATCH /api/seller/passport/[listingId]`, `POST /api/seller/passport/[listingId]/request-inspection` | 4 |
| PR-SC-08 | `GET /showroom/[slug]` (public page), `GET /api/showroom/[slug]` (public JSON), `GET /api/seller/showroom`, `POST /api/seller/showroom` (create), `PATCH /api/seller/showroom`, `POST /api/seller/showroom/feature`, `DELETE /api/seller/showroom/feature/[listingId]` | 7 |
| PR-SC-09 | `GET /api/seller/reports`, `POST /api/seller/assistant`, `POST /api/seller/assistant/suggestions/[id]/accept`, `POST /api/seller/assistant/suggestions/[id]/reject`, `POST /api/seller/assistant/dismiss` | 5 |

**Total: 22 API contracts specified** (excluding the public showroom page which is a server component, not a JSON API; counting it separately gives 23 surfaces).

### 12.3 Schema fields genuinely new (per ADR-005-amendment-01 corrections)

| PR | Model | New fields | Count | Source citation |
|---|---|---|---|---|
| PR-SC-04 | `Company` | `brandColor String?`, `storeDescription String?` | 2 | ADR-005-amendment-01 §1 |
| PR-SC-05 | (none) | — | 0 | — |
| PR-SC-06 | (none) | — | 0 | — |
| PR-SC-03 | `MachinePassport` | `specsVerifiedAt`, `specsVerifiedBy`, `ownershipVerifiedAt`, `ownershipVerifiedBy`, `inspectionVerifiedAt`, `inspectionVerifiedBy`, `serviceHistoryVerifiedAt`, `serviceHistoryVerifiedBy`, `passportScore`, `passportScoreVersion` | 10 | ADR-005-amendment-01 §6 (B2 critic finding — all 8 verification fields genuinely new); passportScore/Version genuinely new |
| PR-SC-03 | `Listing` | `inventoryScore`, `inventoryScoreVersion`, `inventoryScoredAt`, `inventoryScoreBreakdown` | 4 | ADR-005-amendment-01 §5 (relocated from Part to Listing); all 4 genuinely new |
| PR-SC-07 | (none) | — | 0 | — |
| PR-SC-08 | `Showroom` (new table) | `id, companyId, isActive, template, layout, featuredListingIds, viewCount, createdAt, updatedAt` | 9 (model fields) | ADR-005 §2; per ADR-005-amendment-01 §2 NO migration to PremiumSubscription |
| PR-SC-08 | `SalesTeamMember` (new table) | `id, companyId, userId, name, role, phone, email, photoUrl, isActive, createdAt, updatedAt` | 11 (model fields) | ADR-005 §4 |
| PR-SC-09 | `AISuggestion` (new table) | `id, gatewayLogId, suggestionType, suggestionJson, status, rejectedReason, acceptedAt, acceptedBy, createdAt, updatedAt` | 10 (model fields) | AI-PRODUCT-FOUNDATION.md §3.4 Option B |

**Total genuinely-new schema fields: 2 (PR-SC-04) + 14 (PR-SC-03: 10 MachinePassport + 4 Listing) + 9 (PR-SC-08 Showroom) + 11 (PR-SC-08 SalesTeamMember) + 10 (PR-SC-09 AISuggestion) = 46 new fields across 4 PRs (3 new tables + 2 extended models).**

**Schema fields NOT added (rejected because they already exist or overlap with existing):**
- `Company.logoUrl` (exists at `schema.prisma:1216`)
- `Company.bannerUrl` (overlaps `coverImage` at `schema.prisma:1217`)
- `Company.storeSlug` (overlaps `slug @unique` at `schema.prisma:1212`)
- `Company.metaTitle` / `metaDescription` (exist at `schema.prisma:1224-1225`)
- `MachinePassport.source` (ADR-005 §6 false claim — covered by `PassportEvent.eventType`)
- `MachinePassport.verification` (ADR-005 §6 false claim — covered by 8 per-section `*VerifiedAt/By`)
- `Part.inventoryScore` (relocated to Listing per ADR-005-amendment-01 §5)
- `Part.partNumber` / `oemNumber` / `documents` / `specifications` (R7 — algorithm reduced to existing fields)
- `PremiumSubscription.companyId` (per ADR-005-amendment-01 §2 — MVP uses `companyHasActivePremium` helper, NO migration)
- `Showroom.bannerUrl` / `logoUrl` / `slug` (reuse `Company.coverImage` / `logoUrl` / `slug`)

### 12.4 New permission keys

| PR | Keys | Total |
|---|---|---|
| PR-SC-04 | `store.profile.read`, `store.profile.manage` | 2 |
| PR-SC-05 | (none) | 0 |
| PR-SC-06 | (none — uses `store.crm.read`/`manage` from PR-SC-01) | 0 |
| PR-SC-03 | (none) | 0 |
| PR-SC-07 | `passport.read`, `passport.manage` | 2 |
| PR-SC-08 | `showroom.read`, `showroom.manage`, `showroom.admin` | 3 |
| PR-SC-09 | `store.reports.read`, `store.analytics.read` | 2 |

**Total: 9 new permission keys** across 4 PRs (PR-SC-04, PR-SC-07, PR-SC-08, PR-SC-09). Combined with PR-SC-01's 2 keys (`store.crm.read`, `store.crm.manage` — already merged), the 11 keys mandated by ADR-005 §7 are complete. Verified count: `store.profile.{read,manage} + showroom.{read,manage,admin} + passport.{read,manage} + store.crm.{read,manage} + store.reports.read + store.analytics.read = 11`. ✓

### 12.5 Mandatory cross-seller negative tests (per-PR merge gate)

| PR | Test file | Asserts |
|---|---|---|
| PR-SC-04 | `tests/security/tenant-isolation-identity.test.ts` | Seller A cannot GET/PATCH Seller B's Company |
| PR-SC-05 | `tests/security/tenant-isolation-dashboard.test.ts` | Seller A cannot see Seller B's KPIs |
| PR-SC-06 | `tests/security/tenant-isolation-leads.test.ts` | Seller A cannot list/patch/explain Seller B's leads (**deferred dynamic test from PR-SC-01**) |
| PR-SC-03 | (none — schema-only) | — |
| PR-SC-07 | `tests/security/tenant-isolation-passport.test.ts` | Seller A cannot GET/PATCH/POST-inspection Seller B's passport |
| PR-SC-08 | `tests/security/tenant-isolation-showroom.test.ts` | Seller A cannot PATCH/feature Seller B's showroom; public inactive → 404 (no leak) |
| PR-SC-09 | `tests/security/tenant-isolation-assistant.test.ts` | Seller A's AI input does not reference Seller B's data; Seller A cannot accept Seller B's suggestion |

**Total: 6 mandatory cross-seller negative tests** (PR-SC-03 is schema-only, no test).

### 12.6 main DB vs store DB boundary per PR

| PR | Main DB | Store DB | Cross-DB transaction? |
|---|---|---|---|
| PR-SC-04 | `db.company.*` | — | No |
| PR-SC-05 | `db.listing.*`, `db.lead.*`, `db.listingOffer.*`, `db.deal.*` | `storeDb.inventoryBalance.*`, `storeDb.order.*` (ADMIN-only, best-effort) | No — `Promise.all` of parallel branches; store DB failure → `storeDbReachable: false` |
| PR-SC-06 | `db.lead.*`, `db.listingOffer.*` | — | No |
| PR-SC-03 | `db.machinePassport.*`, `db.listing.*` | — | No |
| PR-SC-07 | `db.machinePassport.*`, `db.passportEvent.*`, `db.inspection.*`, `db.listingImage.*` | — | No |
| PR-SC-08 | `db.showroom.*`, `db.salesTeamMember.*`, `db.company.*`, `db.listing.*`, `db.premiumSubscription.*` | — | No |
| PR-SC-09 | `db.aISuggestion.*`, `db.aIGatewayLog.*`, `db.deal.*`, `db.lead.*`, `db.listing.*`, `db.adminPreference.*` | `storeDb.inventoryBalance.*`, `storeDb.stockMovement.*` (best-effort) | No — `Promise.all` of parallel branches |

**No PR requires a cross-DB transaction.** All mutations are MAIN DB only. Store DB queries are read-only and best-effort.

### 12.7 Rollback summary

| PR | Rollback procedure | Data loss? |
|---|---|---|
| PR-SC-04 | `git revert` + `ALTER TABLE "Company" DROP COLUMN "brandColor", "storeDescription"` | No (additive nullable) |
| PR-SC-05 | `git revert` | No (no schema change) |
| PR-SC-06 | `git revert` | No (no schema change; Lead columns from PR-SC-01 remain) |
| PR-SC-03 | `git revert` + `ALTER TABLE "MachinePassport" DROP COLUMN ... (10 cols)` + `ALTER TABLE "Listing" DROP COLUMN ... (4 cols)` + `DROP INDEX` | No (additive nullable; scores recomputable) |
| PR-SC-07 | `git revert` | No (no schema change; verification fields from PR-SC-03 remain) |
| PR-SC-08 | `git revert` + `DROP TABLE "Showroom", "SalesTeamMember"` | No (additive new tables) |
| PR-SC-09 | `git revert` + `DROP TABLE "AISuggestion"` | No (additive new table; `AIGatewayLog.tokensUsed` reverts to never-set) |

**All 7 PRs are independently revertible. Rollback = `git revert` + at most 1-2 `DROP` SQL statements. No data loss.**

### 12.8 Critical-path dependency graph

```
PR-SC-00 (tenant-scoping, COMPLETE-pending-merge) — GATE for all seller-scoped UI
   │
   ├── PR-SC-04 (Store Identity) ──┐
   │                               ├── PR-SC-08 (VIP Showroom, soft dep on 04)
   ├── PR-SC-05 (Dashboard) ──────┤
   │                               ├── PR-SC-09 (AI Business Layer, hard dep on 05+06)
   ├── PR-SC-06 (CRM API/UI) ─────┘
   │
   ├── PR-SC-03 (Machine Passport schema + algorithm + backfill)
   │       │
   │       └── PR-SC-07 (Machine Passport UI)
   │               │
   │               └── PR-SC-08 (soft dep — showroom "verified machine" badge)
   │
   └── PR-SC-01 (Lead CRM Foundation, ALREADY MERGED at c66e060) — prerequisite for PR-SC-05 + PR-SC-06
```

**Critical path:** PR-SC-00 → PR-SC-05 → PR-SC-06 → PR-SC-09 (longest chain to AI Business Layer).
**Parallel branches:** PR-SC-04 (off PR-SC-00); PR-SC-03 → PR-SC-07 (off PR-SC-00); PR-SC-08 (off PR-SC-00 + soft PR-SC-04 + soft PR-SC-03).

---

## 13. Open Questions for Owner

1. **PR-SC-00 merge gate:** confirm that PR-SC-00 (HEAD `4a2f579` on branch `security/pr-sc-00-tenant-scoping`) can be merged to `main` once `tests/integration/tenant-scope-real.ts` passes in a PG environment. Without this, PR-SC-04 onward cannot merge.
2. **PR-SC-08 self-contained vs split:** this spec makes PR-SC-08 self-contained (schema + UI + API + enforcement in one PR). The roadmap originally split PR-SC-02 (schema) + PR-SC-08 (UI). Confirm self-contained is acceptable (the task brief's 7-PR list excludes PR-SC-02, implying self-contained).
3. **PR-SC-06 intelligence-explain route ownership:** this spec places the route in PR-SC-06 (minimal inline zod schema) with refactor in PR-SC-09. Confirm this is acceptable vs. deferring the route entirely to PR-SC-09.
4. **PR-SC-09 R11 deprecation strategy:** 2-step deprecation (mark `@deprecated` + route through Gateway in PR-SC-09; return 410 Gone in a future PR). Confirm 2-step is preferred over immediate 410 (which would break any existing consumers of `/api/ai-sales-agent`).
5. **`AISuggestion.gatewayLogId` relation:** this spec adds `AISuggestion.gatewayLogId` as a plain FK + a virtual `AIGatewayLog.suggestions AISuggestion[]` back-relation (additive, no `AIGatewayLog` column change). Confirm this is preferred over extending `AIGatewayLog` with new columns (BLOCKER-AI-3 Option B vs Option A).
6. **Seller `ai.execute` permission:** this PR-SC-09 spec adds `ai.execute` to `ROLE_PERMISSIONS.SELLER` (currently MISSING per `permissions.ts:248-271`). Confirm SELLERs should have `ai.execute` (the AI Gateway `AITaskPolicy.allowedRoles` is the finer-grained control; `ai.execute` is the coarse gate).
7. **Public showroom view-count increment:** this spec increments `showroom.viewCount` on every public render (acceptable write load for MVP). Confirm vs. debounced/Redis-counter approach (TBD infra).
8. **Time-bounded views (R10):** MVP shows lifetime views with explicit label "بازدید کل (از ابتدا)". Confirm vs. instrumenting `AnalyticsEvent` for `LISTING_VIEW` first (delays PR-SC-05 + PR-SC-09).

---

**End of document.** This spec is implementation-ready: each PR section maps 1:1 to a GitHub issue / PR description; each API contract maps 1:1 to a route handler; each acceptance test maps 1:1 to a Playwright/vitest spec; each migration maps 1:1 to a `prisma/migrations/<timestamp>_*/migration.sql` file. **No code, schema, or PR was modified by this task.** All grounding facts are cited with file:line in §3. All blockers from prior reviews (B1/B2/H1/H2/H3/A4/A5/AI-1..AI-4/R11) are reflected in the per-PR scope (IN/OUT) + dependencies + DoD.
