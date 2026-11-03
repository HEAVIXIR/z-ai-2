# STEP 18.2.7.3.2 — Legacy Adaptation Decision Reconciliation

**Status:** Engineering review in progress  
**Target:** `HEAVIXIR/z-ai-2`  
**Branch:** `engineering/step-18.2.7.3-legacy-adaptation`  
**Application source changes:** None  
**Database / seed / asset / deployment actions:** None

## Executive decision

The 23-file ADAPT label from the archive comparison is an intake classification, **not authorization to port or rewrite all 23 files**. A prior line-by-line audit and the current repository contain materially stronger evidence that several legacy implementations are unsafe, stale, redundant, or already superseded.

The governing rule for this step is:

> Preserve useful intent, not legacy implementation. A new implementation is justified only by a demonstrated current capability gap and must use the canonical current schema, services, authorization, audit, tests, and operational controls.

This reconciliation does not change the historical evidence in PR #175. It records the engineering disposition for the next stage and prevents a broad rewrite from reintroducing rejected designs.

## Evidence inspected

1. Current repository metadata and PR #175 metadata were fetched directly from GitHub. PR #175 is open and Draft; it remains separate from this engineering branch.
2. Current `prisma/schema.prisma` and `prisma/store/schema.prisma` were inspected. Main and Store are separate PostgreSQL schemas/clients; Store uses `STORE_DATABASE_URL`.
3. Current `src/lib/price-history-engine.ts` was inspected. It already provides canonical PriceObservation-backed history and Tukey IQR outlier detection.
4. Current `src/lib/audit-foundation.ts`, `src/lib/authorization/permissions.ts`, `src/lib/db.ts`, and `src/lib/store-db.ts` were inspected. They establish existing audit, permission, and database-client foundations.
5. Current `package.json` was inspected. It already defines `audit:ai-gateway`, `audit:admin-rbac`, `security:check`, canonical Main/Store seed commands, and taxonomy seed commands.
6. Existing repository decision records were inspected:
   - `docs/legacy-parity/UNIQUE-NEW-PATHS-DECISIONS-2026-10-26.md`
   - `docs/legacy-parity/ISSUE-144-LINE-BY-LINE-AUDIT-2026-10-27.md`
   - `tests/README.md`

The older decision records are historical snapshots and do not, by themselves, prove present-day feature completeness. Their line-level findings are nevertheless relevant where corroborated by current source.

## Reconciled disposition of the 23 candidates

| Candidate group | Count | Engineering disposition | Rationale / next gate |
|---|---:|---|---|
| AI Gateway service | 1 | **REJECT legacy implementation** | Current route has stronger policy/auth/quota/budget gates. Do not restore a parallel service. Audit remaining direct provider call sites separately against Issue #111; only extract a demonstrably missing, tested control. |
| Price Intelligence engine | 1 | **REJECT legacy implementation** | Legacy depends on deprecated PriceRecord. Current PriceObservation-backed engines exist; current price-history engine already implements IQR/Tukey outlier detection. Compare exact behavior only if a current consumer gap is evidenced. |
| Compare UI | 1 | **REJECT direct copy** | Legacy API assumptions differ from current session-based comparison and share flow. Port an interaction only after a concrete UX/API gap is demonstrated. |
| Price Intelligence UI | 1 | **REJECT direct copy** | Legacy response contract is incompatible with current routes. Use current typed contracts and existing admin UI. |
| Phase audit scripts 5a–11a | 7 | **REJECT verbatim; no blanket runner rewrite** | Existing line-by-line audit found `@ts-nocheck`, swallowed DB errors, PII over-fetch, brittle schema text matching, stale model/route assumptions, and hard-coded historical conclusions. Current package already has focused AI Gateway and RBAC audits plus tests. A unified read-only audit runner is only authorized after a coverage-gap matrix proves a missing, non-duplicative need. |
| Security check | 1 | **REJECT legacy script** | Regex heuristics are not an authoritative security suite. Retain and improve maintained `security:check`, lint, security tests, and structural guards. |
| Seed scripts: articles, brands-300, essential, kill-switch, plans | 5 | **HOLD — candidate-by-candidate review** | Do not rewrite or execute as a batch. Compare each data set with canonical current seeds, establish provenance and unique keys, define no-op/idempotency semantics, dry-run output, bounded writes, and rollback. Kill-switch and plans additionally require explicit business/configuration review. |
| Comprehensive Store seed | 1 | **REJECT direct import and execution** | Large multi-domain writes affect catalog, price, and stock; provenance and stock invariants are unproven. Reconcile with current Store seed commands and inventory source-of-truth before proposing a narrowly scoped data import. |
| Image-processing tools | 4 | **HOLD — asset pipeline review** | Do not execute or port yet. Verify asset provenance/licensing, actual consumers, transformations, color/alpha behavior, output path containment, no-overwrite defaults, dry-run, and deterministic output. Prefer a single parameterized tool only if repeated operational need is proven. |
| Taxonomy rebuild | 1 | **REJECT destructive legacy approach** | Legacy implementation contains full-category deletion. Current taxonomy has canonical seeds and separate Main/Store ownership. Any taxonomy correction must be a scoped, additive/idempotent migration with explicit reconciliation and rollback. |
| **Total** | **23** | **0 approved for verbatim transfer** | ADAPT is not an implementation approval. |

### Important distinction: seven audit scripts

The prior report's suggestion to rewrite all seven scripts into a new Audit Runner is not accepted as a default task. The previous line-by-line audit explicitly rejected their archived form and identified current focused audits and tests as equivalents. Before creating any new runner, produce a coverage matrix with one row per required invariant and columns for:
- current source of truth (test, script, CI job, or runtime monitor);
- exact command and evidence artifact;
- Main versus Store scope;
- failure semantics (ERROR must never be converted to zero/empty);
- permission and PII boundaries;
- gap that cannot be met by existing tooling.

Only uncovered, actionable invariants may become new runner checks. Do not build a second generic audit framework.

## Engineering sequence

### 18.2.7.3.2-A — Reconciliation (this document)
- Preserve PR #175 and its evidence unchanged.
- Record why intake ADAPT does not mean port approval.
- Keep all legacy source files as evidence/reference only.

### 18.2.7.3.2-B — Current capability and coverage matrix
- Compare each candidate against current Main and Store code, routes, tests, scripts, and docs.
- Pin exact current-main commit and exact file/blob references in the report.
- Separate VERIFIED, REPORTED, GAP, and NOT APPLICABLE.
- No database connection or production data reads are required.

### 18.2.7.3.3 — Narrow implementation proposals
For each proven gap, submit an isolated proposal with acceptance tests and rollback. Likely candidates, only if proven, are:
- a read-only cross-domain diagnostic missing from existing audit tooling;
- a parameterized, no-overwrite image conversion utility;
- a provenance-backed, dry-run seed/import for one narrowly scoped dataset.

No candidate is pre-approved.

### 18.2.7.3.4 — Implementation
- One focused change per PR/branch.
- No legacy code copied verbatim.
- Use canonical Prisma clients and schema ownership.
- Add type-safe contracts, permission-negative tests, audit coverage for mutations, and explicit error reporting.
- Run targeted tests, typecheck, lint, full required CI, and independent review on the exact proposed HEAD.

## Non-negotiable safety gates

The following remain prohibited in this stage:
- any production or preview migration, `db push`, reset, or schema mutation;
- any seed execution against a shared or real database;
- any kill-switch, plan, price, or feature-flag mutation;
- any Store stock/inventory write or bulk catalog import;
- any destructive taxonomy operation or `deleteMany({})`;
- any image operation that overwrites source assets or uploads to production;
- any deploy, DNS change, worker activation, or paid-service activation;
- merging PR #175 or this engineering branch without a separate exact-HEAD review and passing required checks.

## Exit criteria

This reconciliation is complete when:
1. The 23 candidates have explicit, non-ambiguous dispositions (table above).
2. The current capability/coverage matrix is produced against a pinned main SHA.
3. Every proposed implementation is tied to a concrete gap and acceptance tests.
4. No production, preview, database, asset, or deployment state was changed.

**Current outcome:** Reconciliation recorded; application code and all external state remain unchanged.