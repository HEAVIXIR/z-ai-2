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
