# HEAVIX Category-Specific Specification Coverage Audit — V1

## Executive finding

The current listing form architecture correctly loads attributes from the selected category and its ancestors, but the catalog seed is not a complete category-to-form map.

Repository evidence on branch `feat/listing-wizard-end-to-end-2026-11-14`:
- The original `prisma/seed-taxonomy-v11.ts` declared 238 category slugs; this branch now extends it to 279 unique slugs, adding compact-loader subtypes, additional drilling/crane/roller/concrete subtypes, and a fuel-station-equipment branch.
- `prisma/seed-attribute-catalog.ts` contains 44 `CatLink` blocks.
- The legacy catalog has 44 broad `CatLink` blocks. A new exact-slug catalog adds 125 subtype templates. Together, 200 distinct slugs are named directly; 86 taxonomy slugs still have no direct template mapping. Most remaining slugs are parent nodes, services, logistics, trading/auction/RFQ, materials, parts, or fallback categories; the remaining leaf categories must be classified before declaring complete coverage.
- The legacy seed helper has now been changed to resolve and attach every existing slug candidate, rather than stopping at the first. This fixes the silent first-match defect for crusher, drilling, screen, conveyor, asphalt, pump, parts, and agricultural blocks. The new `seed-category-specific-attributes.ts` uses one exact slug per template and preflights every required category and field key before its first database write.
- The active V1.1 taxonomy and the older `seed-machine-taxonomy.ts` are not equivalent: the latter declares 286 slugs and includes additional machine subtypes (e.g. skid steer, compact track loader, crawler/truck/all-terrain cranes, core/RC/jumbo drills, concrete pumps, rollers). Do not assume those older slugs exist in the active 238-category tree.

## Design decision

1. The **terminal machine category** owns the base technical form. Forms are per machine type/subtype, not per commercial model.
2. A leaf form composes: global identity fields + domain/common fields + the exact leaf template. Parent forms may contribute genuinely common fields; child forms add or override subtype-specific fields.
3. Brand/model remain a separate step. A model-specific override is optional metadata, never a substitute for a complete category form.
4. Use explicit, exact slug-to-template mappings. Never put unrelated slugs into a list and assume one generic template has been attached to all of them.
5. Only machine/equipment categories receive machine technical templates. Service, material, transaction, and spare-part categories need their own distinct schemas and must not inherit machine operating-hour/engine fields indiscriminately.
6. Keep unknown/configuration-dependent values optional. Do not invent technical defaults. Show units, valid ranges/options, and source provenance where available.
7. A category with no verified dedicated template must be marked as a coverage gap, not silently shown a generic form as if complete.

## Current high-priority coverage gaps

| Family | Active taxonomy examples | Required independent forms |
|---|---|---|
| Compact loaders | loader (currently broad parent) | skid steer, compact track loader, wheel loader, track loader, telehandler |
| Cranes & lifting | crane, tower-crane, wheel-crane, chain-crane, mobile-crane, overhead-crane, gantry-crane | tower, mobile/wheeled, crawler/chain, truck/all-terrain where taxonomy supports it, overhead, gantry, port/marine |
| Drilling | drill-rig, rotary-drill, dth, top-hammer, water-well-drilling | rotary, DTH, top hammer, core/RC, water well, oil/gas, geotechnical, blast-hole, underground/jumbo |
| Mining | mining-excavator-machine, mining-loader, dump-truck, lhd, shovel | mining excavator, underground LHD, mining loader, rigid/articulated/underground haul truck, hydraulic/electric rope shovel |
| Crushing & processing | jaw-crusher, cone-crusher, impact-crusher, cubic-crusher, screen, conveyor-belt, complete-line | jaw, cone, impact, hammer/gyratory where present, screen, feeder, conveyor, washing/processing line |
| Road construction | scraper, road-roller, asphalt-finisher, asphalt-machinery, concrete-machinery | scraper, roller subtypes, asphalt paver/finisher, distributor/plant/recycling, concrete pump/mixer/batching/shotcrete |
| Warehouse & port | forklift, reach-truck, pallet-truck, stacker, reach-stacker, gantry-crane | counterbalance forklift by fuel, reach truck, pallet truck, stacker, reach stacker, container handler |
| Industrial equipment | generator, compressor, aerial-platform, industrial-pumps, industrial-fans, boilers, HVAC, welding/cutting, transformers/switchgear | generator variants, compressors, MEWP, pump classes, fans, boilers, HVAC, welding/cutting, electrical power equipment |
| Fuel-station systems | absent as a dedicated active taxonomy branch | dispenser, UST/AST tanks, submersible/suction pumps, ATG/leak detection, piping/valves, hoses/nozzles, filtration, vapour recovery |

## External specification research used

- RitchieSpecs crawler-crane data exposes distinct Engine, Operational, Transmission, Undercarriage, Boom, and Dimensions groups. Useful fields include gross power, power RPM, torque, operating weight, fuel/hydraulic capacity, voltage, travel speed, track shoe width/count, boom sections/heights/angle, working radius, gradeability, and transport dimensions: https://ritchiespecs.com/model/link-belt-tcc1100-crawler-crane
- Kaishan's DTH series comparison uses hole diameter, economical drilling depth, engine/total power, weight, pressure, and gradeability, and explicitly flags model/configuration-dependent compressor, rod-handling, and dust-collection equipment: https://www.kaishandrilling.com/en/products/surface-dth-drilling-rigs/kt-series
- JCB's skid-steer product material distinguishes rated operating capacity and wheeled skid steer vs compact track loader, supporting a dedicated compact-loader form rather than a generic wheel-loader form: https://www.jcb.com/en-US/products/machines/skid-steer-loader/
- SSSI's retail-fuelling equipment taxonomy separates dispensers, pumps/piping, storage tanks, venting/vapour recovery, islands/protection, filtration/fuel quality, monitoring and proving/calibration: https://sssi-ltd.com/en/retail-fuelling.html
- OPW's underground storage equipment catalogue is an additional manufacturer reference for below-ground station equipment: https://www.opwglobal.com/products/us/retail-fueling-products/underground-storage-tank-equipment

## Implementation status

This audit is repository/source review plus external product-specification research. It does not prove that any seed has been run in the Preview database. The additive category-template seed introduced alongside this audit is not executed here. No migration, database write, deployment, or Production change is authorized or performed by this work.

## Acceptance criteria

- Every active terminal machine/equipment slug has an explicit form mapping or a documented, reviewed exception.
- Forms are distinct where engineering purpose and measurable specification differ.
- Every form has field key, Persian and English labels, correct data type, unit, filter/search/card metadata, and carefully selected required fields.
- Required fields are not so strict that uncommon configurations become impossible to list.
- Category selection rejects parent/intermediate nodes.
- API inheritance merges parent-common fields with leaf-specific fields deterministically.
- Automated tests cover slug mapping, parent inheritance, subtype overrides, required validation, and non-machine category isolation.
- A read-only Preview audit confirms actual category rows and form links before any seed or migration is run.
