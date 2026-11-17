# HEAVIX Preview Taxonomy and Catalog Bootstrap Runbook

This runbook is for a **verified isolated Preview database only**. It is not permission to run seeds, migrations, or deploy anything. Confirm the exact Prisma project, branch, database, and Cloudflare Preview binding before any apply operation.

## Why this exists

The legacy `db:seed` command only adds demo brands, machine categories, and sample listings. It does not populate transaction types, service types, model catalog, industries, or dynamic category forms. The canonical data is split across several scripts and must be applied in dependency order.

The legacy `prisma/seed.ts` is now dry-run by default, requires `--apply` and `HEAVIX_ENV=preview`, and no longer deletes existing listings or images. Do not use it as the canonical taxonomy bootstrap.

## Legacy data parity gate — currently NOT satisfied

The 22 September 2026 Master Execution Plan records a historical snapshot of **539 Categories, 405 Attributes, and 629 Brands**. These are documented project figures, not a fresh database export. Other project references report 295 total categories and a machine-only tree of 16 L1 + 174 L2 + 97 L3 nodes (287); the scopes and snapshots must be reconciled before treating 539 as a verified universal target.

### Category source recovery audit (read-only)

The repository contains a previously excluded machine taxonomy source that is useful for recovery, but must not be applied as a second competing tree:

- `prisma/seed-machine-taxonomy.ts`: **302** category slug entries in the legacy 16-group machine tree.
- `prisma/seed-taxonomy-v11.ts`: **279** category slug entries in the newer V1.1 taxonomy.
- `prisma/seed-service-and-mineral-taxonomy.ts`: **41** category slug entries (31 service-tree records and 10 mineral-subtree records).
- Combined source records: **622**; combined source union: **531 unique candidate slugs**.
- The current source snapshot contains **91 repeated slugs**; **50** have different primary `name` labels, and **54** have different parent-path/layer/domain signatures.
- The exact read-only inventory, including all repeated definitions and source paths, is recorded in [HEAVIX-TAXONOMY-SOURCE-RECONCILIATION-2026-11-17.md](./HEAVIX-TAXONOMY-SOURCE-RECONCILIATION-2026-11-17.md).

These counts were re-extracted from the three source trees at Integration commit `f777174966238c0eac304ad3f02f815a74aaecea`; they supersede the earlier 303/92/52 figures in this runbook for that snapshot. The inventory is source-only, not a database export. It reduces the apparent gap against the 539-row snapshot to 8 candidate slugs, but **531 is not a verified final category count**. The older machine tree and V1.1 tree differ in hierarchy and naming, and the 539/295/287 figures do not yet share a proven scope. Do not concatenate or execute both trees blindly.

### Brand source recovery audit (read-only)

- `prisma/seed-brands-a.ts`: 197 brand object rows.
- `prisma/seed-brands-b.ts`: 433 brand object rows.
- Combined: 630 source rows and **605 unique canonical slugs** after the seed's English-name slugification; 24 slug values repeat (25 extra rows).
- This is 24 below the documented 629-brand snapshot before any other verified legacy source is recovered.
- `prisma/seed.ts` contains 45 demo brands; 8 are not in Phase A/B, but this file is demo-only and must not be used to claim canonical brand parity.
- The original executable `seed-brands-300.ts` is not present in the current source history as executable content; only a reference document remains. Its full data and hash have not been recovered.
- Brand Phase A/B create identity, aliases, families, and industry links, but do not restore the complete historical `BrandCategory` graph. `seed-catalog.ts` adds only model/brand/category links for its own seeded model pairs.

### Legacy broad Attribute Catalog recovery audit (read-only)

The legacy `prisma/seed-attribute-catalog.ts` remains unsafe to execute as a restoration path because it can overwrite existing AttributeDefinition metadata and CategoryAttribute settings. It is nevertheless valuable as a **read-only recovery source**:

- 522 attribute-key placements collapse to **402 distinct raw keys**.
- It contains **89 category slug candidates**, representing **88 unique category slugs**.
- The historical snapshot reports 405 attributes, so the legacy source is three distinct keys short of that documented count. The three missing historical records are not identified by this source alone.
- Only 103 of the 402 legacy raw keys overlap with the current 542 machine/catalog form keys. The current machine and service form sources introduce many additional category-specific keys; do not union all sources into a single flat catalog without signature, category, and provenance reconciliation.
- The old source's `heavy-haulage` mapping also illustrates a taxonomy identity conflict: the legacy machine tree uses that slug for a machine/vehicle category, while V1.1 uses it for a SERVICE/TRANSPORT category. Because Category.slug is globally unique, the two meanings cannot both be imported under the same slug. The V1.1 hierarchy is the current candidate; retain the legacy interpretation as migration provenance/alias only if confirmed.

Use this file to recover names, options, required keys, and category associations, but port only through a reviewed additive importer that preserves administrator-managed settings. Never run the broad legacy updater directly against Preview or Production.

### Attribute and model parity

- The historical snapshot reports 405 AttributeDefinitions.
- `seed-category-specific-attributes.ts` and `seed-service-mineral-attributes.ts` define form templates; template/field-call counts are not interchangeable with the final unique `AttributeDefinition` count.
- `seed-attribute-catalog.ts` is a legacy broad updater that can overwrite attribute metadata and category-link settings; it is excluded from the canonical sequence.
- The current catalog seed contains 35 model entries, while the historical snapshot reports 24 models and 8 brand-to-model associations. Reconcile identities and relationships rather than assuming either count is authoritative.

### Dynamic form and attribute source audit (read-only)

The two dedicated form sources are substantially larger than the historical database count, because template fields are reused and some keys have incompatible definitions across categories:

- `seed-category-specific-attributes.ts`: **127 machine/catalog form templates**, **957 field placements**, and **542 distinct raw field keys**.
- Within those 542 keys, **92 keys have more than one field signature** (differences can be label, type, unit, options, or flags). The current resolver namespaces category-specific variants; a source-only simulation with no pre-existing DB definitions yields **184 namespaced field placements** and **726 distinct resolved keys**. The actual resolver result depends on existing Preview AttributeDefinition rows, so 726 is not a predicted database row count.
- `seed-service-mineral-attributes.ts`: **26 explicit form objects plus 52 generated form entries = 78 form slugs**, with **284 form-field placements** and **254 distinct form-field keys**. In addition, it defines 20 shared root fields (10 common service + 10 common mineral); across the entire file there are 304 `f()` calls and 271 distinct keys.
- The service/mineral form-specific keys overlap with the 542 machine/catalog keys on exactly one raw key (`rail_gauge`); the 20 shared root fields have no overlap with machine/catalog keys.
- All 127 machine form slugs are present in the V1.1 taxonomy source. All 78 service/mineral/transport form slugs are present in the combined V1.1 + service/mineral category sources.
- Eleven transport/logistics forms have now been added: heavy haulage, container, port, rail, air freight, warehouse logistics, customs clearance, freight forwarding, last mile, cold chain, and other transport.
- The service/mineral seed now validates duplicate form slugs and duplicate fields per form, and fails before writes if any active terminal `SERVICE`-layer category lacks a dedicated form.
- The 31 slugs in `RETIRED_MACHINE_TEMPLATE_SLUGS` are not unconditionally disabled: the seed skips them only when their category is absent from the target DB. Do not interpret this set as proof that those taxonomy nodes are globally retired.
- The historical **405 Attributes** figure is a database snapshot count. It cannot be directly equated with raw keys, field placements, resolved keys, form templates, or option rows.

The machine form seed validates that every active terminal CATALOG category under its five coverage roots has a dedicated template and aborts before writes if a non-retired form category is missing. The service/mineral seed now has a matching terminal-category coverage gate for active SERVICE-layer categories. These are pre-write checks; they do not prove the current Preview DB has already been seeded.


### Current isolated Preview DB audit

The read-only audit currently shows: Category=16 (all root-level), Brand=10, ProductModel=0, TransactionType=0, ServiceType=0, ApplicationIndustry=0, AttributeDefinition=0, and CategoryAttribute=0. The exact binding between this Prisma Preview project and the deployed Cloudflare Worker has not been independently proven.

**Do not run the canonical seed sequence or mark restoration complete yet.** Recover and reconcile the original source records, names, parent paths, brand aliases/families, industries, BrandCategory links, models, attributes, and options first. The read-only verifier remains fail-closed against the documented 539-category / 629-brand snapshot until the baseline scope itself is resolved.

### Manual Preview diagnostics dispatch blocker (verified 2026-11-17)

The dedicated read-only workflow at `.github/workflows/preview-readonly-migration-diagnostics.yml` is present on `integration/preview-readiness-workerd-2026-11-15`, but it is absent from the repository default branch `main`. The Integration copy declares `workflow_dispatch`; the current `main` copy of `.github/workflows/ci.yml` does not declare `workflow_dispatch` either. Consequently, GitHub Actions does not expose the dedicated workflow for manual dispatch from this repository's default branch. A missing workflow page or missing **Run workflow** button is an expected repository-registration limitation, not an operator error.

Do not copy this workflow to `main`, merge PR #340, or change the default branch as an informal workaround. Any such change requires a separate owner-approved decision and completion of the project's branch/PR gates.

The existing `main` workflow `.github/workflows/prisma-preview-workerd-proof.yml` is **not an equivalent fallback**. It checks out the pinned historical commit `b94b9d6f3540e8f4467b1d4ac051d5ef050c0994`, whose local Wrangler/Miniflare proof expects only two App migrations and two Store migrations. The current Integration proof code expects six App migrations and three Store migrations. That workflow also starts a local Workerd harness; it does not prove which databases the deployed Cloudflare Preview Worker is bound to. Do not dispatch it as a substitute for the current paired diagnostics.

Integration CI run [`44079023353`](https://github.com/HEAVIXIR/z-ai-2/actions/runs/44079023353) completed successfully on commit `4a92096d2d6697e36287f56e23f7c03da0cde566`; all seven executed jobs passed. OpenNext run [`44079023363`](https://github.com/HEAVIXIR/z-ai-2/actions/runs/44079023363) also completed successfully. The `Preview read-only paired migration diagnostics` job was skipped, so CI success is not Preview database identity or migration-history proof.

Until an owner-approved dispatch route is available and a successful run verifies both Preview database identities and migration histories, keep the database acceptance gate closed. Do not run migrations, taxonomy/attribute/catalog seeds, or deployment on the strength of CI success alone.


### Legacy archive provenance inventory (verified 2026-11-17)

The owner manually dispatched the read-only workflow `Legacy archive provenance inventory` on the Integration branch. Run [44081068912](https://github.com/HEAVIXIR/z-ai-2/actions/runs/44081068912) completed successfully on the exact Integration commit `4a92096d2d6697e36287f56e23f7c03da0cde566`. Artifact `legacy-member-provenance` (ID `14328005542`) contains the path/hash inventory and summary.

Key results: 13 valid ZIP archives, 1,715 file occurrences, 909 unique paths, all 54 import-manifest paths present, 445 identical target paths, 383 content-different paths requiring review, and 27 unmapped paths. All 27 unmapped paths are generated Store Client outputs under `src/lib/generated/store-client/`; none is a missing taxonomy seed source. No archive member was extracted or executed.

The archive's machine seed is an exact hash match for the historical source at commit `500aa1faf26c`. Its tree has 285 entries (16 L1 / 172 L2 / 97 L3), compared with 302 entries in current Integration (16 / 182 / 104). Current Integration adds 17 slugs (10 L2, 7 L3); no old slugs were removed and shared primary labels are unchanged. The archived brand pair contains 647 source entries and 621 distinct slug candidates, with 25 repeated slug values; current Phase B also includes one explicit Iveco `refreshIdentity: true` correction. These are source facts, not canonical approvals.

Seven archived members (machine taxonomy, v4 taxonomy, brand batches A/B, attribute seeds, and corrected V1.1 reference) have exact SHA-256 matches to historical files at `500aa1faf26c`. The archive does not contain the newer V1.1/service-mineral seed files. The full comparison and hashes are recorded in [HEAVIX-LEGACY-ARCHIVE-PROVENANCE-2026-11-17.md](./HEAVIX-LEGACY-ARCHIVE-PROVENANCE-2026-11-17.md).

This inventory improves source provenance but does not satisfy the 539-category / 629-brand baseline, prove live Preview Worker↔database identity, or authorize any seed. Keep all migration and seed gates closed until the existing requirements are met.


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
