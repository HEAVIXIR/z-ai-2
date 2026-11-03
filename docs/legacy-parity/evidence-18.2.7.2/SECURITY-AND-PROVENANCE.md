# Security & Provenance — STEP 18.2.7.2

## Security Scan Results

| Check | Result |
|-------|--------|
| .env files in archives | None found ✓ |
| Connection strings with credentials | None found ✓ |
| Private keys | None found (1 false positive in Prisma binary, removed) ✓ |
| API keys / tokens | None found ✓ |
| Generated client files | Excluded from comparison ✓ |
| SQLite migration files | Identified — marked REJECT for PostgreSQL ✓ |

## Provenance Chain

```
HEAVIXIR/z (main branch, commit 217f98e)
  └── 13 ZIP files at root
       ├── src.zip → SHA-256: 5ec7314f...
       ├── scripts.zip → SHA-256: 57346b79...
       ├── prisma.zip → SHA-256: 03fb62fd...
       ├── tests.zip → SHA-256: baffb992...
       └── docs.zip → SHA-256: 7096b790...
            ↓
       Extracted to dellk00k/z branch legacy/extracted-archives
       (commit bbb1f49, PR #2)
            ↓
       Content SHA-256 recorded in MANIFEST-SHA256.txt (845 entries)
            ↓
       Compared with HEAVIXIR/z-ai-2 main (commit 6fe1bd7)
            ↓
       Results in FILE-MATRIX.csv (792 files, 5 categories only)
```

## Integrity Verification

- All 5 ZIP SHA-256 hashes verified against GitHub raw download
- Extracted file count verified: 845 entries = 844 content files from 10 ZIPs + 1 MANIFEST-SHA256.txt self-reference
  Breakdown by category: src=690, prisma=39, public=38, scripts=25, tests=20, docs=18, .zscripts=10, examples=2, mini-services=1, download=1, MANIFEST=1
  Note: No Prisma generated client files in manifest (removed during extraction)
- FILE-MATRIX.csv has 792 entries = only 5 categories compared (src=690, prisma=39, scripts=25, tests=20, docs=18)
  Difference of 53 = public(38) + .zscripts(10) + examples(2) + mini-services(1) + download(1) + MANIFEST self-reference(1)
- No files modified between download and comparison
- No secrets or sensitive data identified in extracted content
