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
