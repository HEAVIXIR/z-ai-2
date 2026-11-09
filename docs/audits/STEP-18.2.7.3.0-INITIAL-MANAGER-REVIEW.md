# STEP 18.2.7.3.0 — Independent Manager Review (Initial Findings)

**Review target:** `HEAVIXIR/z-ai-2` `main`  
**Reviewed HEAD:** `6fe1bd79561c5afcc783249153a4ab7332d210a1`  
**Review date:** 2026-11-03  
**Scope:** Read-only source inspection; no tests, migrations, seeds, deployments, or production access were performed.

## Executive decision

Legacy adaptation is **NOT AUTHORIZED YET**. The evidence package is useful for provenance and candidate inventory, but current-main contracts must be reviewed before rewriting or importing any legacy feature.

The initial source review found one actionable correctness issue in AI preflight ordering, one type-safety defect, and one documentation inconsistency. These findings require reproduction and regression evidence before closure.

## Findings

### F-01 — AI budget reservation occurs before input-size rejection

- **Severity:** P1 (availability / budget integrity)
- **Status:** CONFIRMED BY SOURCE; runtime reproduction pending
- **Files:** `src/lib/ai-policy.ts`
- **Evidence:** `preflightAIRequest` runs policy lookup, authentication, quota, then `getAIBudget()` and `checkAIBudget(policy.costCeilingUsd, budget)`; only after successful reservation does it compare `inputLength > policy.maxInputChars`.
- **Impact:** An authenticated caller can submit a payload that exceeds the policy input limit, have the request rejected with HTTP 400, while still consuming a reserved AI budget amount despite no LLM call.
- **Required correction:** Validate input length before budget reservation. Add tests proving oversized requests do not mutate daily/monthly spend and valid requests reserve exactly once. Ensure tests use a disposable database.
- **Do not close:** until behavior is tested against the current implementation and corrected implementation.

### F-02 — AI policy module disables TypeScript checking and has an incomplete boolean helper

- **Severity:** P2 (type safety / maintainability)
- **Status:** CONFIRMED BY SOURCE; build impact UNKNOWN
- **Files:** `src/lib/ai-policy.ts`
- **Evidence:** File begins with `// @ts-nocheck`. `userHasAnyRole(...): Promise<boolean>` returns `true` when `hasRole` succeeds but has no explicit `return false` path.
- **Impact:** The function can resolve to `undefined` at runtime despite its declared `Promise<boolean>` contract; the file-level TypeScript suppression masks this mismatch. Current caller's truthiness check may treat it as false, but the contract is unsound and future callers can misuse it.
- **Required correction:** Remove `@ts-nocheck`, explicitly return false, type role inputs from canonical RBAC types, then run targeted tests and typecheck.
- **Do not close:** until `@ts-nocheck` is removed and the relevant TypeScript/test evidence is attached.

### F-03 — Prisma schema header contradicts configured provider

- **Severity:** P3 (documentation accuracy)
- **Status:** CONFIRMED BY SOURCE
- **Files:** `prisma/schema.prisma`
- **Evidence:** Header says “SQLite development schema (PostgreSQL for production — switch provider + url for deployment)” while the datasource directly below specifies `provider = "postgresql"`.
- **Impact:** Misleads operators and reviewers about the actual schema provider and can lead to incorrect migration assumptions.
- **Required correction:** Update the comment to describe the actual PostgreSQL configuration and environment-specific URL behavior. No schema or migration changes are implied.

## Important current architecture constraints

1. Legacy `ai-gateway-service.ts` must not be copied. The current gateway is `src/app/api/ai-gateway/route.ts` with policy, auth, rate limit and audit integration. Adaptation must reconcile with this route and `src/lib/ai-policy.ts`.
2. Legacy `price-intelligence.ts` is built around obsolete `PriceRecord`. Current price functionality uses `PriceObservation`, `PriceEstimate`, `PriceOverride`, `src/lib/price-engine.ts`, and a separate `src/lib/price-history-engine.ts`. No parallel pricing engine or legacy model is allowed.
3. `package.json` exposes scripts including `db:push` with `--accept-data-loss` and reset/migration commands. They must be treated as destructive operational commands; this review did not execute them.
4. Presence of a Prisma schema or migration file does not prove that a target database has been migrated or contains application tables.

## Evidence required from implementation agent

Tracked in [Issue #176](https://github.com/HEAVIXIR/z-ai-2/issues/176). The agent must upload a Draft, evidence-only PR containing:
- Full current source snapshots and SHA-256 for AI policy, gateway route, pricing engines, both Prisma schemas and package scripts.
- Relevant tests and actual command logs with exit codes.
- Regression tests for F-01 and F-02.
- Inventory of all provider call sites and classification of gateway enforcement.
- A legacy-vs-current algorithm comparison with exact file/line references.
- Independently reproducible ZIP and file-manifest reconciliation for 845 / 844 / 792 / 53 counts.

## Verification boundary

This document records source-level findings only. No runtime test result, CI result, database state, deployment state, or production readiness claim is made. Missing evidence remains UNKNOWN, never PASS.
