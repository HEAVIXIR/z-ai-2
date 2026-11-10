# HEAVIX Legacy-to-Current Inventory — 2026-11-11

## Verified repository baselines

- Current application repository: `HEAVIXIR/z-ai-2`.
- Current protected `main` SHA at audit start: `b4b6b4624ebed2ae3bdad023eb1532dbedad7001`.
- Existing homepage reference branch: `feat/homepage-visual-parity-20261027`.
- Existing runtime branch: `infra/prisma6-cloudflare-runtime`.
- Legacy source repository: `HEAVIXIR/z`, default branch `main`, HEAD `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`.
- Extracted legacy snapshot: fork `dellk00k/z`, branch `legacy/extracted-archives`, commit `bbb1f4947e4b1a05e39f7b510c5c7801d52389e7`.
- The extracted snapshot README reports 10 ZIP archives extracted (845 files reported) and three archives quarantined: `db.zip`, `upload.zip`, `bun.zip`. It records a SHA-256 manifest and says the snapshot is read-only, not a current source tree.

## Critical discovery: homepage layout source selection

Current `src/app/page.tsx` on `main` and `feat/homepage-visual-parity-20261027` is the same PageRenderer-driven implementation. It starts with `DEFAULT_HOME_LAYOUT`, then queries `db.adminPage.findFirst({ pageType: "HOME", status: "PUBLISHED" })`. If a published page has `publishedVersionId` and that version has a `layout`, the database layout replaces the default. This creates a concrete, testable explanation for why the deployed page can differ from the repository fallback: the saved published HOME layout may be stale or incomplete. This is a hypothesis until the Preview database's selected layout is inspected read-only.

The default fallback currently defines Hero, Search, Featured Listings, Categories and Trust. It does not itself define every section named in the architecture index (e.g. Sell in 7 Days, Services, Knowledge, selected ads, companies/store promos). The current component tree and widget registry must be audited before deciding whether these are provided by saved HOME layout, widgets elsewhere, or genuinely missing from the default.

## Verified current repository coverage (tree inventory)

The current main tree contains 2,225 entries; the homepage parity branch contains 2,189 entries. Both contain:
- Hero assets: `public/images/hero/hero-construction.png`, `hero-mining.png`, `hero-road.png`, `card-services.png`, `card-featured.png`, `card-exclusive.png`.
- Homepage: `src/components/home/Hero.tsx`, `HeroStatsPanel.tsx`, `FeaturedMachinesSection.tsx`, `src/app/admin/home/hero/page.tsx`, `src/app/admin/homepage-layout/page.tsx`.
- Featured listings: `src/components/home/FeaturedMachinesSection.tsx`, `FeaturedMachineCard.tsx`.
- Sell in 7 Days: public page, register and track routes; admin page/client; public/admin API routes; four process images.
- Companies: admin company detail, company public APIs, contract tests.
- Store: dedicated architecture docs, Store migrations, seed and many admin/API routes.
- Services: public/admin service routes and taxonomy management.
- Knowledge: public knowledge routes, admin management, graph APIs and home section component.
- Taxonomy: admin attribute, brand, industry and location modules.
- Header/Footer: public components and admin editing pages.
- Tests: current main includes contract, security, integration and unit suites.

## Current architecture authority

`docs/HEAVIX-PROJECT-PRINCIPLES.md` states:
- HEAVIX is Industrial Catalog + Marketplace + Services + Trade + Industrial Data + AI Intelligence.
- Zero Trust, RBAC, audit and least privilege are mandatory.
- AI cannot grant admin roles/permissions, read secrets, or perform destructive/financial actions autonomously.
- Every entity/capability must include schema, migration, seed, API contract, authorization, validation, audit, admin UI, public UI where applicable, SEO where public, and tests.
- Every added capability must be editable in Admin.
- Work must be recorded in the worklog.
- SQLite is for Preview/Local/Fixture; PostgreSQL is the Production authority per the cited principles snapshot. The actual current environment must still be verified independently.

## Immediate investigation order

1. Inspect the Preview Worker-selected HOME AdminPage and published version without writes.
2. Read the complete PageRenderer registry and each homepage widget/data-source implementation.
3. Compare the legacy homepage components/assets and the current implementation file-by-file.
4. Inspect Admin Navigation + RBAC policies and confirm route discoverability versus server authorization.
5. Run route/API/data/test matrix for ads, companies, Store, services, knowledge, taxonomy, media, SEO and AI.
6. Only after evidence, implement the smallest compatible repairs on the recovery branch.

## Non-actions

No changes to either repository main branch, no merge, no Worker deployment, no DNS change, no database write, no migration/seed, no secrets output, and no blanket permission grants were performed during this inventory.
