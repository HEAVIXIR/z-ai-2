# HEAVIX Product Readiness Matrix — 2026-11-11

## Scope and evidence standard

This is a source-level inventory of the current recovery branch, not a claim that every route is running or that the Preview deployment is healthy. A route/component/API being present in GitHub does not prove that its database bindings, authentication, data, or browser behavior work in Preview.

Branch: `recovery/heavix-full-product-integration-2026-11-11`  
Base: `main`  
Draft PR: #307

## Public product surface — source presence

| Area | Source evidence | Current assessment |
|---|---|---|
| Homepage | `src/app/page.tsx`, 17 canonical section switch cases, existing `src/components/home/*` | Restored in source on this branch; CI and visual Preview still pending |
| Listings/search | `src/app/listings/page.tsx`, `src/app/api/listings/route.ts` | Present; runtime and search quality not re-verified in this checkpoint |
| Company directory | `src/app/companies/page.tsx`, `src/app/companies/[slug]/page.tsx` | Present; detail page currently has `generateMetadata` |
| Storefront | `src/app/store/page.tsx`, `src/app/api/store/*` | Present; dedicated Store DB is used via `storeDb`; Preview DB identity not verified |
| Store Admin | `src/app/admin/store/*`, `src/app/api/admin/store/*` | Broad set of admin pages and APIs present; end-to-end role/permission coverage not re-verified |
| Sell in 7 Days | `src/app/sell-in-7-days/page.tsx`, `register/*`, `track/*`, `src/app/api/sell-in-7-days/*` | Landing, registration and tracking source routes present; full payment/inspection/settlement workflow not re-verified |
| Knowledge | `src/app/knowledge/page.tsx`, `src/app/knowledge/[slug]/page.tsx` | Listing and article-detail routes present; SEO/runtime not re-verified |
| Services | `src/app/services/page.tsx`, `src/components/home/ServicesSection.tsx`, `src/app/api/services/route.ts`, `src/app/admin/services/page.tsx`, `src/app/api/admin/services/*` | Public services directory has now been added on this branch, using active Service rows and request links. Home section no longer displays placeholder service records when the API is empty. CI/runtime validation pending. |
| Rentals | `src/app/rentals/page.tsx` | Public route present |
| Auctions | `src/app/auctions/page.tsx`, `src/app/auctions/[id]/page.tsx`, `src/app/api/auctions/*` | Public route/API surface present |
| Admin security | `src/app/admin/layout.tsx` calls `getCurrentUser()` and `isAdmin(user.id)` | Server-side RBAC gate present; middleware only checks cookie presence as an early filter, not as final authorization |

## Security finding — Store order enumeration

### Finding: unauthenticated `userId` order lookup

Before remediation, `GET /api/store/orders?userId=<id>` only rejected a mismatch when a session existed. If no session existed, the condition was false and the route queried orders for the supplied user ID. The response includes order items, payments, shipment and mechanic details.

**Remediation on this branch:** the route now returns 401 when a `userId` lookup has no session, returns 403 for a different user's ID, and retains the explicit admin path. Regression tests cover unauthenticated, cross-user, own-user and admin cases.

**Additional guest-flow remediation:** phone-only enumeration has been removed. Guest retrieval now requires both the phone number and exact order number, returns at most one matching order, and sends private no-store cache headers. The guest order reference now includes a 40-bit CSPRNG suffix generated with Web Crypto. The guest Store dialog asks for both values. Regression tests cover phone-only rejection, exact order scoping and no-store headers.

The exact latest-head CI for these final changes is pending. The order number remains a bearer lookup factor; OTP or a separately issued high-entropy one-time access token remains the stronger long-term control.

Manual payment submission and gateway request routes currently require a session and ownership checks; this does not close the separate guest GET issue.

## SEO / discoverability source review

- Added dynamic metadata/canonical/OpenGraph to `src/app/models/[slug]/page.tsx`.
- Added listing metadata/canonical/OpenGraph to `src/app/auctions/page.tsx`; auction detail already has static metadata.
- Added landing-page metadata to `/sell-in-7-days`; marked registration as `noindex,follow` and tracking as `noindex,nofollow`.
- Added metadata to the Knowledge hub index. The Knowledge article detail route already has dynamic metadata.
- Store and Companies are client pages but already have metadata in `src/app/store/layout.tsx` and `src/app/companies/layout.tsx`; the company detail route also has `generateMetadata`.
- Listings, Rentals and Services already expose metadata.
- These are source changes only; verify generated HTML, canonical URLs, sitemap/robots and actual crawler behavior before launch. Other dynamic routes have not all been audited.

## CI / release evidence

- Draft PR #307 targets `main`; it has not been merged.
- Latest fully inspected CI run with the security-test fix: #42910792713, head `a198a5df501c4ce8cdb76da770a37233b3ae972b`. Typecheck, Lint and Security tests passed; `phase-tests`, `tls-proof`, `audit-transaction` and Cloudflare compatibility report-only passed. The full contract/unit suite failed only because an existing homepage data-source test still asserted the old five-widget root PageRenderer layout. That test was rewritten to assert the new 17-section database-backed root composition while retaining PageBuilder registry checks; a new exact-head run is pending. The entire Docker proof job subsequently completed successfully on that run: image build, image verification, Caddy syntax, exact Compose interpolation and real Caddy→app connectivity all passed.
- Earlier run #42909080778 completed with `phase-tests`, `tls-proof`, `audit-transaction`, and Cloudflare compatibility report-only jobs successful; `verify` failed at Typecheck and `docker-build-proof` failed during Docker build.
- The earlier Typecheck errors were caused by stale component type imports/props and a loosely inferred listing row. They were corrected: the 4f960 run confirms Typecheck and Lint passed. The test-only Vitest mock initialization failure was corrected with `vi.hoisted()` in commits 5b018adb6ef7bf23de5697c60ebde9c1f8eb5343 and a198a5df501c4ce8cdb76da770a37233b3ae972b; a new exact-head run must confirm.
- The Docker build failure log points to dynamic filesystem access in the generated Store Prisma runtime, with traces through `src/lib/generated/store-client/runtime/library.js`, `src/lib/store-db.ts`, `src/app/api/admin/backup/route.ts`, `src/app/api/store/coupons/validate/route.ts`, and `src/app/admin/observability/page.tsx`. This is separate from the homepage change and remains a build blocker.
- Vercel reported a build-rate-limit failure for the PR commit; this is not a Cloudflare Worker deployment result.
- No Cloudflare deploy, Preview DB connection, Production DB access, Production change, or DNS change was performed.

## Next execution order

1. Verify CI on the exact latest PR head; resolve homepage typecheck and new test failures.
2. Fix Store guest-order privacy with OTP/one-time order access; add regression tests.
3. Re-run Docker production build after TypeScript passes; only investigate Prisma dynamic filesystem tracing if it remains a fatal build error (current logs show warnings only).
4. Confirm whether a standalone public Services directory is part of the approved product scope; implement only after mapping the current Service/ServiceRequest contracts.
5. Complete route-by-route Admin/RBAC/API/UI matrix for Store, Companies, Sell in 7 Days, Services, Knowledge, Auctions, Rentals and core Marketplace.
6. Verify Preview App and Store database identities independently before any Preview deploy.
7. Deploy only to the existing Preview Worker URL after all required checks and artifact gates pass; never touch Production or DNS in this workstream.

## Store Admin Control Plane — source coverage

Recursive source-tree inventory found **16 Store-prefixed Admin page routes** and **52 Store Admin API route handlers**.

Store-prefixed pages currently present:
- Dashboard, Parts, Brands, Car Models, Categories, Currency, Customers, Inventory, Mechanics, Orders, Payments, Returns, Shipments, Suppliers, Warehouses, AI Scraper.

Several Store domains intentionally use shared/global Admin pages rather than a /admin/store-prefixed route:
- Procurement: `src/app/admin/procurement/page.tsx` uses the Store procurement APIs.
- Homepage Service catalog: `src/app/admin/services/page.tsx` edits public homepage Service rows. Store ServiceProvider management uses the Universal Resource Engine at `/admin/resources/services` (`servicesConfig` → `serviceProvider` → `/api/admin/store/services/providers`). ServiceRequest has a separate API and appears as a provider relation/detail workflow; a dedicated request work-queue UI still needs verification.
- Rentals: registered in the Store resource registry and served by the Universal Resource Engine at `/admin/resources/rentals`.
- Pricing, Analytics, Audit Log, Media Library and SEO have shared global Admin pages.
- Shipment lifecycle has the Store Shipments page; a separate logistics dashboard API exists and its exact UI wiring still needs verification.

**Remaining Control Plane verification:** the older `docs/STORE-RESOURCE-MATRIX.md` reports 13 Store resources complete through Schema/Service/API/Permission/Registry/Admin UI/Validation/Audit/Tests/Monitoring, but explicitly records a DATABASE_URL environment blocker and static-only contract tests. Independently verify that navigation entries resolve to these shared routes, the resource registry points to the correct Store database and APIs, and each page exposes all necessary actions (including purchase-order receiving, rental booking lifecycle, service-request state transitions and logistics exceptions). The presence of a page or API is not by itself proof of runtime end-to-end completion.

No Store-scoped Promotions page was found in the inspected route inventory; determine whether the approved product requires one or whether an existing global campaign/marketing page owns that workflow.

## Security finding — Admin health endpoints

The middleware intentionally short-circuits paths ending in `/health` before checking the session cookie so infrastructure probes can reach health handlers. Each detailed admin health handler must therefore enforce its own route-level authorization.

Source review found `/api/admin/store/health` and `/api/admin/marketplace/health` had no route-level authentication and exposed database status, counts, latency and monitoring details. `/api/admin/catalog-health` already required a signed-in user with analytics permission.

**Remediation on this branch:** Store health now requires `getCurrentUser` + `store.read`; Marketplace health requires `getCurrentUser` + `analytics.read`. Added handler tests for unauthenticated, missing-permission and authorized cases, and updated the general auth-boundary test to assert route-level protection for all three detailed admin health endpoints. The middleware health-probe bypass and public `/api/health` liveness contract remain intact.

CI validation is pending for these newest changes.
## Cloudflare Preview environment evidence (read-only)

- Existing Worker script: `heavix-preview`.
- Active deployment: `9c079e5b-e3df-4295-80e0-e930d2d25552`; active version: `063ce438-ca3a-4482-b416-9260b780bccf`; 100% traffic allocation; created 2026-11-10T21:08:35Z.
- Worker vars: `HEAVIX_ENV=preview`, `NODE_ENV=production`.
- Secret binding names include `DATABASE_URL` and `STORE_DATABASE_URL`; values were not retrieved. Names alone do not prove that the databases are dedicated Preview instances or that App and Store are distinct.
- Existing `.github/workflows/prisma-preview-workerd-proof.yml` performs a pinned, read-only Workerd proof against two distinct Preview GitHub secrets and checks expected PostgreSQL system identifiers plus read-only session mode. It requires manual `workflow_dispatch` with `PREVIEW_ONLY`; it was inspected but not dispatched in this session.
- No Worker deploy, secret update, DB connection or DNS change was performed.
### Store Admin navigation remediation

- The seeded Store navigation originally omitted the Universal Resource Engine entries for Procurement, Rentals and Service Providers, even though the resource configs and pages existed.
- Added `/admin/resources/procurement` (`procurement.read`), `/admin/resources/rentals` (`store.read`) and `/admin/resources/services` (`store.read`) to the Store menu seed.
- Found a permission mismatch in `rentalsConfig`: it referenced `rentals.read/manage`, which are not in the canonical permission catalog, while the dedicated Rentals API enforces `store.read/manage`. Updated the resource config to use `store.read/manage`.
- Added a contract test to ensure the Store menu exposes these routes and the permission keys match the canonical catalog/API.
- Important: the navigation seed has not been run against Preview DB in this session. After Preview App/Store DB identity is verified, run the approved idempotent admin-navigation seed and confirm the sidebar displays these entries.
## Security finding — Admin navigation RBAC bypass and stale permission aliases

Source review found `GET /api/admin/navigation` treated any authenticated user session as the legacy-admin path. It attempted `requirePermission(admin.navigation.read)` but swallowed denial, left the permission set null, and consequently returned every navigation item. This was not a data API bypass, but it exposed the complete Admin route tree and violated least-privilege navigation filtering.

**Remediation on this branch:** the route now requires an authenticated user and `admin.navigation.read`; it always builds the user's canonical permission set and filters grouped and standalone items by exact `permissionKey`. The unrestricted legacy fallback has been removed. Added tests for 401, 403, no-permission denial, exact item filtering and RBAC mode.

Additional source scan found seven navigation seed permission aliases absent from the canonical `PERMISSIONS` catalog: `admin.home.manage`, `admin.menu.manage`, `admin.settings.read`, `article.read`, `media.read`, `pricing.read`, and `service.read`. They were aligned to `admin.homepage.manage`, `admin.navigation.manage`, `admin.settings.manage`, `content.read`, `media.manage`, `price.read`, and `service.manage`. A contract test now checks every permissionKey in the navigation seed against the canonical catalog.

These navigation seed changes are code-only. The idempotent seed has not been run against Preview DB; apply only after exact App/Store Preview DB identity verification.