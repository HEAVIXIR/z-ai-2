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


## Confirmed homepage regression: legacy 16-section composer was replaced by 5-widget fallback

The legacy extracted `src/app/page.tsx` (read in full through its render switch) loads `HomePageSection` records and renders a 16-key section registry:
`hero`, `categories`, `hot-searches`, `stats`, `recommendations`, `verified-machines`, `featured-machines`, `active-requests`, `exclusive-sale`, `services`, `latest-ads`, `sell7`, `why-us`, `brands`, `trusted-brands`, `knowledge`, `cta`.
The current `main/src/app/page.tsx` no longer reads `HomePageSection`; it uses PageRenderer and a code fallback containing only five widgets: `hero`, `search-box`, `listing-grid`, `category-grid`, `trust-badges`. This is a verified code-level regression in the homepage composition, independent of the Preview database hypothesis above.

The current `src/components/home/` directory still contains all 26 homepage component files found in the legacy snapshot. Blob-SHA comparison across 26 matching files:
- 18 files are byte-identical.
- 8 differ: `ActiveRequestsSection.tsx`, `BrandsSection.tsx`, `CtaSection.tsx`, `Hero.tsx`, `RecommendationsSection.tsx`, `StatsSection.tsx`, `VerifiedMachinesCarousel.tsx`, `VerifiedMachinesGallery.tsx`.
- No legacy homepage component file in this set is missing from current main.

This is why the right fix is not a wholesale legacy copy: restore the full section orchestration using the current versions of existing components and current data/authorization contracts, then compare the eight changed components individually against their legacy counterparts.

## Immediate code repair scope (next implementation task)

1. Preserve PageRenderer for published custom HOME pages, but reject/avoid treating a technically valid yet materially incomplete saved layout as a complete product homepage; the fallback must render the complete canonical section set.
2. Restore the legacy `HomePageSection`-driven 16-section ordering and visibility model using the current component exports and current Prisma schema.
3. Ensure the homepage Hero passes real configured `HeroConfig`, verified read-only stats, and optional published listing cards; do not hardcode fake counts.
4. Ensure the floating Header, search panel, Featured/Verified/Latest ads, Sell in 7 Days, Services, Knowledge, brands, requests and footer all render from real data.
5. Add tests that fail against the current five-widget fallback and pass only when all required section keys are represented, while checking disabled sections stay hidden and order is respected.
6. Validate no mutation occurs in public GET requests. In particular, audit the current public `GET /api/homepage-sections` implementation, which currently attempts to seed rows when empty; public reads should not perform writes.

The current repository's PageRenderer path is still useful for admin-authored custom pages and must not be discarded. The goal is to restore the full homepage, not remove the PageBuilder architecture.


## Recovery-branch correction — 2026-11-12

The findings above describe the protected `main` baseline and the initial homepage regression discovered before implementation. They must not be read as the current state of the recovery branch.

On recovery code commit `5e1ad2341d713221840d335fa318a74ce9e5668f`:
- The homepage has been restored to the canonical 17-section composition using current components and current data contracts.
- All 145 legacy page routes and 278 legacy API route handlers from the extracted reference are present by normalized path; no legacy page/API route file is missing.
- All legacy static image/logo assets have matching paths after normalization.
- The separate full comparison and file dispositions are recorded in `docs/audits/HEAVIX-LEGACY-PAGE-API-PARITY-2026-11-12.md`.

The live Preview is still not proof of this recovery source: it continues to serve the older active Worker. Source parity does not prove real database identity, live B2 operations, or browser/runtime acceptance. Those remain explicit release gates.
