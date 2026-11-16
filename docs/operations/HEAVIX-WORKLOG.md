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

## 2026-11-11 — Admin navigation RBAC bypass and permission-key normalization

- Found GET /api/admin/navigation treated any signed-in user as legacy admin, swallowed failure of admin.navigation.read, and then returned all menu entries because userPermissions remained null.
- Removed the legacy bypass: unauthenticated returns 401; missing admin.navigation.read returns 403; authorized users always receive navigation filtered by exact canonical permissions.
- Added tests/security/admin-navigation-rbac.test.ts for unauthenticated, missing permission, no permissions and exact group/standalone filtering.
- Scanned every permissionKey in prisma/seed-admin-navigation.ts against src/lib/authorization/permissions.ts. Seven aliases were absent and therefore not granted by canonical role assignments. Aligned them to existing canonical keys: admin.homepage.manage, admin.navigation.manage, admin.settings.manage, content.read, media.manage, price.read and service.manage.
- Expanded tests/contract/admin-store-navigation.test.ts to assert every navigation permissionKey exists in the canonical catalog.
- Commits: 4cc2ab395b7303f9b34ec176a9c3c0e877b43193 (remove legacy bypass), e0f8971d6a64de13a69f1ff8d3c6cef2980e0f85 (navigation RBAC tests), 4d44957f6df3a2d06ebf608962e1474a3b27e926 (permission-key normalization), cd98be611dbdc322b6653ba8c21aa828ac7912e8 (catalog consistency test).
- Preview DB seed has not been run; exact-head CI pending.

## 2026-11-11 — Final scan of Admin navigation permission aliases

- Re-scanned all 44 distinct permissionKey values in prisma/seed-admin-navigation.ts against the canonical PERMISSIONS array after normalization.
- Found repeated legacy aliases still present on additional Home, Media and Pricing items because the first patch changed only the first occurrence. Replaced every remaining occurrence: admin.home.manage → admin.homepage.manage, media.read → media.manage, pricing.read → price.read.
- Final source scan: 44 navigation permission keys, 0 missing from the canonical permission catalog.
- Commit: e16ed41a5c123d5f2c8700816303771fbfdf3e9d. CI pending.

## 2026-11-11 — Live Preview route audit (read-only)

- Used JavaScript-rendered live fetches against https://heavix-preview.heavixir.workers.dev; no Cloudflare deployment, secret access, database connection or write was performed.
- `/` renders the old/incomplete shell, not the 17-section recovery composition; its robots metadata is noindex,nofollow,noarchive.
- `/api/health` returned 503; `/api/services` returned 500; `/services` returned 404; `/api/homepage-sections` was unreachable on the fetch.
- `/store` rendered but featured parts were empty, exchange rate displayed 0 Toman and category controls remained loading.
- `/companies` rendered an empty directory.
- `/sell-in-7-days`, `/knowledge`, `/auctions`, `/rentals`, `/listings` each returned 500.
- This confirms the active Worker is not serving the recovery branch and that the existing Preview has runtime/data readiness failures. No claim of completion or successful deployment is permitted.
- The recovery release gate remains: exact-head CI → actual Worker App/Store DB identity proof → deploy only to existing Preview Worker → live route recheck. No Production/DNS changes.

## 2026-11-11 — Preview Workerd proof dispatch blocked by browser authentication

- Attempted to dispatch only the read-only GitHub Actions workflow `Prisma Preview Workerd Runtime Proof` via TinyFish browser at the workflow page, with branch recovery/heavix-full-product-integration-2026-11-11 and input PREVIEW_ONLY.
- The browser reached the workflow page but had no GitHub sign-in configured for profile `prof_ae1391636a204a5a`; GitHub required authentication before Run workflow was available. The task stopped without submitting any action.
- No credentials were requested in chat, no sign-in was attempted, and no workflow run was created.
- To proceed, the user must explicitly authorize a GitHub sign-in setup session for that browser profile. Never ask the user to paste a password into chat. Once sign-in is saved, the read-only proof may be dispatched with PREVIEW_ONLY.
- Run reference: https://agent.tinyfish.ai/runs/257d4f29-4e34-4d5f-8d8a-7bb39ab879df.

## 2026-11-11 — CI concurrency guard added

- Added a workflow-level concurrency group to `.github/workflows/ci.yml`: `ci-${{ github.event.pull_request.number || github.ref }}` with `cancel-in-progress: true`. Future commits on the same PR/branch will supersede earlier runs and avoid repeating full builds for obsolete commits.
- This change does NOT retroactively cancel runs created before the concurrency setting existed. At inspection, multiple older runs were still active/queued; latest workflow run #42914986140 (commit 01452ed) was queued.
- GitHub connector in this session does not expose a cancel-workflow-run action. Browser profile also lacks GitHub sign-in, so old runs could not be cancelled through the UI.
- Commit: c8e95911e98143c1f9aa0ef07ace952e56df856f. Exact latest CI pending.

### CI concurrency observation correction

- After adding the concurrency group, GitHub still showed older pre-existing PR runs #42914986140 (01452ed) and #42915046750 (c8e9591) both queued; no cancellation of the earlier queue was observed.
- Therefore the concurrency guard is recorded as a future-run optimization only; do not claim it cancelled pre-existing runs or that the exact latest CI is running.
- Current branch queue remains overloaded; if secure GitHub browser sign-in is enabled, cancel obsolete runs manually and keep only the latest code-head run.
## 2026-11-11 — Latest CI failure triage and two contract fixes

- Inspected full logs for CI run #42915285217 (commit 453273cf). `verify` failed only in two contract assertions; 1,908 of 1,910 tests passed, with 61 contract/unit test files passing and 2 failing.
- Failure 1: `tests/contract/admin-store-navigation.test.ts` correctly found the Rentals config still contained `rentals.manage` under its audit action even though CRUD permissions used `store.manage`. Updated `src/lib/admin/resources/store-domain-resources.ts` so Rentals audit actions use `store.manage`.
- Failure 2: `tests/contract/homepage-data-sources.test.ts` rejected any occurrence of the substring `site-stats`, including the safe local helper import `@/lib/site-stats`. Narrowed the assertion to forbid actual admin endpoint `/api/admin/site-stats` and public fetch path `/api/site-stats`, while retaining checks for the DB-backed `getActiveStats` helper and no fabricated province stats.
- Commits: `d5e80c3e15c3d2dffb5eee82a76fa78d45fc76a4` (Rentals audit permission), `7d2c0670a4eb8c51eb7a133ee4d3476679416292` (homepage contract assertion).
- New exact-head CI run #42971201849 for commit `7d2c0670a4eb8c51eb7a133ee4d3476679416292` is running. At checkpoint, verify, phase-tests, Docker proof, TLS proof, Cloudflare compatibility report-only and audit-transaction jobs were in progress; no latest result yet.
- No Preview deploy, DB write, migration, seed or Production/DNS change.

## 2026-11-11 — Exact-head CI green and live Preview binding names verified

- Verified PR #307 remains open/Draft at exact head `45d86f1c7df9d644e4d33431ba5013e0a30646b7`.
- GitHub Actions run #42971293294 completed SUCCESS on that exact head. All required jobs passed, including Typecheck, Lint, security, contract/unit, integration, E2E, PostgreSQL migration, TLS, phase, audit transaction, Cloudflare compatibility report-only, and Docker/Caddy/Compose connectivity.
- Performed a read-only Cloudflare Worker settings audit. Existing `heavix-preview` has secret_text bindings `DATABASE_URL` and `STORE_DATABASE_URL`; plain-text vars are `HEAVIX_ENV=preview` and `NODE_ENV=production`. Secret values were not retrieved or changed.
- Inspected the pinned Workerd proof workflow. It consumes GitHub Actions secrets `HEAVIX_APP_PREVIEW_PPG_URL` and `HEAVIX_STORE_PREVIEW_PPG_URL`; its code does not prove those are identical to the live Cloudflare Worker bindings. This provenance gap must be resolved before treating a passing run as Worker DB identity evidence.
- The proof workflow remains undispatched because browser profile has no GitHub sign-in. No credentials were requested/submitted.
- Added durable audit: `docs/operations/HEAVIX-CI-AND-PREVIEW-BINDING-AUDIT-2026-11-11.md`.
- Updated machine-readable state: `docs/operations/HEAVIX-CURRENT-STATE.json`.
- No merge, deployment, DB writes, secret changes, Production changes or DNS changes.
- Next: establish secret provenance safely; then dispatch read-only Workerd proof and validate Preview before any deployment.

## 2026-11-11 — Legacy archive identity and extracted-manifest reconciliation

- Compared immutable recursive Git trees for `HEAVIXIR/z@217f98ecc800aa64ae4739d27ed2aeb95dd260ed` and `dellk00k/z@bbb1f4947e4b1a05e39f7b510c5c7801d52389e7`.
- Verified all 13 root ZIP archives are byte-identical by matching Git blob SHA and byte size across both repositories.
- Verified the extraction README declares 10 extracted archive families and quarantines `db.zip`, `upload.zip`, and `bun.zip`.
- Counted 844 extracted payload blobs plus three bookkeeping files. The SHA-256 manifest has 845 entries, including its self-entry; 844 payload entries match extracted paths exactly once. The README's category totals also sum to 844.
- Clarified that the historical 845 INTEGRATE / 17 ADAPT / 19 PRESERVE / 18 SAFE_ARCHIVE disposition counts refer to the 899-path archive inventory compared with target `833bec6`, not the extracted staging file count.
- No ZIP was downloaded/extracted/executed; no quarantined content, DB, upload, secret or .env content was read.
- Added `docs/legacy-parity/LEGACY-SOURCE-AND-EXTRACTION-RECONCILIATION-2026-11-11.md` with archive identity table, count semantics, security boundaries and next exact migration actions.
- Latest code-head CI before this documentation checkpoint: run #42982227259, SUCCESS on `cecd4b6601d17e757b018271ba6d49d75c7fdc1a`; six main jobs passed, legacy archive inventory skipped.
- No application code changed; no deploy, DB read/write, Production/DNS action, or merge performed.

## 2026-11-11 — 844-file extracted snapshot vs recovery-branch SHA comparison

- Compared every one of the 844 safe extracted payload files against the current recovery branch tree at `714678ca6920cc10fbb4696b203753df8244bbab` using normalized paths and Git blob SHA-1.
- Results: 494 IDENTICAL, 321 DIFFERENT, 29 MISSING, 0 UNMAPPED.
- Path normalization was explicit and reversible; original staging paths and both source/target blob SHAs are retained in the CSV.
- Mapped all 29 missing paths to the existing value-based disposition record: 16 ADAPT_THEN_INTEGRATE and 13 PRESERVE_AS_REFERENCE. No missing path was automatically imported.
- Identified the historical 17th ADAPT item as `prisma/migrations/README.md`: its target path exists but content differs, so it is not in the 29 missing paths and requires a separate semantic review.
- Per-area comparison: .zscripts 8/1/1; docs 17/1/0; download 1/0/0; examples 2/0/0; mini-services 1/0/0; prisma 29/8/2; public 37/0/1; scripts 0/4/21; src 385/301/4; tests 14/6/0 (identical/different/missing).
- Created `docs/legacy-parity/REFRESHED-EXTRACTED-PATH-HASH-COMPARISON-2026-11-11.md` and its full 844-row CSV companion.
- This is path/hash evidence only; 321 differences are not defects by default, and no code was copied or modified.
- Archive-level scan remains unverified because the last green CI run #42982227259 skipped `Legacy archive inventory (read-only)`.
- No deploy, DB operation, Production/DNS action, or merge.

## 2026-11-11 — Refreshed extracted path/hash comparison committed

- Comparison commit: `a6103524797c2bef842eeace7de68987f0e73da9`.
- CSV disposition correction commit: `c311854b689cb3876407f30fa401ba180301a3f4`; `prisma/migrations/README.md` is marked ADAPT_THEN_INTEGRATE (existing path, differing hash).
- Current comparison totals: 844 payload files; 494 IDENTICAL, 321 DIFFERENT, 29 MISSING, 0 UNMAPPED.
- The 29 missing paths map to 16 ADAPT_THEN_INTEGRATE and 13 PRESERVE_AS_REFERENCE. The 17th historical adaptation is the differing `prisma/migrations/README.md`.
- The full per-file CSV preserves source path, normalized target path, source/target Git blob SHA, comparison result and historical disposition.
- No source files were copied or modified; no app behavior changed.
- Current code commit remains `cecd4b6601d17e757b018271ba6d49d75c7fdc1a`; later commits are documentation-only. The last verified green CI run #42982227259 applies to that code commit; no new exact-head CI result is claimed for the subsequent documentation commits.
- Next: review 321 changed files and 17 adaptations by risk/domain; then continue B2 media and full responsive-web acceptance.

## 2026-11-11 — B2 media architecture decision

- Confirmed the current media service is local-filesystem + JSON sidecar, not durable B2 storage.
- Confirmed the seller uploader calls the admin-only `/api/admin/upload` endpoint; ordinary seller upload is not implemented through that route.
- Confirmed the UI default allows 30 images while listing POST silently persists only 10; this must become one shared 10-image contract with explicit API rejection.
- Confirmed the uploader submits `entityType=Listing` before a listing ID exists; new seller flow must use staging and owner-checked finalization.
- Confirmed the Prisma schema has `ListingImage` but no `MediaAsset` model; initial design keeps metadata sidecars in B2 and uses ListingImage as the authoritative listing association.
- Recorded private-bucket, server-only S3 adapter, stable internal media URL, short-lived signed GET, staging ownership, version-aware cleanup, and least-privilege key design in `docs/operations/HEAVIX-B2-MEDIA-IMPLEMENTATION-DECISION-2026-11-11.md`.
- Backblaze official docs confirm bucket/prefix-scoped standard keys; planned capabilities are listFiles/readFiles/writeFiles/deleteFiles. Avoid List Buckets and therefore do not grant listAllBucketNames unless a tested SDK operation proves it is required.
- No B2 key was created/configured, no B2 object changed, no CORS/lifecycle setting changed, and no live upload test performed.
- Waiting on owner-supplied non-secret Account ID and full Bucket ID plus secure creation/configuration of the dedicated bucket-scoped key; never request the key secret in chat.

## 2026-11-11 — Owner provisioned B2 media key; security hold recorded

- Owner reports key name `heavix-dev-assets-media-preview`, bucket `heavix-dev-assets`, prefix `heavix-media/`, no expiry.
- Reported capability set includes bucket configuration writes and bucket administration. This is broader than HEAVIX's media runtime needs.
- No secret was provided in chat. No B2 key was configured or used.
- Official Backblaze documentation confirms a key can be scoped by `bucketIds` plus `namePrefix`; prefix alone applies across buckets. A key's capabilities cannot be edited in place.
- Runtime configuration remains on HOLD pending full Bucket ID and verification of exact bucket restriction. Replace with explicit Native API `b2_create_key` capabilities `listFiles,readFiles,writeFiles,deleteFiles`, scoped to the one media bucket and prefix.
- Do not use current key for any application, Preview, Worker, GitHub Actions or B2 object operations.

## 2026-11-11 — B2 application-key plan limitation accepted

- Owner corrected prior assumption: their current Backblaze plan/UI does not expose granular capability selection; the full listed capability set is the only available option, consistent with prior DB-backup setup. Do not ask owner to recreate or edit a reduced-capability key.
- Accepted current key as the available credential option, conditional on confirming resource scope is the single `heavix-dev-assets` bucket and prefix `heavix-media/`.
- Backblaze documentation describes bucket restriction and prefix restriction as enforced resource scopes distinct from capability set. Runtime will use only object operations under the prefix and will not call bucket-administration APIs.
- Key metadata recorded: key name `heavix-dev-assets-media-preview`; key ID `0055d132b1dcc410000000004`; bucket `heavix-dev-assets`; prefix `heavix-media/`; no expiry. Secret was not shared or recorded.
- Live B2 test remains pending secure configuration and verification of exact bucket scope. No B2 API call, upload, deletion, or secret configuration was performed.
- Previous "HOLD due to broad capability list" is superseded by this owner-confirmed plan constraint; remaining gate is resource-scope confirmation, not capability reduction.


## 2026-11-11 — Exact-head CI, Cloudflare build/deployment truth, and B2 Preview configuration audit

- Re-fetched PR #307 and confirmed active head is `d2f68100ded4c0c1fbdcf81d6e8cdcb93de0e1f7`; PR remains Draft and unmerged.
- GitHub Actions run #42986374509 completed successfully on this exact head. Verified all six blocking jobs passed: `verify`, `phase-tests`, `tls-proof`, `audit-transaction`, `docker-build-proof`, and Cloudflare compatibility report-only. Legacy archive inventory was skipped and is not counted as passed.
- Cloudflare API read-only inspection of Worker `heavix-preview` found the active deployment is still version #17 (`063ce438-ca3a-4482-b416-9260b780bccf`), created 2026-11-10T21:04:22Z and deployed 2026-11-10T21:08:35Z. No newer active deployment exists in the deployment list.
- Cloudflare Workers Builds configuration is connected to `HEAVIXIR/z-ai-2` branch `main`; `previews_enabled=false`; Preview list is empty. The configured Production deploy command is an intentional echo/no-op guard (`HEAVIX_WORKERS_PRODUCTION_DEPLOY_BLOCKED_PENDING_ARCHITECTURE_AND_DATABASE_ISOLATION_PROOF`); the Preview deploy command is also an echo/no-op guard (`HEAVIX_PREVIEW_DEPLOY_BLOCKED_PENDING_RUNTIME_AND_DATABASE_HEALTH_PROOF`).
- The configured build command checks for `open-next.config.ts/js/mjs`; none of those root files exists on the active recovery branch. Therefore the successful Cloudflare Build run #42986374509 (UUID `5deeb9b3-9e7d-4d31-b1e2-c61603493c60`) is not evidence of a Next.js/OpenNext build or deployment; the configured guard exits successfully with `HEAVIX_SKIP`. The PR bot's “Deployment successful” comment must not be interpreted as a live code deployment.
- Read-only Worker runtime settings list bindings `ASSETS`, `DATABASE_URL`, `HEAVIX_ENV`, `NODE_ENV`, and `STORE_DATABASE_URL`; the secret-name endpoint lists only `DATABASE_URL` and `STORE_DATABASE_URL`. No B2 bindings are present on the currently active Worker version. No secret values were read.
- Owner reports that six B2 settings were added under the dashboard's `Previews Base`: secrets `B2_KEY_ID`, `B2_APPLICATION_KEY`; variables `B2_BUCKET_NAME=heavix-dev-assets`, `B2_REGION=us-east-005`, `B2_S3_ENDPOINT=https://s3.us-east-005.backblazeb2.com`, `B2_MEDIA_PREFIX=heavix-media/`. This is recorded as owner-reported configuration, not yet verified as runtime bindings. Since Worker Previews are currently disabled and no Preview exists, these values are not available to the currently active Worker.
- Read-only live smoke test against `https://heavix-preview.heavixir.workers.dev`: homepage returns HTTP success but renders incomplete/empty product sections; `/api/health` returns 503; `/api/services` returns 500; `/services` returns 404. This is consistent with the active Worker still serving the old version, not proof of defects in the un-deployed recovery branch.
- Re-inspected current media source: `src/lib/media-service.ts` still uses `node:fs` under `public/uploads` with JSON sidecars; `src/app/api/admin/upload/route.ts` still requires admin permission; `ListingImageUploader.tsx` still calls that admin-only endpoint; listing POST still silently truncates images to 10. No B2 media adapter exists in the current branch.
- Safety: no Cloudflare setting was changed; no Preview/Production deployment was initiated; no DB connection, migration, seed, or write occurred; no B2 API operation occurred; no Production or DNS change occurred.
- Next exact action: implement and test the server-only B2 adapter plus seller-owned staging/finalization on this recovery branch, while separately preparing a safe Cloudflare Worker Preview configuration. Before enabling a branch Preview or changing deploy commands, independently prove App and Store database identities and ensure the Preview Base contains only the intended dedicated Preview resources. Do not modify Production settings to make the current branch deploy.


## 2026-11-11 — Cloudflare runtime stack provenance and integration priority correction

- Compared main, the active recovery branch, and infra/prisma6-cloudflare-runtime using GitHub compare API. Recovery is 173 commits ahead of main. The infrastructure branch is 213 commits ahead and 11 behind main; the branches diverged. Do not merge or cherry-pick the whole infrastructure branch.
- Confirmed the active recovery branch still uses Prisma 6.11.1, prisma-client-js generators, and Node-oriented src/lib/db.ts / src/lib/store-db.ts; it has no wrangler.jsonc, no open-next.config.ts, no Worker-specific Prisma clients, and no @prisma/adapter-ppg / @prisma/ppg dependencies.
- The infrastructure branch contains the missing Cloudflare stack: wrangler.jsonc, open-next.config.ts, Worker-specific generated client configuration, src/lib/prisma-worker-clients.ts, request-scoped Prisma proxy, db.worker.ts, store-db.worker.ts, tsconfig.worker.json, Worker typecheck, and OpenNext build diagnostics. These files are not yet integrated into recovery.
- PR #191 (infra/prisma6-cloudflare-runtime) remains Open / Draft / Unmerged at head 65a2bb444eab9d80983feea70557a2e2213e67ef; PR #200 (test/opennext-runtime-integration) remains Open / Draft / Unmerged and stacked on the infra branch. Neither is an approved merge into recovery.
- Historical evidence worth preserving: Workerd DB proof run #42872987144 (attempt 2) passed on infra commit 07b6de155284dd7813335201552acf4efbb6ad90, checking App Preview system identifier 7701427422680793119, Store Preview system identifier 7701425043360235551, migration fingerprints, request isolation, and transaction-scoped READ ONLY. This proves those two GitHub Actions Preview endpoints on that tested commit; it does not prove that the currently active Cloudflare Worker's redacted DATABASE_URL / STORE_DATABASE_URL secrets match them.
- Historical OpenNext route smoke on PR #200 is no-DB evidence only and is based on an older infra branch state; it is not exact-head validation for recovery or a deployment.
- The infra branch documents an unresolved exact package-support-matrix question for Prisma 6.19.3 + @prisma/adapter-ppg 7.10.1 + @prisma/ppg 1.0.1. The prior Workerd proof is positive runtime evidence but does not replace checking published peer dependencies/engines and rerunning exact-head tests after porting.
- Priority correction: before B2 application implementation or any Cloudflare Preview enablement, port the minimal Cloudflare/OpenNext/Prisma Worker runtime stack from the infra work in small reviewed batches to the recovery branch. Preserve Node/Docker behavior, keep deploy commands fail-closed, validate exact package compatibility, run CI + OpenNext real-route no-DB smoke + Workerd DB identity proof on the recovery branch. Only after runtime is viable proceed with the B2 adapter and seller-owned media staging/finalization.
- No code/runtime config change was made during this comparison. No Worker Preview was enabled, no Worker deployed, no DB connection/write, no secret read, and no Production/DNS mutation occurred.


## 2026-11-11 — Exact-branch Build/CI and active Preview identity monitor

### Branches and GitHub evidence

- Active implementation branch remains `recovery/heavix-full-product-integration-2026-11-11`; PR #307 is Draft / unmerged at `4beff75222e70763d54fb778f7afa7e344b503e3`.
- Exact-head CI run #42998197252 passed on that recovery commit. OpenNext real-route proof run #42998197018 is still in progress; do not call the runtime proof green until it completes.
- Reference runtime branch `infra/prisma6-cloudflare-runtime` was at `65a2bb444eab9d80983feea70557a2e2213e67ef` before this session's documentation-only recovery note. PR #191 remains Draft/unmerged. CI run #42883319569 passed, but the Preview DB proof job was skipped. The latest independent approval is on older commit `3bf2333`, so it is stale for the current branch head.
- The earlier OpenNext proof attempt on PR #307 was interrupted by a runner shutdown/SIGKILL during Worker bundling; a retry was canceled after a new branch commit advanced the PR head. The current exact-head run is the authoritative pending proof.

### Cloudflare Build evidence

- Build #2326072d-1e24-45ec-9899-1fa9101ece37 on infra commit `4171f6e631086fe90f3b3b639dda4308613882c2` ended `terminated`. Its log reached Next.js 16.4.5 (Turbopack), remained at `Creating an optimized production build ...`, then emitted `Build took too long and was timed out`. The CSS selector warning involving `#F58220` was non-fatal. No OpenNext artifact was produced and the deploy command was a no-op guard.
- Older Build #1eacbd94-d31e-4969-b01a-88c50d707bfa succeeded on older infra commit `3bf2333fde4f81473ce0d14c99cbd653a386c2e2` with Next.js 16.4.5 (Webpack). It is not exact-head evidence and does not by itself prove that switching the current WASM-sensitive build back to Webpack is safe.
- Build #69a49f21-67dc-4df2-bbc5-911ca7d1be9f on recovery commit `d5f034178918d0b44f83aca7986d82cbada10915` remained running at the last poll; logs had not advanced beyond the optimized production build phase. Its deploy command is still a no-op marker. No Cloudflare Build was triggered or retried during this session.
- The Cloudflare recovery document was updated on infra PR #191 in commit `8cc293e849be4271f778a75b7f7158e2d356c8ab` with the exact timeout evidence and the distinction from the older Webpack success.

### Existing Preview and database-identity gate

- Existing Worker baseline is unchanged: `heavix-preview`, deployment `9c079e5b-e3df-4295-80e0-e930d2d25552`, version #17 `063ce438-ca3a-4482-b416-9260b780bccf`, 100% traffic. No new Worker Preview was created; `previews_enabled=false`.
- Read-only secret-binding GETs returned only `DATABASE_URL` and `STORE_DATABASE_URL` names/types; values were not returned. The active Worker does not expose `/api/opennext-runtime-proof` and has no proof-mode/token/App-Store database-OID configuration.
- The historical Workerd DB proof #42872987144 used GitHub Actions secrets. It proves those GitHub connection inputs, not the actual Cloudflare Worker bindings, and is therefore insufficient for the owner's release gate.
- Live read-only smoke against the stable URL: root timeout; `/api/health` 503; `/api/services` 500; `/services` 404; `/api/opennext-runtime-proof` 404. These are observations of existing version #17, not the un-deployed recovery candidate.

### Safety and next action

- No deployment, Worker setting/secret change, database connection, migration, seed, database write, Production change or DNS change occurred.
- Owner-reported Cloudflare Build usage is already above 2,000 of 3,000 monthly units. Do not trigger/retry Cloudflare Builds as a debugging loop. Recover the exact prior owner-confirmed successful remediation first and obtain explicit owner authorization before any further quota-consuming build.
- Next exact action: poll the existing Build #69a49 and OpenNext run #42998197018 without retrying. Before any deployment, prove both actual Worker DB bindings by read-only App/Store PostgreSQL system identifier plus database OID checks against the independently allow-listed Preview resources. If the binding values remain unprovable, keep deployment blocked.


## 2026-11-11 — Recovery branch Webpack profile and quota protection

- Read-only poll of Cloudflare Build `69a49f21-67dc-4df2-bbc5-911ca7d1be9f` showed terminal status `stopped`. Its logs explicitly show Next.js 16.4.5 (Turbopack), the NFT patch already applied, then `Build took too long and was timed out` during optimized production build. No deployment was performed.
- Verified GitHub Actions run `43010880902`: all 9 job steps succeeded, including the OpenNext Webpack build, complete Worker bundle checks, no-database Workerd smoke, and artifact upload. Artifact `13849664588` is 26,418,563 bytes; GitHub digest `sha256:7418ab71b120329a0fc9becd438d34a014d77e0833233aa303efc32210a4ca18`.
- Ported the tested proof-branch files into `recovery/heavix-full-product-integration-2026-11-11`: `next.config.ts` (Webpack parallelism 4, asyncWASM, App/Store worker aliases), `open-next.config.ts` (explicit Webpack diagnostics), `scripts/cloudflare-next-build-diagnostics.mjs` (Webpack default; Turbopack opt-in), and the small `src/lib/notifications.ts` duplicate-property correction. Added `.github/workflows/cloudflare-open-next-proof.yml` for repeatable GitHub-only artifact/Workerd proof.
- Resulting recovery branch commit: `578fffc21a24a2c879eb5b73e483827c85db434d`.
- Updated Cloudflare non-production Build trigger `ac8064c1-e751-4669-af03-f6cb2922d5e8` to exclude the active recovery branch. Read-back confirmed the exclusion and confirmed Build/Deploy commands are unchanged. No Cloudflare Build was triggered.
- No Worker upload/deploy, DB connection/write, B2 object operation, Production change or DNS change.
- Next: implement the B2 media adapter and seller staging/finalization with mocked tests. Before any live B2 object proof, owner must confirm the dedicated key's bucket selector is exactly `heavix-dev-assets` (not All) and its prefix is exactly `heavix-media/`; never request the secret in chat. Preview DB identity remains NOT VERIFIED.


## 2026-11-12 — Full legacy page/API/asset parity verification

- Resumed from PR #307 and exact candidate code commit `5e1ad2341d713221840d335fa318a74ce9e5668f`; PR remains open and Draft.
- Compared recursive Git trees of legacy snapshot `dellk00k/z@bbb1f4947e4b1a05e39f7b510c5c7801d52389e7` and current recovery tree. Normalized nested archive extraction paths before comparison.
- Verified **145/145 legacy App Router page paths present** in recovery; **278/278 legacy API route paths present**. Recovery has 173 page routes and 365 API route handlers. No legacy page or API route file is missing by path.
- Verified no missing legacy static image/logo asset after normalizing the extracted public tree.
- Dispositioned the four absent legacy source paths: old ComparePageClient behavior is embedded in current /compare route; old listing PriceIntelligence is superseded by current PriceEstimateCard/price-engine/price-compare-service; old price-intelligence library is superseded by current price-engine/price-compare-service; old AI Gateway direct ZAI SDK service is intentionally rejected because its auth/policy/budget handling is best-effort and errors can be swallowed. Legacy seed/migration/audit scripts are not copied or executed because they target legacy schema/runtime and require per-dataset current-schema review.
- Added `docs/audits/HEAVIX-LEGACY-PAGE-API-PARITY-2026-11-12.md` (commit `2772a12fd5cf5b29c2713b4f14a1be2176b28ebe`) with counts, dispositions, exact-head evidence, and remaining release gates.
- Inspected exact-head GitHub Actions: CI run #43109607418 completed success; all blocking jobs succeeded, including typecheck, lint, security, contract/unit, E2E, isolated fresh/baseline Main+Store migrations, production build, real Next server, TLS/transaction/phase tests, Docker+Caddy→app proof and no-DB Workerd smoke. Legacy archive inventory CI job was skipped; tree parity above was independently performed.
- OpenNext runtime proof #43109607496 completed success; real App Router path ran in Workerd without DB credentials and Worker bundle audit passed. Artifact `heavix-opennext-worker-bundle-audit` digest `sha256:8a0b1023e941b28578cecf442ef95fa434d94e069bdf6a899cdb171b128c5534` is an audit report, not a deployed Worker artifact.
- Reconfirmed boundary: route/file presence is not end-to-end runtime acceptance. The active Preview Worker still serves the previous deployment; actual App/Store DB identity on Worker bindings remains NOT VERIFIED; real B2 object upload/readback/hash/delete remains NOT VERIFIED.
- No merge, Cloudflare Build, Worker upload/deploy, secret read/update, DB connection/write, migration, seed, B2 operation, Production change or DNS change was performed.
- Next exact actions: (1) dispatch the protected read-only Preview DB Workerd proof using an authorized GitHub Actions workflow-dispatch path and tie its connection identities to the actual active Worker bindings; (2) run bounded B2 object proof only under `heavix-media/proof/`; (3) after both pass, use the exact successful OpenNext/CI code commit and one Preview-only Cloudflare build/deploy; (4) run browser/HTTP acceptance on the deployed candidate and fix behavioral gaps.

- Follow-up documentation correction: appended a dated recovery-branch clarification to `docs/audits/HEAVIX-LEGACY-TO-CURRENT-INVENTORY-2026-11-11.md` so the historical main-branch five-widget finding is not mistaken for current recovery state. New audit remains the detailed source of route/API/asset parity counts.

- Executed a second read-only live Preview sweep via browser-rendered fetch: root 200 but legacy/empty sections; /api/health 503; /api/services 500; /services 404; Sell in 7 Days, Knowledge, Auctions, Rentals, Listings, Market Insights, Brands, Transport and /api/listings returned 500; Companies 200 but empty; Store 200 but empty/partial with displayed USD rate 0; Compare 200 with empty selection state; Admin correctly required login. `/categories` 404 is not a legacy route (category detail is slug-based), so it is not counted as a missing feature.
- Appended exact live observations and their qualification (old active Worker, not recovery candidate) to `docs/audits/HEAVIX-LEGACY-PAGE-API-PARITY-2026-11-12.md` (commit `e9bc852409d0b4de70505ad5a84edbef0293f240`).


## 2026-11-15 — Release integration, B2 proof, scraper hardening and CI repair

- Re-read `docs/operations/HEAVIX-AGENT-CONTINUATION.md`, the current-state JSON and worklog before continuing. Active integration branch remains `recovery/heavix-full-product-integration-2026-11-11`.
- Merged PR #317 (listing wizard / cascading taxonomy foundation) into the recovery branch only. Exact tested head before merge: `2bfd5da6ec8a85dad91b8e2251f5a38ecdabc403`; prior CI and OpenNext proof were successful. Merge commit: `5525ce6a496db61e8728ae3876dcdcef2b5544dc`. `main` unchanged.
- Added `tests/unit/health-route-timeout.test.ts` to PR #313 covering App DB up + optional Store DB down, App DB down, and bounded 8-second timeout. Commit: `300fdb78c0f7dc12af2dbfaf9b8c7c0541ecbec6`. Merged PR #313 into recovery branch only; merge commit and new recovery head: `bac875427f707c377afbadbdcda43bf5b3b0eb0d`. `main` unchanged. No exact-head CI has yet been run on the combined recovery head.
- B2 workflow #43713429877 completed SUCCESS on commit `0086e09594381840ddfe71e10b0226f993f2f630`. Job `b2-media-proof` passed the actual HEAVIX adapter upload, direct GET byte comparison, scoped ListObjectsV2, signed URL GET byte comparison, exact-object delete and post-delete non-addressability checks. Log confirms isolated Preview bucket `heavix-dev-assets`, prefix `heavix-media/`, region `us-east-005`; no DB, existing media, backup prefix, bucket config or Production resource touched.
- To unblock that one run, GitHub's only pending environment `preview-backup` protection gate was skipped by an administrator via “Start all waiting jobs”. No other environment was approved. This was a Preview-only action, but the protection-rule bypass should be reviewed before reuse. The run checked out older commit `0086e095...`; compare to current recovery head `bac8754...` shows 151 commits ahead and 31 changed files, with only one B2-related file change: a one-line test-scope correction in `tests/unit/listing-image-b2-contract.test.ts`. The B2 workflow and adapter implementation files are unchanged. Treat this as implementation-equivalent proof, not exact-current-head proof.
- PR #332 was closed as superseded by PR #333. No commit was pushed to #332's branch. Its Cloudflare Workers Build trigger remains configured for that exact branch; its earlier automatic build failed because `bun run build:cloudflare` is missing, and no Worker deployment occurred. Do not push that branch. The Cloudflare trigger-list API exposed read-only GET; no trigger mutation was performed.
- PR #333 now targets `main` and contains the full #332 scraper implementation plus hardening: no browser-side third-party image rendering, audit actor set to authenticated admin, bulk import limited to 5, UI selection limited to 5, and regression tests. CI workflow PR event types were updated to include `synchronize` and `edited`. PR #333 is Ready for review, unmerged.
- PR #333 CI run #43719986407 failed due an invalid regular expression in the new test. Fixed the assertion and pushed commit `a48dc0787cd649ef74d4376c86ac249fe1073c52`; run #43720675311 then found the test was slicing the wrong block and failed one assertion. Corrected the test to inspect the first state-updater callback; latest commit is `cd8ef0e78f49e351011bd4e80414187a51cd877e`, and CI run #43721154092 is in progress. At last inspection: TLS, phase-tests, audit-transaction and Cloudflare report-only passed; verify security tests and Docker Caddy connectivity were still running. Do not claim green until the run finishes.
- Vercel Preview for PR #333 commit `a48dc078...` reached READY at `https://heavix-n56s5d4tg-heavixir-3290.vercel.app`. Deployment protection blocks anonymous fetches: /api/health, /admin/ai-scraper, /admin/moderation and homepage return `login_required` / Vercel login. No runtime/admin acceptance was possible without the owner signing into Vercel in the saved browser profile. No password was requested.
- Existing recovery Preview deployment `https://heavix-4px5vv04y-heavixir-3290.vercel.app` remains READY for old recovery commit `c5eda9e...`; read-only health on that old head previously returned App DB up and Store DB up. It is not the current merged recovery head `bac8754...`, and its health result does not certify the latest head.
- PR #330 (taxonomy admin persistence) and PR #331 (safe default seed) were retargeted to the recovery branch. GitHub reports both non-mergeable after retarget; they remain Draft and unmerged pending conflict resolution. PR #314 (parent-only homepage categories) and #312 (homepage performance) also have divergent/conflicting changes; neither was merged. Do not overwrite recovery files wholesale from these branches.
- No Production database writes, migrations, seeds, Cloudflare Worker builds/deployments, DNS changes, stable Worker replacement or main-branch merge were performed. PR #307 remains Draft and unmerged.
- Next exact actions: (1) poll CI #43721154092 to completion and fix any remaining failures on PR #333; (2) obtain owner sign-in to Vercel via secure browser-profile setup to test the protected Preview, admin login and role-gated pages; (3) run exact-head CI/OpenNext for recovery `bac8754...` after integration; (4) resolve/rebase #330/#331 and choose the #312/#314 homepage direction; (5) finish catalog/seed reconciliation, sourceUrl uniqueness decision, media consent/runtime binding audit and final route/RBAC acceptance; (6) prepare one release-candidate review PR. Keep Production and DNS untouched until owner review.


## 2026-11-15 — Scraper exact-head CI passed

- GitHub Actions run #43721154092 completed SUCCESS on exact PR #333 head `cd8ef0e78f49e351011bd4e80414187a51cd877e`.
- All six substantive jobs passed: `verify` (typecheck, lint, security tests and downstream gates), `audit-transaction`, `phase-tests`, `tls-proof`, `docker-build-proof` including real Caddy→app HTTP 200, and Cloudflare compatibility report-only. Legacy archive inventory was skipped by design.
- The two previous test-authoring failures were corrected before this run: first a malformed regex, then an assertion that included the error-display branch instead of only the state-updater callback.
- This is exact-head CI for the scraper PR, not for the recovery branch. PR #307's current recovery code head remains `bac8754...`; its exact-head CI/OpenNext after PR #317/#313 merges is still pending.
- Vercel external check for PR #333 remains rate-limited. Its READY Preview is for the immediately preceding code-equivalent commit `a48dc078...`; Deployment Protection blocks anonymous route acceptance until the owner signs in through the secure browser profile.
- No Production, DNS, Cloudflare Worker deploy, shared DB write, seed or migration was performed.


## 2026-11-16 — Email-only account security and store mutation CSRF hardening

- Owner decision: continue with six-digit email OTP as the only active verification/change-contact mechanism. SMS delivery is deferred until the production-domain release preparation; no SMS vendor, paid messaging service, or SMS OTP activation is authorized now.
- Updated `src/app/account/security/security-center.tsx`: removed the interactive mobile-change form and its unused client handler/state. The existing mobile number and verification state remain visible; the UI clearly states that mobile changes are disabled until SMS infrastructure is prepared. The server endpoint remains fail-closed and returns `SMS_VERIFICATION_NOT_CONFIGURED` without changing the stored number.
- Commit: `23f439edb4a39efaaeb9fa401d49080f943ece11`.
- Added fail-closed Origin/Referer CSRF validation to authenticated wishlist mutations (`POST /api/store/wishlist`) and manual payment receipt submission (`POST /api/store/payments/manual`). Read-only wishlist GET and external payment gateway callback were not changed.
- Commits: wishlist `30415d004d2fb1c2e781535e7ae5f98370558e40`; manual payment `933ad33103cc74b44d3b7aa4a4ca3c8ae92b0dc1`.
- Current selected branch head at this checkpoint: `933ad33103cc74b44d3b7aa4a4ca3c8ae92b0dc1`. It is 55 commits ahead and 0 commits behind `recovery/heavix-full-product-integration-2026-11-11` at comparison time. PR #340 remains Draft/open and unmerged.
- No tests, typecheck, build, CI, Actions dispatch, migration, seed, database operation, deployment, Production or DNS change was run/performed for these commits. Do not infer runtime deployment from source commits.
- Release remains incomplete: catalog/taxonomy data readiness, exact-current-head validation, authenticated Admin/browser acceptance, and final end-to-end payment/inventory/order workflow verification remain open. The broader recovery PR #307 is Draft and unmerged; its documented empty Preview catalog is a material listing-creation blocker. No broad branch merge is authorized.


## 2026-11-16 — Payment and shipment mutation hardening

- Read-only review confirmed the inventory reservation/release service already uses compare-and-swap updates inside transactions; procurement receiving uses a compare-and-swap on received quantity and keeps stock/ledger/outbox writes in the same transaction. These paths were not modified.
- Added Origin/Referer CSRF validation to `POST /api/store/payments/gateway/request` and tightened the non-admin order ownership fallback to require a verified mobile number. Session user ownership remains supported; admin behavior is unchanged.
- Added CSRF validation to `PATCH /api/admin/store/shipments/[id]`. Shipment tracking and exception routes were separately inspected and already enforce CSRF.
- Commits: gateway request `b43bcee8a7b83e811ce891818d163f247da07120`; shipment update `ad81ffcb6bfec60165e0d9e83eb9875b960bbd2b`.
- Verified source after write: both endpoints contain `checkCsrf(req)`; gateway ownership fallback contains `sessionUser.mobileVerified && sessionUser.mobile`.
- Current branch head: `ad81ffcb6bfec60165e0d9e83eb9875b960bbd2b`; PR #340 remains Draft/open and unmerged.
- No test/typecheck/build/CI/Actions/deploy, migration, seed, database or runtime operation was run. Exact-head validation and full payment callback race review remain outstanding; this is not a release approval.


## 2026-11-16 — Gateway callback atomicity and regression coverage

- Refactored public gateway callback state handling so both successful and rejected payment transitions, recomputation of aggregate approved payments, and the corresponding Order.paymentStatus update occur in one database transaction. The success path uses conditional PENDING→APPROVED compare-and-swap and reads the latest status when a concurrent callback already won; the rejection path no longer blindly resets an order to UNPAID when another approved partial payment exists.
- Gateway request handler now checks authentication before CSRF (preserving anonymous 401 behavior), then validates Origin/Referer before parsing or creating a payment. Non-admin phone-based order ownership requires `mobileVerified` and a matching session mobile.
- Updated `tests/security/step-12.89-store-gateway-behavioral.test.ts` to mock CSRF for route behavior tests and add a regression case rejecting an unverified matching phone.
- Commits: callback transaction `1c5fb99b3aea7ada293ee29001163c78d61776be`; auth-first ordering `dc19c959a3517a6baa7893e4cab2fbecd11db9c2`; regression test `d5f0ca1702a72ba51f0c300d01b6b393dfe40e7f`.
- Source-level re-fetch confirmed the success and rejection callback branches use transactions, gateway request has CSRF and verified-mobile checks, shipment PATCH has CSRF, and the regression case is present.
- Current branch head: `d5f0ca1702a72ba51f0c300d01b6b393dfe40e7f`. No test, typecheck, build, CI, Actions dispatch, migration, seed, database operation, deployment or runtime change was run. Regression tests are authored but unexecuted; payment provider sandbox acceptance and exact-head CI remain outstanding.


## 2026-11-16 — Broad administrative mutation protection and free-only scraper gate

- Added fail-closed Origin/Referer CSRF validation after authentication/permission checks to privileged mutation handlers across Store orders, categories, brands, car models, rentals/bookings, service requests/providers, mechanics, currency, and the universal admin resource create/update/delete/action/bulk APIs. Also protected admin listing bulk mutations and listing PATCH/DELETE, attachment creation, and media upload.
- Added `tests/security/admin-mutation-csrf-contract.test.ts`, a source-contract regression suite covering 23 privileged mutation route files and both scraper gates. Test file authored, not executed.
- Both `/api/admin/ai-scraper` and `/api/admin/store/ai-scraper` now fail closed with HTTP 503 `AI_SCRAPER_DISABLED_BY_FREE_INFRA_POLICY` after auth/permission and CSRF checks. This prevents paid AI provider invocation and costly scraping under the current free-infrastructure decision; manual listing/part creation APIs remain the supported path.
- Relevant commits: Store CSRF batch `f28c7b75` through `d718d1a7`; universal/admin listing/media CSRF batch `7c30d8a5` through `6d9ef1ca`; AI scraper gate `60feb008` and `bf4293f5`; regression contract `65f1412f`.
- Source re-fetch confirmed CSRF guards exist in universal resource mutations, admin listing mutations, Store order/category/rental mutations, and scraper gate. The regression contract includes all patched routes.
- No tests, typecheck, lint, build, CI, Actions dispatch, migration, seed, database operation, deploy, Production, or runtime change was run. No live AI provider or scraping request was made. Keep AI scraping disabled until a genuinely free, explicitly approved implementation is designed.


## 2026-11-16 — Marketplace/admin trust and commerce mutation CSRF closure

- Extended fail-closed CSRF checks to privileged mutations for users (suspend/update/delete), payments (update/delete), company verification review/revoke, company update/delete, product update/delete, part update/delete, buy-request update/delete, auction update/delete, and listing rejection.
- Expanded `tests/security/admin-mutation-csrf-contract.test.ts` to cover these additional 10 route files (33 privileged mutation route files in total, plus the two scraper policy checks). The contract suite remains unexecuted.
- Commits: `02117e9e` users; `a5633a27` payments; `d4bf9e2b` verification review; `c87a7497` verification revoke; `6e340cad` companies; `80742992` products; `47e4a2f4` parts; `cfa77334` requests; `70d642d7` auctions; `d1b441c1` listing rejection; `5dbdcea7` regression contract expansion.
- These changes add request-origin protection after authentication and permission checks; they do not alter business data, role permissions, schema, or runtime.
- No tests/typecheck/lint/build/CI/Actions, migration, seed, DB operation, deployment or runtime change was performed.


## 2026-11-16 — Checkout and manual-payment concurrency hardening

- Manual receipt submission now re-reads the order and payments inside a Serializable transaction, enforces ownership by user ID or verified mobile only, rejects cancelled/refunded/already-paid orders, rechecks the pending-receipt cap and pending+approved amount before insert, validates safe positive integer IRR amounts, bounds free-text/reference/card fields, and returns a conflict on Prisma serialization retry (`P2034`).
- Checkout cart lines are now aggregated by part ID, require positive safe-integer quantities, and reject overflow. Customer upsert was moved after cart/catalog/price validation to avoid creating/updating a customer for invalid carts.
- Coupon usage is claimed with a conditional `updateMany` inside the same transaction as order creation and stock consumption; the claim checks active state, immutable pricing/limit snapshot, expiry and remaining usage capacity. If the last use races or coupon eligibility changes, the order transaction rolls back and returns 409.
- Added behavioral regression cases for unverified phone ownership and fractional payment amounts, plus `tests/security/store-checkout-payment-contract.test.ts` for checkout aggregation, coupon CAS, and serializable payment revalidation. These tests are authored but not executed.
- Commits: manual payment hardening `ac9d422f`; checkout cart/coupon logic `3749efb6` and transaction-scope correction `36f03deb`; behavioral tests `8de7291c`; contract tests `f1f89100`.
- Source review confirmed stock decrement remains in the order-creation transaction through `decrementOrderStock`, with Part stock compare-and-swap, deterministic warehouse balance CAS, SALE movements, and audit-outbox records.
- No tests, typecheck, lint, build, CI, Actions dispatch, migration, seed, database operation, deployment, Production or runtime change was performed. Gateway provider was not called.


## 2026-11-16 — Seller listing mutation and media ownership hardening

- Added CSRF checks to seller-scoped `/api/listings/[id]` PATCH and DELETE routes.
- Image deletion, primary-image selection, and reordering now scope every database mutation to the target `listingId`; foreign listing image IDs are rejected rather than mutated.
- Seller image additions now accept only stable internal `/api/media/<24-hex-id>` references, validate that each asset is the authenticated user's private staged Listing asset, enforce a single primary-image request and the shared 10-image cap, persist the stable media URL, and attach the asset to the exact listing through the media service. No arbitrary external image URL or cross-listing asset rebind is accepted.
- Added seller listing/media assertions to `tests/security/store-checkout-payment-contract.test.ts`. Test source is authored, not executed.
- Commits: listing mutation/media hardening `68f6166a`; single-primary constraint `5b09edab`; contract assertions `e116c822`.
- Read-only review of purchase-order cancellation confirmed it uses a Serializable transaction, status compare-and-swap, and transactional audit outbox; no change required there.
- No tests/typecheck/lint/build/CI/Actions, migration, seed, DB operation, deployment, Production or runtime change was performed.

- Follow-up correction: listing image addition now computes the existing image count once, enforces the 10-image total, and ensures at most one primary image is selected when adding multiple staged assets; a requested new primary replaces the previous primary within the same listing scope. Commit `2f08159f`.

## 2026-11-16 — Seller listing partial-mutation guard

- Read the latest seller listing PATCH implementation and found that it persisted ordinary listing fields before validating all requested image additions/removals/primary/reorder operations. A malformed or foreign image request could therefore return 4xx after the listing fields had already changed.
- Added a preflight validation stage before the listing update: staged media references must match the internal `/api/media/<24-hex-id>` form and belong to the authenticated user as private, staged, unbound Listing assets; additions must be unique and respect the 10-image cap and single-primary rule; remove, primary and reorder IDs must all belong to the same listing.
- Corrected the internal media-reference matcher and re-fetched the committed source to verify the exact expression and that the guard appears before `db.listing.update`.
- Added source-contract assertions for validation ordering and cross-listing removal rejection in `tests/security/store-checkout-payment-contract.test.ts`.
- Commits: prevalidation `5ad9740846b9243bd210119c970b4d7337707ff0`; regex correction `7e6d450b63d707520eb477c14d8dee0963ded44e`; regression contract update recorded in the following commit.
- This narrows partial mutation on invalid input but is not a full transaction across database writes and the media sidecar. Concurrent state changes between preflight and persistence remain a reason for exact-head tests and further transactional review.
- No tests, typecheck, lint, build, CI, Actions, migrations, seeds, database operations, deployment, Production or runtime changes were run.

## 2026-11-16 — Admin payment approval overpayment guard

- Reviewed the admin payment decision endpoint. Although approval was already transactional and one-way from PENDING, it previously summed approved payments only after approving the current receipt; it did not reject a receipt whose approval would push the aggregate above the order total, and it did not reject approval for cancelled/refunded orders.
- Added an in-transaction precondition before the payment status update: re-read the order, reject missing/closed/already-paid orders, aggregate other approved payments excluding the candidate receipt, and require safe positive integer amounts with the resulting total not exceeding the order total. Overpayment now returns HTTP 409 `STORE_PAYMENT_OVERPAYMENT`; state conflicts remain HTTP 409.
- Added source-contract assertions for closed-order rejection, aggregate cap and Serializable transaction. Tests are authored but unexecuted.
- Commits: implementation `23ac78155fd54b2872295c1d0b04e5b87077c5a8`; regression contract recorded in the following commit.
- This protects the admin manual-receipt approval path. External gateway callback reconciliation and exact-head behavioral testing remain separate release checks.
- No tests, typecheck, lint, build, CI, Actions, migrations, seeds, database operations, deployment, Production or runtime changes were run.

## 2026-11-16 — Fail-closed order lifecycle guard

- Reviewed the admin order PATCH route and found it could directly set `paymentStatus` (including PAID/REFUNDED) without a matching Payment ledger transition. It could also set `CANCELLED` or `RETURNED` without reversing the exact warehouse allocations created by checkout.
- Added fail-closed guards: payment status is now ledger-derived and cannot be changed through the generic order metadata endpoint; cancellation/return status transitions are rejected there until a dedicated transactional stock-reversal workflow is implemented. Other supported order metadata/status updates remain on the existing route.
- Added source-contract assertions for both guard codes and CSRF coverage. This is an intentional safety gate, not completion of the cancellation workflow; the dedicated reversal service remains a release task.
- Implementation commit `c566812d915ba2d2ac790627d99aa6027e205c7d`; regression contract update recorded in the following commit.
- No tests, typecheck, lint, build, CI, Actions, migrations, seeds, database operations, deployment, Production or runtime changes were run.

## 2026-11-16 — Admin manual billing CSRF closure

- Continued the parallel admin mutation audit beyond Store orders and returns. The separate `/api/admin/payments` POST creates manual billing records, can mark them PAID immediately, and can activate a linked subscription; it had authentication and `payment.manage` permission but no CSRF validation.
- Added fail-closed Origin/Referer CSRF validation after authentication/permission and before parsing or writing the manual payment request. Added the route to `tests/security/admin-mutation-csrf-contract.test.ts`.
- Implementation commit `ec1e6f6e9b25028552e5902a2138c44977585e53`; regression contract update recorded in the following commit.
- The separate subscription/payment activation transaction and ownership relationship remain part of the billing audit; this change only closes the request-origin gap.
- No tests, typecheck, lint, build, CI, Actions, migrations, seeds, database operations, deployment, Production or runtime changes were run.

## 2026-11-16 — Transactional unpaid-order cancellation and stock restoration

- Replaced the blanket admin cancellation block with a dedicated `cancelStoreOrder` service and routed only `CANCELLED` transitions through it. The service uses a Serializable store transaction, conditional order-state claim, and the exact `SALE` StockMovement rows created by checkout; it verifies their quantities against OrderItems before reversing anything.
- Restores each original part/warehouse allocation, updates `Part.stock` and `soldCount`, writes positive `ADJUSTMENT` movements and transactional audit-outbox events, and releases the coupon usage claim. Any missing/mismatched movement ledger, inventory drift, sold-count inconsistency, concurrent update, pending/approved payment, dispatched shipment, or existing return causes a fail-closed conflict and rolls back all writes.
- `RETURNED` remains blocked from generic order PATCH and must go through the dedicated inspected Return workflow, which already performs warehouse restock and wallet-credit refund transactionally.
- Commits: cancellation service `f3c392873c46d7e3c286c882b3d000ab501c058c`; admin route `b848298715fe9422c146389c803de152e2193a97`; service message polish and regression contract/worklog are recorded in subsequent commits.
- Added source-contract assertions for eligibility, Serializable isolation, SALE-ledger matching, exact reversal, coupon release and route delegation. Tests remain authored but unexecuted.
- This is an unpaid/pre-dispatch cancellation path only. Paid-order cancellation and external gateway refunds remain separate; do not interpret wallet-credit return resolution as a gateway refund. No tests, typecheck, lint, build, CI, Actions, migrations, seeds, database operations, deployment, Production or runtime changes were run.

## 2026-11-16 — Refund concurrency and main payment-ledger immutability

- Reworked `refundPayment` from a sequence of independent writes into a Serializable transaction. It now validates safe positive IRR integers, compare-and-swaps the original APPROVED payment row, sums prior refunds linked to that original (including legacy note format), caps cumulative refunds at the source amount, recomputes the parent order payment status in the same transaction, and writes audit events through the transactional outbox.
- Gateway-backed refunds fail closed because no provider-side refund adapter/confirmation is configured. The service no longer creates a local REFUNDED row that could falsely imply funds were returned by the external gateway.
- Hardened the separate main-database `/api/admin/payments/[id]` endpoint: direct PAID/REFUNDED status changes are blocked in favor of provider/action workflows, and DELETE is now fail-closed so financial ledger rows cannot be hard-deleted. CSRF remains required.
- Commits: refund transaction `76a716ae98c6c563ab7826cfb4159a841be83113`; direct status guard `b74c6438718978dcfef3567d15d905ab9574d52b`; append-only DELETE handler `190f6079f1788598137cde6bbe2ac857f1fd4642`; tests/worklog follow-up commits recorded alongside this entry.
- Added regression contracts for cumulative refund caps, source-row compare-and-swap, gateway refund gate, transactional outbox and append-only payment ledger. Tests remain unexecuted.
- No tests, typecheck, lint, build, CI, Actions, migrations, seeds, database operations, deployment, Production or runtime changes were run.

## 2026-11-16 — Universal payment API containment

- The payment audit found that the Universal Resource API still allowed generic POST/PATCH/DELETE mutations for the `payments` resource, bypassing the dedicated financial ledger safeguards even after the dedicated item route was hardened.
- Added `payments` to the dedicated-mutation denylist for both universal collection and item routes, mapping the denial check to `payment.manage`. Reads remain available; mutations must use the dedicated payment endpoints/action workflows.
- Added a regression contract asserting both universal routes deny payment mutations and use the payment-specific permission.
- Commits: item API containment `1d60085a06cdeb6a13d30790928f057d650881b8`; collection API containment `640a1bdecacf37420634cd10950a9c8e9e119810`; test/worklog follow-up recorded in subsequent commits.
- No tests, typecheck, lint, build, CI, Actions, migrations, seeds, database operations, deployment, Production or runtime changes were run.

## 2026-11-16 — Universal bulk payment mutation containment

- Extended the financial-ledger boundary to the Universal Resource bulk-action endpoint. Payment resources now fail closed with HTTP 409 after `payment.manage` authorization and CSRF validation; bulk status changes/refunds cannot bypass the dedicated payment workflows.
- Added a regression contract for the payment-specific permission, CSRF check and `PAYMENT_BULK_MUTATION_DISABLED` response.
- Implementation commit `7764e6de0c04e5c77cf22723334ad50b20f2e5a9`; regression contract/worklog updates recorded in subsequent commits.
- No tests, typecheck, lint, build, CI, Actions, migrations, seeds, database operations, deployment, Production or runtime changes were run.

## 2026-11-16 — Shipment lifecycle and tracking atomicity

- Shipment creation now requires an existing CONFIRMED/PROCESSING order with `paymentStatus=PAID`; uniqueness/concurrency conflicts fail as HTTP 409. Creation and its audit-outbox row commit together in a Serializable transaction.
- Shipment metadata PATCH can no longer mutate the lifecycle status directly. Status changes must append a tracking event through the dedicated tracking workflow.
- Tracking now validates an explicit state-transition graph (PENDING → DISPATCHED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED, with EXCEPTION recovery paths), conditionally claims the previous status/timestamp snapshot, and commits ShipmentTracking + parent snapshot + audit outbox in one Serializable transaction. DELIVERED and FAILED are terminal.
- Added source-contract tests for paid-order shipment creation, atomic audit, transition validation, conditional update and append-only tracking event behavior. Tests remain unexecuted.
- Commits: tracking/status transaction `603a92e9d31ae0d55a1739e49aafc5cc4f07c0a6`; shipment creation gate `27742cd082d9b5182445b2cf63c79883b2c141e3`; test/worklog follow-up commits recorded after these changes.
- No tests, typecheck, lint, build, CI, Actions, migrations, seeds, database operations, deployment, Production or runtime changes were run.

## 2026-11-16 — Procurement/inventory lock-order consistency

- The parallel inventory audit found that procurement receiving's comment promised the global Part → InventoryBalance lock order, but the implementation read the Part and balances before acquiring the Part row lock. Added an explicit PostgreSQL `FOR UPDATE` lock on the Part before reading warehouse balances, aligning the receipt path with `adjustStock`/`transferStock` and reducing deadlock/race exposure under concurrent inventory mutations.
- Hardened `releaseStock` to use Serializable isolation and translate serialization conflicts into a controlled 409 instead of leaking a generic server error. Its existing conditional update still prevents decrementing more reserved quantity than exists.
- Added regression contracts for lock acquisition order and serializable release conflict handling. Tests remain unexecuted.
- Commits: procurement Part-lock `93633a42d6f9da0436deb8ba31cabb2fe2e905e5`; reservation-release serialization `ffce26cc8529decc84005e7539976e315d42c186`; tests/worklog follow-up recorded after these changes.
- No tests, typecheck, lint, build, CI, Actions, migrations, seeds, database operations, deployment, Production or runtime changes were run.

## 2026-11-16 — Shipment-to-order fulfillment synchronization

- Closed a lifecycle gap: tracking previously updated Shipment/ShipmentTracking but did not advance the linked Order status. DISPATCHED now conditionally advances CONFIRMED/PROCESSING orders to SHIPPED; DELIVERED advances SHIPPED or valid active exception-recovery orders to DELIVERED. Both transitions and the shipment tracking append commit in the same Serializable transaction with transactional audit-outbox records.
- The generic admin order PATCH now refuses direct SHIPPED/DELIVERED overrides (`ORDER_SHIPMENT_WORKFLOW_REQUIRED`); the shipment tracking workflow is the single writer for fulfillment lifecycle states. Other order metadata and the dedicated cancellation/return workflows remain separate.
- Added source-contract assertions for order-state synchronization, conditional allowed-state updates, audit action and direct-override rejection. Tests remain unexecuted.
- Commits: service sync `0eaeb47bc0a4a6a25c34ea020b87daaa2e369e01`; order PATCH guard `2fbe67afad451226e7d1b547c5a58a8485a3d035`; transition recovery adjustment, tests and worklog recorded in subsequent commits.
- No tests, typecheck, lint, build, CI, Actions, migrations, seeds, database operations, deployment, Production or runtime changes were run.
