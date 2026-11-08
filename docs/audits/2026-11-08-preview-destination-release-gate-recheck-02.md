# HEAVIX — Preview destination and release-gate recheck (round 2)

**Audit date:** 2026-11-08  
**Repository:** `HEAVIXIR/z-ai-2`  
**Branch:** `security/active-session-hardening-2026-11-08`  
**Audited HEAD before this document:** `7f6a94763d5efa8eef0c92c2d9852d0b2f0f0344`  
**Cloudflare Worker:** `heavix-preview`  
**Workers Builds script tag:** `40270a318ea94b0a9102bc3c4b34f0cf`

## Scope and safety

This is a read-only recheck of GitHub branch/Actions metadata, Cloudflare Workers Builds configuration, Worker binding metadata, Preview inventory/deployment metadata, and Prisma Postgres resource/connection metadata. No secret values, connection-string values, access tokens, database contents, or user data were requested or read. No Cloudflare, Prisma, DNS, deployment, migration, or Production settings were changed.

## GitHub exact-HEAD state

- The canonical branch still pointed to `7f6a94763d5efa8eef0c92c2d9852d0b2f0f0344` at audit time.
- Direct Actions inventory for that exact SHA returned two push-triggered workflows:
  - CI run `42514741431`: completed, success, attempt 2.
  - Cloudflare OpenNext Edge Middleware Workerd Proof run `42514741364`: completed, success, attempt 1.
- The branch API reports `protected=false` and no required status checks. This is an access-control/process risk. No branch-protection mutation was attempted because the available connection does not establish authorized repository-administration capability.
- Vercel statuses are not accepted HEAVIX CI signals and are excluded from the release gate.

## Cloudflare control-plane findings

- Worker Builds configuration remains linked to `HEAVIXIR/z-ai-2`, with production branch `main`.
- `auto_build_enabled=true`; `previews_enabled=false`.
- Preview inventory remains empty (zero Preview objects).
- Preview Base configuration contains the variable names `HEAVIX_ENV`, `NEXT_PUBLIC_SITE_URL`, and `NODE_ENV`. No variable values were needed for this recheck.
- Preview Base deploy command remains the no-op sentinel:
  `echo HEAVIX_PREVIEW_DEPLOY_BLOCKED_PENDING_ARTIFACT_AND_DATABASE_ISOLATION_PROOF`.
- Production deploy command remains the no-op sentinel:
  `echo HEAVIX_WORKERS_PRODUCTION_DEPLOY_BLOCKED_PENDING_ARCHITECTURE_AND_DATABASE_ISOLATION_PROOF`.
- The Worker version reports `nodejs_compat` and bindings `ASSETS` (assets), `DATABASE_URL` (secret_text), `STORE_DATABASE_URL` (secret_text), `HEAVIX_ENV` (plain_text), and `NODE_ENV` (plain_text).
- The secret-list endpoint returned only the two secret binding names; it did not expose or require secret material.
- The latest listed live Worker deployment is still dated `2026-10-29T21:25:26Z` (Wrangler source). Worker script metadata was modified later on `2026-11-08T15:14:51Z`. Configuration modification is not evidence of a new deployed artifact.

## Prisma resource and named-connection cross-check

All three known databases remain `ready` in Europe/Frankfurt:

| Purpose | Project | Database ID |
|---|---|---|
| Main app Preview | `heavix-app-preview` | `db_ew8d6duermpt125paxaqorr9` |
| Store Preview | `heavix-store-preview` | `db_cmtgxfrfwxw5mi77020tcnc3` |
| Production | `heavix-production` | `db_rc9ln1df4rwgxducp2zsge2s` |

Named connection metadata for the Main app Preview database includes:

- `heavix-preview-worker`: `con_qy93tzb532xw4rc2za0x18qq` (created 2026-10-28T14:12:18Z).
- `heavix-preview-app-worker`: `con_a51u3kwsg1vkhs7dhtfzyjtn` (created 2026-10-28T20:47:16Z).

The Store Preview database includes `heavix-preview-worker`: `con_deqygs8illafyr5bcw2mzkbn` (created 2026-10-28T14:12:20Z). The Production database has no named record with that label in the returned inventory.

**Critical limitation:** Prisma's named-connection inventory does not reveal which connection record a Cloudflare secret value points to. Cloudflare's secret binding metadata reveals binding names/types, not their target Prisma resource IDs. The presence of both `heavix-preview-worker` and `heavix-preview-app-worker` labels makes it especially important not to infer a binding destination from a name alone.

## Release gates and next required evidence

**NO-GO remains in force.** The following are still not proven:

1. `DATABASE_URL` resolves to the dedicated Main app Preview database.
2. `STORE_DATABASE_URL` resolves to the dedicated Store Preview database.
3. A deployable Preview artifact is isolated from Production and can be exercised without enabling public Preview builds prematurely.
4. The canonical branch has an appropriate protection/ruleset policy.

The next safe step is an authorized operator-side attestation performed locally in the Cloudflare/Prisma consoles: compare each secret's destination without copying or disclosing the value, then record only the matching Prisma database ID and a boolean match result. If the values do not match, correct them only through an explicitly authorized secret-rotation/change procedure with rollback planning.

Until those gates are evidenced: do not enable Preview builds, change bindings/secrets, deploy, run migrations, alter DNS, merge, open a PR, or touch Production.