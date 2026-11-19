# Baseline — STEP 18.2.7.2

## Repository State

| Repository | HEAD SHA | Branch | Date |
|-----------|----------|--------|------|
| HEAVIXIR/z-ai-2 (current) | 6fe1bd79561c5afcc783249153a4ab7332d210a1 | main | 2026-10-29 |
| HEAVIXIR/z (legacy) | 217f98ecc800aa64ae4739d27ed2aeb95dd260ed | main | 2026-10-26 |
| dellk00k/z (fork, extracted) | bbb1f4947e4b1a05e39f7b510c5c7801d52389e7 | legacy/extracted-archives | 2026-11-03 |

## Archive Provenance — ALL 13 ZIPs

### Extracted (10 ZIPs)

| Archive | SHA-256 | Size (bytes) |
|---------|---------|-------------|
| src.zip | 5ec7314f356cc69646584f39d304fd0095f35240ac0f9ebbc2831161b3789496 | 10866241 |
| scripts.zip | 57346b79919d680662e2698d33fbc6ca079d5651ad415b95b69925d52b9ca93a | 62321 |
| prisma.zip | 03fb62fd41b10a34f4158a79738d510091615e20b117508abfd71346a7188848 | 203686 |
| tests.zip | baffb992037c7c40da1dd195faa945c8119f12eb1205d38a7d3d21e7780dbb61 | 32545 |
| docs.zip | 7096b79001bf05a93256290dfe7ce31f353cd1f3ea0c492a3c773744a83db6b4 | 55629 |
| public.zip | 18eb5868a59f2037ba5f130a1b267ff48be80a3f1581234d3bc7a78891ce0d5c | 3693360 |
| examples.zip | 399b45a6dc256d9a8f2ddbe96dc4d89afa9c277dbd4691563cc0a234f3f88bbe | 3703 |
| mini-services.zip | ede3e4c1db0b2d8eff1bdde03ff62fb08bc16e3212260236c74900e58e2b94fb | 376 |
| .zscripts.zip | 9891d8682e85ef37e00edfc5535ef1ddbacc62da20b941e9802730dcbfd50424 | 13543 |
| download.zip | 031a0ef099aaf5b1c5b0ecd4a9f28ae6dc6ddeb7a459ba368d631070231ca883 | 389 |

### Quarantined — NOT extracted (3 ZIPs)

| Archive | SHA-256 | Size (bytes) | Reason |
|---------|---------|-------------|--------|
| bun.zip | 65e944aa86c2179e76739c7d2230d79b5915ad41b1ef36a3c89011dda3b457e0 | 13873381 | Build artifact — Bun runtime + node_modules |
| db.zip | 57a997a51c26214d0554cf91641fdf03fcf0a2f4c4abefd79081b1ad04fb9e84 | 2399229 | Database files — sensitive |
| upload.zip | c788e05ae1ea99cc470658b7265dd6212249d4b954166eb373c13c3e7c2604ad | 2925087 | User uploads — sensitive |

All SHA-256 hashes verified by downloading each ZIP from `HEAVIXIR/z` main branch
and computing hash locally. No ZIP was modified between download and extraction.

## Method

1. Downloaded all 13 ZIPs from HEAVIXIR/z main branch (commit 217f98e)
2. Computed SHA-256 for each ZIP — all 13 hashes recorded above
3. Extracted 10 ZIPs to local filesystem (3 quarantined)
4. Removed Prisma generated client files during extraction (build artifacts)
5. Computed SHA-256 for every extracted file → dellk00k/z MANIFEST-SHA256.txt
6. Retrieved HEAVIXIR/z-ai-2 main tree via GitHub API
7. Compared file paths and content (SHA-256) between old and current
8. Generated FILE-MATRIX.csv with status: SAME / CHANGED / ONLY_OLD

## Dellk00k/z Manifest Issue

The `dellk00k/z` `MANIFEST-SHA256.txt` contains 845 entries, including one
self-referencing entry for itself:

```
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  extracted/MANIFEST-SHA256.txt
```

The hash `e3b0c442...` is the SHA-256 of an **empty file** — it was computed
before any content was written to the manifest. This self-reference is invalid
and cannot be used for integrity verification.

### Independent Verification Method

To independently verify the dellk00k/z manifest:

1. Download all 10 ZIPs from `HEAVIXIR/z` main branch
2. Compute SHA-256 of each ZIP — compare with the 10 hashes in the table above
3. Extract each ZIP to a temporary directory
4. Remove any files under `*/generated/*` directories
5. Compute SHA-256 of every remaining file
6. Compare results with the 844 non-self-referencing entries in the manifest
7. The self-referencing entry (line containing `MANIFEST-SHA256.txt`) must be excluded

This method does not depend on the manifest's own hash for verification.

## Discrepancy Explanation: 845 vs 792

| Count | Source | Explanation |
|-------|--------|-------------|
| 845 | `dellk00k/z` MANIFEST-SHA256.txt | All extracted files from 10 ZIPs + 1 invalid self-reference |
| 792 | FILE-MATRIX.csv | Only 5 categories compared (src, scripts, prisma, tests, docs) |
| 53 | Difference | Files from other ZIPs + invalid self-reference |

The 53 excluded files are:
- public.zip contents: 38 files (not compared in FILE-MATRIX)
- .zscripts.zip contents: 10 files (not compared)
- examples.zip contents: 2 files (not compared)
- mini-services.zip contents: 1 file (not compared)
- download.zip contents: 1 file (not compared)
- MANIFEST-SHA256.txt: 1 file (invalid self-reference in dellk00k/z manifest)

Note: Prisma generated client files were removed during extraction and are
NOT present in the 845-entry manifest. The earlier explanation attributing
the difference to "53 generated files" was incorrect and is superseded.

Verification: 690 (src) + 39 (prisma) + 25 (scripts) + 20 (tests) + 18 (docs) = 792

## Manifest Verification (legacy-files)

The `legacy-files/MANIFEST-SHA256.txt` contains 28 entries:
- 27 legacy files (23 adapt + 4 reject)
- 1 README.md
- 0 self-references (manifest file itself excluded)
