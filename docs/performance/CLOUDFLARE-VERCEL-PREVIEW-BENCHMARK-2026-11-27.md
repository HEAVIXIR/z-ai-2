# HEAVIX Preview Performance: Cloudflare vs Vercel

Status: first read-only Cloudflare measurements recorded; paired same-commit Vercel comparison remains blocked. No runtime code changes.
Baseline: current Integration branch head at the time this branch was created.
Safety: Preview only; synthetic accounts/data; read-only measurements. No production traffic, DB writes, deployment, DNS changes, secrets, or paid resources.

## Repository facts

- Vercel serves the regular Next.js Node deployment. Cloudflare packages the same Next.js application through OpenNext as a Worker. This is a runtime/adapter comparison, not just a CDN comparison.
- Cloudflare already enables `nodejs_compat`, `nodejs_compat_populate_process_env`, static asset binding, observability and Smart Placement. The Worker config explicitly notes that homepage rendering performs multiple PostgreSQL round trips.
- Cloudflare builds alias Main and Store DB modules to Worker-specific Prisma clients; both database paths can contribute to request latency.
- The Cloudflare compatibility CI job is report-only; its success is not evidence of good runtime performance or browser compatibility.
- PR #376 proposes removing the prior `cpu_ms: 500` override and moving Preview authentication to WebCrypto PBKDF2 (600,000 iterations). It is still open and is NOT integrated into the current Integration head. The current Integration branch still has the unsupported CPU override and bcryptjs password verification; do not describe the PR as an active runtime fix until it is safely rebased, reviewed and integrated.
- Login is force-dynamic. Authenticated admin and listing paths must not be made publicly cacheable to improve scores.

## Comparison: likely sources of the gap (hypotheses, not measurements)

1. Worker/OpenNext runtime overhead versus Vercel's Node runtime.
2. Main + Store PostgreSQL network distance, sequential round trips and connection/pool behavior. Smart Placement is already enabled, but cannot remove excess queries.
3. CPU-heavy work, especially password verification and image processing, under Cloudflare Free CPU limits.
4. Client-side JavaScript volume, hydration and request waterfalls; these affect both providers and must be measured separately from TTFB.
5. Browser-specific runtime/asset/CSP errors. Test Chromium, Firefox and WebKit rather than assuming host choice explains them.

## Paired benchmark

Use the exact same reviewed application commit and equivalent non-production data/DB region on Vercel Preview and Cloudflare Preview. Warm up each route, then run at least 30 interleaved samples per provider and browser. Report p50, p75, p95 and failures; never compare unrelated commits or database locations.

| Journey | Measures |
|---|---|
| Public home `/` | TTFB, LCP, INP, bytes, request count |
| Login page `/login` | TTFB, LCP, hydration, JS errors |
| Synthetic login submit | end-to-end time, CPU if available, DB time, outcome |
| Admin landing `/admin` | TTFB, session lookup, DB query count |
| Listing create/edit | ready time, reference-data waterfall, save time |
| Listing detail/images | TTFB, image transfer, API waterfall |
| Bounded synthetic upload | upload and image-processing duration |

Record provider, exact SHA, region/colo, browser/version, cache status, status code, TTFB, total time, bytes, trace/request ID, query count and Main/Store DB durations. Never log cookies, tokens, passwords, personal data or request bodies.

## Provisional acceptance targets

- Static assets: p75 TTFB <= 200 ms near an edge.
- Public HTML: p75 <= 500 ms; p95 <= 1.2 s.
- Authenticated admin HTML: p75 <= 700 ms; p95 <= 1.5 s.
- Login submit: p75 <= 1.0 s; p95 <= 2.0 s, without CPU-limit errors.
- Listing navigation: p75 <= 1.0 s; save: p75 <= 1.5 s.
- No functional failures across current Chromium, Firefox and WebKit.
- No public caching of personalized/authenticated data and no weakening of auth, RBAC, ownership, CSRF or image validation.

These are proposed preview targets, not measured results.

## Optimization order after evidence

1. Verify compression and immutable caching for static assets.
2. Cache only public, non-user-specific catalog/reference reads with explicit TTL/invalidation. Keep auth/admin/private listing responses private/no-store.
3. Trace and reduce sequential Main/Store PostgreSQL round trips; batch/select only needed fields and parallelize independent reads only where consistency semantics permit.
4. Measure PBKDF2 and image-codec CPU on the actual Free Worker. Do not weaken password hashing or validation; redesign within verified free-tier limits if CPU is the bottleneck.
5. Reduce client JS/hydration on login, admin and listing flows; defer non-critical charts/editors.
6. Re-run identical cross-browser tests and compare p75/p95.

## Decision

Keep Cloudflare as the target only if these Preview journeys meet the gates on the Free plan without security regression. If not, keep Vercel as the faster preview reference and document the specific Cloudflare blocker. No production host switch, paid plan, deployment or workaround is authorized by this benchmark.

## Evidence still missing

Paired browser traces, Vercel route timings, Worker CPU samples, Main/Store DB timings and cache-hit measurements are still missing. Cloudflare route-level samples below are preliminary and are not a same-commit cross-provider benchmark. The compatibility report is not a performance test.


## Read-only observations — 2026-11-27

### Deployment identity: not a same-commit comparison yet

- Selected Integration branch: integration/preview-readiness-workerd-2026-11-15.
- Current Integration head observed during this audit: 9c270d6273f8dad5cf5053c0badbead78d6871be.
- Latest Vercel Preview for this branch: deployment dpl_BtffZjrKNpK7KdTEhCqtVfXgQGN9, READY, commit 906f23a98330b44478642f85f4474edd9fcacda2 (2026-11-24). The current Integration head is 80 commits ahead of this deployed SHA. Vercel has no Preview deployment for 9c270d6 yet.
- The Cloudflare Preview build attempt for 9c270d6 failed before deployment. Wrangler configuration on the Integration head sets limits.cpu_ms to 500; Cloudflare rejected it with API error 100328 because configurable CPU limits are unsupported on the connected Free plan.
- The Cloudflare Worker script heavix-preview has an existing deployment dated 2026-11-21. The failed current-head build means it must not be treated as a deployment of the 2026-11-27 Integration head.
- External fetches to Vercel Preview are blocked by Vercel Deployment Protection (login_required), so this audit could not independently time Vercel's protected API endpoints. Vercel runtime-log lookup for the last 30 minutes returned no matching transaction-types request logs. User-reported Vercel speed remains valid qualitative evidence, but no paired numeric comparison is claimed.

### Cloudflare endpoint timing

Read-only fetches to the current branch-specific Cloudflare Preview origin returned:

| Endpoint | Observed end-to-end latency |
|---|---:|
| GET /api/transaction-types, sample 1 | 11,429 ms |
| GET /api/transaction-types, sample 2 | 7,677 ms |
| GET /api/transaction-types, sample 3 | 6,907 ms |
| GET /api/taxonomy | 8,462 ms |
| GET /api/health | 7,164 ms |

Cloudflare Workers Observability for service heavix-preview recorded 10 requests matching /api/transaction-types in the preceding hour: average span duration 3,374.7 ms and p95 6,527 ms. This is a small preliminary sample, not a 30-run browser benchmark; it includes only the Cloudflare Worker service and does not provide a Vercel comparison or a DB/CPU breakdown.

### Listing wizard request duplication

- The listing page fetches /api/taxonomy on mount with cache: no-store.
- The TransactionTypePicker independently fetches /api/transaction-types with cache: no-store.
- The /api/taxonomy response already includes transactionTypes. Therefore the first step currently triggers a redundant transaction-type request and waits on a separate endpoint even though the same data is already being loaded for the rest of the wizard.
- The Cloudflare API route uses a Worker-specific Prisma client. The Worker resolver creates a request-scoped client; the identity guard runs a database identity SQL query before the first model query. That adds a database round trip to each request. This is a source-confirmed contributor candidate, not yet a proven share of the measured wall time.
- No user/session response should be publicly cached. Any reference-data caching must be restricted to public, non-personalized catalog data and must have explicit freshness/invalidation semantics.

### Immediate engineering order

1. Restore a deployable Free-plan Preview configuration only together with the compatible authentication remediation. PR #376 contains the proposed paired change, but it has diverged from current Integration (48 commits ahead on Integration; 33 commits ahead on the PR branch) and must be rebased/reviewed as a coherent change set. Do not copy only the CPU-limit deletion while leaving bcrypt verification on the Worker.
2. Consolidate the listing wizard's initial reference-data load so TransactionTypePicker consumes transactionTypes from the existing /api/taxonomy response instead of issuing a second request. Keep a dedicated API endpoint if other consumers need it.
3. Instrument the Worker route and Prisma adapter to separate request wall time, identity-check time, transaction-type query time, and response serialization. Do not weaken the database identity guard without an explicit threat-model review.
4. After an approved Preview deployment of one exact SHA, deploy that same SHA to Vercel Preview and Cloudflare Preview, then run at least 30 interleaved samples in Chromium, Firefox and WebKit. Until then, no claim of provider parity is justified.

Safety: all observations above were read-only. No Cloudflare build/reconnection, Preview deployment, database migration/seed, secret change, Production change or PR merge was performed.
