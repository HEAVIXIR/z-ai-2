# HEAVIX legacy archive and extraction reconciliation — 2026-11-11

## Result

The earlier transfer from `HEAVIXIR/z` into `dellk00k/z` is a verified continuation of the same legacy source snapshot, not a separate or unrelated copy.

- Source repository: `HEAVIXIR/z`, commit `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`.
- Extracted/reference repository: `dellk00k/z`, commit `bbb1f4947e4b1a05e39f7b510c5c7801d52389e7`, branch `legacy/extracted-archives`.
- Both immutable Git trees contain the same 13 root ZIP archives. For every archive, the Git blob SHA and byte size match exactly across the two repositories.
- The extraction branch contains 10 extracted archive families; `db.zip`, `upload.zip`, and `bun.zip` remain unextracted/quarantined as documented by its README and QUARANTINE.md.
- The extracted tree contains 844 payload files plus three bookkeeping files (`README.md`, `QUARANTINE.md`, and `MANIFEST-SHA256.txt`). The SHA-256 manifest has 845 entries because it includes its own empty-file SHA-256 line; excluding that self-entry leaves 844 payload entries. All 844 payload paths are present in the extracted tree and every payload path is represented exactly once in the manifest.
- The README's per-archive extracted counts sum to 844: src 690 (717 minus generated), scripts 25, prisma 39, tests 20, docs 18, public 38, examples 2, mini-services 1, .zscripts 10, download 1.

## Archive identity evidence

The following Git blob SHA-1 values and byte sizes were independently compared between the source and extracted/reference repository trees. These are Git object identifiers, not SHA-256 claims.

| Archive | Git blob SHA (identical in both repos) | Bytes |
|---|---|---:|
| .zscripts.zip | f1deaef5df137fa3030f23b1f4fd49278df8d206 | 13,543 |
| bun.zip | 6b4245b219faf0802d2551bccf363ffefd73f035 | 13,873,381 |
| db.zip | 8636cc242d5a9ce286184883a8a8618612afe244 | 2,399,229 |
| docs.zip | 7a93f8019c0873fa5072dfe51660d637546695c6 | 55,629 |
| download.zip | 1f08fdb2ef5fad75f9079399929ce59088569c4f | 389 |
| examples.zip | 0505b2524db43464cb713c97e3146421cb171088 | 3,703 |
| mini-services.zip | 646388ccca97e758a5ae5c9f49d74507fe5097e3 | 376 |
| prisma.zip | 61dfea34a190e9c10182af0730c9294a7e4f0b21 | 203,686 |
| public.zip | 0824876be8869da9e1c710d204ed0b4066b355cd | 3,693,360 |
| scripts.zip | 99cff7bcc28485a30c66f58d33ab6307cf5a2a08 | 62,321 |
| src.zip | bde7edf9eba62bbf9d38582572fbadd7e4bc6081 | 10,866,241 |
| tests.zip | 610bbda6233239ac7cd5649e18b2420cadf2ccd6 | 32,545 |
| upload.zip | 5325f8e14a745ff777a5a8f735d20741004a7cc6 | 2,925,087 |

## Count semantics — do not conflate these numbers

1. The source archive inventory reports 13 ZIP files and 899 unique logical paths across archive members. The separate security scan reports 1,715 file entries across archive versions; that is a different grain.
2. The extracted staging README reports 10 extracted archives and a per-archive total of 844 payload files after generated files were removed. Its SHA-256 manifest has 845 rows because it contains a self-reference row for the empty manifest file.
3. The historical value-based disposition has 899 source logical paths: 845 INTEGRATE, 17 ADAPT_THEN_INTEGRATE, 19 PRESERVE_AS_REFERENCE, and 18 SAFE_ARCHIVE. Those are dispositions against historical target `z-ai-2/main@833bec6169a214319857b2ac1cfadfa6bf195a88`; the 845 INTEGRATE count is not the staging file count.
4. The extracted 844 payload files are not the whole 899-path source inventory: three archives were quarantined and generated artifacts were removed. Reconciliation must preserve those exclusions and recover the archive-level manifests/provenance rather than assuming the extracted branch contains all source paths.

## Security and handling

- No ZIP bytes were downloaded, extracted, or executed in this reconciliation.
- No `.env`, database, upload, patch, or workspace archive contents were read.
- The existing quarantine policy remains in force. Never import `db.zip`, `upload.zip`, or `bun.zip` contents into the application repository.
- The extracted branch remains read-only. Do not push to `dellk00k/z`; current application work stays on the HEAVIXIR recovery branch.

## Next executable migration steps

1. Build a normalized path+SHA-256 comparison of all 844 extracted payload files against the current recovery branch tree. Strip only the known extraction prefixes (for example `extracted/src/src/` → `src/`) and preserve the original path in provenance.
2. Reconcile the resulting file-level results with the historical 899-path four-way disposition manifest; do not rewrite old decisions without a documented reason.
3. Re-run the archive-level scanner against the pinned source commit through the existing read-only CI workflow. The green run #42982227259 skipped `Legacy archive inventory (read-only)`, so it is not evidence that this refresh ran.
4. Refresh the 17-item ADAPT_THEN_INTEGRATE backlog against current branch head and track each adaptation through implementation, tests, and acceptance.
5. Continue the product-area parity matrix; route/component presence alone is not acceptance.

## Evidence

- Source tree: https://api.github.com/repos/HEAVIXIR/z/git/trees/217f98ecc800aa64ae4739d27ed2aeb95dd260ed?recursive=1
- Extracted tree: https://api.github.com/repos/dellk00k/z/git/trees/bbb1f4947e4b1a05e39f7b510c5c7801d52389e7?recursive=1
- Extraction README: https://github.com/dellk00k/z/blob/bbb1f4947e4b1a05e39f7b510c5c7801d52389e7/extracted/README.md
- Extraction SHA-256 manifest: https://github.com/dellk00k/z/blob/bbb1f4947e4b1a05e39f7b510c5c7801d52389e7/extracted/MANIFEST-SHA256.txt
- Quarantine declaration: https://github.com/dellk00k/z/blob/bbb1f4947e4b1a05e39f7b510c5c7801d52389e7/extracted/QUARANTINE.md
- Source archive scan: https://github.com/HEAVIXIR/z-ai-2/blob/recovery/heavix-full-product-integration-2026-11-11/docs/legacy-parity/ARCHIVE-SCAN-RESULTS-2026-10-27.md
- Canonical historical disposition: https://github.com/HEAVIXIR/z-ai-2/blob/recovery/heavix-full-product-integration-2026-11-11/docs/legacy-parity/VALUE-BASED-DISPOSITION-2026-10-27.md
