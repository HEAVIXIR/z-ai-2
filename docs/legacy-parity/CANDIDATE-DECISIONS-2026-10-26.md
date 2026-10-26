# HEAVIX legacy source intake — decision register

**Source repository:** [HEAVIXIR/z](https://github.com/HEAVIXIR/z)  
**Pinned source commit:** `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`  
**Target repository:** [HEAVIXIR/z-ai-2](https://github.com/HEAVIXIR/z-ai-2)  
**Inventory run:** [GitHub Actions #40325606586](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40325606586)

## Evidence summary

The legacy repository stores ZIP bundles rather than a normal source tree. The initial inventory (run #40325606586) is retained as historical evidence; its counts were archive-entry counts, not unique paths.

### Current pinned inventory refresh

- Source: commit 217f98ecc800aa64ae4739d27ed2aeb95dd260ed.
- Target under review: HEAVIXIR/z-ai-2, PR #117 inventory branch; the workflow does not modify application files.
- Current workflow run: https://github.com/HEAVIXIR/z-ai-2/actions/runs/40343353041
- 13 ZIP archives inspected; 1,715 file entries.
- By archive-entry row: 86 NEW, 990 IDENTICAL, and 639 CONFLICT rows.
- By unique path: 53 new paths absent from the target, 529 identical paths, and 327 conflicting paths.
- 22 entries require sensitive/data review. Zero unsafe archive paths, zero archive read errors, and zero cross-archive content-hash collisions were reported.
- 25 new text/code candidates were staged into a short-lived review artifact, excluding database files, .env, SQL/Prisma schema paths, upload artifacts, and binary/generated files. They were staged for review only; none were imported.

Repeated files in multiple ZIPs explain why row counts exceed unique-path counts. This is a content inventory, not a feature-completeness verdict. Missing or changed paths are not automatic approval to import.

## Decisions

| Candidate | Decision | Evidence / required follow-up |
|---|---|---|
| `scripts/catalog-health.ts` | **Imported** | Restored as a read-only diagnostic in PR #109; empty tables are informational and raw driver details are not printed. |
| `prisma/seed-price-records.ts` | **Guard only; legacy implementation rejected** | PR #109 replaces the old non-idempotent PriceRecord backfill with a fail-closed exit. Do not run a backfill without a separate approved data gate. |
| `scripts/security-check.ts` | **Do not restore verbatim** | The old static heuristic is not the maintained security suite. `security:check` now runs the maintained lint and security tests. |
| `prisma/migrations/0_init/migration.sql` | **Reject** | Legacy initial migration conflicts with the established PostgreSQL baseline and separate migration history. |
| `prisma/store-schema.prisma` | **Reject** | Canonical Store schema is `prisma/store/schema.prisma`; do not revive a parallel schema path. |
| `scripts/rebuild-taxonomy.ts` | **Hold; do not execute** | It writes taxonomy data and overlaps existing seed/taxonomy code. Compare its complete data set and idempotency semantics before considering a focused migration. |
| `scripts/seed-store-comprehensive.ts` | **Reject direct import/execution** | It seeds categories, brands, models, parts, prices and stock. Data provenance, model compatibility and safe upsert semantics require a separate review; no seeding is authorized here. |
| `src/components/compare/ComparePageClient.tsx` | **Do not copy** | The archived UI queries `/api/admin/listings` and expects a GET `/api/compare?ids=...` contract. The current comparison page uses a session-based API and sharing flow. Port only verified behavior through current APIs if a real gap remains. |
| `src/components/listings/PriceIntelligence.tsx` | **Reject direct copy; reimplement only if a product gap is confirmed** | The archived widget expects flat `average`, `median`, `min`, `max`, `sampleSize`, and `reason` fields, while the existing `/api/ai-price-intelligence` route returns `similarCount`, nested `stats`, `diff`, and `message`. The response contract does not match; any replacement needs a tested current API contract and must preserve the distinction between observed prices and estimates. |
| `src/lib/price-intelligence.ts` | **Reject direct import** | It reads/writes the deprecated `PriceRecord` model. Current repository decisions identify `PriceObservation` as canonical; follow Issue #95 and the reconciliation evidence instead. |
| `public/robots.txt` | **Do not add blindly** | The target already has a Next.js `src/app/robots.ts` route. Avoid duplicate route ownership; review the rendered response instead. |
| `scripts/clear-logo.ts`, `make-logos-dark.cjs`, `orange-ix.cjs`, `process-logos*.cjs` | **Hold; do not run** | They can mutate image assets. Inspect current asset usage, licensing, output paths, overwrite behavior, and dry-run support before any port. |
| `scripts/phase5a-audit.ts` through `phase11a-audit.ts` | **Hold** | Review database reads/writes, environment assumptions, and overlap with current phase tests before importing. |
| `scripts/seed-articles.ts`, `seed-brands-300.ts`, `seed-essential.ts`, `seed-kill-switch.ts`, `seed-plans.ts` | **Hold; never execute as part of source intake** | They mutate product/configuration data. Verify data provenance, idempotency, and current schema compatibility in a separate seed plan. |
| `scripts/start-dev.sh` and `.zscripts/dev.pid` | **Exclude** | The current package scripts own development startup; PID and environment-specific launch artifacts are not portable source. |
| Nested `docs/README.md` and `scripts/prepare-standalone.mjs` | **Reject verbatim / hold for targeted review** | The README prescribes stale dependency versions and a workstation-specific Windows path. The standalone helper is not proven to be part of the current Docker build path. |
| `prisma/migrations/README.md` | **Do not copy until reconciled** | Migration guidance must match the current baseline/adoption workflow and canonical schema paths, not an archived project state. |
| `upload/HEAVIX-*.md` documents | **Do not duplicate under `upload/`** | The target already tracks the corresponding canonical project documents under `docs/`; preserve one authoritative location and review substantive differences individually. |
| Nested price-estimation and machine-comparison spec files | **Already represented; no duplicate import** | The target tracks `docs/HEAVIX-PRICE-ESTIMATION-SPEC-V1.0.md` and `docs/HEAVIX-MACHINE-COMPARISON-SPEC-V1.0.md`. |
| Uploaded images, workspace artifacts, archived ZIPs and binary payloads | **Exclude from application source** | They are upload/backup artifacts, not verified product assets. Preserve them in the source archive; do not publish them or copy them into `public/` without provenance and rights review. |
| `.zscripts/dev.pid` and other runtime artifacts | **Exclude** | Process/runtime state is not source code. |
| Old ZIPs, uploaded images, DB dumps, environment files, keys, generated/vendor bundles | **Exclude or separately review** | Never copy secrets, database backups, user-upload artifacts, generated outputs or binaries as part of source intake. |

## Imported audit tooling

Two read-only scripts are added as maintainable diagnostics:

- `scripts/audit-ai-gateway.mjs` scans API route handlers and `src/lib` modules for direct provider SDK references outside the canonical gateway route. The existing `src/lib/ai-gateway-service.ts` is a candidate for review, not automatically approved: repository quality-gate notes describe it as dead code with no callers and without the maintained `preflightAIRequest` flow. The audit is heuristic and report-only by default; `--strict` is an opt-in gate.
- `scripts/audit-admin-rbac.mjs` groups admin routes by explicit permission marker, other recognized guard marker, or manual review. A marker is not proof of authorization; absence is not proof of a vulnerability. `--strict` only flags routes that need manual classification.

These scripts support Issues #111 and #112; they do not replace route-by-route behavioral tests.

## Import policy going forward

1. Inspect candidate contents and current consumers before changing target code.
2. Never overwrite a current file solely because an archived version differs.
3. Do not introduce duplicate routes, services, Prisma models or migration histories.
4. Keep data-changing scripts dormant until idempotency, data provenance, dry-run output and explicit gates are proven.
5. Require exact-HEAD CI and review by a non-author for code changes.
6. No Production/Stage mutation, deployment, backfill, Phase D/E, or worker activation is authorized by this inventory.
