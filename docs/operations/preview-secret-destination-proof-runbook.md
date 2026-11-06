# Preview database Secret destination proof — operator runbook

**Status:** active verification record. Phase 2 database identity checks have been completed under the operator's authorization. This document does not authorize Worker upload/deployment, migration, write, or Production access.

## Objective

Establish, with independently recorded provenance, that the two Preview-only connection strings supplied to the local Workerd proof are the exact resources intended for:

- App: Prisma project `heavix-app-preview`, database `db_ew8d6duermpt125paxaqorr9`.
- Store: Prisma project `heavix-store-preview`, database `db_cmtgxfrfwxw5mi77020tcnc3`.

Do not infer destination from the connection-string name alone. Never read, print, paste into chat, commit, screenshot, or log a connection string or bearer token.

## Current known facts (metadata and read-only verification)

- Cloudflare Worker `heavix-preview` has secret-text bindings named `DATABASE_URL` and `STORE_DATABASE_URL`. Cloudflare's list-secrets API returns names/types only; it cannot prove destination.
- The dedicated App Preview and Store Preview Prisma databases are Ready in Frankfurt.
- Expected cluster identifiers recorded by prior independent inventory:
  - App Preview: `7701427422680793119`
  - Store Preview: `7701425043360235551`
- The verified current database OID is `5` for both Preview resources. Both report `current_database() = postgres`; the same OID across these two independent clusters is valid. A database OID is only unique within its own cluster, so the cluster `system_identifier` and database OID must be checked together.
- The active Cloudflare Worker does not currently expose `HEAVIX_APP_PREVIEW_DATABASE_OID` or `HEAVIX_STORE_PREVIEW_DATABASE_OID`. Do not modify it to add them as part of this runbook.
- Active Cloudflare Worker version #14 (`57c14554-2a28-4f77-981f-0b1ced6bad80`) was last uploaded on 2026-10-29. Its active compatibility flags remain only `nodejs_compat`.
- A read-only download/inspection of the active Worker source (2026-11-06) found no `opennext-runtime-proof` route marker, no `PREVIEW_ONLY` marker, and no App/Store OID binding names. The current deployed Worker therefore cannot be assumed to contain PR #200's protected identity route.
- Cloudflare's secret inventory confirms only the names/types `DATABASE_URL` and `STORE_DATABASE_URL`; encrypted values are not returned. No secret values were read or modified.

## Phase 0 — stop conditions

Do not proceed if any selected project/database name or ID differs from the exact values above. Do not select anything under `heavix-production`. Do not use a Production branch, Production credential, or generic/default connection whose source is ambiguous.

Do not change the live `heavix-preview` Worker secrets for this proof. The proof is run locally with an isolated Wrangler/Workerd process and a temporary private config; it does not upload or deploy a Worker.

## Phase 1 — independently identify the two Prisma resources (no connection-string values)

1. Sign in to Prisma Console.
2. Open the workspace containing Heavix.
3. Open **Projects**.
4. Select the project named **heavix-app-preview**. Confirm the project identity in the page before continuing.
5. Open its database **heavix-app-preview** and confirm the resource ID is `db_ew8d6duermpt125paxaqorr9`.
6. In the database's **Connection strings** section, locate the specifically named `heavix-preview-worker` entry. The App Preview and Store Preview projects both use this same connection-string label; the project and database resource IDs—not a unique label—distinguish the two resources. Do not use a generic console connection string and do not select a Production resource.
7. Separately, return to **Projects** and select **heavix-store-preview**.
8. Open database **heavix-store-preview** and confirm resource ID `db_cmtgxfrfwxw5mi77020tcnc3`.
9. In its **Connection strings** section, locate the specifically named `heavix-preview-worker` entry. This is the same label used in App Preview, but it belongs to this separately identified Store Preview database.
10. Record locally (not in chat) the source project, database name, resource ID, and connection-string label for each. The operator has visually confirmed that both entries exist and that both resource IDs match. The shared label is not an error and is not globally unique. These labels and IDs establish resource selection metadata, not the destination of the encrypted Cloudflare Secret values; the actual runtime identity test remains mandatory.

If either specifically named connection string is absent, stop. Do not create or substitute another connection without first reviewing the source and scope.

## Phase 2 — obtain the trusted database OIDs (COMPLETED)

The operator explicitly authorized Preview database contact. The assistant executed the following identity query separately against the exact App Preview and Store Preview project/database IDs through Prisma. The query was run inside `BEGIN TRANSACTION READ ONLY ... COMMIT`; both results reported `transaction_read_only = on`. Only SELECT statements were executed; no writes, migrations, or seeds were run.

For each database, open the SQL/query editor from that exact database resource page (not from the Production project) and run only:

```sql
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  (SELECT oid::text
   FROM pg_database
   WHERE datname = current_database()) AS database_oid,
  (SELECT system_identifier::text
   FROM pg_control_system()) AS system_identifier,
  current_setting('server_version') AS server_version;
```

Verified results (2026-11-06):

| Check | App Preview | Store Preview |
|---|---|---|
| Project / database ID | `proj_ixevv7dtzykr8qbj3xdxpcbq` / `db_ew8d6duermpt125paxaqorr9` | `proj_ai0qym0x93siv4oeo11bkmuy` / `db_cmtgxfrfwxw5mi77020tcnc3` |
| `current_database()` | `postgres` | `postgres` |
| `current_user` | `prisma_application` | `prisma_application` |
| Database OID | `5` | `5` |
| Cluster system identifier | `7701427422680793119` | `7701425043360235551` |
| PostgreSQL | `17.2` | `17.2` |
| Explicit read-only transaction | `on` | `on` |

Both cluster identifiers match the independently recorded expected values. OID `5` in both is valid: OIDs are local to a PostgreSQL cluster and are not globally unique. Destination identity is established by the pair `(system_identifier, database_oid)`. No credentials or connection-string values were returned or recorded.

## Phase 3 — run the local Workerd proof (requires separate explicit operator go-ahead)

Run from a trusted Windows machine with the repository checked out at the exact reviewed PR #200 code snapshot. Do not use a shared/public computer.

The runner is `scripts/run-prisma-workerd-proof.mjs`. It requires:
- `HEAVIX_RUNTIME_PROOF_TARGET=PREVIEW_ONLY`
- `HEAVIX_APP_PREVIEW_PPG_URL` and `HEAVIX_STORE_PREVIEW_PPG_URL`: two distinct Prisma Postgres (PPG) connection strings, not direct PostgreSQL URLs unless the reviewed code explicitly supports them.
- `HEAVIX_APP_PREVIEW_DATABASE_OID` and `HEAVIX_STORE_PREVIEW_DATABASE_OID`: the OIDs obtained in Phase 2.

The runner writes a temporary `.dev.vars` file with restrictive permissions, starts Wrangler in local mode bound only to `127.0.0.1`, executes the identity/migration/read-only checks, then terminates the process and removes its temporary directory. It does not upload a Worker.

**Credential-handling requirements:** do not pass connection strings as command-line arguments; do not put them in PowerShell command history, shell profiles, GitHub Actions, GitHub Secrets, chat, screenshots, or logs. Use hidden secure prompts and transient process environment variables. Ensure the local machine is not shared and the temporary directory is removed after the run. Never print environment variables.

Expected proof assertions:
- App and Store each match their independently inventoried cluster system identifier and their own database OID.
- PostgreSQL 17, `public` schema, exact expected migration-name sets.
- Separate request-scoped clients; no cross-request leakage.
- Transaction-local read-only state is observed as true.
- No writes, migrations, seeds, Production access, Cloudflare deployment, or DNS changes.

A successful test against the two locally supplied connection strings proves those strings' destinations. It does **not** prove that the already-deployed Cloudflare secret values are identical. Do not claim the live Worker secret mapping is proven unless those live values are re-established through a separately controlled, reviewed update of the live Preview Worker and a subsequent protected runtime identity check. That update is not authorized by this runbook.

## Phase 5 — candidate Cloudflare version-only identity probe (NOT EXECUTED)

Cloudflare's current documentation describes a possible path that avoids routing normal traffic to the proof code:

- A Worker Version URL tests an uploaded version before deployment and uses that Worker version's existing configuration/resources: https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/
- Cloudflare supports an `inherit` binding to copy an existing binding, including a secret, from an earlier Worker version without resending its value. Script uploads inherit from the most recently uploaded version; use strict inheritance so a missing binding fails closed: https://developers.cloudflare.com/workers/observability/errors/#inherit-binding-errors
- `wrangler versions secret put` creates a new version without deploying it; ordinary `wrangler secret put` deploys immediately and must not be used for this proof: https://developers.cloudflare.com/workers/configuration/secrets/

However, the live account state currently blocks using a Version URL safely:

- The `heavix-preview` Worker reports `workers_dev.enabled=true` but `previews_enabled=false`.
- Cloudflare Access is not enabled on this account; the Access applications API returned `access.api.error.not_enabled`.
- Cloudflare Version URLs are publicly reachable when enabled unless protected. Do not enable them merely to run this proof.
- PR #200 now includes a separate outer entrypoint (`scripts/preview-version-worker.mjs`) that forwards only exact `GET /api/opennext-runtime-proof` requests with an ephemeral bearer token; every other path/method/token/query variant is rejected before OpenNext is invoked. Unit tests and the OpenNext smoke runner cover this gate, and the latest CI/OpenNext runs are pending at the time of this edit.
- This outer gate limits the newly uploaded proof version, but it does not protect historical Worker versions if Preview URLs are enabled. PR #200 remains Draft and still needs fresh independent review of its exact latest HEAD.

Before enabling Version URLs, prepare Preview-only Cloudflare Access protection in the Dashboard:

1. Open the Cloudflare Dashboard and select the account containing `heavix-preview`.
2. Open **Workers & Pages** → **heavix-preview** → **Settings** → **Domains & Routes**.
3. Find the **Preview URLs** row and choose **Enable Cloudflare Access** (not the separate `workers.dev` Access control).
4. Configure the Access policy to allow only the operator's own verified sign-in email. Prefer the one-time PIN/email identity option if no identity provider is already configured.
5. Select the scope **Previews only** if prompted. Do not select **All traffic**.
6. Save the Access policy, then verify the Preview URLs Access control is enabled. Do **not** turn on the Preview URLs themselves yet.
7. If the dashboard asks to enable Preview URLs as part of this flow, stop before confirming and report the exact prompt. Do not make the URLs public.

This is the only operator-side step likely required. It does not expose a Version URL while `previews_enabled=false`; it establishes the guard that must be in place before that flag can be enabled for the proof window.

Therefore, before any version upload:
1. Obtain a fresh independent review of the exact PR #200 HEAD and the proof route.
2. Enable a protected access path for Preview Version URLs. Prefer Cloudflare Access with a Preview-only policy; the account currently reports Access not enabled. The outer proof-only wrapper protects the new version's application routes, but enabling Preview URLs can also expose historical versions, so do not enable previews until account-level/Worker-level Access protection is confirmed.
3. Upload only the reviewed OpenNext artifact as a new Worker version; inherit `DATABASE_URL` and `STORE_DATABASE_URL` strictly from the verified current version, without reading or replacing their values.
4. Add only the two verified OID variables and a short-lived proof token to that version. Do not deploy it to normal traffic.
5. Invoke the proof endpoint with the token, confirm both identity pairs and read-only assertions, then revoke/remove the proof token and delete or retire the temporary version according to Cloudflare's supported lifecycle.
6. Re-read deployment metadata to prove the 100% traffic deployment remains on the original active version.

This is a candidate plan only. No version upload, secret inheritance, preview URL enablement, Access configuration, deployment, or token creation has occurred. If the access-control condition cannot be met without exposing the Preview app or changing current access, stop and use a trusted local runner instead.

## Phase 5.1 — proof-only wrapper smoke evidence (2026-11-06)

PR #200 exact code HEAD `6ad466305bdb5bf5da081d28d808f3c3bcf0eb7b` completed OpenNext workflow run `42200073422` (#121) with **SUCCESS**.

Verified in CI:
- The generated OpenNext Worker ran through `scripts/preview-version-worker.mjs`.
- Only the exact proof GET route with a generated 256-bit ephemeral bearer token was forwarded to OpenNext.
- Missing token, application root, admin/backup path, and non-GET proof method were denied with HTTP 404 before the OpenNext app was invoked.
- Existing identity guard tests and PPG Workerd module-load smoke passed without database credentials.
- Worker bundle audit completed and was uploaded as artifact `13493364561`, digest `sha256:57309cb361738b27544fb2c0eb828c34588c54ddf0ef73c912a6164c556ed22e`.
- Full CI run `42200073408` was queued at the time of this update.

This is code-path and exposure-boundary evidence only. It is not a Preview DB connection test, does not prove the live Cloudflare Secret destinations, and does not authorize a Worker upload or Version URL enablement.

## Phase 4 — evidence to report

Share only:
- App resource ID and database OID (not credentials).
- Store resource ID and database OID (not credentials).
- Whether each system identifier matched (yes/no).
- Runner result (PASS/FAIL) and non-secret assertion summary.
- Confirmation that no Production resource was selected.

Do not share connection strings, passwords, tokens, screenshots of credential panels, or full environment dumps.

## Current decision

- Prisma resource selection and direct Preview database identity: **PROVEN** for both Preview resources.
- App Preview identity pair: `(7701427422680793119, 5)`.
- Store Preview identity pair: `(7701425043360235551, 5)`.
- Cloudflare live Secret-to-database destination: **UNPROVEN**. The direct Prisma checks above do not inspect or prove the encrypted values currently bound to the Cloudflare Worker.
- Active Worker source inspection: **PROVEN NOT TO CONTAIN** the PR #200 identity-probe route/`PREVIEW_ONLY` markers or OID bindings as of 2026-11-06.
- Preview database contact: **AUTHORIZED AND COMPLETED**, using SELECT-only statements in explicit read-only transactions.
- Live Worker secret replacement, source upload, or deployment: **NOT PERFORMED**.
- Production: **NO-GO**.
- Migrations, seeds, writes, DNS changes, and PR merge: **NOT PERFORMED**.

Next safe step: complete the independent review and access-control design in Phase 5. Do not enable public Version URLs or alter deployment percentages until the route's exposure and rollback behavior are reviewed. If safe access cannot be established, use the local Workerd proof for the code path and keep live Cloudflare Secret destination marked UNPROVEN.


## Phase 6 — independent Cloudflare / Prisma metadata recheck (2026-11-07)

This addendum records a read-only API inventory. It does not authorize configuration changes or establish the destination of encrypted Worker secrets.

### Cloudflare account inventory

- The connected Cloudflare identity is the Heavixir account email. The account-list API returned one account visible to this connection.
- The zone-list API returned **zero zones** for that account. A filtered lookup for `heavix.ir` also returned no zone.
- Therefore, as of this check, this Cloudflare connection cannot prove that `heavix.ir` is attached to this account, cannot inspect its DNS records, and cannot establish a Worker route for that domain. This is an account/API-visible observation, not proof that the domain is absent from every Cloudflare account or that public DNS is broken.
- The account exposes one Worker script: `heavix-preview`.
- The Worker script metadata reports `modified_on=2026-11-06T10:19:45Z`.
- The script-settings response reports an empty `bindings` array. The separate secrets inventory reports only the names/types `DATABASE_URL` and `STORE_DATABASE_URL` (`secret_text`). Secret values were not read.
- The deployment inventory reports 14 deployments total. The newest deployment returned by the API is dated 2026-10-29 and assigns 100% to version `57c14554-2a28-4f77-981f-0b1ced6bad80`. This is deployment metadata, not a live request/health check.
- The R2 bucket API returns Cloudflare error 10042, “Please enable R2 through the Cloudflare Dashboard.” HEAVIX's selected object-storage provider is Backblaze B2; Cloudflare R2 is not a substitute and no R2 activation is proposed here.

### Prisma inventory

- The connected Prisma workspace lists four projects: `heavix-production`, `heavix-app-preview`, `heavix-store-preview`, and `heavix-web-preview`.
- The Postgres database inventory lists three Ready databases in Frankfurt:
  - App Preview: `db_ew8d6duermpt125paxaqorr9`
  - Store Preview: `db_cmtgxfrfwxw5mi77020tcnc3`
  - Production: `db_rc9ln1df4rwgxducp2zsge2s`
- The two Preview resources match the independently recorded IDs and identity pairs in Phase 2. Production was not queried.
- The separate Prisma object-store bucket inventory returned no buckets. This is unrelated to Backblaze B2 and must not be interpreted as a B2 inventory.
- Preview branches are provisioned in the App and Store projects. No branch, database, bucket, or deployment was created, deleted, promoted, or modified during this audit.

### Backblaze B2 boundary

Backblaze B2 is the designated HEAVIX object-storage and backup provider, separate from Cloudflare and Prisma. No Backblaze account/API connector is available in this session, so bucket inventory, application-key scope, lifecycle rules, retention, encryption settings, object lock, and restore behavior were **not re-verified live** in this phase. Historical project notes report a successful test upload/download/delete cycle; that historical test is not equivalent to a current restore drill or a verified backup policy. Do not claim current B2 readiness until a fresh non-production test object and a restore verification are evidenced through the operator's B2 account or a trusted S3-compatible client.

### Updated release gates

| Area | Current evidence | Decision |
|---|---|---|
| GitHub | PRs #224–#227 exact-head CI jobs all completed successfully; all remain Draft and unmerged | PASS for those CI runs only |
| Cloudflare zone/DNS | No zones visible in the connected account; `heavix.ir` lookup empty | UNVERIFIED / BLOCKED for domain-route claims |
| Cloudflare Worker | `heavix-preview` exists; two secret names visible; secret destinations not exposed; script-settings bindings array empty | PARTIAL; live DB destination UNPROVEN |
| Prisma Preview DBs | Both exact Preview database resources Ready; identity pairs previously verified in read-only transactions | PROVEN for direct Prisma resource identity |
| Prisma Production | Resource listed Ready; no SQL query or mutation performed | NOT TESTED |
| Backblaze B2 | No live connector available in this session; historical test only | NOT RE-VERIFIED |
| Cloudflare R2 | API says R2 must be enabled | OUT OF SCOPE; do not enable as a substitute for B2 |

### Next safe actions

1. Identify whether `heavix.ir` is intended to be in this Cloudflare account or a different account. Do not change DNS until account ownership and the authoritative DNS provider are confirmed.
2. Keep the existing Worker and its encrypted secrets unchanged. Add no binding, secret, route, or deployment until the exact Preview destination is proven by the reviewed identity-probe process.
3. Perform a fresh Backblaze B2 test in a dedicated non-production prefix/bucket: upload a uniquely named encrypted test object, verify metadata/checksum, download and compare SHA-256, verify retention/lifecycle expectations, and delete only that test object if policy permits. Then perform a separate restore drill from an actual backup artifact.
4. Do not treat successful GitHub CI as evidence of Cloudflare runtime, Prisma connection routing, or B2 recovery. Each provider has its own independent gate.
5. Do not query or mutate the Production database as part of these Preview checks.

**No Cloudflare configuration, DNS, Worker version, secret, Prisma resource, database, Backblaze object, or Production state was changed during this recheck.**


## Phase 6.1 — repeat Preview database identity verification (2026-11-07)

The App and Store Preview identity query was repeated directly against the exact Prisma project/database IDs listed above. Each query ran in an explicit BEGIN TRANSACTION READ ONLY transaction and was rolled back after the SELECT. Both returned transaction_read_only=on; no DDL or DML was issued.

| Field | App Preview | Store Preview |
|---|---|---|
| Project / database | proj_ixevv7dtzykr8qbj3xdxpcbq / db_ew8d6duermpt125paxaqorr9 | proj_ai0qym0x93siv4oeo11bkmuy / db_cmtgxfrfwxw5mi77020tcnc3 |
| Database / user | postgres / prisma_application | postgres / prisma_application |
| System identifier | 7701427422680793119 | 7701425043360235551 |
| Database OID | 5 | 5 |
| PostgreSQL | 17.2 | 17.2 |
| Read-only flag | on | on |
| Expected identity pair | MATCH | MATCH |

The exact PR #200 head was also rechecked: b2693496f21a396440814950bb232a97e63ffb13. GitHub reports the CI run 42203629883 and OpenNext runtime integration proof run 42203629863 as completed successfully for that head. This proves the tested code path and CI artifact only; it does not prove live Cloudflare Secret destinations or authorize uploading/deploying a Worker version.

The documentation PR's new CI run 42292288655 was still in progress when this addendum was written. Its final result must be checked on the exact final documentation commit before review.


## HEAVIX core-infrastructure boundary (authoritative project rule)

The HEAVIX core infrastructure consists of exactly these four provider domains:

1. **GitHub** — canonical source repository, version history, pull requests, review, automated tests, and CI/CD evidence.
2. **Cloudflare** — authoritative edge/runtime/network layer, Workers, DNS/domain routing, and public ingress/security controls.
3. **Prisma** — canonical relational database projects/branches, schema and migration tooling, ORM/runtime database access.
4. **Backblaze B2** — canonical object storage and backup/restore provider for HEAVIX files and backup artifacts.

**Vercel is an auxiliary Preview surface only.** It is not a HEAVIX core infrastructure dependency, not the authoritative deployment/runtime provider, and not a release-readiness gate. Vercel quota, build, or Preview failures must not block core work or be represented as failures of the HEAVIX infrastructure. It may be used opportunistically for visual review, but it must never become a source of truth for runtime health or release status.

Cloudflare R2 is not Backblaze B2 and is not an approved substitute. Do not enable R2 or migrate storage merely because an R2 endpoint is unavailable. Backblaze B2 health must be proven through B2-specific bucket/key/retention and restore evidence.

Release readiness must be evaluated independently for each core provider:
- GitHub: exact-head CI, required review, protected branch and artifact provenance.
- Cloudflare: verified account/zone ownership, DNS/route configuration, Worker version and secret/binding provenance, and public ingress/security behavior.
- Prisma: exact project/database identity, environment isolation, schema/migration consistency, transaction and backup compatibility.
- Backblaze B2: bucket and application-key scope, encryption/retention/lifecycle, integrity-checked object retrieval, and a successful restore drill.

A successful check in one provider does not prove the health of another. Never use an auxiliary Preview provider's status to replace any of these four independent gates.


## Phase 7 — Cloudflare Preview exposure correction and live re-verification (2026-11-07)

This phase supersedes conflicting Cloudflare observations in Phase 5 and Phase 6 where the live API now returns more complete Worker settings and where Preview URL state has changed. All calls below were read-only except the narrowly scoped Preview-URL protection change explicitly recorded below.

### Authoritative Worker endpoint and deployment

- The account Workers subdomain is `heavixir`; the canonical public Worker URL is `https://heavix-preview.heavixir.workers.dev`.
- Worker `heavix-preview` is still enabled on its workers.dev subdomain.
- Current active deployment is deployment `d2217c73-0e08-4cee-8a74-3b5ce8dda61e`, with 100% traffic assigned to version 14 (`57c14554-2a28-4f77-981f-0b1ced6bad80`), created 2026-10-29. No traffic split or active deployment was changed.
- The script settings API now returns these bindings (names/types only):
  - `ASSETS` — assets binding
  - `DATABASE_URL` — secret_text
  - `HEAVIX_ENV` — plain_text
  - `NODE_ENV` — plain_text
  - `STORE_DATABASE_URL` — secret_text
- Secret values were not read, copied, hashed, logged, or changed. The live Worker secret destinations remain **UNPROVEN**.
- Worker script metadata reports `routes=null`; no custom route was returned. The zone inventory still returns zero zones for this account and no `heavix.ir` match. Therefore this session can verify the workers.dev endpoint, but cannot verify `heavix.ir` DNS or a custom-domain route.
- The account-level Access APIs return `access.api.error.not_enabled`; Access is not enabled for this account. The account metadata also reports `enforce_twofactor=false`. No account-wide authentication setting was changed.

### Preview URL exposure finding and mitigation

Before mitigation, the Worker script subdomain API returned:
- `enabled=true`
- `previews_enabled=true`

The versions API listed 14 versions, each with `has_preview=true`. Because Access is not enabled, version-specific Preview URLs did not have an account-level Access application/policy protecting them. This was a historical-version exposure surface distinct from the canonical public workers.dev Preview endpoint.

**Mitigation performed and verified:**
- Updated only the Worker subdomain flags to `enabled=true, previews_enabled=false`.
- A subsequent GET returned the exact same values: `enabled=true, previews_enabled=false`.
- The canonical `https://heavix-preview.heavixir.workers.dev` endpoint remains enabled; only version-specific Preview URLs are disabled.
- No Worker code, version upload, deployment, traffic percentage, secret, binding, DNS record, zone, or database was changed.

This is the intended public-Preview boundary while Access remains unavailable: keep the single canonical public Preview endpoint available, but do not expose per-version preview URLs. Re-enable `previews_enabled` only after a reviewed access-control design protects historical/version URLs.

### Canonical public Preview guard — residual gap

The canonical public Preview remains enabled by design. The version-specific Preview URL surface has been disabled, but this is only a partial public guard:

- Cloudflare Access is not enabled for the account, and no zone for heavix.ir is visible in the connected Cloudflare account. No zone-level WAF or rate-limiting rule could be verified.
- The main-branch middleware file is src/middleware.ts. Its matcher covers only /admin and /api/admin; all other public paths pass through. Its cookie check is an early UI/API gate, not a replacement for route-level session validation and RBAC.
- Main does not contain src/lib/public-api-rate-limit.ts. That helper exists only on Draft PR #213, is not imported by middleware or public API routes, and uses node:net. It is not an active global public rate limiter and must not be represented as deployed protection. Its in-process limiter is explicitly per-runtime, not a distributed quota.
- The current verified protections are therefore: canonical public Preview remains available; version-specific Preview URLs are disabled; application routes retain their own authentication/authorization checks. A global edge/public abuse-control layer is **NOT YET PROVEN**.

Next safe implementation gate: first reconcile the unmerged Cloudflare runtime dependency chain documented below; then choose a Cloudflare-supported rate-limiting mechanism or a tested Worker-compatible implementation, scope exclusions for payment callbacks/health checks, add exact-head behavioral tests, and deploy only after explicit release approval. Do not add an untested global 60/minute limit to every API route; that could disrupt normal traffic without providing distributed protection.

### GitHub-to-Cloudflare source provenance gap

A fresh exact-path check against `main` returned 404 for all of the following runtime integration files:
- `wrangler.jsonc`
- `wrangler.toml`
- `open-next.config.ts`
- `scripts/preview-version-worker.mjs`
- `src/lib/db.worker.ts`
- `src/lib/prisma-worker-clients.ts`

The implementation exists only in the unmerged infrastructure dependency chain:
- PR #191 HEAD `3bf2333fde4f81473ce0d14c99cbd653a386c2e2`, Draft, base branch `infra/cloudflare-opennext-build-recovery`, `mergeable=false`; its CI run `42059989449` passed.
- PR #200 HEAD `b2693496f21a396440814950bb232a97e63ffb13`, Draft, base branch `infra/prisma6-cloudflare-runtime`, `mergeable=true`; its CI run `42203629883` and OpenNext runtime proof `42203629863` passed.

These successful CI runs validate the branch-specific code paths only. Neither PR is merged into `main`; PR #200 depends on PR #191. Therefore the active Cloudflare Worker version 14 cannot currently be proven to originate from the repository's `main` HEAD. This is a source-of-truth/provenance gap, not a reason to deploy the draft branch directly.

Required gate: reconcile the dependency chain, bring the reviewed Cloudflare runtime integration onto a branch based on current `main`, pass exact-head CI, independently review the artifact and secret inheritance, and only then consider a separately authorized Worker version upload. No merge, upload, or deployment was performed in this phase.

### Cloudflare data services

- D1 database inventory returned zero databases.
- R2 bucket inventory returned HTTP 403 / error 10042: “Please enable R2 through the Cloudflare Dashboard.” R2 was not enabled; HEAVIX's selected object-storage provider remains Backblaze B2.
- No D1 database, R2 bucket, DNS zone, Access application, or Access policy was created or modified.

### Prisma and backup inventory

- Four projects remain visible: `heavix-production`, `heavix-app-preview`, `heavix-store-preview`, and `heavix-web-preview`.
- Three PostgreSQL databases are Ready in Frankfurt: App Preview, Store Preview, and Production. The `heavix-web-preview` project currently has no separate Postgres database in the database inventory.
- Automated Prisma Postgres backup inventory returned an empty list for each of the three databases. This is not proof that no other backup system exists; it means no Prisma-managed automated backup objects were returned by this API check.
- Connection-string inventories returned names/metadata only. No connection-string value was generated, retrieved, or exposed.
- Production was not queried. No database, branch, schema, migration, seed, or data was modified.

### Prisma backup and credential policy — official provider documentation

The current Prisma Postgres documentation confirms two constraints relevant to the archive design:

- Every credential for one database uses the same database user and has the same full database access. Credentials cannot be made read-only or restricted to selected tables, schemas, or PostgreSQL roles. Prisma Postgres also does not support custom roles. A credential named `backup-readonly` would therefore not be read-only.
- Automated snapshots are available on paid Starter/Pro/Business plans, are taken daily only on days with database activity, and have plan-dependent retention (7 days on Starter/Pro; 30 days on Business). The Free plan has no automated backups. The current Prisma API inventory returned no snapshots for any of the three HEAVIX databases. The active plan was not independently verified, so do not infer the plan solely from the empty list.

Official references:
- https://www.prisma.io/docs/postgres/database/connecting-to-your-database
- https://www.prisma.io/docs/postgres/database/backups
- https://www.prisma.io/docs/postgres/faq

Prisma-managed snapshots, if available, are provider recovery points; they are not a separately verified Backblaze B2 copy. They do not satisfy the independent off-site encrypted archive and restore gate.

### Backblaze B2 and integrated backup boundary

- No Backblaze B2 connector is available in this session; live bucket/key/retention/object inventory and restore execution were not performed.
- PR #188 remains the source of the archive implementation and its explicit hard gate. Its exact-head archive workflow's synthetic/static checks passed, but the real archive job and Preview identity/readiness job were skipped.
- The integrated encrypted B2 database archive and restore remains **NOT PROVEN**. The provider's lack of a genuinely read-only Prisma Postgres credential is a documented blocker for the current direct `pg_dump` workflow. Do not bypass the hard gate or use full-access credentials for backup automation.
- The historical B2 upload/download/delete smoke test is not a retained backup and is not a PostgreSQL restore drill.

### Updated decisions

| Control | Verified state | Decision |
|---|---|---|
| Canonical public Preview | workers.dev enabled | KEEP AVAILABLE |
| Version-specific Preview URLs | disabled and re-read successfully | PROTECTED |
| Cloudflare Access | not enabled | UNAVAILABLE in current account state |
| Custom domain / DNS | no zone visible; no Worker route returned | UNVERIFIED |
| Worker secret destinations | names visible; values inaccessible | UNPROVEN |
| D1 / R2 | zero D1; R2 disabled | NOT USED |
| Prisma Preview identities | previously independently proven read-only | PROVEN for direct Preview resources only |
| Prisma-managed automated backups | empty list for all three DBs | NOT CONFIGURED / NOT RETURNED |
| Backblaze B2 integrated restore | no live verification | NOT PROVEN |
| Production DB | not queried or modified | NO-GO |

**Safety record:** the only live Cloudflare mutation in this phase was disabling version-specific Preview URLs while preserving the canonical public workers.dev endpoint. The change was immediately read back and verified. No other Cloudflare, Prisma, Backblaze, GitHub secret, DNS, deployment, or Production state was changed.
