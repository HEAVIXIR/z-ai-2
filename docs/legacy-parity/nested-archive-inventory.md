# Nested ZIP archive inventory — read-only

Nested ZIPs embedded in upload.zip were inspected in memory only; no files were extracted or executed.

## upload/HEAVIX-EXECUTABLE-HARDENING-PATCH-V1.0.zip

- Compressed bytes: 9654
- ZIP entries: 9
- Missing candidates: 4
- Same-path conflicts: 4
- Identical files: 1
- Excluded/special-review entries: 0
- Unsafe paths skipped: 0

### Missing candidates — 4
- docs/README.md (2805 bytes; sha256 79da57f4a45b8518)
- scripts/prepare-standalone.mjs (649 bytes; sha256 3a5c9402bcec4ead)
- scripts/audit-ai-gateway.mjs (817 bytes; sha256 275aa96807778f15)
- scripts/audit-admin-rbac.mjs (952 bytes; sha256 ce92d51d79557d9d)

### Conflicts — 4
- next.config.ts (archive faffe33cdb80b0b5, current 58c07768d56c6a29)
- package.json (archive 4c45fb54ff3e6427, current daa8703a7642c9ea)
- src/lib/rbac.ts (archive 79f04f1cd82f731c, current 1c5025dfca09153c)
- src/lib/api-helpers.ts (archive 78bc45f03e1d2feb, current 72f4b385feb8678c)

### Identical files — 1
- src/lib/email.ts (sha256 8615a283a7fb491f)

### Excluded or special review — 0

## upload/heavix-postgres-migration-changes.zip

- Compressed bytes: 211336
- ZIP entries: 13
- Missing candidates: 1
- Same-path conflicts: 10
- Identical files: 0
- Excluded/special-review entries: 1
- Unsafe paths skipped: 0

### Missing candidates — 1
- prisma/store-schema.prisma (13139 bytes; sha256 5743faa3d90aafc3)

### Conflicts — 10
- prisma/schema.prisma (archive 9f737c96f2318a5e, current 2119b9d14ef4d990)
- prisma/legacy-sqlite/schema.prisma (archive 11ceb0f7ff9d9c68, current 08f86651854f8417)
- prisma/legacy-sqlite/store-schema.prisma (archive c435fa65cb4ec76e, current 1f8475565e58e7c8)
- docker-compose.yml (archive 0d42a764e63e951e, current 783519da9d4f11c5)
- package.json (archive b1c006a07d8e92a4, current daa8703a7642c9ea)
- scripts/migrate-sqlite-to-postgres.ts (archive ff26998cd7c85c13, current e99fcc716d9f8458)
- docs/ADR-001-database-strategy.md (archive 6f11fac67510f4db, current 4486a0acb0c96a32)
- worklog.md (archive fea3d41669cbfa4c, current cf0cde5185c812fb)
- src/lib/store-db.ts (archive ac91a7af4de2332a, current 5aed1e248c8d4e76)
- src/lib/store-auth.ts (archive 7267cc3bb0e2988a, current e369cc5547e9c8f3)

### Identical files — 0

### Excluded or special review — 1
- .env — EXCLUDE_SECRET_OR_KEY

## upload/HEAVIX-PRICE-COMPARISON-DOCUMENTS-V1.0.zip

- Compressed bytes: 4765
- ZIP entries: 2
- Missing candidates: 2
- Same-path conflicts: 0
- Identical files: 0
- Excluded/special-review entries: 0
- Unsafe paths skipped: 0

### Missing candidates — 2
- HEAVIX-PRICE-ESTIMATION-SPEC-V1.0.md (5401 bytes; sha256 7b0c83139aa82ef9)
- HEAVIX-MACHINE-COMPARISON-SPEC-V1.0.md (4579 bytes; sha256 ac62b6a70243534c)

### Conflicts — 0

### Identical files — 0

### Excluded or special review — 0

