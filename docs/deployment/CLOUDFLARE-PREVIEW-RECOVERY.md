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

After adding the OpenNext config, the next build advanced into Next.js but failed with `Cannot find module '@tailwindcss/postcss'`. The Workers Build environment sets `NODE_ENV=production`; its subsequent `npm install` therefore pruned development dependencies that Next.js requires at build time. The non-production `previews_base_config.build_command` was updated to pass `--include=dev` to npm. The production build command and production deployment settings were not changed.

## Build warning fixed during bundle inspection

The successful OpenNext bundle exposed a pre-existing duplicate object key in `src/lib/notifications.ts`: both `read: true` and `read: new Date()` were written to the same Prisma field. The latter overwrote the boolean and did not populate the schema's `readAt` timestamp. Both mark-read paths now set `readAt`, with focused unit coverage.

## Configuration

The Page Builder also resolves the origin for its server-side data-source fetches from `NEXT_PUBLIC_BASE_URL`, then Vercel's `VERCEL_URL`, then `NEXT_PUBLIC_SITE_URL`. This is required because Cloudflare Workers does not provide `VERCEL_URL`; without the Cloudflare preview URL fallback, homepage listing/category widgets attempted to fetch from `http://localhost:3000` and silently rendered empty. A pure unit test covers all resolution paths.

- `open-next.config.ts` selects the Cloudflare OpenNext adapter with its
  default configuration. No unverified cache, queue, or R2 integration is
  enabled.
- `wrangler.jsonc` describes the expected OpenNext Worker entry point and
  static asset binding, using the existing Worker name and compatibility date.
- `.open-next/` and `.wrangler/` are generated artifacts and are ignored by Git.

## Production deployment guard

The Cloudflare Workers Build configuration previously had `auto_build_enabled=true` on `main` and a production deploy command of `bunx opennextjs-cloudflare deploy`. That conflicted with HEAVIX's Docker-first production decision and could publish the experimental Worker on a future main-branch update.

The production deploy command is now fail-closed:

```bash
echo HEAVIX_WORKERS_PRODUCTION_DEPLOY_BLOCKED_PENDING_ARCHITECTURE_AND_DATABASE_ISOLATION_PROOF
```

The production build command and automatic build setting remain unchanged; only deployment is blocked. `previews_enabled` remains false and the preview deploy command remains blocked. This is a control-plane safety change only; no Worker version was deployed.

## Database/runtime evidence still BLOCKED

The successful build log also records four Prisma calls during static page generation that could not resolve `DATABASE_URL`:
- `category.findMany()`
- `brand.findMany()`
- `listing.findMany()`
- `article.findMany()`

Those failures did not fail the adapter build because the relevant build-time paths handled the errors. They are not proof that the deployed Worker can query data.

The preview build environment currently contains no `DATABASE_URL` or `STORE_DATABASE_URL` values. The existing `heavix-preview` Worker has secret bindings with those names, but Cloudflare redacts their values; their target databases cannot be independently verified from this connection. Therefore the preview deployment remains blocked until both endpoints are proven to be isolated non-production databases and read-only connectivity checks pass. No secret values are copied into Git or this document.

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
