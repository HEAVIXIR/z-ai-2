# HEAVIX — Pre-Preview Readiness Gate
**Review date:** 2026-11-09  
**Repository:** `HEAVIXIR/z-ai-2`  
**Active security branch:** `security/active-session-hardening-2026-11-08`  
**Reviewed security HEAD:** `f287bb3c9e48e36ff187f74e5df0eb78611fdaba`  
**Decision:** **NO-GO for Preview release** until the blockers in this document are independently closed.

This is an evidence register and execution order, not authorization to deploy. It records only verified observations. Unknowns remain unknown; CI success is not substituted for runtime, database, security, backup, or release proof.

## 1. Executive status

| Gate | Current state | Evidence / reason |
|---|---|---|
| Security-branch CI | PASS on reviewed SHA | CI, Prisma Workerd no-DB smoke, Cloudflare Edge Middleware Workerd proof, Bun lockfile all successful on `f287bb3c9e48e36ff187f74e5df0eb78611fdaba` |
| Cloudflare/OpenNext build and local request-path proof | PASS on selected PR heads | PR #288 and #293 exact-head checks successful; these are local/build checks, not an active protected Preview deployment |
| Browser E2E | PASS on PR #289 head | PR body records 32 passed and 10 intentional skips on Chromium; not Preview acceptance |
| Dual Preview DB Workerd PPG proof | BLOCKED / NOT PROVEN | PR #191 and #200 check-runs show Preview-only Prisma runtime job skipped; required dedicated DB role and identity evidence not established |
| Preview gate / independent security review | BLOCKED | PR #210 has no submitted review in current GitHub API response; not deployed; current Worker secret inventory does not show dedicated gate-secret names |
| Cloudflare Preview exposure | NEEDS IMMEDIATE OWNER REVIEW | Current API reports `previews_enabled=true`; active deployment is Worker version #14 at 100%; version metadata has `has_preview=true` |
| Prisma Preview backup inventory | EMPTY | App Preview and Store Preview automated backup lists returned empty |
| Integrated encrypted B2 DB archive/restore | NOT PERFORMED | No evidence of upload to `heavix-db-backups`, read-back, hash verification, offline decrypt, and restore of the same remote objects |
| Branch protection | BLOCKER / NOT ENFORCED | Last independently readable state was disabled; current rulesets list empty; current protection endpoint returned 403 and could not be reverified |
| Production / DNS | NO-GO | Explicitly out of scope for this pre-Preview work |

## 2. Exact-SHA workflow evidence

Reviewed security HEAD: `f287bb3c9e48e36ff187f74e5df0eb78611fdaba`.

- [CI run 42581095772](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42581095772): `docker-build-proof`, `audit-transaction`, `Cloudflare compatibility (report-only)`, `phase-tests`, `verify`, and `tls-proof` succeeded. `Legacy archive inventory (read-only)` was intentionally skipped.
- [Prisma Workerd Smoke Proof 42581095756](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42581095756): successful; this run has no DB credentials and is not dual-DB proof.
- [Cloudflare OpenNext Edge Middleware Workerd Proof 42581095964](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42581095964): successful local Workerd request-path proof.
- [Bun lockfile 42581095740](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42581095740): successful.

Related exact-head evidence:
- PR #293, HEAD `ddb74d991b51afeecb2405e2923b0dc726dd3c62`: [Edge Middleware Workerd 42490168437](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42490168437) and [CI 42490168507](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42490168507) successful. CI blocking jobs passed; legacy archive inventory skipped. No submitted review was returned for this PR.
- PR #288, HEAD `9ad74273ec20dae6e6380cf17d963f3c53d1c026`: [CI 42480825496](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42480825496) blocking jobs successful; Cloudflare Workers Build check successful; legacy archive inventory skipped.
- PR #289, HEAD `da78c71a79384edeca126ddc9cda26225d95d6ed`: [CI 42484172988](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42484172988) successful. PR description reports 32 Chromium browser tests passed and 10 intentional skips. This is branch CI evidence only.
- PR #285, HEAD `d10221a08a0d2e763f201aa45f6b2ac54472b94d`: [CI 42468490048](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42468490048) blocking jobs successful; Workers Build check successful. Its base is stale relative to current PR #258.
- PR #258, HEAD `b980c4dc7200a023deb13207968e172cadddd5ca`: [CI 42491911170](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42491911170) blocking jobs successful; Workers Build check successful. No migration is thereby applied to Preview.
- PR #200: OpenNext real-route smoke and Workers Build checks succeeded, but the Prisma Preview-only runtime job was skipped.
- PR #191: no-DB Workerd smoke succeeded, but the Prisma Preview-only runtime job was skipped.
- PR #292: the local Workerd Proxy request-path proof failed. Do not use the unsupported Node.js Proxy path as the Cloudflare deployment route; PR #293's Edge Middleware proof is the current supported direction.

## 3. Branch and PR integration order

Do not merge, cherry-pick, or rebase these branches wholesale. Resolve each against its actual current Git refs and inspect overlapping files.

### OpenNext / Prisma runtime chain
1. PR #183 — `infra/cloudflare-opennext-build-recovery`
2. PR #191 — `infra/prisma6-cloudflare-runtime`
3. PR #200 — `test/opennext-runtime-integration`
4. PR #210 — `security/preview-gate`

The recorded compare results show divergence in this chain and overlap in CI, Prisma clients, Workerd tests, OpenNext config, and Worker runtime files. Recompute merge bases immediately before integration; do not infer linear fast-forward readiness from PR numbering. PR #191/#200 currently lack successful dual-DB proof.

### Preview crawler / SEO
1. PR #288 — `integration/preview-crawler-opennext-2026-11-08`, based on OpenNext recovery; 23 commits ahead in the recorded compare.
2. PR #290 — Edge Middleware route, exact-head Workerd and CI checks successful.
3. PR #293 — deduplicated Preview noindex and Workerd Edge Middleware proof, exact-head Workerd and CI successful.
4. PR #292 — canonical-origin branch based on the crawler stack, but it uses Vercel-specific `VERCEL_ENV`/`VERCEL_URL` and has a failed Proxy Workerd proof. Do not merge wholesale into the Cloudflare-native path.
5. PR #291 — dynamic sitemap branch, exact-head CI and Workers Build checks successful; integrate and test with #288/#293 rather than independently assuming sitemap correctness.

PR #283 is open and non-Draft, approved by `dellk00k` on exact HEAD `ad7350000ef4c8cba80f151c97bae4516252df47`, and its exact-head CI run [42459217015](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42459217015) succeeded. However, its Preview canonical origin explicitly relies on Vercel Preview variables and its description reports a Vercel Preview runtime. Vercel is not an approved HEAVIX infrastructure dependency. Do not merge this PR wholesale into the Cloudflare stack. Review its independent categories/homepage changes for selective porting only if they pass Cloudflare-native tests.

### Store / browser test chain
- PR #286 adds frozen Bun lockfile enforcement on `main`.
- PR #289 is stacked on #286 and provides browser/transaction test coverage.
- PR #258 is the current Store inventory integration PR; its latest head differs from the older base SHA recorded by PR #285.
- PR #285 is 17 commits ahead and 19 behind its recorded merge base relative to the Store integration branch; reconcile this divergence and re-run exact-head CI before integrating server-side transfer search.
- PR #259 and #246 are separate inventory safety work. Their transactional/warehouse changes must be compared at file and lock-order level before combining with #258/#289.

## 4. Current Cloudflare Preview observation

Read-only Cloudflare API observation for account Worker `heavix-preview`:
- Active deployment: `d2217c73-0e08-4cee-8a74-3b5ce8dda61e`, created 2026-10-29.
- Version #14: `57c14554-2a28-4f77-981f-0b1ced6bad80`, currently at 100% deployment traffic.
- Version #14 metadata reports `has_preview=true`.
- Worker subdomain is enabled and `previews_enabled=true`. This differs from an earlier observation of false; the current API observation must be treated as current, without assuming who changed it.
- Compatibility date `2026-10-28`; compatibility flag `nodejs_compat`.
- Current bindings: `ASSETS`, `HEAVIX_ENV`, `NODE_ENV`, secret names `DATABASE_URL` and `STORE_DATABASE_URL`.
- Current secret-name inventory returned only `DATABASE_URL` and `STORE_DATABASE_URL`; no dedicated Preview-gate secret names appeared. No values were read.

This is not proof that a version URL is protected, nor proof that the active worker is running PR #210's gate. Verify the exact host, version, and gate before any Preview exposure. Do not toggle Preview enablement, deploy, alter bindings/secrets, or change traffic as part of this document.

## 5. Prisma and dual-database readiness

Current Prisma metadata:
- Separate projects exist for `heavix-app-preview`, `heavix-store-preview`, `heavix-production`, and `heavix-web-preview`.
- App Preview database `db_ew8d6duermpt125paxaqorr9` and Store Preview database `db_cmtgxfrfwxw5mi77020tcnc3` are listed as ready.
- Automated Prisma backup lists for both Preview databases returned empty.
- App Preview has many preview branches. Store Preview branch inventory is smaller and does not currently show the Store inventory integration branch. Branch name presence is not proof of database/schema alignment.

Previous read-only SQL audit recorded:
- Both Preview DB system IDs matched expected identities: App `7701427422680793119`; Store `7701425043360235551`.
- Current login role on both was `prisma_application`, with `rolreplication=true`, membership in `pg_write_all_data`, effective table-write privilege, and no role-level `default_transaction_read_only=on`.
- This does not meet the dedicated least-privilege Preview proof requirements.

Required before Preview:
1. Establish distinct App and Store Preview-only runtime identities and independently prove each destination maps to the expected database/system ID.
2. Prove effective read/write behavior at the transaction and role level, and prove there are no unintended write grants or elevated memberships for proof identities.
3. Prove request-scope isolation and concurrent request safety for both PPG clients.
4. Establish migration baseline/history and schema parity for both DBs without running migrations during this gate.
5. Dispatch the manual Preview-only Workerd proof only after its GitHub Environment and secrets are independently verified and least-privilege roles satisfy the runbook. The proof must be tied to exact SHA and expected database identities.

No SQL, role, grant, setting, migration, seed, or database mutation is authorized or performed by this readiness review.

## 6. Backup and restore readiness

Keep three capabilities distinct:
1. B2 object transfer smoke: historical operator-confirmed one-object upload/download/hash/delete; exact bucket used by that historical smoke is not established.
2. Paired PostgreSQL 17 disposable backup/restore: CI-proven locally against disposable databases.
3. Integrated encrypted off-site DB archive/restore: **not performed**.

The intended DB archive bucket is private `heavix-db-backups`; `heavix-dev-assets` is for development assets/media and is never a DB dump destination. The current workflow is manual Preview-only and remains hard-blocked by the Prisma full-access credential model versus the least-privilege requirement. Do not bypass the code hard gate by using another Prisma connection string or a misleading connection label.

Do not call the integrated archive complete until the same remote encrypted objects have passed upload, read-back, ciphertext hash verification, offline decrypt, plaintext integrity verification, and PostgreSQL 17 restore verification. Do not assume sequential Main and Store `pg_dump` calls form one atomic cross-database point-in-time snapshot; they are independent snapshots.

Retention/cost caps and B2 lifecycle policy must be reviewed separately. No B2 upload, deletion, lifecycle mutation, or restore was performed.

## 7. Required pre-Preview execution sequence

1. Re-read all live PR heads and branch refs; record exact merge bases and overlaps.
2. Resolve OpenNext/Prisma integration without wholesale merges; rerun CI and Workerd proofs on each resulting SHA.
3. Integrate Preview crawler, Edge Middleware, canonical-origin, robots and sitemap changes into one Cloudflare-native request-path test matrix. Remove Vercel-only dependencies from the HEAVIX infrastructure path.
4. Review public homepage/category routes, Store APIs, RBAC, payment evidence gates, media sidecar access and audit-outbox semantics; preserve separate DB transaction boundaries.
5. Obtain independent security review of the Preview gate; prove all-path/method protection, login/logout, HMAC, origin binding, cookie flags, fail-closed behavior, and documented limitations.
6. Verify exact Cloudflare Preview host/version exposure and gate routing. Do not expose an unprotected preview version.
7. Complete dual App/Store Preview identity and PPG Workerd proof.
8. Verify migration history and Preview schema/data alignment; only then propose a separately authorized migration plan.
9. Resolve B2 archive architecture within zero-cost and least-privilege constraints; conduct a controlled encrypted remote restore rehearsal only after authorization.
10. Verify branch protection/ruleset enforcement and required checks. Current ruleset inventory was empty; protection API read returned 403 in the latest check, so current enforcement is unverified.
11. Complete owner-led browser acceptance against the actual protected Preview URL, not local Workerd or build output.
12. Present a Preview go/no-go package. Stop here; do not deploy or change production DNS/domain without separate explicit approval.

## 8. Safety boundary

Approved infrastructure remains GitHub, Cloudflare, Prisma, and Backblaze B2 within free limits. Vercel is not HEAVIX infrastructure. Keep `main`, Production, `heavix.ir`, DNS, Worker settings, bindings, secrets, database roles/grants/settings, migrations, and B2 objects unchanged until their specific gates and separate authorizations are satisfied.

**Current overall decision: NO-GO for Preview release.** The principal blockers are unproven dual-DB runtime identity/privileges, missing independent Preview-gate review/deployment proof, current Cloudflare preview capability enabled on an older active version, no integrated encrypted B2 restore, and branch protection/ruleset enforcement not established.


## 9. Preview gate implementation review — PR #210

The PR #210 source implements an outer Worker wrapper that calls `handlePreviewGate` before invoking the generated OpenNext Worker. The reviewed source has these positive controls:
- exact `HEAVIX_ENV=preview` requirement and fail-closed 503 if either gate secret is missing or shorter than 32 UTF-8 bytes;
- separate password and HMAC-SHA-256 signing key;
- host-only `__Host-` cookie with Secure, HttpOnly, SameSite=Strict, Path=/, eight-hour expiry;
- signature binds the session to the request origin;
- constant-time byte comparison for supplied password/signature;
- login/logout are the only unauthenticated paths; all other routes/methods are gated before OpenNext;
- exact same-origin Origin validation for login/logout and unsafe application methods, with cross-site Fetch Metadata rejection;
- login form body capped at 4 KiB and no-store/noindex/security headers on gate responses.

Limitations and acceptance requirements:
- Session is stateless. Clearing the browser cookie on logout does not revoke a copied cookie; it remains usable until expiry or signing-key rotation.
- No durable/distributed rate limiter is implemented. Do not treat an in-isolate counter or no limiter as brute-force protection; a high-entropy password and an explicit rate-limiting design/review are still required.
- A shared password does not provide individual identity, MFA, or per-user audit attribution. This is an accepted-preview limitation only if the owner explicitly accepts it; do not describe it as full user authentication.
- The current Worker secret-name inventory returned only `DATABASE_URL` and `STORE_DATABASE_URL`; the two dedicated gate-secret names were not present in that inventory. This is not proof about a separate Preview base-config secret store. Verify the exact Preview secret names without reading values before deployment.
- Exact-head PR #210 OpenNext runtime integration proof [run 42204557102](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42204557102), on HEAD `dfa438517779f158fd97ce732e9689801f7a3e06`, completed successfully. Its `OpenNext real-route smoke (no DB credentials)` job includes the explicit step `Exercise the Preview gate wrapper in Workerd (no DB credentials)`, and that step succeeded. This establishes local gate-wrapper smoke only; it is not deployment or Preview secret configuration. The separate Prisma Preview-only proof remained skipped.
- PR #210 has no submitted independent review in the current GitHub API response. Require a review tied to the exact HEAD after any further change.

No secret values were read; no Worker configuration was changed; no deployment or Preview toggle was performed.


## 10. Preview migration command hazard

The `security/preview-gate` branch's `package.json` currently contains a script named `db:push:preview` that runs:

```sh
prisma db push --accept-data-loss --skip-generate --schema=prisma/preview-schema.prisma
```

This command is a schema-mutating operation and explicitly opts into data-loss acceptance. It is **not** part of the pre-Preview read-only validation sequence and must not be run as a shortcut for migration-baseline verification. Before any separately authorized Preview schema operation, inspect the target identity, produce a reviewed migration plan, verify backup/restore, and use a controlled migration process with explicit approval. The presence of a script named "preview" is not evidence that its target is isolated or safe.

The same branch pins Wrangler `4.156.0`, which satisfies the runbook's stated minimum `4.135.0` for the documented Preview base-config secret command. This is a source-level version check only; no secret command was run.
