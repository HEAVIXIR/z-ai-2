# HEAVIX Worklog

Append-only session log. Keep exact evidence and distinguish completed from unverified.

## 2026-11-11 — Durable cross-chat / cross-agent handoff

- Repository: `HEAVIXIR/z-ai-2`.
- Branch: `recovery/heavix-full-product-integration-2026-11-11`.
- Added mandatory continuation protocol: `docs/operations/HEAVIX-AGENT-CONTINUATION.md`.
- Added machine-readable checkpoint: `docs/operations/HEAVIX-CURRENT-STATE.json`.
- This worklog created to ensure future agents append factual progress rather than relying on chat memory.
- Existing verified findings and exact next action are copied into the state document and continuation protocol.
- No application code changed in this session.
- No CI run, Preview deploy, database inspection/write, Production change, or DNS change was performed in this session.
- Important: do not mark homepage restoration complete. The next implementation action is specified in `HEAVIX-CURRENT-STATE.json`.
- Commit resulting from this checkpoint: to be recorded immediately after GitHub confirms the create-file commits.

## 2026-11-11 — Homepage public-read safety remediation

- Re-verified the active recovery branch and read the mandatory continuation protocol, checkpoint and worklog before editing.
- Confirmed current src/app/page.tsx still renders only the five-widget PageRenderer fallback and the PageRenderer registry currently exposes ten widget types; the 17 legacy keys are section/domain components, not 17 existing PageRenderer widgets.
- Inspected the legacy homepage implementation. It performs multiple writes during public page rendering (seed defaults, create missing sections, and deactivate a duplicate brands section); it must not be copied wholesale into the new route.
- Confirmed HomePageSection schema is an editable configuration table with unique key, order, active, and JSON-string config.
- Changed src/app/api/homepage-sections/route.ts to a strictly read-only public GET: no auto-seed/createMany, safe JSON config parsing, and a generic 503 response on DB failure.
- Added tests/security/homepage-sections-readonly.test.ts with handler-level tests for populated results, empty DB/no seed side effect, and safe DB failure response.
- Source commit: a1401c5700773b5322262045b7a01f9917e6301d.
- Test commit: 668af8677cc4f0857a10b81a2232426dcef5cb63.
- CI workflow inspection: .github/workflows/ci.yml runs on pull requests targeting main; it does not deploy Cloudflare. No CI result has been observed yet.
- Not performed: no local test execution (repository runtime is not mounted in this session), no PR created yet, no Cloudflare build/deploy, no DB access/write, no Production or DNS change.
- Next: create a draft PR to trigger repository CI, inspect its result, then implement the canonical homepage section adapter without porting legacy request-time writes.

## 2026-11-11 — Full homepage section composition restored in source

- Restored the original HEAVIX homepage composition in src/app/page.tsx using the existing current-tree home components and the legacy section orchestration as a read-only reference.
- Reinstated all 17 canonical section keys: hero, categories, hot-searches, stats, recommendations, verified-machines, featured-machines, active-requests, exclusive-sale, services, latest-ads, sell7, why-us, brands, trusted-brands, knowledge, cta.
- Extracted the canonical defaults/merge logic to src/lib/homepage/sections.ts. Existing database rows remain authoritative; explicit active=false settings are preserved; missing defaults are supplied in memory only and never written during a public request.
- Removed legacy request-time HomePageSection createMany/create/update/deactivation behavior from the homepage route. A source scan of src/app/page.tsx found zero Prisma mutation calls.
- Removed the legacy hard-coded 31-province statistic. StatsSection now receives only admin-configured real SiteStat values; hero metrics continue to use live database counts.
- Added tests/unit/homepage-sections.test.ts for the 17-key canonical registry, merge behavior, preserved admin configuration, and empty-table fallback.
- Removed an unused verified-listing aggregate query from the restored route.
- Implementation commits: 874132e7bea4ab2af3d1c1620d97fab22d35fd3f (homepage restoration), 744917e259365de55d90a64338810924b62627d9 (pure composition helper extraction), b17244026f3a54f9bc9dfc7b09cadb81568025c7 (helper file), fa50d99b0afa0f654e8349bc180e8bab58495247 (unit tests), 701016644ebe1a170a89ee4a3a31dff29869c9bd (unused query removal).
- Review note: the homepage now uses the legacy-compatible HomePageSection orchestration and current components. PageRenderer/PageBuilder remain available for custom pages/preview flows; the root homepage no longer lets an incomplete generic five-widget layout suppress the canonical product homepage.
- Validation state: source-level checks confirm 17 section switch cases and zero Prisma write calls in src/app/page.tsx. The full GitHub Actions run for the earlier checkpoint is in progress; a newer run is expected for this latest commit. No successful build/typecheck/test claim yet.
- No Preview deployment, Cloudflare build, database access/write, Production change, or DNS change was performed.
- Next: monitor CI for the latest PR head, fix every type/test/build failure, then continue route/API/RBAC audits for Store, Companies, Sell in 7 Days, Services, Knowledge and Admin. Do not deploy until DB identity and artifact gates pass.

## 2026-11-11 — Store order privacy hardening

- Source audit found an unauthenticated object-level authorization gap in GET /api/store/orders?userId=...: when no session existed, the mismatch check did not reject the request and the route queried arbitrary user orders.
- Fixed the userId path to fail closed (401 without session, 403 for another user's ID); explicit admin all-orders access and own-user access remain.
- Also removed guest phone-only enumeration. Guest order retrieval now requires phone + exact order number and queries at most one matching order; MyOrdersDialog now asks for both. This reduces exposure but is not a substitute for OTP or a high-entropy one-time guest access token.
- Added tests for unauthenticated userId lookup, cross-user denial, own-user lookup, admin access, guest phone-only denial and exact guest order scoping.
- Commits: 6d40eb9ad97c961a8c7aa3a5d89e44937e8bc36a (userId authorization), a024230c0e1df1a6102e504191d064e91fad807f (authorization tests), b4a4bce9250b85bd0671fde117c807766e4940d8 (phone+orderNumber API), c8f2ecc57551f6461d7ab2a93942b356b6695f62 (guest UI), aa856872768fd49ff86e79c501aaade3ecf17e5f (guest lookup tests).
- The earlier CI Typecheck failure on commit 41032297 was inspected. It identified stale homepage component type imports/props and an invalid inferred listing row callback. The homepage was updated to import FeaturedListing from FeaturedMachineCard, use the current BrandsSection prop contract, and derive the listing row type with Prisma.ListingGetPayload from a typed Prisma.ListingInclude. Exact-head CI is still required to confirm.
- The earlier Docker build failure is separate: Next tracing fails around dynamic filesystem access in the generated Store Prisma runtime. It remains open and requires a focused build-tracing fix.
- Next: verify the latest CI run for the exact latest branch head, fix typecheck/test/build failures, and continue the route/RBAC/API inventory. No Preview deploy, Production change, DNS change or Cloudflare build performed.

## 2026-11-11 — Services public surface completion

- Added the missing public /services directory at src/app/services/page.tsx. It reads active Service records, renders service details and links each service to the existing SERVICE_REQUEST listings workflow.
- Removed hard-coded placeholder service records from the homepage ServicesSection. If no active services exist, the section now explains that none are registered instead of presenting placeholder cards as live offerings.
- Hardened GET /api/services to return a generic 503 on DB errors rather than exposing raw error messages.
- Updated the product readiness matrix to reflect the new public route.
- Commits: 831e57af97d53340e3afe52de7e809619e7ad36c (remove placeholder cards), 10f346e94eb428f2b041f6b938983b5ab3b7dab5 (safe API errors), 5a9cc3df3d4f5f9133d2ca4a61a00d3651131ee5 (public services directory).
- Validation pending: exact-head GitHub Actions CI must typecheck/build/test the new route and current homepage/store changes. No runtime/Preview validation performed.

## 2026-11-11 — CI evidence and Vitest mock correction

- Inspected GitHub Actions run #42910341544 on commit 4f960dc7ff90848c99358cc672d163159cc55492.
- Confirmed the verify job's Typecheck and Lint steps PASSED after the homepage Prisma listing payload/type fixes.
- Confirmed phase-tests, tls-proof, audit-transaction and Cloudflare compatibility report-only jobs PASSED on that run.
- The verify job's Security tests step failed before executing the two new files because vi.mock factories referenced top-level vi.fn() constants before initialization. Changed both files to initialize mocks through vi.hoisted().
- The Docker job's Build Docker image step PASSED on that run; final Caddy/Compose/connectivity proof steps were still in progress at inspection time. The earlier Docker build failure was caused by TypeScript errors, not proven Prisma dynamic-filesystem warnings.
- New exact-head CI is pending after the vi.hoisted() fixes and subsequent Services/SEO changes. Do not claim green until all required jobs complete.
- Commits for mock fix: 5b018adb6ef7bf23de5697c60ebde9c1f8eb5343 and a198a5df501c4ce8cdb76da770a37233b3ae972b.

## 2026-11-11 — Admin homepage section editor aligned with restored root page

- Verified /admin/homepage-layout is the actual editor for HomePageSection rows and is linked from /admin/home.
- Found editor/API inconsistency: GET returned only persisted rows, while the restored public homepage supplies missing canonical sections virtually; the editor could therefore omit sections visible on the site. Bulk PUT also used synthetic default IDs with update-by-id, which would fail for virtual defaults.
- Fixed admin GET to merge the 17 canonical sections in memory; fixed bulk PUT to upsert by stable unique key so virtual defaults can be persisted safely.
- Updated SECTION_LABELS to the exact canonical hyphenated keys and added labels for recommendations and trusted-brands.
- Added tests/contract/admin-homepage-sections.test.ts to guard default visibility, labels and stable-key persistence.
- Commits: 94bd785d68c5de89c2315d329890fef01970d8d9 (admin API), 0e2eb05eba6c1ac3f1b10ab991d55411ca00cd5d (editor labels), 9e543230b600efe39effe2ed0b3056561d9da76c (contract tests).
- CI validation for these latest changes is pending.

## 2026-11-11 — Public homepage API and Admin defaults consistency

- Updated public GET /api/homepage-sections to read all persisted rows, merge canonical defaults in memory, then filter active sections. This preserves explicit admin-disabled sections and still performs zero writes.
- Updated handler tests: empty DB returns the canonical active sections; an explicitly disabled section remains disabled; public GET never calls createMany.
- Admin GET already merges all canonical sections; bulk save upserts by stable key. Admin UI labels now match the 17 canonical hyphenated keys.
- Added/updated contract coverage for root homepage data sources, custom PageBuilder registry preservation, admin default visibility and stable-key persistence.
- Fixed an outdated pre-existing test that expected the old five-widget root PageRenderer layout. It now asserts the 17-section root and retains PageBuilder registry checks for custom pages.
- Strengthened guest order retrieval: phone + exact order number required; order number now has a 40-bit CSPRNG suffix via Web Crypto; all Store order API JSON responses set Cache-Control private/no-store; regression test asserts no-store.
- Commits: 33f0619ad4703d046f8bab700afb63c2f88af8b2 (public API merge), d2e99b7eeffcbd573e0333df79c4158eb70c1d17 (public handler tests), 78a1f547333a301a83e456f8709b8380c1c917dc (homepage data source test update), 94bd785d68c5de89c2315d329890fef01970d8d9 (admin API), 0e2eb05eba6c1ac3f1b10ab991d55411ca00cd5d (admin labels), 9e543230b600efe39effe2ed0b3056561d9da76c (admin contract test), 775f9a397eab756b03925829a0270aa288923778 (CSPRNG order reference), 7cee5ea4f7b8103d58d2923bad641ad81d7fe024 (no-store responses), 2b4925d64ca7a7ecabdfffb01149b9f1e0482d41 (no-store test).
- CI run #42910792713 confirmed Typecheck/Lint/Security Tests and phase/tls/audit/Cloudflare report-only jobs passed. Full contract/unit tests failed on the old five-widget homepage assertion; corrected in commit 78a1f54. Docker image build, image verification, Caddy syntax and Compose config passed; Caddy→app connectivity remained in progress.
- Exact latest-head CI after the homepage contract update, admin section editor, public API and Store no-store/CSPRNG changes is still pending.

## 2026-11-11 — Services directory navigation and site settings

- Improved /services directory to use the same active catalog root categories in the shared Header instead of an empty navigation list.
- Wired the shared SiteSettings fields into Footer (about/contact/working hours/copyright/newsletter) so the new public page uses the site's configured footer.
- Commits: 0f161958f47ee3f48d9c48c19ef8367e35f16d50 (header categories), aa2fce86910e7c7a5491f8d3fcb8ac0c0f4446e2 (footer settings).
- Exact-head CI pending.

## 2026-11-11 — Admin health endpoint authorization

- Security audit found /api/admin/store/health and /api/admin/marketplace/health had no route-level authorization while src/middleware.ts intentionally bypasses paths ending in /health for infrastructure probes. These endpoints exposed database state, counts, latency and resource monitoring.
- Added route-level authentication and RBAC: Store health requires store.read; Marketplace health requires analytics.read. Catalog health was already protected by analytics.read.
- Added handler-level security tests for unauthenticated, missing permission and authorized access to Store/Marketplace health.
- Updated tests/security/auth-boundary.test.ts: middleware health probe bypass remains an intentional contract, but all detailed admin health handlers must have route-level auth+permission checks.
- Commits: 4c727003a1d2f40c4a1bdc8ba29be46dfb4be255 (Store health RBAC), 9e4f9893ca06463aab98e7e9d1c500c5e18245c7 (Store health tests), 165ec09770170ab215a5f334b9f892e73aef4c2d (Marketplace health RBAC), e1159ba5c30f1b6f584c13bfe534615e22f1ff6f (Marketplace health tests), 6881a08246860c5e16f537c5df03f5792eeded8f (auth-boundary contract update).
- CI validation pending.

## 2026-11-11 — Store Control Plane route inventory correction

- Cross-checked the Store route tree against docs/STORE-RESOURCE-MATRIX.md and GitHub search. Corrected an initial overstatement: Procurement UI exists at /admin/procurement; Services UI exists at /admin/services; Rentals is served through the Universal Resource Engine at /admin/resources/rentals. These are shared/global Admin routes, not missing capabilities.
- Current inventory: 16 /admin/store page routes and 52 /api/admin/store route handlers. Other shared Admin pages exist for Pricing, Analytics, Audit Log, Media, SEO, Procurement and Services. Shipment UI exists; exact wiring for logistics dashboard and all state transitions still needs verification.
- Updated product readiness matrix to distinguish source presence, shared-route implementation and actual end-to-end verification.

## 2026-11-11 — Docker proof completed successfully

- Rechecked Docker job for run #42910792713 (head a198a5df501c4ce8cdb76da770a37233b3ae972b). The complete docker-build-proof job finished SUCCESS.
- Verified all Docker proof steps passed: dependencies, Prisma client generation, Docker image build, image existence, Caddyfile syntax, exact docker-compose.prod.yml interpolation, and real Caddy→app connectivity.
- The verify job on the same run passed Typecheck, Lint and Security tests; phase-tests, tls-proof, audit-transaction and Cloudflare compatibility report-only passed. The full contract/unit suite failed only on the obsolete homepage-data-sources assertion; that test was rewritten in commit 78a1f547333a301a83e456f8709b8380c1c917dc to match the restored 17-section homepage while retaining PageBuilder registry checks.
- Exact latest-head CI after the test correction and subsequent Store/Marketplace health RBAC changes is still pending.

## 2026-11-11 — Read-only Cloudflare Preview Worker audit

- Read-only Cloudflare account inspection confirmed the existing Worker script is `heavix-preview` in the HEAVIXIR Cloudflare account; no create/update/deploy action was performed.
- Active deployment: 9c079e5b-e3df-4295-80e0-e930d2d25552; active version: 063ce438-ca3a-4482-b416-9260b780bccf; traffic allocation 100%; created 2026-11-10T21:08:35Z.
- Deployment annotation: HEAVIX Preview visual refresh; full Next.js/OpenNext bundle, database readiness follow-up remains isolated.
- Worker settings expose non-secret vars HEAVIX_ENV=preview and NODE_ENV=production. Secret binding names include DATABASE_URL and STORE_DATABASE_URL; secret values were not retrieved or printed.
- The Worker script settings do not expose the database identities behind those secret bindings. Do not infer Preview DB identity from secret names alone.
- Existing workflow .github/workflows/prisma-preview-workerd-proof.yml is a read-only, pinned-commit Workerd proof. It requires explicit workflow_dispatch input PREVIEW_ONLY and two distinct GitHub secrets HEAVIX_APP_PREVIEW_PPG_URL / HEAVIX_STORE_PREVIEW_PPG_URL; it verifies expected PostgreSQL system identifiers and read-only session mode without deploying a Worker. This workflow was not dispatched in this session because no GitHub workflow-dispatch action is exposed here.
- Attempted web page open of the Preview URL was not accessible via the web retrieval tool; this is not evidence that the Worker is down.
- No Cloudflare Worker deployment or DB connection was performed in this checkpoint.

## 2026-11-11 — Continuity checkpoint before next agent/session

- Active recovery branch HEAD at this checkpoint: f247e9a68accfe02b00959d40443decef1fda3a4.
- Draft PR: https://github.com/HEAVIXIR/z-ai-2/pull/307 (base main; not merged).
- Latest CI run for exact head: #42913239127, queued at inspection. Earlier run #42910792713 passed Typecheck, Lint, Security Tests, phase/tls/audit/Cloudflare compatibility and full Docker proof; its only verify failure was an obsolete homepage contract test now corrected.
- Source changes in this workstream: full 17-section homepage; read-only canonical section composition; Admin editor GET/upsert integration; public /services directory; no placeholder service data; Store order enumeration hardening; Store/Marketplace health RBAC; SEO metadata; readiness matrix.
- Cloudflare read-only audit: current heavix-preview deployment/version recorded; HEAVIX_ENV=preview; secret names DATABASE_URL and STORE_DATABASE_URL; no secret values retrieved. Actual PostgreSQL system identifiers remain unverified.
- Next agent must start by reading AGENTS.md, docs/operations/HEAVIX-AGENT-CONTINUATION.md, docs/operations/HEAVIX-CURRENT-STATE.json and this worklog. Do not start from zero.

## 2026-11-11 — Homepage Services directory discoverability

- Updated the homepage ServicesSection to link to the new public /services directory as well as the existing SERVICE_REQUEST flow.
- Corrected the stale component comment that still described a placeholder fallback; the component now explicitly renders an empty state when no live services exist.
- Commit: 7bc022d9e8c8c53adf271f3f3e6bceef75696267.
- Exact-head CI pending.

## 2026-11-11 — Public homepage API test corrected for virtual defaults

- CI run #42912204178 on commit 4c727003a1d2f40c4a1bdc8ba29be46dfb4be255 passed Typecheck, Lint, auth-boundary tests, phase-tests, TLS, audit-transaction and Cloudflare compatibility report-only.
- Its Security Tests job failed one assertion in tests/security/homepage-sections-readonly.test.ts because the public endpoint now correctly returns the canonical active default sections in addition to the persisted hero row; the old assertion incorrectly expected a one-element data array.
- Updated the test to assert the hero row is first and the response contains exactly the canonical active section count, preserving the no-write assertions.
- Fix commit: ef38b4ad6754f9d22abc8420b5dbc9a09df220dd. Exact-head CI pending.

## 2026-11-11 — Store Admin navigation and rental permission alignment

- Source audit found the Store navigation seed omitted the Universal Resource Engine routes for Procurement, Rentals and Service Providers even though the configs/pages existed.
- Added Store menu items for /admin/resources/procurement (procurement.read), /admin/resources/rentals (store.read), and /admin/resources/services (store.read).
- Found rentalsConfig used rentals.read/manage, but the canonical permission catalog did not define those keys and the dedicated Rentals API enforces store.read/manage. Aligned the universal resource config to store.read/manage.
- Added tests/contract/admin-store-navigation.test.ts to guard route presence and permission consistency.
- Commits: a496b6820ea45d825c30ba72479994ff20bca48f (rental permission fix), 45fc756060b9052be3c64c42ece63ab3a790cabe1 (navigation seed), 4ac3a271fda976f22ecc919e4c1014863885f066 (contract test), b86b434a2801fd0f23c33e975d42178053242e30 (audit update).
- Navigation seed has NOT been run on any DB; run only after Preview DB identity verification and explicit approval of the Preview seed step.
- Exact-head CI pending.
