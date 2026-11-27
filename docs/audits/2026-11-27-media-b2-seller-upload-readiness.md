# Media upload and Backblaze B2 readiness audit

Date: 2026-11-27
Repository: HEAVIXIR/z-ai-2
Base audited: main

## Executive finding

The current canonical media service is filesystem-backed, not Backblaze B2-backed. The current upload UI also defaults to an admin-only endpoint. These are two separate blockers to a production-ready seller listing-media flow.

This document records a source inspection. It does not claim that B2 credentials, bucket configuration, or a live B2 integration were tested.

## Source evidence

### 1. Canonical media persistence is local filesystem

File: `src/lib/media-service.ts`

The module header explicitly describes a filesystem plus JSON sidecar implementation. It imports `node:fs/promises`, derives `UPLOAD_ROOT` from `process.cwd()/public/uploads`, writes image bytes with `fs.writeFile`, and writes metadata to `.meta.json` sidecars.

Consequences:
- Persistence depends on the application host's writable filesystem.
- A deployment with ephemeral or non-shared instances cannot assume uploaded files survive redeploys or are visible to all instances.
- The current implementation is not evidence of Backblaze B2 persistence.

### 2. The reusable uploader defaults to an admin-only route

File: `src/components/admin/MediaUploader.tsx`

The component defaults `endpoint` to `/api/admin/upload`. Its own comments describe the endpoint as admin-only.

File: `src/app/api/admin/upload/route.ts`

POST calls `requireAdmin("media.upload")` before parsing or storing the upload. This is appropriate for admin media management, but it is not a seller authorization contract.

### 3. The admin media API is also explicitly admin-gated

File: `src/app/api/admin/media/route.ts`

GET requires `media.read`; POST requires `media.upload`. It delegates storage to the same filesystem-backed `uploadAsset` service.

## Required implementation before declaring seller media complete

1. Define a seller-scoped upload endpoint. Authenticate the current user and verify ownership/authorization for the target listing on the server; never trust a client-supplied seller or owner ID.
2. Keep admin media endpoints admin-only. Do not weaken `requireAdmin` or broaden admin permissions to make seller uploads work.
3. Implement a storage adapter whose production backend is Backblaze B2 (S3-compatible API), with credentials read only from server-side environment bindings/secrets.
4. Define object-key generation, content-type and size enforcement, image validation/optimization, private/public access policy, and safe URL delivery.
5. Persist metadata and listing association transactionally in the existing database model; inspect the actual Prisma schema before choosing fields or adding migrations.
6. Add compensation/cleanup for partial failures (object uploaded but DB write failed, and vice versa), plus idempotency and audit events.
7. Add tests for unauthenticated requests, non-owner seller, owner seller, admin, invalid image, oversized image, B2 failure, DB failure, orphan cleanup, and successful listing attachment.
8. Verify B2 bucket lifecycle, CORS only if browser-direct uploads are selected, public/private bucket policy, and zero-cost constraints before enabling production traffic.

## Explicit non-actions

- No production deployment or bucket mutation was performed.
- No credentials or secrets were read, changed, or added.
- No database migration was created or run.
- No existing admin authorization was weakened.
- No seller upload endpoint was invented without checking listing ownership and schema contracts.

## Acceptance gate

Do not mark seller listing media or B2 integration complete until an integration test proves that a seller can upload an image only to a listing they own, the object is stored in B2, metadata is persisted, the image can be retrieved under the intended access policy, and failed uploads leave no orphaned object or database record.
