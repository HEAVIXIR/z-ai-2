# HEAVIX Machine-Specific Listing Forms — Catalog V1

Status: implementation baseline on the listing-wizard feature branch. This document is not evidence that the catalog seed has been applied to any database.

## Design contract

1. Every selectable terminal machine category must have a dedicated technical form. The seed performs a read-only taxonomy coverage audit before its first write and aborts if an active terminal category under `machinery` has no exact template.
2. Family-level forms may be attached to non-terminal categories. The public category-attributes API merges ancestor links from root to selected leaf; the leaf form adds or overrides subtype-specific fields. A parent category itself must not be accepted as the final listing category.
3. Brand and model are selected in the preceding wizard step, not duplicated as technical attributes. A model/category overlay may change required/filterable/searchable/order settings without changing the family form.
4. A field key is globally unique in `AttributeDefinition`. The form seed therefore preserves an existing definition only when type, unit, labels and options are compatible. Incompatible variants are stored under deterministic category-prefixed keys, avoiding cross-category type/unit/option overwrites.
5. Numeric fields declare explicit engineering units. Do not silently mix kg/tonne, mm/m, L/min/m³/h, bar/MPa, or rpm/Hz. Where a manufacturer's value is configuration-dependent, retain a range or free-text field and request the supporting datasheet/load chart.
6. Required fields are the minimum identifiers needed to distinguish and search the machine. Optional technical fields remain optional when OEM configurations vary. Do not fabricate a value when the seller does not know it.
7. A generic "other / needs review" form is a controlled fallback, not a substitute for a missing specialist form.

## Covered machine families

The canonical taxonomy is organized into 16 top-level families. Forms include family templates plus exact leaf templates where the taxonomy defines a terminal subtype.

- **Earthmoving and road construction:** excavators (tracked, wheeled, mini, long-reach, mining, demolition, material-handling, spider, zero-tail-swing, telescopic and specialist); wheel/track/compact/skid-steer loaders; bulldozers; motor/compact/heavy/mining/GPS graders; backhoe loaders; scrapers; single/double-drum, vibratory, pneumatic, soil, asphalt and combination rollers; asphalt and concrete machinery; piling/foundation and site-haulage equipment.
- **Mining and underground:** rigid, articulated, underground, electric, diesel, hybrid and ultra-class mining trucks; mining excavators/loaders; hydraulic and electric-rope shovels; LHDs; underground utility vehicles; mine maintenance/service equipment; underground support and tunnel machinery.
- **Drilling:** rotary, DTH, top-hammer, core, RC, water-well, oil-and-gas, geotechnical, blast-hole, underground and jumbo drills; drill rigs and drilling accessories.
- **Crushing, screening and mineral processing:** jaw, cone, impact, gyratory, roll and hammer crushers; screens, scalpers, feeders, conveyors, washing plants, sand washers, hydrocyclones, magnetic separation, crushing/screening lines and mobile processing.
- **Concrete and asphalt:** batching plants, transit mixers, concrete mixers, truck/trailer/line/boom/stationary pumps, shotcrete, concrete production/placing, asphalt plants, distributors, pavers/finishers, bitumen systems and asphalt recycling.
- **Cranes and lifting:** tower, mobile, crawler, truck-mounted, wheel/rough-terrain, all-terrain, telescopic, chain, overhead, gantry, industrial and marine cranes; hoists, winches, lifting equipment, aerial platforms and material handlers.
- **Fuel station and fluid systems:** fuel dispensers, storage tanks, submersible fuel pumps, tank monitoring/leak detection, fuel filtration, hoses/nozzles and vapour-recovery equipment.
- **Industrial power and process:** diesel/gas/bi-fuel/hybrid/mobile/silent/containerized generators; air compressors; industrial/process pumps; hydraulic power packs; fans; boilers; HVAC; welding, cutting, transformers, switchgear and production/packaging machinery.
- **Transport, logistics and port:** forklifts and variants, reach trucks, pallet trucks, stackers, heavy haulage/modular transport, tractor trucks, trailers, tankers, refrigerated trucks, buses, pickups, port cranes, reach stackers, container handlers, straddle carriers, ship loaders/unloaders and marine-service equipment.
- **Agriculture, forestry, municipal and environmental:** agricultural/forestry machines and attachments; harvesting, planting and tillage; garbage trucks, street sweepers/washers, vacuum trucks, snow plows, salt spreaders, green-space and environmental equipment.
- **Specialist and project machinery:** rescue, airport ground-support, military engineering, custom-built, prototype, combination and technical-review fallback machinery.

## Technical form field families

The actual exact fields are defined in `prisma/seed-category-specific-attributes.ts`. Representative field groups include:

| Machine family | Core technical fields |
|---|---|
| Excavator / mini excavator | operating weight, bucket capacity, maximum digging depth, engine power, tail-swing configuration, auxiliary hydraulic flow, track width and overall dimensions |
| Skid-steer / compact track loader | rated operating capacity, tipping load, lift path, auxiliary hydraulic flow/pressure, attachment mount, ground pressure and track geometry |
| Crane | rated capacity, capacity at radius, boom/jib length, working radius, hook height, counterweight, outrigger span, axle/track configuration and load-chart availability |
| Drill rig | drilling method, hole diameter, depth, rotary torque/speed, feed and pullback forces, feed stroke, mast length, compressor capacity and operating weight |
| Screening / crushing | feed opening/size, throughput, screen area/decks/cut sizes, crusher type, rotor/roll dimensions, vibration and drive power |
| Asphalt / concrete | plant output, paving width/thickness, mixer volume/type, concrete output, pumping pressure, boom reach, heating and installed power |
| Fuel dispenser | product type, flow-rate range, metering system, accuracy class, nozzle count, hose size, electrical supply, environmental rating and certification |
| Fuel tank / pump | usable capacity, material, installation, compartmenting, flow/head/pressure, wetted materials, leak monitoring and overfill protection |
| Compressor | compressor technology, free-air delivery, working/max pressure, motor power, drive, lubrication, cooling, receiver volume and duty cycle |
| Industrial pump | pump type, flow, head, differential pressure, efficiency, NPSH, impeller, wetted material, seal, solids handling and speed |
| Heavy haulage | payload, axle lines/count, deck dimensions/heights, steering/suspension, modular configuration and gross combination weight |

## Evidence used to shape the catalog

These sources inform category coverage and technical field selection; they do not imply that every machine or market is governed by one universal data sheet.

- bauma's exhibitor sectors distinguish blast-hole drilling rigs and crane classes such as all-terrain, rough-terrain, telescopic, truck-mounted, crawler, tower, gantry, mini and recycling cranes: https://bauma.de/en/trade-fair/exhibitor-directory/exhibition-sectors/
- Liebherr's LRT 1090-2.1 publishes rated load, boom length, hoist height, radius, axle count, drive and ballast. Crane listings should therefore retain the working radius and manufacturer load chart, not just headline tonnage: https://www.liebherr.com/en-us/p/lrt109021-4407377
- Sandvik's DD322i specification sheet publishes percussion power/pressure/rate, rotation speed/torque, hole size, feed force, feed extension, hole length and rod dimensions. These are distinct from the fields used for a general surface drill rig: https://www.mining.sandvik/siteassets/product-documents/underground-drill-rigs/development-drill-rigs/dd322i-specification-sheet-english.pdf
- PRD's EX 65 blast-hole rig sheet publishes hole diameter, maximum depth, inclination, single-pass depth, pull-up/down force, rotary torque/speed, compressor delivery/pressure and operating weight: https://www.prdrigs.com/img/profile/prdrigs_mining.pdf
- OIML R117 certificate examples for fuel dispensers include min/max flow, minimum measured quantity, maximum pressure, accuracy class, environmental class and intended fluid. Those fields are more appropriate than a generic "pump capacity" field for metered dispensers: https://www.oiml.org/en/files/pdf_c/r117-2019-nl1-2020-03-rev3.pdf
- Tatsuno's dispenser technical guide distinguishes standard/high/ultra-high flow classes, min/max flow, minimum measured quantity, pressure, display and product types: https://www.tatsuno-europe.com/files/ckeditor/ke%20stazeni-en/users_manuals/UP041-EN_PetrolDispQuickGuideRev02%281%29.pdf
- XCMG's machinery catalog lists asphalt plant production capacity and installed power by model, supporting separate throughput and power fields for asphalt plants: https://tiimg.tistatic.com/fm/17537530/Xcmg%20E-commerce%20Inc.pdf
- The UNSD CPC classification separates underground tunnelling/boring machinery, earthmoving/compacting machinery, mineral processing, and lifting/handling equipment: https://unstats.un.org/unsd/classifications/Econ/Structure/Detail/en/16/444

## Validation and release gates

- Static taxonomy audit: 270 terminal categories in the current taxonomy seed; all 270 now have exact templates in this branch.
- Static template checks: duplicate template slugs = 0; missing required keys = 0 in direct template objects; field types are restricted to the declared `AttrType` union; SELECT/MULTI_SELECT fields have explicit options.
- Runtime seed preflight: checks active category presence, terminal-leaf coverage, per-template duplicate fields and required-field membership, and global key compatibility before the first write.
- Not yet run: TypeScript compile, Prisma validation, unit/E2E tests, database seed, Preview acceptance, or deployment.
- The new templates are code only until the taxonomy and attribute seeds are applied to the verified Preview database. Do not run against an unverified database or Production.
