import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type AttributeSpec = {
  key: string; name: string; nameEn: string; type: string; unit?: string;
  required?: boolean; filterable?: boolean; searchable?: boolean; sortable?: boolean;
  options?: Array<{ value: string; label: string }>;
};

const shared: AttributeSpec[] = [
  { key: "device-engine-power", name: "قدرت موتور", nameEn: "Engine Power", type: "DECIMAL", unit: "اسب بخار", filterable: true, sortable: true },
  { key: "device-operating-weight", name: "وزن عملیاتی", nameEn: "Operating Weight", type: "DECIMAL", unit: "تن", filterable: true, sortable: true },
  { key: "device-serial-number", name: "شماره سریال / شاسی", nameEn: "Serial / PIN", type: "TEXT", searchable: true },
  { key: "device-fuel-type", name: "نوع سوخت", nameEn: "Fuel Type", type: "SELECT", filterable: true, options: [
    { value: "diesel", label: "دیزل" }, { value: "gasoline", label: "بنزین" },
    { value: "electric", label: "برقی" }, { value: "hybrid", label: "هیبرید" }, { value: "lpg", label: "گاز" },
  ] },
];

const n = (key: string, name: string, nameEn: string, unit?: string, filterable = true): AttributeSpec =>
  ({ key, name, nameEn, type: "DECIMAL", unit, filterable, sortable: filterable });
const s = (key: string, name: string, nameEn: string, options?: string[]): AttributeSpec =>
  ({ key, name, nameEn, type: options?.length ? "SELECT" : "TEXT", filterable: !!options,
     options: options?.map((value) => ({ value, label: value })) });

const deviceCatalog: Record<string, AttributeSpec[]> = {
  "Excavator": [
    n("excavator-bucket-capacity", "ظرفیت باکت", "Bucket Capacity", "متر مکعب"),
    n("excavator-digging-depth", "حداکثر عمق حفاری", "Maximum Digging Depth", "متر"),
    n("excavator-reach", "حداکثر دسترسی", "Maximum Reach", "متر"),
    n("excavator-arm-length", "طول بازو", "Arm Length", "متر"),
    s("excavator-undercarriage", "نوع زیربندی", "Undercarriage", ["زنجیری", "چرخ لاستیکی"]),
  ],
  "Mining Excavator": [
    n("mining-excavator-bucket", "ظرفیت باکت معدنی", "Mining Bucket Capacity", "متر مکعب"),
    n("mining-excavator-digging-depth", "عمق حفاری", "Digging Depth", "متر"),
    s("mining-excavator-undercarriage", "نوع زیربندی", "Undercarriage", ["زنجیری", "چرخ لاستیکی"]),
  ],
  "Wheel Loader": [
    n("loader-bucket-capacity", "ظرفیت باکت", "Bucket Capacity", "متر مکعب"),
    n("loader-dump-clearance", "ارتفاع تخلیه", "Dump Clearance", "متر"),
    n("loader-breakout-force", "نیروی شکست", "Breakout Force", "کیلو نیوتن"),
    s("loader-axle", "نوع محور", "Axle Type", ["صلب", "مفصلی"]),
  ],
  "Skid Steer Loader": [
    n("skid-steer-rated-operating-capacity", "ظرفیت عملیاتی مجاز", "Rated Operating Capacity", "کیلوگرم"),
    n("skid-steer-tipping-load", "بار واژگونی", "Tipping Load", "کیلوگرم"),
    n("skid-steer-hydraulic-flow", "دبی هیدرولیک", "Hydraulic Flow", "لیتر بر دقیقه"),
  ],
  "Compactor": [
    n("compactor-drum-width", "عرض درام", "Drum Width", "میلی‌متر"),
    n("compactor-vibration-frequency", "فرکانس ارتعاش", "Vibration Frequency", "هرتز"),
    n("compactor-amplitude", "دامنه ارتعاش", "Vibration Amplitude", "میلی‌متر"),
  ],
  "Telehandler": [
    n("telehandler-lift-capacity", "ظرفیت بالابری", "Lift Capacity", "تن"),
    n("telehandler-lift-height", "حداکثر ارتفاع بالابری", "Maximum Lift Height", "متر"),
    n("telehandler-forward-reach", "دسترسی افقی", "Forward Reach", "متر"),
  ],
  "Backhoe Loader": [
    n("backhoe-digging-depth", "عمق حفاری بکهو", "Backhoe Digging Depth", "متر"),
    n("backhoe-loader-bucket", "ظرفیت باکت جلو", "Front Loader Bucket", "متر مکعب"),
    n("backhoe-excavator-bucket", "ظرفیت باکت عقب", "Rear Excavator Bucket", "متر مکعب"),
  ],
  "Bulldozer": [
    n("dozer-blade-width", "عرض تیغه", "Blade Width", "متر"),
    s("dozer-blade-type", "نوع تیغه", "Blade Type", ["Straight", "U-Blade", "Semi-U", "Angle"]),
    s("dozer-ripper", "ریپر", "Ripper", ["ندارد", "تک‌شاخه", "چندشاخه"]),
    n("dozer-ground-pressure", "فشار بر زمین", "Ground Pressure", "کیلوپاسکال"),
  ],
  "Motor Grader": [
    n("grader-moldboard-width", "عرض تیغه وسط", "Moldboard Width", "متر"),
    n("grader-articulation-angle", "زاویه مفصل", "Articulation Angle", "درجه"),
    n("grader-front-blade-width", "عرض تیغه جلو", "Front Blade Width", "متر"),
  ],
  "Crane": [
    n("crane-max-lift-capacity", "حداکثر ظرفیت بالابری", "Maximum Lift Capacity", "تن"),
    n("crane-boom-length", "حداکثر طول بوم", "Maximum Boom Length", "متر"),
    n("crane-lifting-height", "حداکثر ارتفاع بالابری", "Maximum Lifting Height", "متر"),
    s("crane-type", "نوع جرثقیل", "Crane Type", ["موبایل", "برجی", "دروازه‌ای", "زنجیری", "کامیونی"]),
  ],
  "Forklift": [
    n("forklift-lift-capacity", "ظرفیت باربرداری", "Rated Lift Capacity", "تن"),
    n("forklift-lift-height", "حداکثر ارتفاع بالابری", "Maximum Lift Height", "متر"),
    n("forklift-free-lift", "ارتفاع آزاد", "Free Lift", "متر"),
    s("forklift-mast-type", "نوع دکل", "Mast Type", ["دو مرحله‌ای", "سه مرحله‌ای", "چهار مرحله‌ای"]),
  ],
  "Reach Truck": [
    n("reach-truck-lift-capacity", "ظرفیت باربرداری", "Rated Capacity", "تن"),
    n("reach-truck-lift-height", "ارتفاع بالابری", "Lift Height", "متر"),
    n("reach-truck-aisle-width", "عرض راهرو کاری", "Aisle Width", "میلی‌متر"),
  ],
  "Stackers": [
    n("stacker-lift-capacity", "ظرفیت باربرداری", "Rated Capacity", "کیلوگرم"),
    n("stacker-lift-height", "ارتفاع بالابری", "Lift Height", "متر"),
    s("stacker-drive", "نوع حرکت", "Drive Type", ["دستی", "نیمه‌برقی", "تمام‌برقی"]),
  ],
  "Mining Dump Truck": [
    n("mining-truck-payload", "ظرفیت بار مفید", "Payload Capacity", "تن"),
    n("mining-truck-body-volume", "حجم اتاق بار", "Body Volume", "متر مکعب"),
    n("mining-truck-max-speed", "حداکثر سرعت", "Maximum Speed", "کیلومتر بر ساعت"),
    s("mining-truck-drive", "آرایش انتقال قدرت", "Drive Configuration", ["4x2", "4x4", "6x4", "6x6", "8x4", "8x8"]),
  ],
  "Rigid Dump Truck": [
    n("rigid-truck-payload", "ظرفیت بار مفید", "Payload Capacity", "تن"),
    n("rigid-truck-body-volume", "حجم اتاق بار", "Body Volume", "متر مکعب"),
    n("rigid-truck-tire-diameter", "قطر تایر", "Tire Diameter", "اینچ"),
  ],
  "Articulated Dump Truck": [
    n("adt-payload", "ظرفیت بار مفید", "Payload Capacity", "تن"),
    n("adt-body-volume", "حجم اتاق بار", "Body Volume", "متر مکعب"),
    s("adt-traction", "سیستم کشش", "Traction", ["شش چرخ محرک", "تمام چرخ محرک"]),
  ],
  "Drilling Machine": [
    n("drill-depth-capacity", "عمق حفاری", "Drilling Depth", "متر"),
    n("drill-hole-diameter", "قطر گمانه", "Hole Diameter", "میلی‌متر"),
    n("drill-air-flow", "دبی هوای کمپرسور", "Compressor Air Flow", "متر مکعب بر دقیقه"),
    s("drill-method", "روش حفاری", "Drilling Method", ["DTH", "Rotary", "Top Hammer", "Core"]),
  ],
  "Crusher": [
    s("crusher-type", "نوع سنگ‌شکن", "Crusher Type", ["فکی", "مخروطی", "ضربه‌ای", "چکشی", "ژیراتوری"]),
    n("crusher-capacity", "ظرفیت تولید", "Throughput Capacity", "تن بر ساعت"),
    n("crusher-feed-opening", "دهانه ورودی", "Feed Opening", "میلی‌متر"),
    n("crusher-output-size", "اندازه محصول خروجی", "Output Size", "میلی‌متر"),
  ],
  "Screening Machine": [
    n("screening-capacity", "ظرفیت دانه‌بندی", "Screening Capacity", "تن بر ساعت"),
    n("screening-decks", "تعداد طبقات سرند", "Number of Decks"),
    n("screening-area", "سطح سرند", "Screening Area", "متر مربع"),
    s("screening-motion", "نوع حرکت", "Screen Motion", ["لرزشی", "دوار", "خطی"]),
  ],
  "Asphalt Paver": [
    n("paver-paving-width", "عرض پخش", "Paving Width", "متر"),
    n("paver-paving-thickness", "ضخامت پخش", "Paving Thickness", "میلی‌متر"),
    n("paver-capacity", "ظرفیت پخش", "Paving Capacity", "تن بر ساعت"),
  ],
  "Asphalt Plant": [
    n("asphalt-plant-capacity", "ظرفیت تولید آسفالت", "Plant Capacity", "تن بر ساعت"),
    n("asphalt-plant-mixer", "ظرفیت میکسر", "Mixer Capacity", "کیلوگرم"),
    s("asphalt-plant-type", "نوع کارخانه", "Plant Type", ["ثابت", "سیار", "درام میکس"]),
  ],
  "Road Roller": [
    n("road-roller-drum-width", "عرض درام", "Drum Width", "متر"),
    n("road-roller-operating-weight", "وزن عملیاتی", "Operating Weight", "تن"),
    n("road-roller-vibration-frequency", "فرکانس ارتعاش", "Vibration Frequency", "هرتز"),
  ],
  "Stabilizer": [
    n("stabilizer-working-width", "عرض کاری", "Working Width", "متر"),
    n("stabilizer-working-depth", "عمق کاری", "Working Depth", "میلی‌متر"),
    n("stabilizer-mixing-capacity", "ظرفیت اختلاط", "Mixing Capacity", "تن بر ساعت"),
  ],
  "Cold Milling Machine": [
    n("milling-width", "عرض تراش", "Milling Width", "میلی‌متر"),
    n("milling-depth", "عمق تراش", "Milling Depth", "میلی‌متر"),
    n("milling-drum-speed", "سرعت درام", "Milling Drum Speed", "دور بر دقیقه"),
  ],
  "Batching Plant": [
    n("batching-plant-capacity", "ظرفیت تولید بتن", "Plant Capacity", "متر مکعب بر ساعت"),
    n("batching-aggregate-bins", "تعداد مخازن سنگدانه", "Aggregate Bins"),
    n("batching-mixer-volume", "حجم میکسر", "Mixer Volume", "لیتر"),
  ],
  "Concrete Mixer": [
    n("mixer-drum-volume", "حجم دیگ", "Drum Volume", "متر مکعب"),
    n("mixer-output-capacity", "ظرفیت تولید", "Output Capacity", "متر مکعب بر ساعت"),
  ],
  "Concrete Pump": [
    n("concrete-pump-output", "ظرفیت پمپاژ بتن", "Concrete Pump Output", "متر مکعب بر ساعت"),
    n("concrete-pump-pressure", "فشار پمپاژ", "Pumping Pressure", "بار"),
    n("concrete-pump-boom", "طول بوم", "Boom Length", "متر"),
  ],
  "Generators": [
    n("generator-prime-power", "توان دائم", "Prime Power", "kVA"),
    n("generator-standby-power", "توان اضطراری", "Standby Power", "kVA"),
    n("generator-voltage", "ولتاژ خروجی", "Output Voltage", "ولت"),
    n("generator-frequency", "فرکانس", "Frequency", "هرتز"),
    s("generator-phase", "تعداد فاز", "Phase", ["تک‌فاز", "سه‌فاز"]),
  ],
  "Compressors": [
    n("compressor-air-flow", "دبی هوای خروجی", "Air Flow", "لیتر بر ثانیه"),
    n("compressor-working-pressure", "فشار کاری", "Working Pressure", "بار"),
    s("compressor-type", "نوع کمپرسور", "Compressor Type", ["اسکرو", "پیستونی", "سانتریفیوژ"]),
  ],
  "Pumps": [
    n("pump-flow-rate", "دبی پمپ", "Flow Rate", "متر مکعب بر ساعت"),
    n("pump-total-head", "هد کل", "Total Head", "متر"),
    n("pump-inlet-diameter", "قطر ورودی", "Inlet Diameter", "اینچ"),
    n("pump-outlet-diameter", "قطر خروجی", "Outlet Diameter", "اینچ"),
    s("pump-type", "نوع پمپ", "Pump Type", ["گریز از مرکز", "دنده‌ای", "پیستونی", "شناور", "دیافراگمی"]),
  ],
  "Tractor": [
    n("tractor-pto-power", "توان محور PTO", "PTO Power", "اسب بخار"),
    n("tractor-hydraulic-flow", "دبی هیدرولیک", "Hydraulic Flow", "لیتر بر دقیقه"),
    s("tractor-drive", "سیستم محرک", "Drive Type", ["دوچرخ محرک", "چهارچرخ محرک"]),
    s("tractor-hitch", "رده اتصال سه‌نقطه", "Hitch Category", ["I", "II", "III", "IV"]),
  ],
  "Combine Harvester": [
    n("combine-header-width", "عرض هد", "Header Width", "متر"),
    n("combine-grain-tank", "ظرفیت مخزن غله", "Grain Tank Capacity", "لیتر"),
    s("combine-threshing", "سیستم کوبنده", "Threshing System", ["کاه‌کوب", "روتاری", "ترکیبی"]),
  ],
};

async function ensureAttribute(spec: AttributeSpec) {
  const definition = await db.attributeDefinition.upsert({
    where: { key: spec.key },
    create: {
      key: spec.key, name: spec.name, nameEn: spec.nameEn, type: spec.type,
      unit: spec.unit ?? null, filterable: spec.filterable ?? false,
      searchable: spec.searchable ?? false, sortable: spec.sortable ?? false,
      required: false, visibleOnCard: false, visibleOnDetail: true,
    },
    update: {
      name: spec.name, nameEn: spec.nameEn, type: spec.type, unit: spec.unit ?? null,
      filterable: spec.filterable ?? false, searchable: spec.searchable ?? false,
      sortable: spec.sortable ?? false, visibleOnDetail: true,
    },
  });
  for (let i = 0; i < (spec.options ?? []).length; i++) {
    const option = spec.options![i];
    const existing = await db.attributeOption.findFirst({
      where: { attributeId: definition.id, value: option.value },
      select: { id: true },
    });
    if (existing) {
      await db.attributeOption.update({
        where: { id: existing.id }, data: { label: option.label, sortOrder: i },
      });
    } else {
      await db.attributeOption.create({
        data: { attributeId: definition.id, value: option.value, label: option.label, sortOrder: i },
      });
    }
  }
  return definition;
}

// Canonical slugs from the active taxonomy take precedence over legacy nameEn
// matching. Several current MACHINE categories are created by seed-machine-taxonomy
// with Persian names and stable slugs (without a nameEn field).
const DEVICE_CATEGORY_SLUGS: Record<string, string[]> = {
  Excavator: ["excavator"],
  "Mining Excavator": ["mining-excavator-machine", "excavator-mining"],
  "Wheel Loader": ["wheel-loader", "loader"],
  "Skid Steer Loader": ["skid-steer-loader", "compact-loader"],
  Compactor: ["soil-roller"],
  Telehandler: ["telehandler", "telehandler-loader"],
  "Backhoe Loader": ["backhoe-loader"],
  Bulldozer: ["bulldozer"],
  "Motor Grader": ["motor-grader", "grader"],
  Crane: ["mobile-crane"],
  Forklift: ["forklift"],
  "Reach Truck": ["reach-truck"],
  Stackers: ["stackers"],
  "Mining Dump Truck": ["mining-dump-truck"],
  "Rigid Dump Truck": ["rigid-mining-truck", "mining-dump-truck"],
  "Articulated Dump Truck": ["articulated-mining-truck", "mining-dump-truck"],
  "Drilling Machine": ["drill-rig", "drilling"],
  // Generic crusher fields are shared across every crusher subtype, not just jaw crushers.
  Crusher: [],
  "Screening Machine": ["screen"],
  "Asphalt Paver": ["asphalt-finisher", "track-paver"],
  "Asphalt Plant": ["asphalt-plant", "asphalt-machinery"],
  "Road Roller": ["road-roller"],
  // Stabilizer and Cold Milling Machine intentionally use exact nameEn fallback;
  // their broad road-construction parents must not receive device-specific fields.
  "Batching Plant": ["batching-plant"],
  "Concrete Mixer": ["concrete-mixer", "transit-mixer"],
  "Concrete Pump": ["concrete-pump"],
  Generators: ["generators"],
  Compressors: ["compressors"],
  Pumps: ["pumps"],
  Tractor: ["tractor"],
  "Combine Harvester": ["combine-harvester"],
};

// Device families that intentionally share fields across multiple leaf categories.
// Keeping these links on leaves avoids exposing crusher-only fields on screens,
// conveyors, feeders, or other equipment in the broader crushing-processing group.
const DEVICE_CATEGORY_GROUP_SLUGS: Record<string, string[]> = {
  Crusher: [
    "jaw-crusher",
    "cone-crusher",
    "impact-crusher",
    "cubiti-crusher",
    "hammer-crusher",
    "gyratory-crusher",
    "roll-crusher",
  ],
};

const DEVICE_DOMAINS: Record<string, string> = {
  Generators: "INDUSTRIAL_EQUIPMENT", Compressors: "INDUSTRIAL_EQUIPMENT", Pumps: "INDUSTRIAL_EQUIPMENT",
  Tractor: "AGRICULTURE", "Combine Harvester": "AGRICULTURE",
};

async function main() {
  let linked = 0;
  const deviceNames = Object.keys(deviceCatalog);
  for (const [deviceNameEn, specific] of Object.entries(deviceCatalog)) {
    const domain = DEVICE_DOMAINS[deviceNameEn] ?? "MACHINE";
    // Most device forms attach to a level-2/3 leaf. Multi-leaf families
    // (such as generic crushers) receive the same definitions on each matching leaf.
    const categories: { id: string; name: string; nameEn: string | null }[] = [];
    const groupedSlugs = DEVICE_CATEGORY_GROUP_SLUGS[deviceNameEn];
    if (groupedSlugs) {
      for (const slug of groupedSlugs) {
        const match = await db.category.findFirst({
          where: { slug, domain, layer: "CATALOG", active: true },
          select: { id: true, name: true, nameEn: true },
        });
        if (match && !categories.some((item) => item.id === match.id)) categories.push(match);
      }
    } else {
      let category: { id: string; name: string; nameEn: string | null } | null = null;
      for (const slug of DEVICE_CATEGORY_SLUGS[deviceNameEn] ?? []) {
        category = await db.category.findFirst({
          where: { slug, domain, layer: "CATALOG", active: true },
          select: { id: true, name: true, nameEn: true },
        });
        if (category) break;
      }
      // Compatibility fallback for older active taxonomy rows that still carry nameEn.
      if (!category) {
        category = await db.category.findFirst({
          where: { domain, layer: "CATALOG", active: true, level: 2, nameEn: deviceNameEn },
          select: { id: true, name: true, nameEn: true },
        });
      }
      if (!category) {
        category = await db.category.findFirst({
          where: { domain, layer: "CATALOG", active: true, level: 3, nameEn: deviceNameEn },
          select: { id: true, name: true, nameEn: true },
        });
      }
      if (!category) {
        category = await db.category.findFirst({
          where: { domain, layer: "CATALOG", active: true, level: 1, nameEn: deviceNameEn },
          select: { id: true, name: true, nameEn: true },
        });
      }
      if (category) categories.push(category);
    }
    if (categories.length === 0) {
      console.warn(`[device-attributes] category not found; skipped: ${deviceNameEn}`);
      continue;
    }
    const specs = [...shared, ...specific];
    const definitions = await Promise.all(specs.map((spec) => ensureAttribute(spec)));
    for (const category of categories) {
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        const definition = definitions[i];
        await db.categoryAttribute.upsert({
          where: { categoryId_attributeId: { categoryId: category.id, attributeId: definition.id } },
          create: {
            categoryId: category.id, attributeId: definition.id,
            required: spec.required ?? false, filterable: spec.filterable ?? false,
            searchable: spec.searchable ?? false, sortable: spec.sortable ?? false,
            displayOrder: i,
          },
          update: {
            required: spec.required ?? false, filterable: spec.filterable ?? false,
            searchable: spec.searchable ?? false, sortable: spec.sortable ?? false,
            displayOrder: i,
          },
        });
        linked++;
      }
      console.log(`[device-attributes] ${category.name} — ${specs.length} fields`);
    }
  }
  console.log(`[device-attributes] complete: ${deviceNames.length} device definitions, ${linked} category links`);
}

main().catch((error) => {
  console.error("[device-attributes] seed failed:", error);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
