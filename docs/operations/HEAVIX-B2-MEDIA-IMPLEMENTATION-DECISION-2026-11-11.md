# HEAVIX Backblaze B2 media integration decision — 2026-11-11

## Decision

Use the owner-confirmed private Backblaze B2 bucket `heavix-dev-assets` through the B2 S3-Compatible API. Do not use `heavix-db-backups` for media. Do not migrate to Cloudflare R2.

- Endpoint: `https://s3.us-east-005.backblazeb2.com`
- Region: `us-east-005`
- Bucket: `heavix-dev-assets` (full Bucket ID still needs owner confirmation; current known prefix is `356`)
- Access: private; retain current Keep all versions setting unless the owner explicitly approves a lifecycle change.
- Existing backup bucket remains separate and reserved for database backups.

## Why this is a new implementation, not a configuration-only change

The current application media implementation is not a B2 adapter:

- `src/lib/media-service.ts` stores files under local `public/uploads` using `node:fs` and JSON sidecars.
- `src/app/api/admin/upload/route.ts` requires `media.upload` admin permission; the public listing uploader currently calls this admin endpoint, so ordinary sellers cannot use the current upload path.
- `ListingImageUploader.tsx` defaults to 30 images, while `POST /api/listings` silently slices to 10.
- The listing uploader uploads with `entityType=Listing` before a listing ID exists.
- The Prisma schema has `ListingImage` but no dedicated `MediaAsset` model.
- No B2 S3 media adapter, B2 media secrets, or end-to-end B2 upload/readback/delete proof was found in the reviewed current branch. The existing B2 workflow is for database backups and must remain separate.

## Proposed architecture

### 1. Server-only storage adapter

- Add a server-only S3-compatible B2 adapter using the AWS SDK for JavaScript.
- Read credentials only from runtime secrets/environment variables; never expose them to browser bundles or logs.
- Fail closed when required configuration is absent. Do not silently fall back to local filesystem storage in Preview/Worker runtime.
- Keep the existing `media-service.ts` public function contract where practical, but move binary persistence and metadata sidecars to B2.
- Use a single key namespace: `heavix-media/`, with sub-prefixes such as `staging/`, `objects/`, and `proof/`.
- Use random/opaque asset IDs and deterministic object-key mapping; never trust client-provided object keys.

### 2. Private reads and stable URLs

- Keep the B2 bucket private.
- Persist stable internal URLs such as `/api/media/{assetId}` in `ListingImage.url`, not expiring signed URLs.
- The media GET route resolves the asset key server-side and issues a short-lived signed GET redirect only after checking visibility:
  - published listing association → public image read;
  - draft/unpublished listing → owning seller only;
  - admin library → authorized admin only.
- Never return B2 credentials or permanent public object URLs to the browser.
- Use short-lived signed URLs; choose the exact TTL during implementation and test expiry.

### 3. Seller upload and listing finalization

- Add a dedicated authenticated seller upload endpoint; do not reuse `/api/admin/upload` for seller uploads.
- Authenticate before reading the body; enforce CSRF where cookie-authenticated, rate limits, byte limits, image magic-byte validation, safe decode/dimensions, and optimization.
- Seller uploads enter `heavix-media/staging/{userId}/...` and are owned by the authenticated user.
- The upload response returns an opaque asset ID and stable internal media URL.
- Listing creation accepts asset IDs (not arbitrary external URLs), validates each asset belongs to the current seller and is still staged, and then creates `ListingImage` rows with stable internal URLs.
- Admin upload remains protected by the existing admin permission path and uses the same storage adapter.
- Use one shared maximum of 10 listing images in UI and API. The API must reject over-limit input rather than silently truncating it.
- Abandoned staging assets require a cleanup policy that never removes an object referenced by a listing.

### 4. Metadata and versioning

- Keep a JSON metadata sidecar per asset in the same B2 namespace initially; include asset ID, object key, original filename, MIME, size, dimensions, alt text, uploader ID, upload time, and staging/association metadata.
- ListingImage rows remain the authoritative association to a listing. Sidecar association metadata is an index/cache, not the authorization source.
- Because the bucket is configured to Keep all versions, a simple S3 DeleteObject may create a delete marker while older versions remain. Cleanup and proof scripts must enumerate versions and remove only the exact test/staging object versions when permanent cleanup is explicitly intended.
- Do not change bucket lifecycle, retention, or existing object versions without owner approval.

### 5. CORS and browser transfer

- Initial uploads are server-mediated (browser → HEAVIX API → B2); this avoids exposing B2 credentials and does not require browser-to-B2 upload CORS.
- Private images may be displayed through short-lived signed GET URLs. If the implementation later uses browser fetch/canvas or direct presigned PUT, add narrowly scoped CORS rules for the exact Preview/production origins only after confirming the actual origin and API type.
- Do not enable wildcard CORS.

## Dedicated application key — least privilege

Create a **standard** B2 application key, not the master key.

- Restrict bucket access to `heavix-dev-assets` only.
- Restrict file name prefix to `heavix-media/` if the Backblaze UI/API exposes the prefix field.
- Required capabilities for the planned S3 operations:
  - `listFiles` — ListObjectsV2 / ListObjectVersions for the media prefix.
  - `readFiles` — GetObject / HeadObject.
  - `writeFiles` — PutObject and DeleteObject by object name.
  - `deleteFiles` — delete a specific object version; Backblaze documents that DeleteObject by name needs writeFiles and deleting a specific version needs deleteFiles.
- Do not grant bucket creation/deletion, bucket configuration, key management, all-bucket administration, or account-wide access.
- Avoid the S3 List Buckets operation in the application. Backblaze documents that bucket-restricted S3 keys need `listAllBucketNames` for List Buckets; the application already knows the exact bucket name and should not need that capability.
- Do not share the Application Key secret in chat. The key secret is shown only when created; save it directly into the secure runtime secret store.
- Do not use or reuse the DB-backup workflow's credentials for media.

Official Backblaze references:
- Application key capabilities: https://www.backblaze.com/docs/cloud-storage-application-key-capabilities
- Application keys and bucket/prefix restrictions: https://www.backblaze.com/docs/cloud-storage-application-keys
- S3-compatible app-key capabilities and DeleteObject permissions: https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys
- S3-compatible API and presigned URLs: https://www.backblaze.com/docs/cloud-storage-s3-compatible-api
- Private/public bucket access controls: https://www.backblaze.com/docs/cloud-storage-buckets

## Required proof before enabling live media

1. Unit tests with a mocked B2 adapter for upload, metadata, list, signed read, ownership, attach, delete, and fail-closed configuration.
2. Seller security tests: unauthenticated rejected, cross-seller asset ID rejected, wrong MIME/magic bytes rejected, oversized image rejected, rate-limit enforced, admin route remains admin-only.
3. Listing contract tests: 10 images accepted, 11 rejected, staged assets finalized only by their owner, stable media URLs reload after listing creation.
4. Local/non-production B2 proof using a unique random object under `heavix-media/proof/`: upload, read back, compare SHA-256, list, delete the exact version, verify no live object remains. Do not touch existing files.
5. Only after the proof passes and Preview App/Store DB identities are independently established, run the authorized Preview-only application integration test. No Production, DNS, stable Worker, or Production DB changes.

## Owner-supplied non-secret setup data needed

Before configuring the runtime, obtain only:
- Backblaze Account ID (non-secret);
- full Bucket ID for `heavix-dev-assets` (non-secret);
- the new application key's display name and confirmation of its bucket/prefix/capability scope;
- confirmation that the key and secret have been stored securely in the intended Preview/local secret store.

Never request the Application Key secret in chat. The Application Key ID can also be configured directly into the secret store; it need not be sent here.

## Current status

- Architecture decision recorded; no B2 key created or configured by this commit.
- No B2 upload/read/delete proof exists yet.
- Seller upload remains blocked on implementation of the dedicated B2 adapter/endpoint and the non-secret owner setup data.
- No database schema migration, deployment, bucket mutation, or object mutation was performed.

## Owner key provisioning update — 2026-11-11

The owner reports creating a standard application key named `heavix-dev-assets-media-preview` for bucket name `heavix-dev-assets`, with file prefix `heavix-media/`, no expiry, and these reported capabilities:
`deleteFiles, listBuckets, listFiles, readBucketEncryption, readBucketLifecycleRules, readBucketLogging, readBucketNotifications, readBucketReplications, readBuckets, readFiles, shareFiles, writeBucketEncryption, writeBucketLifecycleRules, writeBucketLogging, writeBucketNotifications, writeBucketReplications, writeBuckets, writeFiles`.

No secret key was shared in chat. Do not store or log any secret.

### Security status — OWNER-CONFIRMED PLAN LIMITATION; CONDITIONAL ACCEPTANCE

The owner has clarified that the current Backblaze web-console plan/UI does not expose granular capability selection and issues the full capability set shown above. This is a known constraint already encountered during the HEAVIX database-backup setup. Do not ask the owner to recreate the key with fewer capabilities or edit the existing key; Backblaze application-key capabilities are immutable after creation.

- Accept the owner-provisioned key as the available credential option, subject to verifying that its resource restrictions are set to the exact `heavix-dev-assets` bucket and `namePrefix=heavix-media/`.
- The capability list is broad, but Backblaze documents bucket and prefix restrictions as separate enforced controls. A bucket restriction limits access to the selected bucket(s), and a prefix restriction limits file operations to matching object names.
- The current HEAVIX application must use only object-level operations under `heavix-media/`; do not call bucket administration APIs (bucket create/delete/configuration, lifecycle, encryption, logging, notifications, replication), account-wide bucket enumeration, or key-management APIs.
- Do not reuse the media credential for DB backups or any other workload. Keep it server-side only; never expose it to browser/client bundles.
- The key ID is non-secret metadata. The application secret remains only in the owner's secure secret manager/local environment.
- No live credential test has been run yet. The key is accepted as a plan-constrained option, but operational scope must be verified before configuration.

### Runtime containment controls

1. Confirm the key's Backblaze "Allow Access to Bucket(s)" setting is the single exact `heavix-dev-assets` bucket, not `All`.
2. Confirm the object name prefix is exactly `heavix-media/`.
3. Configure only server-side environment variables for the S3-compatible endpoint `https://s3.us-east-005.backblazeb2.com`, region `us-east-005`, bucket name, key ID and secret.
4. Hard-code the expected bucket and prefix in server-side configuration; reject any requested object key outside the prefix.
5. Do not expose bucket-management routes or let user input choose bucket names, endpoints, prefixes or credentials.
6. Test with a random object strictly inside `heavix-media/`: upload, read back, compare SHA-256, delete, then verify absence. No bucket configuration operation is part of this proof.
7. Log operation type and opaque object identifier only; never log credentials, authorization headers or signed secrets.
8. If bucket-scope verification fails, do not run the live proof; retain mock-adapter tests and request the one missing non-secret setting confirmation.

References:
- https://www.backblaze.com/docs/cloud-storage-application-keys
- https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys
- https://backblaze-prod.us.document360.io/apidocs/b2-create-key
