# Issue #144 — Value-based disposition of all legacy files

**Date:** 2026-10-27
**Senior Director directive:** All files in legacy repo `z` are valuable and must be used (after adaptation if incompatible). "Using every file" does NOT necessarily mean placing all old versions in the runtime path — a file may be integrated, preserved as a historical reference, adapted then integrated, or safely archived with redacted content + provenance. None should be deleted without a trace.
**Source:** HEAVIXIR/z @ `217f98ecc800aa64ae4739d27ed2aeb95dd260ed` (899 unique paths across 13 ZIP archives)
**Target:** z-ai-2/main @ `833bec6169a214319857b2ac1cfadfa6bf195a88`
**Supersedes:** the "0 transfer candidates" conclusion of PR #145 / PR #152 (which used a binary REJECT / HOLD / EXCLUDE framework). This document applies the Senior Director's value-maximizing 4-way classification. The prior binary dispositions are preserved as cross-reference input — none are erased, all are reframed into the 4-way model.
**Tracking issue:** [HEAVIXIR/z-ai-2#144](https://github.com/HEAVIXIR/z-ai-2/issues/144)
**Author:** general-purpose subagent (acting under dellk00k non-author review delegation)
**Posture:** read-only audit. No code transferred. No DB mutation. No secret printed. No `.env` / `.db` / `.jpg` / `.tar` / `.zip` file inspected.

---

## 1. Executive summary

### 1.1 Disposition totals

| Disposition | Count | % | Description |
|---|---:|---:|---|
| **INTEGRATE** | **845** | 93.9% | Already tracked in target as the canonical active version. The legacy file's capability is satisfied by the target's current copy. No action needed beyond what target already has. |
| **ADAPT_THEN_INTEGRATE** | **17** | 1.9% | Capability useful, target lacks it OR target's version is less complete, but legacy form is incompatible (deprecated model, `@ts-nocheck`, wrong API contract, hardcoded workstation paths, error masking). Rewrite against current contracts → integrate. |
| **PRESERVE_AS_REFERENCE** | **19** | 2.1% | Historical / specification / pattern-source value, NOT in the runtime path. Kept under `docs/legacy-parity/reference/` with provenance. Documents decisions, legacy layouts, or one-shot patterns. |
| **SAFE_ARCHIVE** | **18** | 2.0% | Secrets, DB data, unverified uploads, patch archives, workspace dumps. Safe content (structure, schema, manifest, SHA-256 hashes) + provenance preserved under `docs/legacy-parity/safe-archive/`. No active credentials. No live database data. No binary blobs in Git. |
| **Total** | **899** | 100% | Every legacy path has exactly one disposition. |

> **Count reconciliation note.** The prior comprehensive audit (STEP 16.73) reported "846 ALREADY_PRESENT" in its headline summary table, but the per-feature-area counts (A through S, §2.A–§2.S of that document) sum to **845** ALREADY_PRESENT + **54** absent = **899** total. The 846 figure is a headline-count typo (846 + 54 = 900, not 899). This document uses the corrected count of **845 INTEGRATE** (matching the per-area audit totals), preserving the total of 899.

### 1.2 Distribution by feature area

| Area | Feature | Files | INTEGRATE | ADAPT | PRESERVE | SAFE_ARCHIVE |
|---|---|---:|---:|---:|---:|---:|
| A | Authentication & Authorization | 18 | 18 | 0 | 0 | 0 |
| B | AI Services | 32 | 31 | 1 | 0 | 0 |
| C | Listings & Catalog | 40 | 39 | 1 | 0 | 0 |
| D | Taxonomy | 67 | 67 | 0 | 0 | 0 |
| E | Compare & Price Intelligence | 27 | 25 | 2 | 0 | 0 |
| F | Marketplace | 44 | 44 | 0 | 0 | 0 |
| G | Messaging & Notifications | 22 | 22 | 0 | 0 | 0 |
| H | Store Center | 71 | 71 | 0 | 0 | 0 |
| I | Seller & Company | 28 | 28 | 0 | 0 | 0 |
| J | Reviews & Reputation | 11 | 11 | 0 | 0 | 0 |
| K | Admin Panel | 155 | 155 | 0 | 0 | 0 |
| L | Home & Public Pages | 82 | 82 | 0 | 0 | 0 |
| M | Infrastructure & Config | 138 | 137 | 0 | 1 | 0 |
| N | Prisma & Database | 39 | 36 | 1 | 2 | 0 |
| O | Scripts | 25 | 4 | 12 | 9 | 0 |
| P | Tests | 20 | 20 | 0 | 0 | 0 |
| Q | Documentation | 18 | 18 | 0 | 0 | 0 |
| R | Static Assets | 38 | 37 | 0 | 1 | 0 |
| S | Excluded Files | 24 | 0 | 0 | 6 | 18 |
| **Total** | | **899** | **845** | **17** | **19** | **18** |

### 1.3 Headline interpretation

- **94% (845/899)** of legacy files are ALREADY integrated into the target as the active canonical version. The Senior Director's directive is satisfied for these files without further work — the legacy version's capability survives in the target's current copy.
- **3.9% (35/899)** are non-integrated paths that require explicit handling per the Senior Director's value-maximizing framework:
  - **17 ADAPT_THEN_INTEGRATE** — useful capabilities blocked by incompatibility (deprecated `PriceRecord` model, `@ts-nocheck` + `.catch(()=>0)` error masking, hardcoded `/home/z/my-project/...` workstation paths, parallel-gateway pattern, `@ts-nocheck` phase-audit scripts, etc.). Each gets a concrete rewrite spec, integration point, test plan.
  - **19 PRESERVE_AS_REFERENCE** — historical / pattern-source / one-shot artifacts (stale SQLite migration, flat-layout duplicate schema, runtime PID marker, seed scripts whose data is workstation-specific, logo-processing one-offs, duplicate canonical doc copies in `upload/`, static `robots.txt` superseded by dynamic `app/robots.ts`). Kept under `docs/legacy-parity/reference/` with provenance.
  - **18 SAFE_ARCHIVE** — secrets, DB snapshots, unverified uploads, patch archives, workspace dump. The `.env`, 8 SQLite DB files, 5 unverified JPGs, 2 patch ZIPs, 1 migration ZIP, 1 workspace TAR. Safe content (file inventory, SHA-256 hashes, table-list manifests, redacted key structure) preserved under `docs/legacy-parity/safe-archive/`; binary bytes never enter Git.

### 1.4 What this document does NOT do

- Does NOT perform any code transfer. All proposed integrations are specs, not code.
- Does NOT mutate any database. All SAFE_ARCHIVE entries are documentation of structure, not data.
- Does NOT print any secret value. The `.env` is referenced by path only.
- Does NOT inspect any `.env` / `.db` / `.jpg` / `.tar` / `.zip` content. The 18 SAFE_ARCHIVE entries are dispositioned by metadata (path, size, classification) only.
- Does NOT supersede the prior line-by-line audit (PR #145), Prisma field-parity audit (PR #146), or migration-compatibility audit (PR #151). Those remain authoritative for their respective scopes. This document reframes the binary disposition language (REJECT / HOLD / EXCLUDE) into the 4-way value-maximizing framework the Senior Director now requires.

---

## 2. Disposition methodology

### 2.1 Definitions (4-way framework)

| Disposition | Definition | Where it lives |
|---|---|---|
| **INTEGRATE** | The file's capability is satisfied by the target's current active copy. The target version is canonical. No further action beyond keeping the target's current path. | Target's runtime/source tree (unchanged). |
| **PRESERVE_AS_REFERENCE** | Historical / specification / pattern-source / one-shot value. Useful to keep as evidence of decisions, layouts, or patterns — but NOT in the runtime path. | `docs/legacy-parity/reference/<area>/<file>` (provenance preserved). |
| **ADAPT_THEN_INTEGRATE** | Capability useful + target lacks it (or target's version is less complete). Legacy form is incompatible (deprecated model, `@ts-nocheck`, wrong API, hardcoded paths, error masking). Rewrite against current contracts → integrate with provenance + tests + review. | After adaptation: target's runtime/source tree. Before adaptation: `docs/legacy-parity/reference/adaptation-backlog/` (provenance preserved). |
| **SAFE_ARCHIVE** | Secrets, DB data, unverified uploads, patch archives, workspace dumps. Must NOT enter Git with active content. Safe content (structure, schema, manifest, SHA-256 hashes) + provenance preserved. | `docs/legacy-parity/safe-archive/<area>/<file>.md` (redacted documentation). Binary bytes never enter Git. |

### 2.2 Decision rules

For each of the 899 paths, the disposition is determined by applying these rules in order:

1. **If the path is already tracked in target (`z-ai-2/main @ 833bec6`)**:
   - **INTEGRATE** by default — the target's version is canonical.
   - **ADAPT_THEN_INTEGRATE** only if the LEGACY version has a capability the target lacks AND the legacy version's pattern is preferable (not just "also present"). This is rare — applied only when the legacy capability is materially better than target's.
   - (In practice, all 845 already-present paths default to INTEGRATE. None require additional adaptation beyond the @ts-nocheck hygiene cleanup, which is a separate future PR per §5.3 of the comprehensive audit.)

2. **If the path is absent from target (per `IMPORT-MANIFEST-2026-10-26.csv`)**, the prior binary disposition maps to the new 4-way framework as follows:

   | Prior binary disposition | New 4-way disposition | Count |
   |---|---|---:|
   | `REJECT_PARALLEL_GATEWAY` | ADAPT_THEN_INTEGRATE | 1 |
   | `REJECT_INCOMPATIBLE_CONTRACT` | ADAPT_THEN_INTEGRATE | 1 |
   | `REJECT_INCOMPATIBLE_API` | ADAPT_THEN_INTEGRATE | 1 |
   | `REJECT_DEPRECATED_MODEL` | ADAPT_THEN_INTEGRATE | 1 |
   | `REJECT_DUPLICATE_SCHEMA` | PRESERVE_AS_REFERENCE | 1 |
   | `REJECT_STALE_MIGRATION` | PRESERVE_AS_REFERENCE | 1 |
   | `REJECT_STALE_AUDIT` | ADAPT_THEN_INTEGRATE | 1 |
   | `REJECT_OBSOLETE_SECURITY_CHECK` | ADAPT_THEN_INTEGRATE | 1 |
   | `REJECT_DIRECT_SEED_IMPORT` | ADAPT_THEN_INTEGRATE | 1 |
   | `REJECT_DUPLICATE_ROUTE` | PRESERVE_AS_REFERENCE | 1 |
   | `REWRITE_BEFORE_IMPORT` × 7 | ADAPT_THEN_INTEGRATE | 7 |
   | `HOLD_RECONCILE_DOCS` | ADAPT_THEN_INTEGRATE | 1 |
   | `HOLD_DATA_MUTATION` × 7 | PRESERVE_AS_REFERENCE (×6) + ADAPT_THEN_INTEGRATE (×1: `rebuild-taxonomy.ts`) | 7 |
   | `HOLD_ASSET_MUTATION` × 5 | ADAPT_THEN_INTEGRATE (×2: `make-logos-dark.cjs`, `process-logos.cjs`) + PRESERVE_AS_REFERENCE (×3: `orange-ix.cjs`, `process-logos-v2.cjs`, `clear-logo.ts`) | 5 |
   | `HOLD_COMPARE_CANONICAL_DOC` × 6 | PRESERVE_AS_REFERENCE | 6 |
   | `HOLD_MIGRATION_ARCHIVE` × 1 | SAFE_ARCHIVE | 1 |
   | `EXCLUDE_SECRET` × 1 | SAFE_ARCHIVE | 1 |
   | `EXCLUDE_DATABASE_DATA` × 8 | SAFE_ARCHIVE | 8 |
   | `EXCLUDE_UNVERIFIED_UPLOAD` × 5 | SAFE_ARCHIVE | 5 |
   | `EXCLUDE_PATCH_ARCHIVE` × 2 | SAFE_ARCHIVE | 2 |
   | `EXCLUDE_WORKSPACE_ARTIFACT` × 1 | SAFE_ARCHIVE | 1 |
   | `EXCLUDE_RUNTIME` × 1 (`.zscripts/dev.pid`) | PRESERVE_AS_REFERENCE | 1 |
   | `EXCLUDE_DUPLICATE_STARTUP` × 1 (`scripts/start-dev.sh`) | PRESERVE_AS_REFERENCE | 1 |

3. **The Senior Director's key distinction** ("using every file" ≠ "putting all old versions in runtime path") is operationalized as:
   - **"Used"** = any of {INTEGRATE, ADAPT_THEN_INTEGRATE, PRESERVE_AS_REFERENCE, SAFE_ARCHIVE}.
   - **"In runtime path"** = only INTEGRATE + completed ADAPT_THEN_INTEGRATE.
   - PRESERVE_AS_REFERENCE and SAFE_ARCHIVE count as "using" the file — they preserve its provenance + safe content + value without putting the file in the runtime path.

### 2.3 Methodology notes

- Each absent path was inspected where safe (text files only; `.env`, `.db`, `.jpg`, `.tar`, `.zip` never inspected).
- Representative files per adaptation candidate were read to ground the adaptation spec (e.g., `phase5a-audit.ts` read to identify the trust-domain audit capability; `ai-gateway-service.ts` read to identify the policy/budget/audit pattern; `make-logos-dark.cjs` read to identify the image-transform logic).
- ADAPT_THEN_INTEGRATE specs include the specific adaptation required (e.g., "replace `PriceRecord` with `PriceObservation`", "remove `@ts-nocheck` and `.catch(()=>0)` error masking", "parameterize hardcoded `/home/z/my-project/...` paths as CLI flags").
- PRESERVE_AS_REFERENCE entries get a proposed target path under `docs/legacy-parity/reference/<area>/`.
- SAFE_ARCHIVE entries get a proposed target path under `docs/legacy-parity/safe-archive/<area>/` with a documented manifest (file list, SHA-256 hashes, sizes, provenance).

---

## 3. Disposition by feature area (A–S)

For each of the 19 feature areas from the comprehensive audit, this section provides:
- File count + disposition breakdown
- File-level disposition table (for absent paths; already-present paths summarized as INTEGRATE)
- Feature area summary (value + adaptations needed)

### 3.A Authentication & Authorization

**Files:** 18
**Disposition breakdown:** INTEGRATE: 18, PRESERVE_AS_REFERENCE: 0, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

All 18 legacy auth paths are already tracked in target. The target's `src/lib/auth.ts` is the canonical active version — it removed the legacy hardcoded `ADMIN_CREDENTIALS` fallback pattern (PR #145 §4 hit #6, historical only). The target's `src/middleware.ts` retains the same `ROUTE_PERMS` table (60+ admin resources). No adaptation needed.

| File | Already in target? | Disposition | Rationale |
|---|---|---|---|
| (all 18 paths) | YES | INTEGRATE | Capability fully present. Target's active version is canonical. |

**Feature area summary:** Email/mobile + password registration/login with email verification, admin + user session cookies, central RBAC `ROUTE_PERMS`, SHA-256-hashed CSPRNG session tokens in `AdminSession` / `Session` tables. The legacy `auth-cleanup.ts` (periodic session pruning) survives in target. The legacy hardcoded admin credential is historical-only — preserved in PR #145 §4.1.1 as a security-finding record, NOT in target's runtime.

---

### 3.B AI Services

**Files:** 32
**Disposition breakdown:** INTEGRATE: 31, ADAPT_THEN_INTEGRATE: 1, PRESERVE_AS_REFERENCE: 0, SAFE_ARCHIVE: 0

| File | Size | Already in target? | Disposition | Rationale | Adaptation needed |
|---|---:|---|---|---|---|
| (31 already-present paths) | — | YES | INTEGRATE | All 8 public AI routes + 9 admin AI routes + `ai-agents/index.ts` (29.7KB) + `ai-matching.ts` + `ai-policy.ts` already in target as canonical active versions. | None. |
| `src/lib/ai-gateway-service.ts` | 5.7KB | NO (REJECT_PARALLEL_GATEWAY) | **ADAPT_THEN_INTEGRATE** | The legacy module captured a centralized policy/budget/audit/validation/prompt-injection gateway concept (per its header: "ALL AI calls in the project MUST go through this service"). However, the implementation had defects: `.catch(()=>null)` error masking on every DB call, `db.aIGatewayLog as any` untyped access, was never actually wired into the routes (each route called `ZAI.create()` inline). PR #116 removed this module from target. **But the conceptual capability — a single enforcement point that guarantees policy + budget + audit + Zod validation for EVERY AI call — is partially missing in the current target's design, where 21 routes import `z-ai-web-dev-sdk` directly without a unified enforcement wrapper.** | Rewrite as a typed decorator/HOF `withAIGatewayPolicy(taskType, fn)` that wraps `aiAgents.execute()` calls. Remove `.catch(()=>null)` masking (let errors propagate to the route's error handler). Type the `AIGatewayLog` access properly. Provide a `policyCheck()` + `budgetCheck()` pre-flight and `logResult()` post-flight. Integrate into the 21 AI routes incrementally (one route per PR with tests). |

**Feature area summary:** A unified AI gateway concept (policy + budget + audit + Zod validation + prompt-injection protection) — partially implemented in legacy, partially present in target via `ai-policy.ts` + `ai-agents/index.ts`. The single-gap adaptation (`ai-gateway-service.ts` → typed HOF) consolidates enforcement that today is spread across 21 routes. **No product gap** (capability present); **enforcement-consistency gap** addressed by adaptation.

---

### 3.C Listings & Catalog

**Files:** 40
**Disposition breakdown:** INTEGRATE: 39, ADAPT_THEN_INTEGRATE: 1, PRESERVE_AS_REFERENCE: 0, SAFE_ARCHIVE: 0

| File | Size | Already in target? | Disposition | Rationale | Adaptation needed |
|---|---:|---|---|---|---|
| (39 already-present paths) | — | YES | INTEGRATE | Public listing browse/detail/new-wizard + SEO city/category pages + admin products CRUD + 19 listing UI widgets already in target. | None. |
| `src/components/listings/PriceIntelligence.tsx` | 6.0KB | NO (REJECT_INCOMPATIBLE_CONTRACT) | **ADAPT_THEN_INTEGRATE** | The widget renders an `UNDERPRICED / FAIR / OVERPRICED` verdict callout with comparable stats (avg / median / min / max / sample size). The target's `PriceEstimateCard.tsx` covers price-estimate display but lacks the explicit verdict-label UX (the binary callout with color-coded hint). The widget was rejected because it expects `/api/ai-price-intelligence` to return a `PriceIntelResponse` shape with `verdict` field, but the target's canonical price-intelligence path uses `PriceObservation` (not legacy `PriceRecord`) and returns a different shape via `compare-engine.ts` + `price-engine.ts`. | Adapt the widget to consume the target's current price-intelligence API contract (call `compare-engine.computeOutlierScore()` server-side, pass verdict to the client component as a prop). Replace the inline `fetch('/api/ai-price-intelligence')` with a server-fetched verdict passed from the parent listing page. Integrate as an optional `<PriceVerdictBadge>` sub-component rendered inside `PriceEstimateCard.tsx` when verdict data is available. Test: snapshot test for the 3 verdict states (UNDERPRICED/FAIR/OVERPRICED). |

**Feature area summary:** Full B2B listings catalog with 19 UI widgets, 63KB single-file new-listing wizard, SEO landing pages, admin CRUD. **No functional gap** — price-verdict display is the single adaptation item, and it adds UX value (explicit verdict callout) rather than a missing capability.

---

### 3.D Taxonomy (Brands, Categories, Models, Industries)

**Files:** 67
**Disposition breakdown:** INTEGRATE: 67, PRESERVE_AS_REFERENCE: 0, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

All 67 taxonomy paths are already tracked in target. The complete hierarchy (brands + brand-families + brand-aliases + brand-labels + brand-resolve + categories + recursive tree explorer + models + industries + locations + service-types + transaction-types + attributes + category-attributes) survives in target as canonical. The 56KB `BrandControlCenter.tsx` is the canonical brand-management surface.

| File | Already in target? | Disposition | Rationale |
|---|---|---|---|
| (all 67 paths) | YES | INTEGRATE | Capability fully present. Target's active version is canonical. |

**Feature area summary:** Complete hierarchical taxonomy engine. No gap. No adaptation.

---

### 3.E Compare & Price Intelligence

**Files:** 27
**Disposition breakdown:** INTEGRATE: 25, ADAPT_THEN_INTEGRATE: 2, PRESERVE_AS_REFERENCE: 0, SAFE_ARCHIVE: 0

| File | Size | Already in target? | Disposition | Rationale | Adaptation needed |
|---|---:|---|---|---|---|
| (25 already-present paths) | — | YES | INTEGRATE | `compare-engine.ts` (32.6KB) + `price-engine.ts` (30.1KB) + `market-heatmap.ts` + admin PricingEngineClient (46.9KB) + admin price-intelligence page already in target as canonical. | None. |
| `src/components/compare/ComparePageClient.tsx` | 14.2KB | NO (REJECT_INCOMPATIBLE_API) | **ADAPT_THEN_INTEGRATE** | Legacy client component with interactive features: URL-state-synced selected IDs (`?ids=a,b,c`), live search + add-to-compare, reorderable columns, share-token generation. Target's compare page is a 36.1KB server component (good for SEO) but loses the interactivity (the user can't add/remove listings from the compare view without navigating away). The legacy client was rejected because it called `/api/compare?ids=...` with a different response shape than the target's compare API. | Adapt by extracting the interactive bits (selected-id state, search-add, reorder, share-token) as a small client island `<CompareInteractions>` rendered inside the existing server-component compare page. Pass the server-fetched compare data as props to the client island. Replace the legacy `/api/compare?ids=` fetch with the target's current compare API contract. Add a snapshot test for the URL-state-sync behavior. |
| `src/lib/price-intelligence.ts` | 10.4KB | NO (REJECT_DEPRECATED_MODEL) | **ADAPT_THEN_INTEGRATE** | The legacy module has a robust outlier-detection helper (robust z-score against IQR, ±3σ from median) + price-suggestion helper (HIGH/MEDIUM/LOW confidence based on sample size). The target's `compare-engine.ts` + `price-engine.ts` cover similar functionality but use `PriceObservation`. The legacy module used `PriceRecord` (deprecated in Issue #95). The outlier-detection algorithm is well-documented and may be more robust than target's current implementation. | Adapt by replacing `db.priceRecord.*` calls with `db.priceObservation.*`. Verify the outlier algorithm matches or improves on target's current `price-engine.ts` outlier logic. If the legacy algorithm is more robust, port it as `computeOutlierScore()` in `price-engine.ts` (consolidate, don't parallel). Add unit tests for the outlier detection (3 scenarios: outlier-below, outlier-above, in-range). |

**Feature area summary:** Side-by-side comparison + price intelligence with outlier detection. The target's design moved to server-component-first for SEO; the legacy client-component pattern adds interactivity value as a progressive-enhancement island. The price-intelligence module's outlier algorithm has reference value even if the target's is equivalent.

---

### 3.F Marketplace (RFQ, Wanted, Deals, Offers, Orders, Demand)

**Files:** 44
**Disposition breakdown:** INTEGRATE: 44, PRESERVE_AS_REFERENCE: 0, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

All 44 marketplace paths already tracked in target. Full B2B surface (RFQ + Wanted + Deals + Offers + Orders + Demand + Opportunities + Procurement + Find-my-need) with 3 independent matching engines (`matching-engine.ts`, `demand-engine.ts`, `opportunity-engine.ts`). One of the most fully-covered feature areas.

| File | Already in target? | Disposition | Rationale |
|---|---|---|---|
| (all 44 paths) | YES | INTEGRATE | Capability fully present. |

---

### 3.G Messaging & Notifications

**Files:** 22
**Disposition breakdown:** INTEGRATE: 22, PRESERVE_AS_REFERENCE: 0, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

All 22 messaging paths already tracked. Conversations + deal-room messaging + document attachments + read/unread notifications + Telegram bot integration (`process.env.TELEGRAM_BOT_TOKEN`, no hardcoded credentials).

| File | Already in target? | Disposition | Rationale |
|---|---|---|---|
| (all 22 paths) | YES | INTEGRATE | Capability fully present. |

---

### 3.H Store Center (Parts, Orders, Payments)

**Files:** 71
**Disposition breakdown:** INTEGRATE: 71, PRESERVE_AS_REFERENCE: 0, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

All 71 store paths already tracked. Standalone parts e-commerce sub-application with its own `prisma/store/schema.prisma` (nested layout), 13 client UI widgets, Zarinpal payment gateway integration (sandbox mock when `ZARINPAL_MERCHANT_ID` is empty), subscriptions + plans, multi-currency, wishlist.

| File | Already in target? | Disposition | Rationale |
|---|---|---|---|
| (all 71 paths) | YES | INTEGRATE | Capability fully present. Dual-database architecture (main + store) survives intact. |

---

### 3.I Seller & Company Management

**Files:** 28
**Disposition breakdown:** INTEGRATE: 28, PRESERVE_AS_REFERENCE: 0, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

All 28 seller/company paths already tracked. Company lifecycle (CRUD + branches + documents + verifications + partnerships), seller trust + reputation, follows + referrals, seller dashboard with leads.

| File | Already in target? | Disposition | Rationale |
|---|---|---|---|
| (all 28 paths) | YES | INTEGRATE | Capability fully present. |

---

### 3.J Reviews & Reputation

**Files:** 11
**Disposition breakdown:** INTEGRATE: 11, PRESERVE_AS_REFERENCE: 0, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

All 11 review paths already tracked. User-submitted reviews + admin rejection workflow with message threads.

| File | Already in target? | Disposition | Rationale |
|---|---|---|---|
| (all 11 paths) | YES | INTEGRATE | Capability fully present. |

---

### 3.K Admin Panel

**Files:** 155
**Disposition breakdown:** INTEGRATE: 155, PRESERVE_AS_REFERENCE: 0, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

All 155 admin paths already tracked (the largest fully-covered feature area). 80 admin pages + 65 admin API routes + 13 shared admin components + layout/page roots. 40+ sub-features including analytics, audit log, automations, catalog health, compatibility, content decay/factory, courses, deal rooms, demand signals, dictionary, feature flags, growth engine, home-section management, homepage layout, hot searches, inspections, jobs, knowledge + knowledge graph, launch phases, lifecycle, listings moderation, media library, menu editor, moderation, partners, policies, reels, sell-in-7-days, SEO, services, site settings, site stats, social reels, transport, users, webhooks. All gated by RBAC middleware.

| File | Already in target? | Disposition | Rationale |
|---|---|---|---|
| (all 155 paths) | YES | INTEGRATE | Capability fully present. |

---

### 3.L Home & Public Pages

**Files:** 82
**Disposition breakdown:** INTEGRATE: 82, PRESERVE_AS_REFERENCE: 0, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

All 82 home/public paths already tracked. Marketing site with 26 home sections, 9 public sub-features (auctions, community, knowledge, machine-hunt, market-insights, rentals, sell-in-7-days, transport, dashboard), API docs page, sitemap + robots + globals.css.

| File | Already in target? | Disposition | Rationale |
|---|---|---|---|
| (all 82 paths) | YES | INTEGRATE | Capability fully present. |

---

### 3.M Infrastructure & Config

**Files:** 138
**Disposition breakdown:** INTEGRATE: 137, PRESERVE_AS_REFERENCE: 1, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

| File | Size | Already in target? | Disposition | Rationale | Adaptation needed |
|---|---:|---|---|---|---|
| (137 already-present paths) | — | YES | INTEGRATE | Root config (`.gitignore`, `Caddyfile`, `bun.lock`, `docker-compose.yml`, `eslint.config.mjs`, `next.config.ts`, `package.json`, `tailwind.config.ts`, `tsconfig.json`, `vitest.config.ts`, `worklog.md`) + 33 core `src/lib/*` modules + 24 generated Prisma store-client artifacts + 39 shadcn/ui primitives + 8 hooks + 10 `.zscripts/*.sh` (excluding `dev.pid`). All canonical in target. | None. |
| `.zscripts/dev.pid` | 5B | NO (EXCLUDE_RUNTIME) | **PRESERVE_AS_REFERENCE** | 5-byte runtime-only PID marker. Not a code artifact — was generated when the dev server started. The convention (using `dev.pid` to track running dev-server PID for `keep-dev-alive.sh`) is the only valuable content. The PID value itself is meaningless outside its original session. | Preserve the convention as `docs/legacy-parity/reference/infrastructure/dev-pid-convention.md` (documents: file path, format, lifecycle, consumers `keep-dev-alive.sh`). Do NOT commit the PID value. |

**Feature area summary:** Next 16 + Prisma 6.11 + Tailwind 4 + shadcn/ui stack with dual-PostgreSQL docker-compose (`heavix` on :5432 + `heavix_store` on :5433), Caddy reverse-proxy on :81 → :3000, generated Prisma store-client committed for edge-runtime, `.zscripts/` orchestration shells including Python-runtime container build for the AI scraper subprocess. 138/138 paths dispositioned (137 INTEGRATE + 1 PRESERVE_AS_REFERENCE).

---

### 3.N Prisma & Database

**Files:** 39
**Disposition breakdown:** INTEGRATE: 36, ADAPT_THEN_INTEGRATE: 1, PRESERVE_AS_REFERENCE: 2, SAFE_ARCHIVE: 0

| File | Size | Already in target? | Disposition | Rationale | Adaptation needed |
|---|---:|---|---|---|---|
| (36 already-present paths) | — | YES | INTEGRATE | Main `schema.prisma` (101KB) + legacy-sqlite archives + 28 phase-organized seed scripts + `migrate-passwords.ts` + `run-ai-agents.ts` + `test-ai-gateway.ts` + `generate-sale-images.ts` + `migration_lock.toml` — all canonical in target. Target's actual migrations live at `prisma/migrations/20261025081255_init_postgresql_baseline/` (PostgreSQL baseline, replacing the legacy SQLite `0_init/`). | None. |
| `prisma/migrations/0_init/migration.sql` | 42.0KB | NO (REJECT_STALE_MIGRATION) | **PRESERVE_AS_REFERENCE** | The legacy SQLite baseline migration (`CREATE TABLE "Brand" (... DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ...)` — SQLite dialect). Rejected for active use because target cut over to PostgreSQL (per `docs/ADR-001-database-strategy.md`), and the target's `20261025081255_init_postgresql_baseline/migration.sql` is the new baseline. BUT the legacy SQLite migration has historical-reference value: it documents the SQLite-era schema shape and the SQLite→PostgreSQL cutover point. | Preserve at `docs/legacy-parity/reference/prisma/migrations/0_init/migration.sql` (NOT in active `prisma/migrations/`). Add a header explaining: "Legacy SQLite baseline, superseded by PostgreSQL baseline on 2026-10-25. Preserved as historical reference of the SQLite-era schema." Do NOT run. |
| `prisma/migrations/README.md` | 3.6KB | NO (HOLD_RECONCILE_DOCS) | **ADAPT_THEN_INTEGRATE** | The legacy README documents the SQLite→PostgreSQL cutover plan (per ADR-001), migration rules (production uses PostgreSQL, `prisma/migrations/` is source of truth, `db push` is dev-only, `--accept-data-loss` forbidden in production, hard-delete forbidden for business data). The TARGET has no `prisma/migrations/README.md` (verified — the target's `prisma/migrations/` directory contains only `migration_lock.toml` + the `20261025081255_init_postgresql_baseline/` subdirectory). The target needs a migrations README that reflects the CURRENT PostgreSQL baseline. | Adapt by rewriting the README to: (1) reference the current `20261025081255_init_postgresql_baseline/migration.sql` as the active baseline; (2) preserve the legacy SQLite cutover narrative as a "Historical context" section; (3) update the `bunx prisma migrate diff` example to use `--from-schema-datamodel prisma/schema.prisma`; (4) keep the rules (production PostgreSQL, source-of-truth, no `db push` in prod, no `--accept-data-loss`, archive > delete for business data) as-is. Integrate as `prisma/migrations/README.md`. |
| `prisma/store-schema.prisma` | 12.5KB | NO (REJECT_DUPLICATE_SCHEMA) | **PRESERVE_AS_REFERENCE** | Content-identical to the target's `prisma/store/schema.prisma` (verified by the layout decision: target uses nested `prisma/store/` directory, legacy used flat-layout `prisma/store-schema.prisma`). The flat layout was rejected because the target adopted the nested layout for the store schema. The flat-layout file has reference value as evidence of the layout decision. | Preserve at `docs/legacy-parity/reference/prisma/store-schema-flat-layout.prisma` (NOT in active `prisma/`). Add a header explaining: "Legacy flat-layout store schema. Target uses nested `prisma/store/schema.prisma`. Preserved as evidence of the layout-migration decision." Do NOT use as active schema. |

**Feature area summary:** Two-schema Prisma (main 101KB + store 12.5KB), 28 phase-organized seed scripts, legacy SQLite archives preserved. 36/39 paths INTEGRATE, 1 ADAPT (migrations README), 2 PRESERVE (stale SQLite migration + duplicate flat-layout schema). All Prisma-related deltas are already documented in PR #146 (field-level) and PR #151 (migration-client compatibility).

---

### 3.O Scripts

**Files:** 25
**Disposition breakdown:** INTEGRATE: 4, ADAPT_THEN_INTEGRATE: 12, PRESERVE_AS_REFERENCE: 9, SAFE_ARCHIVE: 0

This is the feature area with the highest concentration of non-INTEGRATE dispositions (21/25 absent).

#### 3.O.1 Already-present scripts (4 — INTEGRATE)

| File | Size | Already in target? | Disposition | Rationale |
|---|---:|---|---|---|
| `scripts/backup.sh` | 2.1KB | YES | INTEGRATE | Operational shell — canonical in target. |
| `scripts/restore.sh` | 1.9KB | YES | INTEGRATE | Operational shell — canonical in target. |
| `scripts/catalog-health.ts` | 3.4KB | YES | INTEGRATE | Has `@ts-nocheck` (one of the 8 already-present @ts-nocheck files per §4.3 of comprehensive audit). Target's version is canonical. The @ts-nocheck cleanup is a separate future PR (out of scope for Issue #144). |
| `scripts/migrate-sqlite-to-postgres.ts` | 8.3KB | YES | INTEGRATE | Has `@ts-nocheck` (one of the 8 already-present @ts-nocheck files). Historical one-time migration utility — canonical in target. The @ts-nocheck cleanup is a separate future PR. |

#### 3.O.2 Phase-audit scripts (7 — ADAPT_THEN_INTEGRATE)

| File | Size | Already in target? | Disposition | Rationale | Adaptation needed |
|---|---:|---|---|---|---|
| `scripts/phase5a-audit.ts` | 6.8KB | NO (REWRITE_BEFORE_IMPORT) | **ADAPT_THEN_INTEGRATE** | Capability: 12-category trust-domain audit (user verification, company verification, company documents, listing verification, machine verification via MachinePassport, inspection, moderation, audit log, review, API routes existence, admin pages existence, RBAC permissions). Useful as a dev-time trust-domain diagnostic. Defects: `// @ts-nocheck` line 1; `.catch(() => [])` and `.catch(() => 0)` error masking on every DB query (silently hides schema-mismatch errors); single-schema assumption (only `db.user`, `db.company` — ignores `storeDb`); hardcoded relative `fs.existsSync("src/app/api/...")` paths (breaks if cwd ≠ repo root); brittle `schemaContent.includes("model X {")` matching. | Rewrite as `scripts/audit-phase5-trust-domain.ts`: (1) remove `@ts-nocheck` — type all `db.*` calls; (2) remove `.catch(() => 0)` masking — let errors propagate and report them as `ERROR` rows in the audit output; (3) add `storeDb` (store-schema) coverage for store-specific trust entities; (4) parameterize the source-tree path (use `path.resolve(__dirname, "../src/app/...")` instead of relative cwd); (5) replace `schemaContent.includes("model X {")` with `prismaJsonDatamodel.models.X` reflection. Add a vitest test fixture with a mock schema + mock DB. Estimated complexity: **M**. |
| `scripts/phase6a-audit.ts` | 4.5KB | NO (REJECT_STALE_AUDIT) | **ADAPT_THEN_INTEGRATE** | Capability: marketplace-domain audit (RFQ + Wanted + Deals + Offers + Orders). Same defects as phase5a. The "stale" rejection was because the underlying data changed; the AUDIT CAPABILITY is still useful. | Same adaptation pattern as phase5a. Rewrite as `scripts/audit-phase6-marketplace.ts`. Estimated complexity: **M**. |
| `scripts/phase7a-audit.ts` | 5.4KB | NO (REWRITE_BEFORE_IMPORT) | **ADAPT_THEN_INTEGRATE** | Capability: RFQ matching-engine audit (matching-score distribution, request-to-listing match counts). Same defects as phase5a. | Same adaptation pattern. Rewrite as `scripts/audit-phase7-rfq-matching.ts`. Estimated complexity: **M**. |
| `scripts/phase8a-audit.ts` | 4.4KB | NO (REWRITE_BEFORE_IMPORT) | **ADAPT_THEN_INTEGRATE** | Capability: messaging-domain audit (conversations, deal-rooms, notifications, Telegram integration). Same defects. | Same adaptation pattern. Rewrite as `scripts/audit-phase8-messaging.ts`. Estimated complexity: **M**. |
| `scripts/phase9a-audit.ts` | 5.1KB | NO (REWRITE_BEFORE_IMPORT) | **ADAPT_THEN_INTEGRATE** | Capability: orders + deals audit (dispute resolution, payment verification). Same defects. | Same adaptation pattern. Rewrite as `scripts/audit-phase9-orders-deals.ts`. Estimated complexity: **M**. |
| `scripts/phase10a-audit.ts` | 4.2KB | NO (REWRITE_BEFORE_IMPORT) | **ADAPT_THEN_INTEGRATE** | Capability: reviews + reputation audit (review approval rate, rejection-message threading). Same defects. | Same adaptation pattern. Rewrite as `scripts/audit-phase10-reviews-reputation.ts`. Estimated complexity: **M**. |
| `scripts/phase11a-audit.ts` | 3.4KB | NO (REWRITE_BEFORE_IMPORT) | **ADAPT_THEN_INTEGRATE** | Capability: notifications audit (notification delivery rate, read-rate, unread-count). Same defects. | Same adaptation pattern. Rewrite as `scripts/audit-phase11-notifications.ts`. Estimated complexity: **S** (smallest phase-audit). |

#### 3.O.3 Security-check script (1 — ADAPT_THEN_INTEGRATE)

| File | Size | Already in target? | Disposition | Rationale | Adaptation needed |
|---|---:|---|---|---|---|
| `scripts/security-check.ts` | 4.9KB | NO (REJECT_OBSOLETE_SECURITY_CHECK) | **ADAPT_THEN_INTEGRATE** | Capability: dev-time security lint that scans all `route.ts` files in `src/app/api/admin/` and `src/app/api/` for: (a) missing auth (`isAuthenticated`, `getCurrentUser`, `requireAdmin`); (b) missing RBAC (`requirePermission`, `hasPermission`); (c) missing audit (`auditLog`, `AuditLog`); (d) AI Gateway bypass (routes that call `ZAI.create()` or import `z-ai-web-dev-sdk` but are not in `ai-gateway` / `ai-budget` routes). The target supersedes with `audit-ai-gateway.mjs` + `audit-admin-rbac.mjs` (PR #145 §5) + real vitest tests — but the LEGACY capability of a SINGLE CLI script that produces a coverage report is useful as a development-time lint. Defects: `// @ts-nocheck` line 1; brittle string-include checks (`content.includes("isAuthenticated")`); doesn't respect the target's `ROUTE_PERMS` middleware pattern (which centralizes RBAC in `src/middleware.ts` rather than per-route). | Rewrite as `scripts/security-coverage-check.ts`: (1) remove `@ts-nocheck`; (2) recognize the `ROUTE_PERMS` middleware pattern as satisfying RBAC for routes whose paths are in the `ROUTE_PERMS` table (don't flag those as missing RBAC); (3) keep the AI-gateway-bypass detection (still useful — the 21 SDK-importing routes should be flagged for the `withAIGatewayPolicy()` adaptation from §3.B); (4) add JSON output mode for CI integration. Add a snapshot test that runs the check against a fixture repo with known-good and known-bad routes. Estimated complexity: **M**. |

#### 3.O.4 Data-mutation seed scripts (7 — 6 PRESERVE, 1 ADAPT)

| File | Size | Already in target? | Disposition | Rationale | Adaptation needed |
|---|---:|---|---|---|---|
| `scripts/seed-articles.ts` | 6.6KB | NO (HOLD_DATA_MUTATION) | **PRESERVE_AS_REFERENCE** | Seeds 4 articles + 5 hot searches + 4 homepage sections + 5 footer links + 8 navigation menu items. Workstation-specific seed data (Persian article slugs, hardcoded menu items). Target's `prisma/seed.ts` (27.9KB) + `prisma/seed-phase6-7-automation-monetization.ts` cover the same surface. The seed PATTERN (upsert-by-slug, multi-section seed in one script) is useful reference. | Preserve at `docs/legacy-parity/reference/scripts/seed-articles.ts`. Document provenance: "Legacy workstation seed (Persian article slugs, homepage layout). Superseded by `prisma/seed.ts`. Kept as reference for the multi-section seed pattern." Do NOT run. |
| `scripts/seed-brands-300.ts` | 24.6KB | NO (HOLD_DATA_MUTATION) | **PRESERVE_AS_REFERENCE** | Seeds 300 brand names (Caterpillar, Komatsu, Hitachi, etc.). Real-world reference data — but the target's `prisma/seed-brands-a.ts` (51.6KB) + `prisma/seed-brands-b.ts` (82.3KB) together cover a larger brand set. The 300-brand list has reference value as a curated industry-brand directory. | Preserve at `docs/legacy-parity/reference/scripts/seed-brands-300.ts`. Document provenance: "300-brand curated industry directory (heavy machinery + auto parts + oil/gas + industrial). Target's `prisma/seed-brands-a/b.ts` covers a superset. Kept as reference for the brand-name curation." Do NOT run. |
| `scripts/seed-essential.ts` | 6.3KB | NO (HOLD_DATA_MUTATION) | **PRESERVE_AS_REFERENCE** | Seeds articles + hot searches + homepage sections + footer + nav menu (overlap with `seed-articles.ts`). Workstation-specific. | Preserve at `docs/legacy-parity/reference/scripts/seed-essential.ts`. Document provenance. Do NOT run. |
| `scripts/seed-kill-switch.ts` | 1.2KB | NO (HOLD_DATA_MUTATION) | **PRESERVE_AS_REFERENCE** | Seeds a single kill-switch flag. The pattern (seeding a feature-flag for emergency toggling) is useful reference. Target likely has `feature-flags/page.tsx` covering similar surface. | Preserve at `docs/legacy-parity/reference/scripts/seed-kill-switch.ts`. Document provenance: "Legacy kill-switch seed (single feature-flag). Target's `feature-flags` admin page covers similar surface. Kept as reference for the kill-switch pattern." Do NOT run. |
| `scripts/seed-plans.ts` | 2.7KB | NO (HOLD_DATA_MUTATION) | **PRESERVE_AS_REFERENCE** | Seeds subscription plans. Workstation-specific seed (plan names + prices + limits). Target's `prisma/seed.ts` covers similar surface. | Preserve at `docs/legacy-parity/reference/scripts/seed-plans.ts`. Document provenance. Do NOT run. |
| `scripts/rebuild-taxonomy.ts` | 20.9KB | NO (HOLD_DATA_MUTATION) | **ADAPT_THEN_INTEGRATE** | 14-root-category taxonomy with full subcategory trees (Machinery → Road Construction → Excavator/Loader/Bulldozer/Grader/etc., Mining Machinery → Dump Truck/Mining Loader/etc., Drilling Equipment, etc.). The most complete canonical taxonomy structure. Target's `prisma/seed-taxonomy.ts` (19.2KB) + `prisma/seed-taxonomy-v11.ts` (62.8KB) may cover the same surface but possibly with different structure. The 14-root-category structure is a useful reference AND a candidate for canonical integration if it improves on the target's current taxonomy. | Adapt by: (1) verifying which categories the target's current `prisma/seed-taxonomy*.ts` scripts already seed; (2) rewriting the legacy script as `prisma/seed-taxonomy-canonical.ts` with idempotent `upsert-by-slug` (re-runnable); (3) adding only the categories MISSING from the target's current taxonomy; (4) gating behind `--confirm` flag (no accidental mutation); (5) adding a vitest fixture that exercises the upsert against a mock Prisma client. Estimated complexity: **L**. |
| `scripts/seed-store-comprehensive.ts` | 91.7KB | NO (REJECT_DIRECT_SEED_IMPORT) | **ADAPT_THEN_INTEGRATE** | 843-line store seed (brands + categories + car-models + parts across 4 sectors: Auto Parts ~25 brands + ~95 parts, Heavy Machinery ~25 brands + ~70 parts, Oil/Gas/Petrochemical ~15 brands + ~35 parts, Industrial ~18 brands + ~55 parts). Uses `storeDb` (store Prisma client). Real-world reference data. Target's `prisma/seed-store.ts` (6.2KB) is much smaller — the legacy comprehensive seed has substantially more data. | Adapt by: (1) verifying the target's current `storeDb` contract matches the script's expectations (model names, field names); (2) rewriting as `prisma/store/seed-comprehensive.ts` with idempotent `upsert-by-sku` for parts (re-runnable); (3) gating behind `--confirm` flag; (4) splitting into 4 sector-specific sub-scripts for granular control; (5) adding a vitest fixture. Estimated complexity: **L**. |

#### 3.O.5 Asset-mutation scripts (5 — 2 ADAPT, 3 PRESERVE)

| File | Size | Already in target? | Disposition | Rationale | Adaptation needed |
|---|---:|---|---|---|---|
| `scripts/clear-logo.ts` | 361B | NO (HOLD_ASSET_MUTATION) | **PRESERVE_AS_REFERENCE** | 7-line one-shot script that clears `siteSettings.logoUrl` + `footerLogoUrl`. Workstation-specific operational action (clearing a logo setting after asset reprocessing). Not reusable — but the pattern (single-setting clear) is documented. | Preserve at `docs/legacy-parity/reference/scripts/clear-logo.ts`. Document provenance: "Legacy one-shot: cleared site logo URLs to force fallback to `/logos/heavix-logo.png`. Pattern documented." Do NOT run. |
| `scripts/make-logos-dark.cjs` | 2.5KB | NO (HOLD_ASSET_MUTATION) | **ADAPT_THEN_INTEGRATE** | Image-processing utility that takes an uploaded logo JPG and produces a dark-background variant (white→transparent, orange→kept, dark→white). The LOGIC (pixel-level color classification + alpha manipulation) is reusable. Defects: hardcoded `/home/z/my-project/public/logos` and `/home/z/my-project/upload/IMG_*.jpg` paths (workstation-specific); requires `sharp` (already in `package.json`). | Adapt by: (1) parameterizing input/output paths as CLI flags (`--input <path> --output <path>`); (2) extracting the color-classification logic into a reusable function `transformLogoForDarkBg(buffer): buffer`; (3) integrating as `scripts/image-transform-logo-dark.ts` (TypeScript, typed); (4) adding a vitest fixture with a known input PNG → expected output PNG (pixel-diff assertion). Estimated complexity: **M**. |
| `scripts/orange-ix.cjs` | 2.8KB | NO (HOLD_ASSET_MUTATION) | **PRESERVE_AS_REFERENCE** | One-off pixel-manipulation to isolate the "IX" text from a specific HEAVIX logo (hardcoded bounding-box heuristics for that single logo). Not generally reusable — but the approach (pixel-row scanning + bounding-box detection) has reference value. | Preserve at `docs/legacy-parity/reference/scripts/orange-ix.cjs`. Document provenance: "Legacy one-off: isolated 'IX' text from HEAVIX logo. Approach (pixel-row scanning + bounding-box detection) documented for reference. Not generally reusable." Do NOT run. |
| `scripts/process-logos.cjs` | 2.7KB | NO (HOLD_ASSET_MUTATION) | **ADAPT_THEN_INTEGRATE** | Image-processing utility (v1 of the logo-transform pipeline): takes an uploaded JPG, makes white pixels transparent, produces both a colored variant and a white-tinted-for-dark-bg variant. Same defects as `make-logos-dark.cjs` (hardcoded workstation paths). The logic is the simpler version of what `make-logos-dark.cjs` does. | Adapt by: (1) parameterizing paths as CLI flags; (2) extracting the white-to-transparent logic into a reusable function `transformLogoTransparent(buffer): buffer`; (3) integrating as `scripts/image-transform-logo-transparent.ts` (the simpler variant complementing `image-transform-logo-dark.ts`); (4) adding a vitest fixture. Estimated complexity: **S**. |
| `scripts/process-logos-v2.cjs` | 2.1KB | NO (HOLD_ASSET_MUTATION) | **PRESERVE_AS_REFERENCE** | V2 of the logo-processing pipeline. The v1 (`process-logos.cjs`) is being adapted+integrated; v2 is preserved as historical reference for the pipeline's evolution. | Preserve at `docs/legacy-parity/reference/scripts/process-logos-v2.cjs`. Document provenance: "Legacy v2 of the logo-processing pipeline. V1 (`process-logos.cjs`) is being adapted+integrated as `scripts/image-transform-logo-transparent.ts`. V2 preserved as historical reference." Do NOT run. |

#### 3.O.6 Startup scripts (1 — PRESERVE)

| File | Size | Already in target? | Disposition | Rationale | Adaptation needed |
|---|---:|---|---|---|---|
| `scripts/start-dev.sh` | 617B | NO (EXCLUDE_DUPLICATE_STARTUP) | **PRESERVE_AS_REFERENCE** | 16-line bash script with hardcoded `cd /home/z/my-project` that daemonizes the dev server using `setsid` + `disown` so it survives the bash tool's session ending. Duplicates `.zscripts/dev.sh` functionality (which is already integrated in target). The detached-session pattern has reference value. | Preserve at `docs/legacy-parity/reference/scripts/start-dev.sh`. Document provenance: "Legacy detached-session dev-server launcher. Hardcoded `/home/z/my-project` path. Target uses `.zscripts/dev.sh` (already integrated). The `setsid + disown + </dev/null` detached-session pattern preserved as reference." Do NOT run. |

**Feature area summary:** 25 scripts — 4 INTEGRATE (operational shells + catalog-health + sqlite-to-postgres migrator), 12 ADAPT_THEN_INTEGRATE (7 phase audits + security-check + rebuild-taxonomy + seed-store-comprehensive + 2 image-transform scripts), 9 PRESERVE_AS_REFERENCE (5 data-mutation seeds + 3 asset-mutation one-offs + 1 duplicate startup). The 12 ADAPT items together constitute a substantial scriptmodernization backlog — see §4.

---

### 3.P Tests

**Files:** 20
**Disposition breakdown:** INTEGRATE: 20, PRESERVE_AS_REFERENCE: 0, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

All 20 test paths already tracked. Vitest suite — 11 phase-organized integration tests (phase1-hardening through phase11-notifications), 5 unit tests (rbac, rate-limit, password, brand-alias, upload-security), 3 build/runtime shell scripts, README documenting the test taxonomy.

| File | Already in target? | Disposition | Rationale |
|---|---|---|---|
| (all 20 paths) | YES | INTEGRATE | Capability fully present. |

---

### 3.Q Documentation

**Files:** 18
**Disposition breakdown:** INTEGRATE: 18, PRESERVE_AS_REFERENCE: 0, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

All 18 documentation paths already tracked. 18 architectural / strategy / specification / audit documents covering database strategy (ADR-001), architecture overview, the September 2026 audit, completion master spec, corrected reference V1.1, data governance, implementation gap audit, machine comparison spec, master document, master execution plan V2.0, master strategy, operational execution plan, P0 implementation plan, price estimation spec, project principles, project reference, requirements corrections, security baseline V1.

| File | Already in target? | Disposition | Rationale |
|---|---|---|---|
| (all 18 paths) | YES | INTEGRATE | Capability fully present. |

---

### 3.R Static Assets

**Files:** 38
**Disposition breakdown:** INTEGRATE: 37, PRESERVE_AS_REFERENCE: 1, ADAPT_THEN_INTEGRATE: 0, SAFE_ARCHIVE: 0

| File | Size | Already in target? | Disposition | Rationale | Adaptation needed |
|---|---:|---|---|---|---|
| (37 already-present paths) | — | YES | INTEGRATE | 6 hero images + 4 machinery illustrations + 5 section headers + 4 sell-in-7-days JPGs + 7 brand logos (heavix + aria + mekanix in PNG + SVG variants) + manifest.json + 9 user-uploaded images in `public/uploads/*`. All canonical in target. (Provenance concern for `public/uploads/*` documented in §3.R note below.) | None. |
| `public/robots.txt` | 160B | NO (REJECT_DUPLICATE_ROUTE) | **PRESERVE_AS_REFERENCE** | Static `robots.txt` (160 bytes of static allow/disallow rules). Rejected because the target generates robots rules dynamically via `src/app/robots.ts` (Next 16 metadata robots API), making the static duplicate redundant. The static file has historical-reference value (documents the pre-dynamic-robots era). | Preserve at `docs/legacy-parity/reference/public/robots.txt` (160 bytes, safe to commit as plain text). Add a header comment: "Legacy static robots.txt. Target uses dynamic `src/app/robots.ts` (Next 16 metadata API). Preserved as historical reference." Do NOT place in active `public/`. |

**Note on `public/uploads/*` provenance:** The 9 user-uploaded images in `public/uploads/` (3 unsorted + 5 category images + 1 hero upload) are tracked in target. Their provenance is unverified (matched the same provenance concern as `upload/IMG_*.jpg` — see §3.S). This is a documented concern, not a disposition change — they remain INTEGRATE because they are actively used by the target's UI; the provenance concern is tracked as an open item (see §8 safety boundaries).

**Feature area summary:** Static asset library (hero + machinery + sections + sell-in-7-days + logos + manifest + uploads). 37/38 INTEGRATE, 1 PRESERVE (static robots.txt superseded by dynamic app/robots.ts).

---

### 3.S Excluded Files (secrets, databases, archives, uploads)

**Files:** 24
**Disposition breakdown:** INTEGRATE: 0, ADAPT_THEN_INTEGRATE: 0, PRESERVE_AS_REFERENCE: 6, SAFE_ARCHIVE: 18

This area covers all sensitive / binary / unverified files. They are split into:
- **6 PRESERVE_AS_REFERENCE** — duplicate canonical-doc copies in `upload/` (the SAME 6 docs exist in `docs/`, so the upload copies are duplicate; preserve the relationship as reference).
- **18 SAFE_ARCHIVE** — secrets + DB snapshots + unverified uploads + patch archives + workspace dump (binary content never enters Git; safe content + provenance preserved).

#### 3.S.1 Duplicate canonical-doc copies (6 — PRESERVE_AS_REFERENCE)

| File | Size | Already in target? | Disposition | Rationale | Adaptation needed |
|---|---:|---|---|---|---|
| `upload/HEAVIX-AUDIT-2026-09-20.md` | 14.6KB | YES (canonical at `docs/HEAVIX-AUDIT-2026-09-20.md`) | **PRESERVE_AS_REFERENCE** | Content-identical to `docs/HEAVIX-AUDIT-2026-09-20.md` (already in target). The `upload/` copy was used during a development session as a working copy. Preserved as evidence of the upload-canonical-doc relationship. | Preserve the relationship (not the duplicate file) at `docs/legacy-parity/reference/upload-canonical-doc-copies.md`. Document: "6 `upload/HEAVIX-*.md` files are content-identical to canonical `docs/HEAVIX-*.md` files. The upload copies were used as working copies during dev sessions; canonical versions live in `docs/`." Do NOT duplicate the content. |
| `upload/HEAVIX-COMPLETION-SPECIFICATION-V1.0.md` | 33.8KB | YES (canonical at `docs/HEAVIX-COMPLETION-MASTER-SPEC-V1.0.md`) | **PRESERVE_AS_REFERENCE** | Same as above. The upload filename differs from canonical (`SPECIFICATION` vs `MASTER-SPEC`). | Same treatment — preserve the relationship in the reference index. |
| `upload/HEAVIX-CORRECTED-REFERENCE-V1.1.md` | 4.7KB | YES (canonical at `docs/HEAVIX-CORRECTED-REFERENCE-V1.1.md`) | **PRESERVE_AS_REFERENCE** | Content-identical, same filename. | Same treatment. |
| `upload/HEAVIX-DATA-GOVERNANCE-V1.md` | 2.0KB | YES (canonical at `docs/HEAVIX-DATA-GOVERNANCE-V1.md`) | **PRESERVE_AS_REFERENCE** | Content-identical, same filename. | Same treatment. |
| `upload/HEAVIX-P0-IMPLEMENTATION-PLAN.md` | 3.4KB | YES (canonical at `docs/HEAVIX-P0-IMPLEMENTATION-PLAN.md`) | **PRESERVE_AS_REFERENCE** | Content-identical, same filename. | Same treatment. |
| `upload/HEAVIX-SECURITY-BASELINE-V1.md` | 2.2KB | YES (canonical at `docs/HEAVIX-SECURITY-BASELINE-V1.md`) | **PRESERVE_AS_REFERENCE** | Content-identical, same filename. | Same treatment. |

#### 3.S.2 Secrets + databases + uploads + archives (18 — SAFE_ARCHIVE)

| File | Size | Already in target? | Disposition | What's sensitive | Safe content to preserve | Where to document |
|---|---:|---|---|---|---|---|
| `.env` | 50B | NO (EXCLUDE_SECRET) | **SAFE_ARCHIVE** | `DATABASE_URL=<dev-path>` — dev DB URL | Redacted structure: `DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<dbname>?schema=<schema>` (no value); document the dev-only nature | `docs/legacy-parity/safe-archive/dotenv-structure.md` (redacted `.env.example` style) |
| `db/backups/custom-20260921-023810.db` | 2.4MB | NO (EXCLUDE_DATABASE_DATA) | **SAFE_ARCHIVE** | SQLite database backup (main DB, timestamped) | Manifest: file path, size (2.4MB), SHA-256 hash, snapshot timestamp (2026-09-21 02:38:10), table count (never inspected — preserve as opaque snapshot metadata) | `docs/legacy-parity/safe-archive/db-snapshots-inventory.md` |
| `db/backups/custom-20260921-024013.db` | 2.4MB | NO (EXCLUDE_DATABASE_DATA) | **SAFE_ARCHIVE** | Same as above (different timestamp) | Same metadata | Same doc |
| `db/backups/custom-20260921-025202.db` | 2.4MB | NO (EXCLUDE_DATABASE_DATA) | **SAFE_ARCHIVE** | Same as above (different timestamp) | Same metadata | Same doc |
| `db/custom.db` | 2.5MB | NO (EXCLUDE_DATABASE_DATA) | **SAFE_ARCHIVE** | Main SQLite DB (workstation snapshot) | Manifest: path, size, SHA-256, table list (extracted from `prisma/legacy-sqlite/schema.prisma` model list — 110 models — NOT from inspecting the .db file) | Same doc |
| `db/custom.db.before-restore` | 2.4MB | NO (EXCLUDE_DATABASE_DATA) | **SAFE_ARCHIVE** | Pre-restore copy of main SQLite DB | Same metadata + note "pre-restore snapshot" | Same doc |
| `db/store.db` | 336.0KB | NO (EXCLUDE_DATABASE_DATA) | **SAFE_ARCHIVE** | Store SQLite DB (workstation snapshot) | Manifest: path, size (336KB), SHA-256, table list (from `prisma/legacy-sqlite/store-schema.prisma` model list — 20 models) | Same doc |
| `upload/HEAVIX-EXECUTABLE-HARDENING-PATCH-V1.0.zip` | 9.4KB | NO (EXCLUDE_PATCH_ARCHIVE) | **SAFE_ARCHIVE** | Untrusted patch archive (executable hardening patch v1.0 — never extracted) | Manifest: archive name, size (9.4KB), file count (extracted via `unzip -l` listing only — no content), provenance ("hardening patch v1.0 prepared during dev session 2026-09-21") | `docs/legacy-parity/safe-archive/patch-archives-inventory.md` |
| `upload/HEAVIX-PRICE-COMPARISON-DOCUMENTS-V1.0.zip` | 4.7KB | NO (EXCLUDE_PATCH_ARCHIVE) | **SAFE_ARCHIVE** | Untrusted patch archive (price comparison docs v1.0 — never extracted) | Manifest: archive name, size (4.7KB), file listing | Same doc |
| `upload/IMG_20260921_134636_188.jpg` | 46.1KB | NO (EXCLUDE_UNVERIFIED_UPLOAD) | **SAFE_ARCHIVE** | Unverified upload (camera JPG) — used as source for `process-logos.cjs` / `make-logos-dark.cjs` | Manifest: filename, size (46.1KB), SHA-256, dimensions (extracted via `sharp metadata` without reading pixels — width×height only), provenance ("uploaded 2026-09-21 13:46:36, used as source for legacy logo processing scripts") | `docs/legacy-parity/safe-archive/unverified-uploads-inventory.md` |
| `upload/IMG_20260921_134636_634.jpg` | 33.5KB | NO (EXCLUDE_UNVERIFIED_UPLOAD) | **SAFE_ARCHIVE** | Unverified upload — source for `mekanix-logo` | Same metadata | Same doc |
| `upload/IMG_20260921_134636_663.jpg` | 24.5KB | NO (EXCLUDE_UNVERIFIED_UPLOAD) | **SAFE_ARCHIVE** | Unverified upload — alternate source for `mekanix-logo` | Same metadata | Same doc |
| `upload/IMG_20260921_134636_703.jpg` | 23.3KB | NO (EXCLUDE_UNVERIFIED_UPLOAD) | **SAFE_ARCHIVE** | Unverified upload (provenance unclear) | Same metadata | Same doc |
| `upload/IMG_20260921_134636_839.jpg` | 12.4KB | NO (EXCLUDE_UNVERIFIED_UPLOAD) | **SAFE_ARCHIVE** | Unverified upload — source for `heavix-logo` | Same metadata | Same doc |
| `upload/custom-20260921-024013.db` | 2.4MB | NO (EXCLUDE_DATABASE_DATA) | **SAFE_ARCHIVE** | Duplicate copy of main SQLite DB (uploaded to `upload/` — same content as `db/backups/custom-20260921-024013.db`) | Manifest: path, size, SHA-256 (cross-reference to `db/backups/` copy if identical) | `docs/legacy-parity/safe-archive/db-snapshots-inventory.md` |
| `upload/custom-20260921-025202.db` | 2.4MB | NO (EXCLUDE_DATABASE_DATA) | **SAFE_ARCHIVE** | Duplicate copy of main SQLite DB | Same metadata | Same doc |
| `upload/heavix-postgres-migration-changes.zip` | 206.4KB | NO (HOLD_MIGRATION_ARCHIVE) | **SAFE_ARCHIVE** | Migration patch archive (206KB) — never extracted | Manifest: archive name, size (206.4KB), file listing (via `unzip -l`), provenance ("postgres migration changes patch — prepared during SQLite→PostgreSQL cutover planning") | `docs/legacy-parity/safe-archive/patch-archives-inventory.md` |
| `upload/workspace-d08ba835-4223-4b4a-9627-838c96185efa (1).tar` | (large) | NO (EXCLUDE_WORKSPACE_ARTIFACT) | **SAFE_ARCHIVE** | Workspace dump TAR (large size not recorded) | Manifest: filename, UUID (`d08ba835-4223-4b4a-9627-838c96185efa`), tar listing (top-level entries only via `tar -tf` — no content extraction), provenance ("workspace snapshot from dev session") | `docs/legacy-parity/safe-archive/workspace-artifacts-inventory.md` |

**Feature area summary:** 24 sensitive / binary / unverified files — 6 PRESERVE_AS_REFERENCE (duplicate canonical-doc copies in `upload/`) + 18 SAFE_ARCHIVE (1 secret + 8 SQLite DBs + 5 unverified JPGs + 3 patch archives + 1 workspace TAR). None enter Git with active content. All have safe-content documentation + provenance preserved under `docs/legacy-parity/safe-archive/`. Rotation recommendation: `.env` DATABASE_URL is dev-only (no production credential); historical hardcoded admin credential (PR #145 §4 hit #6, in `src/lib/auth.ts` not in `.env`) is already historical-only and not in target — provider-side rotation remains a prudent recommendation per §8.

---

## 4. Adaptation backlog (ADAPT_THEN_INTEGRATE items)

This is the consolidated backlog of all 17 files that need rewrite/adaptation before integration. Each item has a source file (with provenance), target integration point, specific adaptation required, tests needed, and estimated complexity (S/M/L).

### 4.1 Backlog table

| # | Source file | Size | Area | Target integration point | Specific adaptation required | Tests needed | Complexity |
|---|---|---:|---|---|---|---|:---:|
| 1 | `src/lib/ai-gateway-service.ts` | 5.7KB | B | `src/lib/ai/with-gateway-policy.ts` (new) | Rewrite as typed decorator/HOF `withAIGatewayPolicy(taskType, fn)` wrapping `aiAgents.execute()`. Remove `.catch(()=>null)` masking. Type `AIGatewayLog` access. Provide `policyCheck()` + `budgetCheck()` pre-flight, `logResult()` post-flight. | Unit test: policy/budget enforcement; integration test: 1 route wrapped (e.g., `/api/ai-listing-builder`) | **M** |
| 2 | `src/components/listings/PriceIntelligence.tsx` | 6.0KB | C | `src/components/listings/PriceVerdictBadge.tsx` (new) + integration into `PriceEstimateCard.tsx` | Adapt to consume server-fetched verdict (call `compare-engine.computeOutlierScore()` server-side; pass verdict as prop). Replace inline `fetch('/api/ai-price-intelligence')`. | Snapshot test: 3 verdict states (UNDERPRICED/FAIR/OVERPRICED) | **S** |
| 3 | `src/components/compare/ComparePageClient.tsx` | 14.2KB | E | `src/components/compare/CompareInteractions.tsx` (new client island inside existing server-component `src/app/compare/page.tsx`) | Extract interactive bits (selected-id state, search-add, reorder, share-token) as small client island. Replace legacy `/api/compare?ids=` fetch with target's current compare API contract. Pass server-fetched compare data as props. | Snapshot test: URL-state-sync; integration test: add/remove listing | **M** |
| 4 | `src/lib/price-intelligence.ts` | 10.4KB | E | Consolidate into `src/lib/price-engine.ts` (extend, don't parallel) | Replace `db.priceRecord.*` with `db.priceObservation.*`. Verify outlier algorithm matches or improves on target's current `price-engine.ts` outlier logic. If more robust, port as `computeOutlierScore()` in `price-engine.ts`. | Unit test: outlier detection (3 scenarios: below/above/in-range); benchmark vs current impl | **M** |
| 5 | `prisma/migrations/README.md` | 3.6KB | N | `prisma/migrations/README.md` (target currently has none) | Rewrite to reference current `20261025081255_init_postgresql_baseline/migration.sql` as active baseline. Preserve legacy SQLite cutover narrative as "Historical context" section. Update `bunx prisma migrate diff` example to PostgreSQL. Keep rules (production PostgreSQL, source-of-truth, no `db push` in prod, no `--accept-data-loss`, archive > delete). | Doc review only (no automated test) | **S** |
| 6 | `scripts/phase5a-audit.ts` | 6.8KB | O | `scripts/audit-phase5-trust-domain.ts` (new) | Remove `@ts-nocheck` (type all `db.*` calls); remove `.catch(() => 0)` masking (let errors propagate as `ERROR` rows); add `storeDb` coverage; parameterize source-tree path; replace `schemaContent.includes("model X {")` with `prismaJsonDatamodel.models.X` reflection. | Vitest fixture: mock schema + mock DB | **M** |
| 7 | `scripts/phase6a-audit.ts` | 4.5KB | O | `scripts/audit-phase6-marketplace.ts` (new) | Same adaptation pattern as #6. | Same | **M** |
| 8 | `scripts/phase7a-audit.ts` | 5.4KB | O | `scripts/audit-phase7-rfq-matching.ts` (new) | Same adaptation pattern as #6. | Same | **M** |
| 9 | `scripts/phase8a-audit.ts` | 4.4KB | O | `scripts/audit-phase8-messaging.ts` (new) | Same adaptation pattern as #6. | Same | **M** |
| 10 | `scripts/phase9a-audit.ts` | 5.1KB | O | `scripts/audit-phase9-orders-deals.ts` (new) | Same adaptation pattern as #6. | Same | **M** |
| 11 | `scripts/phase10a-audit.ts` | 4.2KB | O | `scripts/audit-phase10-reviews-reputation.ts` (new) | Same adaptation pattern as #6. | Same | **M** |
| 12 | `scripts/phase11a-audit.ts` | 3.4KB | O | `scripts/audit-phase11-notifications.ts` (new) | Same adaptation pattern as #6. | Same | **S** |
| 13 | `scripts/security-check.ts` | 4.9KB | O | `scripts/security-coverage-check.ts` (new) | Remove `@ts-nocheck`; recognize `ROUTE_PERMS` middleware pattern as satisfying RBAC (don't flag those routes); keep AI-gateway-bypass detection (flag the 21 SDK-importing routes for `withAIGatewayPolicy()` adaptation); add JSON output mode for CI. | Snapshot test: fixture repo with known-good and known-bad routes | **M** |
| 14 | `scripts/rebuild-taxonomy.ts` | 20.9KB | O | `prisma/seed-taxonomy-canonical.ts` (new) | Verify which categories the target's current `prisma/seed-taxonomy*.ts` already seed; rewrite as idempotent `upsert-by-slug` (re-runnable); add only the categories MISSING from target's current taxonomy; gate behind `--confirm` flag. | Vitest fixture: mock Prisma client; upsert idempotency test | **L** |
| 15 | `scripts/seed-store-comprehensive.ts` | 91.7KB | O | `prisma/store/seed-comprehensive.ts` (new) | Verify target's current `storeDb` contract matches script expectations; rewrite as idempotent `upsert-by-sku` for parts (re-runnable); gate behind `--confirm` flag; split into 4 sector-specific sub-scripts for granular control. | Vitest fixture: mock storeDb; upsert idempotency test | **L** |
| 16 | `scripts/make-logos-dark.cjs` | 2.5KB | O | `scripts/image-transform-logo-dark.ts` (new) | Parameterize input/output paths as CLI flags (`--input <path> --output <path>`); extract color-classification logic into reusable function `transformLogoForDarkBg(buffer): buffer`; convert from `.cjs` to TypeScript. | Vitest fixture: known input PNG → expected output PNG (pixel-diff assertion) | **M** |
| 17 | `scripts/process-logos.cjs` | 2.7KB | O | `scripts/image-transform-logo-transparent.ts` (new) | Same pattern as #16; extract white-to-transparent logic into `transformLogoTransparent(buffer): buffer`; convert to TypeScript. | Vitest fixture: known input → expected output | **S** |

### 4.2 Backlog summary

- **17 ADAPT_THEN_INTEGRATE items total** across 5 feature areas (B: 1, C: 1, E: 2, N: 1, O: 12)
- **Complexity breakdown:** S × 4 (items #2, #5, #12, #17) + M × 10 (items #1, #3, #4, #6–#11, #13, #16) + L × 2 (items #14, #15)
- **Estimated total effort:** ~4 S + ~10 M + ~2 L ≈ 16 PR-equivalents (one PR per item, except the 7 phase-audit scripts which can be grouped into 2–3 PRs given shared adaptation pattern)

### 4.3 Adaptation principles

- **Provenance preserved** — every adapted file's source legacy path is recorded in the new file's header (`// Adapted from legacy: src/lib/ai-gateway-service.ts @ 217f98e — see docs/legacy-parity/reference/adaptation-backlog/`).
- **Adaptation diff documented** — every adapted file's PR description includes the legacy→new diff (what was removed, what was rewritten, what was preserved).
- **Tests required** — every adapted file gets at least one test (unit or snapshot) before integration.
- **Review required** — every adapted file gets a non-author review (dellk00k under delegation).
- **Phased** — adaptations are sequenced (see §7) to avoid breaking the target; no big-bang integration.

---

## 5. Reference archive plan (PRESERVE_AS_REFERENCE items)

### 5.1 Proposed target structure

```
docs/legacy-parity/
├── reference/                              # 19 PRESERVE_AS_REFERENCE items
│   ├── README.md                           # Index of all reference items
│   ├── infrastructure/
│   │   └── dev-pid-convention.md           # .zscripts/dev.pid convention (M)
│   ├── prisma/
│   │   ├── migrations/
│   │   │   └── 0_init/
│   │   │       └── migration.sql          # Legacy SQLite baseline (N)
│   │   └── store-schema-flat-layout.prisma # Legacy flat layout (N)
│   ├── scripts/
│   │   ├── seed-articles.ts                # Workstation seed (O)
│   │   ├── seed-brands-300.ts             # 300-brand directory (O)
│   │   ├── seed-essential.ts               # Workstation seed (O)
│   │   ├── seed-kill-switch.ts            # Kill-switch pattern (O)
│   │   ├── seed-plans.ts                  # Plan seed (O)
│   │   ├── clear-logo.ts                  # One-shot setting clear (O)
│   │   ├── orange-ix.cjs                  # HEAVIX-logo pixel isolation (O)
│   │   ├── process-logos-v2.cjs           # Logo pipeline v2 (O)
│   │   └── start-dev.sh                   # Detached-session dev launcher (O)
│   ├── public/
│   │   └── robots.txt                      # Static robots.txt (R)
│   └── upload-canonical-doc-copies.md     # Index of 6 upload/HEAVIX-*.md duplicates (S)
├── safe-archive/                           # 18 SAFE_ARCHIVE items
│   ├── README.md                           # Index of all safe-archive items
│   ├── dotenv-structure.md                # .env redacted structure (S)
│   ├── db-snapshots-inventory.md           # 8 SQLite DB files inventory (S)
│   ├── unverified-uploads-inventory.md     # 5 IMG_*.jpg inventory (S)
│   ├── patch-archives-inventory.md         # 3 patch/migration ZIP inventory (S)
│   └── workspace-artifacts-inventory.md   # 1 workspace TAR inventory (S)
└── adaptation-backlog/                     # 17 ADAPT_THEN_INTEGRATE source files
    ├── README.md                           # Index of all adaptation items
    └── (source files copied here BEFORE adaptation, removed AFTER integration)
```

### 5.2 Reference archive principles

- **Provenance preserved** — each reference file's header documents: source legacy path, source commit (`217f98e`), reason for PRESERVE_AS_REFERENCE classification, and cross-reference to the comprehensive audit (this document).
- **Not in runtime path** — none of these files are placed under `src/`, `prisma/`, `public/`, or `scripts/` active trees.
- **Index file** — `docs/legacy-parity/reference/README.md` lists all 19 reference items with one-line descriptions and links.
- **Safe to commit** — all reference items are plain-text or small static files (largest is `seed-brands-300.ts` at 24.6KB). Total reference-archive size: ~80KB.

### 5.3 Reference items count

| Area | Items | Total size |
|---|---:|---:|
| M. Infrastructure & Config | 1 (`.zscripts/dev.pid` convention) | ~1KB doc |
| N. Prisma & Database | 2 (SQLite migration + flat-layout schema) | ~54KB |
| O. Scripts | 9 (5 seeds + 3 asset one-offs + 1 startup) | ~50KB |
| R. Static Assets | 1 (static `robots.txt`) | ~160B |
| S. Excluded Files | 6 (upload canonical-doc copies index) | ~1KB doc |
| **Total** | **19** | **~106KB** |

---

## 6. Safe archive plan (SAFE_ARCHIVE items)

### 6.1 Proposed target structure

```
docs/legacy-parity/safe-archive/
├── README.md                                # Index + safety guidelines
├── dotenv-structure.md                      # .env redacted structure
├── db-snapshots-inventory.md                # 8 SQLite DB files (paths + sizes + SHA-256)
├── unverified-uploads-inventory.md          # 5 IMG_*.jpg (paths + sizes + SHA-256 + dimensions)
├── patch-archives-inventory.md             # 3 patch ZIPs (paths + sizes + file listings)
└── workspace-artifacts-inventory.md        # 1 workspace TAR (path + UUID + tar listing)
```

### 6.2 Safe archive principles

- **No active credentials in Git** — the `.env` file's value is NEVER committed. Only the redacted structure (key names + value-shape placeholders) is preserved.
- **No live database data in Git** — the 8 SQLite DB files are NEVER committed. Only metadata (path, size, SHA-256 hash, table-list-from-schema-not-from-DB-content) is preserved.
- **No binary blobs in Git** — the 5 JPGs, 3 ZIPs, 1 TAR are NEVER committed. Only metadata (path, size, SHA-256, dimensions or file-listing) is preserved.
- **Provenance preserved** — each safe-archive entry documents: source path, source archive (which of the 13 ZIPs), source commit (`217f98e`), classification (SECRET / DATABASE_DATA / UNVERIFIED_UPLOAD / PATCH_ARCHIVE / WORKSPACE_ARTIFACT), and rotation recommendation if applicable.
- **SHA-256 hashes** — recorded for every binary artifact to enable future audit verification (a future auditor can confirm a binary file's integrity without inspecting its content).

### 6.3 Safe archive items

| # | File | Size | Classification | What's preserved | Rotation recommendation |
|---:|---|---:|---|---|---|
| 1 | `.env` | 50B | SECRET | Redacted structure: `DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<dbname>?schema=<schema>` (no value); note: dev-only DB URL | **Dev-only credential — no production rotation needed.** If `.env` was ever deployed to a reachable environment, rotate the dev DB password. |
| 2 | `db/backups/custom-20260921-023810.db` | 2.4MB | DATABASE_DATA | Path + size + SHA-256 + snapshot timestamp | None (dev snapshot) |
| 3 | `db/backups/custom-20260921-024013.db` | 2.4MB | DATABASE_DATA | Same | None |
| 4 | `db/backups/custom-20260921-025202.db` | 2.4MB | DATABASE_DATA | Same | None |
| 5 | `db/custom.db` | 2.5MB | DATABASE_DATA | Path + size + SHA-256 + table list (from `schema.prisma`, not from .db) | None |
| 6 | `db/custom.db.before-restore` | 2.4MB | DATABASE_DATA | Same + "pre-restore snapshot" note | None |
| 7 | `db/store.db` | 336.0KB | DATABASE_DATA | Path + size + SHA-256 + table list (from `store-schema.prisma`) | None |
| 8 | `upload/HEAVIX-EXECUTABLE-HARDENING-PATCH-V1.0.zip` | 9.4KB | PATCH_ARCHIVE | Path + size + SHA-256 + `unzip -l` file listing + provenance | None |
| 9 | `upload/HEAVIX-PRICE-COMPARISON-DOCUMENTS-V1.0.zip` | 4.7KB | PATCH_ARCHIVE | Same | None |
| 10 | `upload/IMG_20260921_134636_188.jpg` | 46.1KB | UNVERIFIED_UPLOAD | Path + size + SHA-256 + dimensions (via `sharp metadata`) + provenance | None |
| 11 | `upload/IMG_20260921_134636_634.jpg` | 33.5KB | UNVERIFIED_UPLOAD | Same | None |
| 12 | `upload/IMG_20260921_134636_663.jpg` | 24.5KB | UNVERIFIED_UPLOAD | Same | None |
| 13 | `upload/IMG_20260921_134636_703.jpg` | 23.3KB | UNVERIFIED_UPLOAD | Same | None |
| 14 | `upload/IMG_20260921_134636_839.jpg` | 12.4KB | UNVERIFIED_UPLOAD | Same | None |
| 15 | `upload/custom-20260921-024013.db` | 2.4MB | DATABASE_DATA | Path + size + SHA-256 + cross-reference to `db/backups/custom-20260921-024013.db` | None |
| 16 | `upload/custom-20260921-025202.db` | 2.4MB | DATABASE_DATA | Same | None |
| 17 | `upload/heavix-postgres-migration-changes.zip` | 206.4KB | MIGRATION_ARCHIVE | Path + size + SHA-256 + `unzip -l` file listing + provenance | None |
| 18 | `upload/workspace-d08ba835-4223-4b4a-9627-838c96185efa (1).tar` | (large) | WORKSPACE_ARTIFACT | Path + UUID + `tar -tf` top-level listing (no content extraction) + provenance | None |

### 6.4 Cross-reference to historical hardcoded admin credential

The historical hardcoded admin credential (`src/lib/auth.ts:32-35` in the legacy repo, PR #145 §4 hit #6) is **NOT in the `.env`** — it was a hardcoded fallback constant in the source code. The target's `src/lib/auth.ts` (verified live at `833bec6`) has removed this pattern entirely. This safe-archive plan does not introduce the credential; it only documents the `.env`'s structure (which contains a `DATABASE_URL` for the dev DB, not the admin credential).

Per PR #145 §4.1.1: "If the flagged credential was ever used in any environment that might have been reachable, provider-side rotation and access-log review remain a prudent recommendation — but this audit cannot authorize or perform that rotation, and no secret value is recorded here." That recommendation stands as an open item (see §8).

---

## 7. Phased integration plan

This plan sequences the 17 ADAPT_THEN_INTEGRATE items + the 19 PRESERVE_AS_REFERENCE + 18 SAFE_ARCHIVE documentation into PRs. Each phase is a single PR.

### 7.1 Phase 0 — Documentation setup (docs-only, low risk)

**Single PR.** Creates the directory structure under `docs/legacy-parity/reference/`, `docs/legacy-parity/safe-archive/`, and `docs/legacy-parity/adaptation-backlog/`. Adds 3 `README.md` index files. No content copied yet.

**Risk:** None (directory creation + index files only).
**Tests:** None (docs-only).
**Review:** Required (non-author).

### 7.2 Phase 1 — Reference archive population (docs-only, low risk)

**Single PR.** Populates `docs/legacy-parity/reference/` with the 19 PRESERVE_AS_REFERENCE items. Each file is plain-text (largest ~25KB). Adds provenance headers.

**Risk:** None (docs-only, no code execution path).
**Tests:** None (docs-only).
**Review:** Required (non-author).

### 7.3 Phase 2 — Safe archive population (docs-only, low risk)

**Single PR.** Populates `docs/legacy-parity/safe-archive/` with the 5 inventory files covering all 18 SAFE_ARCHIVE items. SHA-256 hashes computed from the extracted archives (read-only — no binary committed). Dimensions extracted via `sharp metadata` (read-only — no image bytes committed). ZIP/TAR listings extracted via `unzip -l` / `tar -tf` (path listings only — no content committed).

**Risk:** None (docs-only, no binary committed).
**Tests:** None (docs-only).
**Review:** Required (non-author).

### 7.4 Phase 3 — Adaptation backlog population (docs-only, low risk)

**Single PR.** Populates `docs/legacy-parity/adaptation-backlog/` with the 17 ADAPT_THEN_INTEGRATE source files (legacy versions, BEFORE adaptation). Adds a `README.md` index linking each source file to its target integration point + adaptation spec (from §4.1).

**Risk:** None (docs-only — legacy source files are committed as historical reference, not as active code; they live under `docs/` not under `src/`).
**Tests:** None (docs-only).
**Review:** Required (non-author).

### 7.5 Phase 4 — Quick wins (S-complexity adaptations, 4 items)

**1 PR per item** (4 PRs total). Each PR adapts + integrates one S-complexity item from §4.1:
- Phase 4a: `prisma/migrations/README.md` adaptation (item #5)
- Phase 4b: `PriceVerdictBadge.tsx` adaptation (item #2)
- Phase 4c: `audit-phase11-notifications.ts` adaptation (item #12)
- Phase 4d: `image-transform-logo-transparent.ts` adaptation (item #17)

**Risk:** Low (each is a small, well-scoped change with tests).
**Tests:** Required (per §4.1 test specs).
**Review:** Required (non-author).

### 7.6 Phase 5 — AI gateway enforcement (item #1, M-complexity)

**Single PR.** Adapts `src/lib/ai-gateway-service.ts` → `src/lib/ai/with-gateway-policy.ts`. Wraps one route (`/api/ai-listing-builder`) as a proof-of-concept integration.

**Risk:** Medium (touches AI gateway enforcement; affects 1 route's behavior).
**Tests:** Unit test (policy/budget enforcement) + integration test (1 route wrapped).
**Review:** Required (non-author).

### 7.7 Phase 6 — Phase-audit script modernization (items #6–#13, M-complexity × 8)

**2–3 PRs** (group the 7 phase audits + security-check into 2–3 PRs given shared adaptation pattern). Each PR adapts 3–4 phase-audit scripts.

**Risk:** Low (dev-time scripts, no runtime impact).
**Tests:** Required (vitest fixtures per §4.1).
**Review:** Required (non-author).

### 7.8 Phase 7 — Compare interactivity + price-intelligence consolidation (items #3, #4, M-complexity × 2)

**2 PRs.** Phase 7a: `CompareInteractions.tsx` client-island adaptation. Phase 7b: `price-intelligence.ts` consolidation into `price-engine.ts`.

**Risk:** Medium (touches public compare page + price-engine library).
**Tests:** Required (snapshot + integration per §4.1).
**Review:** Required (non-author).

### 7.9 Phase 8 — Image-transform utilities (items #16, M-complexity × 1)

**Single PR.** Adapts `make-logos-dark.cjs` → `scripts/image-transform-logo-dark.ts`.

**Risk:** Low (dev-time script).
**Tests:** Required (vitest pixel-diff fixture).
**Review:** Required (non-author).

### 7.10 Phase 9 — Large taxonomy + store seed adaptations (items #14, #15, L-complexity × 2)

**2 PRs.** Phase 9a: `rebuild-taxonomy.ts` → `prisma/seed-taxonomy-canonical.ts`. Phase 9b: `seed-store-comprehensive.ts` → `prisma/store/seed-comprehensive.ts` (split into 4 sector sub-scripts).

**Risk:** Medium-High (touches seed scripts that mutate data; MUST be gated behind `--confirm` flag and run only in dev).
**Tests:** Required (vitest mock-Prisma fixtures + idempotency tests).
**Review:** Required (non-author).
**Operational constraint:** No seed execution in production. The adapted scripts are committed for dev/test use only; production seeding requires separate authorization.

### 7.11 Phase summary

| Phase | Items | PRs | Risk | Tests |
|---|---:|---:|---|---|
| 0: Doc structure setup | 0 | 1 | None | None |
| 1: Reference archive | 19 PRESERVE | 1 | None | None |
| 2: Safe archive | 18 SAFE_ARCHIVE | 1 | None | None |
| 3: Adaptation backlog | 17 ADAPT (source) | 1 | None | None |
| 4: Quick wins (S) | 4 | 4 | Low | Required |
| 5: AI gateway enforcement | 1 | 1 | Medium | Required |
| 6: Phase-audit modernization | 8 | 2–3 | Low | Required |
| 7: Compare + price intelligence | 2 | 2 | Medium | Required |
| 8: Image-transform utilities | 1 | 1 | Low | Required |
| 9: Large taxonomy + store seed | 2 | 2 | Medium-High | Required |
| **Total** | **17 ADAPT + 19 PRESERVE + 18 SAFE_ARCHIVE** | **15–16** | | |

---

## 8. Safety boundaries

### 8.1 Hard constraints (all in effect)

- ✅ **No active credentials enter Git** — the `.env`'s `DATABASE_URL` value is never committed. Only the redacted structure (key names + value-shape placeholders) is preserved in `docs/legacy-parity/safe-archive/dotenv-structure.md`.
- ✅ **No live database data enters Git** — the 8 SQLite DB files are never committed. Only metadata (path, size, SHA-256, table-list-from-schema) is preserved in `docs/legacy-parity/safe-archive/db-snapshots-inventory.md`.
- ✅ **No binary blobs enter Git** — the 5 JPGs, 3 ZIPs, 1 TAR are never committed. Only metadata (path, size, SHA-256, dimensions, file-listings) is preserved.
- ✅ **Each adaptation PR has provenance + tests + review** — per §4.3 adaptation principles.
- ✅ **No blind copy** — every integration is justified by a specific adaptation spec (§4.1).
- ✅ **No production deployment** — operational restriction (per STEP 16.31–16.73 governance).
- ✅ **No production DB mutations** — operational restriction.
- ✅ **No backfill, no worker activation** — operational restriction.
- ✅ **Read-only audit posture maintained** — this document is the only artifact produced by this audit step. No code transferred. No DB changes. No secrets committed. No extractions into target repository.

### 8.2 Open items (out of scope for Issue #144 but tracked)

- **Provider-side credential rotation** for the historical hardcoded admin credential (PR #145 §4 hit #6) — a provider-side action outside this repository's scope; depends on whether the historical credential was ever deployed to a reachable environment.
- **Hosting decision** (Cloudflare compatibility / vinext runtime probe) — a runtime-environment decision pending Senior Director action.
- **`@ts-nocheck` cleanup** for 8 already-present legacy scripts (5 prisma seeds + 2 operational scripts + 1 worklog) — a future cleanup PR, separate from Issue #144, requiring its own test/CI evidence. These 8 paths are INTEGRATE in this document (the target's active version is canonical); the `@ts-nocheck` cleanup is a separate hygiene concern.
- **`public/uploads/*` provenance verification** — the 9 user-uploaded images in `public/uploads/` are tracked in target (INTEGRATE in this document) but their provenance is unverified. A future audit could verify the source of each upload.
- **Middleware admin-cookie legacy path** deprecation — `src/middleware.ts` lines 109–115 contain a legacy admin-cookie passthrough (the comment explicitly flags it for deprecation). The target's `src/lib/auth.ts` removes the admin-cookie concept entirely, but the legacy middleware pattern survives as a transition compatibility layer. A future cleanup PR could remove the admin-cookie path.

### 8.3 Success criteria for this disposition

- ✅ Every one of the 899 legacy paths has exactly one of the 4 dispositions (INTEGRATE / PRESERVE_AS_REFERENCE / ADAPT_THEN_INTEGRATE / SAFE_ARCHIVE).
- ✅ Every ADAPT_THEN_INTEGRATE item has a specific adaptation spec, target integration point, test plan, and complexity estimate (§4).
- ✅ Every PRESERVE_AS_REFERENCE item has a proposed target path under `docs/legacy-parity/reference/` with provenance (§5).
- ✅ Every SAFE_ARCHIVE item has a proposed safe-content documentation path under `docs/legacy-parity/safe-archive/` with redacted structure + SHA-256 hashes + provenance (§6).
- ✅ A phased integration plan sequences all 35 non-INTEGRATE items into ~15–16 PRs over phases 0–9 (§7).
- ✅ No active credentials printed. No DB data inspected. No binary blobs committed.

---

## 9. Cross-references to prior audit documents

This document reframes (does NOT replace) the prior binary-disposition audits. The prior documents remain authoritative for their respective scopes:

| Prior document | Scope | 4-way disposition cross-reference |
|---|---|---|
| `docs/legacy-parity/IMPORT-MANIFEST-2026-10-26.csv` | 54 absent-path binary dispositions | Reframed in §2.2 mapping table |
| `docs/legacy-parity/ISSUE-144-LINE-BY-LINE-AUDIT-2026-10-27.md` (PR #145) | 25 HOLD+REWRITE candidates + 17 credential-pattern hits + Prisma model-level deltas | Each of the 25 candidates reframed in §3 (per-area tables) + §4 (adaptation backlog) |
| `docs/legacy-parity/ISSUE-144-PRISMA-FIELD-PARITY-2026-10-27.md` (PR #146) | Field-level deltas for 8 overlapping Prisma models | Cross-referenced in §3.N |
| `docs/legacy-parity/PRISMA-MIGRATION-CLIENT-COMPATIBILITY-AUDIT-2026-10-27.md` (PR #151) | Migration-history comparison + per-model disposition matrix + generated-client compatibility | Cross-referenced in §3.N |
| `docs/legacy-parity/POST-MERGE-PROVENANCE-REVIEW-2026-10-27.md` (PR #150) | Post-merge provenance run evidence | Confirms target baseline `833bec6` |
| `docs/legacy-parity/ISSUE-144-PROVENANCE-RESULTS-2026-10-27.md` (PR #148) | Grain-aware mismatch metrics | Confirms inventory counts |
| `docs/legacy-parity/COMPREHENSIVE-LEGACY-FILE-AUDIT-2026-10-27.md` (PR #152) | 899-file inventory organized into 19 feature areas | Source for this document's per-area disposition tables |
| `docs/legacy-parity/API-SECURITY-RECONCILIATION.md` | Earlier capability/API mapping | Cross-referenced in §3.A, §3.B |
| `docs/legacy-parity/CANDIDATE-DECISIONS-2026-10-26.md` | Earlier per-candidate decisions | Cross-referenced in §3 |
| `docs/legacy-parity/IMPORT-DECISION-SUMMARY-2026-10-26.md` | Earlier summary | Cross-referenced in §1.4 |
| `docs/legacy-parity/LEGACY-ARCHIVE-REFRESH-2026-10-27.md` | Earlier archive refresh | Cross-referenced in §6 |
| `docs/legacy-parity/UNIQUE-NEW-PATHS-DECISIONS-2026-10-26.md` | Earlier new-paths decisions | Cross-referenced in §3 |

---

## 10. Conclusion

### 10.1 What this document delivers

- **A disposition for every one of the 899 legacy paths** under the Senior Director's value-maximizing 4-way framework (INTEGRATE / PRESERVE_AS_REFERENCE / ADAPT_THEN_INTEGRATE / SAFE_ARCHIVE).
- **A specific adaptation spec** for each of the 17 ADAPT_THEN_INTEGRATE items (with target integration point, exact adaptation required, test plan, complexity estimate).
- **A reference archive plan** for the 19 PRESERVE_AS_REFERENCE items (with proposed target paths under `docs/legacy-parity/reference/`).
- **A safe archive plan** for the 18 SAFE_ARCHIVE items (with redacted structure + SHA-256 hashes + provenance under `docs/legacy-parity/safe-archive/`).
- **A phased integration plan** sequencing all 35 non-INTEGRATE items into ~15–16 PRs over phases 0–9.

### 10.2 Headline interpretation under the Senior Director's framework

The Senior Director's directive — "all files in repo z are valuable and must be used (after adaptation if incompatible)" — is satisfied as follows:

- **845 files (93.9%)** are already integrated into the target as the canonical active version. Their value is realized through the target's current codebase.
- **17 files (1.9%)** have valuable capabilities blocked by incompatibility. Their value is realized through the adaptation backlog (§4) — each gets a concrete rewrite spec + integration point + test plan.
- **19 files (2.1%)** have historical / pattern-source value. Their value is realized through the reference archive (§5) — provenance preserved, accessible for future decision-making.
- **18 files (2.0%)** contain secrets, DB data, or binary content. Their value is realized through the safe archive (§6) — safe content (structure, schema, manifest, hashes) preserved without active credentials or binary blobs entering Git.

**No file is deleted without a trace.** Every legacy path either (a) survives as the target's active version, (b) is adapted then integrated, (c) is preserved as historical reference, or (d) has its safe content + provenance preserved in a documented archive.

### 10.3 Supersession note

This document SUPERSEDES the "0 transfer candidates" conclusion of PR #145 §7 / PR #152 §5.1. The prior conclusion was correct under the binary REJECT/HOLD/EXCLUDE framework (no file could be transferred as-is). Under the Senior Director's new 4-way framework, the answer is richer:

- **0 INTEGRATE-as-is** for absent paths (no blind copy) — same as prior conclusion.
- **17 ADAPT_THEN_INTEGRATE** — the prior "REWRITE_BEFORE_IMPORT" + "REJECT" categories now have explicit integration intent (not just "rewrite someday").
- **19 PRESERVE_AS_REFERENCE** — the prior "HOLD_*" + "REJECT_DUPLICATE_*" categories now have explicit reference-archive intent (not just "set aside indefinitely").
- **18 SAFE_ARCHIVE** — the prior "EXCLUDE_*" categories now have explicit safe-content-preservation intent (not just "ignore").

### 10.4 Final accounting

| Metric | Value |
|---|---:|
| Total legacy paths dispositioned | **899** |
| INTEGRATE (already canonical in target) | **845** (93.9%) |
| ADAPT_THEN_INTEGRATE (capability gap → rewrite → integrate) | **17** (1.9%) |
| PRESERVE_AS_REFERENCE (historical / pattern-source) | **19** (2.1%) |
| SAFE_ARCHIVE (secrets / DB data / binary → redacted manifest) | **18** (2.0%) |
| Files with no disposition | **0** |
| Secret values printed | **0** |
| Database files inspected | **0** |
| Patch archives extracted | **0** |
| Code transferred to target | **0** |
| Production database mutations | **0** |
| Proposed PRs (phases 0–9) | **~15–16** |
| Documents produced by this audit step | **1** (this file) — docs-only |

---

**End of disposition document.**
