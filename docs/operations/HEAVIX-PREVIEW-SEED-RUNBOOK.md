# HEAVIX Preview Taxonomy and Catalog Bootstrap Runbook

This runbook is for a **verified isolated Preview database only**. It is not permission to run seeds, migrations, or deploy anything. Confirm the exact Prisma project, branch, database, and Cloudflare Preview binding before any apply operation.

## Why this exists

The legacy `db:seed` command only adds demo brands, machine categories, and sample listings. It does not populate transaction types, service types, model catalog, industries, or dynamic category forms. The canonical data is split across several scripts and must be applied in dependency order.

The legacy `prisma/seed.ts` is now dry-run by default, requires `--apply` and `HEAVIX_ENV=preview`, and no longer deletes existing listings or images. Do not use it as the canonical taxonomy bootstrap.

## Legacy data parity gate — currently NOT satisfied

The repository's historical HEAVIX snapshot records **539 categories, 405 attributes, and 629 canonical brands**. The current canonical seed source is not yet a full restoration of that dataset:

- The V1.1 category tree currently contains 279 category slugs.
- The separate service/mineral taxonomy contributes 40 additional unique slugs (319 unique slugs across both sources); this leaves at least 220 categories unaccounted for against the 539-row legacy baseline so additions and intentional replacements are documented.
- The two current brand seed batches contain approximately 211 brand records combined, leaving at least 418 canonical brands unaccounted for against the 629-row legacy baseline.
- The old `seed-brands-300.ts` is only preserved as a reference document; its original executable content has not been extracted and hash-verified.
- Brand Phase A/B populate brand identity, aliases, and industry links, but do not restore the complete legacy `BrandCategory` graph. `seed-catalog.ts` creates category links only for its seeded model/brand pairs; it is not a replacement for the full category-to-brand mapping.
- The current catalog seed contains 35 model entries; the historical snapshot reported 24 models and 8 brand-to-model associations. These sources must be reconciled rather than blindly combined.
- The Preview database audit currently shows only 16 categories, 10 brands, 0 models, 0 transaction types, 0 service types, 0 application industries, 0 attribute definitions, and 0 category-attribute links.

**Do not run the canonical seed sequence or mark catalog restoration complete yet.** First recover and verify the complete legacy brand dataset (at least 629 canonical brand rows), then reconcile categories, brand industries, aliases, brand/category links, and model mappings. The read-only verifier now fails closed below 539 categories or 629 brands, so a demo-sized seed cannot be mistaken for a successful restoration.

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
