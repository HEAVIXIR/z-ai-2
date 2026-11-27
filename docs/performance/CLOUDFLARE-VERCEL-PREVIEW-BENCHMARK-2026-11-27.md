# HEAVIX Preview Performance — Cloudflare vs Vercel

**Status:** measurement plan / no runtime changes  
**Baseline source:** `bdccfe4d2e7a8f812496e4d5ffd3d314dbd4294a` (Cloudflare Free authentication remediation PR #376)  
**Safety:** preview-only, read-only traffic, synthetic accounts/data only. No production traffic, user sessions, DB writes, deployment, DNS, or paid resources.

## 1. What is known (repository evidence)

- The Cloudflare preview is a Next.js 16 application packaged by OpenNext into a Worker (`.open-next/worker.js`); Vercel runs the regular Next.js Node deployment. These are different server runtimes and adapters, not merely two CDN front doors.
- Cloudflare's Worker config already enables `nodejs_compat`, `nodejs_compat_populate_process_env`, static asset binding, observability, and Smart Placement. The config comment specifically says homepage rendering performs multiple PostgreSQL round trips and Smart Placement is intended to move fetch execution nearer the backend.
- The Cloudflare path aliases the Main and Store database modules to separate Worker-specific Prisma clients. Both databases therefore remain in the critical path where a route queries both.
- The regular Node path uses the standard Prisma client. A Vercel-vs-Cloudflare comparison must keep the same application commit, data shape, and equivalent database location/pooling; otherwise it confounds host runtime with database/network placement.
- The Cloudflare compatibility CI job is explicitly report-only. A green static compatibility check is not a latency or browser-compatibility result.
- The earlier integration Worker config included a 500 ms CPU limit, but PR #376 removes that override to remain compatible with the Cloudflare Free-plan constraints. Do not restore a CPU override or assume a paid plan. Authentication was also changed to WebCrypto PBKDF2 (600,000 iterations) for new hashes; measure its actual CPU/wall-time on the target Free Worker rather than infer performance from local Node tests.
- `/login` is force-dynamic. Authenticated admin routes and data-heavy listing/dashboard flows may execute server-side database work on navigation and mutation. Do not cache personalized HTML, session data, admin responses, or listing mutations as a speed shortcut.

## 2. Working diagnosis (hypotheses, not measured conclusions)

1. **Server execution / CPU:** OpenNext adaptation plus Worker execution can add overhead compared with the Vercel Node runtime; crypto and image-processing paths may be especially sensitive. The 600k PBKDF2 login path needs a measured CPU budget.
2. **Database round trips:** Smart Placement is already configured, which suggests DB distance is recognized as a factor. Measure Main and Store separately and count sequential round trips; placement does not eliminate chatty query patterns.
3. **Dynamic rendering and cacheability:** auth, admin, and listing pages must remain private, but public catalog/reference data and immutable static assets can potentially be cached independently with explicit safe policies.
4. **Client bundle / hydration:** compare identical browser traces and JS transfer/hydration costs. Host choice alone will not fix oversized client components, repeated requests, or expensive hydration.
5. **Browser differences:** test Chromium, Firefox, and WebKit with identical network/device profiles. Separate browser-specific JS/runtime errors from slow server TTFB.

## 3. Required paired benchmark

Run the same reviewed commit on Vercel Preview and the existing Cloudflare Preview, without changing production. Use at least 5 warm-up requests and 30 measured requests per route/provider, interleaved to reduce time-of-day bias. Record p50, p75, p95 and failures; do not report a single best request.

| Journey | Route/action | Required observations |
|---|---|---|
| Public entry | `/` | TTFB, LCP, INP, transferred bytes, request count |
| Sign-in page | `/login` | TTFB, LCP, JS errors, hydration |
| Sign-in submit | existing synthetic account only | end-to-end duration, Worker CPU if available, DB duration, success/failure |
| Admin landing | `/admin` | authenticated TTFB, session lookup duration, DB query count |
| Listing creation | existing preview-only draft flow | page ready time, reference-data calls, submit duration, validation errors |
| Listing detail/edit | representative preview fixture | TTFB, image transfer, API waterfall, mutation duration |
| Image upload | bounded synthetic image | upload duration, image optimization duration, storage response |

For each request capture: provider, deployment SHA, region/colo, browser/version, cache status, status code, TTFB, total duration, response bytes, server trace/request ID, DB query count and Main/Store DB duration. Never record cookies, tokens, passwords, personal data, or full request bodies.

## 4. Acceptance gates (initial engineering targets)

- Public static assets: p75 TTFB <= 200 ms when served from a nearby edge, with correct cache headers.
- Public HTML: p75 TTFB <= 500 ms and p95 <= 1.2 s.
- Authenticated admin HTML: p75 TTFB <= 700 ms and p95 <= 1.5 s under the same test region.
- Sign-in end-to-end: p75 <= 1.0 s and p95 <= 2.0 s, with no Worker CPU-limit errors.
- Listing create/edit navigation: p75 <= 1.0 s; save p75 <= 1.5 s, excluding deliberate user think time.
- No browser-specific functional failures across current Chromium, Firefox, and WebKit.
- No private/personalized response may become publicly cacheable; no regression in auth, RBAC, tenant/ownership checks, CSP, or CSRF protections.

These are proposed targets for preview evaluation, not claims about current performance or guarantees.

## 5. Optimization order after measurements

1. Separate static assets from dynamic HTML; verify immutable asset caching and compression.
2. Add safe caching only for public, non-user-specific reference/catalog reads, with explicit TTL and invalidation. Keep auth/admin/private listing responses `private, no-store` unless a reviewed policy proves otherwise.
3. Trace and reduce serial Main/Store PostgreSQL round trips; batch/select only required fields and parallelize independent reads where transaction/consistency semantics allow.
4. Measure Worker CPU for PBKDF2 and image codecs. Do not lower password-hash security or bypass validation to improve speed. If the Free CPU budget is exceeded, redesign the execution path within verified free-tier limits rather than silently raising limits.
5. Reduce client JS and hydration on login/admin/listing routes; defer non-critical charts/editors and avoid loading heavy modules before needed.
6. Re-run the exact same cross-browser benchmark and compare p75/p95, not anecdotal page impressions.

## 6. Decision rule

Cloudflare remains the target only if the measured Preview journeys meet the gates on the Free plan with the required security controls. If it cannot, keep Vercel as the faster preview/development reference while documenting the specific Cloudflare blocker; do not switch production hosting, buy a plan, or deploy a workaround without a separate explicit approval.

## 7. Current evidence gaps

- No paired Vercel/Cloudflare browser trace or statistically useful latency sample is attached yet.
- No production-like but non-sensitive dataset has been confirmed for the paired preview.
- The static vinext compatibility artifact does not establish runtime compatibility or speed.
- Worker CPU, Main/Store DB timing, cache hit ratios, and route-level server traces must be collected before selecting optimizations.
