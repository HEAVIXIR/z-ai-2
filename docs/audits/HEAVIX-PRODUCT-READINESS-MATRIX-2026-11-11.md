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
| Services | `src/components/home/ServicesSection.tsx`, `src/app/api/services/route.ts`, `src/app/admin/services/page.tsx`, `src/app/api/admin/services/*` | Home section + public API + admin CRUD present. No `src/app/services/page.tsx` or other public /services landing route found in recursive app tree. Confirm whether a standalone public services directory is required; current CTA routes service requests through listings. |
| Rentals | `src/app/rentals/page.tsx` | Public route present |
| Auctions | `src/app/auctions/page.tsx`, `src/app/auctions/[id]/page.tsx`, `src/app/api/auctions/*` | Public route/API surface present |
| Admin security | `src/app/admin/layout.tsx` calls `getCurrentUser()` and `isAdmin(user.id)` | Server-side RBAC gate present; middleware only checks cookie presence as an early filter, not as final authorization |

## Security finding — Store order enumeration

### Finding: unauthenticated `userId` order lookup

Before remediation, `GET /api/store/orders?userId=<id>` only rejected a mismatch when a session existed. If no session existed, the condition was false and the route queried orders for the supplied user ID. The response includes order items, payments, shipment and mechanic details.

**Remediation on this branch:** the route now returns 401 when a `userId` lookup has no session, returns 403 for a different user's ID, and retains the explicit admin path. Regression tests cover unauthenticated, cross-user, own-user and admin cases.

**Additional guest-flow remediation:** phone-only enumeration has been removed. Guest retrieval now requires both the phone number and the exact order number, and the API returns at most the matching single order. The guest Store dialog now asks for both values. Regression tests cover phone-only rejection and exact order scoping.

This remediation is not yet CI-verified. An OTP or high-entropy one-time guest access token remains the stronger long-term control; the order number currently acts as a bearer lookup factor and should not be treated as equivalent to OTP.

Manual payment submission and gateway request routes currently require a session and ownership checks; this does not close the separate guest GET issue.

## SEO / discoverability source gaps to verify

- `src/app/models/[slug]/page.tsx`: no `generateMetadata` or static metadata export found during this source review.
- `src/app/auctions/page.tsx`: no `generateMetadata` or static metadata export found.
- `src/app/sell-in-7-days/register/page.tsx` and `track/page.tsx`: no metadata export found in the inspected files.
- The company detail route does have `generateMetadata`; an older SEO audit stating otherwise is stale for this branch.
- Recheck sitemap/robots and private/stateful routes before launch.

## CI / release evidence

- Draft PR #307 targets `main`; it has not been merged.
- Latest CI run observed during the checkpoint: run #42909392999, head `a024230c0e1df1a6102e504191d064e91fad807f`, in progress at the time of inspection.
- Earlier run #42909080778 completed with `phase-tests`, `tls-proof`, `audit-transaction`, and Cloudflare compatibility report-only jobs successful; `verify` failed at Typecheck and `docker-build-proof` failed during Docker build.
- The earlier Typecheck errors were caused by the restored homepage using stale component type imports/props and a loosely inferred listing row. These were corrected in a later commit; only a new exact-head CI run can verify the correction.
- The Docker build failure log points to dynamic filesystem access in the generated Store Prisma runtime, with traces through `src/lib/generated/store-client/runtime/library.js`, `src/lib/store-db.ts`, `src/app/api/admin/backup/route.ts`, `src/app/api/store/coupons/validate/route.ts`, and `src/app/admin/observability/page.tsx`. This is separate from the homepage change and remains a build blocker.
- Vercel reported a build-rate-limit failure for the PR commit; this is not a Cloudflare Worker deployment result.
- No Cloudflare deploy, Preview DB connection, Production DB access, Production change, or DNS change was performed.

## Next execution order

1. Verify CI on the exact latest PR head; resolve homepage typecheck and new test failures.
2. Fix Store guest-order privacy with OTP/one-time order access; add regression tests.
3. Investigate generated Store Prisma dynamic filesystem tracing and repair Docker production build without weakening security.
4. Confirm whether a standalone public Services directory is part of the approved product scope; implement only after mapping the current Service/ServiceRequest contracts.
5. Complete route-by-route Admin/RBAC/API/UI matrix for Store, Companies, Sell in 7 Days, Services, Knowledge, Auctions, Rentals and core Marketplace.
6. Verify Preview App and Store database identities independently before any Preview deploy.
7. Deploy only to the existing Preview Worker URL after all required checks and artifact gates pass; never touch Production or DNS in this workstream.
