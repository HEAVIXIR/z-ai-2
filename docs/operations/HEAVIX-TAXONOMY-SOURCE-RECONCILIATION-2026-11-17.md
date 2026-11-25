# HEAVIX taxonomy source reconciliation inventory

> Read-only inventory generated from the exact Integration branch snapshot below. This document records source disagreements; it does **not** choose canonical labels, parents, layers, or domains and does not authorize any seed, migration, or database write.

## Snapshot and extraction scope

- Repository: `HEAVIXIR/z-ai-2`
- Branch: `integration/preview-readiness-workerd-2026-11-15`
- Commit: `f777174966238c0eac304ad3f02f815a74aaecea`
- `prisma/seed-machine-taxonomy.ts` blob: `590e709ad1e828d548d1061d4f61127d3c1ad56f`
- `prisma/seed-taxonomy-v11.ts` blob: `aca62b5a4e59096bed3b4a5d047ba699f6f33577`
- `prisma/seed-service-and-mineral-taxonomy.ts` blob: `bb190d54533482a20a23371c0a0d9eec1966caa4`
- Extraction scope: category object records with both `name` and `slug` inside the three source trees; `seed-machine-taxonomy.ts` paths are normalized beneath the existing `machinery` root, and supplemental trees beneath `services`, `iron-ore`, `copper-ore`, and `coal`.

## Counts

| Source | Category records |
|---|---:|
| Legacy machine tree | 302 |
| V1.1 tree | 279 |
| Service tree | 31 |
| Mineral subtrees | 10 |
| **Raw source records** | **622** |
| **Unique candidate slugs (union)** | **531** |
| Slugs present in 2+ source records | 91 |
| Extra repeated occurrences beyond first definition | 91 |
| Slugs with different primary `name` labels | 50 |
| Slugs with different parent paths | 54 |
| Slugs with different layers | 1 |
| Slugs with different effective domains | 12 |
| Slugs with different combined parent-path/layer/domain signatures | 54 |

Effective V1.1 domain values follow the seed implementation node by node: an omitted `domain` on a `CATALOG` category resolves to `MACHINE` and is not inherited from its parent. This inventory records the resolved value rather than treating the omission as an unknown domain. The 54 combined identity conflicts are driven by parent-path differences; layer and effective-domain differences are separately counted above.

These counts are the exact extraction result for the recorded commit. They supersede older runbook counts if those differ. The historical 539-category snapshot remains a separate, unverified target and must not be treated as reconciled by this source union.

## All repeated slug definitions

Each row shows the source-defined primary label, normalized category path, and layer/domain. Differences are evidence only; no preferred source is inferred.

| Slug | Definitions |
|---|---|
| `aerial-platform` | legacy-machine: “سکوی کار در ارتفاع” — `machinery/cranes-lifting/aerial-platform` (`CATALOG/MACHINE`)<br>v1.1: “سکوی بلندبر” — `industrial-equipment/aerial-platform` (`CATALOG/INDUSTRIAL_EQUIPMENT`) |
| `all-terrain-crane` | legacy-machine: “جرثقیل All Terrain” — `machinery/cranes-lifting/all-terrain-crane` (`CATALOG/MACHINE`)<br>v1.1: “جرثقیل تمام‌زمین” — `machinery/cranes-lifting/all-terrain-crane` (`CATALOG/MACHINE`) |
| `asphalt-finisher` | legacy-machine: “آسفالت فینیشر” — `machinery/concrete-asphalt/asphalt-finisher` (`CATALOG/MACHINE`)<br>v1.1: “فینیشر آسفالت” — `machinery/road-construction/asphalt-finisher` (`CATALOG/MACHINE`) |
| `asphalt-machinery` | legacy-machine: “ماشین‌آلات آسفالت” — `machinery/road-construction/asphalt-machinery` (`CATALOG/MACHINE`)<br>v1.1: “ماشین‌آلات آسفالت” — `machinery/road-construction/asphalt-machinery` (`CATALOG/MACHINE`) |
| `backhoe-loader` | legacy-machine: “بکهو لودر” — `machinery/road-construction/backhoe-loader` (`CATALOG/MACHINE`)<br>v1.1: “بکهو لودر” — `machinery/road-construction/backhoe-loader` (`CATALOG/MACHINE`) |
| `batching-plant` | legacy-machine: “بچینگ پلانت” — `machinery/concrete-asphalt/batching-plant` (`CATALOG/MACHINE`)<br>v1.1: “بچینگ پلانت” — `machinery/road-construction/concrete-machinery/batching-plant` (`CATALOG/MACHINE`) |
| `blast-hole-drill` | legacy-machine: “Blast Hole Drill” — `machinery/drilling/blast-hole-drill` (`CATALOG/MACHINE`)<br>v1.1: “حفاری چال انفجاری” — `machinery/drilling-rigs/blast-hole-drill` (`CATALOG/MACHINE`) |
| `boilers` | legacy-machine: “دیگ‌های بخار” — `machinery/power-energy/boilers` (`CATALOG/MACHINE`)<br>v1.1: “دیگ‌های بخار” — `industrial-equipment/boilers` (`CATALOG/INDUSTRIAL_EQUIPMENT`) |
| `bulldozer` | legacy-machine: “بولدوزر” — `machinery/road-construction/bulldozer` (`CATALOG/MACHINE`)<br>v1.1: “بولدوزر” — `machinery/road-construction/bulldozer` (`CATALOG/MACHINE`) |
| `compact-track-loader` | legacy-machine: “Compact Track” — `machinery/road-construction/loader/compact-track-loader` (`CATALOG/MACHINE`)<br>v1.1: “کامپکت ترک لودر” — `machinery/road-construction/loader/compact-track-loader` (`CATALOG/MACHINE`) |
| `compressor` | legacy-machine: “کمپرسور” — `machinery/power-energy/compressor` (`CATALOG/MACHINE`)<br>v1.1: “کمپرسور” — `industrial-equipment/compressor` (`CATALOG/INDUSTRIAL_EQUIPMENT`) |
| `concrete-machinery` | legacy-machine: “ماشین‌آلات بتن” — `machinery/road-construction/concrete-machinery` (`CATALOG/MACHINE`)<br>v1.1: “ماشین‌آلات بتن” — `machinery/road-construction/concrete-machinery` (`CATALOG/MACHINE`) |
| `concrete-mixer` | legacy-machine: “میکسر بتن” — `machinery/concrete-asphalt/concrete-mixer` (`CATALOG/MACHINE`)<br>v1.1: “میکسر بتن” — `machinery/road-construction/concrete-machinery/concrete-mixer` (`CATALOG/MACHINE`) |
| `concrete-pump` | legacy-machine: “پمپ بتن” — `machinery/concrete-asphalt/concrete-pump` (`CATALOG/MACHINE`)<br>v1.1: “پمپ بتن” — `machinery/road-construction/concrete-machinery/concrete-pump` (`CATALOG/MACHINE`) |
| `cone-crusher` | legacy-machine: “سنگ‌شکن مخروطی” — `machinery/crushing-processing/cone-crusher` (`CATALOG/MACHINE`)<br>v1.1: “مخروطی” — `machinery/crushing-screening/cone-crusher` (`CATALOG/MACHINE`) |
| `container-forklift` | legacy-machine: “Container” — `machinery/forklift-material/forklift/container-forklift` (`CATALOG/MACHINE`)<br>v1.1: “لیفتراک کانتینری” — `machinery/forklift-warehouse/forklift/container-forklift` (`CATALOG/MACHINE`) |
| `core-drill` | legacy-machine: “Core Drill” — `machinery/drilling/core-drill` (`CATALOG/MACHINE`)<br>v1.1: “مغزه‌گیر” — `machinery/drilling-rigs/core-drill` (`CATALOG/MACHINE`) |
| `cranes-lifting` | legacy-machine: “۰۶ جرثقیل، بالابر و لیفتینگ” — `machinery/cranes-lifting` (`CATALOG/MACHINE`)<br>v1.1: “۰۱.۰۵ جرثقیل و بالابر” — `machinery/cranes-lifting` (`CATALOG/MACHINE`) |
| `crawler-crane` | legacy-machine: “جرثقیل زنجیری” — `machinery/cranes-lifting/crawler-crane` (`CATALOG/MACHINE`)<br>v1.1: “جرثقیل زنجیری” — `machinery/cranes-lifting/crawler-crane` (`CATALOG/MACHINE`) |
| `cutting-equipment` | legacy-machine: “تجهیزات برش صنعتی” — `machinery/power-energy/cutting-equipment` (`CATALOG/MACHINE`)<br>v1.1: “تجهیزات برش” — `industrial-equipment/cutting-equipment` (`CATALOG/INDUSTRIAL_EQUIPMENT`) |
| `diesel-forklift` | legacy-machine: “Diesel” — `machinery/forklift-material/forklift/diesel-forklift` (`CATALOG/MACHINE`)<br>v1.1: “لیفتراک دیزلی” — `machinery/forklift-warehouse/forklift/diesel-forklift` (`CATALOG/MACHINE`) |
| `double-drum-roller` | legacy-machine: “دو‌درام” — `machinery/road-construction/road-roller/double-drum-roller` (`CATALOG/MACHINE`)<br>v1.1: “غلتک دو‌درام” — `machinery/road-construction/road-roller/double-drum-roller` (`CATALOG/MACHINE`) |
| `drill-rig` | legacy-machine: “Drill Rig” — `machinery/drilling/drill-rig` (`CATALOG/MACHINE`)<br>v1.1: “Drill Rig” — `machinery/drilling-rigs/drill-rig` (`CATALOG/MACHINE`) |
| `electric-forklift` | legacy-machine: “Electric” — `machinery/forklift-material/forklift/electric-forklift` (`CATALOG/MACHINE`)<br>v1.1: “لیفتراک برقی” — `machinery/forklift-warehouse/forklift/electric-forklift` (`CATALOG/MACHINE`) |
| `excavator` | legacy-machine: “بیل مکانیکی” — `machinery/road-construction/excavator` (`CATALOG/MACHINE`)<br>v1.1: “بیل مکانیکی” — `machinery/road-construction/excavator` (`CATALOG/MACHINE`) |
| `excavator-chain` | legacy-machine: “زنجیری” — `machinery/road-construction/excavator/excavator-chain` (`CATALOG/MACHINE`)<br>v1.1: “زنجیری” — `machinery/road-construction/excavator/excavator-chain` (`CATALOG/MACHINE`) |
| `excavator-wheel` | legacy-machine: “چرخ لاستیکی” — `machinery/road-construction/excavator/excavator-wheel` (`CATALOG/MACHINE`)<br>v1.1: “چرخ لاستیکی” — `machinery/road-construction/excavator/excavator-wheel` (`CATALOG/MACHINE`) |
| `extraction-machinery` | legacy-machine: “ماشین‌آلات استخراج” — `machinery/mining-machinery/extraction-machinery` (`CATALOG/MACHINE`)<br>v1.1: “ماشین‌آلات استخراج” — `machinery/mining-machinery/extraction-machinery` (`CATALOG/MACHINE`) |
| `forklift` | legacy-machine: “لیفتراک” — `machinery/forklift-material/forklift` (`CATALOG/MACHINE`)<br>v1.1: “لیفتراک” — `machinery/forklift-warehouse/forklift` (`CATALOG/MACHINE`) |
| `fuel-dispenser` | legacy-machine: “دیسپنسر سوخت” — `machinery/power-energy/fuel-station-equipment/fuel-dispenser` (`CATALOG/MACHINE`)<br>v1.1: “دیسپنسر سوخت” — `industrial-equipment/fuel-station-equipment/fuel-dispenser` (`CATALOG/MACHINE`) |
| `fuel-filtration` | legacy-machine: “فیلتراسیون سوخت” — `machinery/power-energy/fuel-station-equipment/fuel-filtration` (`CATALOG/MACHINE`)<br>v1.1: “فیلتراسیون سوخت” — `industrial-equipment/fuel-station-equipment/fuel-filtration` (`CATALOG/MACHINE`) |
| `fuel-hose-nozzle` | legacy-machine: “شلنگ و نازل سوخت” — `machinery/power-energy/fuel-station-equipment/fuel-hose-nozzle` (`CATALOG/MACHINE`)<br>v1.1: “شلنگ و نازل سوخت” — `industrial-equipment/fuel-station-equipment/fuel-hose-nozzle` (`CATALOG/MACHINE`) |
| `fuel-station-equipment` | legacy-machine: “تجهیزات جایگاه سوخت” — `machinery/power-energy/fuel-station-equipment` (`CATALOG/MACHINE`)<br>v1.1: “تجهیزات جایگاه سوخت” — `industrial-equipment/fuel-station-equipment` (`CATALOG/INDUSTRIAL_EQUIPMENT`) |
| `fuel-storage-tank` | legacy-machine: “مخزن ذخیره سوخت” — `machinery/power-energy/fuel-station-equipment/fuel-storage-tank` (`CATALOG/MACHINE`)<br>v1.1: “مخزن ذخیره سوخت” — `industrial-equipment/fuel-station-equipment/fuel-storage-tank` (`CATALOG/MACHINE`) |
| `gantry-crane` | legacy-machine: “جرثقیل دروازه‌ای” — `machinery/cranes-lifting/gantry-crane` (`CATALOG/MACHINE`)<br>v1.1: “گانتری کرین” — `machinery/port-machinery/gantry-crane` (`CATALOG/MACHINE`) |
| `gasoline-forklift` | legacy-machine: “Gasoline” — `machinery/forklift-material/forklift/gasoline-forklift` (`CATALOG/MACHINE`)<br>v1.1: “لیفتراک بنزینی” — `machinery/forklift-warehouse/forklift/gasoline-forklift` (`CATALOG/MACHINE`) |
| `generator` | legacy-machine: “ژنراتور” — `machinery/power-energy/generator` (`CATALOG/MACHINE`)<br>v1.1: “ژنراتور” — `industrial-equipment/generator` (`CATALOG/INDUSTRIAL_EQUIPMENT`) |
| `geotechnical-drill` | legacy-machine: “Geotechnical Drill” — `machinery/drilling/geotechnical-drill` (`CATALOG/MACHINE`)<br>v1.1: “حفاری ژئوتکنیک” — `machinery/drilling-rigs/geotechnical-drill` (`CATALOG/MACHINE`) |
| `grader` | legacy-machine: “گریدر” — `machinery/road-construction/grader` (`CATALOG/MACHINE`)<br>v1.1: “گریدر” — `machinery/road-construction/grader` (`CATALOG/MACHINE`) |
| `heavy-duty-forklift` | legacy-machine: “Heavy Duty” — `machinery/forklift-material/forklift/heavy-duty-forklift` (`CATALOG/MACHINE`)<br>v1.1: “لیفتراک سنگین” — `machinery/forklift-warehouse/forklift/heavy-duty-forklift` (`CATALOG/MACHINE`) |
| `heavy-haulage` | legacy-machine: “ماشین حمل فوق‌سنگین” — `machinery/industrial-haulage/heavy-haulage` (`CATALOG/MACHINE`)<br>v1.1: “حمل سنگین” — `transport-logistics/heavy-haulage` (`SERVICE/TRANSPORT`) |
| `hvac-equipment` | legacy-machine: “تجهیزات تهویه مطبوع” — `machinery/power-energy/hvac-equipment` (`CATALOG/MACHINE`)<br>v1.1: “تجهیزات تهویه” — `industrial-equipment/hvac-equipment` (`CATALOG/INDUSTRIAL_EQUIPMENT`) |
| `impact-crusher` | legacy-machine: “سنگ‌شکن ضربه‌ای” — `machinery/crushing-processing/impact-crusher` (`CATALOG/MACHINE`)<br>v1.1: “ضربه‌ای” — `machinery/crushing-screening/impact-crusher` (`CATALOG/MACHINE`) |
| `industrial-fans` | legacy-machine: “فن‌های صنعتی” — `machinery/power-energy/industrial-fans` (`CATALOG/MACHINE`)<br>v1.1: “فن‌های صنعتی” — `industrial-equipment/industrial-fans` (`CATALOG/INDUSTRIAL_EQUIPMENT`) |
| `industrial-pumps` | legacy-machine: “پمپ‌های صنعتی” — `machinery/power-energy/industrial-pumps` (`CATALOG/MACHINE`)<br>v1.1: “پمپ‌های صنعتی” — `industrial-equipment/industrial-pumps` (`CATALOG/INDUSTRIAL_EQUIPMENT`) |
| `jaw-crusher` | legacy-machine: “سنگ‌شکن فکی” — `machinery/crushing-processing/jaw-crusher` (`CATALOG/MACHINE`)<br>v1.1: “فکی” — `machinery/crushing-screening/jaw-crusher` (`CATALOG/MACHINE`) |
| `jumbo-drill` | legacy-machine: “Jumbo Drill” — `machinery/drilling/jumbo-drill` (`CATALOG/MACHINE`)<br>v1.1: “جامبو حفاری تونل” — `machinery/drilling-rigs/jumbo-drill` (`CATALOG/MACHINE`) |
| `lhd` | legacy-machine: “LHD” — `machinery/mining-machinery/lhd` (`CATALOG/MACHINE`)<br>v1.1: “LHD” — `machinery/mining-machinery/lhd` (`CATALOG/MACHINE`) |
| `loader` | legacy-machine: “لودر” — `machinery/road-construction/loader` (`CATALOG/MACHINE`)<br>v1.1: “لودر” — `machinery/road-construction/loader` (`CATALOG/MACHINE`) |
| `lpg-forklift` | legacy-machine: “LPG” — `machinery/forklift-material/forklift/lpg-forklift` (`CATALOG/MACHINE`)<br>v1.1: “لیفتراک LPG” — `machinery/forklift-warehouse/forklift/lpg-forklift` (`CATALOG/MACHINE`) |
| `marine-crane` | legacy-machine: “جرثقیل دریایی” — `machinery/cranes-lifting/marine-crane` (`CATALOG/MACHINE`)<br>v1.1: “جرثقیل دریایی” — `machinery/cranes-lifting/marine-crane` (`CATALOG/MACHINE`) |
| `mini-excavator` | legacy-machine: “مینی بیل” — `machinery/road-construction/excavator/mini-excavator` (`CATALOG/MACHINE`)<br>v1.1: “مینی بیل” — `machinery/road-construction/excavator/mini-excavator` (`CATALOG/MACHINE`) |
| `mining-excavator-machine` | legacy-machine: “بیل معدنی” — `machinery/mining-machinery/mining-excavator-machine` (`CATALOG/MACHINE`)<br>v1.1: “بیل معدنی” — `machinery/mining-machinery/mining-excavator-machine` (`CATALOG/MACHINE`) |
| `mining-loader` | legacy-machine: “معدنی” — `machinery/road-construction/loader/mining-loader` (`CATALOG/MACHINE`)<br>v1.1: “لودر معدنی” — `machinery/mining-machinery/mining-loader` (`CATALOG/MACHINE`) |
| `mining-machinery` | legacy-machine: “۰۲ ماشین‌آلات معدنی” — `machinery/mining-machinery` (`CATALOG/MACHINE`)<br>v1.1: “۰۱.۰۲ ماشین‌آلات معدنی” — `machinery/mining-machinery` (`CATALOG/MACHINE`) |
| `mobile-crane` | legacy-machine: “جرثقیل موبایل” — `machinery/cranes-lifting/mobile-crane` (`CATALOG/MACHINE`)<br>v1.1: “متحرک” — `machinery/cranes-lifting/mobile-crane` (`CATALOG/MACHINE`) |
| `oil-gas-drilling` | legacy-machine: “Oil & Gas Drilling” — `machinery/drilling/oil-gas-drilling` (`CATALOG/MACHINE`)<br>v1.1: “حفاری نفت و گاز” — `machinery/drilling-rigs/oil-gas-drilling` (`CATALOG/MACHINE`) |
| `other-mining` | legacy-machine: “سایر ماشین‌آلات معدنی” — `machinery/mining-machinery/other-mining` (`CATALOG/MACHINE`)<br>v1.1: “سایر” — `machinery/mining-machinery/other-mining` (`CATALOG/MACHINE`) |
| `overhead-crane` | legacy-machine: “جرثقیل سقفی” — `machinery/cranes-lifting/overhead-crane` (`CATALOG/MACHINE`)<br>v1.1: “سقفی” — `machinery/cranes-lifting/overhead-crane` (`CATALOG/MACHINE`) |
| `pallet-truck` | legacy-machine: “Pallet Truck” — `machinery/forklift-material/pallet-truck` (`CATALOG/MACHINE`)<br>v1.1: “پالت‌تراک” — `machinery/forklift-warehouse/pallet-truck` (`CATALOG/MACHINE`) |
| `pneumatic-roller` | legacy-machine: “پنوماتیک” — `machinery/road-construction/road-roller/pneumatic-roller` (`CATALOG/MACHINE`)<br>v1.1: “غلتک پنوماتیک” — `machinery/road-construction/road-roller/pneumatic-roller` (`CATALOG/MACHINE`) |
| `production-line` | legacy-machine: “ماشین‌آلات خطوط تولید” — `machinery/industrial-heavy/production-line` (`CATALOG/MACHINE`)<br>v1.1: “خط تولید” — `machinery/industrial-machinery/production-line` (`CATALOG/MACHINE`) |
| `rc-drill` | legacy-machine: “RC Drill” — `machinery/drilling/rc-drill` (`CATALOG/MACHINE`)<br>v1.1: “حفاری RC” — `machinery/drilling-rigs/rc-drill` (`CATALOG/MACHINE`) |
| `reach-stacker` | legacy-machine: “Reach Stacker” — `machinery/forklift-material/reach-stacker` (`CATALOG/MACHINE`)<br>v1.1: “ریچ استاکر” — `machinery/port-machinery/reach-stacker` (`CATALOG/MACHINE`) |
| `reach-truck` | legacy-machine: “Reach Truck” — `machinery/forklift-material/reach-truck` (`CATALOG/MACHINE`)<br>v1.1: “ریچ‌تراک” — `machinery/forklift-warehouse/reach-truck` (`CATALOG/MACHINE`) |
| `road-construction` | legacy-machine: “۰۱ ماشین‌آلات راهسازی و عمرانی” — `machinery/road-construction` (`CATALOG/MACHINE`)<br>v1.1: “۰۱.۰۱ ماشین‌آلات راهسازی و عمرانی” — `machinery/road-construction` (`CATALOG/MACHINE`) |
| `road-roller` | legacy-machine: “غلتک” — `machinery/road-construction/road-roller` (`CATALOG/MACHINE`)<br>v1.1: “غلتک” — `machinery/road-construction/road-roller` (`CATALOG/MACHINE`) |
| `rotary-drill` | legacy-machine: “Rotary Drill” — `machinery/drilling/rotary-drill` (`CATALOG/MACHINE`)<br>v1.1: “Rotary Drill” — `machinery/drilling-rigs/rotary-drill` (`CATALOG/MACHINE`) |
| `rough-terrain-forklift` | legacy-machine: “Rough Terrain” — `machinery/forklift-material/forklift/rough-terrain-forklift` (`CATALOG/MACHINE`)<br>v1.1: “لیفتراک آفرود” — `machinery/forklift-warehouse/forklift/rough-terrain-forklift` (`CATALOG/MACHINE`) |
| `scraper` | legacy-machine: “اسکریپر” — `machinery/road-construction/scraper` (`CATALOG/MACHINE`)<br>v1.1: “اسکریپر” — `machinery/road-construction/scraper` (`CATALOG/MACHINE`) |
| `screen` | legacy-machine: “سرند” — `machinery/crushing-processing/screen` (`CATALOG/MACHINE`)<br>v1.1: “سرند” — `machinery/crushing-screening/screen` (`CATALOG/MACHINE`) |
| `shotcrete-machine` | legacy-machine: “Shotcrete Machine” — `machinery/tunnel-underground/shotcrete-machine` (`CATALOG/MACHINE`)<br>v1.1: “شاتکریت” — `machinery/road-construction/concrete-machinery/shotcrete-machine` (`CATALOG/MACHINE`) |
| `shovel` | legacy-machine: “شاول” — `machinery/mining-machinery/shovel` (`CATALOG/MACHINE`)<br>v1.1: “شاول” — `machinery/mining-machinery/shovel` (`CATALOG/MACHINE`) |
| `side-loader-forklift` | legacy-machine: “Side Loader” — `machinery/forklift-material/forklift/side-loader-forklift` (`CATALOG/MACHINE`)<br>v1.1: “لیفتراک جانبی” — `machinery/forklift-warehouse/forklift/side-loader-forklift` (`CATALOG/MACHINE`) |
| `single-drum-roller` | legacy-machine: “تک‌درام” — `machinery/road-construction/road-roller/single-drum-roller` (`CATALOG/MACHINE`)<br>v1.1: “غلتک تک‌درام” — `machinery/road-construction/road-roller/single-drum-roller` (`CATALOG/MACHINE`) |
| `sized-iron-ore` | mineral: “سنگ آهن دانه‌بندی” — `mineral-root-unknown/sized-iron-ore/sized-iron-ore` (`CATALOG/MATERIAL`)<br>mineral: “سنگ آهن دانه‌بندی” — `mineral-root-unknown/sized-iron-ore` (`CATALOG/MATERIAL`) |
| `skid-steer-loader` | legacy-machine: “Skid Steer” — `machinery/road-construction/loader/skid-steer-loader` (`CATALOG/MACHINE`)<br>v1.1: “اسکید استیر” — `machinery/road-construction/loader/skid-steer-loader` (`CATALOG/MACHINE`) |
| `submersible-fuel-pump` | legacy-machine: “پمپ مستغرق سوخت” — `machinery/power-energy/fuel-station-equipment/submersible-fuel-pump` (`CATALOG/MACHINE`)<br>v1.1: “پمپ مستغرق سوخت” — `industrial-equipment/fuel-station-equipment/submersible-fuel-pump` (`CATALOG/MACHINE`) |
| `switchgears` | legacy-machine: “تابلوهای برق و سوئیچگیر” — `machinery/power-energy/switchgears` (`CATALOG/MACHINE`)<br>v1.1: “تابلوهای برق” — `industrial-equipment/switchgears` (`CATALOG/INDUSTRIAL_EQUIPMENT`) |
| `tank-monitoring-system` | legacy-machine: “پایش مخزن و تشخیص نشتی” — `machinery/power-energy/fuel-station-equipment/tank-monitoring-system` (`CATALOG/MACHINE`)<br>v1.1: “سامانه پایش مخزن و نشتی” — `industrial-equipment/fuel-station-equipment/tank-monitoring-system` (`CATALOG/MACHINE`) |
| `telehandler-loader` | legacy-machine: “تلسکوپی” — `machinery/road-construction/loader/telehandler-loader` (`CATALOG/MACHINE`)<br>v1.1: “لودر تلسکوپی” — `machinery/road-construction/loader/telehandler-loader` (`CATALOG/MACHINE`) |
| `tower-crane` | legacy-machine: “جرثقیل Tower” — `machinery/cranes-lifting/tower-crane` (`CATALOG/MACHINE`)<br>v1.1: “برجی” — `machinery/cranes-lifting/tower-crane` (`CATALOG/MACHINE`) |
| `track-loader` | legacy-machine: “زنجیری” — `machinery/road-construction/loader/track-loader` (`CATALOG/MACHINE`)<br>v1.1: “لودر زنجیری” — `machinery/road-construction/loader/track-loader` (`CATALOG/MACHINE`) |
| `transformers` | legacy-machine: “ترانسفورماتورها” — `machinery/power-energy/transformers` (`CATALOG/MACHINE`)<br>v1.1: “ترانسفورماتور” — `industrial-equipment/transformers` (`CATALOG/INDUSTRIAL_EQUIPMENT`) |
| `transit-mixer` | legacy-machine: “تراک میکسر” — `machinery/concrete-asphalt/transit-mixer` (`CATALOG/MACHINE`)<br>v1.1: “تراک میکسر” — `machinery/road-construction/concrete-machinery/transit-mixer` (`CATALOG/MACHINE`) |
| `truck-crane` | legacy-machine: “جرثقیل کامیونی” — `machinery/cranes-lifting/truck-crane` (`CATALOG/MACHINE`)<br>v1.1: “جرثقیل کامیونی” — `machinery/cranes-lifting/truck-crane` (`CATALOG/MACHINE`) |
| `underground-drill` | legacy-machine: “Underground Drill” — `machinery/drilling/underground-drill` (`CATALOG/MACHINE`)<br>v1.1: “حفاری زیرزمینی” — `machinery/drilling-rigs/underground-drill` (`CATALOG/MACHINE`) |
| `underground-machinery` | legacy-machine: “ماشین‌آلات زیرزمینی” — `machinery/mining-machinery/underground-machinery` (`CATALOG/MACHINE`)<br>v1.1: “ماشین‌آلات زیرزمینی” — `machinery/mining-machinery/underground-machinery` (`CATALOG/MACHINE`) |
| `vapour-recovery-equipment` | legacy-machine: “بازیابی بخارات سوخت” — `machinery/power-energy/fuel-station-equipment/vapour-recovery-equipment` (`CATALOG/MACHINE`)<br>v1.1: “بازیابی بخارات سوخت” — `industrial-equipment/fuel-station-equipment/vapour-recovery-equipment` (`CATALOG/MACHINE`) |
| `vibratory-roller` | legacy-machine: “ویبره” — `machinery/road-construction/road-roller/vibratory-roller` (`CATALOG/MACHINE`)<br>v1.1: “غلتک ارتعاشی” — `machinery/road-construction/road-roller/vibratory-roller` (`CATALOG/MACHINE`) |
| `wheel-loader` | legacy-machine: “چرخ لاستیکی” — `machinery/road-construction/loader/wheel-loader` (`CATALOG/MACHINE`)<br>v1.1: “لودر چرخ لاستیکی” — `machinery/road-construction/loader/wheel-loader` (`CATALOG/MACHINE`) |

## Primary-label conflicts

The following 50 slugs have more than one primary `name` value across source definitions. The full definitions and paths are in the table above.

| Slug | Source labels |
|---|---|
| `aerial-platform` | legacy-machine: “سکوی کار در ارتفاع”<br>v1.1: “سکوی بلندبر” |
| `all-terrain-crane` | legacy-machine: “جرثقیل All Terrain”<br>v1.1: “جرثقیل تمام‌زمین” |
| `asphalt-finisher` | legacy-machine: “آسفالت فینیشر”<br>v1.1: “فینیشر آسفالت” |
| `blast-hole-drill` | legacy-machine: “Blast Hole Drill”<br>v1.1: “حفاری چال انفجاری” |
| `compact-track-loader` | legacy-machine: “Compact Track”<br>v1.1: “کامپکت ترک لودر” |
| `cone-crusher` | legacy-machine: “سنگ‌شکن مخروطی”<br>v1.1: “مخروطی” |
| `container-forklift` | legacy-machine: “Container”<br>v1.1: “لیفتراک کانتینری” |
| `core-drill` | legacy-machine: “Core Drill”<br>v1.1: “مغزه‌گیر” |
| `cranes-lifting` | legacy-machine: “۰۶ جرثقیل، بالابر و لیفتینگ”<br>v1.1: “۰۱.۰۵ جرثقیل و بالابر” |
| `cutting-equipment` | legacy-machine: “تجهیزات برش صنعتی”<br>v1.1: “تجهیزات برش” |
| `diesel-forklift` | legacy-machine: “Diesel”<br>v1.1: “لیفتراک دیزلی” |
| `double-drum-roller` | legacy-machine: “دو‌درام”<br>v1.1: “غلتک دو‌درام” |
| `electric-forklift` | legacy-machine: “Electric”<br>v1.1: “لیفتراک برقی” |
| `gantry-crane` | legacy-machine: “جرثقیل دروازه‌ای”<br>v1.1: “گانتری کرین” |
| `gasoline-forklift` | legacy-machine: “Gasoline”<br>v1.1: “لیفتراک بنزینی” |
| `geotechnical-drill` | legacy-machine: “Geotechnical Drill”<br>v1.1: “حفاری ژئوتکنیک” |
| `heavy-duty-forklift` | legacy-machine: “Heavy Duty”<br>v1.1: “لیفتراک سنگین” |
| `heavy-haulage` | legacy-machine: “ماشین حمل فوق‌سنگین”<br>v1.1: “حمل سنگین” |
| `hvac-equipment` | legacy-machine: “تجهیزات تهویه مطبوع”<br>v1.1: “تجهیزات تهویه” |
| `impact-crusher` | legacy-machine: “سنگ‌شکن ضربه‌ای”<br>v1.1: “ضربه‌ای” |
| `jaw-crusher` | legacy-machine: “سنگ‌شکن فکی”<br>v1.1: “فکی” |
| `jumbo-drill` | legacy-machine: “Jumbo Drill”<br>v1.1: “جامبو حفاری تونل” |
| `lpg-forklift` | legacy-machine: “LPG”<br>v1.1: “لیفتراک LPG” |
| `mining-loader` | legacy-machine: “معدنی”<br>v1.1: “لودر معدنی” |
| `mining-machinery` | legacy-machine: “۰۲ ماشین‌آلات معدنی”<br>v1.1: “۰۱.۰۲ ماشین‌آلات معدنی” |
| `mobile-crane` | legacy-machine: “جرثقیل موبایل”<br>v1.1: “متحرک” |
| `oil-gas-drilling` | legacy-machine: “Oil & Gas Drilling”<br>v1.1: “حفاری نفت و گاز” |
| `other-mining` | legacy-machine: “سایر ماشین‌آلات معدنی”<br>v1.1: “سایر” |
| `overhead-crane` | legacy-machine: “جرثقیل سقفی”<br>v1.1: “سقفی” |
| `pallet-truck` | legacy-machine: “Pallet Truck”<br>v1.1: “پالت‌تراک” |
| `pneumatic-roller` | legacy-machine: “پنوماتیک”<br>v1.1: “غلتک پنوماتیک” |
| `production-line` | legacy-machine: “ماشین‌آلات خطوط تولید”<br>v1.1: “خط تولید” |
| `rc-drill` | legacy-machine: “RC Drill”<br>v1.1: “حفاری RC” |
| `reach-stacker` | legacy-machine: “Reach Stacker”<br>v1.1: “ریچ استاکر” |
| `reach-truck` | legacy-machine: “Reach Truck”<br>v1.1: “ریچ‌تراک” |
| `road-construction` | legacy-machine: “۰۱ ماشین‌آلات راهسازی و عمرانی”<br>v1.1: “۰۱.۰۱ ماشین‌آلات راهسازی و عمرانی” |
| `rough-terrain-forklift` | legacy-machine: “Rough Terrain”<br>v1.1: “لیفتراک آفرود” |
| `shotcrete-machine` | legacy-machine: “Shotcrete Machine”<br>v1.1: “شاتکریت” |
| `side-loader-forklift` | legacy-machine: “Side Loader”<br>v1.1: “لیفتراک جانبی” |
| `single-drum-roller` | legacy-machine: “تک‌درام”<br>v1.1: “غلتک تک‌درام” |
| `skid-steer-loader` | legacy-machine: “Skid Steer”<br>v1.1: “اسکید استیر” |
| `switchgears` | legacy-machine: “تابلوهای برق و سوئیچگیر”<br>v1.1: “تابلوهای برق” |
| `tank-monitoring-system` | legacy-machine: “پایش مخزن و تشخیص نشتی”<br>v1.1: “سامانه پایش مخزن و نشتی” |
| `telehandler-loader` | legacy-machine: “تلسکوپی”<br>v1.1: “لودر تلسکوپی” |
| `tower-crane` | legacy-machine: “جرثقیل Tower”<br>v1.1: “برجی” |
| `track-loader` | legacy-machine: “زنجیری”<br>v1.1: “لودر زنجیری” |
| `transformers` | legacy-machine: “ترانسفورماتورها”<br>v1.1: “ترانسفورماتور” |
| `underground-drill` | legacy-machine: “Underground Drill”<br>v1.1: “حفاری زیرزمینی” |
| `vibratory-roller` | legacy-machine: “ویبره”<br>v1.1: “غلتک ارتعاشی” |
| `wheel-loader` | legacy-machine: “چرخ لاستیکی”<br>v1.1: “لودر چرخ لاستیکی” |

## Interpretation and gate

- Same-slug records can disagree in label, parent path, layer, or domain; these are separate identity dimensions and must be reviewed together.
- A repeated slug is not automatically a defect: some entries are semantically equivalent while others represent hierarchy moves or category identity changes.
- The legacy machine source is relative to the existing `machinery` root; the V1.1 source includes that root explicitly. Paths above normalize this difference before comparing.
- The `heavy-haulage` source collision is especially material: the legacy source treats it as a `CATALOG/MACHINE` category while V1.1 places it under `SERVICE/TRANSPORT`.
- No labels or taxonomy nodes have been adjudicated by this inventory. Owner/canonical-reference review is still required.
- Do not run either taxonomy seed, attribute seed, or catalog seed until the canonical source decision, live Preview Worker↔database identity proof, exact-SHA paired encrypted backup, and explicit apply approval are complete.

## Extraction caveat

This is a deterministic source-literal inventory, not a live database export and not a proof of deployed Preview state. It counts source records in the named trees only; it does not infer category rows from historical snapshots, migrations, comments, or unrelated scripts.
