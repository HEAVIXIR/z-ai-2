# HEAVIX Category-Specific Specification Coverage Audit — V1

## Critical finding: two competing taxonomy trees

The repository contains two different machine-taxonomy definitions:

1. `prisma/seed-taxonomy-v11.ts`: the current V1.1-style taxonomy. On this branch it contains 279 unique slugs after the first expansion.
2. `prisma/seed-machine-taxonomy.ts`: explicitly describes itself as the **definitive machine taxonomy restructure**, with 16 L1 groups, 172 L2 families and 97 L3 variants (286 unique slugs including the `machinery` root).

Repository docs and the public mega-menu comments refer to the 16-L1 structure. Therefore the 16-group tree is the strongest source-of-truth candidate for the machine catalog, but the actual Preview database state has not been verified. Do not run either seed against a database until the live Preview DB target and taxonomy state are verified read-only.

## Definitive tree coverage audit

Static parsing of `seed-machine-taxonomy.ts`:
- 16 L1 groups.
- 172 L2 families.
- 97 L3 variants.
- 243 selectable terminal categories (146 L2 leaves + 97 L3 leaves).
- The current 128 exact-form template slugs overlap with 55 slugs in this definitive tree.
- Of those, only 45 map to terminal categories; the other 10 are family/parent nodes.
- Thus **198 of the 243 terminal categories still lack a directly mapped exact form** in the definitive tree. Some may receive inherited legacy fields, but inheritance alone is not proof of a complete subtype-specific form.

The 128-template catalog was initially built against the V1.1 taxonomy. It must be reconciled to the definitive 16-group tree before it is considered production-ready. Do not interpret the earlier V1.1 counts (279 taxonomy slugs, 203 direct mappings) as coverage of the definitive tree.

## The 16 definitive machine families

1. Road construction and civil machinery
2. Mining machinery
3. Drilling
4. Crushing, sizing and processing
5. Concrete and asphalt
6. Cranes, hoists and lifting
7. Forklift and material handling
8. Industrial haulage
9. Port and marine machinery
10. Recycling and waste machinery
11. Tunnel and underground machinery
12. Heavy industrial and production machinery
13. Power, energy and mobile utilities
14. Municipal and environmental machinery
15. Special project machinery
16. Other specialist machinery

The tree contains distinct families and variants for excavators, loaders, bulldozers, graders, backhoes, scrapers, rollers, mining trucks, shovels, LHDs, drilling rigs, crushers, screens, concrete pumps, pavers, cranes, forklifts, port handlers, recycling plants, tunnel boring/roadheader/bolting equipment, heavy industrial equipment, generator variants, municipal machines and specialist vehicles.

## Work already implemented on this feature branch

### V1.1 taxonomy and category forms
- The V1.1 seed was expanded from 238 to 279 unique slugs, including compact loaders, additional crane/drill/roller/concrete variants, forklift powertrain/duty variants, attachments, fuel-station equipment and selected industrial/vehicle categories.
- 128 exact one-slug templates were added to `prisma/seed-category-specific-attributes.ts`.
- The legacy `seed-attribute-catalog.ts` resolver was fixed to attach every existing slug candidate rather than stopping at the first match.
- Static checks on the V1.1-targeted templates found no duplicate template slugs, no missing required keys, no duplicate field keys, no repeated-key unit conflicts, and no template slug absent from the V1.1 seed.
- This work is a first pass and does not yet cover the definitive tree's 243 terminal categories.

### Definitive taxonomy safety
The definitive `seed-machine-taxonomy.ts` had a safety gap: it deactivated legacy L1 categories without first checking whether listings existed in their descendants, and its before/after listing query did not cover the complete descendant tree. It has now been hardened on this branch:
- Read-only by default; requires explicit `--apply` to write.
- Preflight counts listings throughout the full machinery descendant tree.
- Refuses to deactivate any legacy L1 branch containing listings.
- Cleanup refuses to deactivate a category if any descendant has listings.
- Before/after listing preservation checks now traverse the complete descendant tree.

These protections have not been runtime-tested and the seed has not been executed.

## Design rules for the definitive forms

1. Every selectable terminal machine/equipment type must render a distinct composed form.
2. Shared fields can inherit from the L2 family; L3 variants add/override their own fields. The composed leaf form must still be machine-specific.
3. A family with no L3 children receives its own complete form at L2.
4. A model-specific override is optional and never replaces the category form.
5. Attribute keys are global: one key must have one canonical type/unit. Use distinct keys for different units/dimensions.
6. Service, spare-part, logistics, trading, auction and RFQ categories require their own domain schemas, not machine engine/hour fields.
7. Catch-all and `needs-review` categories should not be treated as complete verified machine forms.

## External specification research

- RitchieSpecs crawler-crane data separates Engine, Operational, Transmission, Undercarriage, Boom and Dimensions, including power/RPM, torque, operating weight, fuel/hydraulic capacity, voltage, travel speed, track shoe width/count, boom sections/heights/angle, working radius, gradeability and transport dimensions: https://ritchiespecs.com/model/link-belt-tcc1100-crawler-crane
- Kaishan DTH specifications include hole diameter, economical drilling depth, engine/total power, weight, pressure and gradeability; compressor, rod-handling and dust-collection configuration can vary: https://www.kaishandrilling.com/en/products/surface-dth-drilling-rigs/kt-series
- JCB distinguishes rated operating capacity and wheeled skid steer versus compact track loader: https://www.jcb.com/en-US/products/machines/skid-steer-loader/
- SSSI separates retail fuelling into dispensers, pumps/piping, storage tanks, venting/vapour recovery, filtration, monitoring and proving/calibration: https://sssi-ltd.com/en/retail-fuelling.html
- OPW is an additional manufacturer source for underground storage tank equipment: https://www.opwglobal.com/products/us/retail-fueling-products/underground-storage-tank-equipment

## Execution status

- No taxonomy seed or attribute seed has been run against Preview or Production.
- No database write or migration was performed.
- No Cloudflare/Vercel build or deployment was run.
- PR #317 remains Draft and unmerged.
- The exact Preview Worker database branch is still not verified. Do not seed or migrate until the target is proven.

## Next acceptance gate

1. Reconcile V1.1 and the definitive 16-group tree into one canonical taxonomy source.
2. Add missing industrial/fuel-station families to the definitive tree in the correct L1/L2/L3 positions.
3. Build an explicit 243-terminal-category form matrix: L2 family fields + L3 subtype-specific fields.
4. Add tests for taxonomy slug coverage, composed inheritance, required validation, unit consistency and listing persistence.
5. Read-only verify actual Preview category rows and attribute links before any Preview seed.
