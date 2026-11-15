# HEAVIX Preview Taxonomy and Catalog Bootstrap Runbook

This runbook is for a **verified isolated Preview database only**. It is not permission to run seeds, migrations, or deploy anything. Confirm the exact Prisma project, branch, database, and Cloudflare Preview binding before any apply operation.

## Why this exists

The legacy `db:seed` command only adds demo brands, machine categories, and sample listings. It does not populate transaction types, service types, model catalog, industries, or dynamic category forms. The canonical data is split across several scripts and must be applied in dependency order.

The legacy `prisma/seed.ts` is now dry-run by default, requires `--apply` and `HEAVIX_ENV=preview`, and no longer deletes existing listings or images. Do not use it as the canonical taxonomy bootstrap.

## Legacy data parity gate — currently NOT satisfied

The 22 September 2026 Master Execution Plan records a historical snapshot of **539 Categories, 405 Attributes, and 629 Brands**. These are documented project figures, not a fresh database export. Other project references report 295 total categories and a machine-only tree of 16 L1 + 174 L2 + 97 L3 nodes (287); the scopes and snapshots must be reconciled before treating 539 as a verified universal target.

### Category source recovery audit (read-only)

The repository contains a previously excluded machine taxonomy source that is useful for recovery, but must not be applied as a second competing tree:

- `prisma/seed-machine-taxonomy.ts`: 303 category slug entries in the legacy 16-group machine tree.
- `prisma/seed-taxonomy-v11.ts`: 279 category slug entries in the newer V1.1 taxonomy.
- `prisma/seed-service-and-mineral-taxonomy.ts`: 41 slug entries, of which 40 are additional unique slugs after overlap.
- Combined source union: **531 unique candidate slugs**.
- The sources contain **92 repeated slugs**; **52 repeated slugs have different Persian labels** between source definitions. Parent paths and layer assignments also need reconciliation.

This reduces the apparent gap against the 539-row snapshot to 8 candidate slugs, but **531 is not a verified final category count**. The older machine tree and V1.1 tree differ in hierarchy and naming, and the 539/295/287 figures do not yet share a proven scope. Do not concatenate or execute both trees blindly.

### Brand source recovery audit (read-only)

- `prisma/seed-brands-a.ts`: 197 brand object rows.
- `prisma/seed-brands-b.ts`: 433 brand object rows.
- Combined: 630 source rows and **605 unique canonical slugs** after the seed's English-name slugification; 24 slug values repeat (25 extra rows).
- This is 24 below the documented 629-brand snapshot before any other verified legacy source is recovered.
- `prisma/seed.ts` contains 45 demo brands; 8 are not in Phase A/B, but this file is demo-only and must not be used to claim canonical brand parity.
- The original executable `seed-brands-300.ts` is not present in the current source history as executable content; only a reference document remains. Its full data and hash have not been recovered.
- Brand Phase A/B create identity, aliases, families, and industry links, but do not restore the complete historical `BrandCategory` graph. `seed-catalog.ts` adds only model/brand/category links for its own seeded model pairs.

### Attribute and model parity

- The historical snapshot reports 405 AttributeDefinitions.
- `seed-category-specific-attributes.ts` and `seed-service-mineral-attributes.ts` define form templates; template/field-call counts are not interchangeable with the final unique `AttributeDefinition` count.
- `seed-attribute-catalog.ts` is a legacy broad updater that can overwrite attribute metadata and category-link settings; it is excluded from the canonical sequence.
- The current catalog seed contains 35 model entries, while the historical snapshot reports 24 models and 8 brand-to-model associations. Reconcile identities and relationships rather than assuming either count is authoritative.

### Dynamic form and attribute source audit (read-only)

The two dedicated form sources are substantially larger than the historical database count, because template fields are reused and some keys have incompatible definitions across categories:

- `seed-category-specific-attributes.ts`: **127 machine/catalog form templates**, **957 field placements**, and **542 distinct raw field keys**.
- Within those 542 keys, **92 keys have more than one field signature** (differences can be label, type, unit, options, or flags). The current resolver namespaces category-specific variants; a source-only simulation with no pre-existing DB definitions yields **184 namespaced field placements** and **726 distinct resolved keys**. The actual resolver result depends on existing Preview AttributeDefinition rows, so 726 is not a predicted database row count.
- `seed-service-mineral-attributes.ts`: **26 explicit form objects plus 52 generated form entries = 78 form slugs**, with **304 field placements** and **271 distinct raw keys**.
- The service/mineral form keys have no raw-key overlap with the 542 machine/catalog keys in these source files.
- All 127 machine form slugs are present in the V1.1 taxonomy source. All 78 service/mineral/transport form slugs are present in the combined V1.1 + service/mineral category sources.
- Eleven transport/logistics forms have now been added: heavy haulage, container, port, rail, air freight, warehouse logistics, customs clearance, freight forwarding, last mile, cold chain, and other transport.
- The service/mineral seed now validates duplicate form slugs and duplicate fields per form, and fails before writes if any active terminal `SERVICE`-layer category lacks a dedicated form.
- The 31 slugs in `RETIRED_MACHINE_TEMPLATE_SLUGS` are not unconditionally disabled: the seed skips them only when their category is absent from the target DB. Do not interpret this set as proof that those taxonomy nodes are globally retired.
- The historical **405 Attributes** figure is a database snapshot count. It cannot be directly equated with raw keys, field placements, resolved keys, form templates, or option rows.

The machine form seed validates that every active terminal CATALOG category under its five coverage roots has a dedicated template and aborts before writes if a non-retired form category is missing. The service/mineral seed now has a matching terminal-category coverage gate for active SERVICE-layer categories. These are pre-write checks; they do not prove the current Preview DB has already been seeded.


### Current isolated Preview DB audit

The read-only audit currently shows: Category=16 (all root-level), Brand=10, ProductModel=0, TransactionType=0, ServiceType=0, ApplicationIndustry=0, AttributeDefinition=0, and CategoryAttribute=0. The exact binding between this Prisma Preview project and the deployed Cloudflare Worker has not been independently proven.

**Do not run the canonical seed sequence or mark restoration complete yet.** Recover and reconcile the original source records, names, parent paths, brand aliases/families, industries, BrandCategory links, models, attributes, and options first. The read-only verifier remains fail-closed against the documented 539-category / 629-brand snapshot until the baseline scope itself is resolved.

## Required schema first

Before catalog seeds, the target Preview branch must have the migration:

`20261114150000_product_model_attributes`

This migration creates the `ProductModelAttribute` relation used by model-specific attribute loading. Stop if it is not recorded as successfully applied. Do not use `prisma db push --accept-data-loss` as a substitute.

## Canonical Preview seed order

Each script requires both `--apply` and `HEAVIX_ENV=preview`. The dry-run behavior is the default.

1. `prisma/seed-brands-a.ts` — industries, brand families, first brand batch, aliases.
2. `prisma/seed-brands-b.ts` — remaining brand batch and aliases; requires Phase A.
3. `prisma/seed-taxonomy-v11.ts` — transaction types, service types, application industries, canonical category tree, locations.
4. `prisma/seed-service-and-mineral-taxonomy.ts` — service and mineral/material category branches; requires V1.1 roots.
5. `prisma/seed-category-specific-attributes.ts` — category-specific machine/catalog form definitions.
6. `prisma/seed-service-mineral-attributes.ts` — service and mineral/material form definitions.
7. `prisma/seed-catalog.ts` — 35 product models and related catalog records; also creates additive BrandCategory links for each seeded model's brand/category pair.
8. `prisma/seed-services.ts` — 12 service catalog entries.

Example invocation shape after target verification and approval:

```bash
export HEAVIX_ENV=preview
bunx tsx prisma/seed-brands-a.ts --apply
bunx tsx prisma/seed-brands-b.ts --apply
bunx tsx prisma/seed-taxonomy-v11.ts --apply
bunx tsx prisma/seed-service-and-mineral-taxonomy.ts --apply
bunx tsx prisma/seed-category-specific-attributes.ts --apply
bunx tsx prisma/seed-service-mineral-attributes.ts --apply
bunx tsx prisma/seed-catalog.ts --apply
bunx tsx prisma/seed-services.ts --apply
```

Do not run this sequence until the Preview target and migration state are independently verified.

## Do not run these as part of this bootstrap

- `prisma/seed-attribute-catalog.ts`: legacy broad updater; it can overwrite existing attribute metadata and link settings.
- `prisma/seed-machine-taxonomy.ts`: legacy taxonomy path; use V1.1 and service/mineral taxonomy instead.
- `prisma/seed.ts`: demo fixtures only; not the canonical taxonomy bootstrap.

## Post-seed verification

Read-only checks should confirm:
- 6 active transaction types.
- 9 active service types.
- 16 application industries.
- Canonical category roots and descendants across CATALOG, MARKETPLACE, SERVICE, and FALLBACK layers.
- Brand rows and BrandCategory links are nonzero.
- 35 seeded ProductModel rows (subject to all 9 expected brands and 11 expected categories existing).
- AttributeDefinition and CategoryAttribute rows are nonzero.
- 12 Service rows.

Run the read-only verifier after all seed commands: `bun run db:verify-taxonomy`. It checks minimum counts and confirms the `ProductModelAttribute` table is present.\n\nAlso verify the listing wizard can load each active transaction type, navigate nested categories, filter models by brand/category, and render category-specific attributes before allowing the user to continue.

## Safety

- Never point these commands at Production.
- Never run seeds against a database merely because its name looks like Preview; verify project, branch, database ID, and Worker binding.
- Do not run migrations, seeds, or data cleanup until the user explicitly approves the exact Preview target.
- No seed script should delete listings, images, or administrator-managed taxonomy records.
