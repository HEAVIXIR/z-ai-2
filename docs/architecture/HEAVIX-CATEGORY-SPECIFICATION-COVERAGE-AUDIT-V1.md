# HEAVIX Category-Specific Specification Coverage Audit — V1

## Executive result

The listing wizard now has a category-driven technical form foundation. The form unit is the **terminal machine/equipment type**, not the commercial model.

Static repository audit on branch `feat/listing-wizard-end-to-end-2026-11-14`:
- Active taxonomy seed: **279 unique category slugs** (the original file had 238).
- Legacy catalog: **44 broad CatLink blocks**.
- New exact catalog: **128 unique one-slug templates** in `prisma/seed-category-specific-attributes.ts`.
- Combined direct mapping: **203 distinct slugs**.
- Remaining 83 slugs are primarily parent nodes, service/logistics/trading/auction/RFQ/material/part categories and fallbacks. They must be classified by domain; they must not receive generic machine engine/operating-hour fields simply to inflate coverage.
- The old multi-slug seed defect is fixed: every existing slug candidate is now linked, rather than only the first existing slug.
- The new exact-form seed preflights category existence, duplicate template slugs, duplicate field keys, missing required fields, and taxonomy coverage before the first database write.

## What was added

### Taxonomy expansion

The active V1.1 taxonomy was expanded from 238 to 279 unique slugs. Added or expanded groups include:
- Loader subtypes: wheel loader, track loader, skid steer, compact track loader, telehandler.
- Drilling: core, RC, geotechnical, blast-hole, underground, jumbo, oil/gas, in addition to rotary, DTH, Top Hammer and water-well.
- Cranes: crawler, truck-mounted, all-terrain and marine, in addition to tower, wheel, chain, mobile and overhead.
- Road rollers: single drum, double drum, vibratory and pneumatic.
- Concrete: concrete pump, batching plant, transit mixer, concrete mixer and shotcrete.
- Fuel-station equipment: dispenser, storage tank, submersible fuel pump, tank monitoring/leak detection, filtration, hoses/nozzles and vapour recovery.
- Forklifts: diesel, electric, LPG, gasoline, heavy-duty, rough-terrain, side-loader and container variants.

### Exact category templates

The 128 exact templates cover:
- Compact loaders and excavator subtypes.
- Crane engineering configurations and load-chart-related fields.
- Drilling methods and rigs, including hole diameter/depth, rotation/feed, air supply, rods, compressor, dust collection and underground configuration.
- Mining loaders, mining excavators, LHD and crushing/processing equipment.
- Roller subtypes, asphalt pavers, concrete pumps, batching plants, mixers and shotcrete.
- Fuel dispensers, storage tanks, submersible pumps, monitoring/leak detection, filtration, hose/nozzle and vapour recovery.
- Aerial platforms, industrial fans, boilers, HVAC, welding/cutting, transformers and switchgear.
- Agricultural implements, forestry machines, recycling lines, sorters, port/warehouse equipment, forklift variants, attachments and commercial fleet categories.

### Technical integrity

Repeated attribute keys must have one canonical unit because `AttributeDefinition` is shared globally. The new catalog therefore separates incompatible dimensions with distinct keys (for example kW vs legacy HP, kilogram-rated capacity vs ton-rated capacity, millimetres vs metres, degrees vs percent, Ah vs kWh). Static checks found:
- All 128 template slugs exist in the active taxonomy.
- No duplicate template slugs.
- No missing required field keys or duplicate field keys within a template.
- No unit conflicts among repeated new template keys.
- No unit conflicts between new template keys and legacy shared attribute definitions.
- Every MULTI_SELECT field has explicit options.

These are static source checks only, not TypeScript compilation, Prisma validation or runtime acceptance tests.

## Why these are separate forms

Examples:
- Skid steer requires rated operating capacity, tipping load, lift path, auxiliary hydraulic flow/pressure and attachment interface; a wheel loader's bucket capacity/breakout/dump geometry is not an adequate substitute.
- Crawler crane needs track shoe width, track gauge, ground pressure and crawler travel; tower crane needs jib/tip load, mast, hook height and trolley/hoist/slew speeds; mobile/truck cranes need carrier, axle, outrigger and road-travel attributes.
- DTH needs hole diameter, economical depth, air pressure/flow, hammer/rod configuration, compressor and dust collection; rotary, top-hammer, core, RC, well and underground drilling require different parameter groups.
- Fuel-station equipment is not one generic pump form: dispensers, tanks, submersible pumps, ATG/leak detection, filtration, hose/nozzle and vapour recovery have distinct specifications.

## External specification research

- RitchieSpecs crawler-crane data separates Engine, Operational, Transmission, Undercarriage, Boom and Dimensions. It includes gross power/RPM, torque, operating weight, fuel/hydraulic capacity, voltage, travel speed, track shoe width/count, boom sections/heights/angle, working radius, gradeability and transport dimensions: https://ritchiespecs.com/model/link-belt-tcc1100-crawler-crane
- Kaishan's DTH series comparison uses hole diameter, economical drilling depth, engine/total power, weight, pressure and gradeability. It flags configuration-dependent compressor, rod-handling and dust-collection equipment: https://www.kaishandrilling.com/en/products/surface-dth-drilling-rigs/kt-series
- JCB distinguishes rated operating capacity and wheeled skid steer versus compact track loader, supporting a dedicated compact-loader form: https://www.jcb.com/en-US/products/machines/skid-steer-loader/
- SSSI separates retail-fuelling equipment into dispensers, pumps/piping, storage tanks, venting/vapour recovery, islands/protection, filtration/fuel quality, monitoring and proving/calibration: https://sssi-ltd.com/en/retail-fuelling.html
- OPW provides an additional manufacturer catalogue for below-ground fuel-station equipment: https://www.opwglobal.com/products/us/retail-fueling-products/underground-storage-tank-equipment

## Remaining unmapped categories

The remaining 83 direct-unmapped slugs are not 83 missing machine forms. They include:
- Parent nodes with mapped children: mining-machinery, underground-machinery, crushing-screening, cranes-lifting, forklift-warehouse, conveying, recycling, port-machinery, forestry-machinery, industrial-machinery, vehicles, parts, attachments, agriculture and fuel-station-equipment.
- Parts families requiring a separate parts specification design: electrical-parts, undercarriage, final-drive, swing-motor, cooling-system, wear-parts, other-parts.
- Service/inspection/repair categories, logistics/transport categories, materials, trading, auctions, wanted/RFQ categories and fallback nodes.

Those non-machine leaf categories need their own domain schemas if HEAVIX wants complete coverage across the entire marketplace. They should not inherit machine technical forms.

## Safety and execution status

- Neither `seed-attribute-catalog.ts` nor `seed-category-specific-attributes.ts` has been run against a database in this work.
- No migration was applied.
- No Preview or Production database was written.
- No Cloudflare or Vercel build/deployment was run.
- The listing PR remains Draft and unmerged.
- A read-only audit must first verify that the actual Preview Worker is connected to the intended Preview database branch. Only then should the taxonomy and attribute seeds be considered for Preview execution.

## Acceptance criteria

1. Every terminal machine/equipment category has an explicit exact form or a documented reviewed exception.
2. Forms are distinct where engineering purpose and measurable specifications differ.
3. Parent-common fields inherit; leaf-specific fields add/override deterministically.
4. Required fields are realistic and do not reject uncommon configurations.
5. Units are canonical per attribute key; model overrides never redefine the category form.
6. Tests cover slug mapping, parent inheritance, subtype overrides, required validation, attribute persistence and non-machine isolation.
7. Preview database category rows and attribute links are verified read-only before any seed/migration.
