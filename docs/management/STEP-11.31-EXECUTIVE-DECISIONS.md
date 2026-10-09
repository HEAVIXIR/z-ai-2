# STEP 11.31 — Executive Decisions

- **Date:** 2026-10-09
- **Author:** Executive agent (acting as /ceo)
- **Repository:** HEAVIXIR/z-ai-2
- **Main SHA:** `c4f11bf` (post PR #11 merge)
- **Principle:** Security and data-ownership correctness take priority over delivery speed. Management approval and technical evidence are two separate requirements. No PR merges because CI is green; no PR is blocked without a documented reason.

## 1. PR Ranking (by risk × value × cost × dependency)

| PR | Risk | Value | Cost | Dependency | Priority |
|---|---|---|---|---|---|
| **PR #11 (PR-SC-00)** — tenant-scoping | BLOCKER (fixes A4) | H (security foundation) | M (15 files + 51 tests + CI) | none | **P0 — DONE** |
| **NEW-C1 fix** — legacy `/api/admin/listings/*` admin-gate | BLOCKER (pre-existing bypass) | H (closes seller-data leak) | L (add `isAdmin` gate to ~4 routes) | PR #11 (DONE) | **P0 — NEXT** |
| **PR-SC-05** — Dashboard (real KPIs) | L (read-only aggregate) | H (30-day baseline for all growth claims) | M | NEW-C1 | P1 |
| **PR-SC-06** — CRM API/UI | M (first seller-facing AI route) | H (closes PR-SC-01 deferred gate) | M-H | NEW-C1 + PR #9 (DONE) | P1 |
| **PR-SC-03** — Machine Passport schema | L (additive schema only) | M (unblocks PR-SC-07) | L-M | none (parallel-friendly) | P2 |
| **PR-SC-04** — Store Identity | L (2 new Company fields) | M (trust signal) | L | NEW-C1 | P2 |
| **PR-SC-08** — VIP Showroom | M (subscription enforcement) | H (revenue) | H | NEW-C1 + PR-SC-04 + PR-SC-03 (soft) | P3 |
| **PR-SC-07** — Passport UI | L | M (trust UX) | M | PR-SC-03 | P3 |
| **PR-SC-09** — AI Business Layer | M (AI cost + quality) | H (product differentiation) | H | PR-SC-05 + PR-SC-06 | P3 |
| **R11 fix** — migrate 22 AI routes to Gateway | M (refactor) | H (security + cost governance) | M-H | overlaps PR-SC-09 | P3 |
| **SEO Phase 1** — metadata + JSON-LD | L | M (organic growth) | M | none (independent track) | P3 |
| **Stage 7 — Ecosystem** | H (legal) | H (revenue) | H | **GATED — legal clearance** | **BLOCKED** |

## 2. Merge Decisions (evidence-based)

### PR #11 (PR-SC-00 — Universal API Tenant Scoping) — **MERGED**

| Gate | Evidence | Status |
|---|---|---|
| G0 Canonical | main=`f597562` → `c4f11bf`; PR #11 head=`0ad24c7` (verified from GitHub API) | ✅ |
| G1 Scope | 16 files (tenant-scope.ts, types.ts, data-adapter.ts, action-engine.ts, bulk-export-engine.ts, listing.ts, 5 route files, 3 test files, 1 doc, ci.yml) — all tenant-scoping + CI, no unrelated changes | ✅ |
| G2 Security | CI integration test 19/19 assertions pass in real PostgreSQL (postgres:17 CI service); /Critic independent review: CAN merge, 0 blockers; negative tests: Seller A cannot list/get/patch/delete Seller B's listings; owner-reassignment rejected; forged-owner CREATE rejected; anonymous deny-all | ✅ |
| G3 Functional | typecheck 0 errors; eslint 0 errors; 51 unit/wiring tests pass; 392/392 security+unit tests pass (no regressions); CI build green | ✅ |
| G4 Database | No schema change; integration test runs against real PG in CI (postgres:17 service, DATABASE_URL set, schema pushed, RBAC seeded) | ✅ |
| G5 CI | `verify=success` on `0ad24c7` (GitHub Actions run 37981723334) | ✅ |
| G6 Critic | Independent /Critic: "PR #11 CAN merge" — 10 CONFIRMED, 2 REPRODUCED, 5 FIXED, 6 VERIFIED, 0 UNVERIFIED; 0 blockers | ✅ |
| G7 Merge | Decision: MERGE — all gates met, security is a strict improvement, no regression | ✅ |
| G8 Post-merge | main=`c4f11bf`; PR #11 state=closed merged=True; CI on c4f11bf: verify=success | ✅ |

**Pre-merge SHA:** `f597562`
**Post-merge SHA:** `c4f11bf`
**Merge commit:** `c4f11bf` (squash)
**CI URL:** https://github.com/HEAVIXIR/z-ai-2/actions/runs/37981723334

### PR #9 (Lead CRM Foundation) — **MERGED** (STEP 11.30)

- **SHA:** `6881f2a` → merge `c66e060`
- **CI:** verify=success
- **Review:** Phase C independent review — 0 blockers, Lead Score v1 valid, migration additive
- **Status:** COMPLETE

### PR #10 (STEP 11.29 Research Docs) — **MERGED** (STEP 11.30)

- **SHA:** `a092233` → merge `f597562`
- **CI:** verify=success
- **Review:** Phase D independent review — 8 docs consistent, CI green
- **Status:** COMPLETE

## 3. Outstanding Risks

| Risk | Severity | Owner | Next Action | Release Gate |
|---|---|---|---|---|
| **NEW-C1** — legacy `/api/admin/listings/*` bypasses tenant-scoping; SELLER can list/get/patch/bulk-modify ANY seller's listings + reassign `sellerId` (steal listings) | **BLOCKER** | Engineering | Fix: add `isAdmin` gate (or tenant-scope) to legacy routes | No seller-scoped UI ships until this is fixed |
| **R-2** — only 1 of 36 resources has `ownership` declared | HIGH | Engineering | Add ownership config per-PR as each seller-scoped resource is developed | Per-PR merge gate (mandatory cross-seller negative test) |
| **R-3/R11** — 22 AI routes bypass AI Gateway; 5 have NO auth | HIGH | Engineering | Phase 1 hotfix: auth-gate the 5 unauthenticated routes immediately; Phase 2: migrate all 22 to Gateway (overlaps PR-SC-09) | PR-SC-09 merge gate |
| **H3** — action-engine `findUnique` not tenant-filtered (defense-in-depth gap) | MEDIUM | Engineering | Change to `findFirst` with tenant filter in a follow-up | Not blocking (row discarded on rejection) |
| **M3** — store-DB TOCTOU (non-transactional path) | MEDIUM | Engineering | Document as known limitation (ADR-003); monitor | Not blocking (cross-DB limitation) |
| **SEO C1-C14** — 14 critical SEO issues (5 pages missing generateMetadata, sitemap gaps, no JSON-LD, `/sellers/[id]` public PII) | MEDIUM | Engineering | SEO Phase 1 PR (independent track) | Not blocking Store Center |
| **Financing/investment** | GATED | Owner + Legal | Legal review + partner contracts + ADR-006 | Stage 7 — no engineering until legal clearance |

## 4. Management Principles (enforced)

1. **Security > speed.** No seller-scoped UI ships without verified server-side ownership enforcement. PR #11 is merged; NEW-C1 must be fixed next.
2. **Management approval ≠ technical evidence.** Both are required independently. CI green is necessary but not sufficient. Independent /Critic review is mandatory.
3. **No unauthorized scope expansion.** Each PR touches only its declared files. PR #11 had 16 files — all tenant-scoping + CI, no unrelated refactor.
4. **No aggregate migrations.** Each schema change is in its own PR with its own rollback. PR-SC-01 (Lead), PR-SC-03 (Passport), PR-SC-08 (Showroom) are separate.
5. **AI is advisory-only.** No autonomous mutations. All AI through the Gateway. Tenant isolation enforced at the data-adapter layer (not the prompt layer).
6. **Financing/investment remain GATED.** No de-gating without legal sign-off + partner contract + ADR-006 + owner approval.

## 5. Next Actions

### Immediate (P0)
1. **NEW-C1 fix** — add `isAdmin` gate to legacy `/api/admin/listings/*` routes. This is the root gate for all seller-scoped UI. Until it's fixed, no PR-SC-04/05/06/07/08 may merge.
2. **R-3 Phase 1 hotfix** — auth-gate the 5 unauthenticated AI routes (`/api/ai-search`, `/api/ai-seller-assistant`, `/api/ai-price-suggestion`, `/api/ai-listing-builder`, `/api/compare/[id]/ai-summary`).

### Next sprint (P1)
3. **PR-SC-05** — Dashboard with real KPIs (30-day baseline capture). Critical path.
4. **PR-SC-06** — CRM API/UI (Lead status workflow + dynamic cross-seller negative test — closes the PR-SC-01 deferred gate). Critical path.
5. **PR-SC-03** — Machine Passport schema + algorithm + backfill (parallel-friendly, no UI).

### Later (P2-P3)
6. PR-SC-04 (Store Identity), PR-SC-07 (Passport UI), PR-SC-08 (VIP Showroom), PR-SC-09 (AI Business Layer), R11 full migration, SEO Phase 1.

### Blocked
7. Stage 7 (Ecosystem) — financing/leasing/investment. GATED until legal clearance.

## 6. Status Summary

| Item | IMPLEMENTED | FUNCTIONAL | VERIFIED | MERGED | COMPLETE |
|---|---|---|---|---|---|
| PR #8 (UX + ADR-005) | ✅ | ✅ | ✅ | ✅ `4566efd` | ✅ |
| PR #9 (Lead CRM) | ✅ | ✅ | ✅ | ✅ `c66e060` | ✅ |
| PR #10 (research docs) | ✅ | ✅ | ✅ | ✅ `f597562` | ✅ |
| **PR #11 (tenant-scoping)** | ✅ | ✅ CI green, 51+19 tests | ✅ /Critic PASS, 0 blockers | ✅ `c4f11bf` | ✅ |
| **NEW-C1 fix** | ❌ | ❌ | ❌ | ❌ | ❌ — P0 next |
| PR-SC-04/05/06/03/07/08/09 | ❌ | ❌ | ❌ | ❌ | ❌ — blocked by NEW-C1 |
| R11 full migration | ❌ | ❌ | ❌ | ❌ | ❌ |
| SEO Phase 1 | ❌ | ❌ | ❌ | ❌ | ❌ |
| Stage 7 (Ecosystem) | ❌ | ❌ | ❌ | ❌ | ❌ GATED |

**Management decision:** First security and data-ownership correctness (PR #11 ✅, NEW-C1 next), then core store capabilities (PR-SC-04/05), then CRM + AI (PR-SC-06/09), then revenue expansion. No PR merges because of pressure or green CI alone. Financing/investment remain GATED until legal clearance.
