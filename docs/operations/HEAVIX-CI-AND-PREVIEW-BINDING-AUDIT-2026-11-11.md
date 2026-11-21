# HEAVIX — Exact-head CI and Preview binding audit

Date: 2026-11-11

## Exact-head CI

- Repository: `HEAVIXIR/z-ai-2`
- Branch: `recovery/heavix-full-product-integration-2026-11-11`
- Draft PR: https://github.com/HEAVIXIR/z-ai-2/pull/307
- Exact PR head: `45d86f1c7df9d644e4d33431ba5013e0a30646b7`
- Actions run: https://github.com/HEAVIXIR/z-ai-2/actions/runs/42971293294
- Result: `completed / success` on the exact PR head.

All required jobs passed: verify (Typecheck, Lint, RBAC seed, security tests, integration tests, contract/unit tests, E2E smoke, PostgreSQL migration proof and production build), TLS proof, phase tests, audit transaction, Cloudflare compatibility report-only, and Docker build proof including Caddy syntax, Compose interpolation and real Caddy-to-app connectivity. Legacy archive inventory was skipped by workflow configuration.

## Read-only Cloudflare Worker settings audit

Read-only API inspection of Cloudflare account `Heavixir Gmail.com's Account` and Worker `heavix-preview` confirmed:

- `HEAVIX_ENV=preview`
- `NODE_ENV=production`
- Secret bindings exist: `DATABASE_URL` and `STORE_DATABASE_URL`
- Binding types are `secret_text`
- Compatibility date `2026-10-28`; compatibility flag `nodejs_compat`

Secret values were not retrieved, printed, or modified. No Worker settings, deployments, DNS, or Production resources were changed.

## Preview database identity gate — still open

The existing workflow `.github/workflows/prisma-preview-workerd-proof.yml` is pinned to commit `b94b9d6f3540e8f4467b1d4ac051d5ef050c0994`. It requires explicit `PREVIEW_ONLY` workflow dispatch and two GitHub Actions secrets:

- `HEAVIX_APP_PREVIEW_PPG_URL`
- `HEAVIX_STORE_PREVIEW_PPG_URL`

The script `scripts/run-prisma-workerd-proof.mjs` performs read-only Workerd checks against hard-coded PostgreSQL system identifiers and migration fingerprints, request isolation, `transaction_read_only`, and fail-closed missing-secret behavior. It reports no writes and no Production access.

**Important limitation:** the workflow consumes GitHub Actions secrets. The workflow does not independently establish that those GitHub secret values are identical to the two secret values currently bound to Cloudflare Worker `heavix-preview`. A passing workflow alone therefore cannot be represented as proof of the live Worker bindings. Establish provenance/equivalence without disclosing secret values before relying on the result for deployment.

The workflow was not dispatched because the browser profile had no GitHub sign-in. No credentials were requested or submitted.

## Guardrails / next action

- Do not merge PR #307 until owner review.
- Do not deploy until the provenance and exact Preview database identity gates pass.
- Do not alter Production, DNS, Worker secrets, or the existing Preview Worker.
- Preserve the existing Preview URL: https://heavix-preview.heavixir.workers.dev
- Continue from this checkpoint; do not restart the source inventory.
