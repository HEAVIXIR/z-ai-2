# HEAVIX legacy source intake — decision register

**Source repository:** [HEAVIXIR/z](https://github.com/HEAVIXIR/z)  
**Pinned source commit:** `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`  
**Target repository:** [HEAVIXIR/z-ai-2](https://github.com/HEAVIXIR/z-ai-2)  
**Inventory run:** [GitHub Actions #40325606586](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40325606586)

## Evidence summary

The legacy repository stores 13 ZIP archives rather than a normal source tree. The read-only inventory reported 75 missing-path candidates, 633 same-path content differences, 990 identical files, 15 excluded entries, 2 binary entries requiring manual review, zero unsafe paths, zero archive errors, and zero cross-archive hash collisions. These are archive-entry counts, not unique feature counts. Missing or changed paths are not automatic approval to import.

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
| `src/components/listings/PriceIntelligence.tsx` | **Do not copy yet** | It expects `/api/ai-price-intelligence` and a verdict response. This contract has not been shown equivalent to the current `/api/ai-price-suggestion` flow. Any port must use canonical AI policy controls and tested response contracts. |
| `src/lib/price-intelligence.ts` | **Reject direct import** | It reads/writes the deprecated `PriceRecord` model. Current repository decisions identify `PriceObservation` as canonical; follow Issue #95 and the reconciliation evidence instead. |
| `public/robots.txt` | **Do not add blindly** | The target already has a Next.js `src/app/robots.ts` route. Avoid duplicate route ownership; review the rendered response instead. |
| `.zscripts/dev.pid` and other runtime artifacts | **Exclude** | Process/runtime state is not source code. |
| Old ZIPs, uploaded images, DB dumps, environment files, keys, generated/vendor bundles | **Exclude or separately review** | Never copy secrets, database backups, user-upload artifacts, generated outputs or binaries as part of source intake. |

## Imported audit tooling

Two read-only scripts are added as maintainable diagnostics:

- `scripts/audit-ai-gateway.mjs` identifies direct provider SDK references outside the canonical gateway. It is heuristic and report-only by default; `--strict` is an opt-in gate.
- `scripts/audit-admin-rbac.mjs` groups admin routes by explicit permission marker, other recognized guard marker, or manual review. A marker is not proof of authorization; absence is not proof of a vulnerability. `--strict` only flags routes that need manual classification.

These scripts support Issues #111 and #112; they do not replace route-by-route behavioral tests.

## Import policy going forward

1. Inspect candidate contents and current consumers before changing target code.
2. Never overwrite a current file solely because an archived version differs.
3. Do not introduce duplicate routes, services, Prisma models or migration histories.
4. Keep data-changing scripts dormant until idempotency, data provenance, dry-run output and explicit gates are proven.
5. Require exact-HEAD CI and review by a non-author for code changes.
6. No Production/Stage mutation, deployment, backfill, Phase D/E, or worker activation is authorized by this inventory.
