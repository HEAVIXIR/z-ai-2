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


## Run 9 — 42829318267

- Exact tested HEAVIX commit: `07b6de155284dd7813335201552acf4efbb6ad90`; experiment branch HEAD: `b9b54b049af47bc687df17be5070a8fbf46e4997`.
- Shell syntax/ShellCheck and the patched Next.js 16.4.5 package build passed. The HEAVIX Cloudflare/OpenNext build also completed successfully in explicit Preview mode; the build output identified Next.js 16.4.5 (Turbopack).
- Four emitted `query_compiler_bg.wasm` files were found in `.next/standalone` and `.open-next/server-functions/default`.
- The verifier stopped at its trace threshold: 1,078 `.nft.json` manifests contained 151,424 aggregate file references, exceeding the configured 5,000 limit. This was a verifier assertion after the Cloudflare build, not a Cloudflare build failure, OOM, or FD exhaustion.
- The previous verifier summed every route-manifest reference, counting shared dependencies repeatedly. That aggregate is retained as a diagnostic, while the 5,000-file gate is being corrected to use the union of distinct canonical resolved file paths. The next run will also retain per-manifest counts and the most frequently referenced/WASM-related paths so the result can be independently inspected.
- Because the trace assertion stopped execution, cgroup memory evidence, Wrangler dry-run, and Workerd `SMOKE_ONLY` were not reached. No deploy, DB connection/write, Production access, or DNS change occurred.
