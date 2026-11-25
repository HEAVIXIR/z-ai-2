# HEAVIX Operating Continuity & Execution Register

**Record date:** 2026-11-19 (UTC)  
**Purpose:** Canonical handoff record for future HEAVIX engineering sessions, technical leads, and senior operators.  
**Status:** Living register; update this file after every material decision, code change, CI result, blocker, or change of execution priority.

> This document is an operational index and handoff record. It does not replace the detailed source documents, GitHub issues, pull-request history, CI artifacts, or code. Always inspect the exact current branch head and linked evidence before acting.

## 1. Non-negotiable operating rules

1. **Integration is the active engineering destination:** `integration/preview-readiness-workerd-2026-11-15`.
2. **Main is Production.** Never merge PR #340, merge another Integration PR into Main, deploy Production, or change production infrastructure without separate explicit authorization and completed release gates.
3. **PR #340 stays Draft.** It is a validation vehicle, not release approval.
4. Do not mutate Production databases, perform Production/Store migrations, run taxonomy rebuilds/seeds against real databases, backfill production data, or enable workers without a separate reviewed authorization.
5. Preview database mutations remain gated: exact target identity, exact migration history and preconditions, paired encrypted Main+Store backup from the exact same commit, verified read-back checksums/restore evidence, explicit dispatch confirmation, and post-migration fingerprints. No ad-hoc writes.
6. **No paid provider/API/automation use or wallet top-ups.** Preserve free-tier constraints. Do not assume a provider is approved because it is connected.
7. Never weaken authentication, authorization, CSRF, tenant/object ownership, rate limits, audit, or data validation to make a test pass.
8. Distinguish evidence classes in every report: source/code inspection; automated CI; disposable integration/runtime test; Preview observation; Production observation. A green CI is not proof of Preview or Production acceptance.
9. User-provided product ideas are advisory input. They do not reorder the established engineering priorities unless the user explicitly asks to reprioritize.
10. Do not duplicate existing capabilities. Inspect current and legacy implementation before deciding KEEP / PORT / REWRITE / REJECT / HOLD.

## 2. Verified repository and PR state

- Repository: `HEAVIXIR/z-ai-2`
- Active branch: `integration/preview-readiness-workerd-2026-11-15`
- Draft PR: [#340](https://github.com/HEAVIXIR/z-ai-2/pull/340)
- The current PR head is authoritative in GitHub PR #340 metadata. Do not rely on a copied SHA in this living register; every session must re-fetch it before acting.
- PR state observed: OPEN, DRAFT, not merged; base `main`.
- The PR description explicitly prohibits Production deployment, database migration/seed, and Cloudflare Worker build. Workers Builds remains disconnected; Preview builds remain disabled pending release gates and separate owner approval.

### Exact-head CI evidence

The following GitHub Actions runs were fetched for the immediately preceding code/documentation head `9d13fe64315892d16682a4df8138c6da4fd0915a`:

| Workflow | Run | Result | Evidence |
|---|---:|---|---|
| CI | [#3766](https://github.com/HEAVIXIR/z-ai-2/actions/runs/44403856326) | completed / success | All returned jobs succeeded |
| OpenNext runtime integration proof | [#792](https://github.com/HEAVIXIR/z-ai-2/actions/runs/44403856993) | completed / success | Real App Router path exercised in built OpenNext Worker |

CI #3766 returned successful jobs: `Cloudflare compatibility (report-only)`, `tls-proof`, `verify`, `docker-build-proof`, `audit-transaction`, `Workerd runtime smoke (no database)`, and `phase-tests`.

OpenNext #792 returned successful steps including Worker build and real App Router path exercise. This is CI/runtime-artifact evidence only; it is not a live Preview deployment or Production proof.

**Explicitly skipped in CI #3766:** `Preview read-only paired migration diagnostics` and `Legacy archive inventory (read-only)`. Their skipped status must not be represented as completed evidence. The commit combined-status endpoint returned no separate status contexts; the successful GitHub Actions runs above are the available exact-head evidence.

The subsequent commits `23d74a...` and `e6e7e1...` updated this documentation register only; workflow-run lookups for those documentation commits returned no associated runs at the time of checking. Therefore CI/OpenNext success is verified for `9d13fe...`, **not** for later documentation-only heads. Re-check the PR head and Actions before relying on these results; discard stale SHA evidence after any further commit.

## 3. Canonical documentation index

The following documents already exist on the Integration branch. Read them before repeating analysis or implementation:

1. **Taxonomy source audit and canonicalization**  
   `docs/architecture/HEAVIX-TAXONOMY-CANONICALIZATION-SOURCE-AUDIT-2026-11-19.md`  
   Commit: `592d64ca75a0dedd9719842169c30649e8e1b3c6`  
   Scope: taxonomy seed/schema/API audit, canonical taxonomy design, cross-industry mapping, migration safety.

2. **Admin control plane, AI and listing lifecycle**  
   `docs/operations/HEAVIX-ADMIN-CONTROL-PLANE-AI-AND-LISTING-LIFECYCLE-2026-11-19.md`  
   Commit: `4bbd7251c57f9784b4d261167c69c13f2029a4c5`  
   Scope: admin editability, governance, design controls, AI image/research flows, listing lifecycle, acceptance criteria.

3. **Commercial entitlements, promotion and taxonomy governance**  
   `docs/operations/HEAVIX-COMMERCIAL-ENTITLEMENTS-PROMOTION-TAXONOMY-GOVERNANCE-2026-11-19.md`  
   Commit: `a98fc86b2a9dcdaf179571e5f218e1bffaadfba1`  
   Scope: free/premium listing submission, post-publication promotion, time-limited feature trials, RBAC, payment boundaries, governance and tests.

4. **Intent intelligence, demand memory and matching**  
   `docs/architecture/HEAVIX-INTENT-INTELLIGENCE-DEMAND-MEMORY-MATCHING-2026-11-19.md`  
   Commit: `9d13fe64315892d16682a4df8138c6da4fd0915a`  
   Scope: existing recommendations, saved searches, BuyRequest and analytics; long-term demand matching, privacy/consent, notifications, AI guardrails. This is a future extension and does not reorder P0 work.

These documents are design/audit records unless a corresponding implementation and runtime evidence is explicitly linked. Do not treat documentation as proof that a feature is implemented.

## 4. Established engineering priorities — preserve this order

### P0 — Integration stability and exact-head evidence
- Re-fetch PR #340 and verify exact head, draft/open state, and all CI runs before each major continuation.
- Keep fixing test/runtime failures on Integration only; record exact failing test, root cause, fix commit, and exact-SHA rerun.
- Keep OpenNext/Workerd runtime proof distinct from live Preview availability.
- Preserve slow-network and resilient-loading requirements; verify with measurable bundle/network/runtime evidence, not assumptions.

### P0 — Listing lifecycle and transaction completeness
- Complete and behaviorally verify the full listing lifecycle, including draft, submit, moderation, approval/rejection/changes, publication, pause, expiry, sold/rented/fulfilled/closed/archive, seller edits/re-review, renewals, and lead/status handling.
- Complete structured WANTED/BuyRequest flows and durable quantity/specification persistence; current listing creation path is not proof that WANTED is complete.
- Complete the distinction between rental offer and rental request.
- Preserve service, auction, RFQ and other existing domain contracts; do not introduce parallel models without source-backed justification.
- Add end-to-end and permission-negative tests for each material state transition.

### P0/P1 — Capability transfer fidelity and security
- Continue source-backed legacy/current capability comparison. Classify each candidate KEEP / PORT / REWRITE / REJECT / HOLD.
- Preserve canonical routes, services, models and UI consumers. Do not copy stale legacy endpoints or SQLite migrations.
- Prioritize Admin API authorization, AI provider boundaries, tenant/object scope, CSRF, SSRF, uploads, webhook/worker auth, audit and rate/budget controls.
- Resolve the client-supplied `userId` concern in `/api/analytics/track`: derive identity server-side and reject/ignore spoofed identity; add tests before relying on behavioral analytics.

### P1 — Taxonomy and subject profile
- Produce a source-backed taxonomy inventory and read-only Preview export when a safe approved read-only path is available.
- Reconcile canonical identities, bilingual labels, stable IDs/slugs, parent hierarchy, old-ID crosswalk, application/industry many-to-many mapping, and attribute profiles.
- One canonical equipment type can serve multiple industries through application relations; do not duplicate the subject identity per industry.
- Keep subject type, industry/application, configuration/variant, capacity class, brand/model/generation and technical profile distinct.
- Do not execute `rebuild-taxonomy.ts` or broad seed scripts against real data. Review dry-run output and migration semantics first.

### P1 — Admin control plane and AI operations
- Verify existing brand/category create/edit/research/approval surfaces before adding anything.
- Verify category-image generation and brand-research agents end to end: route → policy → provider/model → persisted draft → admin review → approval → public display.
- Keep brand logos provenance-backed and admin-approved; never fabricate official logos.
- Centralize AI gateway controls: consent/privacy, prompt-injection checks, schema validation, budget/rate limits, audit/provenance, idempotency, retries and safe fallback.
- No paid provider use by default.

### Later — Monetization and demand intelligence
- Free listing submission must remain possible without payment; optional paid promotion must not bypass moderation or imply guaranteed publication.
- Premium promotion must be measurable and honest; do not promise uplift without evidence.
- Trial entitlements must be separate from paid subscriptions, time-limited, revocable, audited and enforced server-side.
- Demand matching may use only permitted/consented signals; retain and govern old requests; provide opt-in channel preferences and unsubscribe controls.
- These are recorded requirements, not a reason to divert from the P0 work above.

## 5. Known implementation facts and gaps (source-audit baseline)

### Listing wizard and APIs
- Existing seven-step wizard: transaction type → category → brand/model + title/short description → dynamic attributes → location → details/media → review/submit.
- Existing endpoints include transaction types, taxonomy, category detail, brand search, category attributes, locations, media staging and listing creation.
- Listing creation validates authentication, CSRF, transaction/category, brand/model relation, staged image ownership, location hierarchy and attributes; it atomically creates the Listing and related attributes/images and sets moderation pending. Media sidecar processing is deferred/retryable.
- This is source-level/API evidence, not complete lifecycle acceptance.
- Known gaps: full dynamic subject-profile resolver; structured WANTED quantity/spec persistence and canonical BuyRequest relationship; complete rental offer/request separation; seller lifecycle transitions and end-to-end acceptance.

### Taxonomy
- `prisma/seed-taxonomy-v11.ts` describes 14 roots (7 CATALOG, 4 MARKETPLACE, 2 SERVICE, 1 FALLBACK), 16 application industries, 9 service types, 6 transaction types and 30+ category/application links.
- `prisma/seed-machine-taxonomy.ts` describes 16 L1, approximately 182 L2 and 104 L3 machine taxonomy entries. It can alter hierarchy and deactivate branches; dry-run is default and `--apply` writes. Never run blindly.
- Excavator has duplicate identity candidates across road construction/mining; canonicalize the subject and use application relations.
- Public taxonomy API currently exposes active categories through level <=2, while machinery has deeper nesting; progressive traversal needs verification.
- These are code/source findings, not a live database row-count assertion.

### Recommendations and demand signals
- Existing recommender in `src/lib/recommendations.ts` primarily uses favorites and category/brand affinity; recommendations are stored in `UserRecommendation`.
- Existing models/routes include `SearchQuery`, `SavedSearch`, `BuyRequest`, `AnalyticsEvent`, and recommendation click/dismiss handling.
- Search logs exist, but do not prove a durable, privacy-governed intent profile or long-term BuyRequest-to-future-listing matching.
- SavedSearch preferences do not prove scheduler reliability, notification delivery, retries, unsubscribe, or end-to-end provider operation.
- Review server-side identity on analytics tracking before expanding behavioral use.

### AI agents
- Existing registry includes `brand-researcher`, `category-image-gen`, `listing-enricher`, `stale-listing-detector`, and `moderation-agent`.
- Existing admin surfaces include category batch image generation and basic brand administration. Do not assume full workflow maturity without end-to-end proof.
- Agent bookkeeping, provider policy, retries, idempotency, quotas and admin approval need verification.

## 6. Database and release safety

- Main and Store are separate PostgreSQL databases with separate Prisma histories.
- Paired Preview migration workflow requires `APP_AND_STORE_PREVIEW_ONLY`, explicit confirmation `APPLY_REVIEWED_ADDITIVE_MIGRATIONS_TO_PREVIEW`, and a successful paired encrypted B2 backup from the exact same commit.
- The workflow verifies exact branch/SHA, backup workflow/run, encrypted objects/checksums, backup manifest, database OIDs/system identifiers, migration histories, schema preconditions, then applies reviewed migrations and checks post-state.
- Preview diagnostics and backup workflows exist, but CI #3766 skipped Preview diagnostics. No migration is authorized or claimed as applied by this record.
- GitHub connector actions inspected so far do not provide a verified workflow-dispatch capability. Do not claim to dispatch a workflow unless a supported action is discovered and its result is confirmed.
- No Production migration, seed, backfill, deployment, or Worker activation is authorized.

## 7. Next actions for the next engineering session

1. Re-fetch PR #340; verify its current head and that it remains Draft/open.
2. Re-check CI and OpenNext on the current exact head. If new commits exist, discard stale SHA evidence and rerun.
3. Review Issue #344 and its comments for the active work items and update status only with source-backed evidence.
4. Resume the existing P0 listing lifecycle and integration work; do not switch priority to commercial or demand-intelligence features.
5. Audit and fix analytics identity spoofing risk in a narrow Integration-only change with behavioral tests.
6. Continue Admin/API security and capability-transfer evidence; do not infer authorization from a static marker count.
7. Obtain read-only Preview taxonomy evidence only through a supported, approved path; otherwise record a precise blocker.
8. Update this register and the relevant issue/PR with each meaningful result, including SHA, test/run IDs, evidence links, remaining gaps and rollback notes.

## 8. Required update format for every future handoff

For each work session, append/update:
- **Timestamp and operator/session**
- **Branch and exact starting/ending SHA**
- **Objective and priority**
- **Files/routes/models/issues changed**
- **Decision rationale and alternatives rejected**
- **Tests executed and exact outcomes**
- **CI workflow/run IDs and exact SHA**
- **Runtime/Preview/Production evidence class**
- **Security/data/privacy review**
- **Side effects performed or explicitly not performed**
- **Open blockers and owner/action**
- **Next smallest safe action**
- **Links to issue, PR, commit and artifacts**

Never write “done”, “fixed”, “green”, “deployed”, “migrated”, or “complete” without stating the evidence class and exact source of proof.


## 2026-11-19 — Latest verified continuation addendum (supersedes older SHA snapshots)

- Latest inspected Integration HEAD: `b56e73b1b49f7649adaadba5cdd7a6e1933bed4f` (re-fetch before future writes).
- PR #340: OPEN, DRAFT, base `main`; not merged. Workers Builds remains disconnected and Preview builds disabled. No Production deployment, migration, seed, Worker activation or infrastructure change is authorized.
- Exact-head CI: run #44406718607 SUCCESS. Seven jobs passed: `phase-tests`, `Workerd runtime smoke (no database)`, `audit-transaction`, `Cloudflare compatibility (report-only)`, `tls-proof`, `verify`, `docker-build-proof`. Preview paired-migration diagnostics and legacy archive inventory were SKIPPED, not passed.
- Exact-head OpenNext runtime proof: run #44406718688 SUCCESS, including Worker build and real App Router path smoke without DB credentials. This is not live Preview or Production proof.
- P0 listing audit found a concrete WANTED gap: listing wizard submits WANTED through `POST /api/listings` without creating canonical `BuyRequest`; dedicated `POST /api/wanted` is disconnected from wizard. Current BuyRequest persistence loses quantity (audit-only) and canonical taxonomy IDs/specification values (free-text category/brand mapping).
- Issue #345 created: https://github.com/HEAVIXIR/z-ai-2/issues/345. This issue is now the tracked P0 implementation vehicle for WANTED/BuyRequest integration and structured persistence.
- No application code/schema/migration/seed or data mutation occurred in this audit batch. No Preview/Production deployment, secret read/write, paid provider call, DNS change or Worker activation occurred.
- Next: legacy parity audit + canonical BuyRequest/Listing relationship decision, then narrow implementation and tests. Do not bypass paired encrypted Backblaze B2 backup, exact DB identity and explicit Preview migration gates.


## 2026-11-19 — WANTED legacy parity and consumer findings

- Legacy reference inspected at `dellk00k/z@bbb1f4947e4b1a05e39f7b510c5c7801d52389e7`. Legacy had a separate request form/API with title, description, free-text category/brand, SALE/RENT, budget, location, deadline and contact; it did not provide structured quantity/specification persistence. Legacy also had overlapping request endpoints. Treat structured quantity/specification as a target gap, not as a proven legacy regression; do not port legacy request routes without security adaptation.
- Additional current defects recorded on Issue #345: Admin Requests page expects `{success,data}` while its API returns `{requests,total,stats}`; public wanted matching currently lacks server-side status/expiry eligibility rejection before candidate computation.
- Issue #345 comment contains source paths and these additional findings. Keep the WANTED workstream as a single canonical domain; avoid parallel APIs and duplicate request records.
- These are code/source observations only; no live Preview or Production acceptance inferred. No code/schema/data/infra change in this audit batch.


## 2026-11-19 — Integration Preview runtime failure investigation

- Re-verified PR #340 remains OPEN + DRAFT; Integration remains separate from `main`.
- Latest Integration source/test head verified from CI run #44408767864: `55c9c559b68442020bda08e2c984564b9c4f2228`. CI conclusion: SUCCESS. The run includes the final WANTED eligibility tests; skipped jobs (if any) remain skipped and must not be represented as passing.
- Preview workflow #44408761521 deployed Preview successfully but failed its root reachability step. Its deployment tested `e989b4d4998774c2d202c6f27a7edfe2424f8ee2`, one test-only commit behind the current Integration head. `GET /` returned HTTP 500 after retries. The preview deployment version was `5468c091-8920-42b3-bdd7-af4073c3b73b`.
- Cloudflare Observability correlated the failure to a homepage request with `prisma:error`; the stack begins at `tx (worker.js:60359:38)`. Root request wall time was approximately 2.1s, CPU 82–127ms. Multiple outbound requests to Prisma Accelerate (`db.prisma.io/v0/statement?db=postgres`) completed at the fetch-span level. This does NOT prove the SQL statements succeeded and does NOT identify the exact Prisma error code or failing model.
- Current source audit of `src/app/page.tsx` confirms the homepage starts with multiple concurrent cached Prisma reads and then launches several listing/count/request/article/hero queries. This is a candidate query surface, not yet a proven culprit.
- Created Issue #346 to track exact Prisma exception extraction, Preview DB identity/schema comparison, narrow Integration fix, regression coverage and exact-SHA Preview revalidation: https://github.com/HEAVIXIR/z-ai-2/issues/346.
- No Production deploy, DB mutation, migration, seed, secret/DNS change, Worker activation or paid provider use. No PR merge.
- **Current release gate: BLOCKED.** CI is green but live Preview root is not. Do not call Preview accepted or PR #340 merge-ready.
- Next smallest safe action: retrieve the complete exception/underlying Prisma response for the correlated trace, then compare homepage's first queries with the isolated Preview schema and paired migration history. Do not run migrations/seeds or change DB identity while diagnosing.
