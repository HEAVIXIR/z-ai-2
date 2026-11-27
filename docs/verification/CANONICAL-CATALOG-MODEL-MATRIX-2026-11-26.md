# Canonical Catalog Model Matrix — 2026-11-26

## Method and scope
Static extraction from the Integration branch source files only:
- `prisma/seed-catalog.ts`: `MODELS` array (35 declared models) and `PRODUCTS` array.
- `prisma/seed-phase2-catalog-core.ts`: local `models` array (24 declared candidates).
- `prisma/seed-phase3-catalog.ts`: local `products` array (9 declared products).

No scripts were executed. No database was queried or modified. No Production access, migrations, or deployments occurred. This matrix reports source declarations, not database existence or OEM truth.

## 1. Declared inventory counts
| Source | Declared model/product entries | Brands represented |
|---|---:|---:|
| seed-catalog.ts MODELS | 35 models | 9 |
| seed-phase2-catalog-core.ts models | 24 model candidates | 8 |
| seed-phase3-catalog.ts products | 9 products | 4 |

The counts above are source-array declarations. They are not row counts and do not establish successful seed execution.

## 2. Exact model-key overlap between the two model arrays
The comparison key is the literal brand slug + normalized model code (lowercase, punctuation removed). Eight exact overlaps were found:

| Brand | Model | seed-catalog category | Phase 2 category |
|---|---|---|---|
| Caterpillar | 320D | excavator | road-construction |
| Caterpillar | 966H | loader | road-construction |
| Caterpillar | D6R | bulldozer | road-construction |
| Komatsu | PC210-8 | excavator | road-construction |
| Komatsu | D85A | bulldozer | road-construction |
| Komatsu | GD825A | grader | road-construction |
| Liebherr | R924 | excavator | road-construction |
| Liebherr | LR1100 | crane | cranes-lifting |

These are exact identity overlaps, but category disagreements are not automatically errors: the two scripts resolve categories at different taxonomy levels. The correct canonical leaf category must be adjudicated against the active taxonomy and product semantics.

## 3. Near-match candidates requiring human adjudication
| Brand | seed-catalog | Phase 2 | Decision required |
|---|---|---|---|
| Komatsu | WA380-6 | WA380 | Could be a family/model-code alias or distinct generation; do not merge automatically |
| Hitachi | ZX210LC | ZX210 | Suffix omitted in Phase 2; verify exact series |
| Hitachi | ZX350LC | ZX350 | Suffix omitted in Phase 2; verify exact series |
| Volvo CE | EC220D | EC220 | Suffix omitted in Phase 2; verify exact series |

No other cross-array exact or obvious normalized model-code matches were observed in the extracted declarations. Absence from this table does not prove that two records are distinct in the real world.

## 4. Phase 3 product declarations versus the model registry
Phase 3 declares these 9 products:
- Komatsu PC200-8 Excavator
- Komatsu PC220-8 Excavator
- Caterpillar 320D Excavator
- Caterpillar 966H Wheel Loader
- Caterpillar D6R Bulldozer
- Hitachi ZX350 Excavator
- Hitachi ZX210 Excavator
- Volvo A40G Dump Truck
- Volvo L120H Wheel Loader

Several overlap with model identities already declared by the other sources, while Phase 3 uses product-name slugs and a different category-resolution pattern. Phase 3's Hitachi product names omit the LC suffix present in seed-catalog's model names. Treat these as reconciliation candidates, not confirmed duplicates.

## 5. Structural defects that block safe execution
1. Phase 2 creates Products for every ProductModel in the database, not just the 24 models in its local array. Its product slug is derived from model.slug.
2. Phase 2 links each unlinked Listing to the first Product with the same brandId. This is not a model/product identity match and is unsafe.
3. Phase 3 takes the first 10 Products and first 10 Parts without an explicit ordering and creates verified FITS edges for same-brand pairs. Brand equality alone is not compatibility evidence.
4. Phase 3 assigns ADMIN to `db.user.findFirst()`. This is an unrelated privilege side effect and is unsafe.
5. The three scripts use distinct identity conventions: brand-scoped model slug, model-slug-derived product slug, and product-name-derived slug. A canonical registry must define one natural key and explicit alias rules before migration or import.

## 6. Required canonical registry contract
Before any import, produce a reviewed manifest with:
- canonical brand slug;
- canonical model code and display name;
- source-specific aliases and provenance;
- canonical category leaf slug;
- generation/series/suffix distinctions;
- canonical Product identity and slug;
- disposition for each source declaration: KEEP, ALIAS, MERGE_AFTER_REVIEW, or REJECT;
- evidence and reviewer for compatibility assertions.

Ambiguous model codes must remain separate until reviewed. Never infer a model alias solely by removing a suffix or punctuation.

## 7. Next implementation sequence
1. Freeze the three legacy seed entrypoints from operational use until their safety defects are fixed.
2. Build the manifest and review the 8 exact overlaps plus 4 near-match candidates.
3. Replace brand-only Listing linking with exact reviewed mapping; ambiguous rows must remain unlinked.
4. Remove arbitrary first-N compatibility generation and the ADMIN role side effect from catalog seeding.
5. Apply a shared fail-closed Preview database identity guard to every mutating seed.
6. Add source-level CI contracts only after the approved safe implementation exists; do not add a test that merely blesses current unsafe behavior.

## Execution gate
This document authorizes no seed execution. No Preview or Production mutation is authorized. Any future apply operation requires explicit approval, exact database identity proof, reviewed manifest, expected row-level delta, backup, and rollback/recovery plan.