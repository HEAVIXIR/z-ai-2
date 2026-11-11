# HEAVIX — Cloudflare Build Continuity & Quota Policy
Date: 2026-11-11
Applies to: `HEAVIXIR/z-ai-2`, recovery branch `recovery/heavix-full-product-integration-2026-11-11`, Worker `heavix-preview`.

## Owner instruction — binding default for every future agent/chat

The owner reports that the Cloudflare free monthly build allowance is 3,000 build units and more than 2,000 had already been consumed by 2026-11-11 (one third into the month). This is a hard project constraint. Protecting the owner's time is equally important.

**Do not use Cloudflare Builds as a debugging loop.** Never trigger one build per commit, one build per fix, or repeated exploratory builds. Consolidate work so that many fixes are validated before a single Cloudflare build. The target is one carefully preflighted candidate build, not a sequence of speculative retries.

This policy is not optional and must be read before any build/deploy decision by every new chat or agent.

## Known-good Preview baseline — independently verified

- Worker: `heavix-preview`
- Active deployment: `9c079e5b-e3df-4295-80e0-e930d2d25552`
- Active version: #17, `063ce438-ca3a-4482-b416-9260b780bccf`
- Deployment created: 2026-11-10 21:08:35 UTC
- Version uploaded: 2026-11-10 21:04:22 UTC
- Traffic: 100% to version #17
- Preview metadata includes `HEAVIX_ENV=preview`, Preview database bindings, Node compatibility, and the existing assets binding.
- Preserve this version/deployment as the known-good rollback baseline. Do not replace it during proof work.

Important distinction: the verified version #17 upload is recorded as a Wrangler upload. Do not mislabel it as a successful Cloudflare Build pipeline. Several Cloudflare Build records that reported success were no-op skips whose logs said `HEAVIX_SKIP: branch has no OpenNext configuration`; they are not evidence that OpenNext built successfully.

## Prior long-running Next.js / Cloudflare build issue

The owner explicitly reports that the prolonged Cloudflare Next.js build stall/failure seen again in this work was already solved in the prior work session around 10–12 hours earlier, and that the solution had led to a successful Preview. This is an owner-confirmed historical fact and must be treated as a **do-not-repeat** constraint.

Do not start over, re-run old experiments, or infer that the solution is absent because the current branch's OpenNext artifact proof is incomplete. First recover the exact successful remediation from the prior session's transcript, commit history, workflow revisions, Cloudflare build logs, and the known-good Preview version metadata. Compare the current configuration against that successful state. Reapply the already-proven solution; do not substitute a new build strategy without evidence.

The exact successful remediation has now been reconstructed from Cloudflare Build logs and the historical repository configuration. The evidence and required reuse rules are recorded in the next section. Do not replace this proven configuration with a different bundler or speculative resource tweak.

## Reconstructed successful Next.js / OpenNext build method — verified from Nov 10 logs

The owner's recollection is confirmed by two actual successful Cloudflare OpenNext builds. These were not short no-op skips:

| Cloudflare Build | UTC window | Total duration | Next.js / bundler | Outcome |
|---|---:|---:|---|---|
| `4d272ff1-c624-4072-9cfa-cb6ced710712` | 20:49:00–20:52:45 | 3m 40s | 16.4.3 / webpack | OpenNext Worker artifact built; deploy was deliberately blocked |
| `e2af36dc-4bd9-4131-b847-8f76fef73ea6` | 21:00:24–21:04:33 | 3m 52s | 16.4.3 / webpack | OpenNext artifact built and uploaded as a Preview version |

Build `e2af36dc` generated `.open-next/worker.js`, uploaded 9 changed static assets (612 already present), reported 27,887.33 KiB total / 3,909.37 KiB gzip, and uploaded Worker version `063ce438-ca3a-4482-b416-9260b780bccf` with candidate alias `https://heavix-candidate-heavix-preview.heavixir.workers.dev`. That version later became the known-good Preview version #17. The upload was a version upload, not a traffic deployment in the same command.

### Exact successful build path

The historical `open-next.config.ts` used this adapter build command:

```sh
ulimit -n 4096 2>/dev/null || true
echo "HEAVIX_NOFILE_SOFT=$(ulimit -Sn) HARD=$(ulimit -Hn)"
node scripts/patch-next-nft-concurrency.cjs &&
UV_THREADPOOL_SIZE=4 node scripts/cloudflare-next-build-diagnostics.mjs
```

The Cloudflare build trigger then ran:

```sh
bunx opennextjs-cloudflare build --noMinify
```

The two supporting scripts and Next config are essential parts of the method:

1. **Patch Next's bundled `@vercel/nft` file tracer, fail-closed and idempotently** — `scripts/patch-next-nft-concurrency.cjs`:
   - Restricts the supported Next versions to the versions explicitly listed by the script.
   - Changes `fileIOConcurrency:w=1024` to `fileIOConcurrency:w=16`.
   - Wraps the custom `readFile` hook in `s.cachedFileSystem.executeFileIO(...)`, so file reads use the NFT cached filesystem's semaphore.
   - Accepts either exactly one unpatched occurrence of both patterns or the exact already-patched state; otherwise it throws and blocks the build.
   - Successful logs explicitly reported `HEAVIX_NFT_PATCH_ALREADY_APPLIED ... fileIOConcurrency=16 customReadFile=semaphore`.

2. **Run Next directly with Webpack and collect file-descriptor diagnostics** — `scripts/cloudflare-next-build-diagnostics.mjs`:
   - The successful historical version invoked `next build --webpack` explicitly.
   - Runs with `UV_THREADPOOL_SIZE=4`.
   - Samples the Next process tree's open file descriptors and records peak counts.
   - The successful logs showed peak open FDs of 538 and 419 respectively.

3. **Constrain Next's Cloudflare build workload** — historical `next.config.ts`:
   - Cloudflare-only `experimental.cpus: 1` for static generation.
   - Webpack `config.parallelism = 4`.
   - `outputFileTracingExcludes` for docs, tests, scripts, Git metadata, GitHub workflows, coverage, Next cache, and Turbo cache.
   - These are Cloudflare-specific settings; do not weaken normal Node/Vercel build behavior.

4. **Keep the proven environment and adapter versions**:
   - Node.js 22.
   - `@opennextjs/cloudflare@1.20.14`.
   - Wrangler 4.156.0.
   - Cloudflare build caching was enabled.

### Controlled comparison: what did not work

The following Cloudflare Builds ran for roughly 30–31 minutes and were terminated/cancelled:

- `85799326-f70b-4d95-aad2-273482e04ab1`
- `b98a5a51-70e2-4b2e-ba1b-5d45a412da6f`
- `2326072d-1e24-45ec-9899-1fa9101ece37`
- `93b98f28-5b94-43a7-8aae-c0f841530878`
- `69a49f21-67dc-4df2-bbc5-911ca7d1be9f`

Their logs show Next.js 16.4.5 running with **Turbopack**, even though the same NFT concurrency patch, `ulimit -n 4096`, and build cache were present. The two successful short builds instead show Next.js 16.4.3 running with **Webpack**. Both successful and failed builds restored dependency/build caches, so cache restoration alone is not the explanation.

This is strong comparative evidence that the successful combination was the bounded NFT file-tracing patch **plus explicit Webpack**, constrained static-generation/workload settings, and the diagnostics wrapper. Do not claim that the NFT patch alone fixes the stall. The 16.4.3/Webpack and 16.4.5/Turbopack comparison changes more than one variable, so retain this as the proven configuration combination rather than claiming a single isolated causal factor.

### Current-branch drift that must be resolved before another Cloudflare build

The current app code head `d5f034178918d0b44f83aca7986d82cbada10915` still contains the NFT patch and diagnostics wrapper, but differs from the successful state:

- Its diagnostics script selects Webpack only when `HEAVIX_NEXT_BUNDLER=webpack`; otherwise it defaults to `--turbopack`.
- Its current `next.config.ts` has Turbopack aliases for the Worker App/Store database modules, but does not include the historical Webpack parallelism setting or equivalent Webpack aliases.
- The Cloudflare Build `69a49f21` on this head used Turbopack and was terminated after about 31 minutes, despite reporting that the NFT patch was already applied.

Therefore, **do not merely flip an environment variable and start a Cloudflare build**. First port the successful Webpack settings and equivalent App/Store Worker aliases into the current Next config, verify the exact-head build locally/CI, verify the OpenNext/Workerd WASM artifact contract, and audit the final Worker bundle. Only then may the normal owner-approved Cloudflare preflight be considered. No Cloudflare build is authorized by this historical analysis.

### Separate PR #191 Next.js proof — do not confuse with the fast Cloudflare build

GitHub Actions runs `42882678921` and `42883319569` included the job **Cloudflare Workerd WASM artifact proof (patched Next.js)**. That CI job builds a separate Next.js 16.4.5 package set from upstream Next.js PR #100391, applies a separate disposable packaging de-duplication correction, builds the exact HEAVIX Cloudflare artifact, runs Wrangler `--dry-run`, and runs a no-database Workerd smoke. It ran on GitHub-hosted runners with explicit minimum resource checks (8 GiB RAM, 4 CPU cores) and a long timeout. This is valuable artifact/runtime compatibility evidence, but it is not the source of the 3m40–3m52 Cloudflare Build optimization.

The other supplied IDs have different roles:
- `42878480544` and `42883305369`: Bun Worker-adapter lockfile refresh workflows.
- `42971293294`: GitHub CI for PR #307.
- PR #207: reputation/loyalty architecture documentation, unrelated to the Next.js build fix.

## Current evidence snapshot (2026-11-11)

- Exact branch code head: `d5f034178918d0b44f83aca7986d82cbada10915`.
- GitHub CI run `42994869687` passed on that exact head.
- OpenNext real-route workflow run `42994869961` passed prerequisites and Next.js compilation/route enumeration, then the runner shut down the OpenNext server build with SIGKILL during Worker bundling. This is an incomplete proof/runner interruption, not proof that the previously solved Next.js issue has returned.
- Cloudflare Build `69a49f21-67dc-4df2-bbc5-911ca7d1be9f` was running on exact head at last inspection, paused in/after optimized Next.js build logs with a non-fatal CSS selector warning. No deployment was made.
- Production and Preview deploy commands remain no-op guards. Do not deploy from this branch.
- Preview DB identity/OID proof has not been run against the actual Preview databases on this head.

## Mandatory preflight before any future Cloudflare build

A Cloudflare build is allowed only after all items below are true:

1. Recover and document the exact previous successful Next.js/Cloudflare remediation and compare it to current config.
2. Establish a single consolidated candidate commit; no further speculative code churn.
3. Exact-head GitHub CI is green.
4. Local/CI Next.js build and OpenNext artifact proof complete without runner shutdown.
5. Worker bundle audit passes and expected routes/assets are present.
6. Non-fatal warnings are classified; no unresolved build/runtime blocker remains.
7. Build trigger, build command, deploy no-op guard, branch/path filters, and target Worker are inspected before execution.
8. Known-good Preview #17 is preserved and rollback path is clear.
9. Confirm no other Cloudflare build is running; do not create concurrent builds.
10. Owner has explicitly authorized the final quota-consuming build if the planned action is not already within a clearly authorized run.

If any preflight item is false or unknown: **NO CLOUDFLARE BUILD**. Continue with repository inspection, local tests, CI, artifact analysis, and history reconstruction.

## Retry rule

A failed or stalled Cloudflare build does not automatically authorize another build. Inspect the existing build and logs, identify a specific root cause, repair in one batch, prove the repair outside Cloudflare, and obtain explicit owner approval before another quota-consuming build. Never retry just to see whether it works.

## Change batching and trigger awareness

- Batch related code fixes into one commit.
- Markdown-only documentation updates are excluded by the currently inspected Cloudflare trigger path filter (`*.md`), so use docs for continuity without consuming a Cloudflare build where the trigger rules continue to match this configuration.
- Do not assume JSON/config changes are excluded; they may trigger Cloudflare Builds.
- Do not edit trigger filters by guessing API schemas. Inspect the supported schema, apply a validated change, then read back and verify it.
- GitHub Actions CI usage and Cloudflare Build quota are separate budgets; still avoid unnecessary per-commit CI churn, but never conflate the two.

## Required handoff behavior

Every new agent/chat must:
1. Read this runbook and the latest PR #307 checkpoint before acting.
2. Preserve the exact known-good Preview version/deployment above.
3. Recover the prior successful build fix rather than rediscovering it.
4. State verified / owner-reported / inferred / unknown separately.
5. Never ask the owner to repeat known constraints or provide secret values in chat.
6. Never trigger Cloudflare Builds, upload a Worker version, deploy, merge, contact Preview databases, or mutate B2 objects without the specific approval gates already established for that action.
7. Optimize for the owner's time and the fastest safe path to a complete real HEAVIX site, not for number of commits, builds, or reports.
