# HEAVIX capability reconciliation — 2026-11-17

> Living audit. This is a source/branch reconciliation record, not a declaration that every feature is operational. Update it after each verified transfer and test. Do not infer runtime success from file presence.

## Frozen target

- Repository: HEAVIXIR/z-ai-2
- Target branch: integration/preview-readiness-workerd-2026-11-15
- Baseline HEAD at audit start: 16e45c6ac2a31777e1a5e6ee344d39fa5f329452
- PR #340 remains Draft/open and targets main. Do not merge it as part of feature reconciliation.
- All integration changes must land on the target branch, with source provenance, tests, and exact-SHA CI evidence.

## User-confirmed requirements

1. Recover the exact Google-backed registration/verification service that previously delivered a six-digit code and allowed successful registration and Admin-panel access. Preserve its API integration, configuration names, secret bindings, callback/origin settings, and related tests. Do not replace it with a guessed SMTP/Gmail configuration.
2. Restore the full Marketplace and Store scraper workflows: search/discovery, safe page retrieval, extraction, preview/review, single import, bulk import, images/media handling, audit, and authorization.
3. Reconcile every capability and its dependencies from all relevant feature, fix, security, integration, and recovery branches. Preserve the newest compatible implementation, not merely the branch with the most files.
4. Do not ask the owner to re-list capabilities already recorded in repository history. Never copy secret values into source, reports, PR comments, or chat.

## Verified initial findings

### Google-backed registration / six-digit verification

- The branch `integration/heavix-unified` contains a registration flow that creates a six-digit EMAIL verification code with a ten-minute expiry, persists it, sends it, and exposes a verify-email flow.
- Its `src/lib/email.ts` includes a Google OAuth2 token exchange at `https://oauth2.googleapis.com/token` and a send request to `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`. The code therefore identifies a Google OAuth2-backed Gmail API delivery implementation. This is a source-code observation; it is not yet proof that this is the exact Google Cloud service/configuration used in the owner's successful test.
- The associated environment names in that implementation are `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN`, and `GMAIL_SENDER_EMAIL`. SMTP fallback names also exist. No secret values belong in this report.
- The selected Preview Worker currently has none of these Google OAuth or SMTP bindings. This explains why the selected Preview's current email-recovery path fails closed, but does not by itself identify the historical provider configuration used in the successful test.
- Relevant branch sources: `integration/heavix-unified`, `fix/auth-csrf-otp-hardening-2026-11-14`, `fix/auth-owner-bootstrap-preview-guard-2026-11-14`, `fix/email-only-registration-verification-2026-11-14`, `fix/auth-entry-and-password-recovery-2026-11-15`, `security/csprng-auth-verification-codes`.
- The auth branches are divergent from the selected branch. They must be reconciled by file/behavior and tests; do not merge a whole stale branch blindly.
- Required verification: inspect historical Preview/Worker versions and secret-binding *names only*, identify the exact Google API/service from source and deployment metadata, compare the historical tested commit with current selected code, then provision the same configuration securely in Preview without exposing values.

### Scraper — critical regression introduced on 2026-11-16

- The selected branch has Marketplace scraper code and a Store scraper route.
- Commit `bf4293f5c6919a7ff9477606f7bd3ec1bcf60aab`, message `Disable paid AI scraper execution under free-infrastructure policy`, inserted an unconditional early HTTP 503 return into `src/app/api/admin/ai-scraper/route.ts`. This prevents the provider-backed workflow from running.
- Commit `70c3846969b7e89e6ade93e2573f6a220b600a52`, message `fix(security): disable paid scrapers and enforce navigation RBAC`, reduced the Marketplace scraper route from a full implementation to a short fail-closed handler. The same change removed the full Store scraper implementation and replaced it with a short handler.
- Later commits `8d4869a3a8f09b045a548945e193b88b6f5b6fc8`, `878e648c5d434bd06d05e2894dbedcffbc64300d`, and `fa3d8d2cd7a4ab3706ee67505add5115130dfde1` restored/preserved manual import and gateway/audit structure but retained the provider-backed scraper block.
- The source branch `fix/admin-ai-scraper-hardening-2026-11-15` contains the fuller Marketplace implementation, including `safe-source-fetch`, URL allowlisting, timeout/cancellation, extraction, listing draft import, audit and `ai.scraper.execute` permission checks. It is a candidate source, not an automatically safe whole-branch merge.
- The Store scraper implementation also exists in the earlier source history and must be recovered independently; Marketplace scraper parity does not prove Store scraper parity.
- The hard-coded global disable must not remain as the product's permanent behavior. Provider execution must be restored behind explicit configuration, permission, input/source validation, timeout, audit and budget controls. The existing free-infrastructure/no-paid-consumption restriction remains in force until provider cost/quota is explicitly established; do not silently trigger paid calls.

## Initial branch candidates (not exhaustive)

- Auth/verification: `integration/heavix-unified`, `fix/auth-entry-and-password-recovery-2026-11-15`, `fix/auth-csrf-otp-hardening-2026-11-14`, `fix/auth-owner-bootstrap-preview-guard-2026-11-14`, `fix/email-only-registration-verification-2026-11-14`, `security/csprng-auth-verification-codes`.
- Marketplace/Store scraper: `fix/admin-ai-scraper-hardening-2026-11-15`, `fix/admin-ai-scraper-listing-review-2026-11-15`, `feature/ai-gateway-timeout-and-scraper`, `integration/heavix-unified`.
- Listing/catalog: `feat/listing-wizard-end-to-end-2026-11-14`, `fix/listing-persistence-integrity-2026-11-14`, `fix/listing-attributes-atomic-2026-11-14`, `fix/taxonomy-admin-create-flow-2026-11-14`, `fix/taxonomy-seed-safety-2026-11-14`.
- Identity/marketplace: `feat/identity-organization-core-2026-11-14`, `feat/industrial-marketplace-identity-standard-2026-11-14`.
- Store: `integration/store-inventory-stack-2026-11-07` and the Store atomicity, inventory, procurement, return, payment, transfer and audit branches.
- Runtime/deployment: `integration/cloudflare-preview-r45-auth-2026-11-08`, `infra/cloudflare-opennext-build-recovery`, and the current selected Integration branch.

## Required capability inventory schema

Each capability must be classified separately across code, data, APIs, UI, permissions, tests, configuration/secrets, observability and Preview behavior:

- `INTEGRATED_VERIFIED`: code + dependencies + tests + Preview behavior verified.
- `INTEGRATED_CODE_ONLY`: code is present; runtime behavior not yet proven.
- `PARTIAL`: one or more required layers or subflows are absent.
- `SUPERSEDED`: newer compatible implementation replaces it; provenance retained.
- `MISSING`: capability is not present in the selected branch.
- `BLOCKED_CONFIG`: code exists but required secret/binding/provider/configuration is absent.
- `BLOCKED_COST`: execution depends on unapproved paid consumption or unknown quota.
- `BLOCKED_DATA`: migration/catalog/isolated-DB preconditions are not satisfied.
- `REJECTED_WITH_REASON`: unsafe, obsolete, duplicate, or incompatible implementation with an explicit evidence-backed reason.

For each row record: domain, capability, source branch + source SHA, source commit/PR, target path(s), target SHA(s), migration/data dependency, secret *names* (never values), API contract, UI entry point, permission keys, tests, Preview evidence, decision, and next action.

## Merge and safety policy

- Integrate only into `integration/preview-readiness-workerd-2026-11-15`; do not create extra branches unless separately approved.
- Never merge stale branches wholesale. Prefer minimal, reviewed, behavior-preserving changes with tests.
- Preserve RBAC, CSRF, ownership, audit, rate limits, source allowlists, timeout/cancellation, idempotency and data provenance.
- No Production deployment, Production DB operations, DNS changes, destructive DB operations, seed/migration writes, or bypassing branch protections.
- No secret values in Git, logs, artifacts, PR comments, or chat. Configuration is transferred by secret *name and secure provisioning process*, not by copying values into code.
- No paid provider execution until provider identity, billing/quota behavior and the approved budget are established.
- PR #340 stays Draft/open until Preview acceptance and all release gates are met.

## Audit progress

- [x] Confirm selected branch HEAD and PR #340 status.
- [x] Identify Google OAuth-backed six-digit email verification implementation in historical integration branch.
- [x] Identify missing Google/SMTP bindings on current Preview Worker from prior read-only settings inspection.
- [x] Identify commits that unconditionally disabled Marketplace and Store provider-backed scraping.
- [x] Identify fuller Marketplace scraper source branch and its security/test dependencies.
- [ ] Identify exact Google Cloud service and exact historical tested commit/configuration from deployment/version evidence.
- [ ] Reconcile all candidate branches and all feature domains against selected branch (file + behavior + tests).
- [ ] Recover Store scraper end-to-end implementation and verify its dependency/configuration contract.
- [ ] Remove permanent global scraper disable while preserving security, timeout, audit and budget controls.
- [ ] Reconcile and provision required Preview secret/binding names securely.
- [ ] Run targeted auth/scraper tests and full CI on exact selected SHA.
- [ ] Verify successful Preview registration, six-digit delivery, verification, login, Admin/RBAC and both scraper workflows.
- [ ] Update this matrix with exact evidence and remaining blockers.
