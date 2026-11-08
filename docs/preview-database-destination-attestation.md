# HEAVIX Preview database destination attestation

## Purpose

This runbook closes the release gate for the Cloudflare Workers Preview environment without exposing credentials or changing Production.

The existence of separate Prisma projects/databases is necessary but is not sufficient. The operator must attest that the two Cloudflare Preview secret bindings resolve to the intended non-production database resources.

## Known resource inventory (control-plane IDs)

| Purpose | Prisma project | Database resource |
|---|---|---|
| Main application Preview | `heavix-app-preview` (`proj_ixevv7dtzykr8qbj3xdxpcbq`) | `db_ew8d6duermpt125paxaqorr9` |
| Store Preview | `heavix-store-preview` (`proj_ai0qym0x93siv4oeo11bkmuy`) | `db_cmtgxfrfwxw5mi77020tcnc3` |
| Production (do not use for Preview) | `heavix-production` (`proj_os9c4w3poha5zkxv8xtkt6ze`) | `db_rc9ln1df4rwgxducp2zsge2s` |

These IDs are inventory references, not evidence that Cloudflare secrets currently point to them.

## Required attestations

An authorized Cloudflare/Prisma administrator must verify each item in the dashboards or another trusted control plane:

1. A dedicated Cloudflare Preview exists for the intended Git branch and uses the dedicated Preview hostname.
2. Preview Base has `HEAVIX_ENV=preview`, `NODE_ENV=production`, and `NEXT_PUBLIC_SITE_URL=https://heavix-preview.heavixir.workers.dev`.
3. The Preview environment (not the Production Worker) has both secret binding names `DATABASE_URL` and `STORE_DATABASE_URL`.
4. `DATABASE_URL` resolves to Prisma project/database `heavix-app-preview` / `db_ew8d6duermpt125paxaqorr9`.
5. `STORE_DATABASE_URL` resolves to Prisma project/database `heavix-store-preview` / `db_cmtgxfrfwxw5mi77020tcnc3`.
6. Neither Preview binding resolves to `heavix-production` / `db_rc9ln1df4rwgxducp2zsge2s`, nor to any Production endpoint.
7. Preview resource metadata, region, and branch association are recorded. If Prisma branch-specific databases are used, record the exact Preview branch IDs and database IDs for both stores.

## Safe evidence format

Record only:
- Cloudflare Worker name and Preview ID/branch
- Binding **names** (never values)
- Prisma project names and resource IDs
- Non-secret database host and database name, if needed for correlation
- A boolean confirmation that each binding maps to the intended resource
- Verifier identity/role and timestamp

Never paste, log, screenshot, or commit:
- Full connection strings / URLs
- Usernames, passwords, tokens, query parameters, or secret values
- Cloudflare API tokens or Prisma API keys

If an administrator needs to compare a connection string locally, parse it in a trusted local terminal and print only hostname and database pathname. Do not send the original value to chat, CI logs, an issue, or this repository.

## Fail-closed release gates

- If either binding destination cannot be proven, keep Preview deployment blocked.
- Do not enable Previews or change secrets/bindings as an experiment.
- Do not run migrations, seed scripts, destructive DB commands, or Production operations.
- Do not merge or open a PR while the Vercel GitHub App blocker remains unresolved.
- Once both mappings are attested, separately validate Preview runtime connectivity and isolation using non-destructive read-only checks before considering deployment.
- Production remains untouched until Preview passes all gates and the owner explicitly approves a release.

## Current audit state (2026-11-08)

- Separate app-preview, store-preview, and production Prisma resource identities were found.
- Cloudflare Builds Preview Base has the expected Preview environment and canonical URL.
- Cloudflare Previews are disabled and the Preview list is empty.
- The Worker Build configuration's Preview deploy command is a no-op safety sentinel.
- The live Worker secret binding names are present on the Worker, but this does not establish Preview destinations.
- No secret values were read. Destination attestation is outstanding; release status is **NO-GO**.
