# HEAVIX Preview Taxonomy and Catalog Bootstrap Runbook

This runbook is for a **verified isolated Preview database only**. It is not permission to run seeds, migrations, or deploy anything. Confirm the exact Prisma project, branch, database, and Cloudflare Preview binding before any apply operation.

## Why this exists

The legacy `db:seed` command only adds demo brands, machine categories, and sample listings. It does not populate transaction types, service types, model catalog, industries, or dynamic category forms. The canonical data is split across several scripts and must be applied in dependency order.

The legacy `prisma/seed.ts` is now dry-run by default, requires `--apply` and `HEAVIX_ENV=preview`, and no longer deletes existing listings or images. Do not use it as the canonical taxonomy bootstrap.

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
