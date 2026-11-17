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


### Historical Cloudflare Preview evidence for the auth branches

- Cloudflare's Preview registry contains a deployed Preview for `integration/heavix-unified` created 2026-11-15 17:28 UTC. Its deployment was created 17:32 UTC from commit annotation `21dc30c`.
- The Preview deployment metadata lists only ASSETS, B2, App/Store database, HEAVIX environment, and backup-control bindings. It does not list Google OAuth, SMTP, Firebase, or other Google-service credential bindings.
- The deployed `fix/email-only-registration-verification-2026-11-14` Preview also has no Google OAuth or SMTP bindings in its deployment metadata. Its latest recorded deployment was 2026-11-14 17:14 UTC.
- The Cloudflare account has only one Worker script, `heavix-preview`; no second Worker script with a separate Google integration was found.
- Therefore the successful six-digit-code experience described by the owner is **not yet tied to a proven Cloudflare Preview deployment or a proven Google provider configuration**. It may have been exercised through a different hosting path, build-time configuration, or a different Google service not represented in the inspected Worker bindings. Do not guess which. Trace the exact test commit, workflow, deployment URL, and service/API before changing provider code or secrets.


### Vercel Preview / Google delivery configuration evidence (2026-11-17)

- Read-only Vercel account inspection identifies one linked project for this repository: `heavix-app` (project ID retained in the Vercel account; do not copy credentials into this report).
- The project's Preview environment-variable metadata includes all four names used by the Google OAuth2/Gmail API implementation: `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN`, and `GMAIL_SENDER_EMAIL`. The entries are branch-scoped to `integration/preview-readiness-workerd-2026-11-15`, and are marked sensitive. Values were not decrypted or read.
- The same branch-scoped Preview metadata includes `HEAVIX_OWNER_EMAIL`. This confirms configuration entries exist for the selected Vercel Preview branch; it does **not** prove the secret values are valid, that a deployment consumed the latest values, or that email delivery succeeds now.
- This Vercel evidence is distinct from the Cloudflare Worker evidence above: the inspected `heavix-preview` Worker does not have those bindings, while Vercel has the corresponding Preview environment-variable entries.
- The four owner-supplied deployment hostnames (`heavix-oqjmixnhm-heavixir-3290.vercel.app`, `heavix-1wd9d0ddt-heavixir-3290.vercel.app`, `heavix-e1zc930zh-heavixir-3290.vercel.app`, `heavix-61tiqrmh9-heavixir-3290.vercel.app`) could not be resolved by the connected Vercel deployment API or protected-deployment fetch. They did not appear in the current project's first page of Preview deployment history. This is an access/history-resolution limitation, not proof that the URLs never existed.
- The connected Vercel project currently exposes only the `heavix-app` project for this team/repository. The latest Vercel Preview deployment records returned by the API are mostly on other branches; no record matching the four supplied hostnames was found in the checked page or selected-branch filter.
- Next verification: trace the four hostnames through Vercel deployment history/aliases and Git commit metadata; identify which exact deployment rendered `/verify-email`; then validate the branch-scoped Google OAuth configuration by a controlled Preview-only registration test. Never retrieve or print decrypted environment-variable values.


### Auth implementation comparison on the selected branch (2026-11-17)

- Read-only source comparison confirms the selected Integration branch still contains the same Google OAuth2 refresh-token flow and Gmail API endpoint as `integration/heavix-unified`; this is not a replacement provider. The four `GMAIL_OAUTH_*` / sender variable names are unchanged.
- The selected branch's email utility additionally has a safe-result wrapper and marks password-reset/change-email messages as sensitive. No provider or credential value was changed.
- The selected registration route improves on the older source: it hashes the six-digit challenge before persistence, creates the user/role/persona/challenge in one transaction, and invalidates the challenge if delivery fails. The selected verification route checks the hashed challenge and consumes it atomically with a conditional update. These security improvements should be preserved; do not copy the older plain-text OTP implementation over them.
- The selected `/verify-email` page is a recovery/resend page: it calls `POST /api/auth/resend-verification` and then `POST /api/auth/verify-email`. It does not prove the exact original registration page used by the owner, but it uses the same email delivery utility.
- The selected resend endpoint is rate-limited at IP level and per-user (60-second throttle), replaces earlier active codes transactionally, hashes the new code, and invalidates it if email delivery fails.
- No test files were found at the two guessed paths `src/lib/__tests__/email.test.ts` or `src/app/api/auth/__tests__/register.test.ts`; this is not proof that the repository has no tests. A repository-wide test inventory is still required.
- Vercel deployment-history queries scoped to the four supplied deployment hosts and to branches `integration/heavix-unified`, `fix/email-only-registration-verification-2026-11-14`, and the selected Integration branch did not return matching deployment records in the queried time window. The exact historical deployment SHA for the owner's successful test remains unresolved.
- Current conclusion: **provider code continuity = confirmed; selected-branch Preview variable-name metadata = confirmed; secret validity / deployment consumption / successful live delivery = unverified; exact historic successful deployment = unresolved.**
- Safe next action is to verify deployment-to-commit identity and run a controlled Preview-only registration test on the intended Vercel deployment. No secrets were decrypted, changed, copied, or redeployed in this step.


### Vercel runtime evidence for registration (read-only, 2026-11-17)

- The Vercel Runtime Errors view returned one registration email-delivery failure on 2026-11-14 16:28:22 UTC, route `POST /api/auth/register`, on deployment ID `dpl_HzfGMungGguSQ2xzdovb2uY3j3zE`. The log message is the application's generic `[register] verification email delivery failed`; it does not reveal whether the cause was OAuth token refresh, Gmail API rejection, network failure, or a different provider path.
- A separate registration error record (first seen 2026-10-26, last 2026-11-14 14:33:41 UTC) shows Prisma rejected `DATABASE_URL` because the value did not begin with `postgresql://` or `postgres://`. This is a distinct database configuration failure, not evidence of an email-provider failure.
- Vercel API lookup for the logged deployment ID returned 404 under the currently connected project/team scope. Runtime error aggregation retains the event, but its deployment details/aliases could not be reopened through the deployment endpoint. The deployment ID is retained here for later owner-side dashboard correlation.
- Vercel runtime-log retrieval for a 7-day window was rejected because this team's current plan does not retain raw runtime logs for that duration. The error-cluster view remains available, but raw request-level evidence for the historical delivery failure is unavailable.
- Operational implication: the code and Preview variable names are present, but at least one historical registration attempt failed at email delivery. Do not describe the previous service as currently healthy solely because environment-variable names exist. The failure cause is not established; verify current secret validity and provider response using a controlled, owner-authorized Preview test with a dedicated test address, without logging OTPs or secrets.
