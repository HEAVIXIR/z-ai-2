# HEAVIX — Execution Checkpoint
## 2026-11-23 · Manual entry, AI spend guard, Integration runtime and Store Part media

**Repository:** `HEAVIXIR/z-ai-2`  
**Branch:** `integration/preview-readiness-workerd-2026-11-15`  
**Tracking PR:** [#340](https://github.com/HEAVIXIR/z-ai-2/pull/340) — Draft/Open  
**Verified code head:** `886058ca0953110e218c656e2afdd4c4b28f3912`  
**Base `main` SHA:** `87216262b7ad5ab77049f8a65930321d3993df3c`

## 1. What was actually found

The prior checkpoint listed the no-ZAI manual Marketplace path and Store manual-entry UI as missing. A direct read of the current Integration branch showed that both already exist:
- The admin manual Marketplace listing UI/API is separate from provider-backed scraping.
- Store Parts Admin already has a manual create/edit form and POST API; a source URL is not required.
- The Store Parts Admin form still has no image upload UI.

No duplicate manual-entry page or endpoint was created.

## 2. Changes made

### Store manual part API hardening

`POST /api/admin/store/parts` now enforces:
- 512 KiB bounded request body;
- required and length-bounded fields;
- optional, HTTP(S)-validated `sourceUrl`;
- existing category and active brand;
- nonnegative finite price and bounded integer stock/threshold;
- bounded image/compatible-car arrays and strict booleans;
- duplicate SKU as HTTP 409;
- audit metadata and generic server errors.

Added handler-level security tests for manual create without source URL, contact-for-price, category/brand checks, malformed numbers, oversized requests, duplicate SKU, RBAC, CSRF, audit and no AI gateway dependency.

### Zero-spend SCRAPER control

- Seed default: SCRAPER inactive, `costCeilingUsd=0`.
- Runtime: `HEAVIX_AI_SCRAPER_ENABLED=true` is required before policy lookup; an active DB policy with positive budget is also required.
- The check runs before quota/global-budget reservation.
- `.env.example` sets the flag to false.
- Manual Marketplace and Store entry remain independent of the AI provider.

### Store Part B2 media lifecycle

Implemented on the Integration branch:
- POST /api/admin/store/parts/media is an admin-only private B2 staging endpoint; it requires store.manage, CSRF, upload rate limiting and bounded file validation.
- Part create/update accepts stable /api/media/{assetId} references, validates staged-asset ownership, and attaches staged media only after the Part row exists.
- POST /api/admin/store/parts/[id]/media retries failed attachment.
- POST /api/admin/store/parts/media/cleanup cleans stale staged or unreferenced Part media.
- GET /api/media/[id] makes Part media public only for an attached asset referenced by an active Part; inactive Part media stays permission-gated.
- Store Parts Admin create/edit now has an image uploader, previews, remove controls, retry and cleanup actions.
- Part deletion removes the database row before B2 cleanup; if object cleanup fails, the media remains non-addressable and can be retried.
- No Prisma schema change or migration was added.

## 3. Verification evidence

| Gate | Result | Evidence |
|---|---|---|
| Exact-head CI #4754 | PASS | https://github.com/HEAVIXIR/z-ai-2/actions/runs/45145879836 |
| OpenNext real-route Workerd #1384 | PASS | https://github.com/HEAVIXIR/z-ai-2/actions/runs/45145889150 |
| Isolated Integration Preview #219 | PASS | https://github.com/HEAVIXIR/z-ai-2/actions/runs/45145041433 |

Exact-head CI on 4a2689c06c5b08df87156954e3b7c890243b0be6 passed:
- typecheck and lint;
- security, Integration, contract and Unit tests;
- E2E smoke tests;
- PostgreSQL fresh-migration and existing-schema adoption proofs on disposable databases;
- production build and real Next.js server HTTP integration;
- Docker image, Caddy syntax, docker-compose validation and real Caddy-to-app connectivity;
- phase tests, audit transaction, TLS and Workerd runtime smoke.

OpenNext real-route smoke passed. Integration Preview root and health returned HTTP 200; App DB and Store DB both reported up; taxonomy contract returned 14 roots, 6 transaction types, 9 service types, 16 industries and nested machinery categories.

Preview URL: https://integration-preview-readiness-workerd-2026-11-15-heavix-preview.heavixir.workers.dev/admin/store/parts

The Preview run used runtime code commit 9dc2d7d; the later 4a2689c commit only corrected a test fixture. No real project DB migration/seed/write or live B2 object write occurred.
## 4. Media audit correction

- media-service.ts continues to use the Backblaze B2 adapter; no local filesystem media fallback was introduced.
- Seller ListingImageUploader continues to use /api/media/staging.
- Store Parts now uses its own admin-only B2 staging and attachment lifecycle; it does not reuse the Marketplace seller upload permission.
- Current Cloudflare Worker script heavix-preview has B2_KEY_ID and B2_APPLICATION_KEY secret bindings. Read-only inspection confirmed non-secret settings: bucket heavix-dev-assets, prefix heavix-media/, region us-east-005 and endpoint s3.us-east-005.backblazeb2.com. Secret values were not read.
- Current Worker binding presence is verified; actual upload/read-back/SHA-256/delete object I/O on this head is still not verified.
- The B2 key's bucket selector still needs owner confirmation: it must be restricted to the single heavix-dev-assets bucket, not All. The owner-reported broad capability set is accepted as a Backblaze plan limitation; do not ask the owner to recreate a reduced-capability key.
## 5. What remains blocked or unverified

- Current-head live B2 object I/O; no upload/read-back/delete was performed.
- Owner confirmation that the existing B2 key's Allow Access to Bucket(s) selector is the single heavix-dev-assets bucket (not All); prefix is heavix-media/.
- Authenticated Admin browser acceptance of the Store Part image uploader, retry, removal and inactive/public visibility.
- Canonical Preview App/Store database OID mismatch.
- WANTED/BuyRequest schema work and P0 Issue #345, which require a separate schema/data-impact plan and explicit identity/backup approval.
- Full Brand Management Center consolidation beyond shared navigation, including family editing, canonical BrandDisplay, trusted-brand settings, Step 1 WANTED and Step 3 searchable brand selection.
- ZAI credentials/provider use remain unconfigured; SCRAPER stays disabled by default.
## 6. Safety

PR #340 remains Draft/Open and unmerged. main, Production, DNS and canonical Preview secrets were not changed. No real DB migration/seed/write, no live B2 object write, no AI provider call, and no bucket configuration change were performed. CI database migration/backup proofs used disposable databases only. B2 secret values were not read or logged.
## 7. Next execution sequence

1. Obtain owner confirmation that the B2 key's Allow Access to Bucket(s) selector is the single heavix-dev-assets bucket, not All; the prefix must remain heavix-media/. Do not request or share secret values.
2. After confirmation, adapt the protected B2 proof workflow to the Integration branch and run the random-object upload/read-back/SHA-256/delete/post-delete non-addressability proof against us-east-005, strictly under heavix-media/proof/.
3. Complete authenticated Admin browser acceptance for Store Part upload, retry, removal and active/inactive visibility.
4. After the Store Part media topic is closed, continue the previously requested 17-module homepage parity comparison against the older reference.
5. Then return to the unified global Brand registry, family management, trusted-brand display settings, Step 1 WANTED and Step 3 searchable brand selector; preserve existing brand/family data.
6. Keep canonical Preview OID correction and WANTED/BuyRequest schema work behind separate identity, backup/restore and explicit owner-approval gates.
7. Keep PR #340 Draft/Open and main/Production untouched until the remaining runtime and release gates pass.
