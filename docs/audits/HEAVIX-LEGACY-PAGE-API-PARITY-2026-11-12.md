# HEAVIX Legacy Page, API and Asset Parity Audit — 2026-11-12

## Purpose and method

Read-only recursive Git tree comparison between:

- Legacy reference: `dellk00k/z`, commit `bbb1f4947e4b1a05e39f7b510c5c7801d52389e7` (extracted snapshot).
- Current implementation candidate: `HEAVIXIR/z-ai-2`, branch `recovery/heavix-full-product-integration-2026-11-11`, commit `5e1ad2341d713221840d335fa318a74ce9e5668f`.

Legacy archive wrapper paths were normalized to their application-relative paths before comparison (for example, `extracted/src/src/app` → `src/app`, and `extracted/src/public/public` → `public`). This is a source-tree presence comparison, not proof of runtime behavior, data completeness, authorization correctness, or visual parity.

## Verified route parity

| Surface | Legacy snapshot | Current recovery branch | Legacy routes missing in current |
|---|---:|---:|---:|
| App Router pages (`page.tsx` etc.) | 145 | 173 | **0** |
| API route handlers (`route.ts` etc.) | 278 | 365 | **0** |

All 145 legacy page paths and all 278 legacy API route paths are present in the current recovery tree. The current tree contains 28 additional page routes and 87 additional API handlers.

This directly disproves the assumption that whole public/admin page route files are still absent from the current recovery source. The current live Preview can still appear to be missing those pages because it is serving the old active Worker version, not this recovery branch.

## Static assets

After normalizing the extracted snapshot's nested `public/public` layout, every legacy static image/logo asset in the extracted tree has a matching current-tree path. **No missing legacy image asset was found** in this path-level comparison.

This does not prove that every image URL is referenced correctly, that each image loads in Preview, or that dynamic user-uploaded media is persisted. Those require browser/runtime and B2 object-store tests.

## Legacy source files absent from current tree — disposition

Four application source files are absent by exact path, but their capabilities have current implementations or deliberate replacements:

1. `src/components/compare/ComparePageClient.tsx` — the current `src/app/compare/page.tsx` contains the client comparison experience directly; `src/components/listings/CompareButton.tsx` is wired from listing detail. Do not add a second duplicate comparison client.
2. `src/components/listings/PriceIntelligence.tsx` — current listing detail uses `PriceEstimateCard`; current price functionality is implemented through `price-engine.ts`, `price-compare-service.ts` and the current price-intelligence APIs/admin pages. Verify UX parity and real data at runtime rather than copying the old component.
3. `src/lib/price-intelligence.ts` — replaced by the current price-engine/price-compare service architecture. The old implementation uses a different PriceRecord contract and must not be copied without a schema/behavior review.
4. `src/lib/ai-gateway-service.ts` — intentionally not copied. The legacy service invokes the old ZAI SDK directly and its policy/auth/budget checks are best-effort (errors are swallowed and AI execution continues). The current AI gateway API, validation and Admin controls are the maintained architecture; do not reintroduce the old gateway.

The remaining absent TypeScript/JavaScript files are legacy operational scripts, seed scripts, audit scripts and example WebSocket files. They are not App Router pages or API handlers. In particular, legacy Prisma seed/migration scripts target the old schema/database lifecycle and must not be executed or copied wholesale into the current PostgreSQL App/Store architecture. If a specific catalog dataset is still required, translate its records into a reviewed, idempotent, current-schema seed with Preview-only safeguards and tests.

The legacy archive wrappers, quarantined database/upload/Bun archives, local runtime shell scripts, PID files and duplicate extracted metadata are intentionally not runtime application files and remain excluded.

## Homepage state on the recovery branch

The recovery branch `src/app/page.tsx` now composes the canonical 17 section keys from `src/lib/homepage/sections.ts` using current components and current Prisma contracts. Public GET section reads are read-only; missing defaults are composed in memory; explicit disabled rows remain disabled. The custom PageRenderer/PageBuilder path remains available for custom pages and preview flows.

The root source restoration is therefore present in the recovery branch. It is **not deployed** to the active Preview Worker. Do not infer a missing route from a live Preview 404 when that Worker is known to be on the pre-recovery version.

## Exact-head CI and OpenNext evidence

On the exact candidate commit `5e1ad2341d713221840d335fa318a74ce9e5668f`:

- CI run [#43109607418](https://github.com/HEAVIXIR/z-ai-2/actions/runs/43109607418): completed / success.
- OpenNext runtime integration proof [#43109607496](https://github.com/HEAVIXIR/z-ai-2/actions/runs/43109607496): completed / success.

The CI run's blocking jobs completed successfully: verification (typecheck, lint, security, contract/unit tests, E2E, fresh and baseline-adoption migrations for isolated CI databases, production build and real Next.js server proof), phase tests, TLS proof, transaction audit, Docker build + Caddy-to-app connectivity, no-database Workerd smoke, and Cloudflare compatibility report-only. The legacy archive inventory job was skipped by the workflow; the tree parity counts above were independently computed read-only.

The OpenNext run built and exercised a real App Router path in Workerd without DB credentials and passed the Worker bundle audit. Its artifact is an audit report, not proof that a Worker was uploaded or deployed.

## Still NOT VERIFIED — release blockers

1. **Active Preview database identity:** the actual Cloudflare Worker `DATABASE_URL` and `STORE_DATABASE_URL` targets have not been proven to be the allow-listed Preview App and Store databases. Secret names are not identity evidence. The GitHub read-only proof workflow exists but has not been dispatched in this session; even that workflow's GitHub secrets must be tied to the actual Worker bindings before release.
2. **Live B2 object operations:** unit/config tests do not prove upload, download, SHA-256 readback and deletion against the actual `heavix-dev-assets` bucket. No live object proof is claimed.
3. **Preview deployment:** the active Worker still serves the previous version. No Cloudflare build, upload or deployment was performed in this audit.
4. **Runtime page/data/visual acceptance:** page/API source presence does not prove all pages render with real data, all navigation links resolve, all admin actions are authorized, or the reference design is visually correct. These require Preview browser acceptance after safe deployment.
5. **Workflow dispatch capability:** the connected GitHub actions interface available in this session can inspect runs and rerun failed jobs, but does not expose `workflow_dispatch`. Do not claim the protected Preview DB proof was run.

## Required next execution order

1. Keep PR #307 open and Draft; do not merge or deploy based solely on route-tree parity.
2. Run the existing protected `Prisma Preview Workerd Runtime Proof` workflow with `PREVIEW_ONLY` through an authorized GitHub Actions dispatch path, using the already-configured secret store without printing secret values. Require App and Store identity + migration fingerprint + read-only transaction checks to pass.
3. Execute one bounded B2 proof object under `heavix-media/proof/`: upload → download → SHA-256 match → delete that exact object. Do not touch user assets or the DB-backup bucket.
4. Verify artifact provenance and Preview-only bindings/configuration; then perform one approved build/deploy to the existing `heavix-preview` Worker, not Production.
5. Run route-by-route HTTP/browser acceptance across public pages, seller/customer flows, Store, Companies, Services, Sell in 7 Days, Knowledge, Rentals, Auctions, Compare, price intelligence, search, Admin navigation/RBAC and media. Record failures by exact route, response, console error and underlying data dependency.
6. Repair behavioral gaps on this recovery branch, rerun CI, and repeat Preview acceptance. Roll back the Preview Worker if any critical path fails.

## Safety

No Production/DNS change, merge, Worker setting/secret update, database connection/write, migration, seed, B2 object operation, Cloudflare Build or deployment was performed during this audit.
