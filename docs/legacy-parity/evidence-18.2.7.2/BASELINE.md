# Baseline — STEP 18.2.7.2

## Repository State

| Repository | HEAD SHA | Branch | Date |
|-----------|----------|--------|------|
| HEAVIXIR/z-ai-2 (current) | 6fe1bd79561c5afcc783249153a4ab7332d210a1 | main | 2026-10-29 |
| HEAVIXIR/z (legacy) | 217f98ecc800aa64ae4739d27ed2aeb95dd260ed | main | 2026-10-26 |
| dellk00k/z (fork, extracted) | bbb1f4947e4b1a05e39f7b510c5c7801d52389e7 | legacy/extracted-archives | 2026-11-03 |

## Archive Provenance

| Archive | SHA-256 | Size |
|---------|---------|------|
| src.zip | 5ec7314f356cc69646584f39d304fd0095f35240ac0f9ebbc2831161b3789496 | 10866241 |
| scripts.zip | 57346b79919d680662e2698d33fbc6ca079d5651ad415b95b69925d52b9ca93a | 62321 |
| prisma.zip | 03fb62fd41b10a34f4158a79738d510091615e20b117508abfd71346a7188848 | 203686 |
| tests.zip | baffb992037c7c40da1dd195faa945c8119f12eb1205d38a7d3d21e7780dbb61 | 32545 |
| docs.zip | 7096b79001bf05a93256290dfe7ce31f353cd1f3ea0c492a3c773744a83db6b4 | 55629 |

## Method

1. Downloaded 5 ZIPs from HEAVIXIR/z main branch
2. Extracted to local filesystem
3. Computed SHA-256 for every extracted file
4. Retrieved HEAVIXIR/z-ai-2 main tree via GitHub API
5. Compared file paths and content (SHA-256) between old and current
6. Generated FILE-MATRIX.csv with status: SAME / CHANGED / ONLY_OLD

## Quarantined (NOT extracted)

| Archive | Reason |
|---------|--------|
| db.zip | Database files — sensitive |
| upload.zip | User uploads — sensitive |
| bun.zip | Build artifact — not source |

## Security Scan

- No .env files found in any archive
- No connection strings with credentials found
- No private keys found (only false positive in Prisma generated binary, removed)
- Prisma generated client files excluded from comparison
