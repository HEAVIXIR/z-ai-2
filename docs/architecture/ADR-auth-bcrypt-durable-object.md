# ADR: Offload HEAVIX bcrypt work to a private Durable Object

- Status: Proposed; isolated proof-of-concept required
- Date: 2026-11-26
- Scope: Integration Preview only; no Production rollout

## Context

The Integration Preview currently computes bcrypt in the main OpenNext Worker through `src/lib/password.ts` (`bcryptjs`, cost factor 10). Cloudflare Observability for the existing `heavix-preview` deployment recorded successful `POST /api/auth/login` executions at a mean of 274.36 ms and p95 of 596 ms, plus three `exceededCpu` outcomes. Removing the custom `cpu_ms` override makes the Worker configuration compatible with the Free plan, but does not make this CPU profile compatible with the Free Worker CPU budget.

The password API is shared by login, registration (including email OTP hashing), and administrator password creation/reset. Any solution must cover all of those call sites and preserve existing hashes.

## Decision under evaluation

Prototype a separate, private, SQLite-backed Durable Object class dedicated to bcrypt compute. The main HEAVIX Worker calls it through Cloudflare's same-account Durable Object RPC binding; it does not call a public HTTP endpoint. Cloudflare documents that Durable Object methods can be invoked by other Workers on the same account through bindings and RPC, and that these are capability-based calls rather than public Internet endpoints.

The proof of concept must:
- Preserve `bcryptjs`, bcrypt hash format, and cost factor 10 exactly.
- Expose only two narrow RPC methods: `hashPassword(plaintext)` and `verifyPassword(plaintext, encodedHash)`.
- Keep database access, user lookup, rate limiting, CSRF, authorization, sessions, audit events, and email delivery in the existing HEAVIX application.
- Never persist plaintext passwords, password hashes, OTPs, request bodies, or user identifiers in the Durable Object.
- Never log credentials or hash values; log only operation category, outcome, and timing metadata.
- Validate input size and bcrypt hash format before expensive work; reject malformed/oversized inputs.
- Keep existing IP-based rate limiting before invoking the crypto binding. Add bounded concurrency and a fail-closed response if the binding is unavailable; never fall back to bcrypt on the main Worker.
- Cover every production call site of `hashPassword` and `verifyPassword`, including server actions and admin endpoints, before any integration.
- Preserve local Node test behavior through an explicit local adapter; do not silently make tests depend on Cloudflare bindings.
- Use Cloudflare CPUTimeMs/Observability or a CPU profile for measurement. Do not use `performance.now()` as a CPU-time metric in deployed Workers.

## Free-plan guardrails

Cloudflare's published Durable Objects Free allowance is 100,000 requests/day and 13,000 GB-s/day; exceeding a Free allowance causes further operations of that type to fail rather than automatically upgrading the account. Free-plan Durable Objects require SQLite storage. The proposed crypto object must perform no storage reads or writes and must not create tables, alarms, or metadata. Cloudflare documents that an object with empty storage can cease to exist after shutdown; SQLite-backed DO storage has a 5 GB Free allowance, but any nonzero stored data is still subject to the account's applicable limits.

The POC must be stopped if the account's actual plan, limits, or billing behavior cannot be verified as Free. No paid plan, paid resource, billing change, or automatic upgrade is authorized.

## Why not weaken password hashing

Do not lower bcrypt cost, replace it with a weaker iteration count, or change existing hashes merely to fit the main Worker CPU limit. A hash algorithm migration is a separate security decision and is not part of this spike.

## Deployment and release boundary

1. Implement and test the standalone crypto Worker locally.
2. Verify the RPC binding shape and external `script_name` binding with Wrangler.
3. Run unit and integration tests for valid/invalid passwords, malformed hashes, hash uniqueness, existing bcrypt compatibility, OTP hashing, and admin password flows.
4. Only after local gates pass, deploy the isolated crypto Worker to a Preview-only namespace under verified Free-plan constraints. Do not deploy the main application or modify Production.
5. Benchmark success and failure paths, cold/warm starts, and bounded concurrency using Cloudflare CPU telemetry and DO request/duration metrics.
6. Integrate the binding into the main app only after the measured budget and failure behavior are acceptable. Keep the existing application path unchanged until then.

No database binding, database migration, seed, Production environment, public route, custom domain, or Production secret is needed for the isolated crypto proof.

## Acceptance criteria

- Existing bcrypt hashes verify unchanged.
- New hashes remain bcrypt cost 10 and are unique due to salts.
- Wrong passwords return false; malformed hashes fail safely without exposing internal errors.
- No credential/hash/OTP is persisted or logged.
- Every password hashing/verifying call site is covered.
- Main Worker does not execute bcrypt when the binding is configured; no unsafe local fallback in Preview.
- The Durable Object remains private and callable only through the configured same-account binding.
- Observed DO requests and duration remain within the Free allowances under the agreed load envelope.
- CI, typecheck, security tests, and Workerd/Preview proof pass without weakening existing security assertions.

## References

- Cloudflare Durable Object RPC: https://developers.cloudflare.com/workers/runtime-apis/rpc/
- Cloudflare RPC visibility/security model: https://developers.cloudflare.com/workers/runtime-apis/rpc/visibility/
- Cloudflare Durable Object class exports and SQLite requirement: https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/
- Cloudflare Durable Objects Free pricing and limits: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Cloudflare storage behavior for empty objects: https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/
