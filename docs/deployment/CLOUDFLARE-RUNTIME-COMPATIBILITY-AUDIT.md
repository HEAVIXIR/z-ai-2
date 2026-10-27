# Cloudflare Runtime Compatibility Audit

**Audit baseline:** `main` at `54d9b25292d1f09a12899208dbbe057e006932f8` (2026-10-27)  
**Status:** assessment in progress; no deployment or production changes.

## Executive finding

The current application is a full-stack Next.js 16 application with NextAuth 4, Prisma 6, and two PostgreSQL schemas/databases (main and store). The repository is not yet demonstrated to be compatible with Cloudflare Workers. A deployment adapter alone would not resolve the runtime and persistence constraints below.

## Verified compatibility risks

| Area | Repository evidence | Impact / required action |
|---|---|---|
| Persistent media | `src/lib/media-service.ts` imports `node:fs` and `node:path`; admin media library route also imports filesystem APIs. | Worker-local filesystem is not durable shared storage. Introduce a storage abstraction and verify R2 access before migrating uploads; preserve metadata and authorization semantics. |
| Backup operation | `src/app/api/admin/backup/route.ts` imports `node:child_process`, `node:fs/promises`, `node:path`, and `node:util`. | Shell/OS-dependent backup cannot be assumed to run on Workers. Keep it on a controlled Node runtime or design a separate authenticated backup job with restore verification. Do not drop backup coverage. |
| Node runtime declarations | Multiple routes explicitly declare `runtime = "nodejs"`, including menu, orders, health, sitemap, auth/me, articles, settings, payments, services, and companies. | Inventory every route and its transitive imports. Runtime declarations and dependencies need an explicit compatibility decision; no bulk conversion to Edge is safe. |
| Database drivers | `package.json` uses Prisma `^6.11.1`; `src/lib/db.ts` and `src/lib/store-db.ts` maintain separate clients. | Validate Prisma engine/driver compatibility and network connectivity for both PostgreSQL databases. Do not substitute D1 or run migrations as part of deployment setup. |
| Build configuration | `next.config.ts` sets `output: "standalone"` and strict TypeScript build checking. | Current standalone output is a Node-oriented deployment signal. Confirm the currently supported Cloudflare Next.js adapter and its supported Next.js version/features before changing build configuration. |
| Security headers | `next.config.ts` defines HSTS, CSP, frame and permissions policies through `headers()`. | Confirm adapter/platform behavior preserves headers and route protections in the deployed output; verify with runtime tests rather than assuming configuration parity. |

## Deployment gates

1. Select the currently supported Cloudflare adapter/version and document the exact Next.js feature support.
2. Produce a route inventory including Node-only imports, runtime declarations, auth/session dependencies, image processing, and background work.
3. Prove both PostgreSQL connections using a supported driver/network path, without production schema changes.
4. Implement and test durable media storage before moving uploads.
5. Keep backup/restore on a compatible Node operational path until a replacement passes restore drills.
6. Add a non-production deployment and smoke tests for public pages, login/session, protected admin routes, uploads, database reads/writes, headers, and error handling.
7. Preserve required GitHub checks and protected `main`; do not switch DNS or production traffic until all gates pass.

## Cloudflare account state

A prior read-only account audit found no Workers scripts/routes, Pages projects, D1 databases, KV namespaces, Queues, Hyperdrive configurations, Durable Objects, or AI Gateways. R2 listing returned HTTP 403 and remains unresolved; this is not proof that R2 is unavailable. No Cloudflare resources, DNS records, production data, or database schemas have been changed.

## Next action

Complete the route-by-route and transitive-import inventory, then validate the current official adapter requirements and Cloudflare resource permissions. This document is an initial evidence-based assessment, not a deployment approval.
