# HEAVIX Full Product Recovery & Integration Plan

> **Execution mode:** Native, branch-isolated implementation. No direct changes to `main`, no Production deploy, no DNS edits, and no database migration/seed without a separately reviewed gate.

**Goal:** Restore the complete HEAVIX product experience from the current application and individually verified legacy assets, then make every intended capability usable through secure role-based administration and prove it on the existing Preview Worker.

**Architecture:** `HEAVIXIR/z-ai-2` main is the current application source of truth. The extracted `dellk00k/z:legacy/extracted-archives` branch is a read-only reference snapshot (10 ZIPs extracted; 845 files reported; db/upload/bun quarantined). Legacy files are compared individually and only compatible assets/behavior are ported. Existing Next.js PageRenderer, domain services, Prisma contracts, RBAC and Store control-plane architecture remain canonical.

**Tech Stack:** Next.js 16, React, TypeScript, Prisma, PostgreSQL/Preview SQLite contracts, Cloudflare Workers/OpenNext, Vitest, GitHub Actions.

**Spec:** `docs/HEAVIX-PROJECT-PRINCIPLES.md`, `docs/HEAVIX-ARCHITECTURE-OVERVIEW.md`, `docs/design/HEAVIX-HOMEPAGE-VISUAL-PARITY.md`, legacy extracted `HEAVIX-CORRECTED-REFERENCE-V1.1.md`, `HEAVIX-SECURITY-BASELINE-V1.md`, `HEAVIX-DATA-GOVERNANCE-V1.md`.

## Global Constraints

- Keep the canonical data chain and domain boundaries; Category, Transaction, Service, Industry, Brand, Model and Location remain distinct.
- No blanket admin permissions. Every action remains least-privilege RBAC, auditable, and fail-closed.
- AI may recommend or draft; it cannot grant roles/permissions, read secrets, or perform financial/destructive actions without human approval.
- Never import legacy SQLite schemas, migrations, secrets, generated clients, node_modules, build artifacts, caches, or quarantined archives into the current application.
- No hard-delete of business data; archive lifecycle is preferred.
- Preserve the existing PageRenderer rule: a published HOME AdminPage takes precedence over the code fallback.
- Never fabricate Hero statistics or business records. Stats must come from privacy-safe read-only aggregates.
- Cloudflare usage is constrained: inspect and test locally/GitHub first; use the Preview Worker only after the release artifact and DB identity gates pass.
- Production, DNS, and existing stable Worker are protected from this recovery work.

## Review Focus

1. Published HOME AdminPage has a stale or incomplete layout that overrides the reference-aligned fallback.
2. PageRenderer widget registry and widget data-source contracts do not resolve the expected sections.
3. Hero media, cards, stats, and responsive composition differ from the owner reference.
4. Admin routes exist but are hidden, unauthorized, or backed by missing API/data contracts.
5. Store and company flows may be isolated from the public marketplace despite existing route trees.
6. Legacy imports may rely on SQLite, deprecated auth, unsafe scripts, or mismatched Prisma models.
7. Worker runtime and database bindings may differ from GitHub CI assumptions.

---

## Workstreams and Tasks

### Workstream A — Establish complete source inventory and provenance

**Files:** create `docs/audits/HEAVIX-LEGACY-TO-CURRENT-INVENTORY-2026-11-11.md`; inspect current `src/app`, `src/components`, `src/lib`, `prisma`, `public`, `tests`, `.github/workflows`; compare with the extracted legacy snapshot.

- [ ] Record immutable current main SHA and the recovery branch base.
- [ ] Enumerate all legacy extracted paths by domain: homepage, ads/listings, companies, store, services, knowledge, taxonomy, admin, media, AI, scripts, tests, docs.
- [ ] For each candidate, classify `KEEP_CURRENT`, `PORT_ASSET`, `PORT_LOGIC_AFTER_ADAPTATION`, `REWRITE_AGAINST_CURRENT_CONTRACT`, or `REJECT`; record reason and source SHA.
- [ ] Reconcile current main and `feat/homepage-visual-parity-20261027`; do not assume that branch is newer or better.
- [ ] Report every unreviewed/quarantined file class and any manifest/security uncertainty.

**Gate A:** 100% of extracted text/source files inventoried or explicitly dispositioned; no bulk copy.

### Workstream B — Homepage visual and content recovery

**Files to inspect:** `src/app/page.tsx`, `src/components/page-renderer/**`, `src/components/home/**`, `src/components/layout/Header.tsx`, `Footer.tsx`, `src/app/api/homepage-sections/**`, `src/app/api/admin/homepage-sections/**`, `src/app/admin/home/**`, `src/app/admin/homepage-layout/**`, `docs/design/HEAVIX-HOMEPAGE-VISUAL-PARITY.md`.

- [ ] Trace published HOME page lookup → publishedVersionId → layout JSON → PageRenderer.
- [ ] Add a read-only diagnostic that reports which HOME layout source is selected and validates required widget keys/data sources without leaking content or secrets.
- [ ] Compare the saved published layout with the canonical section order and the legacy reference; prepare a reviewed correction/rollback snapshot.
- [ ] Verify Hero wide imagery, three cards, stats panel (only verified data), floating header, overlapping search panel, Featured Ads, selected listings, categories, services, knowledge, Sell in 7 Days, brands and footer.
- [ ] Verify each section has working data source, empty/error/loading state, responsive layout and admin edit surface.
- [ ] Add visual/contract tests for the desktop reference and mobile no-overflow behavior.

**Gate B:** Reference-aligned homepage and all required sections render from real sources; no fabricated stats; saved HOME layout remains editable and rollbackable.

### Workstream C — Marketplace, companies, store and services

- [ ] Audit public and admin routes, services, APIs, Prisma models and permissions for Listings, Featured Ads, Selected Ads, Companies, Store, Sell in 7 Days, Services, Knowledge Center, Brands, Categories, Taxonomy, Media and SEO.
- [ ] Build a route-to-domain-to-API-to-permission-to-admin-to-test matrix.
- [ ] Repair broken links and missing route registration; avoid duplicate domain models.
- [ ] Verify real end-to-end create/edit/review/publish/read journeys with seeded Preview fixtures only.
- [ ] Verify store inventory, cart, order, payment test-mode, shipping, returns and customer workflows without live payment capture.
- [ ] Verify company profile, branches, verification lifecycle, partner listings and public company pages.

**Gate C:** Each advertised feature has a working public/seller/admin path, a valid API/data contract, authorization, validation, audit, and tests; incomplete features are hidden or clearly marked, never presented as functional.

### Workstream D — Admin Control Plane and permissions

- [ ] Inventory every Admin route and API route and map it to RBAC permission identifiers.
- [ ] Audit Navigation visibility separately from server-side authorization.
- [ ] Confirm owner/super-admin role assignment through a secure, auditable bootstrap process; never grant all permissions to all users.
- [ ] Ensure every admin mutation checks AuthN → AuthZ → Policy → Validation → Service → DB → Audit.
- [ ] Verify Store Control Plane and Marketplace Control Plane coverage, including AI budget, AI jobs, taxonomy, content, media, SEO, analytics, audit, settings and feature flags.
- [ ] Add deny-by-default and cross-tenant/object ownership regression tests.

**Gate D:** Intended project administrators can reach all authorized modules; ordinary users/sellers cannot access privileged operations; every sensitive action is auditable.

### Workstream E — Legacy code and capability integration

- [ ] Read candidate legacy code completely before porting.
- [ ] Compare legacy Prisma schema and current canonical schemas; translate behavior, not schema wholesale.
- [ ] Reuse legacy assets only after path, license/provenance, dimensions, optimization and content review.
- [ ] Adapt scripts to current environment and ensure dry-run/read-only defaults.
- [ ] Port only missing, valuable capabilities; do not duplicate existing current implementations.
- [ ] Add regression tests before each behavior change.

**Gate E:** Every imported capability has a documented source, current contract, authorization, validation, tests and owner/admin management surface.

### Workstream F — Runtime, Preview and release

- [ ] Verify Build from the recovery branch on GitHub Actions without consuming Cloudflare Build quota.
- [ ] Verify OpenNext worker entry, all assets, WASM, static manifest, runtime compatibility and commit provenance.
- [ ] Prove both App and Store database identities from the exact Preview Worker bindings using read-only queries.
- [ ] Verify no Production database identity is present in the Preview release.
- [ ] Deploy only to the existing Preview Worker after Gates A–E and the artifact gate pass.
- [ ] Run homepage, admin auth, ads, company, store, services, knowledge, taxonomy, media, search and health smoke tests.
- [ ] Capture screenshots and HTTP/API evidence; compare with the owner references.
- [ ] Roll back to the previous known-good Preview version if any critical smoke test fails.

**Gate F:** Existing Preview URL shows the full approved HEAVIX product, not a shell; all critical flows pass; Production and DNS remain unchanged.

## Completion contract

The recovery is complete only when all six gates pass, a pull request is reviewed, required CI is green, the exact Preview URL is tested, visual evidence is attached, and the handoff/worklog records commit SHA, test results, database identity proof and rollback version.
