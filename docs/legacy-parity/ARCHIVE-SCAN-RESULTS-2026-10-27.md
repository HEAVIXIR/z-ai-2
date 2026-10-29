# Legacy ZIP archive scan results

**Scan date:** 2026-10-27  
**Source repository:** `HEAVIXIR/z` at pinned source commit `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`  
**Scanner:** `scripts/audit-legacy-archives.py`  
**Evidence:** GitHub Actions run [40487144945](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40487144945), job [122131668632](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40487144945/job/122131668632)  
**Scope:** Metadata inventory and bounded text-pattern scanning only. No archive member was extracted to disk or executed. Matched values were not printed.

## Aggregate result

| Metric | Result |
|---|---:|
| Top-level ZIP archives | 13 |
| Valid ZIP archives | 13 |
| Archive entries (includes directories and duplicate members across bundles) | 2,751 |
| File entries (not unique logical paths) | 1,715 |
| Text entries scanned (bounded by scanner limits) | 1,652 |
| Code/config path candidates | 576 |
| Secret-pattern hits | 17 |
| Sensitive-path candidates | 7 |
| Unsafe archive paths | 0 |
| Symlinks | 0 |
| Total redacted findings | 24 |

**Important counting note:** these are archive-entry counts, not the 899 unique logical paths from the earlier cross-archive disposition audit. The metrics have different grains and must not be substituted for one another.

## Per-archive results

| Archive | Bytes | Entries | Files | Text scanned | Code/config candidates | Secret-pattern hits | Sensitive-path candidates |
|---|---:|---:|---:|---:|---:|---:|---:|
| `.zscripts.zip` | 13,543 | 11 | 10 | 9 | 0 | 0 | 0 |
| `bun.zip` | 13,873,381 | 1,330 | 821 | 809 | 290 | 9 | 4 |
| `db.zip` | 2,399,229 | 8 | 6 | 0 | 0 | 0 | 3 |
| `docs.zip` | 55,629 | 19 | 18 | 18 | 0 | 1 | 0 |
| `download.zip` | 389 | 2 | 1 | 1 | 0 | 0 | 0 |
| `examples.zip` | 3,703 | 4 | 2 | 2 | 0 | 0 | 0 |
| `mini-services.zip` | 376 | 2 | 1 | 0 | 0 | 0 | 0 |
| `prisma.zip` | 203,686 | 43 | 39 | 39 | 5 | 0 | 0 |
| `public.zip` | 3,693,360 | 48 | 38 | 8 | 0 | 0 | 0 |
| `scripts.zip` | 62,321 | 26 | 25 | 25 | 0 | 0 | 0 |
| `src.zip` | 10,866,241 | 1,217 | 717 | 715 | 281 | 5 | 0 |
| `tests.zip` | 32,545 | 23 | 20 | 20 | 0 | 1 | 0 |
| `upload.zip` | 2,925,087 | 18 | 17 | 6 | 0 | 1 | 0 |

## Findings requiring safe handling

- The scanner reported **17 secret-pattern matches** across bundled text files. These are pattern hits, not independently confirmed live credentials; values were deliberately not emitted. Several paths repeat across bundles, so hit count is not the count of unique secrets.
- A `.env` path was identified in `bun.zip`. Keep it excluded from Git. If any value may have been real and active, a privileged operator should assess rotation using a secret-safe workflow; do not paste values into issues, PRs, or logs.
- Seven sensitive-path findings were database-backup candidates, including three backup paths under `db/backups/` in `bun.zip` and `db.zip`. Do not import database bytes into the target repository.
- The `upload.zip` bundle includes uploaded database/image/archive/document artifacts. Preserve provenance and metadata only until each item is separately approved for a safe documentation treatment.
- The scan found zero unsafe archive paths and zero symlinks in the inventory. This does not prove the contents are safe to execute or integrate.

## Governance decision

1. **Do not bulk-copy the ZIPs or their contents into `main`.**
2. Keep `.env`, database files/backups, unverified images, patch ZIPs, migration archives, and workspace dumps out of Git.
3. Treat the 17 secret-pattern hits as unresolved review items until classified as placeholder/example versus potentially live credential. This scan intentionally does not disclose the matched values.
4. Use the canonical four-way disposition manifest for the 899 unique logical paths: INTEGRATE (already present), ADAPT_THEN_INTEGRATE (new code only through separate tested PRs), PRESERVE_AS_REFERENCE (provenance-preserving docs), and SAFE_ARCHIVE (redacted manifests only).
5. This scan is inventory evidence, **not** a code review, secret validation, or authorization to merge any runtime change.

## Reproduction

The workflow checked out the legacy source at the pinned commit and ran:

```sh
python scripts/audit-legacy-archives.py --root "$RUNNER_TEMP/heavix-legacy" --report "$RUNNER_TEMP/legacy-archive-inventory.txt"
```

The scanner reads bounded text entries in-memory for pattern matching; it does not extract members to the filesystem or execute archive contents.
