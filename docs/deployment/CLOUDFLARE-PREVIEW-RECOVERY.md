# HEAVIX Cloudflare Preview Recovery

## Scope

This change repairs the missing OpenNext project configuration so Cloudflare
Workers Builds can attempt a reproducible adapter build for HEAVIX.

It is a **build-only compatibility experiment**. It does not enable preview
deployments, alter Worker secrets or bindings, attach routes/domains, change
DNS, migrate data, or affect the Docker production path.

## Evidence that prompted this change

The Cloudflare Workers Build log for
`097e07f3-1d80-447d-9512-dc3017a8c888` stopped with:

```text
Error: No `open-next.config.ts` file was found in the project root.
This file is required for OpenNext Cloudflare builds.
```

The Cloudflare build configuration also currently has:
- `previews_enabled = false`
- a preview deploy command that intentionally prints
  `HEAVIX_PREVIEW_DEPLOY_BLOCKED_PENDING_ARTIFACT_AND_DATABASE_ISOLATION_PROOF`

Those deployment guards are intentionally preserved.

## Second build blocker found and corrected

After adding the OpenNext config, the next build advanced into Next.js but
failed with `Cannot find module '@tailwindcss/postcss'`. The Workers Build
environment sets `NODE_ENV=production`; its subsequent npm install therefore
pruned development dependencies that Next.js requires at build time. The
non-production build configuration was adjusted to include development
dependencies. The production build command and production deployment settings
were not changed.

## Build warning fixed during bundle inspection

The successful OpenNext bundle exposed a pre-existing duplicate object key in
`src/lib/notifications.ts`: both `read: true` and `read: new Date()` were
written to the same Prisma field. The latter overwrote the boolean and did not
populate the schema's `readAt` timestamp. Both mark-read paths now set
`readAt`, with focused unit coverage.

## Page Builder origin selection

The Page Builder resolves its API origin in this order:

1. The current request host, using `x-forwarded-host` first and then `host`,
   but only when the hostname is trusted (local development, a HEAVIX
   `workers.dev` host, a configured deployment host, or a HEAVIX site
   subdomain).
2. `NEXT_PUBLIC_BASE_URL`.
3. Vercel's `VERCEL_URL`.
4. `NEXT_PUBLIC_SITE_URL`.
5. The local-development fallback.

Untrusted request hosts are rejected. The request-host path is necessary for
branch-specific Workers Preview URLs: a build-time `NEXT_PUBLIC_SITE_URL`
points at the stable preview Worker and would otherwise make a branch build
fetch data from the wrong Worker. The unit test exercises the trusted
`x-forwarded-host` path.

This resolver does **not** enable Cloudflare Preview URLs and does not prove
that a branch-specific Worker exists or is reachable.

## Cloudflare Workers Build control plane

The connected Cloudflare account has one Workers Build configuration for
`heavix-preview`; it is not a Cloudflare Pages project.

The non-production trigger currently:
- watches non-production branches (`branch_includes = ["*"]`);
- excludes `main` and the two isolated Prisma 7 experiment branches;
- skips branches that do not contain an OpenNext configuration;
- uses the locally installed OpenNext CLI when present (so a branch with a
  frozen lockfile uses its pinned toolchain), otherwise installs the pinned
  fallback versions `@opennextjs/cloudflare@1.20.14` and
  `wrangler@4.156.0` before building.

The build command is deliberately compatible with both the homepage/OpenNext
branch and the separate Prisma 6 Worker-runtime branch. A non-OpenNext branch,
such as the archive-only branch, exits successfully without attempting an
OpenNext build.

The trigger's deploy command remains the fail-closed echo below. The control
plane still has `previews_enabled = false`; therefore these are build attempts,
not live branch Preview deployments.

```bash
echo HEAVIX_PREVIEW_DEPLOY_BLOCKED_PENDING_ARTIFACT_AND_DATABASE_ISOLATION_PROOF
```

## Production deployment guard

The Cloudflare Workers Build configuration previously had
`auto_build_enabled=true` on `main` and a production deploy command of
`bunx opennextjs-cloudflare deploy`. That conflicted with HEAVIX's Docker-first
production decision and could publish the experimental Worker on a future
main-branch update.

The production deploy command is now fail-closed:

```bash
echo HEAVIX_WORKERS_PRODUCTION_DEPLOY_BLOCKED_PENDING_ARCHITECTURE_AND_DATABASE_ISOLATION_PROOF
```

The production deployment guard remains unchanged. No Worker version was
deployed by this recovery work.

## Database/runtime evidence still BLOCKED

The successful build log also records four Prisma calls during static page
generation that could not resolve `DATABASE_URL`:
- `category.findMany()`
- `brand.findMany()`
- `listing.findMany()`
- `article.findMany()`

Those failures did not fail the adapter build because the relevant build-time
paths handled the errors. They are not proof that the deployed Worker can query
data.

The preview build environment contains no `DATABASE_URL` or
`STORE_DATABASE_URL` values. The existing `heavix-preview` Worker has secret
bindings with those names, but Cloudflare redacts their values; their target
databases cannot be independently verified from this connection. Therefore
preview deployment remains blocked until both endpoints are proven to be
isolated non-production databases and read-only connectivity checks pass. No
secret values are copied into Git or this document.

## Acceptance gates

1. Cloudflare Workers Build completes the OpenNext build step.
2. Build artifacts and route manifest are inspected.
3. Static assets, App Router routes, Route Handlers, middleware, image handling,
   and server-only dependencies are checked for Worker compatibility.
4. Both PostgreSQL clients are proven to use isolated non-production databases.
5. Authentication, session handling, RBAC, security headers, and error paths
   pass runtime smoke tests in a non-production Worker.
6. Only after all gates pass may a separate decision enable a preview deployment.

A successful adapter build is **not** proof of runtime compatibility and is not
a production release approval.

## Pinned Cloudflare build toolchain

The Cloudflare adapter and Wrangler CLI are pinned in `package.json` to the exact versions used by the successful OpenNext build command: `@opennextjs/cloudflare@1.20.14` and `wrangler@4.156.0`. The `build:cloudflare` script runs that local, lockfile-resolved adapter directly with `--noMinify`; it does not dynamically install a second toolchain during the build. Bun is pinned to `1.4.4` in `packageManager` and in the Cloudflare Build environment.

The non-production Cloudflare Workers Build trigger now runs `bun run build:cloudflare` directly from the pinned Bun lockfile. It no longer performs a second, non-lockfile `npm install` during the build. The trigger's deploy command remains the explicit no-op safety marker, so a successful build still cannot publish a Worker.


## Scoped glob/minimatch compatibility and security override

The Cloudflare build log proved the failure path: `@node-minify/core@9.0.2` loads `glob@10.3.3`, whose declared `minimatch` range is `^9.0.1`. A root-wide `minimatch@^3.1.5` override forced the old API into this package; `glob/dist/mjs/pattern.js` then failed to import the named export `GLOBSTAR`. The second toolchain path, `@opennextjs/cloudflare@1.20.14`, brings `glob@13.0.6` with a `minimatch@^10.2.2` dependency.

Do not fix this by deleting security overrides or by globally replacing every `glob` package with a different major. The package manifest now uses Bun version-scoped overrides:
- `minimatch@^3.1.2` and `minimatch@^3.1.5` stay pinned to `3.1.5` for legacy consumers.
- `minimatch@^9.0.1`, `minimatch@^10.2.2`, and `minimatch@^11.0.2` resolve to `11.0.4`, which provides the modern named API and is newer than the GHSA-g3hv-75wg-m249 fixed release `11.0.1`.
- No global `glob` override remains; each consumer keeps its declared compatible glob major.
- `brace-expansion@^1.1.7` remains pinned to security-fixed `1.1.21`; `brace-expansion@^5.0.12` resolves to security-fixed `5.0.12`, which supplies the named `expand` export required by `minimatch@11`.

Bun `1.4.4` is pinned because version-scoped overrides require the lockfile v3 format. The branch's lock-refresh workflow regenerated `bun.lock` in commit `9a15bfbddfdc5e20d52c9bdf0aad63894d10c2f7`. Independent inspection confirmed the root `minimatch@3.1.5` entry plus nested `minimatch@11.0.4` entries at `@node-minify/core/glob/minimatch` and `glob/minimatch`; a contract test now guards these exact resolutions.  The first build after the minimatch correction exposed a second global-override collision: `minimatch@11.0.4` imported the named `expand` export from `brace-expansion`, but the global `brace-expansion@^1.1.21` override supplied the v1 API. This is now handled with version-scoped rules for `^1.1.7 → 1.1.21` and `^5.0.12 → 5.0.12`; both versions are on their fixed security releases. Lock-refresh commit `ed0f14c858f7d9cd289c48868084707b4d430523` has now been generated; the lock retains root `brace-expansion@1.1.21` and nests `brace-expansion@5.0.12` beneath the modern minimatch paths. The contract test now asserts these exact lockfile paths. Acceptance requires the full Cloudflare build and GitHub CI to pass, then passing GitHub CI and a fresh Cloudflare Workers Build. Until then, this is a targeted dependency correction under verification, not a completed build fix.

References: [Bun version-scoped overrides](https://bun.com/docs/pm/overrides), [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Prisma Worker WebAssembly build requirement

A controlled Cloudflare Build against commit `79917afc...` reached Next.js 16.4.5 Webpack compilation and identified the Worker-client build blocker: both generated clients import `internal/query_compiler_bg.wasm?module`. Webpack 5 rejects those modules unless `experiments.asyncWebAssembly` is enabled. The import traces pass through the Main and Store Worker clients and their respective Worker database entrypoints.

The Cloudflare-only Next configuration enables `asyncWebAssembly` and the OpenNext `buildCommand` uses `bunx next build --webpack`. This does not alter the Node/Vercel build path. Acceptance remains blocked until a fresh Cloudflare Workers Build passes, including OpenNext bundling, and the Worker-specific typecheck passes.

The blocking GitHub CI workflow now runs `bun run typecheck:worker` after generating both Prisma clients. Static source-contract assertions are supplementary and do not replace the compiler or real `workerd` tests.

## Cloudflare build file-descriptor limit

Cloudflare Build `974c0be4-8dac-4912-b413-b11bf16534a8` on commit `77b8e415...` passed Next.js 16.4.5 Webpack compilation (75s), Worker TypeScript (55s), and generation of all 14 static pages. It then failed while opening `.next/server/pages-manifest.json` with `EMFILE: too many open files`. The Next log showed seven static-generation workers.

The Cloudflare-only Next configuration now caps `experimental.cpus` at 1 to reduce concurrent worker file descriptors. The Node/Vercel path is unchanged. The next Workers Build must verify manifest generation, OpenNext bundling, and the final artifact before this change is accepted.

## Cloudflare file-descriptor limit diagnostic

Build `b474f8df-4ac9-4dca-853f-12ec1549af16` showed that `experimental.cpus: 1` is effective for static generation (14/14 pages completed with one worker) but does not prevent the final Next standalone-output copy from exhausting file descriptors. The build failed copying `.next/server/app/_global-error.html` to `.next/server/pages/500.html` with `EMFILE`.

The Cloudflare-only OpenNext build command now attempts to raise the shell soft `RLIMIT_NOFILE` to 4096 and prints both soft and hard limits before invoking `next build --webpack`. This is diagnostic and fail-open only for the limit-setting operation; the build itself still fails normally if the platform limit cannot support Next's file-copy phase. Do not remove standalone output or suppress this error: OpenNext's Cloudflare adapter expects a standalone Next build.

## Cloudflare build file-operation concurrency

The Cloudflare Build shell reports `RLIMIT_NOFILE` soft=1024 and hard=1024; attempting to raise the soft limit to 4096 does not change the hard ceiling. The subsequent build still reached 14/14 static pages with one Next worker, then failed on a single `copyFile` with `EMFILE`.

The next diagnostic keeps Next's Cloudflare-only worker count at 1, caps Webpack module parallelism at 4, and sets `UV_THREADPOOL_SIZE=1` before starting the Next process. The OpenNext build command continues to log the soft/hard file-descriptor limits. If this still fails, the Cloudflare Build hard limit is a platform constraint; do not suppress the error or remove the standalone output required by OpenNext.

## Cloudflare standalone output tracing scope

Build `99876ca1-9d35-4a7c-8703-b9c286c6e73d` passed Webpack compilation (74s), Worker TypeScript (59s), and static generation (14/14 pages with one worker), but still exhausted the hard 1024 file-descriptor limit while opening `.next/server/pages-manifest.json`. Reducing Next/webpack/libuv concurrency alone was insufficient.

The Cloudflare-only configuration now narrows standalone output tracing:
- Excludes Worker-client TypeScript sources already compiled into Next server chunks.
- Excludes the unused Store Node client and build-only Prisma CLI/engine files.
- Excludes repository-only docs, tests, scripts, VCS metadata, and build caches from runtime tracing.
- Explicitly includes the Main and Store Worker `query_compiler_bg.wasm` assets.

The OpenNext command retains the nofile soft/hard diagnostic and restores the default-size libuv thread pool (4). This is a targeted trace reduction experiment; a successful Next standalone build and OpenNext Worker bundle are required before acceptance. Node/Vercel tracing remains unchanged.

## Preview crawler protection — CI regression repaired

The exact-head CI run `41914626205` failed one of 1,912 contract/unit assertions: `tests/contract/preview-indexing-policy.test.ts` expected `X-Robots-Tag: noindex, nofollow, noarchive`, but `next.config.ts` did not emit that response header. The other 1,911 assertions passed; the independent phase, database, TLS, backup/restore, and runtime-contract jobs were green.

The Next config now imports the canonical `IS_PREVIEW_DEPLOYMENT` flag from `src/lib/site-config.ts` and adds the global `X-Robots-Tag` header only for preview/development. Production retains the existing security header set without the preview noindex directive. The existing test remains strict; it was not weakened.

## Current Cloudflare build limitation — nofile

Cloudflare Build `3d9359c6-3cb1-49c1-b226-995a6eb9e561` compiled successfully (72s), completed TypeScript (51s), and generated all 14 static pages with one worker, but failed when Next attempted to open `.next/trace-build` and `.next/server/pages-manifest.json` with `EMFILE`. The build container reports both soft and hard `RLIMIT_NOFILE=1024`; raising the soft limit is not permitted.

Important distinction: Next 16.4.5 applies `outputFileTracingIncludes/Excludes` after the Node File Trace operation has already run. Therefore these patterns can reduce the final standalone trace contents but cannot be assumed to fix the earlier `.next/trace-build` file-descriptor exhaustion. Do not treat trace exclusions or worker count as a proven fix. Next work must isolate the build trace file-descriptor pressure (or establish a Cloudflare Builds platform limitation) before further config changes. Keep standalone output and deployment gates unchanged.

## File-descriptor pressure instrumentation

Three consecutive Cloudflare builds reached the same Next.js finalization failure under a hard/soft descriptor limit of 1024. The observed errors include an attempted write of `.next/trace-build` (Next's diagnostic trace reporter catches/logs its own write error) followed by a fatal open of `.next/server/pages-manifest.json`. Build compilation, TypeScript, and all 14 static pages had already succeeded.

The next build now invokes the same Next.js CLI through a thin Node diagnostic wrapper. It samples the Next process and descendant process descriptor counts from `/proc/<pid>/fd`, records per-process peaks, and prints `HEAVIX_FD_PEAK` at exit. It does not raise limits, change Next configuration, suppress errors, remove standalone output, or deploy anything. This will distinguish a real process-local descriptor exhaustion from an unrelated Cloudflare build-environment issue before another mitigation is selected.

## PR #183 base dependency-lock synchronization

PR #183's updated base branch has now completed the scoped dependency repair and Bun 1.4.4 lock refresh at `b1a99f07e8bf1fe048511a1dc71e32704512f06a`. This PR branch carries the same exact OpenNext/Wrangler pins and version-scoped overrides, and its lockfile contains the equivalent modern nested `minimatch@11.0.4` / `brace-expansion@5.0.12` resolutions alongside the additional Prisma Worker dependencies.

The base synchronization also brings in the dedicated `tests/contract/cloudflare-modern-glob-overrides.test.ts` regression guard. The Worker adapter refresh workflow remains scoped to this PR's branch. This merge commit synchronizes source history; it is not a merge of either pull request into `main`.

## Root cause confirmed — Next's vendored Node File Trace concurrency

The descriptor sampler on Cloudflare Build `dc37cdba-e3c6-4f32-8601-d956a2dab6fd` measured the main Next process at 208 open descriptors before static generation, 277 during generation, 732 immediately after all 14 static pages, and exactly 1,024 while Next entered `Collecting build traces`. The fatal open was a server App Router `route.js`; child processes peaked at only 29 descriptors.

Inspection of the exact Next.js 16.4.5 source shows `collect-build-traces.ts` imports `nodeFileTrace` from `next/dist/compiled/@vercel/nft`. The vendored `@vercel/nft` implementation defaults `fileIOConcurrency` to **1024**, and passes that value to its cached filesystem semaphore. This matches the observed hard limit exactly. The earlier `outputFileTracingExcludes` rules are applied after this trace operation and therefore cannot prevent this failure.

A Cloudflare-build-only, version-guarded patcher now changes the vendored default from 1024 to 64 before the Next CLI starts. It:
- Requires Next.js exactly `16.4.5`.
- Resolves the exact vendored module used by Next's build trace.
- Requires exactly one occurrence of `fileIOConcurrency:w=1024`.
- Replaces it with `fileIOConcurrency:w=64`; if the expected source shape differs, it fails closed rather than silently building with the unsafe default.
- Leaves the installed package manifest/lockfile and all non-Cloudflare build paths unchanged.

The FD diagnostic wrapper remains enabled to verify the observed peak falls below the 1024 hard limit. A successful Next standalone build, OpenNext Worker bundle, and later real `workerd` tests are still required; this patch is not deployment approval.

## NFT trace concurrency retest — 64 is insufficient

Cloudflare Build `6b681988-3ed3-4c94-a6a6-875e291e3c43` proved the `fileIOConcurrency=64` patch was applied and allowed:
- Webpack compilation to pass (62s).
- Worker TypeScript to pass (46s).
- All 14 static pages to generate successfully.

However, the descriptor sampler measured a main-process peak of 954 (down from 1,024) and the build still failed during the final standalone `copyfile` operation. The 64-operation cap therefore reduces but does not eliminate descriptor pressure under the 1,024 hard limit.

The guarded patch target is now reduced from 64 to **16**. The same exact-version and exact-token checks remain in force; FD sampling remains enabled. The next build must prove a materially lower peak and complete standalone/OpenNext output before this is accepted.

## Base branch synchronization — Bun and Cloudflare FD guards

The PR #183 base branch now pins all six CI Bun setup steps to `1.4.4`, matching the lockfile writer. It also includes the same Cloudflare-only Next 16.4.5 vendored NFT patch (`fileIOConcurrency=16`) and FD sampling wrapper. This PR branch already carried Bun 1.4.4 and the PPG-specific Next settings; the synchronized contract test now verifies the shared dependency, toolchain, and Cloudflare FD guard invariants across both branches.

The merge commit records base history only. PR #183 and PR #191 remain Draft/unmerged; no production branch or Worker deployment was changed.

## Docker/CI Bun pin synchronization

PR #183's Docker proof found one remaining toolchain mismatch: the Docker builder/runtime images were still `oven/bun:1.3.14`, so `bun install --frozen-lockfile` rejected the Bun 1.4.4 lockfile. Both Docker stages are now pinned to the published `oven/bun:1.4.4` and `oven/bun:1.4.4-slim` tags. This PR branch already carries those exact Docker tags and pins all CI Bun setup steps to 1.4.4. The synchronized dependency contract test now checks the Docker tags as well.
