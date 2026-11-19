# HEAVIX Iran location catalog — 1404

This is the normalized, first-party HEAVIX location catalog for the current
listing selector. Its public hierarchy is deliberately limited to:

`Country → Province → City`

## Contents

- 1 country: Iran (`IR`)
- 31 provinces
- 1,479 distinct selectable city labels
- No county, district, rural-district, village, or urban-zone entities

The source snapshot reports 1,481 real-city records. Two same-name records
within a province were collapsed in the pre-existing HEAVIX source file because
the current Prisma City model has a unique key on `(provinceId, name)`.
The catalog preserves this count difference explicitly; it does not invent
replacement cities or silently treat counties/urban zones as cities.

## Provenance

This file was generated deterministically from the existing repository file
`prisma/data/iran-cities-1404.json`, which records:

- Upstream: `sajaddp/list-of-cities-in-Iran`
- Upstream release: `3.1.2`
- Administrative source year: `1404`
- Upstream declared data license: `GPL-3.0`

The upstream project is the publisher of the compiled snapshot, not a
government authority. The original source workbook and its publisher are
described in `README-iran-cities.md`. Keep provenance and the declared
license attached to all copies and derivatives.

## Stable identifiers

- Country: `IR`
- Province: `IR-PROV-{sourceId}`
- City: `IR-CITY-{provinceSourceId}-{unicodeCodePointSequence}`

City identifiers are deterministic for this source snapshot. Names and source
IDs are preserved; missing English names and coordinates remain null/absent
rather than being fabricated. City centroid coordinates are not equipment
coordinates.

## Reproducible generation

The normalized catalog is generated from the existing bundled source file by:

```sh
bun run data:locations:check
bun run data:locations:build
```

The check command is read-only and exits non-zero if either generated file
drifts. The build command writes only the two catalog files; it has no
database, migration, Preview, or Production connection.

## Controlled database seed

A separate idempotent seed runner is available:

```sh
bun run db:seed-iran-locations
```

This is a **dry-run by default**. It verifies the exact dataset bytes against
the manifest SHA-256, checks the 1 + 31 + 1,479 hierarchy and stable source
codes, prints the proposed upsert counts, and does not instantiate Prisma or
open a database connection.

The apply path is deliberately gated and is not part of normal deployment:

```sh
HEAVIX_ENV=preview HEAVIX_ALLOW_PREVIEW_LOCATION_SEED=1 \
  bun run db:seed-iran-locations -- --apply --confirm-preview-location-seed
```

Even with those flags, apply remains blocked while the manifest rights gate is
pending. After a separately documented approval, the runner may only write to
Preview. It upserts by stable source code or existing parent/name unique keys,
preserves existing city coordinates when present, inserts no fabricated
coordinates, and never deletes records. It does not run migrations.

## Integrity

The exact bytes of `iran-locations-1404.json` are SHA-256 checked against
`iran-locations-1404.manifest.json`. The manifest records the source blob SHA,
counts, GPL-3.0 provenance, and the current rights gate:

- `rightsReviewStatus: PENDING`
- `commercialUseAllowed: false`

No database import, seed execution, migration, Preview write, or Production
write was performed by generating this file. The import gate must be reviewed
and explicitly approved before this dataset is seeded into a database.
