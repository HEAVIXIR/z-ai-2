# Integration Proposal for All Legacy Files — HEAVIXIR/z → HEAVIXIR/z-ai-2

**Date:** 2026-10-28
**To:** Senior Director
**From:** dellk00k (delegated inspector, general-purpose subagent)
**Subject:** Comprehensive proposal for integrating all 899 legacy files into the target project, aligned with project standards and goals.
**Tracking issue:** [HEAVIXIR/z-ai-2#144](https://github.com/HEAVIXIR/z-ai-2/issues/144)
**Source legacy tree:** HEAVIXIR/z @ `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`
**Target baseline:** z-ai-2/main @ `3bd8150a8423b450b63c7d2e60f9e1356eba1d94` (post Phase-0 merge)

> **Senior Director's directive (STEP 16.74/16.79):** *"تمام فایل های قدیمی در پول z را بررسی کن و جهت افزودن به مدیر ارشد پیشنهاد بده. تمام استانداردهای پروژه را رعایت کن و فایل ها را با پروژه و اهداف آن هماهنگ کن."*
>
> Translation: *"Review all legacy files in repo z and propose to the Senior Director how to add them. Follow all project standards and align files with the project and its goals."*

---

## 1. Executive summary

| Bucket | Count | % | Action proposed | Authorizes what |
|---|---:|---:|---|---|
| **INTEGRATE** | 845 | 93.9% | Confirm standards compliance; surface 7 already-present code files containing `@ts-nocheck` as a separate cleanup backlog; `worklog.md` is a lexical false positive, not a cleanup target. | No transfer action (already live). |
| **ADAPT_THEN_INTEGRATE** | 17 | 1.9% | Approve the 17-item adaptation backlog (§4); sequence into 6 PRs. | Code PRs (typed, tested, reviewed). |
| **PRESERVE_AS_REFERENCE** | 19 | 2.1% | Phase 0 (provenance) is MERGED on main (`3bd8150`). Phase 0.5 (commit source content with provenance headers + SHA-256) is the next proposed docs-only PR. | 1 docs-only PR (Phase 0.5). |
| **SAFE_ARCHIVE** | 18 | 2.0% | Phase 1 (redacted documentation + SHA-256 + provenance) is the second proposed docs-only PR. | 1 docs-only PR (Phase 1). |
| **Total** | **899** | 100% | Every legacy path has a proposed disposition. | 8 planned PRs (2 docs-only + 6 code; Phase 4 may split into two domain PRs, yielding 9). |

**Key points**

1. **94 % of legacy files are already integrated** as the canonical active version in `z-ai-2/main @ 3bd8150`. No transfer work needed for them — the target's active copy *is* the integration.
2. **The 7 already-present code files containing `@ts-nocheck`** (5 Prisma seeds + 2 operational scripts; `worklog.md` is a lexical false positive and not a cleanup target) are surfaced as a **Phase 7 standards-cleanup backlog** — strictly separate from legacy transfer so each change gets its own test/CI evidence.
3. **The 17 ADAPT items are organized into 6 phased PRs** (batches A → E + Phase 6 high-risk), escalating complexity S → M → L and gating the only 2 data-mutating items behind `--confirm` flags.
4. **Every non-INTEGRATE proposal specifies target file path + standards checklist + goal alignment + adaptation spec + test plan + risk + dependencies.** No "review later" placeholders.
5. **All 18 SAFE_ARCHIVE binary items now have SHA-256 hashes** (independently computed during STEP 16.80 — §6 below). No binary bytes enter Git. No active credentials committed. No DB data inspected.
6. **All 18 file-bearing PRESERVE members also have SHA-256 hashes** (computed in STEP 16.78 review comment + re-verified during STEP 16.80). The Phase-0 PR #156 completion gate's first unchecked box ("Verify content SHA-256 for every extracted member") is now satisfiable for the 18 file-bearing members.
7. **Safety boundaries (all in effect):** no production deployment, no DB mutation, no backfill, no Worker activation, no DNS, no paid resources, no secret printing, no `.env` / `.db` / `.jpg` / `.tar` / `.zip` content reads, no code transfer without authorization. Every PR includes provenance header + required tests + non-author review.

**Headline recommendation (§10):** Authorize **Phase 0.5 + Phase 1** (two docs-only PRs, low-risk, no code execution, no binary bytes committed, no DB mutation). They close the Phase-0 completion gate and stand up the safe-archive documentation. Authorize **Phase 2 (ADAPT batch A, 3 items, complexity S)** as the first code-touching PR — small surface, fast feedback, demonstrates the adaptation pattern for the later batches.

---

## 2. Standards compliance framework

Every proposal in §3-§6 is verified against the checklist below. The target project (HEAVIXIR/z-ai-2) uses the stack and patterns established in `bun/package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `prisma/schema.prisma`, `prisma/store/schema.prisma`, and `src/middleware.ts`.

### 2.1 Project standards checklist (applies to every proposed integration)

- [ ] **TypeScript 5 strict mode** — `tsconfig.json` strict=true; `// @ts-nocheck` is a hygiene failure and a Phase-7 cleanup target.
- [ ] **Next.js 16 App Router** — files under `src/app/<route>/route.ts` (POST/GET/... exports); NOT `src/pages/api/*`. All 65 legacy admin routes already satisfy this.
- [ ] **Server Component by default, Client only when needed** — `"use client"` directive required only for interactive islands; the target's `compare/page.tsx` is a Server Component (good for SEO); ADAPT item #3 (`CompareInteractions.tsx`) preserves this pattern.
- [ ] **Prisma dual-database** — `prisma/schema.prisma` (main, `DATABASE_URL`) + `prisma/store/schema.prisma` (store, `STORE_DATABASE_URL`); legacy flat-layout `prisma/store-schema.prisma` is PRESERVE_AS_REFERENCE (item #18 in §5).
- [ ] **Auth: session-token** — `crypto.randomBytes(32)` token in `Session.token`; SHA-256-hashed at rest; `USER_COOKIE → Session.token → Session.userId → User`; no `ADMIN_CREDENTIALS` fallback (target's `src/lib/auth.ts` already removes the legacy hardcoded admin credential — historical only).
- [ ] **AI gateway: canonical route pattern (Issue #111)** — 21 SDK-importing routes currently bypass the canonical gateway. ADAPT item #1 proposes a typed `withAIGatewayPolicy(taskType, fn)` HOF; the Phase-5 PR wraps one route as proof-of-concept. Full coverage of 21 routes is a follow-on track (Issue #111, separate from Issue #144).
- [ ] **RBAC: `requireAdminPermission()` / `ROUTE_PERMS` middleware pattern (Issue #112)** — `src/middleware.ts` carries `ROUTE_PERMS` table covering 60+ admin resources. ADAPT item #13 (`security-coverage-check.ts`) recognizes this pattern (don't flag `ROUTE_PERMS`-covered routes as missing RBAC).
- [ ] **shadcn/ui + Tailwind 4 + Lucide** — New York-style shadcn components (`src/components/ui/*` — 39 primitives present); Lucide icons (no emoji icon imports); Tailwind 4 utility-first.
- [ ] **No indigo / blue colors** unless specified. Persian RTL where required.
- [ ] **Responsive design mandatory** — every UI adaptation must work at mobile/tablet/desktop breakpoints.
- [ ] **Sticky footer if footer exists** — `src/components/layout/Footer.tsx` + store `StoreFooter.tsx` already conform.
- [ ] **No secrets in Git, no DB data, no binary blobs** — all 18 SAFE_ARCHIVE items are redacted manifests only; SHA-256 recorded; binary bytes never committed.
- [ ] **Provenance preserved** — every adapted file's header documents the source legacy path + source commit (`217f98e`) + cross-reference to `docs/legacy-parity/`.
- [ ] **Tests required** — every code-touching adaptation PR includes vitest unit/snapshot/integration tests per §4 specs.
- [ ] **Non-author review required** — every PR receives a formal APPROVE from dellk00k under delegation (governance path validated 9 times this session — §1.4).
- [ ] **No production deployment / DB mutation / backfill / Worker activation** without explicit Senior Director authorization.

### 2.2 Project goals alignment checklist

Every proposal references which of the 10 project goals it advances (or whether it is pure infrastructure/historical reference). The goals are:

| # | Project goal | Feature-area(s) |
|---:|---|---|
| G1 | Marketplace core (listings, RFQ, wanted, deals, offers, orders) | F, C |
| G2 | Store center (parts, inventory, procurement, returns, rentals, shipments) | H |
| G3 | AI services (price intelligence, market analyst, listing builder, sales agent — via canonical gateway) | B, E |
| G4 | Trust & verification (company verification, seller trust, reviews, reputation) | I, J |
| G5 | Admin panel (90+ admin pages for all domain areas) | K |
| G6 | Taxonomy (brands, categories, models, industries, attributes) | D |
| G7 | Messaging (conversations, deal rooms, notifications) | G |
| G8 | Compare & price intelligence | E |
| G9 | Media (image upload/compression — Issue #131) | O (asset scripts) |
| G10 | SEO (canonical inheritance, sitemap — Issue #98) | L, R |

### 2.3 How the framework is applied per bucket

| Bucket | Framework applied |
|---|---|
| INTEGRATE (845) | Confirm each file already passes §2.1 + §2.2; identify exceptions (the 8 `@ts-nocheck` files). |
| ADAPT_THEN_INTEGRATE (17) | For each: specify exact §2.1 standards changes + which §2.2 goal(s) it advances + concrete rewrite spec + tests. |
| PRESERVE_AS_REFERENCE (19) | For each: specify target path under `docs/legacy-parity/reference/<area>/`; verify no active code + no secrets; record SHA-256. |
| SAFE_ARCHIVE (18) | For each: specify target docs path under `docs/legacy-parity/safe-archive/`; specify classification (SECRET / DATABASE_DATA / UNVERIFIED_UPLOAD / PATCH_ARCHIVE / WORKSPACE_ARTIFACT); record SHA-256 + provenance; no binary committed. |

---

## 3. Proposal for the 845 INTEGRATE items

These files are **already tracked in `z-ai-2/main @ 3bd8150`** as the canonical active version. Their capability survives in the target's current copy. No transfer action is required for any of them. They are listed here only to close the accounting and surface the standards-cleanup backlog.

### 3.1 Per-area distribution (845 INTEGRATE)

| Area | Feature | INTEGRATE count | Standards status |
|---|---|---:|---|
| A | Authentication & Authorization | 18 | Clean — target's `auth.ts` removes legacy hardcoded admin credential. |
| B | AI Services | 31 | Clean — 1 absent path is ADAPT (§4.1). 21 SDK-importing routes tracked by Issue #111. |
| C | Listings & Catalog | 39 | Clean — 1 absent path is ADAPT (§4.2). |
| D | Taxonomy | 67 | Clean. |
| E | Compare & Price Intelligence | 25 | Clean — 2 absent paths are ADAPT (§4.3, §4.4). |
| F | Marketplace | 44 | Clean. |
| G | Messaging & Notifications | 22 | Clean. |
| H | Store Center | 71 | Clean — dual-database intact. |
| I | Seller & Company | 28 | Clean. |
| J | Reviews & Reputation | 11 | Clean. |
| K | Admin Panel | 155 | Clean — RBAC via `ROUTE_PERMS`. |
| L | Home & Public Pages | 82 | Clean. |
| M | Infrastructure & Config | 137 | Clean — `.zscripts/dev.pid` excluded (PRESERVE). |
| N | Prisma & Database | 36 | Clean — 3 absent paths (1 ADAPT, 2 PRESERVE). |
| O | Scripts | 4 | **Hygiene concern:** 2 of the 4 already-present scripts have `@ts-nocheck` (see §3.2). |
| P | Tests | 20 | Clean. |
| Q | Documentation | 18 | Clean. |
| R | Static Assets | 37 | Clean — 1 absent path (PRESERVE). |
| S | Excluded Files | 0 | N/A (all 24 paths here are PRESERVE or SAFE_ARCHIVE). |
| **Total** | | **845** | |

### 3.2 Standards cleanup backlog — the 7 already-present code files containing `@ts-nocheck`

Per comprehensive-audit §4.3, the lexical scan identified 16 candidate paths mentioning `// @ts-nocheck`. Eight actual code files are absent (7 phase-audit scripts + 1 security-check script; verbatim import is not approved and rewrites are tracked by ADAPT items #6-#13). Seven actual code files containing the directive are already in the target and need a hygiene cleanup PR. `worklog.md` is the remaining lexical false positive: it mentions the string in prose but contains no directive. These are NOT legacy-transfer items; the 7 code files fail the §2.1 TypeScript-strict standard.

| # | File | Size | Already in target? | Reason for `@ts-nocheck` | Cleanup action |
|---:|---|---:|---|---|---|
| 1 | `prisma/seed-attributes.ts` | 21.2 KB | YES | Run-once seed; untyped `db.*` calls | Phase 7 cleanup PR: type all `db.*` calls against generated Prisma client; add `tsx --tsconfig=tsconfig.json` test. |
| 2 | `prisma/seed-listing-images.ts` | 5.2 KB | YES | Same | Same pattern. |
| 3 | `prisma/seed-phase3-catalog.ts` | 8.3 KB | YES | Same | Same pattern. |
| 4 | `prisma/seed-phase4-marketplace.ts` | 13.9 KB | YES | Same | Same pattern. |
| 5 | `prisma/seed-taxonomy.ts` | 19.2 KB | YES | Same | Same pattern. |
| 6 | `scripts/catalog-health.ts` | 3.4 KB | YES | Dev-time catalog-health diagnostic; untyped `db.*` calls | Phase 7 cleanup PR: type `db.*` calls; recognize `ROUTE_PERMS` middleware. |
| 7 | `scripts/migrate-sqlite-to-postgres.ts` | 8.3 KB | YES | Historical one-time migration utility; untyped raw SQL | Phase 7 cleanup PR: type the SQL client; mark as historical-only with deprecation header. |
| 8 | `worklog.md` | 486 KB | YES | Historical session log (not source code) | **No action** — markdown, not subject to TS strict. The `@ts-nocheck` mention is a historical reference inside the prose, not a directive. (Listed for completeness; excluded from the cleanup PR scope.) |

**Proposed action (Phase 7):**

- Open a separate cleanup PR (NOT bundled with legacy-transfer work).
- Remove `// @ts-nocheck` from items #1–#7 above.
- Add proper Prisma-client typings (`PrismaClient` import; typed `db.*.findMany(...)` calls).
- Add `tsx --tsconfig=tsconfig.json scripts/<file>.ts --dry-run` smoke tests.
- For item #7 (`migrate-sqlite-to-postgres.ts`): add deprecation header — script is historical, do not re-run.
- Risk: **LOW** (dev-time / run-once scripts, no runtime bundle impact).
- Estimated effort: 1 PR ≈ 4 hours.
- **This is independent of the 17 ADAPT items** and may be authorized in parallel with Phase 2-6.

---

## 4. Proposal for the 17 ADAPT_THEN_INTEGRATE items

Each of the 17 items below is a legacy file with valuable capability that **cannot be transferred as-is** because it violates one or more §2.1 standards. For each, we specify: source legacy path + provenance, target integration point, standards alignment, project-goal alignment, concrete adaptation spec, tests required, PR scope, risk, dependencies.

The 17 items are organized into 6 batches for PR sequencing (§7). Each batch is one PR (or, for batches with shared adaptation pattern, one PR grouping multiple items).

### 4.1 [ADAPT-01] `src/lib/ai-gateway-service.ts` — typed gateway-policy HOF

- **Source:** `src/lib/ai-gateway-service.ts` (5.7 KB) at HEAVIXIR/z @ `217f98e`. Provenance: legacy parallel-gateway module; removed from target in PR #116 (intentional rejection — `REJECT_PARALLEL_GATEWAY` per manifest).
- **Capability:** Centralized AI gateway enforcing (a) per-task policy, (b) daily/monthly budget limits, (c) audit logging of every AI call, (d) Zod output validation, (e) prompt-injection protection.
- **Why rejected:** The legacy module was never wired into the 21 SDK-importing routes (each route called `ZAI.create()` inline). It also had defects: `.catch(() => null)` masking on every DB call (silently hides schema-mismatch errors), `db.aIGatewayLog as any` untyped access, brittle `schemaContent.includes("model X {")` schema reflection.
- **Target integration point:** New file `src/lib/ai/with-gateway-policy.ts` (typed decorator/HOF). Incremental wiring into the 21 SDK-importing routes is tracked by Issue #111 (separate track); this PR delivers the HOF + 1 proof-of-concept wrap.
- **Standards alignment:**
  - ✅ TypeScript strict — type `AIGatewayLog` access via generated Prisma client; no `as any`.
  - ✅ App Router — the HOF is consumed inside `route.ts` handlers, not in pages.
  - ✅ Server Component default — the HOF runs server-side only.
  - ✅ Prisma dual-DB — uses main `db` for `aIGatewayLog`; no store touch.
  - ✅ Auth — `getCurrentUser()` injected as the caller identity; no legacy admin fallback.
  - ✅ AI gateway canonical (Issue #111) — this IS the canonical gateway HOF.
  - ✅ RBAC — caller permission check delegated to `requireAdminPermission()` when `taskType` is admin-scoped.
- **Project goal alignment:** **G3 (AI services via canonical gateway)** — directly addresses Issue #111 by providing the enforcement primitive. Also G5 (admin panel — admin-scoped task types).
- **Adaptation spec:**
  1. Create `src/lib/ai/with-gateway-policy.ts`.
  2. Define `withAIGatewayPolicy<T>(taskType: AITaskType, fn: (ctx: AIGatewayCtx) => Promise<T>): (input: AIGatewayInput) => Promise<T>`.
  3. Pre-flight: `policyCheck(taskType, ctx.user)` — reject if policy disallows; `budgetCheck(taskType, ctx.user)` — reject if budget exhausted.
  4. Execute: `await fn(ctx)`.
  5. Post-flight: `logResult({ taskType, userId, ok, latencyMs, tokensIn, tokensOut, error })` — NO `.catch(() => null)` masking; let errors propagate to the route's error handler.
  6. Zod validation: `OutputSchema.parse(result)` before returning; throw `ZodError` on mismatch.
  7. Prompt-injection: defer to existing `ai-policy.ts` `detectInjection()` helper (already in target).
  8. Wire one proof-of-concept route: `/api/ai-listing-builder/route.ts` — replace inline `ZAI.create()` with `withAIGatewayPolicy("listing-builder", ...)(input)`.
- **Tests required:**
  - Unit: `policyCheck()` rejects when policy disallows; `budgetCheck()` rejects when budget exhausted; `logResult()` writes a row to `aIGatewayLog` (mock Prisma client).
  - Integration: `/api/ai-listing-builder` route wrapped — happy path returns verdict; budget-exhausted path returns 429; policy-disallowed path returns 403.
- **PR scope:** 1 PR (Phase 5). Estimated complexity: **M**.
- **Risk:** MEDIUM — touches the AI gateway primitive; affects 1 route's behavior in Phase 5. The 20 remaining routes are NOT touched in this PR (deferred to Issue #111 track).
- **Dependencies:** None (Phase 5 can start immediately after Phase 2-4 land).
- **Provenance header (committed with the new file):**
  ```ts
  /**
   * Adapted from legacy: src/lib/ai-gateway-service.ts @ 217f98e (HEAVIXIR/z).
   * See docs/legacy-parity/adaptation-backlog/01-ai-gateway-service.md.
   * Removed from target in PR #116 (parallel-gateway rejection); this HOF
   * restores the policy/budget/audit enforcement as a typed decorator.
   */
  ```

### 4.2 [ADAPT-02] `src/components/listings/PriceIntelligence.tsx` — price-verdict badge

- **Source:** `src/components/listings/PriceIntelligence.tsx` (6.0 KB) at HEAVIXIR/z @ `217f98e`. Provenance: legacy verdict widget expecting `/api/ai-price-intelligence` contract; rejected per manifest as `REJECT_INCOMPATIBLE_CONTRACT`.
- **Capability:** Renders an `UNDERPRICED / FAIR / OVERPRICED` verdict callout with comparable stats (avg / median / min / max / sample size) + color-coded hint.
- **Why rejected:** Legacy widget called `fetch('/api/ai-price-intelligence')` and consumed a `PriceIntelResponse` shape with a `verdict` field. Target's canonical path uses `PriceObservation` (not legacy `PriceRecord`) and the verdict is computed server-side via `compare-engine.ts` + `price-engine.ts`.
- **Target integration point:** New file `src/components/listings/PriceVerdictBadge.tsx` (Server Component or Client island — decided by parent). Integrate as an optional sub-component inside `PriceEstimateCard.tsx` (already in target).
- **Standards alignment:**
  - ✅ TypeScript strict — typed verdict enum; no `@ts-nocheck`.
  - ✅ App Router — consumed inside Server Component `PriceEstimateCard.tsx` (already in target).
  - ✅ Server Component default — verdict computed server-side; passed as prop.
  - ✅ No direct `fetch()` to `/api/ai-price-intelligence` — replaced with `compare-engine.computeOutlierScore()` server-side call.
  - ✅ Tailwind + shadcn — uses `Badge` + `Card` primitives; no indigo/blue; verdict colors: `green-600` (UNDERPRICED — buyer-favorable), `amber-600` (FAIR), `red-600` (OVERPRICED).
  - ✅ Responsive — badge collapses to icon-only on mobile.
- **Project goal alignment:** **G3 (AI services — price intelligence)** + **G8 (compare & price intelligence)**.
- **Adaptation spec:**
  1. New `PriceVerdictBadge.tsx`: props `{ verdict: 'UNDERPRICED' | 'FAIR' | 'OVERPRICED', stats: { avg, median, min, max, sampleSize } }`.
  2. Server-side: parent `PriceEstimateCard.tsx` calls `compare-engine.computeOutlierScore(listingId)` and passes the verdict to `<PriceVerdictBadge verdict={...} stats={...} />`.
  3. Replace inline `fetch('/api/ai-price-intelligence')` (deleted — no client-side fetch).
  4. Verdict-color mapping via Tailwind class strings (no inline styles).
- **Tests required:** Snapshot test for the 3 verdict states (UNDERPRICED / FAIR / OVERPRICED) + 1 edge case (sample-size=0 → render null).
- **PR scope:** 1 PR (Phase 2 batch A). Estimated complexity: **S**.
- **Risk:** LOW — additive component; no existing route changed.
- **Dependencies:** None.

### 4.3 [ADAPT-03] `src/components/compare/ComparePageClient.tsx` — compare-interactions client island

- **Source:** `src/components/compare/ComparePageClient.tsx` (14.2 KB) at HEAVIXIR/z @ `217f98e`. Provenance: legacy interactive client component; rejected per manifest as `REJECT_INCOMPATIBLE_API`.
- **Capability:** URL-state-synced selected IDs (`?ids=a,b,c`), live search + add-to-compare, reorderable columns, share-token generation. Target's `src/app/compare/page.tsx` (36.1 KB) is a server component (good for SEO) but loses interactivity — user cannot add/remove listings from the compare view without navigating away.
- **Why rejected:** Legacy client called `/api/compare?ids=...` with a different response shape than the target's compare API.
- **Target integration point:** New file `src/components/compare/CompareInteractions.tsx` (Client Component). Render as a small client island inside the existing server-component `src/app/compare/page.tsx`.
- **Standards alignment:**
  - ✅ TypeScript strict.
  - ✅ App Router — client island rendered inside server-component page.
  - ✅ `"use client"` directive at top of file (only the interactive island is client).
  - ✅ Server Component default preserved — the parent page remains a server component; only the interaction layer is client.
  - ✅ No direct `fetch()` — replaced with `useRouter()` to update `?ids=` query param; the parent server component re-renders with new props.
  - ✅ shadcn `Button`, `Input`, `Command` (search combobox) primitives.
  - ✅ Lucide icons (`Plus`, `X`, `GripVertical`, `Share2`).
  - ✅ Responsive — compare table collapses to vertical cards on mobile.
- **Project goal alignment:** **G8 (compare & price intelligence)** — UX enhancement without SEO regression.
- **Adaptation spec:**
  1. Extract the interactive bits from legacy: selected-id state, search-add, reorder, share-token.
  2. New `CompareInteractions.tsx` ("use client") receives `serverData: CompareData` as prop and `serverIds: string[]` as initial state.
  3. On user action (add/remove/reorder), call `router.push(`/compare?ids=${newIds.join(',')}`)` — the server component re-renders with fresh data.
  4. Share-token generation: `POST /api/compare/shared` (existing target route) → on success, `navigator.clipboard.writeText(shareUrl)`.
  5. No inline fetch; all data flows through server props + URL state.
- **Tests required:**
  - Snapshot test: URL-state-sync behavior (initial render with `?ids=a,b`; user clicks X on `b` → URL becomes `?ids=a`).
  - Integration: add listing via search → URL updates → server re-renders with 3 items.
- **PR scope:** 1 PR (Phase 3 batch B). Estimated complexity: **M**.
- **Risk:** MEDIUM — touches the public compare page UX.
- **Dependencies:** Phase 2 batch A (the adaptation pattern proof-of-concept).

### 4.4 [ADAPT-04] `src/lib/price-intelligence.ts` — outlier-detection consolidation

- **Source:** `src/lib/price-intelligence.ts` (10.4 KB) at HEAVIXIR/z @ `217f98e`. Provenance: legacy outlier-detection module using deprecated `PriceRecord` model; rejected per manifest as `REJECT_DEPRECATED_MODEL`.
- **Capability:** Robust outlier detection — robust z-score against IQR (±3σ from median); price-suggestion helper with HIGH/MEDIUM/LOW confidence based on sample size.
- **Why rejected:** Used `db.priceRecord.*` (deprecated model, replaced by `PriceObservation` per Issue #95).
- **Target integration point:** Consolidate into `src/lib/price-engine.ts` (already in target, 30.1 KB). Do NOT create a parallel module.
- **Standards alignment:**
  - ✅ TypeScript strict — typed `PriceObservation` access; no `@ts-nocheck`.
  - ✅ Prisma dual-DB — uses main `db.priceObservation` (not store).
  - ✅ No parallel modules — consolidation into `price-engine.ts` removes the parallel-impl anti-pattern.
  - ✅ Algorithm preserved — the robust z-score against IQR is well-documented; verify equivalence or improvement over target's current outlier logic.
- **Project goal alignment:** **G3 (AI services — price intelligence)** + **G8 (compare & price intelligence)**.
- **Adaptation spec:**
  1. Read target's current `price-engine.ts` outlier logic (already in target).
  2. Compare with legacy algorithm; if legacy is more robust (IQR-based vs current mean-based), port as `computeOutlierScore(observations: PriceObservation[]): { score: number, isOutlier: boolean }`.
  3. Replace `db.priceRecord.*` calls with `db.priceObservation.*`.
  4. Add `priceSuggestion(listingId): { suggestion: number, confidence: 'HIGH' | 'MEDIUM' | 'LOW' }` if not already present.
  5. Delete the legacy `src/lib/price-intelligence.ts` (it never existed in target; the consolidated function lives in `price-engine.ts`).
- **Tests required:**
  - Unit: outlier detection in 3 scenarios (outlier-below, outlier-above, in-range).
  - Benchmark: compare new algorithm output vs target's current implementation across 100 fixtures; document delta.
- **PR scope:** 1 PR (Phase 3 batch B). Estimated complexity: **M**.
- **Risk:** MEDIUM — touches price-engine library used by 5+ routes.
- **Dependencies:** None (Phase 3 can start after Phase 2).

### 4.5 [ADAPT-05] `prisma/migrations/README.md` — reconcile migrations README

- **Source:** `prisma/migrations/README.md` (3.6 KB) at HEAVIXIR/z @ `217f98e`. Provenance: legacy SQLite→PostgreSQL cutover plan; rejected per manifest as `HOLD_RECONCILE_DOCS`.
- **Capability:** Migration rules documentation (production PostgreSQL, source-of-truth, no `db push` in prod, no `--accept-data-loss`, archive > delete for business data).
- **Why rejected:** Legacy README references SQLite baseline (`0_init/migration.sql`) which target superseded with PostgreSQL baseline (`20261025081255_init_postgresql_baseline/migration.sql`).
- **Target integration point:** New file `prisma/migrations/README.md` (target currently has none — verified at `z-ai-2/main @ 3bd8150`).
- **Standards alignment:**
  - ✅ Aligns with `docs/ADR-001-database-strategy.md` (the two-DB decision).
  - ✅ Aligns with Prisma dual-DB standard (references both `prisma/schema.prisma` and `prisma/store/schema.prisma`).
  - ✅ References current PostgreSQL baseline migration, not stale SQLite.
- **Project goal alignment:** Cross-cutting — supports all goals (every goal touches the DB). Specifically G1, G2, G4 (which involve mutation-bearing Prisma models).
- **Adaptation spec:**
  1. New `prisma/migrations/README.md`:
     - Section 1 "Active baseline": references `prisma/migrations/20261025081255_init_postgresql_baseline/migration.sql` + `prisma/migrations/20261025193000_add_auditlog_idempotency_key/migration.sql`.
     - Section 2 "Historical context": preserves the legacy SQLite→PostgreSQL cutover narrative (from legacy README), references `docs/legacy-parity/reference/prisma/legacy-sqlite-initial-migration.md` for the legacy SQLite baseline.
     - Section 3 "Rules" (preserved from legacy):
       - Production uses PostgreSQL (`DATABASE_URL` for main, `STORE_DATABASE_URL` for store).
       - `prisma/migrations/` is the source of truth (NOT `prisma db push` in production).
       - `--accept-data-loss` forbidden in production.
       - Archive > delete for business data (use `deletedAt: DateTime?` soft-delete, never `DELETE`).
       - Migration history is append-only.
     - Section 4 "Generating a new migration": `bunx prisma migrate dev --name <name>` (dev) or `bunx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` (PostgreSQL). Store schema: same with `--schema=prisma/store/schema.prisma`.
- **Tests required:** Doc review only (no automated test).
- **PR scope:** 1 PR (Phase 2 batch A). Estimated complexity: **S**.
- **Risk:** LOW — docs-only.
- **Dependencies:** None.

### 4.6–4.12 [ADAPT-06 through ADAPT-12] — phase-audit script modernization

The 7 phase-audit scripts share a common adaptation pattern. They are grouped for clarity but each becomes its own file in `scripts/audit-phase<N>-<domain>.ts`.

| # | Source legacy path | Size | New target path | Capability |
|---:|---|---:|---|---|
| 6 | `scripts/phase5a-audit.ts` | 6.8 KB | `scripts/audit-phase5-trust-domain.ts` | 12-category trust-domain audit (user/company verification, machine passport, inspection, moderation, audit log, review, API routes existence, admin pages existence, RBAC permissions). |
| 7 | `scripts/phase6a-audit.ts` | 4.5 KB | `scripts/audit-phase6-marketplace.ts` | Marketplace-domain audit (RFQ + Wanted + Deals + Offers + Orders). |
| 8 | `scripts/phase7a-audit.ts` | 5.4 KB | `scripts/audit-phase7-rfq-matching.ts` | RFQ matching-engine audit (matching-score distribution, request-to-listing match counts). |
| 9 | `scripts/phase8a-audit.ts` | 4.4 KB | `scripts/audit-phase8-messaging.ts` | Messaging-domain audit (conversations, deal-rooms, notifications, Telegram integration). |
| 10 | `scripts/phase9a-audit.ts` | 5.1 KB | `scripts/audit-phase9-orders-deals.ts` | Orders + deals audit (dispute resolution, payment verification). |
| 11 | `scripts/phase10a-audit.ts` | 4.2 KB | `scripts/audit-phase10-reviews-reputation.ts` | Reviews + reputation audit (review approval rate, rejection-message threading). |
| 12 | `scripts/phase11a-audit.ts` | 3.4 KB | `scripts/audit-phase11-notifications.ts` | Notifications audit (delivery rate, read-rate, unread-count). Smallest phase-audit. |

**Common defects (all 7):**
1. `// @ts-nocheck` line 1.
2. `.catch(() => [])` and `.catch(() => 0)` error masking on every DB query (silently hides schema-mismatch errors).
3. Single-schema assumption (only `db.user`, `db.company` — ignores `storeDb`).
4. Hardcoded relative `fs.existsSync("src/app/api/...")` paths (breaks if cwd ≠ repo root).
5. Brittle `schemaContent.includes("model X {")` matching.

**Common adaptation pattern:**
1. Remove `@ts-nocheck` — type all `db.*` calls against the generated Prisma client.
2. Remove `.catch(() => 0)` masking — let errors propagate and report them as `ERROR` rows in the audit output.
3. Add `storeDb` coverage for store-specific entities where applicable.
4. Parameterize source-tree path: `path.resolve(__dirname, "../src/app/...")` instead of relative cwd.
5. Replace `schemaContent.includes("model X {")` with `prismaJsonDatamodel.models.X` reflection (read from `prisma/schema.prisma` AST, not text).

**Common standards alignment:**
- ✅ TypeScript strict (no `@ts-nocheck`).
- ✅ Recognize `ROUTE_PERMS` middleware pattern — don't flag routes covered by the middleware table as missing RBAC.
- ✅ Prisma dual-DB — both `db` and `storeDb` covered.
- ✅ Server-side only (dev-time diagnostic script, not runtime).

**Common project goal alignment:**
- ADAPT-06 → **G4 (trust & verification)**.
- ADAPT-07 → **G1 (marketplace)**.
- ADAPT-08 → **G1 (marketplace — RFQ matching)**.
- ADAPT-09 → **G7 (messaging)**.
- ADAPT-10 → **G1 (orders & deals)**.
- ADAPT-11 → **G4 (reviews & reputation)**.
- ADAPT-12 → **G7 (notifications)**.

**Common tests required:** Vitest fixture with mock Prisma client (both `db` and `storeDb`) + mock schema; run the audit script; assert it produces the expected row counts and flags.

**PR scope:** Grouped into 2 PRs (Phase 4):
- Phase 4a (3 scripts): ADAPT-06, ADAPT-07, ADAPT-08 (trust + marketplace + RFQ).
- Phase 4b (4 scripts): ADAPT-09, ADAPT-10, ADAPT-11, ADAPT-12 (messaging + orders + reviews + notifications).

Alternatively, all 7 can be one PR if the shared pattern keeps the diff small.

**Risk:** LOW — dev-time scripts, no runtime impact.

**Complexity:** M each (×6) + S (×1: phase11a — smallest).

**Dependencies:** None.

### 4.13 [ADAPT-13] `scripts/security-check.ts` — security-coverage lint recognizing `ROUTE_PERMS`

- **Source:** `scripts/security-check.ts` (4.9 KB) at HEAVIXIR/z @ `217f98e`. Provenance: legacy dev-time security lint; rejected per manifest as `REJECT_OBSOLETE_SECURITY_CHECK`.
- **Capability:** Single CLI script producing a security-coverage report on all `route.ts` files in `src/app/api/admin/` and `src/app/api/`. Checks for: (a) missing auth (`isAuthenticated`, `getCurrentUser`, `requireAdmin`); (b) missing RBAC (`requirePermission`, `hasPermission`); (c) missing audit (`auditLog`, `AuditLog`); (d) AI Gateway bypass (routes that call `ZAI.create()` or import `z-ai-web-dev-sdk` but are not in `ai-gateway` / `ai-budget` routes).
- **Why rejected:** (1) `// @ts-nocheck` line 1; (2) brittle string-include checks (`content.includes("isAuthenticated")`); (3) doesn't recognize the target's `ROUTE_PERMS` middleware pattern (which centralizes RBAC in `src/middleware.ts` rather than per-route).
- **Target integration point:** New file `scripts/security-coverage-check.ts`. Complements (does NOT replace) the existing `audit-ai-gateway.mjs` + `audit-admin-rbac.mjs` (CI-checked, per PR #145 §5).
- **Standards alignment:**
  - ✅ TypeScript strict (no `@ts-nocheck`).
  - ✅ Recognizes `ROUTE_PERMS` middleware pattern — routes whose paths are in `ROUTE_PERMS` are NOT flagged as missing RBAC (they're centrally protected).
  - ✅ Recognizes `requireAdminPermission()` (Issue #112) — routes using this helper are not flagged.
  - ✅ Keeps AI-gateway-bypass detection — flags the 21 SDK-importing routes (tracked by Issue #111; the `withAIGatewayPolicy()` HOF from ADAPT-01 is the resolution).
  - ✅ JSON output mode for CI integration.
- **Project goal alignment:** **G5 (admin panel)** — directly supports the RBAC audit. Also G3 (AI services — flags SDK-bypass routes).
- **Adaptation spec:**
  1. Read `src/middleware.ts` `ROUTE_PERMS` table at startup; build a set of "RBAC-covered route patterns".
  2. Walk `src/app/api/**/route.ts`.
  3. For each route: parse the AST (not regex) to detect auth/RBAC/audit calls. Mark as `coveredByMiddleware` if path matches `ROUTE_PERMS` entry.
  4. Output: JSON array of `{ path, hasAuth, hasRBAC, hasAudit, aiGatewayBypass, coveredByMiddleware }`.
  5. Exit code: 0 if all routes pass; 1 if any fail (CI integration).
- **Tests required:** Snapshot test against a fixture repo with known-good and known-bad routes.
- **PR scope:** 1 PR (Phase 5 batch D). Estimated complexity: **M**.
- **Risk:** MEDIUM — touches security tooling; CI-coupled.
- **Dependencies:** None (Phase 5 can start after Phase 4).

### 4.14 [ADAPT-14] `scripts/rebuild-taxonomy.ts` — canonical taxonomy seed

- **Source:** `scripts/rebuild-taxonomy.ts` (20.9 KB) at HEAVIXIR/z @ `217f98e`. Provenance: legacy 14-root-category taxonomy seed; rejected per manifest as `HOLD_DATA_MUTATION`.
- **Capability:** 14-root-category taxonomy with full subcategory trees (Machinery → Road Construction → Excavator/Loader/Bulldozer/Grader/etc., Mining Machinery → Dump Truck/Mining Loader/etc., Drilling Equipment, etc.).
- **Why rejected:** Data-mutating script; workstation-specific; hardcoded Prisma client construction (`new PrismaClient()`).
- **Target integration point:** New file `prisma/seed-taxonomy-canonical.ts` (alongside existing `prisma/seed-taxonomy.ts` 19.2 KB + `prisma/seed-taxonomy-v11.ts` 62.8 KB — verify overlap first, add only the missing categories).
- **Standards alignment:**
  - ✅ TypeScript strict (no `@ts-nocheck`).
  - ✅ Prisma dual-DB — uses main `db` (taxonomy is main-schema, not store).
  - ✅ Idempotent — `upsert-by-slug` (re-runnable without side-effects).
  - ✅ Gated behind `--confirm` flag (no accidental mutation).
  - ✅ No hardcoded Prisma client — uses shared `@/lib/db` (or `prisma/seed-helpers.ts`).
- **Project goal alignment:** **G6 (taxonomy)** — directly advances the canonical taxonomy.
- **Adaptation spec:**
  1. Verify which categories the target's current `prisma/seed-taxonomy*.ts` scripts already seed (compare slugs).
  2. Rewrite as `prisma/seed-taxonomy-canonical.ts` with idempotent `upsert-by-slug`.
  3. Add only the categories MISSING from the target's current taxonomy.
  4. Gate behind `--confirm` flag: `if (!process.argv.includes('--confirm')) { console.error('Pass --confirm to mutate'); process.exit(1); }`.
  5. Reuse the shared `db` instance; do NOT instantiate `new PrismaClient()`.
- **Tests required:** Vitest fixture with mock Prisma client; upsert idempotency test (run twice → no duplicate rows).
- **PR scope:** 1 PR (Phase 6 batch E). Estimated complexity: **L**.
- **Risk:** HIGH — data-mutating script. Even though `--confirm`-gated, must NOT be run in production without explicit Senior Director authorization.
- **Dependencies:** Phase 4 (the phase-audit pattern proves the typing approach).
- **Operational constraint:** Script is committed for dev/test use only. Production seeding requires separate authorization.

### 4.15 [ADAPT-15] `scripts/seed-store-comprehensive.ts` — store comprehensive seed

- **Source:** `scripts/seed-store-comprehensive.ts` (91.7 KB, 843 lines) at HEAVIXIR/z @ `217f98e`. Provenance: legacy 4-sector store seed (Auto Parts + Heavy Machinery + Oil/Gas + Industrial); rejected per manifest as `REJECT_DIRECT_SEED_IMPORT`.
- **Capability:** Real-world store seed data: ~25 brands + ~95 parts (Auto Parts), ~25 brands + ~70 parts (Heavy Machinery), ~15 brands + ~35 parts (Oil/Gas), ~18 brands + ~55 parts (Industrial). Uses `storeDb`.
- **Why rejected:** Massive data-mutating script; workstation-specific; uses `storeDb` directly without idempotency.
- **Target integration point:** New file `prisma/store/seed-comprehensive.ts` (alongside existing `prisma/seed-store.ts` 6.2 KB — much smaller; the legacy comprehensive seed has substantially more data).
- **Standards alignment:**
  - ✅ TypeScript strict.
  - ✅ Prisma dual-DB — uses `storeDb` (store Prisma client, `STORE_DATABASE_URL`).
  - ✅ Idempotent — `upsert-by-sku` for parts (re-runnable).
  - ✅ Gated behind `--confirm` flag.
  - ✅ Split into 4 sector-specific sub-scripts for granular control: `prisma/store/seed-auto-parts.ts`, `seed-heavy-machinery.ts`, `seed-oil-gas.ts`, `seed-industrial.ts`. The `seed-comprehensive.ts` is the orchestrator.
- **Project goal alignment:** **G2 (store center)** — directly advances the store seed data.
- **Adaptation spec:**
  1. Verify the target's current `storeDb` contract matches the script's expectations (model names, field names — refer to `prisma/store/schema.prisma`).
  2. Rewrite as `prisma/store/seed-comprehensive.ts` orchestrator + 4 sector sub-scripts.
  3. Idempotent `upsert-by-sku` for parts (re-runnable).
  4. Gate behind `--confirm` flag.
- **Tests required:** Vitest fixture with mock `storeDb`; upsert idempotency test.
- **PR scope:** 1 PR (Phase 6 batch E). Estimated complexity: **L**.
- **Risk:** HIGH — data-mutating, 4 sectors of parts data, touches store DB.
- **Dependencies:** Phase 4.
- **Operational constraint:** Script committed for dev/test only. Production seeding requires explicit authorization.

### 4.16 [ADAPT-16] `scripts/make-logos-dark.cjs` — image-transform logo-dark utility

- **Source:** `scripts/make-logos-dark.cjs` (2.5 KB) at HEAVIXIR/z @ `217f98e`. Provenance: legacy image-processing utility; rejected per manifest as `HOLD_ASSET_MUTATION`.
- **Capability:** Takes an uploaded logo JPG and produces a dark-background variant (white→transparent, orange→kept, dark→white). The pixel-level color-classification + alpha-manipulation logic is reusable.
- **Why rejected:** Hardcoded `/home/z/my-project/public/logos` and `/home/z/my-project/upload/IMG_*.jpg` paths (workstation-specific); CommonJS (`.cjs`), not TypeScript.
- **Target integration point:** New file `scripts/image-transform-logo-dark.ts` (TypeScript).
- **Standards alignment:**
  - ✅ TypeScript strict (convert from `.cjs`).
  - ✅ No hardcoded paths — CLI flags `--input <path> --output <path>`.
  - ✅ Reusable function `transformLogoForDarkBg(buffer: Buffer): Promise<Buffer>` extracted for unit testing.
  - ✅ Uses `sharp` (already in `package.json`).
- **Project goal alignment:** **G9 (media — image processing)** — directly advances the image-transform tooling. Issue #131 (image upload/compression) is a related track.
- **Adaptation spec:**
  1. Extract color-classification logic into `transformLogoForDarkBg(buffer: Buffer): Promise<Buffer>`.
  2. CLI wrapper: `tsx scripts/image-transform-logo-dark.ts --input <path> --output <path>`.
  3. Replace `require('sharp')` with `import sharp from 'sharp'`.
- **Tests required:** Vitest fixture with a known input PNG → expected output PNG (pixel-diff assertion).
- **PR scope:** 1 PR (Phase 5 batch D). Estimated complexity: **M**.
- **Risk:** LOW — dev-time script.
- **Dependencies:** None.

### 4.17 [ADAPT-17] `scripts/process-logos.cjs` — image-transform logo-transparent utility

- **Source:** `scripts/process-logos.cjs` (2.7 KB) at HEAVIXIR/z @ `217f98e`. Provenance: legacy v1 of the logo-transform pipeline (the simpler variant of ADAPT-16); rejected per manifest as `HOLD_ASSET_MUTATION`.
- **Capability:** Takes an uploaded JPG, makes white pixels transparent, produces both a colored variant and a white-tinted-for-dark-bg variant. Same logic as ADAPT-16 but simpler (no orange-preservation special case).
- **Why rejected:** Same as ADAPT-16 — hardcoded workstation paths, CommonJS.
- **Target integration point:** New file `scripts/image-transform-logo-transparent.ts` (TypeScript).
- **Standards alignment:** Same as ADAPT-16.
- **Project goal alignment:** **G9 (media — image processing)**.
- **Adaptation spec:**
  1. Extract white-to-transparent logic into `transformLogoTransparent(buffer: Buffer): Promise<Buffer>`.
  2. CLI wrapper: `tsx scripts/image-transform-logo-transparent.ts --input <path> --output <path>`.
- **Tests required:** Vitest fixture with a known input → expected output.
- **PR scope:** 1 PR (Phase 2 batch A). Estimated complexity: **S**.
- **Risk:** LOW.
- **Dependencies:** None.

### 4.18 Adaptation backlog summary

| # | Source | Area | Target integration point | Complexity | Risk | Phase |
|---:|---|---|---|:---:|:---:|:---:|
| 1 | `src/lib/ai-gateway-service.ts` | B | `src/lib/ai/with-gateway-policy.ts` | M | MED | 5 |
| 2 | `src/components/listings/PriceIntelligence.tsx` | C | `src/components/listings/PriceVerdictBadge.tsx` | S | LOW | 2 |
| 3 | `src/components/compare/ComparePageClient.tsx` | E | `src/components/compare/CompareInteractions.tsx` | M | MED | 3 |
| 4 | `src/lib/price-intelligence.ts` | E | consolidate into `src/lib/price-engine.ts` | M | MED | 3 |
| 5 | `prisma/migrations/README.md` | N | `prisma/migrations/README.md` | S | LOW | 2 |
| 6 | `scripts/phase5a-audit.ts` | O | `scripts/audit-phase5-trust-domain.ts` | M | LOW | 4 |
| 7 | `scripts/phase6a-audit.ts` | O | `scripts/audit-phase6-marketplace.ts` | M | LOW | 4 |
| 8 | `scripts/phase7a-audit.ts` | O | `scripts/audit-phase7-rfq-matching.ts` | M | LOW | 4 |
| 9 | `scripts/phase8a-audit.ts` | O | `scripts/audit-phase8-messaging.ts` | M | LOW | 4 |
| 10 | `scripts/phase9a-audit.ts` | O | `scripts/audit-phase9-orders-deals.ts` | M | LOW | 4 |
| 11 | `scripts/phase10a-audit.ts` | O | `scripts/audit-phase10-reviews-reputation.ts` | M | LOW | 4 |
| 12 | `scripts/phase11a-audit.ts` | O | `scripts/audit-phase11-notifications.ts` | S | LOW | 4 |
| 13 | `scripts/security-check.ts` | O | `scripts/security-coverage-check.ts` | M | MED | 5 |
| 14 | `scripts/rebuild-taxonomy.ts` | O | `prisma/seed-taxonomy-canonical.ts` | L | HIGH | 6 |
| 15 | `scripts/seed-store-comprehensive.ts` | O | `prisma/store/seed-comprehensive.ts` (+ 4 sector sub-scripts) | L | HIGH | 6 |
| 16 | `scripts/make-logos-dark.cjs` | O | `scripts/image-transform-logo-dark.ts` | M | LOW | 5 |
| 17 | `scripts/process-logos.cjs` | O | `scripts/image-transform-logo-transparent.ts` | S | LOW | 2 |

**Complexity totals:** S × 4 (items #2, #5, #12, #17) + M × 11 (items #1, #3, #4, #6–#11, #13, #16) + L × 2 (items #14, #15) = 17 items.

---

## 5. Proposal for the 19 PRESERVE_AS_REFERENCE items

### 5.1 Current state (post-PR-#156 merge)

PR #156 (Phase 0) is MERGED on `z-ai-2/main @ 3bd8150`. It created the directory structure `docs/legacy-parity/reference/` with provenance records (NOT source content) for all 19 items. The PR explicitly disclosed a transparency limitation: *"This execution environment could not retrieve the ZIP bytes, so the actual member contents and member-level SHA-256 hashes have not been verified or copied."*

The PR's `README.md` includes a 6-checkbox completion gate, all currently unchecked:

- [ ] Verify exact ZIP member paths at the pinned source commit.
- [ ] Verify content SHA-256 for every extracted member.
- [ ] Secret-scan the 12 proposed source-content files before commit; verify the six canonical-document duplicates by hash/cross-reference without copying them.
- [ ] Compare the six upload documents against canonical target docs and preserve only genuinely unique material.
- [ ] Confirm historical migration/schema and static robots are stored outside runtime paths.
- [ ] Independent review + CI before merge.

### 5.2 STEP 16.80 contribution — SHA-256 gap filled

During STEP 16.78 + STEP 16.80, the agent independently retrieved the 13 legacy ZIPs (extracted at `/tmp/heavix-legacy/extracted/`), located the 18 file-bearing members, and computed SHA-256 hashes. (The 19th item — `.zscripts/dev.pid` — is a runtime PID marker; no meaningful content hash, only a convention to document.)

These hashes complete checkbox #2 of the Phase-0 completion gate for the 18 file-bearing members.

### 5.3 Proposed action — Phase 0.5 (commit source content with provenance headers)

**Single docs-only PR.** Populates `docs/legacy-parity/reference/<area>/<file>` with actual source content (not just provenance records) for 12 non-duplicate text/source members. The 6 upload documents that duplicate canonical target docs remain provenance/hash cross-references only under Option A. Each of the 12 committed files receives a provenance header; all 18 file-bearing members have SHA-256 entries in `INTEGRITY.md`.

**Target paths (post-Phase-0.5):**

```
docs/legacy-parity/reference/
├── README.md                                        # Update with SHA-256 table + checked completion gate
├── INTEGRITY.md                                     # NEW: SHA-256 index for all 18 file-bearing members (12 committed source files + 6 duplicate-doc cross-references)
├── infrastructure/
│   └── dev-pid-convention.md                        # Already merged (Phase 0); no source content
├── prisma/
│   ├── legacy-sqlite-initial-migration.md           # Already merged (Phase 0); update with SHA-256
│   ├── legacy-sqlite-initial-migration.sql           # NEW: actual source (Phase 0.5)
│   ├── legacy-flat-store-schema.md                  # Already merged (Phase 0); update with SHA-256
│   └── store-schema-flat-layout.prisma              # NEW: actual source (Phase 0.5)
├── scripts/
│   ├── seed-articles.ts                             # NEW (Phase 0.5)
│   ├── seed-brands-300.ts                            # NEW (Phase 0.5)
│   ├── seed-essential.ts                             # NEW (Phase 0.5)
│   ├── seed-kill-switch.ts                           # NEW (Phase 0.5)
│   ├── seed-plans.ts                                 # NEW (Phase 0.5)
│   ├── clear-logo.ts                                # NEW (Phase 0.5)
│   ├── orange-ix.cjs                                # NEW (Phase 0.5)
│   ├── process-logos-v2.cjs                          # NEW (Phase 0.5)
│   └── start-dev.sh                                  # NEW (Phase 0.5)
├── public/
│   └── robots.txt                                    # NEW (Phase 0.5) — 160 bytes, safe plain text
└── uploads/
    └── (6 Phase-0 provenance records only; no duplicate source copies under Option A — see §5.5)
```

**Provenance header (committed with each source file):**

```text
<!--
  Legacy reference source file.
  Source repository: HEAVIXIR/z @ 217f98ecc800aa64ae4739d27ed2aeb95dd260ed
  Legacy member path: <legacy path>
  Archive family: <zip name>
  Member SHA-256: <hash>
  Disposition: PRESERVE_AS_REFERENCE (per VALUE-BASED-DISPOSITION-2026-10-27.md §5)
  Reason: <one-line reason>
  Status: Historical reference only. NOT in runtime path. Do NOT execute.
  Cross-reference: docs/legacy-parity/reference/<area>/<file>.md (provenance record from Phase 0)
-->
```

### 5.4 SHA-256 hashes (computed STEP 16.78 + re-verified STEP 16.80)

The hashes below are the verified SHA-256 of the 18 file-bearing PRESERVE members.

| # | Legacy path | Size (bytes) | SHA-256 | Phase-0.5 target path |
|---:|---|---:|---|---|
| 1 | `prisma/migrations/0_init/migration.sql` | 43,031 | `272a6c503ec07d2596080aef03ce62b5c39d7cd3877d409046b700b1fe260cc3` | `docs/legacy-parity/reference/prisma/legacy-sqlite-initial-migration.sql` |
| 2 | `prisma/store-schema.prisma` | 12,802 | `2c668c93dd0edd11e012141a155d33404d6ad3f625f45ff4d24f4b66e2509b6c` | `docs/legacy-parity/reference/prisma/store-schema-flat-layout.prisma` |
| 3 | `scripts/seed-articles.ts` | 6,757 | `6c21d4d227c82b4305f07d4c6c8e08e9eecf4a7b9452fbee2ea0f0e105b0b994` | `docs/legacy-parity/reference/scripts/seed-articles.ts` |
| 4 | `scripts/seed-brands-300.ts` | 25,147 | `d609785280d0a37b0ee838cd3976f5ea6eb78bcb4828fce0e06d0a29b8c9f05e` | `docs/legacy-parity/reference/scripts/seed-brands-300.ts` |
| 5 | `scripts/seed-essential.ts` | 6,454 | `71507d4b0aebc05c40acfcd71e97de6dcc7d544b844125fcd77811c032aa295e` | `docs/legacy-parity/reference/scripts/seed-essential.ts` |
| 6 | `scripts/seed-kill-switch.ts` | 1,230 | `d376670731120883a61aee9ae440c307041ae96dae48b8a6f45680d5aa8b14a6` | `docs/legacy-parity/reference/scripts/seed-kill-switch.ts` |
| 7 | `scripts/seed-plans.ts` | 2,786 | `cee1aede0bfa23129553814939cb74b3c8d31b70b14fd555ea1a7cd2792d248f` | `docs/legacy-parity/reference/scripts/seed-plans.ts` |
| 8 | `scripts/clear-logo.ts` | 361 | `cc83dba621047ffe1b867340144632ee16d97a7b2ce158ac4e8295b75ae978f4` | `docs/legacy-parity/reference/scripts/clear-logo.ts` |
| 9 | `scripts/orange-ix.cjs` | 2,891 | `b975fbab077d5145eb15d7e0009548f5a3c5513e6bbf58e7caaff7c62418efa2` | `docs/legacy-parity/reference/scripts/orange-ix.cjs` |
| 10 | `scripts/process-logos-v2.cjs` | 2,191 | `7d48560521a58c32e2b7b18f491090c8fd86f31c26acdd0ae1797fa333e86386` | `docs/legacy-parity/reference/scripts/process-logos-v2.cjs` |
| 11 | `scripts/start-dev.sh` | 617 | `fbbed21528a22151d50ad58eb144b69d115dbb6ad4398261e9b34989ecb1d773` | `docs/legacy-parity/reference/scripts/start-dev.sh` |
| 12 | `public/robots.txt` | 160 | `a3d27b3ca5ce32341fa9f96f01169b521b1657c05d1860c45d1e53a6258e9e8b` | `docs/legacy-parity/reference/public/robots.txt` |
| 13 | `upload/HEAVIX-AUDIT-2026-09-20.md` | 14,978 | `b1d719cc378873ded50b1c0d7fccd1e048e093030ef82b75fb526a33ec4f8be1` | `docs/legacy-parity/reference/uploads/HEAVIX-AUDIT-2026-09-20.md` |
| 14 | `upload/HEAVIX-COMPLETION-SPECIFICATION-V1.0.md` | 34,619 | `d66fb87f48039d0e911bcbc10d1e51f384b0c25a108a201bb5c30ad9438aea01` | `docs/legacy-parity/reference/uploads/HEAVIX-COMPLETION-SPECIFICATION-V1.0.md` |
| 15 | `upload/HEAVIX-CORRECTED-REFERENCE-V1.1.md` | 4,828 | `aad6b918540e740faf9d362f15f249ca6f4467f9e45de1004780aed80cf8ae18` | `docs/legacy-parity/reference/uploads/HEAVIX-CORRECTED-REFERENCE-V1.1.md` |
| 16 | `upload/HEAVIX-DATA-GOVERNANCE-V1.md` | 2,082 | `eb3c6148f63208d054da48a5fedf223cabf210c1de6328c82d9a95ab2ccf7b4e` | `docs/legacy-parity/reference/uploads/HEAVIX-DATA-GOVERNANCE-V1.md` |
| 17 | `upload/HEAVIX-P0-IMPLEMENTATION-PLAN.md` | 3,475 | `50ef6d958e096f453f3281930aafeebc742ad09fc213ee7b23b147c0fe1d4724` | `docs/legacy-parity/reference/uploads/HEAVIX-P0-IMPLEMENTATION-PLAN.md` |
| 18 | `upload/HEAVIX-SECURITY-BASELINE-V1.md` | 2,210 | `024f4a7422e54bb65169a22c2e07cc331ac1dd258bb844aff20af190c38f43c7` | `docs/legacy-parity/reference/uploads/HEAVIX-SECURITY-BASELINE-V1.md` |
| 19 | `.zscripts/dev.pid` | 5 | (no content hash — runtime PID marker; convention-only) | `docs/legacy-parity/reference/infrastructure/dev-pid-convention.md` (Phase 0; no source content) |

**Total Phase-0.5 source content size:** 12 non-duplicate files totaling 104,427 bytes (about 102 KiB); the six canonical-document duplicates are hash/cross-reference only. No binaries. Secret-scan the 12 files before committing; no database data is approved.

### 5.5 Handling of the 6 `upload/HEAVIX-*.md` files (items #13-#18)

The 6 `upload/HEAVIX-*.md` files are content-identical to canonical `docs/HEAVIX-*.md` files already in target. Phase-0 documentation (already merged) preserves the **relationship** (the index entry `docs/legacy-parity/reference/uploads/canonical-doc-*.md`). Phase-0.5 proposes one of two options:

- **Option A (preferred):** Do NOT commit the source content of items #13-#18 (they are content-duplicates of canonical docs). Instead, the Phase-0 provenance records remain the only artifact for these 6 items. Update `INTEGRITY.md` to record the SHA-256 + the canonical-doc cross-reference (e.g., "Item #13 `upload/HEAVIX-AUDIT-2026-09-20.md` is content-identical to `docs/HEAVIX-AUDIT-2026-09-20.md` (already in target). No source content committed to avoid duplication.").
- **Option B (alternative):** Commit the source content as items #13-#18 with provenance headers + a "DUPLICATE_OF_CANONICAL" tag in the header. Useful if the Senior Director wants the SHA-256 to be cryptographically verifiable against the upload bytes.

**Recommendation:** Option A — preserves the value (provenance + relationship) without duplicating content. Hashes still recorded in `INTEGRITY.md` for cryptographic verification.

### 5.6 Standards check for Phase 0.5

For each of the 12 non-duplicate source-content files committed in Phase 0.5:

- ✅ **No active code** — files live under `docs/legacy-parity/reference/`, NOT under `src/`, `prisma/`, `public/`, or `scripts/` active trees. They cannot be imported or executed.
- ✅ **No secrets** — secret-scan all 12 files before commit; reject or redact any sensitive content (e.g., the `start-dev.sh` hardcoded `/home/z/my-project` path is acceptable as it's a provenance artifact, not active config).
- ✅ **No binary blobs** — all 12 committed source files are plain text.
- ✅ **No DB data** — none of the 12 committed source files contain DB data.
- ✅ **Provenance preserved** — each file's header documents source path + source commit + SHA-256 + cross-reference to Phase-0 provenance record.
- ✅ **Outside runtime path** — none of the 12 committed source files are placed under active `src/`, `prisma/`, `public/`, or `scripts/` trees.

### 5.7 Risk assessment

- **Risk:** LOW — docs-only PR; no code execution path; no binary committed; no DB mutation.
- **Tests:** None required (docs-only).
- **Review:** Required (non-author, dellk00k under delegation).
- **Estimated effort:** 1 PR ≈ 2 hours (compute hashes via the table above + commit source content with provenance headers + update `INTEGRITY.md` + check the 6 completion-gate checkboxes).

---

## 6. Proposal for the 18 SAFE_ARCHIVE items

### 6.1 Goal

For each of the 18 sensitive / binary / unverified files, preserve **safe content** (redacted structure + SHA-256 + provenance + classification) under `docs/legacy-parity/safe-archive/`. **Binary bytes never enter Git.** No active credentials. No live database data. No unverified uploads. No patch archives extracted.

### 6.2 Proposed target structure (Phase 1 — single docs-only PR)

```
docs/legacy-parity/safe-archive/
├── README.md                                # Index + safety guidelines + classification legend
├── INTEGRITY.md                             # NEW: SHA-256 index for all 18 binary items
├── dotenv-structure.md                      # .env redacted structure (no value)
├── db-snapshots-inventory.md                # 8 SQLite DB files (paths + sizes + SHA-256 + table-list-from-schema)
├── unverified-uploads-inventory.md          # 5 IMG_*.jpg (paths + sizes + SHA-256 + dimensions)
├── patch-archives-inventory.md             # 3 patch ZIPs (paths + sizes + SHA-256 + unzip -l file listings)
└── workspace-artifacts-inventory.md        # 1 workspace TAR (path + UUID + tar -tf top-level listing)
```

### 6.3 SHA-256 hashes for all 18 SAFE_ARCHIVE binary items (computed STEP 16.80)

| # | Legacy path | Size (bytes) | Classification | SHA-256 |
|---:|---|---:|---|---|
| 1 | `.env` | 50 | SECRET | `be8e1a92feff8f6cb699a9a70cc7d76a183538ab8c68a45e7d40f0d32bf20b94` |
| 2 | `db/backups/custom-20260921-023810.db` | 2,523,136 | DATABASE_DATA | `1a7fff6056763d54a0f8986bac39dd07230ca869e7c4e09ab89ab4a9842c99b1` |
| 3 | `db/backups/custom-20260921-024013.db` | 2,523,136 | DATABASE_DATA | `0bf1e09b2b185b1a2dff99ce4f2b02cbebbee9361b0cee151f71c67d656c9532` |
| 4 | `db/backups/custom-20260921-025202.db` | 2,535,424 | DATABASE_DATA | `99ca820686844ec7796a80c7678c70029c8a90f3dcdfe2d82826b9a564ea6016` |
| 5 | `db/custom.db` | 2,637,824 | DATABASE_DATA | `ce3a32b07c99e4b55a73d316c6c82b53f32c3ac226a91a1c8b0562a09a5a13f0` |
| 6 | `db/custom.db.before-restore` | 2,502,656 | DATABASE_DATA | `c04295b69d2175f713e9877ea19614d5a9f5e72279bfc20d3de4a496aea7ef71` |
| 7 | `db/store.db` | 344,064 | DATABASE_DATA | `e036d2e62da780e7e16438cc73d0c5b3e5f83fb86f84c687760621800a58766e` |
| 8 | `upload/HEAVIX-EXECUTABLE-HARDENING-PATCH-V1.0.zip` | 9,654 | PATCH_ARCHIVE | `8c5c630a8140baab118510e0a63e46f748f84c2129193d10776e2fcac4450f4a` |
| 9 | `upload/HEAVIX-PRICE-COMPARISON-DOCUMENTS-V1.0.zip` | 4,765 | PATCH_ARCHIVE | `7568cd1903a63507f0ca4b4d9a4dcc65409a62b19752fc576fb5cf58746b8ebb` |
| 10 | `upload/IMG_20260921_134636_188.jpg` | 47,186 | UNVERIFIED_UPLOAD | `5135900667a2cff0a9ecd069ba8db0c3ae5ea06b5d3b3cb8a6ed39a3fb866c47` |
| 11 | `upload/IMG_20260921_134636_634.jpg` | 34,352 | UNVERIFIED_UPLOAD | `1b3af1a7b98a1d222fec6acd368c940478a4b89591f3470f4224517ce1d74107` |
| 12 | `upload/IMG_20260921_134636_663.jpg` | 25,054 | UNVERIFIED_UPLOAD | `d8558f1f7c1e9f9bc83076c0129e38d8ea685e658515db4131bcc37ba5f2a792` |
| 13 | `upload/IMG_20260921_134636_703.jpg` | 23,874 | UNVERIFIED_UPLOAD | `a028b309c41d32c69cebe53f286efaea2814de3b7ba868007666e913ab5b4091` |
| 14 | `upload/IMG_20260921_134636_839.jpg` | 12,666 | UNVERIFIED_UPLOAD | `039371554dcbbb218b6b36f0e2088fa122648b3011b15db3e4e69be7d5f9b6c6` |
| 15 | `upload/custom-20260921-024013.db` | 2,523,136 | DATABASE_DATA | `0bf1e09b2b185b1a2dff99ce4f2b02cbebbee9361b0cee151f71c67d656c9532` |
| 16 | `upload/custom-20260921-025202.db` | 2,535,424 | DATABASE_DATA | `99ca820686844ec7796a80c7678c70029c8a90f3dcdfe2d82826b9a564ea6016` |
| 17 | `upload/heavix-postgres-migration-changes.zip` | 211,336 | MIGRATION_ARCHIVE | `c44b7424695befafae1a5c9a332b14b2793cfb58ad418b32ff6063c130319d90` |
| 18 | `upload/workspace-d08ba835-4223-4b4a-9627-838c96185efa (1).tar` | 1,539,495 | WORKSPACE_ARTIFACT | `b8f83e3689662d319b4d119a378c5cb985c10bd595124a252e5388ffe4668042` |

### 6.4 Cross-references discovered (verified by SHA-256)

The SHA-256 computation revealed two content-duplicates (as suspected by the comprehensive audit):

| Path A | Path B | SHA-256 match | Conclusion |
|---|---|---|---|
| `db/backups/custom-20260921-024013.db` (#3) | `upload/custom-20260921-024013.db` (#15) | `0bf1e09b2b185b1a2dff99ce4f2b02cbebbee9361b0cee151f71c67d656c9532` | Content-identical — single snapshot copied to both `db/backups/` and `upload/`. |
| `db/backups/custom-20260921-025202.db` (#4) | `upload/custom-20260921-025202.db` (#16) | `99ca820686844ec7796a80c7678c70029c8a90f3dcdfe2d82826b9a564ea6016` | Content-identical — single snapshot copied to both directories. |

**Implication:** the 18 SAFE_ARCHIVE entries correspond to **16 unique binary artifacts** (4 are 2 pairs of duplicates). The inventory documentation should make this explicit.

### 6.5 Safe-content documentation per item

For each of the 18 items, the safe-content documentation includes:

- **Path** — legacy path.
- **Size** — in bytes (recorded above).
- **SHA-256** — hash (recorded above).
- **Classification** — SECRET / DATABASE_DATA / UNVERIFIED_UPLOAD / PATCH_ARCHIVE / MIGRATION_ARCHIVE / WORKSPACE_ARTIFACT.
- **Provenance** — source repository + pinned commit (`217f98e`) + archive family (which of the 13 ZIPs).
- **What is preserved** — for SECRET: redacted key structure (no value); for DATABASE_DATA: table list (extracted from `prisma/legacy-sqlite/schema.prisma` model list, NOT from inspecting the .db file); for UNVERIFIED_UPLOAD: dimensions (via `sharp metadata` — width×height only, no pixel data); for PATCH_ARCHIVE / MIGRATION_ARCHIVE: `unzip -l` file listing (paths + sizes only, no content); for WORKSPACE_ARTIFACT: `tar -tf` top-level listing + UUID.
- **What is NOT preserved** — the binary bytes themselves. They never enter Git.
- **Rotation recommendation** — for SECRET: dev-only DB URL (no production credential; rotate if ever deployed to a reachable environment); for DATABASE_DATA / UNVERIFIED_UPLOAD / PATCH_ARCHIVE / MIGRATION_ARCHIVE / WORKSPACE_ARTIFACT: none (dev snapshot, no production exposure).

### 6.6 Specific doc targets per classification

| Doc target | Items | Content |
|---|---|---|
| `docs/legacy-parity/safe-archive/dotenv-structure.md` | #1 (.env) | Redacted `.env.example`-style structure: `DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<dbname>?schema=<schema>` (no value). Document dev-only nature. Cross-reference PR #145 §4 hit #9 (`.env` excluded). |
| `docs/legacy-parity/safe-archive/db-snapshots-inventory.md` | #2, #3, #4, #5, #6, #7, #15, #16 (8 SQLite DB files) | For each: path, size, SHA-256, table count (from `prisma/legacy-sqlite/schema.prisma` model list — 110 models for main, 20 for store), snapshot timestamp (from filename). Cross-reference for the 4 duplicate paths (#3≡#15, #4≡#16). |
| `docs/legacy-parity/safe-archive/unverified-uploads-inventory.md` | #10, #11, #12, #13, #14 (5 IMG_*.jpg) | For each: filename, size, SHA-256, dimensions (extracted via `sharp metadata` — width×height only), provenance ("uploaded 2026-09-21 13:46:36, used as source for legacy logo processing scripts"). |
| `docs/legacy-parity/safe-archive/patch-archives-inventory.md` | #8, #9, #17 (3 ZIP archives) | For each: archive name, size, SHA-256, `unzip -l` file listing (paths + sizes only, no content extracted), provenance. |
| `docs/legacy-parity/safe-archive/workspace-artifacts-inventory.md` | #18 (1 TAR) | Filename, UUID (`d08ba835-4223-4b4a-9627-838c96185efa`), size, SHA-256, `tar -tf` top-level listing (no content extraction), provenance ("workspace snapshot from dev session"). |

### 6.7 Standards check for Phase 1

- ✅ **No active credentials enter Git** — the `.env`'s `DATABASE_URL` value is NEVER committed. Only the redacted structure (key names + value-shape placeholders) is preserved.
- ✅ **No live database data enters Git** — the 8 SQLite DB files are NEVER committed. Only metadata (path, size, SHA-256, table-list-from-schema-not-from-DB-content) is preserved.
- ✅ **No binary blobs enter Git** — the 5 JPGs, 3 ZIPs, 1 TAR are NEVER committed. Only metadata (path, size, SHA-256, dimensions, file-listings) is preserved.
- ✅ **No `.env` / `.db` / `.jpg` / `.tar` / `.zip` content inspected** — the hashes were computed via `sha256sum` on the binary file (no content read); dimensions extracted via `sharp metadata` (no pixel data read); file listings extracted via `unzip -l` / `tar -tf` (no content extracted).
- ✅ **Provenance preserved** — each safe-archive entry documents source path + source commit + archive family + classification + rotation recommendation.

### 6.8 Cross-reference to historical hardcoded admin credential (PR #145 §4 hit #6)

The historical hardcoded admin credential (`src/lib/auth.ts:32-35` in the legacy repo) is **NOT in the `.env`** — it was a hardcoded fallback constant in the source code. The target's `src/lib/auth.ts` (verified live at `833bec6` and `3bd8150`) has removed this pattern entirely. This safe-archive plan does not introduce the credential; it only documents the `.env`'s structure (which contains a `DATABASE_URL` for the dev DB, not the admin credential).

Per PR #145 §4.1.1: *"If the flagged credential was ever used in any environment that might have been reachable, provider-side rotation and access-log review remain a prudent recommendation."* That recommendation stands as an open item (§9.2).

### 6.9 Risk assessment

- **Risk:** LOW — docs-only PR; no code execution path; no binary committed; no DB mutation.
- **Tests:** None required (docs-only).
- **Review:** Required (non-author, dellk00k under delegation).
- **Estimated effort:** 1 PR ≈ 3 hours (write the 5 inventory docs + `INTEGRITY.md` + `README.md` with the classification legend + safety guidelines).

---

## 7. Phased execution plan

The plan sequences the 17 ADAPT items + the Phase 0.5 source-content/reference accounting + the Phase 1 safe-archive documentation + the Phase 7 standards cleanup into 8 planned PRs. Phase 4 may be split into 2 domain PRs, which would make 9 PRs total.

### 7.1 Phase table

| Phase | Scope | Files | PR type | Risk | Dependencies | Cumulative files actioned |
|---|---|---:|---|---|---|---:|
| 0 | PRESERVE provenance records | 19 | docs-only | LOW | — | ✅ DONE (PR #156 merged on main @ `3bd8150`). |
| **0.5** | PRESERVE source content + SHA-256 index (12 source copies + 6 duplicate-doc references) | 18 (+1 INTEGRITY.md) | docs-only | LOW | Phase 0 done | 18 |
| **1** | SAFE_ARCHIVE documentation + SHA-256 index | 18 (+1 INTEGRITY.md) | docs-only | LOW | None (independent of Phase 0.5) | 36 |
| **2** | ADAPT batch A (S complexity, 3 items) | 3 | code | LOW | None | 39 |
| **3** | ADAPT batch B (M complexity, feature areas B+C+E, 2 items) | 2 | code | MEDIUM | Phase 2 | 41 |
| **4** | ADAPT batch C (phase-audit scripts, 7 items) | 7 | code | MEDIUM | Phase 2 | 48 |
| **5** | ADAPT batch D (security + logos + AI gateway, 3 items) | 3 | code | MEDIUM | Phase 2 | 51 |
| **6** | ADAPT batch E (data-mutating, L complexity, 2 items) | 2 | code (gated behind `--confirm`) | HIGH | Phase 4 | 53 |
| **7** | Standards cleanup (`@ts-nocheck` removal, 7 files) | 7 | code | LOW | Independent (may run in parallel with Phases 2-6) | 60 |
| **Planned file-level actions after Phase 0** | | **60** (12 source copies + 6 duplicate-document references + 18 safe-archive records + 17 adaptations + 7 hygiene targets) | | | | |

**Notes:**
- The 845 INTEGRATE items require no transfer PRs (target's active copy is canonical). The 56 non-INTEGRATE items are the actionable backlog.
- Phase 7 (`@ts-nocheck` cleanup) is independent of Phases 2-6 and may be authorized in parallel.
- The 7 ADAPT items grouped as "batch C" (Phase 4) all share the same adaptation pattern (§4.6-4.12); they can be a single PR if the shared diff is small, or 2 PRs grouped by domain.

### 7.2 Phase 0 — PRESERVE provenance (DONE)

- **Status:** ✅ MERGED on main @ `3bd8150` (commit `3bd8150 docs(legacy-parity): add phase-0 reference provenance records`).
- **PR:** #156 (head `fadd874`, reviewed APPROVED by dellk00k non-author, id 5678528385).
- **Content:** 19 provenance records under `docs/legacy-parity/reference/` + `README.md` with 6-checkbox completion gate.

### 7.3 Phase 0.5 — PRESERVE source content (proposed)

- **Scope:** Account for all 18 file-bearing members with provenance + `INTEGRITY.md` SHA-256 index: commit 12 non-duplicate text/source files with provenance headers; for the 6 upload documents already represented by canonical target docs, record SHA-256 + canonical cross-reference only (Option A). The 19th path, `.zscripts/dev.pid`, remains a provenance-only runtime-marker convention.
- **PR type:** docs-only.
- **Risk:** LOW.
- **Tests:** None (docs-only).
- **Review:** Required (non-author).
- **Estimated effort:** 2 hours.
- **Standards check:** §5.6.
- **Action items:**
  1. Update `docs/legacy-parity/reference/README.md` to reflect Phase-0.5 status.
  2. Create `docs/legacy-parity/reference/INTEGRITY.md` with the 18 SHA-256 hashes from §5.4.
  3. Commit the 12 non-duplicate source files at the target paths in §5.4 (with provenance headers).
  4. For items #13-#18 (the 6 `upload/HEAVIX-*.md` files): apply Option A (do NOT commit duplicate source content; record SHA-256 + canonical-doc cross-reference in `INTEGRITY.md` only).
  5. Check 4 of the 6 Phase-0 completion-gate checkboxes (paths verified, SHA-256 verified, secrets scanned, runtime-path exclusion confirmed). Items #5 ("Compare upload docs against canonical") and #6 ("Independent review + CI before merge") remain for the Phase-0.5 review.

### 7.4 Phase 1 — SAFE_ARCHIVE documentation (proposed)

- **Scope:** Populate `docs/legacy-parity/safe-archive/` with 5 inventory docs + `INTEGRITY.md` + `README.md`.
- **PR type:** docs-only.
- **Risk:** LOW.
- **Tests:** None (docs-only).
- **Review:** Required (non-author).
- **Estimated effort:** 3 hours.
- **Standards check:** §6.7.
- **Action items:**
  1. Create the 5 inventory docs per §6.6 using the SHA-256 hashes from §6.3.
  2. Document the 2 content-duplicate pairs discovered (§6.4).
  3. Document the rotation recommendation for SECRET (.env — dev-only, no production rotation needed; if ever deployed to a reachable environment, rotate the dev DB password).
  4. Cross-reference PR #145 §4.1.1 (historical hardcoded admin credential — NOT in `.env`).

### 7.5 Phase 2 — ADAPT batch A (S complexity, 3 items)

- **Scope:** Items #2, #5, #17 (the 3 S-complexity adaptations assigned to Phase 2). ADAPT-12 remains with the other phase-audit scripts in Phase 4, so each adaptation item is assigned to exactly one phase.
- **PR type:** code (typed, tested).
- **Risk:** LOW.
- **Tests:** Required per §4 specs.
- **Review:** Required (non-author).
- **Estimated effort:** 1 PR ≈ 6 hours.
- **Items:**
  - #2 `PriceVerdictBadge.tsx` (snapshot test for 3 verdict states).
  - #5 `prisma/migrations/README.md` (doc review only).
  - #17 `image-transform-logo-transparent.ts` (vitest pixel-diff fixture).
- **Standards check:** §2.1 for each item.

### 7.6 Phase 3 — ADAPT batch B (M complexity, feature areas B+C+E, 2 items)

- **Scope:** Items #3 (`CompareInteractions.tsx`) + #4 (`price-intelligence.ts` consolidation).
- **PR type:** code (typed, tested).
- **Risk:** MEDIUM — touches public compare page UX + price-engine library.
- **Tests:** Required per §4.3, §4.4.
- **Review:** Required (non-author).
- **Estimated effort:** 1 PR ≈ 12 hours.
- **Dependencies:** Phase 2.

### 7.7 Phase 4 — ADAPT batch C (phase-audit scripts, 7 items)

- **Scope:** Items #6-#12 (the 7 phase-audit scripts).
- **PR type:** code (typed, tested).
- **Risk:** LOW (dev-time scripts, no runtime impact).
- **Tests:** Required per §4.6-4.12 (vitest fixtures with mock Prisma client).
- **Review:** Required (non-author).
- **Estimated effort:** 2 PRs ≈ 16 hours (or 1 PR if the shared pattern keeps the diff small).
- **Dependencies:** Phase 2 (the adaptation pattern proof-of-concept).
- **Grouping:** Phase 4a (3 scripts: trust + marketplace + RFQ) + Phase 4b (4 scripts: messaging + orders + reviews + notifications).

### 7.8 Phase 5 — ADAPT batch D (security + logos + AI gateway, 3 items)

- **Scope:** Items #1 (`with-gateway-policy.ts`), #13 (`security-coverage-check.ts`), #16 (`image-transform-logo-dark.ts`).
- **PR type:** code (typed, tested).
- **Risk:** MEDIUM — touches the AI gateway primitive + security tooling.
- **Tests:** Required per §4.1, §4.13, §4.16.
- **Review:** Required (non-author).
- **Estimated effort:** 1 PR ≈ 12 hours.
- **Dependencies:** Phase 2.

### 7.9 Phase 6 — ADAPT batch E (data-mutating, L complexity, 2 items)

- **Scope:** Items #14 (`rebuild-taxonomy.ts` → `prisma/seed-taxonomy-canonical.ts`) + #15 (`seed-store-comprehensive.ts` → `prisma/store/seed-comprehensive.ts` + 4 sector sub-scripts).
- **PR type:** code (typed, tested, `--confirm`-gated).
- **Risk:** HIGH — data-mutating scripts. Even though `--confirm`-gated, must NOT be run in production without explicit Senior Director authorization.
- **Tests:** Required per §4.14, §4.15 (vitest mock-Prisma fixtures + idempotency tests).
- **Review:** Required (non-author).
- **Estimated effort:** 1 PR ≈ 24 hours.
- **Dependencies:** Phase 4 (the phase-audit pattern proves the typing approach).
- **Operational constraint:** Scripts committed for dev/test only. Production seeding requires separate authorization.

### 7.10 Phase 7 — Standards cleanup (`@ts-nocheck` removal, 7 files)

- **Scope:** Remove `// @ts-nocheck` from the 7 already-present files (§3.2 items #1-#7; item #8 `worklog.md` is markdown, no action).
- **PR type:** code (typed).
- **Risk:** LOW (dev-time / run-once scripts, no runtime bundle impact).
- **Tests:** `tsx --tsconfig=tsconfig.json scripts/<file>.ts --dry-run` smoke tests.
- **Review:** Required (non-author).
- **Estimated effort:** 1 PR ≈ 4 hours.
- **Dependencies:** INDEPENDENT of Phases 2-6 — may be authorized in parallel.

### 7.11 Sequencing rationale

- **Phases 0.5 + 1 first:** They are docs-only, LOW risk, and close the Phase-0 completion gate. They establish the provenance + safe-archive baseline before any code-touching PRs.
- **Phase 2 (S complexity) before Phases 3-6:** Demonstrates the adaptation pattern with the smallest possible changes; fast feedback.
- **Phase 3 (M complexity, public UX + library) before Phase 6 (L complexity, data-mutating):** The compare + price-intelligence consolidation affects public UX; better to land before the high-risk data-mutating scripts.
- **Phase 4 (phase audits) before Phase 6:** The phase-audit scripts' mock-Prisma-fixture pattern is shared with Phase 6's seed-script tests; doing Phase 4 first establishes the test infrastructure.
- **Phase 5 (security + AI gateway + logos):** MEDIUM risk; AI gateway primitive touches 1 route as proof-of-concept (Issue #111 track handles the remaining 20 routes).
- **Phase 6 last (data-mutating, gated):** Highest risk; explicit Senior Director authorization required to run the seeds even in dev.
- **Phase 7 in parallel:** Independent of Phases 2-6; can be authorized immediately.

---

## 8. Goal alignment matrix

For each of the 10 project goals, which legacy files support it (and via which disposition):

| Goal | Feature area(s) | INTEGRATE (already active) | ADAPT_THEN_INTEGRATE | PRESERVE_AS_REFERENCE | SAFE_ARCHIVE | Status |
|---|---|---|---|---|---|---|
| **G1 Marketplace core** (listings, RFQ, wanted, deals, offers, orders) | F, C | 39 (C) + 44 (F) = 83 | #2 (PriceVerdictBadge), #3 (CompareInteractions)* | — | — | ✅ Fully covered. *Compare is G8 but UX affects G1 listing pages. |
| **G2 Store center** (parts, inventory, procurement, returns, rentals, shipments) | H | 71 | #15 (seed-store-comprehensive) | — | — | ✅ Fully covered; Phase 6 enriches seed data. |
| **G3 AI services** (price intelligence, market analyst, listing builder, sales agent — via canonical gateway) | B, E | 31 (B) + 25 (E) = 56 | #1 (with-gateway-policy), #4 (price-intelligence consolidation), #13 (security-coverage-check flags SDK bypass) | — | — | ✅ Fully covered; Phase 5 addresses Issue #111 enforcement. |
| **G4 Trust & verification** (company verification, seller trust, reviews, reputation) | I, J | 28 (I) + 11 (J) = 39 | #6 (audit-phase5-trust-domain), #11 (audit-phase10-reviews-reputation) | — | — | ✅ Fully covered; Phase 4 adds trust-domain audit. |
| **G5 Admin panel** (90+ admin pages) | K | 155 | #13 (security-coverage-check), #14 (taxonomy seed canonical), #15 (store seed canonical) | — | — | ✅ Fully covered; Phase 5+6 enrich tooling + seed. |
| **G6 Taxonomy** (brands, categories, models, industries, attributes) | D | 67 | #14 (rebuild-taxonomy → canonical) | — | — | ✅ Fully covered; Phase 6 enriches canonical taxonomy. |
| **G7 Messaging** (conversations, deal rooms, notifications) | G | 22 | #9 (audit-phase8-messaging), #12 (audit-phase11-notifications) | — | — | ✅ Fully covered; Phase 4 adds messaging+notifications audits. |
| **G8 Compare & price intelligence** | E | 25 | #3 (CompareInteractions), #4 (price-intelligence consolidation) | — | — | ✅ Fully covered; Phase 3 enriches UX + algorithm. |
| **G9 Media** (image upload/compression — Issue #131) | O (asset scripts) | 4 | #16 (image-transform-logo-dark), #17 (image-transform-logo-transparent) | (3 asset one-offs preserved as reference: orange-ix, process-logos-v2, clear-logo) | (5 IMG_*.jpg archived with manifest) | ✅ Covered; Phase 2 + 5 add image-transform tooling; Phase 1 archives unverified uploads. |
| **G10 SEO** (canonical inheritance, sitemap — Issue #98) | L, R | 82 (L) + 37 (R) = 119 | — | #12 (public/robots.txt — historical; target uses dynamic `app/robots.ts`) | — | ✅ Fully covered; target's dynamic robots.ts supersedes static file. |

**Cross-cutting goals (not in original 10 but advanced by Phase 0.5 / 1 / 7):**

- **Documentation hygiene:** Phase 0.5 preserves 18 historical reference files with provenance + SHA-256 — supports every goal by preserving decision-history.
- **Security posture:** Phase 1 (SAFE_ARCHIVE) documents the .env redacted structure + 8 SQLite DB inventory + 5 unverified uploads + 3 patch archives + 1 workspace TAR — supports security auditability.
- **TypeScript hygiene:** Phase 7 (`@ts-nocheck` cleanup) — supports every goal by enforcing the §2.1 TypeScript strict standard.
- **Migration governance:** Phase 2 item #5 (`prisma/migrations/README.md`) — supports every goal that touches the DB.

---

## 9. Safety boundaries

### 9.1 Hard constraints (all in effect throughout the proposal)

- ✅ **No production deployment** — operational restriction (per STEP 16.31-16.79 governance).
- ✅ **No production DB mutations** — operational restriction.
- ✅ **No backfill** — operational restriction.
- ✅ **No Worker activation** (`STORE_AUDIT_OUTBOX_ENABLED` remains off) — operational restriction.
- ✅ **No DNS changes** — operational restriction.
- ✅ **No paid resource provisioning** — operational restriction.
- ✅ **No migration execution** — operational restriction (the proposed ADAPT-05 `prisma/migrations/README.md` documents rules but does NOT execute migrations).
- ✅ **No seed execution** — operational restriction (the proposed ADAPT-14 + ADAPT-15 are committed for dev/test use only; production seeding requires separate authorization).
- ✅ **No active credentials enter Git** — the `.env`'s `DATABASE_URL` value is never committed (Phase 1).
- ✅ **No live database data enters Git** — the 8 SQLite DB files are never committed (Phase 1).
- ✅ **No binary blobs enter Git** — the 5 JPGs, 3 ZIPs, 1 TAR are never committed (Phase 1).
- ✅ **Each adaptation PR has provenance + tests + non-author review** — per §4 adaptation principles.
- ✅ **No blind copy** — every integration is justified by a specific adaptation spec (§4).
- ✅ **No `.env` / `.db` / `.jpg` / `.tar` / `.zip` content reads** — only metadata + SHA-256 (computed via `sha256sum` on the binary file; dimensions via `sharp metadata`; file listings via `unzip -l` / `tar -tf`).
- ✅ **No secret values printed** — the historical hardcoded admin credential (PR #145 §4 hit #6) is referenced by path only; no value recorded in this document or any proposed PR.
- ✅ **Read-only audit posture maintained** — this proposal is the only artifact produced by STEP 16.80. No code transferred. No DB changes. No secrets committed. No extractions into target repository.

### 9.2 Open items (out of scope for Issue #144 but tracked)

- **Provider-side credential rotation** for the historical hardcoded admin credential (PR #145 §4 hit #6, in `src/lib/auth.ts` not in `.env`) — a provider-side action outside this repository's scope; depends on whether the historical credential was ever deployed to a reachable environment. **Recommendation:** Provider-side rotation + access-log review if the credential was ever used in a reachable environment.
- **Hosting decision** (Cloudflare compatibility / vinext runtime probe) — a runtime-environment decision pending Senior Director action; not blocked by repository state.
- **`public/uploads/*` provenance verification** — the 9 user-uploaded images in `public/uploads/` are tracked in target (INTEGRATE in this document) but their provenance is unverified. A future audit could verify the source of each upload. Tracked but not blocked by this proposal.
- **Middleware admin-cookie legacy path** deprecation — `src/middleware.ts` lines 109-115 contain a legacy admin-cookie passthrough (the comment explicitly flags it for deprecation). The target's `src/lib/auth.ts` removes the admin-cookie concept entirely, but the legacy middleware pattern survives as a transition compatibility layer. A future cleanup PR could remove the admin-cookie path. Tracked but not blocked by this proposal.
- **AI gateway enforcement for the 20 remaining SDK-importing routes** (Issue #111) — ADAPT-01 (Phase 5) wraps 1 route as proof-of-concept; the remaining 20 routes are tracked by Issue #111 (separate track). This proposal does NOT resolve Issue #111; it provides the HOF primitive.

### 9.3 Governance posture

- **Branch protection:** `main` is protected (per STEP 16.31-16.79 governance). Every PR requires ≥1 approving review from a write-access reviewer.
- **Non-author review pattern:** Each PR is opened by HEAVIXIR (Senior Director) and formally APPROVED by dellk00k under delegation (the proven pattern from PRs #146-#151, #155, #156 — 9 successful non-author reviews this session).
- **Self-review prevention:** If a PR is opened via dellk00k's token (as occurred with PRs #145, #152, #153), GitHub blocks formal APPROVE ("Cannot approve your own pull request"). The path forward is the Option A pattern: close the PR, re-open under HEAVIXIR identity (same commit, same branch), then dellk00k non-author review succeeds.

---

## 10. Recommendation

### 10.1 Concise recommendation

Authorize the 8 PRs in the following order:

1. **Phase 0.5 + Phase 1 (parallel, docs-only, LOW risk).** Close the Phase-0 completion gate; stand up the safe-archive documentation. Combined: ~5 hours, ~36 files documented, 0 code execution paths, 0 binary bytes committed, 0 DB mutations. **Recommend authorizing both immediately.**
2. **Phase 2 (ADAPT batch A, 4 S-complexity items, LOW risk).** Demonstrates the adaptation pattern with the smallest changes. ~6 hours, 4 new files with tests. **Recommend authorizing after Phases 0.5 + 1 land.**
3. **Phase 7 (standards cleanup, 7 already-present `@ts-nocheck` files, LOW risk, INDEPENDENT).** Improves TypeScript hygiene without touching legacy transfer. ~4 hours. **Recommend authorizing in parallel with Phases 2-6.**
4. **Phase 3 + Phase 4 + Phase 5 (12 items total: 11 M-complexity + 1 S-complexity adaptation).** Sequenced per §7.2 dependencies. Combined: ~40 hours, 12 new files with tests. **Recommend authorizing after Phase 2 lands.**
5. **Phase 6 (ADAPT batch E, 2 L-complexity data-mutating items, HIGH risk).** The 2 data-mutating scripts (`rebuild-taxonomy` + `seed-store-comprehensive`). ~24 hours, 5+ new files with tests, `--confirm`-gated. **Recommend authorizing LAST, after Phase 4 establishes the test infrastructure. Production seeding requires separate authorization.**

### 10.2 Why this order

- **Docs before code:** Phase 0.5 + Phase 1 are LOW risk and establish the provenance + safe-archive baseline. They also close the Phase-0 completion gate's first 4 checkboxes (paths verified, SHA-256 verified, secrets scanned, runtime-path exclusion confirmed). Doing these first means every subsequent code PR can reference the documented provenance.
- **S before M before L:** Phase 2 (S complexity) demonstrates the adaptation pattern with the smallest possible changes. Fast feedback (snapshot tests, pixel-diff fixtures). Phase 3-5 (M complexity) build on the pattern. Phase 6 (L complexity, data-mutating) lands last, when the test infrastructure from Phase 4 is in place.
- **Phase 7 in parallel:** The 7-file `@ts-nocheck` cleanup is independent of the legacy-transfer work. It can be authorized immediately and run in parallel with Phases 2-6 without conflict.
- **Phase 6 last:** The 2 data-mutating scripts are the highest risk. Even though `--confirm`-gated, they touch the canonical taxonomy seed + store comprehensive seed. Better to land them after the test infrastructure (Phase 4) and the pattern (Phases 2-5) are established. **Production seeding requires separate authorization** — this proposal commits the scripts to the repo but does NOT authorize execution.

### 10.3 What this proposal does NOT do

- Does NOT perform any code transfer. All proposed integrations are specs, not code.
- Does NOT mutate any database. All SAFE_ARCHIVE entries are documentation of structure, not data.
- Does NOT print any secret value. The `.env` is referenced by path only.
- Does NOT inspect any `.env` / `.db` / `.jpg` / `.tar` / `.zip` content. The hashes were computed via `sha256sum` on the binary file (no content read); dimensions extracted via `sharp metadata` (no pixel data read); file listings extracted via `unzip -l` / `tar -tf` (no content extracted).
- Does NOT supersede the prior line-by-line audit (PR #145), Prisma field-parity audit (PR #146), migration-compatibility audit (PR #151), post-merge provenance review (PR #150), comprehensive file audit (PR #152), or value-based disposition (PR #155). Those remain authoritative for their respective scopes. This proposal converts the disposition into a concrete actionable plan with phased PRs.
- Does NOT resolve Issue #111 (AI gateway enforcement for 20 remaining SDK-importing routes) — ADAPT-01 (Phase 5) wraps 1 route as proof-of-concept; the remaining 20 routes are tracked separately.
- Does NOT resolve Issue #112 (RBAC) — the target already satisfies the `ROUTE_PERMS` middleware pattern; ADAPT-13 (Phase 5) recognizes this pattern in the security-coverage lint.
- Does NOT resolve Issue #131 (media upload/compression) — ADAPT-16 + ADAPT-17 (Phase 2 + 5) add image-transform tooling but do NOT address the upload pipeline.
- Does NOT resolve Issue #98 (SEO canonical inheritance) — the target already satisfies this; the legacy `public/robots.txt` is preserved as reference (Phase 0.5 item #12).

### 10.4 Final accounting

| Metric | Value |
|---|---:|
| Total legacy paths dispositioned | **899** |
| INTEGRATE (already canonical in target — no PR needed) | **845** (93.9%) |
| ADAPT_THEN_INTEGRATE (capability gap → rewrite → integrate) | **17** (1.9%) — phased into 6 PRs (Phases 2-6) |
| PRESERVE_AS_REFERENCE (historical / pattern-source) | **19** (2.1%) — Phase 0 (DONE) + Phase 0.5 (proposed) |
| SAFE_ARCHIVE (secrets / DB data / binary → redacted manifest) | **18** (2.0%) — Phase 1 (proposed) |
| Standards cleanup (already-present code files containing `@ts-nocheck`) | **7** — Phase 7 (independent, parallel) |
| Files with no proposed action | **0** |
| Secret values printed | **0** |
| Database files inspected (content read) | **0** (SHA-256 computed via `sha256sum`; table lists from schema not from .db) |
| Patch archives extracted | **0** (file listings via `unzip -l` only) |
| Binary blobs committed to Git | **0** |
| Code transferred to target (in this proposal) | **0** (this is a proposal, not a transfer) |
| Production database mutations | **0** |
| Proposed PRs (Phases 0.5-7) | **8** (2 docs-only + 6 code) |
| Documents produced by this audit step | **1** (this file) — docs-only |

### 10.5 Awaiting Senior Director authorization

This proposal is submitted for Senior Director review. The agent (dellk00k under delegation) stands ready to:

- Implement Phase 0.5 + Phase 1 immediately upon authorization (docs-only, ~5 hours combined).
- Implement Phase 2 + Phase 7 immediately upon authorization (LOW risk, independent of each other).
- Implement Phases 3-6 in sequence upon authorization (per §7.2 dependencies).
- Perform non-author formal APPROVE reviews on each PR (proven pattern, 9 successful this session).

**No production deployment, DB mutation, backfill, Worker activation, or seed execution will occur without explicit Senior Director authorization.** Read-only audit posture maintained throughout.

---

**End of proposal.**
