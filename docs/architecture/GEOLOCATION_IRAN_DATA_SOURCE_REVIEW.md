# Iran administrative dataset source review

## Selected primary candidate

- Repository: https://github.com/Hameds/IranCountryDivisions
- Dataset path: `data/1404/iran.csv` and `data/1404/metadata.json`
- Original source workbook: `source/1404/geo_1404.xlsx`
- Publisher/source stated by the repository: Statistical Center of Iran (مرکز آمار ایران), annual geographic file for 1404
- Repository license declaration: MIT
- Dataset version: Solar Hijri 1404
- Source repository README documents the original workbook and address-standard document in the repository.

This is the strongest candidate found so far because it exposes the original annual source workbook, a normalized machine-readable export, stable source codes, explicit division types, and a metadata count report. The MIT declaration is recorded as the repository's declared license; source provenance is also retained separately rather than treating the license badge as a substitute for recording the original publisher.

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

- Source review only; no dataset has been imported into HEAVIX.
- No database, Preview, or Production writes were performed.
- No Prisma migration, seed, deploy, or merge was performed.
- Next technical stage: build a deterministic converter/validator for the 1404 source export, verify the 1,481 city rows and parent ancestry, then commit the normalized intake artifact and its manifest to a dedicated review branch.
- The data source is for the canonical location catalog only. It is not a source of precise listing/equipment coordinates.
