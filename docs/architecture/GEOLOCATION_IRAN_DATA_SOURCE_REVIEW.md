# Iran administrative dataset source review

## Alternative source reviewed (not used for current catalog)

- Repository: https://github.com/Hameds/IranCountryDivisions
- Dataset path: `data/1404/iran.csv` and `data/1404/metadata.json`
- Original source workbook: `source/1404/geo_1404.xlsx`
- Publisher/source stated by the repository: Statistical Center of Iran (مرکز آمار ایران), annual geographic file for 1404
- Repository license declaration: MIT
- Dataset version: Solar Hijri 1404
- Source repository README documents the original workbook and address-standard document in the repository.

This alternative is documented because it exposes the original annual workbook, a normalized machine-readable export, stable source codes, explicit division types, and metadata counts. It was not used to generate the current bundled HEAVIX catalog. Its repository-declared MIT license is recorded only as that repository's declaration and is not automatically attributed to the original publisher's source data.

## Published 1404 counts

| Division | Count |
|---|---:|
| Country | 1 |
| Province | 31 |
| County (شهرستان) | 484 |
| District (بخش) | 1,193 |
| Rural district (دهستان) | 2,777 |
| City (شهر) | 1,481 |
| Village (آبادی) | 99,317 |
| Urban zone (منطقه شهری) | 191 |
| Total rows | 105,475 |

Important semantic distinction: the source classifies 1,481 actual cities and 191 urban zones separately. Do not report 1,672 as the number of real cities.

## Normalization requirements for HEAVIX

The source is a full administrative tree, not a direct Country → Province → City tree:

`Country → Province → County → District → City`

The HEAVIX location selector currently targets Country → Province → City. A deterministic normalization must therefore:
1. Preserve the source's original row identifiers, source codes, division type, and parent references in the intake artifact.
2. Resolve each City through its full parent chain and derive its canonical Province source code.
3. Exclude urban zones from the City entity list; retain them separately as optional sub-city geography.
4. Keep County, District, Rural District, and Village semantically distinct. Never relabel a county as a city.
5. Validate all 31 provinces and the full city count (1,481) against the source metadata before a dataset can pass.
6. Preserve Persian names exactly as supplied; any normalization or aliases must be additive and auditable.
7. Store source URL, source version/year, source workbook reference, retrieval timestamp, SHA-256, and license/provenance in the manifest.

## Secondary candidate

`open-admin-data/iran-administrative-divisions` declares CC-BY-4.0 and provides 31 provinces and 429 counties with coordinates. It is useful as a secondary comparison source, but it does not expose the same full 1404 city-level hierarchy in the reviewed README, so it is not selected as the primary city catalog.

## Execution status and boundaries

- This alternative source review is documentation only; the current bundled catalog was generated from the existing `sajaddp` snapshot described below.
- No database, Preview, or Production writes were performed.
- No Prisma migration, seed, deploy, or merge was performed.
- A deterministic converter and validator for this alternative CSV format have been implemented and unit-tested with synthetic fixtures. The actual `Hameds/IranCountryDivisions/data/1404/iran.csv` file has not been acquired or converted; no claim is made that its 1,481 source rows were processed.
- The data source is for the canonical location catalog only. It is not a source of precise listing/equipment coordinates.


## Existing bundled source and generated HEAVIX catalog (2026-11-20)

Repository inspection found an existing bundled snapshot at
`prisma/data/iran-cities-1404.json`, with its own source README and GPL-3.0
license file. That file is published from `sajaddp/list-of-cities-in-Iran`
release 3.1.2 and already contains the 31-province / 1,479-distinct-city
projection. Its metadata reports 1,481 source real-city records and two
same-province duplicate-name records collapsed for the current
`(provinceId, name)` database uniqueness rule.

To meet the Country → Province → City requirement without adding county,
district, or village entities, a normalized catalog was generated from that
existing file:

- `prisma/data/iran-locations-1404.json`
- `prisma/data/iran-locations-1404.manifest.json`
- `prisma/data/README-iran-locations.md`

The generated catalog contains 1 country, 31 provinces, and 1,479 distinct
city entries. It uses deterministic source codes, preserves the source year,
release, count discrepancy, and source provenance. English names and city
coordinates are not present in the source snapshot and have not been invented.

**Important:** the existing bundled source declares GPL-3.0. The generated
catalog therefore retains GPL-3.0 provenance; it is not relabeled MIT or
treated as rights-cleared. Its manifest remains `rightsReviewStatus: PENDING`
and `commercialUseAllowed: false`. A fail-closed seed preflight prevents
database seeding until the manifest is explicitly approved. No database import
or seed execution has been performed.

The previously reviewed Hameds/IranCountryDivisions source remains a separate
candidate and was not used to generate this current catalog. Its availability
does not alter the provenance of the already-bundled sajaddp-derived data.
