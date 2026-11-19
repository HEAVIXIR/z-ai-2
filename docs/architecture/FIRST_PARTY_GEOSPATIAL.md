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

## Reviewed source candidates (not yet imported)

A public candidate repository, `sajaddp/list-of-cities-in-Iran`, reports a
versioned 1404 administrative workbook projection with 31 provinces, 484
counties, 1,193 districts, and 1,672 CODEREC=5 city records. It explicitly
distinguishes city from county and separately classifies 1,481 real-city
records and 191 derived urban-zone records. These counts are useful as
cross-check targets, not as permission to ingest the files.

**Important licensing gate:** the candidate repository declares GNU GPL v3.
HEAVIX must not copy its generated data files into this commercial codebase
until provenance, applicable data rights, and compatibility have been
reviewed. The upstream README also says the official source is a Ministry of
Interior workbook but does not make the repository itself a legal authority.
Acquire and verify the source through an authorized official channel or obtain
a compatible explicit data license first. The source-faithful 1,672-record
projection must not be mistaken for 1,672 distinct real urban cities.

The separate coordinate enrichment in that project comes from GeoNames under
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
