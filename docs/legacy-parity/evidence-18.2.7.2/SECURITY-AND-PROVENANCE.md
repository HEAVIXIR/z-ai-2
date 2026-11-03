# Security & Provenance — STEP 18.2.7.2

## Security Scan Results

| Check | Result |
|-------|--------|
| .env files in archives | None found ✓ |
| Connection strings with credentials | None found ✓ |
| Private keys | None found (1 false positive in Prisma binary, removed) ✓ |
| API keys / tokens | None found ✓ |
| Prisma generated client files | Removed during extraction (not in manifest) ✓ |
| SQLite migration files | Identified — marked REJECT for PostgreSQL ✓ |

## Provenance Chain

```
HEAVIXIR/z (main branch, commit 217f98e)
  └── 13 ZIP files at root
       ├── 10 extracted ZIPs (SHA-256 in BASELINE.md)
       └── 3 quarantined ZIPs (bun.zip, db.zip, upload.zip)
            ↓
       Extracted to dellk00k/z branch legacy/extracted-archives
       (commit bbb1f49, PR #2)
            ↓
       Content SHA-256 recorded in MANIFEST-SHA256.txt (845 entries)
       NOTE: 1 entry is an invalid self-reference (hash of empty file)
       Valid content entries: 844
            ↓
       Compared with HEAVIXIR/z-ai-2 main (commit 6fe1bd7)
            ↓
       Results in FILE-MATRIX.csv (792 files, 5 categories only)
```

## Integrity Verification

- All 13 ZIP SHA-256 hashes verified by downloading from GitHub and computing locally
- Extracted file count: 845 entries in dellk00k/z manifest
  - 844 valid content files from 10 ZIPs
  - 1 invalid self-reference (MANIFEST-SHA256.txt hash = SHA-256 of empty file)
  - Breakdown by category: src=690, prisma=39, public=38, scripts=25, tests=20, docs=18, .zscripts=10, examples=2, mini-services=1, download=1, MANIFEST=1
  - Note: No Prisma generated client files in manifest (removed during extraction)
- FILE-MATRIX.csv has 792 entries = only 5 categories compared (src=690, prisma=39, scripts=25, tests=20, docs=18)
  - Difference of 53 = public(38) + .zscripts(10) + examples(2) + mini-services(1) + download(1) + invalid MANIFEST self-reference(1)
- No files modified between download and comparison
- No secrets or sensitive data identified in extracted content

## Independent Verification Method

The dellk00k/z manifest's self-reference cannot be used for its own verification.
To independently verify:

1. Download all 10 extracted ZIPs from HEAVIXIR/z main branch
2. Compare each ZIP's SHA-256 with the 10 hashes in BASELINE.md
3. Extract each ZIP
4. Remove files under `*/generated/*` directories
5. Compute SHA-256 of every remaining file
6. Exclude the manifest file itself from the comparison
7. Compare the 844 computed hashes against the 844 non-self-referencing entries

This method is fully independent of the manifest's own hash.
