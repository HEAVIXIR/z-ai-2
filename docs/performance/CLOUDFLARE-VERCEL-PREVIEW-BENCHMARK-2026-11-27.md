# HEAVIX Preview Performance: Cloudflare vs Vercel

Status: measurement plan only. No runtime code changes.
Baseline: current Integration branch head at the time this branch was created.
Safety: Preview only; synthetic accounts/data; read-only measurements. No production traffic, DB writes, deployment, DNS changes, secrets, or paid resources.

## Repository facts

- Vercel serves the regular Next.js Node deployment. Cloudflare packages the same Next.js application through OpenNext as a Worker. This is a runtime/adapter comparison, not just a CDN comparison.
- Cloudflare already enables `nodejs_compat`, `nodejs_compat_populate_process_env`, static asset binding, observability and Smart Placement. The Worker config explicitly notes that homepage rendering performs multiple PostgreSQL round trips.
- Cloudflare builds alias Main and Store DB modules to Worker-specific Prisma clients; both database paths can contribute to request latency.
- The Cloudflare compatibility CI job is report-only; its success is not evidence of good runtime performance or browser compatibility.
- PR #376 removes the prior `cpu_ms: 500` override to stay within Cloudflare Free constraints. Do not restore it or assume a paid plan. Its authentication remediation uses WebCrypto PBKDF2 (600,000 iterations) for new hashes; measure real Worker CPU and elapsed time.
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

No paired browser traces, route-level latency distributions, Worker CPU samples, Main/Store DB timings or cache-hit measurements are attached. The compatibility report is not a performance test.
