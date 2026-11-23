# HEAVIX — Execution Checkpoint
## 2026-11-23 · Manual entry, AI spend guard and Integration runtime

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

## 3. Verification evidence

| Gate | Result | Evidence |
|---|---|---|
| Exact-head CI | <badge color="success">PASS</badge> | [Run #4734](https://github.com/HEAVIXIR/z-ai-2/actions/runs/45139405587) |
| OpenNext real-route Workerd | <badge color="success">PASS</badge> | [Run #1364](https://github.com/HEAVIXIR/z-ai-2/actions/runs/45139413139) |
| Isolated Integration Preview | <badge color="success">PASS</badge> | [Run #211](https://github.com/HEAVIXIR/z-ai-2/actions/runs/45139405586) |

Integration Preview acceptance:
- root HTTP 200;
- `/api/health` HTTP 200 after two attempts;
- App DB and Store DB both report up;
- taxonomy API and excavator detail HTTP 200.

Preview URL: https://integration-preview-readiness-workerd-2026-11-15-heavix-preview.heavixir.workers.dev

CI migration, seed and backup proofs ran against disposable test databases. No real project database was migrated, seeded or written.

## 4. Media audit correction

The current code no longer matches the older local-filesystem media audit:
- `media-service.ts` uses the Backblaze B2 adapter; no local filesystem fallback was found.
- Seller `ListingImageUploader` uses `/api/media/staging`, not `/api/admin/upload`.
- Listing creation enforces the plan-specific image count and rejects over-limit requests rather than silently truncating.
- Current-head live B2 runtime binding and object I/O are still unverified; the existing B2 proof belongs to an older commit.
- Store Part image UI/attachment/public visibility is not implemented.

## 5. What remains blocked or unverified

- Current Worker B2 credentials/binding and upload/read/delete on the live Integration Worker.
- Seller browser upload/attach/delete and authenticated Admin/Seller acceptance.
- Store Part image lifecycle.
- Canonical Preview App/Store database OID mismatch.
- WANTED/BuyRequest schema work pending separate backup/identity approval.
- Full Brand Management Center consolidation beyond the shared navigation.
- ZAI credentials and provider use remain unconfigured; SCRAPER is disabled by default.

## 6. Safety

PR #340 remains Draft/Open and unmerged. `main`, Production, DNS and canonical Preview secrets were not changed. No real DB migration/seed/write, B2 object write, or paid AI provider call was performed.

## 7. Next execution sequence

1. Build a Store Part B2 media lifecycle: private staged upload, attach only after Part creation, public reads only for attached assets of active Parts, cleanup/retry, audit, Admin UI and tests.
2. Verify B2 runtime binding and least-privilege key scope with the owner without exposing secret values; then run a protected upload/read-back/SHA-256/delete proof.
3. Keep canonical Preview OID correction behind explicit owner approval and paired backup/restore proof.
4. Plan WANTED/BuyRequest persistence before any schema migration.
5. Continue Brand Management Center functional consolidation without duplicating or deleting existing brand/family data.
6. Keep AI scraping disabled until credentials, runtime opt-in and positive DB budget are explicitly authorized.
