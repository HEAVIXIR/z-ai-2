# HEAVIX Listing Domain Forms

## Product contract

HEAVIX is a multi-domain industrial marketplace, not a machinery-only classified site. The listing wizard must select a taxonomy layer and render fields from the selected category path. A leaf category must have its own specialist form; common fields are inherited from its domain root and intermediate parents.

### Transaction intent is independent from taxonomy

- `SALE`: sell a catalog item, machine, part, attachment, material or mineral.
- `SERVICE_OFFER`: advertise a service the provider can deliver. Uses `SERVICE` taxonomy.
- `SERVICE_REQUEST`: request a service from the market. Uses `SERVICE` taxonomy.
- `RENT`, `WANTED`, `QUOTE`, `AUCTION`: retain their existing transaction semantics.

Never conflate a provider offer with a buyer request. Brand/model are optional for service flows; machine-only year, hours and serial fields are suppressed.

### Taxonomy and form registry

1. Run `prisma/seed-taxonomy-v11.ts` first.
2. Run `prisma/seed-service-and-mineral-taxonomy.ts` to add service provider categories, repair specialties, mineral supply branches and mineral grade/shape leaves, and upsert `SERVICE_OFFER`.
3. Run `prisma/seed-service-mineral-attributes.ts` to attach common inherited service/material fields and category-specific leaf forms.
4. Run `prisma/seed-category-specific-attributes.ts` for the separate machine/equipment leaf-form registry.

Run these only against an explicitly confirmed Preview database after backup and target verification. Do not run against Production as part of CI or a build.

### Required form domains

- Equipment and machinery: machine-specific technical data.
- Service providers: scope, supported assets/industries, service area, onsite capability, response time, team/capacity, certifications and pricing basis.
- Repair specialties: component families, supported makes/classes, repair capabilities, test-bench capacity and field response.
- Mineral/material listings: grade, assay/chemical composition, purity, moisture, size distribution, quantity, recurring capacity, origin and delivery terms.
- Mining services: exploration/drilling method, depth, throughput, recovery, assay standards, fleet and contracting scope.
- Trading/logistics: product, volume, supply continuity, delivery basis and transport capacity.

### Acceptance gates

- Every active terminal category in the SERVICE tree has an exact form template.
- Every terminal material/mineral category has an exact form template.
- Common root attributes are inherited without duplicating definitions.
- Required values are validated before moving to review.
- Service offers and service requests both accept SERVICE-layer categories; catalog sales continue to require CATALOG-layer categories.
- No service form displays irrelevant machine-only fields.
- Typecheck, lint, unit/contract tests and end-to-end wizard tests pass before merge.
- Preview seed execution and UI verification are recorded separately from code/CI status.

## Free-first infrastructure and service budget contract (launch window)

The first 6–12 months of HEAVIX launch must be designed around free-tier service usage. The initial capacity target is at least 10,000 listing/content views per calendar month, sustained throughout the first 6–12 months, without requiring a paid plan or a paid upgrade to keep core marketplace journeys working.

This is a hard architecture constraint for every new service, SDK, API, storage provider and background job:

- Prefer free-tier or self-hosted/open-source options; document the free quota, limits, overage behavior, data-egress charges and upgrade triggers before adoption.
- Do not introduce a mandatory paid dependency for publishing, browsing, searching, viewing listing details, or contacting a seller during the launch window.
- Keep images and static assets optimized: responsive sizes, modern formats, lazy loading, bounded upload sizes, cacheable immutable assets and CDN/browser caching where available. Avoid repeatedly proxying or transforming the same asset.
- Minimize database round trips and serverless invocations; paginate, select only required columns, cache read-heavy taxonomy/configuration, and avoid polling or unbounded background work.
- Protect every external integration with timeouts, bounded retries, rate limits, graceful degradation and a documented fallback. A provider outage or free-quota exhaustion must not silently create runaway paid usage.
- Add usage observability for requests, database reads/writes, storage, image transformations, bandwidth/egress, function execution and third-party API calls. Set warning thresholds before provider limits are reached.
- No paid resource, billing activation, plan upgrade or production service migration may be assumed. Any such change requires an explicit cost/approval review first.
- Record a service decision entry for each dependency: purpose, free allowance, expected usage at 10,000 views, quota risks, fallback, data portability and estimated cost if the allowance is exceeded.

The 10,000-view target means 10,000 listing/content page views per month (not cumulative views across the launch window). Capacity reviews must additionally state their assumptions for unique visitors, image requests per view, API requests per view, average asset sizes, geographic distribution and peak-to-average traffic. Do not equate page views with unique users or with total HTTP requests.

Acceptance gates:
- Core listing publication, listing detail, taxonomy and contact flows remain usable within documented free-tier quotas for the agreed launch scenario.
- No unbounded paid usage path exists for image delivery, API retries, database queries or background jobs.
- A quota-exhaustion/failure fallback is defined and tested for every critical external service.
- The team can inspect usage and receive an early warning before any free-tier ceiling is crossed.

