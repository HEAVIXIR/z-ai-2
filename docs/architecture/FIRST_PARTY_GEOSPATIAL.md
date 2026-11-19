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
