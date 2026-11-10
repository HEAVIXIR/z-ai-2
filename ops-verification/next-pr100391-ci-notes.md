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


## Run 10 — 42832717762

- Exact experiment HEAD: `a942aed2d506a5a727db891d74c170e3805bdd70`; exact HEAVIX source commit remained `07b6de155284dd7813335201552acf4efbb6ad90`.
- ShellCheck and patched Next.js package build passed. HEAVIX Cloudflare/OpenNext build completed successfully in explicit Preview mode; four `query_compiler_bg.wasm` artifacts were found.
- The revised trace analyzer reported 1,078 manifests, 151,424 aggregate references, 7,252 unique resolved paths, and maximum per-manifest entries of 1,131. It failed only because 7,252 exceeded the 5,000 unique-path gate.
- Independent artifact inspection established that the 538 manifests under `.next/standalone/.next/server` each have a corresponding manifest under `.next/server` with the same manifest path after removing the standalone prefix and the same entry count. Their combined entries are 75,100. This is copied standalone trace metadata, not an additional independent set of route traces.
- The next verifier revision will exclude a standalone manifest only if the matching source manifest exists and its complete `files` array is identical; it will report excluded mirror counts/entries explicitly. Non-identical standalone manifests remain counted. WASM discovery will continue to scan the complete output, including standalone.
- This is a measurement correction, not an increase to the 5,000 threshold. If the corrected distinct trace set still exceeds 5,000, the run must fail and the underlying trace growth must be investigated. No deploy, DB connection/write, Production access, or DNS change occurred.


## Run 11 — 42835445615

- Exact experiment HEAD: `6d75ad3d05e6d77e9aa339793cef181ab7c2a96f`; exact HEAVIX source commit: `07b6de155284dd7813335201552acf4efbb6ad90`.
- All workflow steps passed, including ShellCheck, patched Next package build, HEAVIX Cloudflare/OpenNext Preview build, trace/WASM checks, Wrangler dry-run, and Workerd `SMOKE_ONLY`.
- Artifact `13774643164`, SHA-256 `aed64681dba71a4ca39c66af48cbfc74fd8b9a37da6f63661adde61aef528d44`.
- Independent artifact inspection: 540 trace manifests; 76,324 aggregate entries; 4,089 unique resolved paths against the unchanged 5,000 threshold; 538 byte-for-byte identical standalone manifest mirrors excluded (75,100 entries); maximum 1,131 entries per retained manifest.
- Four `query_compiler_bg.wasm` artifacts found across `.next/standalone` and `.open-next/server-functions/default`. Wrangler 4.156.0 `--dry-run` exited normally. Workerd `SMOKE_ONLY` loaded the Worker module graph, both generated Prisma clients and PPG adapter, and verified missing secrets fail closed; no DB connection or write was attempted.
- **Important scope correction:** this successful build used an additional packaging-only correction to Next's `scripts/pack-util.ts` in the disposable upstream checkout to prevent the ancestor-dedup bug from dropping `types/global.d.ts`. This is separate from the upstream Turbopack PR #100391 patch and is not a HEAVIX source change. The prior artifact did not upload this workaround patch; the workflow now retains it and its checksum for subsequent runs.
- **Memory evidence gap:** `cgroup-memory.txt` in this artifact is zero bytes because the checked cgroup files were unavailable at the assumed paths. No cgroup peak-memory figure is claimed from this run. This does not invalidate the build/trace/WASM/Wrangler/Workerd PASS, but memory measurement remains open.
- No Worker deploy/upload, database connection/write, Production access, migration, seed, or DNS change occurred.
