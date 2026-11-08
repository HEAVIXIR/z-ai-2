# HEAVIX — Cloudflare Preview control-plane recheck

**Audit date:** 2026-11-08  
**Repository:** `HEAVIXIR/z-ai-2`  
**Branch:** `security/active-session-hardening-2026-11-08`  
**Worker:** `heavix-preview`  
**Cloudflare account:** `3fe0437a0aab4bafb2e728e458f67ea0`  
**Workers Builds config/script tag:** `40270a318ea94b0a9102bc3c4b34f0cf`

## Scope and method

Read-only control-plane inspection of the Cloudflare Workers Builds configuration, Preview inventory, Worker script settings, and secret-binding metadata; plus Prisma Postgres named-connection metadata for the previously inventoried resources. No secret values, connection strings, tokens, or database contents were requested or read.

## Verified Cloudflare findings

- Worker Builds configuration belongs to `HEAVIXIR/z-ai-2`; production branch is `main`.
- `previews_enabled=false`.
- Preview inventory returned zero Preview objects.
- Preview Base variables are `HEAVIX_ENV=preview`, `NODE_ENV=production`, and `NEXT_PUBLIC_SITE_URL=https://heavix-preview.heavixir.workers.dev`.
- Preview Base deploy command remains the no-op sentinel:
  `echo HEAVIX_PREVIEW_DEPLOY_BLOCKED_PENDING_ARTIFACT_AND_DATABASE_ISOLATION_PROOF`.
- Production deploy command remains the no-op sentinel:
  `echo HEAVIX_WORKERS_PRODUCTION_DEPLOY_BLOCKED_PENDING_ARCHITECTURE_AND_DATABASE_ISOLATION_PROOF`.
- The live Worker script settings expose binding names `DATABASE_URL` and `STORE_DATABASE_URL` as `secret_text`; `ASSETS` as assets; and plain-text `HEAVIX_ENV=preview`, `NODE_ENV=production`.
- Secret-list endpoint returned only the names `DATABASE_URL` and `STORE_DATABASE_URL`. No secret material was returned or inspected.

## Prisma connection metadata cross-check

The previously inventoried Preview databases each contain named connection-string records labelled `heavix-preview-worker`:

| Purpose | Prisma database ID | Named record ID | Created |
|---|---|---|---|
| Main app Preview | `db_ew8d6duermpt125paxaqorr9` | `con_qy93tzb532xw4rc2za0x18qq` | 2026-10-28T14:12:18Z |
| Store Preview | `db_cmtgxfrfwxw5mi77020tcnc3` | `con_deqygs8illafyr5bcw2mzkbn` | 2026-10-28T14:12:20Z |

The Production database `db_rc9ln1df4rwgxducp2zsge2s` did not show a record with that name in the returned metadata.

**Important limitation:** matching connection-record labels and timestamps are corroborating inventory metadata only. They do not prove that the Cloudflare Worker secret bindings resolve to those Prisma records/databases. The secret destination remains unverified.

## CI and source-control status

- GitHub branch search confirms the canonical security branch exists.
- The exact docs commit `47bd4d9855f31148461254e640d28f5bdd59761d` has only an external `Vercel: success` combined status.
- Vercel is not an accepted HEAVIX infrastructure/CI signal. This result is not counted as project CI.
- The GitHub connector's commit-workflow-runs wrapper filters to PR-triggered runs, so an empty response from that wrapper is not proof that no Actions run exists. A direct Actions run inventory is still required.

## Release decision

**NO-GO remains in force.**

Do not enable Preview builds, alter Worker settings, change secrets/bindings, run migrations, deploy, merge, open a PR, or touch Production on the basis of this audit. Next required evidence is an authorized administrator's local, non-secret attestation that each Preview binding maps to the intended dedicated Preview database resource. Record only resource IDs and a boolean match result; never share the connection string itself.
