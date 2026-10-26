# Legacy Capability Transfer — API Security Reconciliation

**Status:** Initial source-backed inventory; not a completed security audit.  
**Target baseline:** `main` merge commit `8f1c7a838d7a605986da1a0c34a9b33a51d76367` (PR #113).  
**Legacy baseline:** `HEAVIXIR/z@217f98ecc800aa64ae4739d27ed2aeb95dd260ed`.  
**Tracking:** [Issue #114](https://github.com/HEAVIXIR/z-ai-2/issues/114), [Issue #111](https://github.com/HEAVIXIR/z-ai-2/issues/111), [Issue #112](https://github.com/HEAVIXIR/z-ai-2/issues/112).

## Important distinction

A direct import/call of `z-ai-web-dev-sdk` outside the canonical gateway is a **gateway-boundary finding**, but it does not alone prove an unauthenticated or exploitable route. The current source for several candidate API routes already contains `getCurrentUser()`, `preflightAIRequest()`, `recordAICost()`, and/or `AIGatewayLog` handling. These controls must be reviewed for correctness and equivalence; they must not be assumed absent based on stale research notes. Conversely, these per-route controls do not make a fragmented provider architecture acceptable by themselves.

## A. API route candidates — classify, then migrate

The following list comes from Issue #111's static inventory. Current route source must be re-read on each PR's base SHA before changing behavior.

| Route | Current source markers observed | Required decision |
|---|---|---|
| `src/app/api/admin/ai-content-factory/route.ts` | `getCurrentUser`, `hasPermission`, `preflightAIRequest`, cost/log handling | Verify admin permission, input schema, timeout, safe output, then route through shared provider boundary |
| `src/app/api/admin/ai-scraper/route.ts` | `getCurrentUser`, `requirePermission`, preflight/cost/log markers; URL-fetching and import side effects | P0 SSRF/host allowlist, timeout, permissions, draft/import side effects, PII handling |
| `src/app/api/admin/brands/[id]/search-logo/route.ts` | Direct image-search provider use; current helper/permission logic requires line-level review | Verify brand-level permission, outbound-provider policy, URL validation and output allowlist |
| `src/app/api/admin/categories/[id]/generate-image/route.ts` | Candidate direct image-generation provider path | Verify permission, image output validation, cost gate, and no automatic overwrite |
| `src/app/api/admin/knowledge/generate-article/route.ts` | Candidate direct provider path | Verify knowledge permission, schema validation, draft-only behavior and output sanitization |
| `src/app/api/admin/knowledge/generate-image/route.ts` | Candidate direct image-generation provider path | Verify permission, URL/base64 bounds, output validation and no implicit publish |
| `src/app/api/admin/reels/route.ts` | Current source shows permission and preflight/cost/log markers | Verify each provider operation is gated and no unsupervised publish/worker action occurs |
| `src/app/api/admin/store/ai-scraper/route.ts` | Candidate direct provider path with URL-fetching/import risks | Verify Store permissions, SSRF, company/tenant ownership, and draft-only import |
| `src/app/api/ai-listing-builder/route.ts` | Current source shows `getCurrentUser`, preflight/cost/log markers | Preserve response contract; validate structured output and seller-owned listing scope |
| `src/app/api/ai-market-analyst/route.ts` | Current source shows `requireAdminPermission("ai.execute")` and preflight/cost/log markers | Verify exact permission semantics, query bounds, timeout, output schema and audit |
| `src/app/api/ai-price-suggestion/route.ts` | Current source shows auth and preflight/cost/log markers | Preserve canonical `PriceObservation` model and estimation rules; never treat AI output as observed market price |
| `src/app/api/ai-sales-agent/route.ts` | Current source shows auth and preflight/cost/log markers | Verify seller-scoped lead selection and replace with canonical deterministic/API flows where appropriate |
| `src/app/api/ai-search/route.ts` | Current source shows auth and preflight/cost/log markers | Validate output filters against allowlisted schema; ensure AI text cannot become raw DB filters |
| `src/app/api/ai-seller-assistant/route.ts` | Current source shows auth, admin/ownership checks and preflight/cost/log markers | Verify listing ownership, role policy and safe output handling |

**Acceptance for every row:** exact file/line review, route contract tests, anonymous denial where auth is required, authenticated-but-unprivileged denial for admin operations, cross-user/cross-tenant denial, budget-exhaustion denial before provider invocation, timeout/provider failure behavior, audit record, and output redaction/schema validation.

## B. Shared-library and non-route provider callers

A source search also found direct provider use in these shared modules. This means the 14-route list is not a complete application-wide provider inventory.

| Module | Initial disposition | Follow-up |
|---|---|---|
| `src/lib/ai-search.ts` | REVIEW | Find all callers; route AI search through a shared policy-enforced service while preserving search contract |
| `src/lib/ai-listing-builder.ts` | PORT/REWRITE | Existing prompts and AI_SUGGESTED contract should be preserved; add schema validation and caller context |
| `src/lib/compare-engine.ts` | REVIEW | AI summary must preserve compare-session owner/admin authorization and never declare a winner |
| `src/lib/ai-content-assistant.ts` | REVIEW | Find callers and classify whether live route, internal job, or dead code |
| `src/lib/ai-operational.ts` | REVIEW | Classify system/background calls; require explicit service identity and policy rather than anonymous fallback |
| `src/lib/ai-matching-enhanced.ts` | REVIEW | Confirm it is needed versus deterministic canonical matcher; prevent duplicate scoring logic |
| `src/lib/moderation.ts` | REVIEW | Define fail-closed moderation semantics and safe manual-review fallback |
| `src/lib/social-reels.ts` | REVIEW | External video generation, cost ceiling, file paths, and publishing side effects require separate gates |
| `src/lib/ai-agents/index.ts` | REVIEW | Inventory agent callers/tools, permissions, tool side effects and budget limits |
| `src/lib/ai-gateway-service.ts` | **RETIRE after call-site proof** | Repository search found no code import/call sites; it is an unused parallel provider gateway with weaker ad-hoc checks. Delete only in a focused PR after rechecking references on current main and updating docs. |
| `prisma/generate-sale-images.ts` | OFFLINE TOOL | Not a request route; retain as a manually invoked script only if its side effects, path boundaries, and execution instructions are documented. Never run as part of parity audit. |

## C. Admin API authorization audit

Issue #112 reports 197 `src/app/api/admin/**/route.ts` files; 90 lack one literal permission marker. This is a **manual review queue**, not a count of confirmed vulnerabilities.

For every HTTP method in every route, capture:
- authentication source and fail-closed behavior;
- exact permission and role mapping;
- resource/object ownership and tenant/company scope;
- method-specific side effects and transaction boundaries;
- CSRF protection where cookie-authenticated mutation requires it;
- rate limits and body/query size bounds;
- audit event and safe error behavior;
- negative tests that assert no DB/provider side effect after denial.

A route may be accepted as public only with a documented reason and tests. Do not add a generic permission just to make a regex pass.

## D. Legacy feature intake rules

- **KEEP:** equivalent current capability is proven; no duplicate implementation.
- **PORT:** valuable missing behavior; adapt to current APIs, models, permissions and UI patterns.
- **REWRITE:** behavior is valuable but old contracts/data models are incompatible.
- **REJECT:** unsafe, obsolete, duplicate, unmaintained or tied to retired schema.
- **HOLD:** provenance, dependency, caller, license or behavioral evidence is missing.

Specific constraints:
- No archived SQLite migration or legacy `prisma/store-schema.prisma` enters the active PostgreSQL path.
- No direct import of deprecated `PriceRecord`; use the canonical `PriceObservation` path and Issue #95.
- Legacy compare UI expecting `/api/compare?ids=...` is not compatible by assumption with the current session/share API.
- Legacy seeds, taxonomy rebuilds, inventory/price mutations, image transforms, and backfills remain unexecuted until separately reviewed for provenance, idempotency, dry-run, bounded scope, and rollback.
- No secret, DB dump, runtime artifact, user upload, generated/vendor bundle, or unlicensed binary is imported as application source.

## E. Exit gates

- [ ] All legacy archive entries have a decision with evidence.
- [ ] All current `src/app/api/**/route.ts` handlers and HTTP methods have a security classification.
- [ ] All direct provider calls in runtime code are either routed through the approved shared policy boundary or have a documented and tested exception.
- [ ] No duplicate/unused gateway remains.
- [ ] All sensitive routes have denial-before-side-effect tests.
- [ ] Feature transfers have contract and regression tests.
- [ ] Full CI passes on exact final SHA and a non-author reviewer approves the final diff.
- [ ] Production remains NO-GO until Issue #88 and operational Issue #81 pass; no production/staging mutation, backfill, deployment, or worker activation is part of this inventory.
