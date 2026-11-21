# Refreshed extracted-file hash comparison — 2026-11-11

## Scope and exact baseline

- Staging source: `dellk00k/z@bbb1f4947e4b1a05e39f7b510c5c7801d52389e7`, branch `legacy/extracted-archives`.
- Current target: `HEAVIXIR/z-ai-2` recovery branch at `714678ca6920cc10fbb4696b203753df8244bbab`.
- Compared 844 extracted payload blobs after explicit extraction-prefix normalization. The three bookkeeping files were excluded from payload comparison.
- Comparison uses Git blob SHA-1 identifiers directly; matching values prove byte-identical Git blob content. Different values indicate changed content, not necessarily a defect or missing feature.

## Aggregate result

| Result | Files | Interpretation |
|---|---:|---|
| IDENTICAL | 494 | Same normalized path and same Git blob SHA |
| DIFFERENT | 321 | Same normalized path exists but content differs; requires disposition-aware semantic review |
| MISSING | 29 | No file at normalized legacy path in current tree; many are intentional preserve/adapt items, not automatic product gaps |
| UNMAPPED | 0 | No path prefix mapping; none expected |

Total compared: **844**. Current target tree entries: 2255. Current target comparison head: `714678ca6920cc10fbb4696b203753df8244bbab`.

## Results by top-level area

| Area | Identical | Different | Missing |
|---|---:|---:|---:|
| `.zscripts` | 8 | 1 | 1 |
| `docs` | 17 | 1 | 0 |
| `download` | 1 | 0 | 0 |
| `examples` | 2 | 0 | 0 |
| `mini-services` | 1 | 0 | 0 |
| `prisma` | 29 | 8 | 2 |
| `public` | 37 | 0 | 1 |
| `scripts` | 0 | 4 | 21 |
| `src` | 385 | 301 | 4 |
| `tests` | 14 | 6 | 0 |

## Explicit missing-path disposition mapping

The following missing paths were matched against the historical value-based disposition document. These are not blanket import approvals.

| Normalized legacy path | Historical disposition |
|---|---|
| `.zscripts/dev.pid` | PRESERVE_AS_REFERENCE |
| `prisma/migrations/0_init/migration.sql` | PRESERVE_AS_REFERENCE |
| `prisma/store-schema.prisma` | PRESERVE_AS_REFERENCE |
| `public/robots.txt` | PRESERVE_AS_REFERENCE |
| `scripts/clear-logo.ts` | PRESERVE_AS_REFERENCE |
| `scripts/make-logos-dark.cjs` | ADAPT_THEN_INTEGRATE |
| `scripts/orange-ix.cjs` | PRESERVE_AS_REFERENCE |
| `scripts/phase10a-audit.ts` | ADAPT_THEN_INTEGRATE |
| `scripts/phase11a-audit.ts` | ADAPT_THEN_INTEGRATE |
| `scripts/phase5a-audit.ts` | ADAPT_THEN_INTEGRATE |
| `scripts/phase6a-audit.ts` | ADAPT_THEN_INTEGRATE |
| `scripts/phase7a-audit.ts` | ADAPT_THEN_INTEGRATE |
| `scripts/phase8a-audit.ts` | ADAPT_THEN_INTEGRATE |
| `scripts/phase9a-audit.ts` | ADAPT_THEN_INTEGRATE |
| `scripts/process-logos-v2.cjs` | PRESERVE_AS_REFERENCE |
| `scripts/process-logos.cjs` | ADAPT_THEN_INTEGRATE |
| `scripts/rebuild-taxonomy.ts` | ADAPT_THEN_INTEGRATE |
| `scripts/security-check.ts` | ADAPT_THEN_INTEGRATE |
| `scripts/seed-articles.ts` | PRESERVE_AS_REFERENCE |
| `scripts/seed-brands-300.ts` | PRESERVE_AS_REFERENCE |
| `scripts/seed-essential.ts` | PRESERVE_AS_REFERENCE |
| `scripts/seed-kill-switch.ts` | PRESERVE_AS_REFERENCE |
| `scripts/seed-plans.ts` | PRESERVE_AS_REFERENCE |
| `scripts/seed-store-comprehensive.ts` | ADAPT_THEN_INTEGRATE |
| `scripts/start-dev.sh` | PRESERVE_AS_REFERENCE |
| `src/components/compare/ComparePageClient.tsx` | ADAPT_THEN_INTEGRATE |
| `src/components/listings/PriceIntelligence.tsx` | ADAPT_THEN_INTEGRATE |
| `src/lib/ai-gateway-service.ts` | ADAPT_THEN_INTEGRATE |
| `src/lib/price-intelligence.ts` | ADAPT_THEN_INTEGRATE |

All 29 missing paths have a historical disposition mapping. Preserve-only files must remain outside runtime paths. Adaptation items require fresh current-contract review, tests and provenance before integration.

## Path normalization rules

- `extracted/src/src/*` → `src/*`
- `extracted/scripts/scripts/*` → `scripts/*`
- `extracted/tests/tests/*` → `tests/*`
- `extracted/.zscripts/.zscripts/*` → `.zscripts/*`
- `extracted/mini-services/mini-services/*` → `mini-services/*`
- `extracted/download/download/*` → `download/*`
- `extracted/docs/docs/*` → `docs/*`
- `extracted/examples/examples/*` → `examples/*`
- `extracted/prisma/*` → `prisma/*`
- `extracted/public/*` → `public/*`

The original staging path is retained in the CSV so the normalization is reversible and provenance is not lost.

## Interpretation and limitations

1. 494/844 files are byte-identical at their normalized paths. This is direct evidence of successful prior integration for those files.
2. 321/844 files differ. A changed hash is expected when the target has evolved; it must be reviewed by domain and behavior, not overwritten with legacy content.
3. 29/844 files are absent at their old path. The 29-path list has explicit historic disposition mapping in the CSV and table above. This includes 16 ADAPT_THEN_INTEGRATE items and 13 PRESERVE_AS_REFERENCE items; the historical 17th adaptation item is `prisma/migrations/README.md`, whose path exists but content differs and therefore needs separate review.
4. The 899-path historical archive disposition remains a separate source-level inventory. This 844-file report covers only the safe extracted payload subset; it does not include the three quarantined archives' contents.
5. This is path/hash parity, not semantic acceptance. No code was copied or changed by this comparison.

## Exact next work

- Review the 321 changed files in risk/domain batches, beginning with security/auth, Prisma/data contracts, listing/media, Store and homepage.
- Review the 17 ADAPT_THEN_INTEGRATE items against current source and tests; do not assume old path absence means missing capability.
- Recover or regenerate a source archive inventory artifact because the latest green CI run #42982227259 skipped its Legacy archive inventory job.
- Keep `db.zip`, `upload.zip`, and `bun.zip` quarantined; no secrets or database/upload binaries may enter the current repository.

## Evidence

- Comparison CSV: `REFRESHED-EXTRACTED-PATH-HASH-COMPARISON-2026-11-11.csv`.
- Staging tree: https://api.github.com/repos/dellk00k/z/git/trees/bbb1f4947e4b1a05e39f7b510c5c7801d52389e7?recursive=1
- Target tree: https://api.github.com/repos/HEAVIXIR/z-ai-2/git/trees/714678ca6920cc10fbb4696b203753df8244bbab?recursive=1
- Historical decisions: `docs/legacy-parity/VALUE-BASED-DISPOSITION-2026-10-27.md`
- Source/extraction identity reconciliation: `docs/legacy-parity/LEGACY-SOURCE-AND-EXTRACTION-RECONCILIATION-2026-11-11.md`
