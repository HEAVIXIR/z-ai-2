# Legacy Files for Review — STEP 18.2.7.3

These 27 files exist ONLY in the legacy repository (HEAVIXIR/z) and are NOT
present in the current main branch of HEAVIXIR/z-ai-2.

## Organization

```
legacy-files/
├── adapt/      (23 files — confirmed adaptation candidates)
├── reject/     (4 files — for reference only, will NOT be transferred)
├── MANIFEST-SHA256.txt
└── README.md   (this file)
```

## Provenance

All files extracted from ZIPs in HEAVIXIR/z main branch:
- src.zip: SHA-256 5ec7314f356cc69646584f39d304fd0095f35240ac0f9ebbc2831161b3789496
- scripts.zip: SHA-256 57346b79919d680662e2698d33fbc6ca079d5651ad415b95b69925d52b9ca93a
- prisma.zip: SHA-256 03fb62fd41b10a34f4158a79738d510091615e20b117508abfd71346a7188848

SHA-256 of each file recorded in MANIFEST-SHA256.txt

## Security

- No secrets, .env files, or credentials in any file
- No database files included
- No upload files included
- Prisma generated client excluded

## Usage

These files are for READ-ONLY review. They should NOT be copied to the
main source tree without individual adaptation review and approval.

### Priority Review Order (per manager directive)

1. `adapt/ai-gateway-service.ts` — AI Gateway architecture
2. `adapt/price-intelligence.ts` — Price intelligence engine
3. `adapt/ComparePageClient.tsx` — Compare UI
4. `adapt/PriceIntelligence.tsx` — Price intelligence UI
5. `adapt/phase5a-audit.ts` through `phase11a-audit.ts` — 7 audit scripts
6. `adapt/security-check.ts` — Security audit
7. `adapt/seed-*.ts` — 6 seed scripts
8. `adapt/*-logo*.cjs` and `adapt/orange-ix.cjs` — 4 image tools
9. `adapt/rebuild-taxonomy.ts` — Taxonomy rebuild

## Canonical Source

`DECISION-MATRIX.csv` (parent directory) is the single source of truth
for all 27 decisions. This file structure matches it exactly:

- ADAPT: 23 files in adapt/
- REJECT: 4 files in reject/
- REVIEW: 0 (all promoted to ADAPT)
