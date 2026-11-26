# ADR: Offload HEAVIX bcrypt work to a private Durable Object

- Status: Proposed; isolated POC and local Workerd RPC proof implemented; account-plan verification and production integration gates remain open
- Date: 2026-11-26
- Scope: Integration Preview only; no Production rollout

## Context

The Integration Preview currently computes bcrypt in the main OpenNext Worker through `src/lib/password.ts` (`bcryptjs`, cost factor 10). Cloudflare Observability for the existing `heavix-preview` deployment recorded successful `POST /api/auth/login` executions at a mean of 274.36 ms and p95 of 596 ms, plus three `exceededCpu` outcomes. Removing the custom `cpu_ms` override makes the Worker configuration compatible with the Free plan, but does not make this CPU profile compatible with the Free Worker CPU budget.

The password API is shared by login, registration (including email OTP hashing), and administrator password creation/reset. Any solution must cover all of those call sites and preserve existing hashes.

## Decision under evaluation

Prototype a separate, private, SQLite-backed Durable Object class dedicated to bcrypt compute. The current branch implements the isolated class, helper-level unit tests, and a local Workerd RPC harness. CI run `45894202860` passed the Worker dry-run, real local Workerd RPC proof, typecheck, lint, security/integration tests, production build, TLS proof, and Docker connectivity proof. This is not a Cloudflare deployment, account-plan verification, or end-to-end caller integration. The main HEAVIX Worker calls it through Cloudflare's same-account Durable Object RPC binding; it does not call a public HTTP endpoint. Cloudflare documents that Durable Object methods can be invoked by other Workers on the same account through bindings and RPC, and that these are capability-based calls rather than public Internet endpoints.

The proof of concept must:
- Preserve `bcryptjs`, bcrypt hash format, and cost factor 10 exactly.
- Expose only two narrow RPC methods: `hashPassword(plaintext)` and `verifyPassword(plaintext, encodedHash)`.
- Keep database access, user lookup, rate limiting, CSRF, authorization, sessions, audit events, and email delivery in the existing HEAVIX application.
- Never persist plaintext passwords, password hashes, OTPs, request bodies, or user identifiers in the Durable Object.
- Emit no application logs from the crypto object. In particular, never log credentials, hashes, OTPs, user identifiers, request bodies, or per-operation metadata.
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
## Account-plan verification gate (2026-11-26)

A read-only Cloudflare API check of the existing `heavix-preview` Worker returned `usage_model: standard`. Cloudflare's current pricing documentation states that the Standard usage model is available to Workers Paid subscribers (minimum USD 5/month). This is a billing-risk signal and must not be treated as proof of Free-plan eligibility. A separate read-only account-subscriptions request was denied because the connected Cloudflare authorization lacks `billing:read`. Therefore the account plan is **not independently verified**, and no deployment or resource creation is authorized until an owner-approved read-only billing check confirms the account is on Free with no active paid Workers subscription. Do not request `billing:write` and do not alter subscriptions as part of this work.


## Verified password call-site inventory (2026-11-26)

The Integration baseline was audited before any application binding changes:

- `src/app/api/auth/register/route.ts`: hashes the user password and email OTP. IP-based registration throttling runs before the hashing work; CSRF and input validation are present.
- `src/app/api/auth/login/route.ts`: verifies the submitted password. The API path has CSRF handling and an IP-based limit (10 attempts per 15 minutes) before verification.
- `src/app/api/admin/users/route.ts`: hashes an administrator-created user's password after authorization.
- `src/app/api/admin/users/[id]/route.ts`: hashes a password update after authorization. Before binding integration, its password validation must be checked and aligned with the crypto Worker's 1,024-byte UTF-8 input ceiling; reject oversize input before RPC.
- `src/app/login/actions.ts`: legacy `loginAction` also calls password verification. The current `LoginForm.tsx` uses `/api/auth/login`, but the legacy server action remains a reachable code path unless proven otherwise. It has no explicit rate limit in the audited baseline and checks `BLOCKED` without enforcing the full `ACTIVE` and `emailVerified` gates used by the API route. It must be removed, disabled, or hardened and rate-limited before crypto binding integration.

The in-memory rate limiter currently used by the app is isolate-local; it is not a globally coordinated brute-force control. Keep rate limiting before RPC, but do not represent this existing mechanism as a global guarantee. A globally coordinated rate limit is a separate design item if the threat model or deployment requires it.

## Durable Object concurrency and sharding requirement

The POC's one-active-operation guard is scoped to a single Durable Object instance. The local harness intentionally uses one deterministic object ID to test that per-instance guard; this is not an endorsement of a single global production instance. A single global ID would serialize all authentication crypto work and create a throughput bottleneck.

Before app integration, design and test a bounded fixed shard pool. Select a shard without sending PII, usernames, emails, IP addresses, or other user identifiers to the crypto object (random selection is the current preferred direction). Each shard retains its own one-operation admission guard. Define bounded retry/backoff or fail-closed busy behavior, fairness expectations, and shard count using measured concurrency and Free-plan request/duration budgets. Do not silently fall back to bcrypt in the main Worker when a shard is busy or unavailable.

## CI evidence and remaining gates

- Exact-head CI run: https://github.com/HEAVIXIR/z-ai-2/actions/runs/45894202860 — all required jobs passed, including the local Workerd RPC proof and Docker build/connectivity proof.
- The optional legacy archive inventory and Preview read-only paired migration diagnostics were skipped in that run; this CI result does not certify either operation.
- The Workerd harness proves the DO RPC methods locally, bcrypt cost-10 hash format, correct/wrong password behavior, malformed-hash fail-closed behavior, oversized input rejection, per-instance concurrent-operation rejection, and lock recovery. It does not prove Cloudflare-hosted CPU performance or account eligibility.
- Do not integrate app call sites until the legacy login action, admin update input bound, shard pool, and measured Free-plan behavior are resolved.
- Zero-cost owner declaration (2026-11-27): the project owner confirms Cloudflare, GitHub, Prisma, and Backblaze are all being used on free plans. This is the governing project constraint; no paid upgrade or billable resource may be introduced.
- Cloudflare evidence discrepancy remains explicitly open: the read-only Worker settings API previously returned `usage_model: standard`, while the connected token cannot read account subscriptions because it lacks `billing:read`. Current official Cloudflare pricing documentation says the Standard Workers usage model is available to Workers Paid subscribers (minimum USD 5/month): https://developers.cloudflare.com/workers/platform/pricing/. This signal does not independently prove that the account has an active paid subscription, but it conflicts with an assumption that this Worker is definitely on Free.
- Treat the owner statement as authoritative for project intent, but do not silently resolve the technical discrepancy. Before any Cloudflare deployment or creation of billable resources, verify the specific Worker usage model and account subscription using read-only evidence (or confirm in the Cloudflare dashboard). Do not request `billing:write`, change plans, or enable paid services.
- Continue local CI, code review, design, and Workerd tests while this account-level discrepancy is being clarified.


## bcrypt 72-byte input semantics (2026-11-27)

The project pins `bcryptjs` 3.0.3. Its documented behavior is that bcrypt uses at most the first 72 UTF-8 bytes and does not implicitly reject longer input; the library exposes `bcrypt.truncates(password)` for callers that need to detect this. The previous POC's 1,024-byte transport ceiling alone therefore did not prevent distinct long inputs with the same first 72 bytes from producing equivalent bcrypt credentials.

The POC now rejects a new hash request when `bcrypt.truncates(password)` is true. This is a 72-byte UTF-8 limit, not a 72-character limit. Verification deliberately retains the prior bcrypt comparison behavior (within the 1,024-byte transport ceiling) so accounts whose historical passwords exceeded 72 bytes are not abruptly locked out by the POC. This compatibility choice preserves the legacy truncation semantics for verification only; it does not endorse them for new password creation.

Before any application call-site integration, the public registration and administrator password creation/reset validators must be aligned with the 72-byte UTF-8 limit and return a clear validation error before hashing. Do not silently truncate, normalize, or rewrite user passwords. Add explicit tests for multibyte UTF-8 boundaries and for verification compatibility with a legacy hash generated from a 72-byte prefix. The change is covered by unit tests in the POC; exact-head CI must pass before this decision is treated as validated.

Reference: bcryptjs 3.0.3 documents the 72-byte maximum and `truncates()`: https://www.npmjs.com/package/bcryptjs
