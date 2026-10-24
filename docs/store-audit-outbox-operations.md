# Store Audit Outbox — Operations

## Delivery contract

- Store mutations and their AuditOutbox records commit in the same Store PostgreSQL transaction.
- The worker delivers to the main PostgreSQL AuditLog table.
- AuditLog.idempotencyKey is unique. The worker uses the Outbox row ID as that key and uses createMany(skipDuplicates: true) so a retry after a partial success cannot create a second audit event.
- Worker claims use a conditional update (PENDING → PROCESSING). A stale processing lease is reclaimable after five minutes.
- Failed delivery attempts remain retryable until maxAttempts; exhausted or malformed rows become FAILED and must be investigated, not deleted.

## Required GitHub configuration

Configure these on the repository before relying on scheduled delivery:

1. Repository variable HEAVIX_BASE_URL: canonical HTTPS origin of the deployed HEAVIX app, without a trailing path.
2. Repository secret CRON_SECRET: a high-entropy random secret. Set the same value as the deployed app's CRON_SECRET environment variable.
3. Deploy the app with the updated main and Store Prisma schemas before enabling production use of the worker.

The GitHub Actions workflow .github/workflows/store-audit-outbox.yml invokes the authenticated endpoint every five minutes and can also be run manually. Missing configuration fails the workflow visibly; it does not silently report successful delivery.

## Endpoint

POST /api/internal/store-audit-outbox

- Requires Authorization: Bearer <CRON_SECRET>.
- Returns the drain summary and counts for pending, processing, delivered, and failed.
- Returns 503 if the server has no CRON_SECRET, 401 for an invalid credential, and 500 if the drain itself fails.

## Monitoring and recovery

- Alert on any FAILED rows and on oldestPendingAt exceeding the agreed operational SLO.
- Review lastError and the relevant Store mutation before retrying a FAILED row. An authenticated manual replay request may send JSON `{ "retryFailedIds": ["<outbox-id>"] }`; only named FAILED rows are requeued, and the endpoint returns the number requeued.
- Do not delete pending/failed rows to clear an alert; that destroys the only durable record of an undelivered audit event.
- If a worker crashes, its PROCESSING lease is automatically eligible for reclaim after five minutes.
- The worker is at-least-once; the unique main-database idempotency key is what makes redelivery safe.

## Release boundary

Adding the endpoint and workflow does not configure repository secrets, deploy the application, or apply either database schema to production. Those actions remain separate release gates.
