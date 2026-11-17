# HEAVIX Preview Readiness — 2026-11-06

## Purpose and operating boundary

This is a read-only infrastructure/code readiness assessment recorded on an isolated documentation branch. It is intended to preserve cross-chat project continuity and coordinate the shortest safe path to an inspectable Preview.

- Main repository: `HEAVIXIR/z-ai-2`
- Main baseline observed: `d86e3fa715d27b95477ed09eda60b2bfba8daaa6`
- Preview Worker: `heavix-preview`
- Preview URL: https://heavix-preview.heavixir.workers.dev/
- Primary domain: `heavix.ir`
- Budget constraint: zero; no paid upgrades or new paid infrastructure.
- Production remains NO-GO. No DNS change, merge to main, Worker upload/deploy, migration, seed, database write, or B2 archive write is authorized by this report.

## Evidence observed

### GitHub pull requests and branch graph

Open PRs relevant to the Preview path were observed as follows:

| PR | Branch | Base | State | Latest observed HEAD |
|---|---|---|---|---|
| #183 | `infra/cloudflare-opennext-build-recovery` | `main` | Draft / open | `350c0748808bdaf70f2164c3e39bd44003ded5cc` |
| #191 | `infra/prisma6-cloudflare-runtime` | PR #183 branch | Draft / open | `3bf2333fde4f81473ce0d14c99cbd653a386c2e2` |
| #200 | `test/opennext-runtime-integration` | PR #191 branch | Draft / open | `0de538ea65a9850d9a793946ab5c5da194d33b3b` |
| #195 | `feature/homepage-public-content-contracts` | `main` | Draft / open | `8b36953ef797c418dc7cf8d5a55d29144b098992` |
| #188 | `infra/b2-archive-foundation` | `main` | Draft / open | `45b01b4adb6f41e2543bb4caa950da52b30ef08d` |

Observed comparisons:
- `main...infra/cloudflare-opennext-build-recovery`: diverged; 68 commits ahead, 1 behind; merge base `5754e29b0e294e19512cdfe1a8479574160cc97e`.
- `infra/cloudflare-opennext-build-recovery...infra/prisma6-cloudflare-runtime`: 89 commits ahead, 0 behind.
- `infra/prisma6-cloudflare-runtime...test/opennext-runtime-integration`: 80 commits ahead, 0 behind.
- `main...feature/homepage-public-content-contracts`: diverged; 23 commits ahead, 1 behind; same merge base `5754e29b0e294e19512cdfe1a8479574160cc97e`.

This is a dependency stack, not a set of independent merge-ready PRs. Do not merge #183, #191, #200, or #195 as-is. First synchronize the stack against current main in isolated branches, reconcile overlapping homepage/PageRenderer changes from #183 and #195, then rerun exact-head CI and independent review. Never rebase or force-push main.

Observed CI:
- PR #183 HEAD: run `42027743686`, CI success.
- PR #191 HEAD: run `42059989449`, CI success.
- PR #195 HEAD: run `42020570022`, CI success.
- PR #188 HEAD: CI run `42187639858` success; archive workflow run `42187639804` success for static/synthetic checks only. Actual archive job was intentionally not dispatched.
- PR #200 exact HEAD: CI run `42111135673` success and OpenNext run `42111135753` success per the PR's exact-head record. No Preview DB runtime proof or Worker deployment occurred.

### Cloudflare

Live read-only Worker metadata for `heavix-preview`:
- Compatibility date: `2026-10-28`.
- Active compatibility flags: `nodejs_compat` only.
- Secret binding names include `DATABASE_URL` and `STORE_DATABASE_URL`; their values and destinations were not read.
- No expected App/Store database OID bindings were present in the observed active settings.
- Latest observed deployment: `2026-10-29T21:25:26Z`, active version `57c14554-2a28-4f77-981f-0b1ced6bad80`.
- Worker settings were not changed and no upload/deployment was performed.

The #200 branch's `wrangler.jsonc` requests `nodejs_compat_populate_process_env` and declares required App/Store OID secrets. This differs from active Worker metadata. Do not upload this configuration until the secret destinations are independently verified and the rollout is reviewed. A successful Cloudflare Build is not a deployment or runtime proof.

### Prisma

Read-only metadata inventory observed three databases in `eu-central-1` / Frankfurt, all `ready`:
- `heavix-app-preview`: `db_ew8d6duermpt125paxaqorr9`
- `heavix-store-preview`: `db_cmtgxfrfwxw5mi77020tcnc3`
- `heavix-production`: `db_rc9ln1df4rwgxducp2zsge2s`

Prisma Compute app inventory for the workspace returned zero apps. Previous metadata audits reported no automated Prisma backups for these three databases and no Prisma Object Store buckets. No SQL, database introspection, or database connection was performed during this assessment.

### Backup / Backblaze

Two buckets are distinct and must not be conflated:
- `heavix-dev-assets`: development assets/media.
- `heavix-db-backups`: dedicated database/source archive bucket.

The operator confirmed that a custom lifecycle rule was saved on `heavix-db-backups`, scoped to `heavix-archive/`, with Days Till Hide = 30 and Days Till Delete = 1. The optional unfinished-large-upload cancellation control was not present in the UI. Do not apply this rule to `heavix-dev-assets`.

A local B2 single-object upload/download/delete smoke test and isolated PostgreSQL 17 backup/restore CI proof are separate completed tests. The integrated chain (PostgreSQL dump → client-side age encryption → B2 upload → remote read-back → offline decryption → PostgreSQL restore) is not proven. Backblaze Caps & Alerts could not be configured because the account UI requires an accepted payment card. Keep real archive writes blocked while billing exposure cannot be bounded. The 30-day rule is provisional Preview/source archive retention, not a Production backup policy.

## Release blockers (ordered)

1. **Branch reconciliation:** #183 is one commit behind and diverged from current main; #195 has overlapping homepage/PageRenderer changes. Establish a reviewed, conflict-free branch stack without touching main directly.
2. **Runtime exact-head proof:** rerun CI and OpenNext proof on the final integrated head; preserve the no-DB smoke test.
3. **Secret destination attestation:** independently establish that the two Cloudflare secret bindings point to the dedicated App Preview and Store Preview databases, without reading, printing, hashing, comparing, or exposing secret values.
4. **Database identity bindings:** obtain expected OIDs only from authoritative Prisma metadata after destination attestation; configure distinct App/Store OID guards. Do not contact either DB before both targets are proven.
5. **Read-only Preview proof:** only after all prior gates, obtain a fresh exact-head review/approval and run the explicit `PREVIEW_ONLY` Workerd proof. Keep it read-only and never include Production credentials.
6. **Preview deployment:** only after proof succeeds, review active-vs-branch Wrangler compatibility drift and deploy to the existing Preview Worker as a separately verified operation. Do not enable public branch previews or Production deployment.
7. **User acceptance:** verify home page, listings, search, categories, brands, services, articles, authentication, listing submission, admin/RBAC boundaries, images/assets, error handling, mobile and RTL layout. Record defects and fix them in isolated PRs.
8. **Production/DNS later:** keep `heavix.ir` DNS and Production NO-GO until Preview acceptance, backup/recovery design, domain/DNS/email record inventory, and a separate launch approval are complete.

## Explicit non-actions

This assessment did not:
- read or expose any secret or connection string value;
- connect to any database or execute SQL;
- create Prisma credentials, apps, buckets, migrations, or seeds;
- upload or deploy a Worker;
- write to B2 or dispatch the archive workflow;
- change DNS, merge a PR, or modify `main`.

## Next execution checkpoint

The next engineering task is to reconcile the #183/#191/#200 runtime stack with the independent #195 homepage branch on an isolated branch, then obtain exact-head CI and review evidence. Preview DB proof and deployment remain blocked until the secret destination and database identity gates are satisfied.
