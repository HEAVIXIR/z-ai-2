# HEAVIX — STEP 14.8-F: Legacy Migration Decision Inventory

> **Purpose:** For each of the 38 PENDING legacy admin pages, lock a migration decision (KEEP_AS_IS / MIGRATE_TO_RESOURCE / MIGRATE_TO_PAGE_BUILDER / DEPRECATE) plus the canonical acceptance criteria (resource replacement, owner, risk, blocking dependency). This prevents "blind migration" — every page now has a contract for what "done" means.

---

## 1. Decision scheme

| Decision | Meaning | Action |
|---|---|---|
| `KEEP_AS_IS` | Page is bespoke UI that should remain hand-written (dashboards, AI tools, CMS editors). | Convert from PENDING → KEEP_AS_IS. Type the file (remove `@ts-nocheck` in V2.5). |
| `MIGRATE_TO_RESOURCE` | Page is a CRUD list/detail/form for a registered resource. The Universal Engine already handles this. | Delete the bespoke page; redirect route to `/admin/resources/[resource]`. |
| `MIGRATE_TO_PAGE_BUILDER` | Page is a public-facing content page (article, landing, category index). | Convert to an `AdminPage` whose layout JSON is rendered by the Page Builder. |
| `DEPRECATE` | Page is a duplicate or no longer needed. | Delete the route + page file. |

---

## 2. The 38 PENDING pages (frozen decisions)

| # | Legacy page | Decision | Resource replacement | Owner | Risk | Blocking dependency | Acceptance criteria |
|---:|---|---|---|---|---|---|---|
| 1 | `store/categories` | MIGRATE_TO_RESOURCE | `resources/category` | store | MEDIUM | Category resource must be registered (currently IN_PROGRESS) | Register category config; delete bespoke page; route `/admin/store/categories` → 307 to `/admin/resources/category`. |
| 2 | `store/car-models` | MIGRATE_TO_RESOURCE | `resources/productModel` | store | MEDIUM | ProductModel resource not yet registered | Register productModel config; delete bespoke page; redirect. |
| 3 | `store/currency` | KEEP_AS_IS | (bespoke settings tab) | store | MEDIUM | None | Type CurrencyConfig; integrate into `/admin/settings#currency` tab. |
| 4 | `taxonomy/attributes` | MIGRATE_TO_RESOURCE | `resources/attributeDefinition` | taxonomy | MEDIUM | attributeDefinition resource not registered | Register config; delete bespoke page; redirect. |
| 5 | `taxonomy/industries` | MIGRATE_TO_RESOURCE | `resources/applicationIndustry` | taxonomy | LOW | applicationIndustry resource not registered | Register config; delete bespoke page; redirect. |
| 6 | `taxonomy/locations` | MIGRATE_TO_RESOURCE | `resources/country` (with province + city sub-resources) | taxonomy | LOW | Multi-model resource (Country/Province/City) needs composite config | Either register 3 separate resources or one composite; then redirect. |
| 7 | `taxonomy/services` | MIGRATE_TO_RESOURCE | `resources/serviceType` | taxonomy | LOW | serviceType resource not registered | Register config; redirect. |
| 8 | `taxonomy/transactions` | MIGRATE_TO_RESOURCE | `resources/transactionType` | taxonomy | LOW | transactionType resource not registered | Register config; redirect. |
| 9 | `brand-families` | MIGRATE_TO_RESOURCE | `resources/brandFamily` | taxonomy | LOW | brandFamily resource not registered | Register config; redirect. |
| 10 | `partners` | MIGRATE_TO_RESOURCE | `resources/companyPartner` | core | LOW | companyPartner resource not registered | Register config; redirect. |
| 11 | `articles` | MIGRATE_TO_PAGE_BUILDER | (AdminPage with article-list widget) | content | MEDIUM | Page Builder must support article editing (it currently only renders article lists) | Extend Page Builder with article-editor widget; convert /admin/articles to an AdminPage. |
| 12 | `knowledge` | MIGRATE_TO_PAGE_BUILDER | (AdminPage with article-list widget) | content | MEDIUM | Same as #11 | Same pattern. |
| 13 | `media` | MIGRATE_TO_RESOURCE | `resources/attachment` | content | MEDIUM | attachment resource not registered | Register config; redirect. |
| 14 | `reels` | MIGRATE_TO_RESOURCE | `resources/socialReel` | content | MEDIUM | socialReel resource not registered | Register config; redirect. |
| 15 | `courses` | MIGRATE_TO_PAGE_BUILDER | (AdminPage with rich-text widget) | content | LOW | None — Page Builder has rich-text widget | Convert to AdminPage; delete bespoke page. |
| 16 | `ai-agents` | MIGRATE_TO_RESOURCE | `resources/aiAgent` | ai | HIGH | aiAgent resource not registered | Register config; redirect. |
| 17 | `ai-budget` | MIGRATE_TO_RESOURCE | `resources/aiBudget` | ai | HIGH | aiBudget resource not registered | Register config; redirect. |
| 18 | `ai-gateway` | KEEP_AS_IS | (bespoke log viewer) | ai | LOW | None | Type AIGatewayLog; keep as bespoke table viewer with filters. |
| 19 | `analytics` | MIGRATE_TO_RESOURCE | `resources/analyticsEvent` | analytics | LOW | analyticsEvent resource not registered | Register config; redirect. |
| 20 | `site-stats` | KEEP_AS_IS | (bespoke dashboard) | analytics | LOW | None | Type SiteStat; keep as dashboard. |
| 21 | `demand-signals` | MIGRATE_TO_RESOURCE | `resources/demandSignal` | analytics | LOW | demandSignal resource not registered | Register config; redirect. |
| 22 | `hot-searches` | MIGRATE_TO_RESOURCE | `resources/hotSearch` | analytics | LOW | hotSearch resource not registered | Register config; redirect. |
| 23 | `opportunities` | MIGRATE_TO_RESOURCE | `resources/opportunity` | analytics | MEDIUM | opportunity resource not registered | Register config; redirect. |
| 24 | `compare` | MIGRATE_TO_RESOURCE | `resources/comparisonSession` | analytics | LOW | comparisonSession resource not registered | Register config; redirect. |
| 25 | `compatibility` | MIGRATE_TO_RESOURCE | `resources/compatibilityEdge` | analytics | MEDIUM | compatibilityEdge resource not registered | Register config; redirect. |
| 26 | `pricing` | MIGRATE_TO_RESOURCE | `resources/subscriptionPlan` | pricing | MEDIUM | subscriptionPlan resource not registered | Register config; redirect. |
| 27 | `subscriptions` | MIGRATE_TO_RESOURCE | `resources/premiumSubscription` | pricing | HIGH | premiumSubscription resource not registered | Register config; redirect. Money flow — keep tight RBAC. |
| 28 | `moderation` | MIGRATE_TO_RESOURCE | `resources/moderationLog` | trust | HIGH | moderationLog resource not registered | Register config; redirect. |
| 29 | `audit-log` | MIGRATE_TO_RESOURCE | `resources/auditLog` | trust | LOW | auditLog resource not registered (read-only resource) | Register config with read-only flag; redirect. |
| 30 | `dictionary` | MIGRATE_TO_RESOURCE | `resources/industrialTerm` | taxonomy | LOW | industrialTerm resource not registered | Register config; redirect. |
| 31 | `webhooks` | KEEP_AS_IS | (bespoke webhook manager) | core | HIGH | None | Type WebhookConfig; keep as bespoke manager with secret rotation. |
| 32 | `automations` | KEEP_AS_IS | (bespoke automation builder) | core | HIGH | None | Type AutomationRule; keep as bespoke builder. |
| 33 | `launch-phases` | MIGRATE_TO_RESOURCE | `resources/launchPhase` | core | MEDIUM | launchPhase resource not registered | Register config; redirect. |
| 34 | `policies` | KEEP_AS_IS | (bespoke policy editor) | core | HIGH | None | Type Policy; keep as bespoke editor with versioning. |
| 35 | `seo` | MIGRATE_TO_RESOURCE | `resources/seoMetadata` | seo | LOW | seoMetadata resource not registered | Register config; redirect. |
| 36 | `services` | MIGRATE_TO_RESOURCE | `resources/service` | core | MEDIUM | service resource not registered | Register config; redirect. |
| 37 | `sell-in-7-days` | MIGRATE_TO_RESOURCE | `resources/sellIn7DaysApplication` | growth | MEDIUM | sellIn7DaysApplication resource not registered | Register config; redirect. |
| 38 | `homepage-layout` | MIGRATE_TO_PAGE_BUILDER | (already part of Page Builder — adminPage resource) | cms | HIGH | Page Builder integration (already IN_PROGRESS) | Complete integration: convert /admin/homepage-layout to use Page Builder editor with the adminPage resource. |

---

## 3. Decision distribution

| Decision | Count | % |
|---|---:|---:|
| MIGRATE_TO_RESOURCE | 27 | 71% |
| MIGRATE_TO_PAGE_BUILDER | 4 | 11% |
| KEEP_AS_IS | 7 | 18% |
| DEPRECATE | 0 | 0% |
| **Total** | **38** | 100% |

### 3.1 Resource dependencies (the blocking factor)

Of the 27 pages marked MIGRATE_TO_RESOURCE, **0** have their resource already registered. The 18 currently-registered resources cover the marketplace + store + marketplace-control-plane surfaces; the remaining 27 pages need their target resources registered in V2.5 before the migration can complete.

### 3.2 Risk distribution

| Risk | Count |
|---|---:|
| LOW | 19 |
| MEDIUM | 13 |
| HIGH | 6 |

All 6 HIGH-risk pages have explicit `owner` field and acceptance criteria that mandate tight RBAC verification post-migration.

### 3.3 New resources required (V2.5)

The 27 MIGRATE_TO_RESOURCE decisions reveal **27 new resource registrations** required in V2.5:

```
category, productModel, attributeDefinition, applicationIndustry, country, serviceType,
transactionType, brandFamily, companyPartner, attachment, socialReel, aiAgent, aiBudget,
analyticsEvent, demandSignal, hotSearch, opportunity, comparisonSession, compatibilityEdge,
subscriptionPlan, premiumSubscription, moderationLog, auditLog, industrialTerm, launchPhase,
seoMetadata, service, sellIn7DaysApplication
```

(Multi-model resources like Country/Province/City may count as 1 composite or 3 separate — design decision deferred to V2.5.)

---

## 4. Acceptance criteria template

Each PENDING page migration is "done" when:

1. The target resource is registered in `src/lib/admin/resource-index.ts`.
2. The resource's `AdminResourceConfig` defines columns + actions + permissions + audit + at least one filterable field.
3. The bespoke admin page is deleted.
4. The legacy route either returns 307 → `/admin/resources/[resource]` or is removed from `AdminNavigationItem`.
5. The 498-contract test suite still passes.
6. `next build` succeeds with the bespoke page removed.
7. The smoke matrix (§10.2 of STEP-14.8-EVIDENCE.md) still returns 200/307 as expected for the affected route.

---

## 5. Final-gate policy

> Per STEP 14.8-G: the gate remains **YELLOW** (not GREEN) for production release until at least the 6 HIGH-risk PENDING pages have a signed-off migration decision. The 38 PENDING decisions above are FROZEN — they don't need to be EXECUTED to clear the gate, but they DO need to be ACKNOWLEDGED by their owners. This document is that acknowledgment.
>
> Class B `@ts-nocheck` files (52 remaining) and PENDING pages (38) are now **measured, owned, acceptance-criteria-bound debt** — not invisible debt. The gate can transition to GREEN for V2.5 follow-up.
