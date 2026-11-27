# Shared Rate Limiting — Zero-Cost Compatibility Review

**Status:** Research only; no runtime change authorized or implemented  
**Scope:** Existing HEAVIX rate-limit behavior and Cloudflare Workers Free compatibility  
**Hard constraint:** Zero-Cost. No Paid plan, paid add-on, automatic upgrade, or billing mutation.

## Current HEAVIX implementation (verified on this branch)

- `src/lib/rate-limit.ts` uses a module-level `Map<string, Bucket>`, fixed windows, and a 60-second in-process sweeper. Each isolate/process has its own counters; this is not a shared/global limiter.
- The public result contract is `{ ok, remaining, resetAt }`; every call increments, including denied requests. `retryAfterSeconds(resetAt)` supplies the current 429 response's Retry-After value.
- `src/lib/rate-limit-check.ts` builds keys from identity plus preset label and preserves a standard 429 response.
- `src/lib/rate-limit-presets.ts` includes both 15-minute and one-hour windows, as well as one-minute windows. Examples: LOGIN is 10/15 min/IP; REGISTER is 5/hour/IP; VERIFY is 10/hour/IP; RESEND is 3/hour/IP; UPLOAD and AI are 20/hour/user and 30/hour/user respectively.

## Cloudflare Free and Wrangler facts

- The repository pins Wrangler `4.156.0` in `package.json`. Cloudflare's Rate Limiting binding documentation requires Wrangler 4.36.0 or later, so the pinned version satisfies that documented minimum.
- Workers Free includes 100,000 requests/day and 10 ms CPU per invocation.
- Cloudflare's current Workers pricing page lists Durable Objects under Workers Paid (minimum $5/month). Durable Objects are therefore excluded from this Zero-Cost design.
- Do not infer that an unlisted feature is free merely because no separate price was found. The Rate Limiting binding's precise account entitlement/cost still needs confirmation against the actual account plan before configuration or deployment.

Sources:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

## Native Workers Rate Limiting binding: compatibility result

Cloudflare's native binding is approximate and eventually consistent, with counters scoped to a Cloudflare location. Same-namespace bindings can share counters across Workers within a location, but updates propagate in the background; traffic can exceed the configured threshold before counters synchronize. It is not a strict global counter.

The binding supports only 10-second and 60-second periods. That does not represent HEAVIX's existing 15-minute and one-hour windows. Its decision API also does not reproduce the current `resetAt`/exact `Retry-After` contract. Therefore it is **not a drop-in replacement** for the current limiter and cannot preserve current policy semantics on its own.

Potential future use is limited to a separate, coarse edge-abuse layer with explicitly different semantics. That would require a security review of key choice, identity/IP trust, endpoint coverage, false positives, and the binding's approximate behavior. It must not silently replace existing presets or be described as strict enforcement.

## Decision

1. Keep the existing in-process limiter and all thresholds/responses unchanged for now.
2. Do not implement a Durable Object: it is outside the stated Zero-Cost constraint.
3. Do not add a Rate Limiting binding yet: its documented periods and semantics do not preserve the existing HEAVIX contract, and the actual account entitlement/cost has not been confirmed.
4. Treat the current limiter's per-isolate weakness as a documented residual risk, not as a solved problem.
5. Revisit only if Cloudflare adds compatible free-tier primitives, the account's entitlement is verified read-only, or the owner explicitly changes the Zero-Cost constraint.

## Safety boundary

This review makes no Worker configuration change, binding creation, deploy, billing change, database write, migration, seed, account/session mutation, or production change. Any future implementation must remain a separate Draft PR, preserve the current security contract unless explicitly reviewed, and pass exact-head CI before any separately authorized Preview action.
