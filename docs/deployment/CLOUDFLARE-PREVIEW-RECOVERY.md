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
