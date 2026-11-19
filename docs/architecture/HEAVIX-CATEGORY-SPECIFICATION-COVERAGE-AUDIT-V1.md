# HEAVIX Category-Specific Specification Coverage Audit — V1

## Current static coverage re-audit (2026-11-20)

The current branch contains:
- 16 L1 machine groups.
- 182 L2 machine families: 167 terminal L2 categories and 15 L2 parents with L3 children.
- 104 L3 variants.
- **271 selectable terminal machine categories** (167 terminal L2 + 104 L3).
- `prisma/seed-category-specific-attributes.ts` defines 258 unique templates across the audited catalog roots.
- **271 of 271 machine terminal categories now have direct templates** after adding 88 subtype-specific leaf forms.
- A further **73 of 73 terminal categories** across vehicles (12), attachments (13), agriculture (12), industrial equipment (20), and parts (16) also have direct templates.
- **All 344 terminal categories across the six configured CATALOG roots are covered** in the static source comparison.
- The form registry contains 362 unique template slugs across the broader configured catalog roots.
- `tests/unit/machine-leaf-form-coverage.test.ts` enforces machine-tree coverage, the five additional root coverages, and duplicate-slug rejection.

The 88 machine additions cover excavator, loader, grader, backhoe, scraper, roller, mining shovel/LHD, drilling, crushing, concrete/asphalt, crane, material handling, haulage, port, recycling, tunnel and generator subtypes. A further 16 direct forms cover general spare parts plus engine, transmission, hydraulic, electrical, undercarriage, pump, valve, final-drive, swing-motor, filter, cooling, wear-part, tire/track, bearing and other-parts categories. Each generated leaf template has a required primary technical field and keeps family-level fields inherited from its parent category. Existing direct templates cover the other 72 terminal categories across vehicles, attachments, agriculture, industrial equipment and parts.

## Service and mineral form coverage

- 26 supplemental service leaves in the dedicated service taxonomy have explicit forms.
- 19 legacy terminal service categories in the V1.1 service tree have generated forms.
- 22 terminal material categories (13 direct material categories plus 9 iron-ore/copper/coal product leaves) have generated product forms.
- `tests/unit/service-mineral-form-coverage.test.ts` enforces all 26 + 19 + 22 mappings and verifies the shared mineral attributes are inherited from the material root.

These counts are a static comparison of the checked-in machine TREE and template registry. The seed's runtime preflight is stricter and evaluates active terminal categories across its five configured CATALOG roots in the target database. It remains fail-closed and must not be run against Preview or Production as part of this work. The previous 198-missing and 88-missing snapshots are historical and must not be used as current status.

## Taxonomy source reconciliation

The repository still contains a broader V1.1 catalog seed and a definitive 16-group machine-subtree seed. V1.1 owns the broader marketplace roots; the definitive seed refines the machinery subtree. Their database execution order and current Preview state are not inferred from source files. Keep all seeds in dry-run/read-only mode until the Preview target and backup are separately verified.

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
- This work is a first pass and does not yet cover the definitive tree's 270 terminal categories.

### Definitive taxonomy safety
The definitive `seed-machine-taxonomy.ts` had a safety gap: it deactivated legacy L1 categories without first checking whether listings existed in their descendants, and its before/after listing query did not cover the complete descendant tree. It has now been hardened on this branch:
- Read-only by default; requires explicit `--apply` to write.
- Preflight counts listings throughout the full machinery descendant tree.
- Refuses to deactivate any legacy L1 branch containing listings.
- Cleanup refuses to deactivate a category if any descendant has listings.
- Before/after listing preservation checks now traverse the complete descendant tree.

These protections have not been runtime-tested and the seed has not been executed.


## Missing terminal form matrix — 198 remaining

The following are terminal slugs in the definitive tree with no direct form mapping yet. This list is the work queue for the next form-catalog pass.

| L1 family | Missing terminal categories |
|---|---|
| Road construction (47) | `excavator-long-reach`, `excavator-mining`, `excavator-demolition`, `excavator-material-handling`, `excavator-spider`, `excavator-zero-tail-swing`, `excavator-long-radius`, `excavator-telescopic`, `excavator-special`, `compact-loader`, `industrial-loader`, `underground-loader`, `multi-purpose-loader`, `dozer-track`, `dozer-wheel`, `mini-dozer`, `heavy-dozer`, `mining-dozer`, `pipe-dozer`, `angle-dozer`, `swamp-dozer`, `motor-grader`, `compact-grader`, `heavy-grader`, `mining-grader`, `quarry-grader`, `gps-grader`, `backhoe-loader-standard`, `backhoe-4wd`, `backhoe-center-mount`, `backhoe-side-shift`, `compact-backhoe`, `industrial-backhoe`, `motor-scraper`, `towed-scraper`, `open-bowl-scraper`, `elevating-scraper`, `twin-engine-scraper`, `mining-scraper`, `soil-roller`, `asphalt-roller`, `combination-roller`, `grading-earthmoving`, `piling-foundation`, `site-haulage`, `multi-purpose-civil`, `other-civil` |
| Mining machinery (25) | `rigid-mining-truck`, `articulated-mining-truck`, `underground-dump-truck`, `electric-mining-truck`, `diesel-mining-truck`, `hybrid-mining-truck`, `ultra-class-mining-truck`, `hydraulic-shovel`, `electric-rope-shovel`, `mining-shovel`, `front-shovel`, `backhoe-shovel`, `mining-loader-machine`, `loading-machinery`, `mining-transport`, `underground-machinery`, `diesel-lhd`, `electric-lhd`, `battery-lhd`, `low-profile-lhd`, `mining-drilling`, `blasting-machinery`, `mine-maintenance`, `mobile-processing`, `mine-services` |
| Drilling (4) | `dth-drill`, `top-hammer-drill`, `water-well-drill`, `drilling-accessories` |
| Crushing / processing (14) | `cubiti-crusher`, `hammer-crusher`, `gyratory-crusher`, `roll-crusher`, `feeder`, `conveyor`, `scalper`, `washing-plant`, `sand-washer`, `hydrocyclone`, `magnetic-equipment`, `crushing-line`, `screening-line`, `mobile-processing-line` |
| Concrete / asphalt (16) | `truck-mounted-pump`, `trailer-pump`, `line-pump`, `boom-pump`, `stationary-pump`, `shotcrete`, `concrete-production`, `concrete-placing`, `track-paver`, `wheel-paver`, `mini-paver`, `highway-paver`, `asphalt-plant`, `asphalt-distributor`, `asphalt-recycling`, `bitumen-equipment` |
| Cranes / lifting (6) | `telescopic-crane`, `rough-terrain-crane`, `industrial-crane`, `winch`, `hoist`, `lifting-equipment` |
| Forklift / material handling (5) | `stackers`, `telehandler`, `material-handler`, `container-handler`, `warehouse-equipment` |
| Industrial haulage (7) | `site-dump-truck`, `site-transport`, `haul-truck`, `off-highway-truck`, `mining-truck`, `industrial-tractor`, `project-transport` |
| Port / marine (9) | `port-reach-stacker`, `empty-container-handler`, `straddle-carrier`, `port-crane`, `ship-loader`, `ship-unloader`, `mobile-harbor-crane`, `port-loading-equipment`, `marine-service-equipment` |
| Recycling / waste (11) | `shredder-machine`, `industrial-shredder`, `baler`, `sorting-machine`, `recycling-plant`, `waste-compactor`, `glass-recycling`, `plastic-recycling`, `metal-recycling`, `construction-waste-recycling`, `asphalt-recycling-machine` |
| Tunnel / underground (9) | `tbm`, `roadheader`, `tunnel-jumbo`, `underground-lhd`, `underground-truck-machine`, `bolter`, `scaling-machine`, `underground-utility-vehicle`, `tunnel-equipment` |
| Heavy industrial (9) | `steel-machinery`, `cement-machinery`, `mineral-processing-machinery`, `stone-cutting-machinery`, `glass-machinery`, `ceramic-machinery`, `industrial-production`, `industrial-packaging`, `heavy-factory-equipment` |
| Power / energy (15) | `diesel-generator`, `gas-generator`, `natural-gas-generator`, `bi-fuel-generator`, `hybrid-generator`, `mobile-generator`, `silent-generator`, `containerized-generator`, `trailer-generator`, `pump`, `power-pack`, `portable-power`, `industrial-welding`, `project-lighting`, `industrial-hvac` |
| Municipal / environment (9) | `garbage-truck`, `street-sweeper`, `street-washer`, `vacuum-truck`, `snow-plow`, `salt-spreader`, `municipal-service-truck`, `heavy-green-space`, `environmental-machinery` |
| Special project (7) | `industrial-rescue`, `military-engineering`, `industrial-fire-truck`, `airport-machinery`, `special-project-machinery`, `custom-machinery`, `prototype-machinery` |
| Other specialist (5) | `new-special`, `unknown-machine`, `combination-machine`, `custom-machine`, `needs-review` |

For L2 families with L3 children, the intended implementation is a complete family form on L2 plus subtype-specific additions/overrides on L3. For terminal L2 families, the L2 category receives the complete form. This yields a complete composed form for every selectable terminal category without duplicating all shared attributes.

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
- No database write or migration was performed for this audit.
- No Cloudflare/Vercel deployment was run.
- The machine taxonomy seed and form seed both have explicit fail-closed gates; the form seed aborts before writes when any active terminal equipment category lacks a dedicated template.
- The Preview Worker database target and its current taxonomy state remain unverified.

## Next acceptance gate

1. Validate the new 88 leaf templates against manufacturer technical references and refine labels/options/units where authoritative specifications are available.
2. Extend static tests to validate field-key type/unit consistency, option definitions, and composed parent/leaf inheritance.
3. Reconcile broader V1.1 roots and service/mineral taxonomy with the definitive machine subtree.
4. Read-only verify actual Preview category rows and attribute links before any separately approved Preview seed.
