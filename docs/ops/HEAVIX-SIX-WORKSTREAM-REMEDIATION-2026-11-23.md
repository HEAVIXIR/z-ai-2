# HEAVIX Six-Workstream Preview Remediation — 2026-11-23

## Scope

This work is tracked as six parallel, independently verifiable workstreams against the Integration Preview baseline. The branch is isolated; no production deployment or database mutation/seed is performed by this change.

## Confirmed source-level findings

### 1. Transaction types and listing wizard
- The canonical taxonomy seed defines seven transaction types, including `SERVICE_OFFER` with sort order 7.
- The public `/api/transaction-types` endpoint returns active database rows only; it does not synthesize missing transaction records.
- The listing wizard consumes `TransactionTypePicker`; its canonical Persian label already includes `SERVICE_OFFER` / «ارائه خدمت».
- The desktop picker grid had six columns despite seven canonical choices; changed to seven columns.
- The seed header incorrectly said six transaction types; corrected to seven.
- The bootstrap verifier and Phase 1 hardening test previously did not require all seven active keys. They now assert all seven canonical keys, including `SERVICE_OFFER`.

### 2. Dynamic technical attributes
- The listing wizard uses `AttributeFields`, not the older admin-only `DynamicAttributeForm`.
- `AttributeFields` calls `GET /api/categories/[id]/attributes` and consumes the returned `attributes` array.
- The route resolves the selected category's actual parent ancestry and merges active CategoryAttribute links, with the closest category overriding inherited flags.
- The canonical attribute catalog seed contains an `excavator` entry with required keys: `operating_weight`, `engine_power`, `operating_hours`, `bucket_capacity`, and `condition`, plus further technical fields.
- Therefore the remaining question is Preview data state: whether the seed ran, the category slug is active, and the expected active links/options exist. Do not create a parallel attribute catalog.

### 3. Country / province / city
- `GET /api/locations` lists Country rows; query parameters resolve provinces and cities.
- The wizard's `LocationPicker` calls these endpoints and reports empty data separately from request failure.
- The taxonomy seed declares Iran, 31 provinces, and approximately 150 cities.
- The bootstrap verifier now checks minimum location catalog counts. Preview runtime data still requires verification.

### 4. Exact map point
- Current listing wizard supports optional manual latitude/longitude for SALE, RENT, and AUCTION.
- A valid manually entered point now renders an OpenStreetMap embed with a marker and a link to the full map; invalid coordinates are rejected visually. The map is a preview only: its marker cannot yet be moved/clicked to set the point.
- The UI explicitly says city-center coordinates are not substituted for the real machine location. Marker selection/drag, coordinate persistence, and mobile behavior remain open acceptance items; do not claim the interactive map path is complete.

### 5. Canonical brands
- The listing wizard searches `/api/brands/search` and stores a canonical Brand ID.
- Admin taxonomy brand management uses the Brand model, aliases, families, industry relations, verification state, and category/model/listing counts.
- Homepage trusted-brand selection is a display configuration over canonical Brand records, not a second brand registry.
- Remaining verification: prove all admin entry points and public selectors share the same canonical IDs and that family/alias resolution never creates duplicate Brand records.

### 6. Homepage performance
- Homepage first-batch reads are grouped with `Promise.all`; independent second-stage reads are also parallelized.
- Per-query diagnostics emit sanitized query identifiers and safe error classifications.
- Cached homepage reads use `unstable_cache`; Worker/OpenNext runtime behavior and cache effectiveness must be measured in Preview rather than assumed.
- Remaining acceptance: capture Preview TTFB, query timings, DB round trips, cache hit/miss behavior, and section-level regressions against the current baseline.

## Code changes in this branch

- `src/components/listings/TransactionTypePicker.tsx`: seven-column desktop layout.
- `prisma/seed-taxonomy-v11.ts`: correct seven-type seed documentation.
- `tests/phase1-hardening.test.ts`: require all seven active canonical transaction keys.
- `scripts/verify-taxonomy-bootstrap.ts`: verify seven active transaction keys, location catalog presence/size, and active direct excavator attribute links.
- `src/components/listings/LocationPicker.tsx` + `next.config.ts`: display a marker preview for valid exact coordinates and allow the OSM frame under a narrowly scoped CSP directive.
- `src/lib/homepage-query-diagnostics.ts`: log sanitized slow-query labels and elapsed time (250ms threshold), without SQL or user data.

## Operational gates

1. Run CI and inspect all required checks before merge.
2. Verify Preview database identity and environment separation before any seed.
3. Only after identity is proven, request/obtain explicit approval for Preview-only execution of `db:seed-taxonomy` and `db:seed-attr-catalog`; then run `db:verify-taxonomy`.
4. Verify API responses for all seven active transaction types, excavator attributes, countries/provinces/cities, and brand search.
5. Complete interactive map work and measure homepage runtime performance.
6. Keep Issue #367 open until runtime evidence is attached.

## Safety boundary

No database seed, database write, migration against a live environment, production deployment, or irreversible infrastructure change was performed as part of this branch.
