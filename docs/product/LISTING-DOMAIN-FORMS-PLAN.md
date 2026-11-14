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
