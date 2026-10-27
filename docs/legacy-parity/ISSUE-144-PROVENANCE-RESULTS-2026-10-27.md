# Issue #144 — archive member provenance results

**Audit date:** 2026-10-27  
**Legacy repository/ref:** [HEAVIXIR/z](https://github.com/HEAVIXIR/z/tree/217f98ecc800aa64ae4739d27ed2aeb95dd260ed)  
**Target baseline:** `z-ai-2/main` at `ddc52e2f5b57f709cb3016284d0ba6abe31b6d6b`  
**Reproducible run:** [GitHub Actions run 40519909757](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40519909757)  
**Artifact:** `legacy-member-provenance` (artifact ID `12741047324`, SHA-256 `94b7d64460d62e0b0d9a4d11e115f33f2d8ceda868c615aa567c3bbf7bbe7364`, expires 2026-11-26)

## Results from the generated artifact

| Measure | Result |
|---|---:|
| Root ZIP archives | 13 |
| File-member occurrences across archives | 1,715 |
| Unique member paths | 909 |
| Unique member-path + content-SHA-256 pairs | 909 |
| Unique paths represented in the disposition manifest | 54 |
| Manifest paths found in the archives | 54 |
| Unique paths present in the target Git tree | 855 |
| Unique target paths with at least one archived content version differing from current main | 331 |
| Unmapped unique paths (neither in manifest nor tracked in target) | 0 |

The inventory has two CSVs: one row per archive/member occurrence and a deduplicated member-path/content-hash view. Each row retains source archive provenance. For paths tracked in the target repository, the report compares the archived member SHA-256 with the current tracked file SHA-256.

## Interpretation

- All 54 manifest paths are present in the pinned legacy archive and have an explicit existing EXCLUDE / REJECT / HOLD / REWRITE disposition.
- The remaining 855 unique paths are already tracked in the current target tree. A differing historical content hash is evidence of version drift, not permission to overwrite current code.
- The 331 target-path differences are counted at the unique path level; several ZIP snapshots overlap and may contain different versions of the same historical file.
- No unique path was left outside both the manifest and the current target tree in this generated inventory.
- This is provenance evidence, not a manual line-by-line review of all 909 historical file versions. The existing line-by-line audit remains scoped to the manifest's HOLD / REWRITE candidates; no legacy code transfer is approved.

## Safety and limits

The workflow reads archive members in memory, without extracting or executing them. It emits paths, hashes, sizes, CRCs, and dispositions only; no member contents or secret values are emitted. No application code, schemas, database files, credentials, or uploads are imported. No production database, deployment, DNS, paid resource, or Worker was touched.

The detailed CSV artifact is retained for 30 days and can be regenerated from the pinned source ref with the committed script and workflow. Production deployment, database mutations, backfills, Worker activation, DNS changes, and wholesale legacy import remain NO-GO.
