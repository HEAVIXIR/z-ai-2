# Shared Rate Limiting — Free Plan Design Review

**Status:** Proposed; not implemented  
**Scope:** Authentication and security-sensitive rate-limit buckets  
**Cost constraint:** Workers Free / Durable Objects Free only. No paid plan, paid add-on, automatic upgrade, or billing change.

## Problem

The current `src/lib/rate-limit.ts` limiter stores fixed-window counters in a process/isolate-local `Map`. Requests routed to different Worker instances can therefore receive independent buckets, weakening limits across instances. This limiter is best-effort and is not a globally shared counter.

## Free-tier facts checked against Cloudflare's documentation

- Workers Free includes 100,000 incoming requests/day and 10 ms CPU per invocation.
- SQLite-backed Durable Objects are available on Workers Free.
- Durable Objects Free includes 100,000 requests/day, 13,000 GB-s/day, 5 million SQLite rows read/day, 100,000 rows written/day, and 5 GB SQLite storage.
- On Free, exceeding an included limit causes that operation to fail; it does not automatically switch to Paid usage.
- Every Durable Object RPC method call is a billed request unit, so the design must minimize RPCs (one check per limiter invocation; no extra calls for reads/writes).
- Free-tier allowances reset daily at 00:00 UTC.

Sources:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/

## Proposed architecture (bounded, not dynamically provisioned)

1. Keep the existing limiter interface/presets and fixed-window semantics initially.
2. Use one SQLite-backed Durable Object class with a **fixed, code-defined shard set** (initial proposal: 8 shards; validate load and contention before finalizing). Never create unbounded objects based on IP/user input.
3. Compute a stable shard from a privacy-preserving keyed digest of the limiter key. Store only the digest, never raw IP/email/user ID.
4. A single RPC performs the complete atomic check-and-increment and returns `ok`, `remaining`, and `resetAt`; no read-then-write split RPC.
5. SQL transaction/upsert semantics must enforce the limit atomically under concurrent requests. Expired buckets are reclaimed by bounded cleanup; cleanup must not scan or delete unbounded rows in one request.
6. Security endpoints (login, registration, verification, password reset) fail closed if the shared limiter is unavailable or throws. This trades availability for abuse protection and must be explicitly tested.
7. Keep current thresholds unchanged in the first migration. IP parsing/trust is a separate issue and must not be silently coupled to this change.
8. Add deterministic tests for concurrency, fixed-window reset, increment-on-deny, Retry-After, shard determinism, failure behavior, key privacy, and compatibility with existing presets.
9. Roll out in an isolated Preview only after review and environment protection are verified. Do not perform production writes, account changes, migrations, seeds, or deploys during implementation/CI.

## Risks and open engineering checks

- **Hot shard:** eight shards are only a starting point; measure contention in tests. Increasing shards reduces contention but must remain a fixed, reviewed number.
- **Quota coupling:** each limiter call consumes a DO request and SQLite write. Free daily quotas are finite; auth traffic and abuse traffic can exhaust them. Monitor usage and fail-closed behavior without relying on paid overages.
- **DoS via shared quota:** an attacker can consume the Free allowance and temporarily cause security endpoints to reject requests. The current per-isolate limiter is not globally atomic; migration must not make failure mode worse without tests and documented trade-offs.
- **Storage:** expired rows need bounded reclamation and a strict TTL; enforce maximum rows/key length.
- **Privacy:** keys must be keyed hashes (not plain hashes of low-entropy identifiers), and no raw identities may be logged.
- **Free-plan guard:** verify Wrangler binding, SQLite backend, and account plan read-only before any Preview deployment; no billing API writes.

## Acceptance gates

- No Paid-plan configuration or billing mutation.
- Fixed bounded shard IDs, no user-controlled object creation.
- Atomic check/increment in one RPC.
- Existing limiter presets and responses preserved.
- Unit + Workerd tests and exact-head CI pass.
- Preview environment reviewer protection verified before any deploy; this ADR does not authorize deployment.

## Decision

Proceed with a small Draft PR containing the design record first. Implementation is a separate change after the bounded shard and failure-mode tests are proven.
