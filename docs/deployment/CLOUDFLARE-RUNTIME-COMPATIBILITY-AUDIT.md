

## Follow-up audit — runtime-specific package risks (2026-10-27)

Additional source inspection found another important risk:

- `src/lib/media-image-optimizer.ts` imports `sharp`, performs metadata decoding and image re-encoding, and expects Node `Buffer` inputs. Node API compatibility alone does not establish that this native image-processing dependency can be bundled and run in Workers. The upload pipeline must be exercised in the actual target runtime; if unsupported, select a compatible image-processing service/library without weakening byte-signature checks, pixel/frame limits, EXIF stripping, or animation preservation.
- `src/lib/db.ts` dynamically requires `@prisma/client` and purges Node `require.cache` entries for generated client files. This is specifically a hot-reload workaround, not proof of production Workers compatibility. Test production bundling and database access independently.
- The backup endpoint's shell execution remains a hard separation boundary: Workers runtime compatibility does not provide an operating-system shell, persistent project directory, or arbitrary `sha256sum` process. Keep paired backup/restore on a separately secured Node operational path unless redesigned and verified.

## Adapter evaluation — evidence and provisional decision

Official Cloudflare documentation checked on 2026-10-27:

- Next.js on Workers guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
  - Cloudflare recommends vinext as the default path, but explicitly labels it beta and instructs existing production applications to run compatibility checks and inspect the compatibility dashboard.
- OpenNext adapter guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
  - The guide documents broad support for App Router, Route Handlers, RSC, SSR, middleware, and image optimization; Node.js middleware is not yet supported.
- Workers Node.js compatibility: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
  - Workers exposes a subset of Node.js APIs; some imports may be shims/stubs and not functional implementations. Presence of `nodejs_compat` is not proof that every Node dependency works.

**Provisional recommendation for the first experiment:** evaluate OpenNext first as the conservative compatibility candidate for this existing Next.js 16 application, while running vinext's official compatibility check as a comparison. This is not a final architecture choice: package compatibility, both PostgreSQL connections, authentication/RBAC, media processing, headers, and operational backup coverage must pass in a non-production environment before choosing a path.

## Experiment plan (no production effects)

1. Run the official vinext compatibility check in an isolated worktree/branch and record unsupported imports/routes.
2. Prepare a separate OpenNext adapter branch with only adapter/config changes; do not modify `main` and do not deploy.
3. Build both candidates in CI; classify build failures separately from runtime failures.
4. If a build passes, run Worker-runtime preview smoke tests using non-production secrets and databases only.
5. Test login/logout/session expiry, blocked accounts, admin RBAC, both database clients, image validation/optimization, asset persistence, security headers, and all error paths.
6. Confirm paired backup/restore remains available on a secured Node host or job; do not expose a backup implementation that silently skips either database.
7. Compare evidence and only then propose a deployment choice. Do not create paid resources, change DNS, or migrate production data during this experiment.
