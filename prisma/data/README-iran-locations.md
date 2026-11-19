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
- City: `IR-CITY-{provinceSourceId}-{normalizedPersianName}`

City identifiers are deterministic for this source snapshot. Names and source
IDs are preserved; missing English names and coordinates remain null/absent
rather than being fabricated. City centroid coordinates are not equipment
coordinates.

## Integrity

The exact bytes of `iran-locations-1404.json` are SHA-256 checked against
`iran-locations-1404.manifest.json`. The manifest records the source blob SHA,
counts, GPL-3.0 provenance, and the current rights gate:

- `rightsReviewStatus: PENDING`
- `commercialUseAllowed: false`

No database import, seed execution, migration, Preview write, or Production
write was performed by generating this file. The import gate must be reviewed
and explicitly approved before this dataset is seeded into a database.
