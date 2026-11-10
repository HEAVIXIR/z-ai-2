# Next.js PR #100391 CI investigation notes

## Run 1 — 42799345279

- Bash syntax checks passed.
- ShellCheck stopped the job on four SC1007 warnings caused by empty environment assignments in the no-database Workerd invocation.
- The Next source build and HEAVIX verification were skipped; no compilation or deployment ran.

## Run 2 — 42799418565

- Bash syntax checks passed.
- ShellCheck passed after changing empty values to explicit `VAR=''` assignments.
- The final tool-version check then stopped because pnpm correctly refused to run inside the HEAVIX checkout, whose package manager is Bun.
- The check is now executed from `RUNNER_TEMP`, outside the Bun-managed project. The Next source build and HEAVIX verification have still not run.

Both failures were preflight-only. No database connection, Worker upload, deployment, migration, seed, or Production access occurred.


## Run 8 — 42826775221

- Shell syntax validation and ShellCheck passed.
- The patched Next.js 16.4.5 package build passed.
- The resulting `next.tar` contains the exact `./types/global.d.ts` entry; the previous packageFiles sibling-file dedup omission is no longer blocking the package build.
- HEAVIX Cloudflare build then failed during static prerender of `/sitemap.xml`. The call path is `src/app/sitemap.ts` → Prisma proxy → `src/lib/db.worker.ts:11` → synchronous `getCloudflareContext()`.
- The proof workflow had not set `HEAVIX_ENV=preview`. In the pinned HEAVIX source, `IS_PREVIEW_DEPLOYMENT` returns an empty sitemap before querying the database when `HEAVIX_ENV=preview`. The isolated proof now scopes that variable to the disposable Cloudflare build only. No application source, database URL, or deployment environment is changed.
- This is a verification-harness correction, not a fix to Prisma runtime behavior and not evidence of a successful Cloudflare build yet. Trace, WASM, Wrangler dry-run, and Workerd checks remain unverified because the verifier stops at the failed build.
