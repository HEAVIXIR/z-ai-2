# Legacy Files for Review — STEP 18.2.7.3

These 27 files exist ONLY in the legacy repository (HEAVIXIR/z) and are NOT
present in the current main branch of HEAVIXIR/z-ai-2.

## Organization

```
legacy-files/
├── adapt/      (17 files — confirmed adaptation candidates)
├── review/     (7 files — phase audit scripts, need individual content review)
├── reject/     (3 files — for reference only, will NOT be transferred)
├── MANIFEST-SHA256.txt
└── README.md   (this file)
```

## Provenance

All files extracted from ZIPs in HEAVIXIR/z main branch:
- src.zip: SHA-256 5ec7314f...
- scripts.zip: SHA-256 57346b79...
- prisma.zip: SHA-256 03fb62fd...

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
5. `review/phase5a-audit.ts` through `phase11a-audit.ts` — 7 audit scripts
6. `adapt/security-check.ts` — Security audit
7. `adapt/seed-*.ts` — 6 seed scripts
8. `adapt/*-logo*.cjs` — 5 image tools
9. `adapt/rebuild-taxonomy.ts` — Taxonomy rebuild
