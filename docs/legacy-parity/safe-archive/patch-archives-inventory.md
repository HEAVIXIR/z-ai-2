# Legacy patch and migration archive inventory

- **Source:** `HEAVIXIR/z` at `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`
- **Classification:** PATCH_ARCHIVE / MIGRATION_ARCHIVE / SAFE_ARCHIVE
- **Policy:** Untrusted archive payloads are not committed, extracted, or executed by this record.

| Legacy path | Approximate size | Recorded context | Disposition |
|---|---:|---|---|
| `upload/HEAVIX-EXECUTABLE-HARDENING-PATCH-V1.0.zip` | 9.4 KB | Executable hardening patch prepared during a development session on 2026-09-21 | Preserve metadata only; no patch application |
| `upload/HEAVIX-PRICE-COMPARISON-DOCUMENTS-V1.0.zip` | 4.7 KB | Price-comparison documents archive | Preserve metadata only; inspect documents separately if needed |
| `upload/heavix-postgres-migration-changes.zip` | 206.4 KB | Historical PostgreSQL migration-change bundle associated with SQLite-to-PostgreSQL cutover planning | Preserve metadata only; do not apply |

Archive member listings and per-file hashes are not reproduced here because they have not been independently revalidated in this PR. Do not treat an archive title as evidence of its contents, safety, or compatibility. Any desired implementation must be reconstructed from reviewed text/source, reconciled with current contracts, tested, and submitted in a dedicated PR.
