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
