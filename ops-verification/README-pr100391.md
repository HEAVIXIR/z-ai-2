# Next.js PR #100391 experiment

This experiment is isolated from Production. It applies the upstream `turbopackIgnore` annotation from [vercel/next.js#100391](https://github.com/vercel/next.js/pull/100391) to Next.js v16.4.5, then tests the resulting package set in a disposable HEAVIX checkout. A separate packaging-only workaround is also applied to `scripts/pack-util.ts` in that disposable upstream checkout because its ancestor de-duplication logic can omit `types/global.d.ts`. That workaround is not part of PR #100391, does not modify HEAVIX, and is saved separately as `packagefiles-dedup-fix.patch` with a SHA-256 file.

## Automated runner

The workflow `.github/workflows/next-pr100391-proof.yml` runs on pushes to `experiments/next-pr100391-wasm-trace-proof`.

It performs, in order:

1. Bash syntax validation and ShellCheck.
2. The upstream Next.js `pnpm pack-next --tar --compress=strip` build pipeline, after a separately recorded, disposable-checkout-only correction to `pack-util.ts` preserves the required `types/global.d.ts` sibling entry. Both the upstream Turbopack patch and packaging workaround patch/checksum are retained in the artifact.
3. A Cloudflare OpenNext build against the exact HEAVIX commit pinned in the workflow, with `HEAVIX_ENV=preview` scoped to that build so the sitemap returns its documented empty Preview result rather than attempting a database lookup during static prerender.
4. Per-route trace-reference, globally unique resolved-file, and `query_compiler_bg.wasm` checks. The 5,000-file gate applies to the union of distinct resolved file paths across all route manifests; repeated references to the same dependency from separate routes remain visible in the aggregate trace-entry metric but are not double-counted as distinct files.
5. Wrangler `deploy --dry-run` only.
6. The existing Workerd `SMOKE_ONLY` harness with database connection variables explicitly empty.

## Manual use

Build the patched Next package set:

```bash
bash ops-verification/build-patched-next-pr100391.sh artifacts/next-pr100391
```

Verify against an exact HEAVIX ref:

```bash
HEAVIX_REF=<exact-commit-or-branch> \
  bash ops-verification/verify-patched-next-pr100391.sh artifacts/next-pr100391
```

Both scripts require Linux, Node.js 20+, pnpm 10.33.0, Rust/Cargo, and sufficient memory/CPU/disk. The build script checks these prerequisites before starting.

## Safety boundary

- The verifier clones HEAVIX into a temporary directory and does not modify the caller's checkout.
- It does not modify package manifests or lockfiles in the disposable clone.
- It supplies no App/Store Preview or Production database URLs.
- The Cloudflare build runs with `HEAVIX_ENV=preview` only inside the disposable verification process. This exercises the documented Preview sitemap behavior and prevents static prerender from resolving request-scoped Cloudflare database context; it does not alter application source or deployment environment.
- The Workerd proof is explicitly `SMOKE_ONLY`; it is not a DB-backed Prisma query proof.
- Wrangler is invoked with `--dry-run`; no Worker upload or deployment is performed.
- No npm publish, migration, seed, database write, Production access, or DNS change is part of this experiment.

A passing run is evidence for the patched Next build, HEAVIX Cloudflare artifact, trace reduction, WASM artifact presence, and no-database Workerd smoke. It is not, by itself, release approval or Production readiness.


### Standalone trace-manifest de-duplication

The verifier scans `.next` and `.open-next`, but Next's `.next/standalone` output can contain copied `.nft.json` manifests from the source `.next` tree. A standalone manifest is excluded from the trace-file gate only when its corresponding source manifest exists and its `files` array is byte-for-byte identical. Non-identical standalone manifests remain included. The verifier records the number of excluded mirror manifests and their aggregate entries separately; WASM artifact discovery still scans the full output tree, including standalone.


### Memory evidence limitation

The successful Run 42835445615 artifact contains an empty `cgroup-memory.txt`: the verifier's `/sys/fs/cgroup/memory.peak`, `memory.max`, and `memory.events` files were not readable/present at the paths it checks on that runner. Therefore this run does not provide cgroup peak-memory evidence. Do not infer memory peak or an OOM conclusion from this artifact; memory measurement remains a separate follow-up validation item.
