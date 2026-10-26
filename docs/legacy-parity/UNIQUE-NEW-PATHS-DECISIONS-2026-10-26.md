# HEAVIX Legacy Archive — Unique Missing-Path Decisions

**Source repository:** [HEAVIXIR/z](https://github.com/HEAVIXIR/z)  
**Pinned source commit:** `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`  
**Target main baseline reviewed:** `97e43ebd7349b56c54cddf000531c5e267f6c4f8`  
**Inventory evidence:** [CI run #40374044751](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40374044751), artifact `legacy-archive-inventory`  
**Decision type:** static source/archive triage; not a runtime or feature-completeness claim.

## Inventory result

The source repository is an archive container, not a canonical live source tree. Thirteen ZIP archives contained 1,715 archive-entry rows. Those rows collapse to 909 unique paths: 528 identical paths, 327 existing-path conflicts, and 54 unique paths absent from current main (88 NEW rows because some paths occur in more than one archive). The inventory reported 22 sensitive-review rows, zero unsafe archive paths, zero archive read errors, and zero cross-archive hash collisions.

The audit artifact staged 26 text/code candidates for review only. **No candidate from that temporary artifact is imported by this document.** Path absence is not approval to restore an old implementation.

## Complete decision register — all 54 unique NEW paths

| Legacy path | Decision | Evidence / reason |
|---|---|---|
| `.env` | **EXCLUDE — sensitive** | Environment material must never be imported from an archive. Use reviewed variable names in `.env.example` only; never copy values. |
| `.zscripts/dev.pid` | **EXCLUDE — runtime artifact** | Stale process ID is workstation/runtime state, not source. |
| `db/backups/custom-20260921-023810.db` | **EXCLUDE — database backup** | Contains application data; not source code. Preserve only under separately governed backup retention. |
| `db/backups/custom-20260921-024013.db` | **EXCLUDE — database backup** | Same policy; no import into the target repository. |
| `db/backups/custom-20260921-025202.db` | **EXCLUDE — database backup** | Same policy; no import into the target repository. |
| `db/custom.db` | **EXCLUDE — SQLite database** | Conflicts with the active PostgreSQL architecture and may contain user data. |
| `db/custom.db.before-restore` | **EXCLUDE — database snapshot** | Pre-restore snapshot; neither application source nor a safe migration artifact. |
| `db/store.db` | **EXCLUDE — Store database** | Do not copy legacy SQLite data into the active PostgreSQL Store path. Any data migration requires its own provenance, mapping, dry-run, rollback and authorization gate. |
| `prisma/migrations/0_init/migration.sql` | **REJECT** | Legacy SQLite initial migration conflicts with the active PostgreSQL baseline and independent Main/Store migration histories. |
| `prisma/migrations/README.md` | **HOLD — reconcile** | Must be reconciled with current PostgreSQL baseline/adoption and deploy/rollback procedure before any targeted reuse. |
| `prisma/store-schema.prisma` | **REJECT** | Duplicates the retired schema path. Canonical Store schema is `prisma/store/schema.prisma`; do not revive parallel schema ownership. |
| `public/robots.txt` | **REJECT direct copy** | Target already owns robots metadata through `src/app/robots.ts`. Verify rendered response; do not create competing route ownership. |
| `scripts/clear-logo.ts` | **HOLD — mutating script** | Writes logo settings to the database. Inspect current asset usage, ownership, dry-run and rollback before considering a redesigned tool. Do not execute. |
| `scripts/make-logos-dark.cjs` | **HOLD — asset mutation** | Changes image assets; licensing, consumers, output paths and overwrite safety are unverified. |
| `scripts/orange-ix.cjs` | **HOLD — asset mutation** | Image transformation can overwrite or alter assets; no automatic import/run. |
| `scripts/phase10a-audit.ts` | **REJECT verbatim; rewrite if needed** | Legacy audit uses `@ts-nocheck`, stale phase assumptions, direct DB reads and fallback behavior that can hide errors. Prefer current tests/typed diagnostics. |
| `scripts/phase11a-audit.ts` | **REJECT verbatim; rewrite if needed** | Legacy notification audit contains hard-coded gap conclusions and catches DB errors as zero/incomplete; not reliable current evidence. |
| `scripts/phase5a-audit.ts` | **REJECT verbatim; rewrite if needed** | Legacy trust audit queries live data and encodes old field/API assumptions; replace with a current read-only diagnostic only if a gap remains. |
| `scripts/phase6a-audit.ts` | **REJECT verbatim** | Uses deprecated `PriceRecord` and hard-coded old counts/gap conclusions. Current price domain is tracked under Issue #95 and canonical `PriceObservation`. |
| `scripts/phase7a-audit.ts` | **REJECT verbatim; rewrite if needed** | Legacy RFQ/matching audit uses old model names, data assumptions and swallowed errors. |
| `scripts/phase8a-audit.ts` | **REJECT verbatim; rewrite if needed** | Legacy messaging audit contains hard-coded missing-feature conclusions and DB fallback behavior; compare to current APIs/models first. |
| `scripts/phase9a-audit.ts` | **REJECT verbatim; rewrite if needed** | Legacy transaction audit mixes Main/Store schema assumptions and stale Deal/Order model conclusions. |
| `scripts/process-logos-v2.cjs` | **HOLD — asset mutation** | Review source/licensing, consumers, output path and overwrite behavior before any port. |
| `scripts/process-logos.cjs` | **HOLD — asset mutation** | Same as above; do not execute during source intake. |
| `scripts/rebuild-taxonomy.ts` | **REJECT direct import/execution** | Contains `db.category.deleteMany({})` and recreates taxonomy. Destructive, overlaps canonical taxonomy/seed logic, and lacks an approved migration gate. |
| `scripts/security-check.ts` | **REJECT** | Old heuristic is not the maintained security suite. Target `security:check` uses maintained lint/security tests; preserve current controls. |
| `scripts/seed-articles.ts` | **HOLD — data mutation** | Creates records; verify provenance, duplicate handling, current model compatibility and idempotency before any separate seed proposal. |
| `scripts/seed-brands-300.ts` | **HOLD — data mutation** | Bulk brand insertion requires provenance, deduplication, safe upsert, bounded dry-run and rollback. |
| `scripts/seed-essential.ts` | **HOLD — data mutation** | Writes articles, searches, homepage sections and menu records. Compare against canonical current data and seed tooling first. |
| `scripts/seed-kill-switch.ts` | **HOLD — configuration mutation** | Do not restore or run until its values, policy and current feature-flag owner are verified. |
| `scripts/seed-plans.ts` | **HOLD — configuration/data mutation** | Plans affect product configuration; verify current billing/business rules and provenance before considering a focused migration. |
| `scripts/seed-store-comprehensive.ts` | **REJECT direct import/execution** | Large seed writes categories, brands, models, parts, prices and stock. Data provenance, current Store schema compatibility, idempotency and stock invariants are not proven. |
| `scripts/start-dev.sh` | **EXCLUDE / use canonical scripts** | Target package scripts own developer startup; environment-specific shell orchestration is not a product capability. |
| `src/components/compare/ComparePageClient.tsx` | **REJECT direct copy; port behavior only if gap proven** | Archived UI expects `/api/admin/listings` and GET `/api/compare?ids=...`; target comparison uses a session-based API and share flow. Contracts are incompatible by assumption. |
| `src/components/listings/PriceIntelligence.tsx` | **REJECT direct copy; reimplement only if needed** | Archived widget expects flat `average/median/min/max/sampleSize/reason` fields; current route response is structurally different. Use Issue #95 and tested canonical contracts. |
| `src/lib/ai-gateway-service.ts` | **REJECT — do not restore** | Removed from current main by PR #119 because it was unused, implemented weaker ad-hoc policy checks, and parsed unvalidated JSON. Active direct provider call sites remain tracked separately in Issue #111; do not restore this parallel gateway. |
| `src/lib/price-intelligence.ts` | **REJECT direct import** | Reads/writes deprecated `PriceRecord`; would create a parallel price domain instead of using canonical `PriceObservation`. |
| `upload/HEAVIX-AUDIT-2026-09-20.md` | **REVIEW CONTENT; do not duplicate under upload** | Compare claims to current source and retain only updated, evidence-backed material in the canonical `docs/` location. |
| `upload/HEAVIX-COMPLETION-SPECIFICATION-V1.0.md` | **REVIEW CONTENT; no blind import** | Reconcile with current architecture and release gates; archived specification is not implementation evidence. |
| `upload/HEAVIX-CORRECTED-REFERENCE-V1.1.md` | **REVIEW CONTENT; no blind import** | Validate every reference against current routes/models before targeted documentation reuse. |
| `upload/HEAVIX-DATA-GOVERNANCE-V1.md` | **REVIEW CONTENT; no duplicate** | Preserve current authoritative governance docs; reconcile differences rather than creating a second policy source. |
| `upload/HEAVIX-EXECUTABLE-HARDENING-PATCH-V1.0.zip` | **EXCLUDE binary patch archive** | Never apply a bundled patch without unpacking, line-level review, provenance and current-main tests. |
| `upload/HEAVIX-PRICE-COMPARISON-DOCUMENTS-V1.0.zip` | **EXCLUDE archive; review individual documents only** | Do not import a nested archive as application source; compare individual specs against canonical current docs. |
| `upload/HEAVIX-P0-IMPLEMENTATION-PLAN.md` | **REVIEW CONTENT; no blind import** | Compare plan with current P0 issues and actual code; preserve one current plan of record. |
| `upload/HEAVIX-SECURITY-BASELINE-V1.md` | **REVIEW CONTENT; no blind import** | Security claims require fresh source and behavioral evidence; do not treat historical baseline as current pass. |
| `upload/IMG_20260921_134636_188.jpg` | **EXCLUDE pending asset provenance** | Upload artifact; no evidence it is a licensed product asset required by the app. |
| `upload/IMG_20260921_134636_634.jpg` | **EXCLUDE pending asset provenance** | Same policy. |
| `upload/IMG_20260921_134636_663.jpg` | **EXCLUDE pending asset provenance** | Same policy. |
| `upload/IMG_20260921_134636_703.jpg` | **EXCLUDE pending asset provenance** | Same policy. |
| `upload/IMG_20260921_134636_839.jpg` | **EXCLUDE pending asset provenance** | Same policy. |
| `upload/custom-20260921-024013.db` | **EXCLUDE — database backup** | May contain user/business data; never commit to application source. |
| `upload/custom-20260921-025202.db` | **EXCLUDE — database backup** | Same policy. |
| `upload/heavix-postgres-migration-changes.zip` | **HOLD — migration archive** | Extract and review SQL/metadata independently against current Main/Store histories; no blind application or production migration. |
| `upload/workspace-d08ba835-4223-4b4a-9627-838c96185efa (1).tar` | **EXCLUDE from application tree** | Workspace archive may contain generated files, data, secrets or user uploads; inventory separately if needed, never unpack into the live source tree wholesale. |

## Findings from candidate code inspection

- `scripts/rebuild-taxonomy.ts` contains a destructive full-category delete before recreating taxonomy.
- `scripts/clear-logo.ts` writes logo settings; image-processing scripts mutate assets.
- Seed scripts create or update application data, including inventory and stock.
- Phase audit scripts use `@ts-nocheck`, direct DB access, hard-coded historic findings and/or catch errors as zero counts; they are not authoritative current audits.
- `src/lib/price-intelligence.ts` uses deprecated `PriceRecord`; the old compare/price widgets assume incompatible API contracts.
- The archive includes environment files and database snapshots. None are candidates for source import.
- A legacy file can be valuable as a specification, but behavior must be reimplemented through current APIs, canonical models, authorization, audit and tests.

## Import gate

No missing path is approved for verbatim import by this inventory. A future capability PR must identify the concrete product gap, map the old behavior to current route/service/model/UI, use canonical schema paths, add contract and permission-negative tests, and pass exact-HEAD CI plus non-author review. Database seeds, taxonomy rebuilds, image transformations, migrations, backfills, production/staging changes, deployment and worker activation remain separately gated.


## Inventory refresh and baseline history

- Current target main baseline reviewed: `97e43ebd7349b56c54cddf000531c5e267f6c4f8`.
- Fresh read-only inventory: [CI run #40374044751](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40374044751); 1,715 archive-entry rows, 909 unique paths, 528 identical paths, 327 conflicts, and 54 unique paths absent from current main (88 NEW rows).
- The prior inventory at target baseline `a3d88ad879dac9dfbef04680a849b58a2e8f64b0` had 53 unique missing paths. The current delta includes `src/lib/ai-gateway-service.ts`, classified REJECT after its removal in PR #119.
- The inventory job ran on a temporary audit PR based on current main with only a temporary workflow file added to produce the artifact. That workflow is not intended to merge and did not change main or application code.
- This is source/archive triage, not a claim of feature parity. No legacy file is approved for verbatim import by this register.
