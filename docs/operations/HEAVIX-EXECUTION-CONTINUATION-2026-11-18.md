# HEAVIX execution continuation — 2026-11-18

> Evidence-led handoff. This report records repository and workflow findings; it does not declare the product complete or authorize Production changes.

## Scope and governing documents reviewed

Repository: `HEAVIXIR/z-ai-2`  
Selected integration branch: `integration/preview-readiness-workerd-2026-11-15`  
Primary Preview acceptance URL: https://heavix-preview.heavixir.workers.dev

Read the mandatory continuation protocol, current-state checkpoint, capability reconciliation, legacy archive provenance, taxonomy source reconciliation, Preview seed runbook, Cloudflare build/quota policy, CI/Preview binding audit, project principles, architecture overview, integration plan, and legacy-to-current inventory. The continuation protocol is authoritative for branch and release safety.

## Current confirmed project constraints

- Continue only on the selected Integration branch; do not restart on the recovery or infra branch.
- Do not deploy Production, change DNS, replace the stable Preview Worker, or change secrets.
- No migration, seed, destructive action, or database write until App and Store Preview identity gates and the reviewed operation are satisfied.
- Protect the Cloudflare monthly build quota. Consolidate validation; do not use Cloudflare Builds as a debugging loop.
- No secret values, credentials, personal data, or database URLs may be copied into docs, logs, PRs, or chat.
- Security architecture remains Zero Trust, Argon2id/bcrypt password storage, cryptographically secure sessions, RBAC, audit, rate limiting, tenant/ownership checks, and fail-closed authorization. Do not replace password hashing with a weaker or unreviewed scheme merely to work around CPU constraints.
- Product owner planning assumptions: 50,000 registered accounts in the first six months and 500 concurrent users. These are design/acceptance targets, not measured load-test results or a promise of unlimited capacity on free tiers.

## GitHub issues, PRs, and workflow evidence

### Issue #337 — Preview catalog bootstrap blocked

Issue remains open. Its observed Preview snapshot records 16 flat root categories and empty category children, transaction types, service types, application industries, attributes, and category-attribute links. The listing wizard requires an active transaction type, so a listing cannot be completed with that data state.

The issue's required sequence remains:
1. Prove exact App and Store Preview database identities independently.
2. Reconcile canonical category, brand, attribute, service, and transaction sources.
3. Confirm the required migration history on the verified Preview targets.
4. Obtain explicit authorization for the reviewed additive seed sequence.
5. Run database verification and read-only API smoke tests, then authenticated listing-wizard acceptance.

The taxonomy source report records 622 source records and 531 unique candidate slugs, with 54 combined path/layer/domain conflicts. These conflicts must be resolved before any canonical seed. Historical counts (including 539-category and 629-brand snapshots) are not interchangeable with current source counts.

### PR #340 — Integration validation vehicle

PR #340 is Draft/open, targets `main`, and is not merged. Its purpose is exact-head CI validation only. It does not authorize a merge, database migration/seed, Production change, or Cloudflare Workers Build connection. The PR description records that Workers Builds were disconnected to prevent automatic builds; branch Preview workflows are a separate mechanism.

### Integration Preview workflow #44187433734

GitHub Actions run #44187433734 completed successfully. Its `build-and-preview` job passed all steps:
- exact Integration commit checkout and branch check;
- dependency installation and both Prisma client generation;
- OpenNext build using the repository's recorded HEAVIX build profile;
- deployment to the isolated Integration Worker Preview only;
- Preview response verification.

This proves that this workflow produced and deployed an Integration Preview artifact. It does not prove Production readiness, stable Preview Worker replacement approval, database identity equivalence with the stable Worker, full feature acceptance, or migration/seed readiness.

### Earlier stable Preview identity checkpoint

The prior machine-readable checkpoint records the canonical `heavix-preview` Worker rejected the configured expected App and Store database OIDs (both reported actual database OID 5; secret values were not read). Do not treat a healthy isolated branch Preview as proof that the canonical Worker is correctly bound. Re-run safe, read-only identity diagnostics before any stable Worker action.

## Capability reconciliation findings

### Registration and email verification

The historical `integration/heavix-unified` source includes a six-digit email verification flow with ten-minute expiry and Google OAuth2-backed Gmail API delivery. It names these configuration bindings:
- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_REFRESH_TOKEN`
- `GMAIL_SENDER_EMAIL`

The selected Preview's historical audit reports that these bindings are absent. This is a configuration blocker, not evidence that the code path is missing. Reconcile the exact source implementation, callback/origin rules, secret binding names, tests, and historical successful deployment metadata. Never copy values or substitute guessed SMTP configuration.

### Marketplace and Store scraper

The capability reconciliation identifies two regressions on the selected branch:
- Commit `bf4293f5c6919a7ff9477606f7bd3ec1bcf60aab` added an unconditional 503 early return to `src/app/api/admin/ai-scraper/route.ts`.
- Commit `70c3846969b7e89e6ade93e2573f6a220b600a52` replaced the full Marketplace and Store scraper implementations with fail-closed handlers.

A fuller Marketplace implementation exists on `fix/admin-ai-scraper-hardening-2026-11-15`, including URL allowlisting, safe fetch, timeout/cancellation, extraction, listing-draft import, audit, and `ai.scraper.execute` authorization. Store scraper recovery must be audited independently. The provider-backed path must remain disabled unless its free/no-paid execution mode is proven and explicitly configured. Restore safe retrieval/review/manual import first; never silently trigger paid provider calls.

### Homepage and full product parity

The continuation protocol requires restoring the full 17-section homepage composition with current components and current data contracts, retaining PageRenderer/PageBuilder for custom pages. A five-widget fallback or incomplete saved HOME layout must not suppress the product homepage. Public GET requests must remain read-only. Route/file presence is not end-to-end acceptance.

### Database/runtime and build

The selected branch contains the current request-scoped Prisma Worker runtime and OpenNext/Workerd proof work. Older infra PR #191 is closed as superseded; do not merge that branch. The Cloudflare build policy records a constrained monthly allowance and an exact previously successful build profile. Prefer GitHub Actions CI and isolated Integration Preview for code validation; do not initiate speculative Cloudflare Builds.

## Next execution order

1. Read current Integration HEAD and exact-head CI results; reconcile with the checkpoint rather than assuming older SHA references are current.
2. Keep the isolated Integration Preview separate from the canonical `heavix-preview` Worker. Capture root, login, admin, health, taxonomy, transaction types, attributes, services, and listing-wizard acceptance results with timestamps and HTTP status.
3. Investigate the canonical Preview App/Store OID mismatch with read-only checks only. Compare secret binding names and non-secret identity evidence; never print values.
4. Reconcile the historical Gmail OAuth2 implementation and its exact required configuration names. Keep the auth branch candidate unmerged until tests and Preview configuration are proven.
5. Recover Marketplace and Store scraper behavior from the named source branches, file-by-file, preserving permission checks, allowlists, timeouts, review-before-import, audit, quotas, and no-paid-provider constraints.
6. Resolve taxonomy conflicts using source provenance and the governing V1.1 reference. Do not seed until database identity, migration history, canonical source decisions, backup evidence, and explicit operation gates all pass.
7. Update this report, the current-state checkpoint, and append-only worklog after each verified change.

## Actions not performed in this report

No Production deployment, DNS change, stable Worker replacement, secret read/write, database connection, migration, seed, data mutation, paid AI/scraper call, or PR merge was performed.


## 2026-11-18 isolated Integration Preview read-only route acceptance

Tested with cache bypass/read-only retrieval against:
`https://integration-preview-readiness-workerd-2026-11-15-heavix-preview.heavixir.workers.dev`

| Route | HTTP | Observation |
|---|---:|---|
| `/` | 200 | Persian HEAVIX homepage rendered with navigation, category and brand selections, service/featured sections and listing links |
| `/login` | 200 | Login form and verification/recovery links rendered |
| `/admin` | 200 | Anonymous request received the login surface; no admin content exposed |
| `/api/health` | 200 | `db=up`, `storeDb=up` |
| `/api/taxonomy` | 200 | Root categories returned, but child arrays empty |
| `/api/transaction-types` | 200 | `types=[]` |
| `/api/service-types` | 200 | `types=[]` |
| `/api/attributes?category=excavator` | 200 | `attributes=[]` |
| `/api/services?limit=50` | 200 | Service records returned |

Interpretation: the two database connections are reachable in this isolated Integration Preview, but a healthy connection is not equivalent to a correctly bootstrapped product catalog. The listing wizard remains blocked by empty transaction types and attributes. The anonymous Admin response confirms the login gate only; successful owner authentication and post-login RBAC were not tested.

No authenticated login, registration, email send, listing submission, database write, seed, migration or paid provider call was attempted.


## Additional source-code inspection — scraper routes on the selected branch

The selected Integration branch is more advanced than the initial commit-level regression summary alone suggests. Current route files were fetched and inspected directly:

- Marketplace route `src/app/api/admin/ai-scraper/route.ts` contains the full search/scrape/import/bulk-import flow, URL allowlisting, server-side re-fetch before import, pending listing creation, audit, CSRF, permission checks, AI gateway preflight, timeout and cost logging. It is not a permanently replaced 503 stub in the currently selected branch snapshot.
- Marketplace execution is nevertheless blocked unless `HEAVIX_AI_SCRAPER_ENABLED=true`; this gate returns HTTP 503 before AI preflight. The implementation calls `ZAI.create()` and provider web search/LLM extraction, so enabling this path without proving a no-cost provider and quota would violate the owner's zero-cost constraint.
- Store route `src/app/api/admin/store/ai-scraper/route.ts` contains search, extraction, single import and bulk import. Provider discovery is gated by `HEAVIX_STORE_SCRAPER_ENABLED=true` and an explicit source-host allowlist. Manager-reviewed manual import actions are intentionally allowed when provider discovery is disabled; however, the current path still passes through AI policy preflight, so it needs a code/test review to prove that manual import cannot reserve or consume paid AI budget.
- Marketplace legacy synthetic `action` endpoints return 410; supported real-source `mode` endpoints are used instead.
- The historical registration route confirms six-digit EMAIL verification with a 10-minute expiry, bcrypt hashing, public role forced to BUYER, and a canonical UserRole(BUYER) row. Email delivery failure is reported without returning the OTP. The Gmail API code path is present in `src/lib/email.ts`, but delivery remains unverified until the correct secret bindings are configured securely.

### Required scraper remediation decision

Do not simply set either scraper enable flag. First separate no-cost deterministic/manual workflows from provider-backed discovery:
1. Keep provider-backed discovery disabled unless an explicitly free provider, rate limits, data rights, and quotas are proven.
2. Ensure manual source URL import uses the allowlisted safe fetch path, server-side extraction/validation, pending review, audit, and no AI preflight/cost reservation.
3. For Store manual import, add tests proving no AI budget/cost is reserved and the manager permission is mandatory.
4. For Marketplace, provide a manual import path that does not instantiate ZAI or invoke provider web search/LLM; preserve server-side safe fetch and pending review.
5. Add tests for disabled-provider behavior, host allowlist, redirects/DNS pinning, timeout, max bulk size, duplicate detection, no direct publication, audit actor and no paid calls.

These are code-level requirements; no scraper endpoint was invoked during this inspection.
