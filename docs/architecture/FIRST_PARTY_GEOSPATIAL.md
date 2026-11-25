# HEAVIX First-Party Geospatial Architecture

## Policy

HEAVIX owns its canonical location hierarchy, coordinates, operational zones,
map-serving configuration, and search semantics. External APIs are not a
runtime dependency for the listing/request form or map search.

## Canonical hierarchy

- Country → Province → City remains the canonical administrative hierarchy.
- Country/province/city identifiers are persisted as foreign keys.
- Listing and BuyRequest keep legacy display strings for compatibility.
- BuyRequest gains the same canonical location references as Listing.
- User-selected WGS84 coordinates are stored separately from city centroid
  coordinates. A city centroid must never be presented as the exact equipment
  location.

## Coordinates and privacy

- Latitude is valid only in [-90, 90]; longitude only in [-180, 180].
- Both coordinates must be present together.
- Exact-point visibility must be a product-level policy. Public results should
  be able to show an approximate point or an operational zone without exposing
  a seller's private yard or residential address.
- Location accuracy and update timestamp are recorded independently.
- Legacy records remain valid with null coordinates.

## Operational zones

GeoZone stores first-party GeoJSON boundaries and optional links to country and
province. Levels are COUNTRY, PROVINCE, CITY, OPERATIONAL, and CUSTOM.
GeoJSON is deliberately portable; PostGIS activation and spatial indexes are
a later infrastructure decision, not silently enabled by this migration.

## Self-hosted map stack (target architecture)

1. MapLibre GL JS is the client renderer; it is not a map-data provider.
2. HEAVIX operates its own vector-tile pipeline from licensed OpenStreetMap
   planet/region extracts (or another explicitly licensed source).
3. The tile pipeline produces versioned MBTiles/PMTiles artifacts.
4. HEAVIX serves tiles and styles from its own domain/CDN; no public OSM tile
   server is used as an unrestricted production backend.
5. Geocoding/search index is built from HEAVIX-owned imported data and has
   explicit attribution, license, update cadence, and rollback metadata.
6. Admin tools import country/province/city data from versioned, reviewed
   source files. Runtime forms read only the HEAVIX database.

## Data ingestion acceptance

- Every import has source URL/name, license, source version/date, checksum,
  importer version, row counts, and a dry-run report.
- Upserts use stable source codes where available; no destructive replacement.
- Duplicate names are allowed across different provinces, not within a
  province's canonical key.
- County/district and city/settlement are distinct levels; never silently map
  county records into City.
- Import must be idempotent and report unmatched/ambiguous rows.
- No seed/import is run against a live database without separate approval.

## Rollout gates

- Validate schema and migration on disposable CI databases only.
- Add API validation for coordinate ranges and country/province/city ancestry.
- Add map selection UI with accessible manual coordinate fallback.
- Add owner/public coordinate visibility controls before public exact-point maps.
- Build zone-aware filters and clustered map search.
- Add self-hosted tile server and offline/rollback procedures before production
  map traffic is enabled.

## Current canonical location catalog (generated; not seeded)

HEAVIX now contains a deterministic Country → Province → City catalog built
from the already-bundled `prisma/data/iran-cities-1404.json` snapshot:

- Output: `prisma/data/iran-locations-1404.json`
- Manifest: `prisma/data/iran-locations-1404.manifest.json`
- Reproduction: `bun run data:locations:check`
- Counts: 1 country, 31 provinces, 1,479 distinct selectable city labels.
- Source metadata: 1,481 real-city records; two same-province duplicate names
  were already collapsed in the bundled snapshot to satisfy the current
  `(provinceId, name)` uniqueness constraint.

The bundled source declares GPL-3.0. That provenance is retained in the
manifest and README; the derivative is not relabeled under another license.
The manifest remains `rightsReviewStatus: PENDING` and
`commercialUseAllowed: false`. This does not block continued engineering,
validation, UI work, or CI. It does keep database seeding/import fail-closed
until a separate documented review and explicit approval.

The current catalog intentionally excludes county, district, rural district,
village, and urban-zone entities. No English city names or city coordinates
were invented. City centroids, when separately sourced and reviewed, must
never be used as exact equipment coordinates.

The alternative `Hameds/IranCountryDivisions` 1404 source was reviewed but was
not used to generate the bundled catalog. Its original CSV has not been
acquired into the repository; its converter remains a separately testable
intake path, not evidence that the 1,481-row official export was processed.

The catalog and migration files are present in the PR stack. No live database
seed/import or migration has been executed.s under
CC BY 4.0 and requires attribution; it is not an official boundary or city
centroid source. Do not treat it as precise equipment-location data.

## Basemap licensing and ownership boundary

MapLibre GL JS is the renderer, not a map-data API. It is open source under
BSD-3-Clause and can render a style and vector tiles served by HEAVIX.

The preferred self-hosted delivery path is a versioned regional PMTiles archive
generated from a licensed OpenStreetMap PBF extract, stored in HEAVIX-controlled
object storage and served from a HEAVIX-owned hostname with HTTP range support.
The alternative is a HEAVIX-operated vector tile server such as TileServer GL
or Martin. Both options remove third-party tile API calls from the runtime.

OpenStreetMap data is ODbL, not proprietary HEAVIX-owned data. Public maps must
display readable attribution and link the data license. If HEAVIX distributes
a derivative database, ODbL share-alike obligations need legal review. The
renderer and HEAVIX-authored styles/services remain separately licensed.
If exclusive/proprietary map data is a requirement, use a separately licensed
commercial dataset or HEAVIX-collected data instead of assuming OSM data can
be made exclusive.

No OSM public tile endpoint, public Nominatim endpoint, MapTiler-hosted tile
service, or Maptoolkit-hosted tile service is a production runtime dependency.
