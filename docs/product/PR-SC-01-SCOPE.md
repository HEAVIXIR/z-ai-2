# PR-SC-01 — Scope Manifest

- **Branch:** `feature/pr-sc-01-lead-crm-foundation`
- **Base:** `main` @ `4566efd` (post PR #8)
- **Author:** STEP 11.29 orchestrator
- **Date:** 2026-10-09
- **ADR basis:** ADR-005 §3 + §7, as corrected by ADR-005-amendment-01
- **Stage:** Foundation (Stage 1 of the Store Center roadmap) — schema + permission + test infrastructure, NO UI, NO API route.

## Purpose

PR-SC-01 is the **first and smallest** schema migration of the Store Center program. Per the owner directive (/ceo #3: "PR-SC-01 must be limited to the first clearly-documented migration; unrelated changes forbidden"), it does exactly one thing: establish the Lead CRM foundation (status pipeline + deterministic score) that unblocks Lead Intelligence (innovation idea D) and the CRM UI (PR-SC-06).

It deliberately does **NOT** touch Company branding (most fields already exist — see ADR-005-amendment-01 §1), Showroom, SalesTeamMember, MachinePassport, Part, or the universal-API tenant-scoping gap (BLOCKER-A4 — separate security PR).

## Scope (in)

### Schema — `prisma/schema.prisma` (additive only)

**Lead model** — 10 new nullable columns + 3 indexes + 2 relations:
- `status String @default("NEW")` — CRM pipeline (NEW|CONTACTED|QUALIFIED|CLOSED|LOST), app-layer-validated
- `assignedToId String?` + `assignedTo User? @relation("LeadAssignee")` — sales-team follow-up owner
- `score Int?` — cached deterministic Lead Score v1 (0–100)
- `scoreVersion String?` — "v1" | "v1-override"
- `scoreBreakdown Json?` — per-factor points for explainability
- `scoredAt DateTime?` — recalculation timestamp
- `scoreOverrideById String?` + `scoreOverrideBy User? @relation("LeadScoreOverride")` — human override actor
- `scoreOverrideReason String?` / `scoreOverrideNote String?` / `scoreOverrideAt DateTime?` — override audit trail
- Indexes: `@@index([status])`, `@@index([assignedToId])`, `@@index([listingId, status])`

**User model** — 2 back-relations (no new columns):
- `assignedLeads Lead[] @relation("LeadAssignee")`
- `scoreOverrideLeads Lead[] @relation("LeadScoreOverride")`

### Permissions — `src/lib/authorization/permissions.ts` + `prisma/seed-rbac.ts`

- `store.crm.read` — view leads + CRM pipeline (seller scope enforced by API in PR-SC-06)
- `store.crm.manage` — update lead status, assign, override score
- Both assigned to SELLER + ADMIN in `ROLE_PERMISSIONS`. BUYER/MODERATOR explicitly excluded.
- Hand-crafted Persian seed entries in `seed-rbac.ts` (quality names, not auto-generated).

### Algorithm — `src/lib/crm/lead-score.ts` (NEW, pure function)

- Deterministic Lead Score v1, 6 factors, 0–100 clamped.
- `LEAD_SCORE_VERSION = "v1"` for future algorithm coexistence.
- Pure function: no DB, no I/O. Caller assembles permitted, seller-scoped input.
- Explainability: per-factor `breakdown[]` + human-readable `reason` string.
- `leadScoreBand(score)` → HOT/WARM/COLD for UI badges.

### Status rules — `src/lib/crm/lead-status.ts` (NEW)

- 5 canonical statuses + `ALLOWED_TRANSITIONS` map.
- `validateTransition(from, to)` — fail-closed; unknown values rejected.
- `isTerminalStatus()` for UI column rendering.

### Tests

- `tests/unit/lead-score.test.ts` — determinism, all 6 factor weights, clamping, structure, band thresholds.
- `tests/unit/lead-status.test.ts` — legal/illegal transitions, fail-closed on unknown, terminal detection.
- `tests/security/lead-crm-permissions.test.ts` — static contract: keys exist, SELLER+ADMIN granted, BUYER excluded, key-format convention.

### Docs

- `docs/ADR-005-amendment-01.md` — corrects ADR-005 §1/§2/§3/§5/§6 false schema claims (this is directly related to PR-SC-01's migration premises).
- `docs/product/PR-SC-01-SCOPE.md` — this file.

## Scope (out — explicitly deferred)

| Deferred item | Reason | Target PR |
|---|---|---|
| Company `brandColor` + `storeDescription` | Unrelated to Lead; ADR-005-amendment-01 §1 shrinks it to 2 fields | PR-SC-04 (Store Identity UI) |
| `Showroom` model | Separate domain; ADR-005 §2 | PR-SC-02 |
| `SalesTeamMember` model | Separate domain; ADR-005 §4 | PR-SC-02 |
| `MachinePassport` per-section verification | All 8 fields genuinely new (amendment §6); separate migration | PR-SC-03 |
| `Listing.inventoryScore` (relocated from Part) | ADR-005-amendment-01 §5; separate migration | PR-SC-03 (revised) |
| Lead CRM API route (GET/PATCH leads) | UI-bound; needs BLOCKER-A4 tenant-scoping fix first | PR-SC-06 |
| Lead CRM UI (pipeline view) | Depends on PR-SC-06 API | PR-SC-06 |
| Universal-API tenant-scoping fix (BLOCKER-A4) | Pre-existing security gap; dedicated PR | PR-SC-00 (new, security) |
| Lead Score recalc background job | Needs the API + scheduling | PR-SC-06 |

## Migration review (per /expert §1.4 checklist)

1. **Additive?** Yes — all 10 new Lead columns are nullable or have a safe default (`status` defaults "NEW"). No existing column is modified or removed.
2. **Defaults?** `status` defaults `"NEW"` (backfill-equivalent: existing rows get the default on ALTER). All other new columns default NULL.
3. **Backfill plan?** None needed — `status @default("NEW")` backfills existing leads at the column level. Score columns stay NULL until the PR-SC-06 recalc job runs.
4. **Indexes?** 3 new indexes on Lead (`status`, `assignedToId`, `listingId+status`). All on nullable/low-cardinality-ish columns; safe additive `CREATE INDEX` (can use `CONCURRENTLY` in production per /ceo #5).
5. **Rollback?** `ALTER TABLE "Lead" DROP COLUMN ...` for all 10 new columns + `DROP INDEX` for the 3 indexes. No data loss (columns were nullable/new). User back-relations are Prisma-virtual (no DB column) — nothing to drop.
6. **Impact on existing API paths?** None. No existing route reads or writes the new Lead columns. The universal Lead resource config (if any) is unchanged; the new fields are not exposed until PR-SC-06.
7. **Seed update?** `seed-rbac.ts` auto-reconciles canonical permissions; hand-crafted entries added for quality. Re-running `db:seed-rbac` is idempotent and safe.

## Permissions + unauthorized-access test (per /ceo #5 + /expert §2.2)

- The 2 new keys are in `permissions.ts` + `seed-rbac.ts` + `ROLE_PERMISSIONS`.
- Static contract test (`tests/security/lead-crm-permissions.test.ts`) verifies: keys present, SELLER+ADMIN granted, BUYER excluded, format convention.
- The **dynamic** cross-seller negative test (Seller A cannot list Seller B's leads) is deferred to PR-SC-06 because PR-SC-01 ships no lead-listing API. The static test here is the baseline; PR-SC-06 must add the dynamic test as a merge gate.

## Acceptance criteria (Definition of Done)

1. `bun run db:validate` passes (schema valid).
2. `bun run typecheck` passes.
3. `bun run lint` passes.
4. `bun run test` passes (all existing + new tests green).
5. `tests/unit/lead-score.test.ts` — all factor weights pinned, determinism proven.
6. `tests/unit/lead-status.test.ts` — all legal/illegal transitions pinned, fail-closed proven.
7. `tests/security/lead-crm-permissions.test.ts` — permission matrix contract holds.
8. `docs/ADR-005-amendment-01.md` — ADR-005 schema claims corrected.
9. CI (`verify` workflow) green on the PR HEAD.
10. Independent /Critic review: no BLOCKER findings on this PR's diff.

## Status labels (per /ceo mandatory reporting)

- **IMPLEMENTED:** once code + tests + docs are committed and pushed.
- **FUNCTIONAL:** once CI green on HEAD (schema validates, tests pass).
- **VERIFIED:** once independent /Critic review finds no BLOCKER.
- **COMPLETE:** once merged to main (requires separate owner decision — NOT done in this step).

PR-SC-01 is opened as a PR; it is **NOT merged** in STEP 11.29. Merge requires independent review + the /Critic PASS (per /ceo #1 pattern and /strategy Stage 0 discipline).
