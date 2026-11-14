# HEAVIX — Prisma Worker Identity and OpenNext Runtime Proof

**Status:** implementation port prepared on the recovery branch; exact-head validation pending.  
**Scope:** non-production verification only. This document does not authorize a database connection, Worker Preview enablement, deployment, migration, or Production change.

## 1. Provenance and integration policy

The Worker/PPG and OpenNext proof work originated in the divergent infrastructure and runtime-proof branches associated with PRs #191 and #200. Neither branch is merged wholesale. Only reviewed files are ported into:

`recovery/heavix-full-product-integration-2026-11-11`

The recovery branch remains the source of truth. Preserve the Node/Docker path and do not bulk-merge either reference branch.

## 2. Database identity has two independent levels

A PostgreSQL system identifier identifies a cluster, not one database within that cluster. The Worker clients therefore require both:

- The previously allow-listed PostgreSQL system identifier for the App or Store Preview cluster.
- A separate expected PostgreSQL database OID for that exact App or Store Preview database.

The environment names are:

- `HEAVIX_APP_PREVIEW_DATABASE_OID`
- `HEAVIX_STORE_PREVIEW_DATABASE_OID`

The OID values are environment-specific and must not be guessed, copied from Production, or inferred from a database name. They are not committed to Git. They must be collected from the already-verified dedicated Preview destinations under a separately approved, read-only identity procedure, then stored as protected secrets in GitHub's `preview-backup` environment and Cloudflare's Preview Base.

The manual `prisma-preview-workerd-proof.yml` workflow is restricted to the recovery branch, checks out exactly `${{ github.sha }}`, verifies `HEAD == GITHUB_SHA`, requires the protected `preview-backup` environment, and redacts all connection values. It fails closed if either connection string or either numeric OID is missing or invalid.

**Do not dispatch PREVIEW_ONLY until the owner separately approves the exact current-head read-only database proof and the two expected OIDs have been independently confirmed.** The proof is read-only; it must not run migrations, seeds, writes, or backups.

## 3. OpenNext real-route proof is local-only

The OpenNext integration proof is a GitHub Actions test, not a Cloudflare deployment:

1. Generate App and Store Node/Worker Prisma clients.
2. Build the OpenNext Worker artifact.
3. Audit the generated bundle and run Wrangler dry-run/startup checks using an isolated temporary config.
4. Start `opennextjs-cloudflare preview` on loopback only.
5. Expose only `GET /api/opennext-runtime-proof` through an outer Worker wrapper.
6. Require a cryptographically random, per-run bearer token.
7. Run in `SMOKE_ONLY` mode with database connection strings, OIDs, Cloudflare API tokens, and backup execution explicitly absent.
8. Verify that all other routes are blocked by the wrapper and upload only the audit report as a GitHub artifact.

This proves a real App Router path executes in Workerd without contacting either database. It does not prove database identity or authorize a remote version upload.

## 4. Worker-only safety gates

- The Admin backup route is disabled unless `HEAVIX_BACKUP_EXECUTION_ENABLED=true`; Preview Wrangler variables set it to `false`.
- Docker Compose also defaults backup execution to `false`; a Node deployment must opt in deliberately if its backup route is required.
- Preview sitemap generation is empty/dynamic to prevent preview indexing and build-time database access.
- Wrangler observability/tracing is disabled by default to avoid unnecessary telemetry usage.
- Wrangler requires App/Store database URLs and their database OIDs before a Preview deployment can proceed.
- The Production deploy command remains a no-op safety guard.
- `previews_enabled` remains `false`; no branch Preview or new Worker version is created by these tests.

## 5. B2 status

The owner has configured the six `B2_*` values in Cloudflare Preview Base for the private `heavix-dev-assets` bucket and the `heavix-media/` prefix. The Application Key is bucket-scoped to that single bucket and prefix-scoped; its secret value was not shared in chat.

The repository still requires a server-only B2 adapter, seller-owned staged uploads, listing attachment/finalization, ownership checks, and a live upload/read-back SHA-256/delete proof. No B2 operation has been performed. The database-backup bucket `heavix-db-backups` remains separate and must never store media.

## 6. Current gates and next sequence

1. Finish exact-head CI and the first real OpenNext Cloudflare Build; confirm no deployment occurred.
2. Run the local OpenNext real-route smoke and bundle audit on the exact recovery head.
3. Obtain owner approval for a separate read-only Preview OID discovery/identity procedure; store the confirmed OIDs only in protected secrets.
4. After a second explicit approval, dispatch the protected `PREVIEW_ONLY` proof on the exact reviewed SHA.
5. Add the matching dedicated Preview App/Store connection secrets and OIDs to Cloudflare Preview Base. Never copy unverified Production values.
6. Only after runtime, identity, Access policy, and owner-approval gates pass may Worker Previews be enabled. Do not change the existing stable Worker, Production, or DNS.
7. Implement and test the B2 adapter and seller media lifecycle before enabling the full listing-upload experience.

## 7. Non-claims

Until independently verified, do not claim that the current Cloudflare Worker uses the expected Preview databases, that Production is isolated, that a Preview deployment exists, that B2 media storage works, or that the OpenNext build has completed. A successful local smoke is not a deployment.
