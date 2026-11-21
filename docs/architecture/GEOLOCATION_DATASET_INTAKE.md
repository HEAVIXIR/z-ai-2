# First-party location dataset intake (dry-run only)

This contract defines the reviewed JSON hand-off format for HEAVIX's canonical
Country → Province → City hierarchy. It does not import records or connect to
Prisma, Preview, or Production.

## Files

- `dataset.json`: normalized records and stable source identifiers.
- `manifest.json`: provenance, license, rights decision, and SHA-256.

Example dataset:

```json
{
  "countries": [{ "sourceCode": "IR", "name": "ایران", "nameEn": "Iran" }],
  "provinces": [{ "sourceCode": "IR-THR", "name": "تهران", "countryCode": "IR" }],
  "cities": [{
    "sourceCode": "IR-THR-TEH",
    "name": "تهران",
    "provinceCode": "IR-THR",
    "latitude": 35.7,
    "longitude": 51.4
  }]
}
```

Example manifest:

```json
{
  "sourceUrl": "https://example.org/source",
  "sourceName": "Publisher and dataset title",
  "license": "Exact license identifier and URL",
  "sourceVersion": "publisher version",
  "sourceDate": "YYYY-MM-DD",
  "sha256": "64-character SHA-256 of the exact dataset.json bytes",
  "rightsReviewStatus": "PENDING",
  "commercialUseAllowed": false
}
```

## Validation

Run:

```sh
node scripts/geospatial/validate-location-dataset.mjs dataset.json manifest.json
```

The command is read-only and emits `mode: DRY_RUN_ONLY`. It checks provenance,
checksum, stable codes, normalized duplicate names within a parent, hierarchy
references, and coordinate pairing/ranges. It rejects orphaned records.
County and district rows remain distinct from City and are not imported through
this contract.

## Import gate

Structural validity is not legal permission. Import eligibility requires both
`rightsReviewStatus: "APPROVED"` and `commercialUseAllowed: true`, plus a
valid manifest and matching checksum. Those values must reflect a documented
human legal/data-rights review; they must never be inferred from a repository
README or a file's public availability.

No importer, database write, seed, migration, or production action is included
in this stage. A future importer must be separately reviewed, idempotent,
transactional, rollback-capable, and run only after explicit approval.


## Iran 1404 source conversion (no import)

The deterministic converter accepts the source repository's five-column CSV
(`Id`, `ParentCountryDivisionId`, `Name`, `Code`, `DivisionType`) and
resolves each City through its County and District ancestors to Province.
It preserves source IDs, raw codes, division type, and ancestry. Urban zones,
villages, and other administrative levels are counted in source metadata but
are not reclassified as City.

Run after obtaining the exact source CSV from
`Hameds/IranCountryDivisions/data/1404/iran.csv`:

```sh
node scripts/geospatial/convert-iran-divisions.mjs \
  ./iran.csv ./build/iran-1404 YYYY-MM-DD
node scripts/geospatial/validate-location-dataset.mjs \
  ./build/iran-1404/dataset.json ./build/iran-1404/manifest.json
```

The converter refuses unexpected hierarchy counts (1 country, 31 provinces,
1,481 cities), duplicate IDs/codes, orphan ancestry, and malformed CSV. The
source date is an explicit argument and must be confirmed from the publisher
metadata before use. It emits a dataset SHA-256 and a separate source-file
SHA-256. Rights status remains `PENDING` and commercial use remains disabled;
conversion does not imply approval. Output is a local review artifact only:
there is no database, Preview, or Production write path.


## Canonical Iran location catalog and stable source codes

The current first-party dataset is
`prisma/data/iran-locations-1404.json` with its SHA-256 manifest and README.
It exposes only Country → Province → City for the listing selector. The
existing upstream projection contains 1 country, 31 provinces, and 1,479
distinct city labels (from 1,481 source records; two same-province duplicate
labels were collapsed by the pre-existing dataset).

Province and City now have nullable, unique `sourceCode` columns in both
PostgreSQL and Preview/SQLite schemas. The additive migration
`20261120113000_location_source_codes` adds those columns and unique indexes;
existing records remain valid with NULL codes. The reviewed seed upserts by
the existing natural keys and fills sourceCode without replacing city names,
coordinates, or other curated metadata.

The migration file has been authored but not executed. The seed remains
fail-closed while the manifest is pending; no database write has occurred.
