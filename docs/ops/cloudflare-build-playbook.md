# Heavix Cloudflare Build Gate & Proven Build Playbook

**Status:** Mandatory before every Cloudflare build or build-triggering push  
**Recorded:** 2026-11-11  
**Scope:** Heavix Preview build pipeline; this does not authorize Production changes.

## 1. Why this gate exists

The project has repeatedly exceeded Cloudflare's practical build-time window and consumed monthly build quota. A failed/terminated build can consume substantial time and quota without producing a deployable artifact. Therefore every agent must inspect the latest build evidence and apply the proven resource-controlled build method before initiating another build.

The user reported approximately 1,900 of 3,000 monthly build units consumed at the time this rule was recorded. Treat quota as scarce and verify the current value rather than assuming it remains unchanged.

## 2. Evidence from the verified successful build

### Successful build: `4d272ff1-c624-4072-9cfa-cb6ced710712`

- Created: 2026-11-10 20:49:00 UTC
- Stopped: 2026-11-10 20:52:45 UTC
- Outcome: `success`
- Branch: `infra/cloudflare-opennext-build-recovery`
- Next.js: `16.4.3`
- Bundler: **Webpack**
- Compilation: **79 seconds**
- Total Cloudflare build duration: approximately **3 minutes 45 seconds**
- File descriptor peak recorded: **538**
- OpenNext generated `.open-next/worker.js` and reported `OpenNext build complete.`

The build log confirmed:
```text
HEAVIX_NFT_PATCH_ALREADY_APPLIED next=16.4.3 fileIOConcurrency=16 customReadFile=semaphore
▲ Next.js 16.4.3 (webpack)
Creating an optimized production build ...
✓ Compiled successfully in 79s
HEAVIX_FD_PEAK ... openFds:538 ...
Worker saved in .open-next/worker.js
OpenNext build complete.
```

**Important qualification:** this successful Cloudflare Build did **not** deploy the Worker. Its deploy command was an `echo HEAVIX_PREVIEW_DEPLOY_BLOCKED_PENDING_ARTIFACT_AND_DATABASE_ISOLATION_PROOF` placeholder. The later stable Preview Worker Version 17 was uploaded/deployed separately through Wrangler. Never describe this build as a successful end-to-end deployment.

### Cached success: `c0a26a9f-70f0-4eaa-9465-64e4f60402f0`

- Created: 2026-11-10 22:23:34 UTC
- Outcome: `success`
- Branch: `recovery/heavix-full-product-integration-2026-11-11`
- Commit: `4cc2ab395b7303f9b34ec176a9c3c0e877b43193`
- Duration: approximately 75 seconds
- Logs said both build output and dependencies were restored from cache.
- Deploy command was another placeholder echo, not a real Worker deployment.

This is evidence of a fast **cache restore**, not proof of a fresh Next.js compile. Always distinguish cached success from fresh compilation.

## 3. Failure evidence and what it teaches

### Terminated build: `ac5e5821-1a01-48bf-8578-398b4cbd8e56`

- Created: 2026-11-11 09:58:37 UTC
- Stopped: 2026-11-11 10:29:57 UTC
- Outcome: `terminated`
- Branch: `recovery/heavix-full-product-integration-2026-11-11`
- Commit: `5d9be141ed8d733ad8e360523c1ecef8a0a6cdac`
- Next.js: `16.4.5`
- Bundler: **Turbopack**
- Duration before termination: approximately **31 minutes 20 seconds**
- Log showed the NFT concurrency patch was already active:
  ```text
  HEAVIX_NFT_PATCH_ALREADY_APPLIED next=16.4.5 fileIOConcurrency=16 customReadFile=semaphore
  ▲ Next.js 16.4.5 (Turbopack)
  Creating an optimized production build ...
  Build took too long and was timed out
  ```

The NFT patch alone was therefore not sufficient to prevent the long-running Turbopack build. The successful fresh compile used Webpack. This is strong evidence to prefer the proven Webpack profile where runtime compatibility permits; it is not proof that changing only the bundler is safe on every branch.

## 4. Proven resource-control configuration

The successful recovery branch contained the following controls. Verify their actual contents in the exact target commit before a build; do not assume another branch has them.

### Build invocation

The diagnostic script explicitly invoked Webpack:
```js
spawn(process.execPath, [nextCli, "build", "--webpack"], {
  stdio: "inherit",
  env: process.env,
});
```

### Next.js resource limits

```ts
experimental: {
  cpus: 1,
},
webpack(config) {
  config.parallelism = 4;
  return config;
},
```

- Static-generation CPU count capped at 1.
- Webpack parallelism capped at 4.

### NFT/file I/O concurrency patch

`scripts/patch-next-nft-concurrency.cjs`:
- Reduces Next.js NFT `fileIOConcurrency` from 1024 to 16.
- Wraps `customReadFile` in a semaphore to cap concurrent file reads.
- Must log an affirmative `HEAVIX_NFT_PATCH_ALREADY_APPLIED` or equivalent proof for the exact Next.js version.

### OpenNext build command

```bash
ulimit -n 4096
node scripts/patch-next-nft-concurrency.cjs
UV_THREADPOOL_SIZE=4 node scripts/cloudflare-next-build-diagnostics.mjs
```

### Output tracing

The verified recovery configuration excluded non-runtime folders from Next.js output tracing, including:
- `docs`
- `tests`
- `scripts`
- `.git`
- `.github`
- `coverage`
- cache directories

Do not exclude any module, asset, Prisma engine/WASM artifact, or runtime dependency required by the Worker. Re-evaluate exclusions whenever runtime packaging changes.

## 5. Critical compatibility warning: do not blindly copy Webpack settings

The active Prisma/Cloudflare runtime branch `infra/prisma6-cloudflare-runtime` was observed using Next.js 16.4.5 and Turbopack-specific aliases for Worker database modules, including aliases such as:
- `@/lib/db` → `src/lib/db.worker.ts`
- `@/lib/store-db` → `src/lib/store-db.worker.ts`

It also contains Workerd/OpenNext/Prisma compatibility changes. The earlier successful Webpack recovery branch did not contain the full runtime integration.

Therefore:

1. Do not merely set `HEAVIX_NEXT_BUNDLER=webpack` or add `--webpack` on the runtime branch and immediately trigger Cloudflare.
2. First port the equivalent Worker database aliases and any required WASM/Prisma handling into the Webpack resolver/configuration.
3. Compare the exact runtime branch against the proven recovery branch.
4. Verify locally or with the cheapest available deterministic checks that the Webpack bundle resolves the Worker-safe database modules and packages the required OpenNext/Prisma/WASM artifacts.
5. Preserve the Turbopack configuration if still needed for another environment; make the build-mode choice explicit and reproducible.
6. Only then propose one controlled Cloudflare build.

If compatibility cannot be proven without a Cloudflare build, stop and ask for authorization with the risks and evidence clearly stated.

## 6. Mandatory pre-build checklist — every item required

Before **any** Cloudflare build, build-triggering push, or retry:

- [ ] Read this playbook and root `AGENTS.md`.
- [ ] Inspect the latest Cloudflare builds; identify the last fresh successful compile and the most recent failure.
- [ ] Record build IDs, branches, commit SHAs, Next.js versions, bundlers, durations, and exact timeout/error messages.
- [ ] Confirm monthly quota remaining and estimate whether the planned operation is justified.
- [ ] Confirm the exact target branch and commit SHA; no ambiguous moving branch.
- [ ] Confirm the proven resource limits: `experimental.cpus: 1`, Webpack `parallelism: 4`, `UV_THREADPOOL_SIZE=4`, `ulimit -n 4096`.
- [ ] Confirm the NFT concurrency patch is present, compatible with the exact Next.js version, and demonstrably active.
- [ ] Confirm the build uses Webpack unless a documented compatibility blocker requires otherwise. If using Turbopack, explain why and provide fresh evidence that it will not repeat the 31-minute timeout.
- [ ] If on the Prisma/Workerd runtime branch, verify Worker DB aliases, Prisma/WASM artifacts, and OpenNext runtime compatibility under the selected bundler. Do not drop runtime aliases to get a green compile.
- [ ] Inspect output tracing exclusions and ensure all runtime dependencies remain included.
- [ ] Run local/static checks and inspect diagnostics before spending Cloudflare quota.
- [ ] Confirm build and deploy commands separately. A green build with an echo placeholder is not a deployment.
- [ ] Confirm Preview-only scope, database isolation, rollback plan, and no Production/DNS side effects.
- [ ] Obtain explicit user authorization for the Cloudflare build if it consumes scarce quota or changes deployment state.

**If any checkbox is not satisfied: do not start the build.**

## 7. Post-build verification

For a successful build, record:
- Cloudflare build ID, branch, commit, Next.js version, bundler, start/stop times, duration, cache hit/miss.
- Compile duration and file-descriptor peak.
- Confirmation of NFT patch and OpenNext Worker artifact.
- Whether the deploy command was real or a placeholder.

For a deployment, separately verify:
- Actual Worker version ID and creation/upload timestamp.
- Traffic allocation and Preview URL.
- Runtime health endpoints and critical pages.
- Preview database identities/isolation (never expose secrets).
- Rollback version and rollback procedure.

Do not claim end-to-end success until both build and deployment/runtime checks pass.

## 8. Current known operational baseline (recorded 2026-11-11)

- Cloudflare account: `3fe0437a0aab4bafb2e728e458f67ea0`
- Preview Worker: `heavix-preview`
- Preview URL: `https://heavix-preview.heavixir.workers.dev`
- Stable Preview Version 17: `063ce438-ca3a-4482-b416-9260b780bccf`
- Version 14 was retained as rollback in the prior project record.
- Build trigger deploy command was fail-closed with an echo placeholder pending runtime/database health proof.
- Production and DNS were not to be touched.

These values are historical checkpoints, not assumptions about today's state. Re-read live Cloudflare state before acting.

## 9. Agent handoff requirement

Every new chat, agent, or resumed session must:
1. Read root `AGENTS.md`.
2. Read this complete playbook.
3. Inspect current GitHub branch/config and latest Cloudflare build/deployment state.
4. State the last proven build profile and any differences in the target commit.
5. Refuse to initiate a build until the checklist is complete.

This requirement applies even if the user says only "continue", "fix the build", or "deploy". The build gate is mandatory unless the user explicitly changes this policy.
