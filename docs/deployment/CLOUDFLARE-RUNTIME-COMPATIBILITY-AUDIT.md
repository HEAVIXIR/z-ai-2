

## Additional route and transitive-import findings

| Area | Repository evidence | Impact / required action |
|---|---|---|
| Session/auth | `src/lib/auth.ts` uses `node:crypto.randomBytes` and `next/headers`, then reads/writes sessions through Prisma. | Test token generation, cookie flags, session expiry, blocked-user handling, and fail-closed behavior on the target runtime. Do not weaken the canonical session contract. |
| Main Prisma client | `src/lib/db.ts` uses guarded runtime `require('@prisma/client')`, inspects and deletes `require.cache`, and expects generated client files on disk. | This development hot-reload workaround is Node/filesystem-oriented. Check production bundling and Prisma engine strategy under the chosen adapter; likely requires a deliberate production-compatible client setup rather than carrying over dev cache-purge behavior blindly. |
| Store Prisma client | `src/lib/store-db.ts` imports a separately generated client from `src/lib/generated/store-client`. | Validate generated artifacts and connection configuration independently for the store database. Main-database connectivity alone is insufficient. |
| Admin media library | `src/app/api/admin/media-library/route.ts` recursively enumerates `public/uploads` and stats local files after checking `media.manage`. | Moving uploads to object storage requires replacing both media writes/reads and this administrative listing contract; preserve the permission check and response shape or explicitly version the API. |
| Middleware | `src/middleware.ts` checks the `heavix-user` cookie for admin page/API routing; deeper authorization is implemented in route code. | Verify middleware behavior and every route's authorization independently in staging. A cookie's presence is not proof of a valid session; do not treat the middleware check as the full authorization boundary. |

## Adapter decision (external official documentation, checked 2026-10-27)

Cloudflare's current Next.js guide recommends vinext for new Workers deployments but labels it beta and asks users of existing applications to run compatibility checks and inspect the compatibility dashboard. Cloudflare's OpenNext guide remains available for existing apps and lists App Router, Route Handlers, RSC, SSR, middleware, and other common features as supported; Node.js middleware is specifically not yet supported. This repository's middleware does not appear to use Node built-ins directly, but the whole dependency graph still requires testing.

Given the size and security sensitivity of HEAVIX, the safe next step is a non-production compatibility experiment on an isolated branch, not a production migration. Compare OpenNext and vinext against the actual route inventory, Prisma behavior, auth/session tests, image handling, and both PostgreSQL connections. No adapter has yet been installed and no build or runtime compatibility result is claimed.
