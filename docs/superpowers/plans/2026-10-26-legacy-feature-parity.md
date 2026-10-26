# HEAVIX Legacy Feature-Parity and Marketplace Completion Plan

> **Execution mode:** Owner-authorized repository work; isolated branch and pull request. No direct merge or deployment.
>
> **Baseline inspected:** `main` at `4bf6c974ac94c01fa6739b293a56e4de4ca4231f` (2026-10-26).
>
> **Legacy source pinned:** `HEAVIXIR/z` at commit `217f98ecc800aa64ae4739d27ed2aeb95dd260ed` contains 13 ZIP archives. A read-only GitHub Actions inventory compared those archives with `z-ai-2` main baseline `4bf6c974ac94c01fa6739b293a56e4de4ca4231f` ([audit run](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40325606586)). The report counted 75 archive-entry missing candidates, 633 same-path content differences, 990 identical entries, 15 excluded entries, and 2 binary entries requiring review. These counts include overlapping full-project and per-directory archives; they are not unique-file counts. No archive content has been imported. Use this pinned archive inventory as evidence, and do not infer feature gaps from route names alone.

## Goal

Reconcile the older HEAVIX implementation with the current repository, bring over only the genuinely missing and still-valid pages/features, and verify the resulting changes for security, accessibility, SEO, behavior, integration, and release readiness without destabilizing the existing architecture.

## Architecture and implementation approach

Keep the existing Next.js App Router, TypeScript, Prisma Main/Store schemas, current taxonomy/catalog model, canonical auth/RBAC, and existing domain services. Prefer completing or connecting existing routes and services over duplicating them. Migrate by bounded feature slices, each with tests and its own PR; do not import an old database, secrets, generated artifacts, or obsolete schema wholesale.

## Source-derived product priorities

The uploaded HEAVIX architecture and planning documents establish the intended product as an industrial marketplace, not a simple classifieds site. The planned domain sequence is:

1. Marketplace Core and listing lifecycle
2. Search & Discovery
3. Trust & Verification
4. Price Intelligence & Compare
5. RFQ / Wanted / Matching
6. Rental / Auction / Commerce
7. Services / Logistics
8. AI / Industrial Intelligence
9. Growth / SEO / Analytics
10. Production Scale

The product brief additionally highlights AI-assisted search and listing creation, buyer requests, verified sellers/machines, saved searches and alerts, seller dashboard/leads, company and brand/model pages, knowledge/SEO, price insights, and secure AI routing. These are candidate requirements to reconcile against actual source and current behavior—not proof that each is absent.

## Baseline inventory: routes already present

The current repository tree contains public route files for the homepage, listings and listing creation/detail, categories, brands, models, companies, sellers, machine comparison, Find My Need, Machine Hunt, rentals, auctions, RFQ, requests, transport requests, knowledge/articles, market insights, seller dashboard/leads, user dashboard/favorites/messages/deal rooms, Store, login/register, and API docs.

SEO infrastructure also exists in `src/app/layout.tsx`, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/lib/seo.ts`, and `src/lib/seo-service.ts`. Recent mainline work has addressed route-specific public metadata and sitemap freshness. These files must be audited and extended, not replaced wholesale.

**Important:** A route or API file is only a presence signal. Functionality is not marked PASS until its actual implementation and behavior have been inspected and tested.

## Global constraints

- Never merge around branch protection or represent the PR author as an independent reviewer.
- Keep Production/Stage database mutations, deployment, backfill, Phase D/E, and worker activation out of this code-migration work unless a separate approved release gate authorizes them.
- Keep `STORE_AUDIT_OUTBOX_ENABLED` disabled in operational environments until the dedicated gate is satisfied.
- Use `prisma/store/schema.prisma` as the canonical Store schema; preserve the separate Main and Store migration histories.
- Never run destructive `db push --accept-data-loss` or migrations against a real/operational database as part of source intake.
- Do not add AI-generated product specifications as verified facts; retain provenance and distinguish unknown, suggested, and verified values.
- Never add hotlinked legacy assets to production code. Copy and review assets locally, checking licenses and file types.
- Do not claim search-engine indexing from code-level SEO tests; rendered metadata and real crawl/Search Console evidence are separate gates.

## Review focus

- Legacy route collision or changed URL: preserve existing routes and add explicit redirect/canonical policy only when supported by source evidence.
- Authentication/authorization mismatch: all seller/admin mutations must use canonical session and RBAC paths; no legacy identity bypass.
- Untrusted content and uploaded assets: validate, sanitize, constrain file types/size, and prevent stored/reflected XSS or unsafe URL handling.
- SEO duplication: canonical URLs, robots/noindex for private or non-published pages, correct Product-vs-Listing JSON-LD, stable sitemap timestamps.
- Transactional behavior: inventory/returns, payments, offers, RFQ, and Outbox must be tested for concurrency, rollback, idempotency, and retry behavior on PostgreSQL—not inferred from SQLite-only results.
- Empty/stale source data: UI and readiness panels must show empty/PENDING rather than fabricated values or PASS.

## Execution plan

### Task 1 — Obtain and inventory the actual legacy source

**Files:** source archive supplied by owner; audit output in `docs/legacy-parity/`.

- [x] Locate and pin the legacy archive source in `HEAVIXIR/z` at `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`; inventory all 13 ZIP files against the current target tree in read-only CI.
- [ ] Review all missing candidates and conflicts semantically. The archive contains duplicate snapshots and stale variants; do not copy files solely because their paths are absent or hashes differ.
- [ ] Inspect archive paths and file types before extraction; exclude secrets, environment files, database dumps, build outputs, dependencies, and executable artifacts from the migration set.
- [ ] Enumerate old App Router/pages, navigation items, UI components, API handlers, static assets, SEO metadata, and user workflows.
- [ ] Build a path/feature matrix with evidence for each item: `PRESENT_AND_VERIFIED`, `PRESENT_NEEDS_BEHAVIOR_TEST`, `MISSING`, `OBSOLETE`, or `BLOCKED_SOURCE`.
- [ ] For each candidate, map its old behavior to current route/service/schema/tests and document conflicts before editing code.

**Gate:** No implementation claims of legacy parity until the old source has been inspected.

### Task 2 — Select migration slices

- [ ] Prioritize user-facing gaps by conversion value, security risk, dependencies, and fit with the phase plan.
- [ ] Split independent domains into small PRs; preserve scope and avoid combining unrelated database/schema work with visual changes.
- [ ] For each slice, record route contracts, authorization rules, data ownership, SEO behavior, empty/error states, analytics events, and acceptance tests.

**Gate:** Each slice has an evidence-backed definition of done and an identified rollback path.

### Task 3 — Implement with test-first workflow

For each approved slice:

- [ ] Add behavioral/contract tests first and confirm the expected failure.
- [ ] Implement the smallest change using existing domain services and UI patterns.
- [ ] Add integration tests for real side effects and authorization; use disposable PostgreSQL for database-sensitive behavior.
- [ ] Add accessibility coverage for keyboard use, labels, focus, errors, and responsive states.
- [ ] Add metadata, canonical, robots, structured data, and sitemap behavior only where the route is public and indexable.
- [ ] Run targeted tests, then `bun run typecheck`, `bun run lint`, relevant test suites, security checks, and `bun run build` where the environment permits.

**Gate:** No claim of PASS without captured command output or exact-HEAD CI evidence.

### Task 4 — Security and SEO re-audit

- [ ] Review auth/session/RBAC and tenant ownership for every newly added page/API.
- [ ] Review input validation, output encoding, upload handling, rate limits, CSRF/session boundaries, error leakage, logging, and secrets.
- [ ] Verify rendered title/description/canonical/robots and JSON-LD URLs for public routes; ensure unpublished/private routes are not indexable.
- [ ] Verify sitemap inclusion/exclusion, deterministic `lastModified`, redirects, and internal links.
- [ ] Run the repository's existing security, SEO contract, integration, and regression tests; add tests for every discovered gap.
- [ ] Record code-level SEO hygiene separately from live crawl/index evidence.

### Task 5 — Independent review and release readiness

- [ ] Open a PR per coherent feature slice and run CI on the exact final HEAD.
- [ ] Require a non-author review that applies to the final diff; resolve all blocking review threads.
- [ ] Recheck main and exact SHA after every merge.
- [ ] Keep PostgreSQL operational rehearsal, backup/restore, rollback, monitoring, deployment, and worker activation as separate release gates.
- [ ] Production remains NO-GO until all documented gates and a separate release authorization are complete.

## Acceptance criteria

- Every legacy route and feature is accounted for in a source-backed parity matrix.
- Every migrated feature has tests and an owner-visible mapping to its current route/service/schema.
- No duplicate/parallel implementation is added where an existing feature can be safely completed.
- Typecheck, lint, targeted tests, security tests, build, and required exact-HEAD CI pass.
- Security and SEO findings are either fixed or explicitly listed as blockers; no silent waiver.
- No Production/Stage mutation, deployment, backfill, Phase D/E, or worker activation is performed by this plan.
