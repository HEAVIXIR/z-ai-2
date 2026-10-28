# Legacy SQLite snapshot inventory

- **Source:** `HEAVIXIR/z` at `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`
- **Classification:** DATABASE_DATA / SAFE_ARCHIVE
- **Policy:** The database payloads are not committed, opened, restored, or used to seed current environments by this inventory.

| Legacy path | Approximate size in audit | Recorded context | Disposition |
|---|---:|---|---|
| `db/backups/custom-20260921-023810.db` | 2.4 MB | Timestamped main-DB snapshot, 2026-09-21 02:38:10 | Preserve metadata only |
| `db/backups/custom-20260921-024013.db` | 2.4 MB | Timestamped main-DB snapshot, 2026-09-21 02:40:13 | Preserve metadata only |
| `db/backups/custom-20260921-025202.db` | 2.4 MB | Timestamped main-DB snapshot, 2026-09-21 02:52:02 | Preserve metadata only |
| `db/custom.db` | 2.5 MB | Main SQLite workstation snapshot | Preserve metadata only |
| `db/custom.db.before-restore` | 2.4 MB | Pre-restore main-DB snapshot | Preserve metadata only |
| `db/store.db` | 336 KB | Store SQLite workstation snapshot | Preserve metadata only |
| `upload/custom-20260921-024013.db` | 2.4 MB | Reported duplicate of the matching `db/backups/` snapshot; byte identity must not be assumed without a hash comparison | Preserve metadata only |
| `upload/custom-20260921-025202.db` | 2.4 MB | Reported duplicate of the matching `db/backups/` snapshot; byte identity must not be assumed without a hash comparison | Preserve metadata only |

The audit did not inspect database contents. Model counts in legacy Prisma schema files are not a database table inventory and must not be presented as proof of the tables or rows inside these files. Per-file SHA-256 values are omitted here because they have not been independently verified in this PR.

Do not import these snapshots into the target project. Any future data migration requires a separately authorized, isolated migration plan, backup/restore evidence, data classification, and the current Store/Outbox operational gate.
