/**
 * HEAVIX — exact leaf-category technical forms.
 *
 * This seed is deliberately separate from the legacy broad catalog seed:
 * each template maps to ONE exact category slug. It is additive/idempotent.
 * Run only after confirming the target database is the intended Preview DB:
 *   bunx tsx prisma/seed-category-specific-attributes.ts
 *
 * It does not create categories, run migrations, or alter Production.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const RETIRED_MACHINE_TEMPLATE_SLUGS = new Set([
  "wheel-crane", "chain-crane", "dth", "top-hammer", "water-well-drilling",
  "long-reach", "mining-excavator", "drill", "other-drilling", "other-crane",
  "stacker", "telehandler-loader", "other-forklift", "complete-line",
  "recycling-line", "sorter", "harvester", "forwarder", "forestry",
  "other-forestry-machinery", "special-machinery", "other-industrial-machinery",
  "other-port-machinery", "mining-equipment", "other-road-construction",
  "other-conveying", "other-recycling", "other-industrial-equipment",
  "other-special-machinery", "welding-equipment", "other-machinery",
]);


type AttrType =
  | "TEXT" | "LONG_TEXT" | "INTEGER" | "DECIMAL" | "BOOLEAN"
  | "SELECT" | "MULTI_SELECT" | "RANGE" | "YEAR" | "DATE"
  | "DATETIME" | "CURRENCY" | "UNIT" | "URL" | "PHONE"
  | "COLOR" | "SIZE" | "WEIGHT" | "REFERENCE" | "LOCATION"
  | "FILE" | "IMAGE";

type Field = {
  key: string;
  fa: string;
  en: string;
  type: AttrType;
  unit?: string;
  required?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  sortable?: boolean;
  card?: boolean;
  options?: string[];
};

type Template = {
  slug: string;
  label: string;
  required?: string[];
  fields: Field[];
};

const f = (
  key: string, fa: string, en: string, type: AttrType,
  extra: Omit<Field, "key" | "fa" | "en" | "type"> = {},
): Field => ({ key, fa, en, type, ...extra });

const templates: Template[] = [
  // COMPACT LOADERS — not the same form as a full-size wheel loader.
  { slug: "skid-steer-loader", label: "Skid Steer Loader", required: ["rated_operating_capacity", "operating_weight"], fields: [
    f("rated_operating_capacity", "ظرفیت عملیاتی نامی", "Rated Operating Capacity", "DECIMAL", { unit: "KG", filterable: true, card: true }),
    f("tipping_load", "بار واژگونی", "Tipping Load", "DECIMAL", { unit: "KG", filterable: true }),
    f("lift_path", "مسیر بالابری بازو", "Lift Path", "SELECT", { options: ["شعاعی", "عمودی"] }),
    f("hydraulic_flow", "دبی هیدرولیک کمکی", "Auxiliary Hydraulic Flow", "DECIMAL", { unit: "LPM", filterable: true }),
    f("hydraulic_pressure", "فشار هیدرولیک کمکی", "Auxiliary Hydraulic Pressure", "DECIMAL", { unit: "BAR" }),
    f("attachment_mount", "استاندارد اتصال متعلقات", "Attachment Mount", "TEXT", { searchable: true }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("travel_speed", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "KMH" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW", filterable: true }),
    f("overall_width_mm", "عرض کلی", "Overall Width", "DECIMAL", { unit: "MM" }),
    f("overall_height_mm", "ارتفاع کلی", "Overall Height", "DECIMAL", { unit: "MM" }),
    f("cab_type", "نوع کابین", "Cab Type", "SELECT", { options: ["کابین بسته", "سایبان", "بدون کابین"] }),
  ]},
  { slug: "compact-track-loader", label: "Compact Track Loader", required: ["rated_operating_capacity", "ground_pressure"], fields: [
    f("rated_operating_capacity", "ظرفیت عملیاتی نامی", "Rated Operating Capacity", "DECIMAL", { unit: "KG", filterable: true, card: true }),
    f("tipping_load", "بار واژگونی", "Tipping Load", "DECIMAL", { unit: "KG" }),
    f("ground_pressure", "فشار وارد بر زمین", "Ground Pressure", "DECIMAL", { unit: "KPA" }),
    f("track_width", "عرض زنجیر", "Track Width", "DECIMAL", { unit: "MM" }),
    f("track_length_ground_mm", "طول تماس زنجیر با زمین", "Track on Ground Length", "DECIMAL", { unit: "MM" }),
    f("hydraulic_flow", "دبی هیدرولیک", "Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("hydraulic_pressure", "فشار هیدرولیک", "Hydraulic Pressure", "DECIMAL", { unit: "BAR" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "wheel-loader", label: "Wheel Loader", required: ["bucket_capacity", "rated_operating_capacity"], fields: [
    f("bucket_capacity", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3", filterable: true, card: true }),
    f("rated_operating_capacity", "ظرفیت عملیاتی نامی", "Rated Operating Capacity", "DECIMAL", { unit: "KG", filterable: true }),
    f("breakout_force", "نیروی کندن", "Breakout Force", "DECIMAL", { unit: "KN" }),
    f("dump_clearance", "ارتفاع تخلیه", "Dump Clearance", "DECIMAL", { unit: "M" }),
    f("dump_reach", "برد تخلیه", "Dump Reach", "DECIMAL", { unit: "M" }),
    f("wheelbase_mm", "فاصله محوری", "Wheelbase", "DECIMAL", { unit: "MM" }),
    f("turning_radius", "شعاع گردش", "Turning Radius", "DECIMAL", { unit: "M" }),
    f("tire_size", "سایز تایر", "Tire Size", "TEXT"),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true }),
  ]},
  { slug: "track-loader", label: "Track Loader", required: ["bucket_capacity", "track_width"], fields: [
    f("bucket_capacity", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3", filterable: true }),
    f("track_width", "عرض زنجیر", "Track Width", "DECIMAL", { unit: "MM" }),
    f("ground_pressure", "فشار بر زمین", "Ground Pressure", "DECIMAL", { unit: "KPA" }),
    f("drawbar_pull", "نیروی کشش", "Drawbar Pull", "DECIMAL", { unit: "KN" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "telehandler-loader", label: "Telehandler", required: ["rated_lifting_capacity_kg", "max_lift_height", "max_forward_reach"], fields: [
    f("rated_lifting_capacity_kg", "ظرفیت باربرداری", "Rated Lift Capacity", "DECIMAL", { unit: "KG", filterable: true, card: true }),
    f("max_lift_height", "حداکثر ارتفاع بالابری", "Maximum Lift Height", "DECIMAL", { unit: "M", filterable: true, card: true }),
    f("max_forward_reach", "حداکثر دسترسی افقی", "Maximum Forward Reach", "DECIMAL", { unit: "M", filterable: true }),
    f("capacity_at_max_reach", "ظرفیت در حداکثر دسترسی", "Capacity at Maximum Reach", "DECIMAL", { unit: "KG" }),
    f("boom_sections", "تعداد قطعات بوم", "Boom Sections", "INTEGER"),
    f("stabilizer_type", "نوع تثبیت‌کننده", "Stabilizer Type", "TEXT"),
    f("attachment_type", "نوع متعلقه", "Attachment Type", "MULTI_SELECT", { options: ["باکت", "شاخک", "گرپل", "اوگر", "بریکر", "پلتفرم", "ریپر", "تیغه"] }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
  ]},

  // CRANES — each engineering configuration gets its own field set.
  { slug: "tower-crane", label: "Tower Crane", required: ["max_load_capacity", "jib_length", "max_hook_height"], fields: [
    f("max_load_capacity", "حداکثر ظرفیت باربرداری", "Maximum Load Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("tip_load", "ظرفیت انتهای جیب", "Tip Load", "DECIMAL", { unit: "TON", filterable: true }),
    f("jib_length", "طول جیب", "Jib Length", "DECIMAL", { unit: "M", filterable: true }),
    f("max_hook_height", "حداکثر ارتفاع قلاب", "Maximum Hook Height", "DECIMAL", { unit: "M", filterable: true }),
    f("free_standing_height", "ارتفاع آزاد مستقل", "Free Standing Height", "DECIMAL", { unit: "M" }),
    f("mast_section_size", "ابعاد سکشن دکل", "Mast Section Size", "TEXT"),
    f("slewing_speed", "سرعت گردش", "Slewing Speed", "DECIMAL", { unit: "RPM" }),
    f("hoist_speed", "سرعت بالابری", "Hoist Speed", "DECIMAL", { unit: "M/MIN" }),
    f("trolley_speed", "سرعت حرکت کالسکه", "Trolley Speed", "DECIMAL", { unit: "M/MIN" }),
    f("counter_jib_length", "طول کنترجیب", "Counter Jib Length", "DECIMAL", { unit: "M" }),
    f("climbing_system", "سیستم خودافزا", "Climbing System", "BOOLEAN"),
    f("power_supply", "برق ورودی", "Power Supply", "TEXT"),
  ]},
  { slug: "mobile-crane", label: "Mobile Crane", required: ["max_load_capacity", "max_lift_height", "boom_length"], fields: [
    f("max_load_capacity", "حداکثر ظرفیت باربرداری", "Maximum Load Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("max_load_at_radius", "ظرفیت در شعاع مشخص", "Load at Working Radius", "DECIMAL", { unit: "TON" }),
    f("working_radius", "شعاع کاری", "Working Radius", "DECIMAL", { unit: "M", filterable: true }),
    f("boom_length", "طول بوم", "Boom Length", "DECIMAL", { unit: "M", filterable: true }),
    f("jib_length", "طول جیب", "Jib Length", "DECIMAL", { unit: "M" }),
    f("max_lift_height", "حداکثر ارتفاع بالابری", "Maximum Lift Height", "DECIMAL", { unit: "M", filterable: true }),
    f("counterweight", "وزنه تعادل", "Counterweight", "DECIMAL", { unit: "TON" }),
    f("outrigger_span", "فاصله بازشدگی جک‌ها", "Outrigger Span", "DECIMAL", { unit: "M" }),
    f("axle_count", "تعداد محور", "Axle Count", "INTEGER"),
    f("carrier_drive", "آرایش محرک شاسی", "Carrier Drive", "TEXT"),
    f("road_speed", "سرعت جاده‌ای", "Road Speed", "DECIMAL", { unit: "KMH" }),
    f("load_chart_available", "جدول بار سازنده موجود است", "Manufacturer Load Chart Available", "BOOLEAN"),
  ]},
  { slug: "crawler-crane", label: "Crawler Crane", required: ["max_load_capacity", "boom_length", "track_shoe_width"], fields: [
    f("max_load_capacity", "حداکثر ظرفیت باربرداری", "Maximum Load Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("boom_length", "طول بوم", "Boom Length", "DECIMAL", { unit: "M", filterable: true }),
    f("jib_length", "طول جیب", "Jib Length", "DECIMAL", { unit: "M" }),
    f("max_lift_height", "حداکثر ارتفاع قلاب", "Maximum Hook Height", "DECIMAL", { unit: "M" }),
    f("track_shoe_width", "عرض کفشک زنجیر", "Track Shoe Width", "DECIMAL", { unit: "MM" }),
    f("track_gauge", "فاصله مرکز زنجیرها", "Track Gauge", "DECIMAL", { unit: "M" }),
    f("track_length_ground", "طول تماس زنجیر با زمین", "Track Length on Ground", "DECIMAL", { unit: "M" }),
    f("ground_pressure", "فشار بر زمین", "Ground Pressure", "DECIMAL", { unit: "KPA" }),
    f("counterweight", "وزنه تعادل", "Counterweight", "DECIMAL", { unit: "TON" }),
    f("hoist_line_pull", "کشش سیم‌بکسل وینچ", "Hoist Line Pull", "DECIMAL", { unit: "KN" }),
    f("travel_speed", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "KMH" }),
    f("gradeability", "قابلیت عبور از شیب", "Gradeability", "DECIMAL", { unit: "%" }),
  ]},
  { slug: "truck-crane", label: "Truck-Mounted Crane", required: ["max_load_capacity", "boom_length", "axle_count"], fields: [
    f("max_load_capacity", "حداکثر ظرفیت باربرداری", "Maximum Load Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("boom_length", "طول بوم تلسکوپی", "Telescopic Boom Length", "DECIMAL", { unit: "M" }),
    f("jib_length", "طول جیب", "Jib Length", "DECIMAL", { unit: "M" }),
    f("max_lift_height", "حداکثر ارتفاع بالابری", "Maximum Lift Height", "DECIMAL", { unit: "M" }),
    f("axle_count", "تعداد محور کامیون", "Truck Axle Count", "INTEGER"),
    f("outrigger_span", "فاصله بازشدگی جک‌ها", "Outrigger Span", "DECIMAL", { unit: "M" }),
    f("road_speed", "سرعت جاده‌ای", "Road Speed", "DECIMAL", { unit: "KMH" }),
    f("counterweight", "وزنه تعادل", "Counterweight", "DECIMAL", { unit: "TON" }),
    f("load_chart_available", "جدول بار موجود", "Load Chart Available", "BOOLEAN"),
  ]},
  { slug: "wheel-crane", label: "Wheel / Rough Terrain Crane", required: ["max_load_capacity", "boom_length"], fields: [
    f("max_load_capacity", "حداکثر ظرفیت باربرداری", "Maximum Load Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("boom_length", "طول بوم", "Boom Length", "DECIMAL", { unit: "M" }),
    f("working_radius", "شعاع کاری", "Working Radius", "DECIMAL", { unit: "M" }),
    f("outrigger_span", "فاصله جک‌ها", "Outrigger Span", "DECIMAL", { unit: "M" }),
    f("axle_count", "تعداد محور", "Axle Count", "INTEGER"),
    f("all_wheel_steer", "فرمان‌پذیری تمام چرخ‌ها", "All-Wheel Steering", "BOOLEAN"),
    f("gradeability", "قابلیت عبور از شیب", "Gradeability", "DECIMAL", { unit: "%" }),
    f("travel_speed", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "KMH" }),
  ]},
  { slug: "chain-crane", label: "Chain / Crawler Crane", required: ["max_load_capacity", "track_shoe_width"], fields: [
    f("max_load_capacity", "حداکثر ظرفیت باربرداری", "Maximum Load Capacity", "DECIMAL", { unit: "TON", filterable: true }),
    f("boom_length", "طول بوم", "Boom Length", "DECIMAL", { unit: "M" }),
    f("track_shoe_width", "عرض کفشک زنجیر", "Track Shoe Width", "DECIMAL", { unit: "MM" }),
    f("ground_pressure", "فشار بر زمین", "Ground Pressure", "DECIMAL", { unit: "KPA" }),
    f("hoist_line_pull", "کشش وینچ", "Hoist Line Pull", "DECIMAL", { unit: "KN" }),
    f("counterweight", "وزنه تعادل", "Counterweight", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "overhead-crane", label: "Overhead Crane", required: ["lifting_capacity", "span", "lifting_height"], fields: [
    f("lifting_capacity", "ظرفیت بالابری", "Lifting Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("span", "دهانه پل", "Crane Span", "DECIMAL", { unit: "M", filterable: true }),
    f("lifting_height", "ارتفاع بالابری", "Lifting Height", "DECIMAL", { unit: "M" }),
    f("bridge_travel_speed", "سرعت حرکت پل", "Bridge Travel Speed", "DECIMAL", { unit: "M/MIN" }),
    f("trolley_travel_speed", "سرعت حرکت کالسکه", "Trolley Travel Speed", "DECIMAL", { unit: "M/MIN" }),
    f("hoist_speed", "سرعت بالابری", "Hoist Speed", "DECIMAL", { unit: "M/MIN" }),
    f("duty_class", "کلاس کاری", "Duty Classification", "TEXT"),
    f("girder_type", "نوع تیر اصلی", "Girder Type", "SELECT", { options: ["تک‌پل", "دوپل"] }),
    f("power_supply", "نوع تغذیه برق", "Power Supply", "TEXT"),
  ]},
  { slug: "gantry-crane", label: "Gantry Crane", required: ["lifting_capacity", "span", "lifting_height"], fields: [
    f("lifting_capacity", "ظرفیت بالابری", "Lifting Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("span", "دهانه", "Span", "DECIMAL", { unit: "M" }),
    f("lifting_height", "ارتفاع بالابری", "Lifting Height", "DECIMAL", { unit: "M" }),
    f("gantry_type", "نوع گنتری", "Gantry Type", "SELECT", { options: ["کامل", "نیمه‌گنتری", "لاستیکی RTG", "ریل‌پایه RMG"] }),
    f("rail_gauge", "فاصله ریل", "Rail Gauge", "DECIMAL", { unit: "M" }),
    f("hoist_speed", "سرعت بالابری", "Hoist Speed", "DECIMAL", { unit: "M/MIN" }),
    f("gantry_travel_speed", "سرعت حرکت گنتری", "Gantry Travel Speed", "DECIMAL", { unit: "M/MIN" }),
    f("duty_class", "کلاس کاری", "Duty Classification", "TEXT"),
  ]},

  // DRILLING — parameters are method-specific; configuration values stay optional.
  { slug: "rotary-drill", label: "Rotary Drilling Rig", required: ["drilling_diameter_min", "max_drilling_depth", "rotation_torque_knm"], fields: [
    f("drilling_diameter_min", "حداقل قطر حفاری", "Minimum Drilling Diameter", "DECIMAL", { unit: "MM" }),
    f("drilling_diameter_max", "حداکثر قطر حفاری", "Maximum Drilling Diameter", "DECIMAL", { unit: "MM", filterable: true, card: true }),
    f("max_drilling_depth", "حداکثر عمق حفاری", "Maximum Drilling Depth", "DECIMAL", { unit: "M", filterable: true }),
    f("rotation_torque_knm", "گشتاور سرحفار", "Rotary Torque", "DECIMAL", { unit: "KNM" }),
    f("rotation_speed", "سرعت چرخش", "Rotation Speed", "DECIMAL", { unit: "RPM" }),
    f("crowd_force", "نیروی پیشروی", "Crowd Force", "DECIMAL", { unit: "KN" }),
    f("crowd_pull", "نیروی بیرون‌کشی", "Crowd Pull", "DECIMAL", { unit: "KN" }),
    f("kelly_bar_type", "نوع کلی بار", "Kelly Bar Type", "TEXT"),
    f("kelly_bar_length", "طول کلی بار", "Kelly Bar Length", "DECIMAL", { unit: "M" }),
    f("mast_inclination", "زاویه انحراف دکل", "Mast Inclination", "DECIMAL", { unit: "DEG" }),
    f("undercarriage_type", "نوع شاسی", "Undercarriage Type", "SELECT", { options: ["زنجیری", "کامیونی", "ثابت"] }),
  ]},
  { slug: "dth", label: "DTH Drill Rig", required: ["hole_diameter_min", "hole_diameter_max", "drilling_depth"], fields: [
    f("hole_diameter_min", "حداقل قطر چال", "Minimum Hole Diameter", "DECIMAL", { unit: "MM" }),
    f("hole_diameter_max", "حداکثر قطر چال", "Maximum Hole Diameter", "DECIMAL", { unit: "MM", filterable: true, card: true }),
    f("drilling_depth", "عمق اقتصادی حفاری", "Economical Drilling Depth", "DECIMAL", { unit: "M", filterable: true }),
    f("air_pressure", "فشار هوای کاری", "Working Air Pressure", "DECIMAL", { unit: "BAR" }),
    f("air_flow", "دبی هوای موردنیاز", "Required Air Flow", "DECIMAL", { unit: "M3/MIN" }),
    f("hammer_diameter", "قطر چکش DTH", "DTH Hammer Diameter", "DECIMAL", { unit: "MM" }),
    f("drill_rod_diameter", "قطر راد", "Drill Rod Diameter", "DECIMAL", { unit: "MM" }),
    f("rod_handling", "سیستم تعویض راد", "Rod Handling System", "SELECT", { options: ["دستی", "نیمه‌خودکار", "خودکار"] }),
    f("dust_collection", "سیستم غبارگیر", "Dust Collection", "SELECT", { options: ["خشک", "تر", "بدون سیستم"] }),
    f("compressor_configuration", "پیکربندی کمپرسور", "Compressor Configuration", "SELECT", { options: ["یکپارچه", "جداگانه", "بدون کمپرسور"] }),
    f("engine_power_kw", "توان موتور", "Engine / Total Power", "DECIMAL", { unit: "KW" }),
    f("machine_weight_kg", "وزن دستگاه", "Machine Weight", "DECIMAL", { unit: "KG", filterable: true }),
    f("gradeability_deg", "زاویه شیب‌پذیری", "Gradeability Angle", "DECIMAL", { unit: "DEG" }),
  ]},
  { slug: "top-hammer", label: "Top Hammer Drill Rig", required: ["hole_diameter_min", "hole_diameter_max", "feed_length"], fields: [
    f("hole_diameter_min", "حداقل قطر حفاری", "Minimum Hole Diameter", "DECIMAL", { unit: "MM" }),
    f("hole_diameter_max", "حداکثر قطر حفاری", "Maximum Hole Diameter", "DECIMAL", { unit: "MM", filterable: true }),
    f("feed_length", "طول کورس فید", "Feed Length", "DECIMAL", { unit: "M" }),
    f("impact_frequency", "فرکانس ضربه", "Impact Frequency", "DECIMAL", { unit: "HZ" }),
    f("impact_power", "توان ضربه", "Impact Power", "DECIMAL", { unit: "KW" }),
    f("rotation_speed", "سرعت چرخش", "Rotation Speed", "DECIMAL", { unit: "RPM" }),
    f("rotation_torque", "گشتاور چرخش", "Rotation Torque", "DECIMAL", { unit: "NM" }),
    f("feed_force", "نیروی پیشروی", "Feed Force", "DECIMAL", { unit: "KN" }),
    f("drill_rod_diameter", "قطر راد", "Drill Rod Diameter", "DECIMAL", { unit: "MM" }),
    f("dust_collection", "سیستم غبارگیر", "Dust Collection", "SELECT", { options: ["خشک", "تر", "بدون سیستم"] }),
  ]},
  { slug: "water-well-drilling", label: "Water Well Drilling Rig", required: ["max_drilling_depth", "drilling_method"], fields: [
    f("max_drilling_depth", "حداکثر عمق حفاری", "Maximum Drilling Depth", "DECIMAL", { unit: "M", filterable: true }),
    f("drilling_method", "روش حفاری", "Drilling Method", "MULTI_SELECT", { options: ["چرخشی", "DTH", "گل‌گردشی", "هوای فشرده", "مغزه‌گیری"] }),
    f("hole_diameter", "قطر چاه", "Well Diameter", "DECIMAL", { unit: "MM" }),
    f("drill_pipe_diameter", "قطر لوله حفاری", "Drill Pipe Diameter", "DECIMAL", { unit: "MM" }),
    f("drill_pipe_length", "طول لوله حفاری", "Drill Pipe Length", "DECIMAL", { unit: "M" }),
    f("mud_pump_flow", "دبی پمپ گل", "Mud Pump Flow", "DECIMAL", { unit: "LPM" }),
    f("mud_pump_pressure", "فشار پمپ گل", "Mud Pump Pressure", "DECIMAL", { unit: "BAR" }),
    f("pull_up_capacity", "ظرفیت کشش بالابر", "Hoisting Capacity", "DECIMAL", { unit: "KN" }),
    f("power_source", "منبع نیرو", "Power Source", "SELECT", { options: ["دیزلی", "برقی", "PTO"] }),
    f("mounting_type", "نوع استقرار", "Mounting Type", "SELECT", { options: ["کامیونی", "زنجیری", "تریلری", "ثابت"] }),
  ]},
  { slug: "core-drill", label: "Core Drilling Rig", required: ["core_diameter", "max_drilling_depth"], fields: [
    f("core_diameter", "قطر مغزه", "Core Diameter", "DECIMAL", { unit: "MM", filterable: true }),
    f("max_drilling_depth", "حداکثر عمق حفاری", "Maximum Drilling Depth", "DECIMAL", { unit: "M", filterable: true }),
    f("rotation_speed", "محدوده دور سرحفار", "Rotation Speed Range", "TEXT"),
    f("rotation_torque", "گشتاور", "Rotation Torque", "DECIMAL", { unit: "NM" }),
    f("feed_force", "نیروی پیشروی", "Feed Force", "DECIMAL", { unit: "KN" }),
    f("wireline_system", "سیستم وایرلاین", "Wireline System", "BOOLEAN"),
    f("drill_rod_type", "نوع راد", "Drill Rod Type", "TEXT"),
    f("water_flow", "دبی آب شستشو", "Flushing Water Flow", "DECIMAL", { unit: "LPM" }),
  ]},
  { slug: "rc-drill", label: "Reverse Circulation Drill Rig", required: ["hole_diameter", "max_drilling_depth"], fields: [
    f("hole_diameter", "قطر حفاری", "Hole Diameter", "DECIMAL", { unit: "MM", filterable: true }),
    f("max_drilling_depth", "حداکثر عمق حفاری", "Maximum Drilling Depth", "DECIMAL", { unit: "M" }),
    f("sample_recovery_system", "سیستم بازیابی نمونه", "Sample Recovery System", "TEXT"),
    f("air_pressure", "فشار هوا", "Air Pressure", "DECIMAL", { unit: "BAR" }),
    f("air_flow", "دبی هوا", "Air Flow", "DECIMAL", { unit: "M3/MIN" }),
    f("cyclone_type", "نوع سیکلون", "Cyclone Type", "TEXT"),
    f("rod_diameter", "قطر راد", "Rod Diameter", "DECIMAL", { unit: "MM" }),
  ]},
  { slug: "geotechnical-drill", label: "Geotechnical Drill Rig", required: ["max_drilling_depth", "drilling_method"], fields: [
    f("max_drilling_depth", "حداکثر عمق حفاری", "Maximum Drilling Depth", "DECIMAL", { unit: "M" }),
    f("drilling_method", "روش حفاری", "Drilling Method", "MULTI_SELECT", { options: ["مغزه‌گیری", "اوگر", "چرخشی", "CPT", "SPT"] }),
    f("sampling_system", "سیستم نمونه‌برداری", "Sampling System", "TEXT"),
    f("spt_capability", "قابلیت آزمون SPT", "SPT Capability", "BOOLEAN"),
    f("cpt_capability", "قابلیت آزمون CPT", "CPT Capability", "BOOLEAN"),
    f("mast_angle_range", "محدوده زاویه دکل", "Mast Angle Range", "TEXT"),
  ]},
  { slug: "blast-hole-drill", label: "Blast Hole Drill Rig", required: ["hole_diameter", "drilling_depth"], fields: [
    f("hole_diameter", "قطر چال انفجاری", "Blast Hole Diameter", "DECIMAL", { unit: "MM", filterable: true }),
    f("drilling_depth", "عمق حفاری", "Drilling Depth", "DECIMAL", { unit: "M", filterable: true }),
    f("drilling_method", "روش حفاری", "Drilling Method", "SELECT", { options: ["DTH", "Top Hammer", "Rotary"] }),
    f("air_pressure", "فشار هوای کاری", "Working Air Pressure", "DECIMAL", { unit: "BAR" }),
    f("air_flow", "دبی هوا", "Air Flow", "DECIMAL", { unit: "M3/MIN" }),
    f("rod_diameter", "قطر راد", "Rod Diameter", "DECIMAL", { unit: "MM" }),
    f("dust_suppression", "سیستم کنترل گردوغبار", "Dust Suppression", "SELECT", { options: ["خشک", "تر", "هر دو"] }),
  ]},
  { slug: "underground-drill", label: "Underground Drill Rig", required: ["drilling_method", "hole_diameter"], fields: [
    f("drilling_method", "روش حفاری", "Drilling Method", "SELECT", { options: ["Face drilling", "Production drilling", "Longhole", "Bolting"] }),
    f("hole_diameter", "قطر حفاری", "Hole Diameter", "DECIMAL", { unit: "MM" }),
    f("boom_count", "تعداد بوم حفاری", "Boom Count", "INTEGER"),
    f("drilling_coverage", "سطح پوشش حفاری", "Drilling Coverage", "TEXT"),
    f("feed_length", "طول فید", "Feed Length", "DECIMAL", { unit: "M" }),
    f("minimum_tunnel_size", "حداقل ابعاد تونل", "Minimum Tunnel Size", "TEXT"),
    f("tramming_speed", "سرعت جابه‌جایی", "Tramming Speed", "DECIMAL", { unit: "KMH" }),
    f("power_source", "منبع نیرو", "Power Source", "SELECT", { options: ["دیزلی", "برقی", "باتری"] }),
  ]},
  { slug: "jumbo-drill", label: "Tunneling Jumbo Drill", required: ["boom_count", "drilling_coverage"], fields: [
    f("boom_count", "تعداد بوم", "Boom Count", "INTEGER"),
    f("drilling_coverage", "سطح پوشش حفاری", "Drilling Coverage", "TEXT"),
    f("feed_length", "طول فید", "Feed Length", "DECIMAL", { unit: "M" }),
    f("hole_diameter", "قطر سوراخ", "Hole Diameter", "DECIMAL", { unit: "MM" }),
    f("drill_steel_length", "طول استیل حفاری", "Drill Steel Length", "DECIMAL", { unit: "M" }),
    f("minimum_tunnel_width", "حداقل عرض تونل", "Minimum Tunnel Width", "DECIMAL", { unit: "M" }),
    f("minimum_tunnel_height", "حداقل ارتفاع تونل", "Minimum Tunnel Height", "DECIMAL", { unit: "M" }),
    f("percussion_power_kw", "توان ضربه‌ای دریل", "Percussion Power", "DECIMAL", { unit: "KW" }),
    f("percussion_pressure_bar", "فشار ضربه‌ای", "Percussion Pressure", "DECIMAL", { unit: "BAR" }),
    f("percussion_rate_hz", "فرکانس ضربه", "Percussion Rate", "DECIMAL", { unit: "HZ" }),
    f("rotation_speed_rpm", "سرعت دوران", "Rotation Speed", "DECIMAL", { unit: "RPM" }),
    f("rotation_torque_nm", "گشتاور دوران", "Rotation Torque", "DECIMAL", { unit: "NM" }),
    f("feed_force_kn", "نیروی پیشروی", "Feed Force", "DECIMAL", { unit: "KN" }),
    f("feed_extension_mm", "میزان امتداد فید", "Feed Extension", "DECIMAL", { unit: "MM" }),
    f("hole_size_range_mm", "محدوده قطر حفاری", "Hole Size Range", "TEXT"),
    f("operating_weight_ton", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("power_source", "منبع نیرو", "Power Source", "SELECT", { options: ["دیزلی", "برقی", "الکتروهیدرولیک"] }),
  ]},

  // MINING and MATERIAL PROCESSING.
  { slug: "mining-excavator-machine", label: "Mining Excavator", required: ["operating_weight", "bucket_capacity", "engine_power_kw"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("bucket_capacity", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3", filterable: true, card: true }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("max_digging_depth", "حداکثر عمق حفاری", "Maximum Digging Depth", "DECIMAL", { unit: "M" }),
    f("swing_torque", "گشتاور چرخش", "Swing Torque", "DECIMAL", { unit: "KNM" }),
    f("track_shoe_width", "عرض کفشک", "Track Shoe Width", "DECIMAL", { unit: "MM" }),
    f("ground_pressure", "فشار بر زمین", "Ground Pressure", "DECIMAL", { unit: "KPA" }),
    f("payload_capacity", "ظرفیت بارگیری", "Payload Capacity", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "mining-loader", label: "Mining Loader", required: ["bucket_capacity", "payload_capacity"], fields: [
    f("bucket_capacity", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3", filterable: true }),
    f("payload_capacity", "ظرفیت بارگیری", "Payload Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("dump_height", "ارتفاع تخلیه", "Dump Height", "DECIMAL", { unit: "M" }),
    f("turning_radius", "شعاع گردش", "Turning Radius", "DECIMAL", { unit: "M" }),
    f("ground_clearance_mm", "فاصله از زمین", "Ground Clearance", "DECIMAL", { unit: "MM" }),
  ]},
  { slug: "lhd", label: "Load Haul Dump (LHD)", required: ["bucket_capacity", "payload_capacity", "machine_width"], fields: [
    f("bucket_capacity", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3", filterable: true }),
    f("payload_capacity", "ظرفیت حمل", "Payload Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("machine_width", "عرض دستگاه", "Machine Width", "DECIMAL", { unit: "MM" }),
    f("machine_height", "ارتفاع دستگاه", "Machine Height", "DECIMAL", { unit: "MM" }),
    f("turning_radius", "شعاع گردش", "Turning Radius", "DECIMAL", { unit: "M" }),
    f("tramming_speed", "سرعت حرکت", "Tramming Speed", "DECIMAL", { unit: "KMH" }),
    f("power_source", "منبع نیرو", "Power Source", "SELECT", { options: ["دیزلی", "برقی کابلی", "باتری"] }),
    f("battery_capacity", "ظرفیت باتری", "Battery Capacity", "DECIMAL", { unit: "KWH" }),
  ]},
  { slug: "jaw-crusher", label: "Jaw Crusher", required: ["feed_opening", "capacity"], fields: [
    f("feed_opening", "ابعاد دهانه ورودی", "Feed Opening", "TEXT", { filterable: true }),
    f("capacity", "ظرفیت تولید", "Capacity", "DECIMAL", { unit: "T/H", filterable: true, card: true }),
    f("discharge_setting", "تنظیم دهانه خروجی", "Closed Side Setting", "TEXT"),
    f("max_feed_size", "حداکثر اندازه خوراک", "Maximum Feed Size", "DECIMAL", { unit: "MM" }),
    f("motor_power", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
    f("jaw_plate_material", "جنس فک", "Jaw Plate Material", "TEXT"),
    f("crusher_weight", "وزن سنگ‌شکن", "Crusher Weight", "DECIMAL", { unit: "TON" }),
    f("mobile_or_stationary", "نوع استقرار", "Installation Type", "SELECT", { options: ["ثابت", "متحرک چرخ‌دار", "متحرک زنجیری"] }),
  ]},
  { slug: "cone-crusher", label: "Cone Crusher", required: ["capacity", "max_feed_size"], fields: [
    f("capacity", "ظرفیت تولید", "Capacity", "DECIMAL", { unit: "T/H", filterable: true, card: true }),
    f("max_feed_size", "حداکثر اندازه خوراک", "Maximum Feed Size", "DECIMAL", { unit: "MM" }),
    f("discharge_setting", "تنظیم دهانه خروجی", "Closed Side Setting", "TEXT"),
    f("cone_diameter", "قطر مخروط", "Cone Diameter", "DECIMAL", { unit: "MM" }),
    f("crushing_chamber", "نوع محفظه خردایش", "Crushing Chamber", "SELECT", { options: ["Coarse", "Medium", "Fine", "Extra Fine"] }),
    f("motor_power", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
    f("lubrication_system", "سیستم روانکاری", "Lubrication System", "TEXT"),
  ]},
  { slug: "impact-crusher", label: "Impact Crusher", required: ["capacity", "rotor_diameter"], fields: [
    f("capacity", "ظرفیت تولید", "Capacity", "DECIMAL", { unit: "T/H", filterable: true }),
    f("rotor_diameter", "قطر روتور", "Rotor Diameter", "DECIMAL", { unit: "MM" }),
    f("rotor_width", "عرض روتور", "Rotor Width", "DECIMAL", { unit: "MM" }),
    f("max_feed_size", "حداکثر اندازه خوراک", "Maximum Feed Size", "DECIMAL", { unit: "MM" }),
    f("impact_bar_count", "تعداد چکش یا سندان", "Blow Bar Count", "INTEGER"),
    f("motor_power", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
    f("discharge_size", "اندازه محصول خروجی", "Product Size", "TEXT"),
  ]},

  // ROAD / CONCRETE — distinct roller and concrete equipment forms.
  { slug: "single-drum-roller", label: "Single Drum Roller", required: ["operating_weight", "drum_width"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("drum_width", "عرض درام", "Drum Width", "DECIMAL", { unit: "MM", filterable: true }),
    f("drum_diameter", "قطر درام", "Drum Diameter", "DECIMAL", { unit: "MM" }),
    f("vibration_frequency", "فرکانس ارتعاش", "Vibration Frequency", "DECIMAL", { unit: "HZ" }),
    f("centrifugal_force", "نیروی گریز از مرکز", "Centrifugal Force", "DECIMAL", { unit: "KN" }),
    f("amplitude", "دامنه ارتعاش", "Amplitude", "DECIMAL", { unit: "MM" }),
    f("gradeability", "قابلیت عبور از شیب", "Gradeability", "DECIMAL", { unit: "%" }),
  ]},
  { slug: "double-drum-roller", label: "Double Drum Roller", required: ["operating_weight", "working_width_mm"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true }),
    f("working_width_mm", "عرض کوبش", "Working Width", "DECIMAL", { unit: "MM", filterable: true, card: true }),
    f("drum_diameter", "قطر درام", "Drum Diameter", "DECIMAL", { unit: "MM" }),
    f("vibration_frequency", "فرکانس ارتعاش", "Vibration Frequency", "DECIMAL", { unit: "HZ" }),
    f("centrifugal_force", "نیروی گریز از مرکز", "Centrifugal Force", "DECIMAL", { unit: "KN" }),
    f("travel_speed", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "KMH" }),
  ]},
  { slug: "pneumatic-roller", label: "Pneumatic Tire Roller", required: ["operating_weight", "working_width_mm"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true }),
    f("working_width_mm", "عرض کوبش", "Working Width", "DECIMAL", { unit: "MM" }),
    f("tire_count", "تعداد تایر", "Tire Count", "INTEGER"),
    f("tire_pressure_range", "محدوده فشار باد تایر", "Tire Pressure Range", "TEXT"),
    f("ballast_capacity", "ظرفیت بالاست", "Ballast Capacity", "DECIMAL", { unit: "TON" }),
    f("travel_speed", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "KMH" }),
  ]},
  { slug: "vibratory-roller", label: "Vibratory Roller", required: ["operating_weight", "vibration_frequency"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true }),
    f("drum_width", "عرض درام", "Drum Width", "DECIMAL", { unit: "MM" }),
    f("vibration_frequency", "فرکانس ارتعاش", "Vibration Frequency", "DECIMAL", { unit: "HZ", filterable: true }),
    f("amplitude", "دامنه ارتعاش", "Amplitude", "DECIMAL", { unit: "MM" }),
    f("centrifugal_force", "نیروی گریز از مرکز", "Centrifugal Force", "DECIMAL", { unit: "KN" }),
    f("oscillation_system", "سیستم نوسانی", "Oscillation System", "BOOLEAN"),
  ]},
  { slug: "concrete-pump", label: "Concrete Pump", required: ["concrete_output", "max_pumping_pressure"], fields: [
    f("pump_configuration", "نوع پمپ بتن", "Pump Configuration", "SELECT", { options: ["کامیونی", "تریلری", "خطی", "ثابت", "بوم‌دار"] }),
    f("concrete_output", "حداکثر خروجی بتن", "Maximum Concrete Output", "DECIMAL", { unit: "M3/H", filterable: true, card: true }),
    f("max_pumping_pressure", "حداکثر فشار پمپاژ", "Maximum Pumping Pressure", "DECIMAL", { unit: "BAR", filterable: true }),
    f("boom_reach_vertical", "برد عمودی بوم", "Vertical Boom Reach", "DECIMAL", { unit: "M" }),
    f("boom_reach_horizontal", "برد افقی بوم", "Horizontal Boom Reach", "DECIMAL", { unit: "M" }),
    f("delivery_line_diameter", "قطر لوله انتقال", "Delivery Line Diameter", "DECIMAL", { unit: "MM" }),
    f("concrete_cylinder_diameter", "قطر سیلندر بتن", "Concrete Cylinder Diameter", "DECIMAL", { unit: "MM" }),
    f("hopper_capacity", "ظرفیت هاپر", "Hopper Capacity", "DECIMAL", { unit: "L" }),
    f("chassis_type", "نوع شاسی", "Chassis Type", "TEXT"),
  ]},
  { slug: "batching-plant", label: "Concrete Batching Plant", required: ["plant_capacity", "mixer_capacity"], fields: [
    f("plant_capacity", "ظرفیت تولید اسمی", "Rated Plant Capacity", "DECIMAL", { unit: "M3/H", filterable: true, card: true }),
    f("mixer_type", "نوع میکسر", "Mixer Type", "SELECT", { options: ["Twin Shaft", "Planetary", "Pan", "Drum"] }),
    f("mixer_capacity", "ظرفیت هر بچ", "Mixer Batch Capacity", "DECIMAL", { unit: "M3" }),
    f("aggregate_bins", "تعداد مخزن مصالح", "Aggregate Bins", "INTEGER"),
    f("cement_silo_capacity", "ظرفیت سیلوی سیمان", "Cement Silo Capacity", "DECIMAL", { unit: "TON" }),
    f("water_dosing_accuracy", "دقت توزین آب", "Water Dosing Accuracy", "TEXT"),
    f("control_system", "سیستم کنترل", "Control System", "TEXT"),
    f("installation_type", "نوع نصب", "Installation Type", "SELECT", { options: ["ثابت", "موبایل", "کامپکت"] }),
  ]},
  { slug: "transit-mixer", label: "Transit Mixer Truck", required: ["drum_capacity", "chassis_configuration"], fields: [
    f("drum_capacity", "ظرفیت اسمی دیگ", "Nominal Drum Capacity", "DECIMAL", { unit: "M3", filterable: true, card: true }),
    f("drum_rotation_speed", "سرعت چرخش دیگ", "Drum Rotation Speed", "DECIMAL", { unit: "RPM" }),
    f("water_tank_capacity", "ظرفیت مخزن آب", "Water Tank Capacity", "DECIMAL", { unit: "L" }),
    f("chassis_configuration", "آرایش شاسی", "Chassis Configuration", "TEXT"),
    f("axle_count", "تعداد محور", "Axle Count", "INTEGER"),
    f("discharge_chute_count", "تعداد ناودانی تخلیه", "Discharge Chute Count", "INTEGER"),
  ]},
  { slug: "shotcrete-machine", label: "Shotcrete Machine", required: ["concrete_output", "spraying_method"], fields: [
    f("concrete_output", "ظرفیت پاشش بتن", "Concrete Output", "DECIMAL", { unit: "M3/H" }),
    f("spraying_method", "روش پاشش", "Spraying Method", "SELECT", { options: ["تر", "خشک"] }),
    f("max_aggregate_size", "حداکثر اندازه سنگدانه", "Maximum Aggregate Size", "DECIMAL", { unit: "MM" }),
    f("hose_length", "طول شیلنگ", "Hose Length", "DECIMAL", { unit: "M" }),
    f("spraying_reach", "برد پاشش", "Spraying Reach", "DECIMAL", { unit: "M" }),
    f("robotic_boom", "بوم رباتیک", "Robotic Boom", "BOOLEAN"),
  ]},

  // FUEL STATION — a facility-equipment family, not an ordinary industrial pump.
  { slug: "fuel-dispenser", label: "Fuel Dispenser", required: ["product_type", "flow_rate", "metering_type"], fields: [
    f("product_type", "نوع فرآورده", "Fuel Product", "MULTI_SELECT", { options: ["بنزین", "گازوئیل", "نفت سفید", "سوخت هواپیما", "CNG", "AdBlue"] }),
    f("nozzle_count", "تعداد نازل", "Nozzle Count", "INTEGER"),
    f("hose_count", "تعداد شیلنگ", "Hose Count", "INTEGER"),
    f("flow_rate", "دبی سوخت", "Fuel Flow Rate", "DECIMAL", { unit: "LPM", filterable: true }),
    f("minimum_flow_rate_lpm", "حداقل دبی اندازه‌گیری", "Minimum Flow Rate", "DECIMAL", { unit: "LPM" }),
    f("maximum_flow_rate_lpm", "حداکثر دبی اندازه‌گیری", "Maximum Flow Rate", "DECIMAL", { unit: "LPM", filterable: true }),
    f("minimum_measured_quantity_l", "حداقل مقدار قابل اندازه‌گیری", "Minimum Measured Quantity", "DECIMAL", { unit: "L" }),
    f("metering_accuracy_percent", "دقت اندازه‌گیری", "Metering Accuracy", "DECIMAL", { unit: "%" }),
    f("accuracy_class", "کلاس دقت اندازه‌گیری", "Accuracy Class", "TEXT"),
    f("maximum_operating_pressure_bar", "حداکثر فشار کاری", "Maximum Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("metering_type", "نوع اندازه‌گیری", "Metering Type", "SELECT", { options: ["مکانیکی", "الکترونیکی", "پالس"] }),
    f("display_type", "نوع نمایشگر", "Display Type", "TEXT"),
    f("payment_terminal", "پایانه پرداخت", "Payment Terminal", "BOOLEAN"),
    f("vapor_recovery", "بازیابی بخار", "Vapor Recovery", "BOOLEAN"),
    f("dispenser_certification", "استاندارد/تأییدیه", "Certification", "TEXT"),
    f("supply_voltage_v", "ولتاژ تغذیه", "Supply Voltage", "DECIMAL", { unit: "V" }),
    f("supply_frequency_hz", "فرکانس تغذیه", "Supply Frequency", "DECIMAL", { unit: "HZ" }),
    f("phase_count", "تعداد فاز", "Phase Count", "INTEGER"),
    f("ambient_temperature_range_c", "محدوده دمای محیط", "Ambient Temperature Range", "TEXT"),
    f("ingress_protection_rating", "درجه حفاظت بدنه", "Ingress Protection Rating", "TEXT"),
    f("dispensing_sides", "تعداد سمت‌های سرویس‌دهی", "Dispensing Sides", "INTEGER"),
    f("product_count", "تعداد فرآورده قابل عرضه", "Product Count", "INTEGER"),
  ]},
  { slug: "fuel-storage-tank", label: "Fuel Storage Tank", required: ["tank_capacity", "tank_material", "tank_installation"], fields: [
    f("tank_capacity", "ظرفیت مخزن", "Tank Capacity", "DECIMAL", { unit: "L", filterable: true, card: true }),
    f("tank_material", "جنس مخزن", "Tank Material", "SELECT", { options: ["فولاد کربنی", "فایبرگلاس", "پلی‌اتیلن", "کامپوزیت"] }),
    f("tank_installation", "نحوه نصب", "Tank Installation", "SELECT", { options: ["زیرزمینی", "روززمینی", "مدفون افقی", "عمودی"] }),
    f("tank_wall_type", "ساختار جداره", "Tank Wall Type", "SELECT", { options: ["تک‌جداره", "دوجداره"] }),
    f("compartment_count", "تعداد محفظه", "Compartment Count", "INTEGER"),
    f("tank_design_pressure_kpa", "فشار طراحی مخزن", "Tank Design Pressure", "DECIMAL", { unit: "KPA" }),
    f("corrosion_protection", "حفاظت خوردگی", "Corrosion Protection", "TEXT"),
    f("interstitial_monitoring", "پایش فضای بین جداره", "Interstitial Monitoring", "BOOLEAN"),
    f("tank_length_mm", "طول مخزن", "Tank Length", "DECIMAL", { unit: "MM" }),
    f("tank_diameter_mm", "قطر مخزن", "Tank Diameter", "DECIMAL", { unit: "MM" }),
    f("overfill_protection", "حفاظت سرریز", "Overfill Protection", "BOOLEAN"),
    f("leak_detection_system", "سامانه تشخیص نشتی", "Leak Detection System", "BOOLEAN"),
    f("venting_system", "سامانه تنفسی مخزن", "Venting System", "TEXT"),
    f("tank_design_standard", "استاندارد طراحی مخزن", "Tank Design Standard", "TEXT"),
  ]},
  { slug: "submersible-fuel-pump", label: "Submersible Fuel Pump", required: ["flow_rate", "pump_head", "motor_power"], fields: [
    f("flow_rate", "دبی", "Flow Rate", "DECIMAL", { unit: "LPM", filterable: true }),
    f("pump_head", "هد", "Pump Head", "DECIMAL", { unit: "M" }),
    f("motor_power", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
    f("motor_voltage", "ولتاژ موتور", "Motor Voltage", "INTEGER", { unit: "V" }),
    f("fuel_compatibility", "سازگاری با سوخت", "Fuel Compatibility", "MULTI_SELECT", { options: ["بنزین", "گازوئیل", "سوخت ترکیبی", "سوخت هواپیما"] }),
    f("pump_diameter", "قطر پمپ", "Pump Diameter", "DECIMAL", { unit: "MM" }),
    f("explosion_protection", "حفاظت ضدانفجار", "Explosion Protection", "TEXT"),
    f("maximum_flow_rate_lpm", "حداکثر دبی", "Maximum Flow Rate", "DECIMAL", { unit: "LPM" }),
    f("maximum_discharge_pressure_bar", "حداکثر فشار خروجی", "Maximum Discharge Pressure", "DECIMAL", { unit: "BAR" }),
    f("motor_frequency_hz", "فرکانس موتور", "Motor Frequency", "DECIMAL", { unit: "HZ" }),
    f("phase_count", "تعداد فاز", "Phase Count", "INTEGER"),
    f("pump_installation_length_mm", "طول نصب پمپ", "Pump Installation Length", "DECIMAL", { unit: "MM" }),
    f("continuous_duty", "قابلیت کارکرد پیوسته", "Continuous Duty", "BOOLEAN"),
  ]},
  { slug: "tank-monitoring-system", label: "Automatic Tank Gauging & Leak Detection", required: ["monitoring_channels", "leak_detection"], fields: [
    f("monitoring_channels", "تعداد کانال پایش", "Monitoring Channels", "INTEGER"),
    f("tank_level_accuracy", "دقت اندازه‌گیری سطح", "Tank Level Accuracy", "TEXT"),
    f("leak_detection", "قابلیت تشخیص نشتی", "Leak Detection", "BOOLEAN"),
    f("water_detection", "تشخیص آب", "Water Detection", "BOOLEAN"),
    f("temperature_sensing", "اندازه‌گیری دما", "Temperature Sensing", "BOOLEAN"),
    f("connectivity", "روش ارتباطی", "Connectivity", "MULTI_SELECT", { options: ["Ethernet", "RS-485", "Modbus", "Wireless", "Cellular"] }),
    f("probe_type", "نوع پراب", "Probe Type", "TEXT"),
    f("level_measurement_range_mm", "محدوده اندازه‌گیری سطح", "Level Measurement Range", "DECIMAL", { unit: "MM" }),
    f("level_accuracy_mm", "دقت اندازه‌گیری سطح", "Level Accuracy", "DECIMAL", { unit: "MM" }),
    f("alarm_output_count", "تعداد خروجی هشدار", "Alarm Output Count", "INTEGER"),
    f("remote_monitoring", "پایش از راه دور", "Remote Monitoring", "BOOLEAN"),
    f("automatic_leak_test", "آزمون خودکار نشتی", "Automatic Leak Test", "BOOLEAN"),
  ]},
  { slug: "fuel-filtration", label: "Fuel Filtration System", required: ["flow_rate", "filtration_micron"], fields: [
    f("flow_rate", "دبی", "Flow Rate", "DECIMAL", { unit: "LPM" }),
    f("filtration_micron", "درجه فیلتراسیون", "Filtration Rating", "DECIMAL", { unit: "MICRON", filterable: true }),
    f("water_separation", "جداسازی آب", "Water Separation", "BOOLEAN"),
    f("filter_type", "نوع فیلتر", "Filter Type", "SELECT", { options: ["ذره‌گیر", "آب‌گیر", "دوگانه", "کوالسر"] }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("housing_material", "جنس محفظه", "Housing Material", "TEXT"),
    f("differential_pressure_bar", "اختلاف فشار فیلتر", "Filter Differential Pressure", "DECIMAL", { unit: "BAR" }),
    f("water_holding_capacity_l", "ظرفیت نگهداری آب", "Water Holding Capacity", "DECIMAL", { unit: "L" }),
    f("bypass_valve", "شیر بای‌پس", "Bypass Valve", "BOOLEAN"),
    f("filter_element_type", "نوع المنت فیلتر", "Filter Element Type", "TEXT"),
    f("contamination_removal_efficiency_percent", "بازده حذف آلودگی", "Contaminant Removal Efficiency", "DECIMAL", { unit: "%" }),
  ]},
  { slug: "fuel-hose-nozzle", label: "Fuel Hose & Nozzle", required: ["hose_diameter", "hose_length"], fields: [
    f("hose_diameter", "قطر داخلی شیلنگ", "Hose Inner Diameter", "DECIMAL", { unit: "MM" }),
    f("hose_length", "طول شیلنگ", "Hose Length", "DECIMAL", { unit: "M" }),
    f("working_pressure", "فشار کاری", "Working Pressure", "DECIMAL", { unit: "BAR" }),
    f("nozzle_type", "نوع نازل", "Nozzle Type", "SELECT", { options: ["دستی", "اتوماتیک", "High Flow", "Aviation"] }),
    f("swivel_included", "مفصل گردان", "Swivel Included", "BOOLEAN"),
    f("breakaway_included", "اتصال جداشونده ایمن", "Breakaway Included", "BOOLEAN"),
    f("fuel_compatibility", "سازگاری سوخت", "Fuel Compatibility", "MULTI_SELECT", { options: ["بنزین", "گازوئیل", "سوخت هواپیما", "AdBlue"] }),
    f("maximum_flow_rate_lpm", "حداکثر دبی عبوری", "Maximum Flow Rate", "DECIMAL", { unit: "LPM" }),
    f("automatic_shutoff", "قطع‌کن خودکار", "Automatic Shutoff", "BOOLEAN"),
    f("connection_size_in", "سایز اتصال", "Connection Size", "DECIMAL", { unit: "IN" }),
    f("breakaway_type", "نوع اتصال جداشونده ایمن", "Breakaway Type", "TEXT"),
    f("vapour_recovery_compatible", "سازگار با بازیابی بخار", "Vapour Recovery Compatible", "BOOLEAN"),
  ]},
  { slug: "vapour-recovery-equipment", label: "Vapour Recovery Equipment", required: ["recovery_stage", "system_type"], fields: [
    f("recovery_stage", "مرحله بازیابی بخار", "Recovery Stage", "SELECT", { options: ["مرحله اول تخلیه مخزن", "مرحله دوم نازل"] }),
    f("system_type", "نوع سیستم", "System Type", "SELECT", { options: ["مکش", "بالانس", "خلأ کمکی"] }),
    f("vapor_flow_rate", "دبی بخار", "Vapour Flow Rate", "DECIMAL", { unit: "M3/H" }),
    f("pressure_vacuum_valve", "شیر فشار-خلأ", "Pressure Vacuum Valve", "BOOLEAN"),
    f("flame_arrestor", "شعله‌گیر", "Flame Arrestor", "BOOLEAN"),
    f("certification", "استاندارد/تأییدیه", "Certification", "TEXT"),
    f("recovery_efficiency_percent", "بازده بازیابی بخار", "Recovery Efficiency", "DECIMAL", { unit: "%" }),
    f("operating_pressure_pa", "فشار عملیاتی", "Operating Pressure", "DECIMAL", { unit: "PA" }),
    f("vacuum_setpoint_pa", "نقطه تنظیم خلأ", "Vacuum Setpoint", "DECIMAL", { unit: "PA" }),
    f("recovery_monitoring", "پایش عملکرد بازیابی", "Recovery Monitoring", "BOOLEAN"),
    f("compliance_standard", "استاندارد انطباق", "Compliance Standard", "TEXT"),
  ]},

  { slug: "all-terrain-crane", label: "All Terrain Crane", required: ["max_load_capacity", "boom_length", "road_speed"], fields: [
    f("max_load_capacity", "حداکثر ظرفیت باربرداری", "Maximum Load Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("boom_length", "طول بوم", "Boom Length", "DECIMAL", { unit: "M" }),
    f("jib_length", "طول جیب", "Jib Length", "DECIMAL", { unit: "M" }),
    f("road_speed", "سرعت جاده‌ای", "Road Speed", "DECIMAL", { unit: "KMH" }),
    f("axle_count", "تعداد محور", "Axle Count", "INTEGER"),
    f("all_wheel_drive", "چهارچرخ محرک", "All Wheel Drive", "BOOLEAN"),
    f("all_wheel_steer", "فرمان‌پذیری تمام چرخ‌ها", "All Wheel Steering", "BOOLEAN"),
    f("outrigger_span", "فاصله بازشدگی جک‌ها", "Outrigger Span", "DECIMAL", { unit: "M" }),
    f("counterweight", "وزنه تعادل", "Counterweight", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "marine-crane", label: "Marine / Offshore Crane", required: ["max_load_capacity", "max_outreach"], fields: [
    f("max_load_capacity", "حداکثر ظرفیت باربرداری", "Maximum Load Capacity", "DECIMAL", { unit: "TON", filterable: true }),
    f("max_outreach", "حداکثر دسترسی افقی", "Maximum Outreach", "DECIMAL", { unit: "M" }),
    f("lifting_capacity_at_reach", "ظرفیت در شعاع کاری", "Capacity at Radius", "DECIMAL", { unit: "TON" }),
    f("slewing_range", "محدوده چرخش", "Slewing Range", "DECIMAL", { unit: "DEG" }),
    f("sea_state_rating", "کلاس وضعیت دریا", "Sea State Rating", "TEXT"),
    f("offshore_certification", "گواهی دریایی/آفشور", "Offshore Certification", "TEXT"),
    f("active_heave_compensation", "جبران‌ساز فعال حرکت موج", "Active Heave Compensation", "BOOLEAN"),
    f("winch_line_pull", "کشش وینچ", "Winch Line Pull", "DECIMAL", { unit: "KN" }),
  ]},
  { slug: "oil-gas-drilling", label: "Oil & Gas Drilling Rig", required: ["drilling_depth", "hook_load", "rig_type"], fields: [
    f("rig_type", "نوع دکل حفاری", "Rig Type", "SELECT", { options: ["خشکی", "دریایی", "Workover", "حفاری سبک"] }),
    f("drilling_depth", "عمق طراحی حفاری", "Rated Drilling Depth", "DECIMAL", { unit: "M" }),
    f("hook_load", "ظرفیت قلاب", "Hook Load", "DECIMAL", { unit: "TON" }),
    f("derrick_height", "ارتفاع دکل", "Derrick Height", "DECIMAL", { unit: "M" }),
    f("drawworks_power", "توان دراوورکس", "Drawworks Power", "DECIMAL", { unit: "KW" }),
    f("mud_pump_count", "تعداد پمپ گل", "Mud Pump Count", "INTEGER"),
    f("mud_pump_power", "توان پمپ گل", "Mud Pump Power", "DECIMAL", { unit: "KW" }),
    f("top_drive_torque", "گشتاور تاپ‌درایو", "Top Drive Torque", "DECIMAL", { unit: "KNM" }),
    f("blowout_preventer_rating", "فشار نامی فوران‌گیر", "BOP Pressure Rating", "DECIMAL", { unit: "PSI" }),
    f("substructure_height", "ارتفاع زیرسازه", "Substructure Height", "DECIMAL", { unit: "M" }),
  ]},
  { slug: "concrete-mixer", label: "Concrete Mixer", required: ["mixing_capacity", "motor_power"], fields: [
    f("mixer_type", "نوع میکسر", "Mixer Type", "SELECT", { options: ["پن", "دو‌محوره", "سیاره‌ای", "درامی"] }),
    f("mixing_capacity", "ظرفیت اختلاط هر بچ", "Mixing Capacity per Batch", "DECIMAL", { unit: "M3", filterable: true }),
    f("output_capacity", "ظرفیت خروجی", "Output Capacity", "DECIMAL", { unit: "M3/H" }),
    f("motor_power", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
    f("mixing_cycle", "زمان سیکل اختلاط", "Mixing Cycle Time", "DECIMAL", { unit: "S" }),
    f("liner_material", "جنس لاینر", "Liner Material", "TEXT"),
    f("installation_type", "نوع نصب", "Installation Type", "SELECT", { options: ["ثابت", "متحرک"] }),
  ]},
  { slug: "asphalt-finisher", label: "Asphalt Paver / Finisher", required: ["paving_width", "paving_capacity"], fields: [
    f("paving_width", "عرض روسازی", "Paving Width", "DECIMAL", { unit: "M", filterable: true, card: true }),
    f("maximum_paving_width", "حداکثر عرض روسازی", "Maximum Paving Width", "DECIMAL", { unit: "M" }),
    f("paving_thickness", "ضخامت لایه", "Paving Thickness", "DECIMAL", { unit: "MM" }),
    f("paving_capacity", "ظرفیت پخش", "Paving Capacity", "DECIMAL", { unit: "T/H", filterable: true }),
    f("asphalt_hopper_capacity_ton", "ظرفیت هاپر", "Hopper Capacity", "DECIMAL", { unit: "TON" }),
    f("screed_type", "نوع اتو", "Screed Type", "SELECT", { options: ["ثابت", "تلسکوپی"] }),
    f("screed_heating", "گرمایش اتو", "Screed Heating", "SELECT", { options: ["گازی", "برقی"] }),
    f("travel_speed", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "KMH" }),
    f("track_or_wheel", "نوع حرکت", "Undercarriage", "SELECT", { options: ["زنجیری", "چرخ لاستیکی"] }),
  ]},
  { slug: "scraper", label: "Earthmoving Scraper", required: ["bowl_capacity", "rated_payload"], fields: [
    f("bowl_capacity", "ظرفیت جام", "Bowl Capacity", "DECIMAL", { unit: "M3", filterable: true, card: true }),
    f("rated_payload", "ظرفیت بار اسمی", "Rated Payload", "DECIMAL", { unit: "TON", filterable: true }),
    f("cutting_width", "عرض برش", "Cutting Width", "DECIMAL", { unit: "M" }),
    f("cutting_depth", "عمق برش", "Cutting Depth", "DECIMAL", { unit: "MM" }),
    f("ejection_type", "نوع تخلیه", "Ejection Type", "SELECT", { options: ["Elevator", "Push-Pull", "Auger", "Open Bowl"] }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("drive_configuration", "آرایش محرک", "Drive Configuration", "TEXT"),
  ]},
  { slug: "aerial-platform", label: "Aerial Work Platform", required: ["platform_height", "platform_capacity"], fields: [
    f("platform_type", "نوع بالابر", "Platform Type", "SELECT", { options: ["قیچی", "بوم مفصلی", "بوم تلسکوپی", "ستونی", "عنکبوتی"] }),
    f("platform_height", "ارتفاع کاری", "Working Height", "DECIMAL", { unit: "M", filterable: true, card: true }),
    f("platform_capacity", "ظرفیت سبد", "Platform Capacity", "DECIMAL", { unit: "KG", filterable: true }),
    f("horizontal_reach", "دسترسی افقی", "Horizontal Reach", "DECIMAL", { unit: "M" }),
    f("platform_dimensions", "ابعاد سبد", "Platform Dimensions", "TEXT"),
    f("drive_type", "نوع محرک", "Drive Type", "SELECT", { options: ["برقی", "دیزلی", "هیبریدی"] }),
    f("working_slope", "شیب مجاز کار", "Working Slope", "DECIMAL", { unit: "DEG" }),
    f("outdoor_indoor_rating", "کاربری محیطی", "Indoor/Outdoor Rating", "SELECT", { options: ["داخل سالن", "فضای باز", "هر دو"] }),
  ]},
  { slug: "industrial-fans", label: "Industrial Fan", required: ["airflow", "static_pressure", "motor_power"], fields: [
    f("fan_type", "نوع فن", "Fan Type", "SELECT", { options: ["سانتریفیوژ", "محوری", "جریان مختلط", "Roof Fan"] }),
    f("airflow", "دبی هوا", "Airflow", "DECIMAL", { unit: "M3/H", filterable: true }),
    f("static_pressure", "فشار استاتیک", "Static Pressure", "DECIMAL", { unit: "PA" }),
    f("motor_power", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
    f("impeller_diameter", "قطر پروانه", "Impeller Diameter", "DECIMAL", { unit: "MM" }),
    f("rotation_speed", "سرعت دوران", "Rotation Speed", "INTEGER", { unit: "RPM" }),
    f("noise_level", "سطح صدا", "Noise Level", "DECIMAL", { unit: "DBA" }),
    f("housing_material", "جنس بدنه", "Housing Material", "TEXT"),
  ]},
  { slug: "boilers", label: "Industrial Boiler", required: ["steam_capacity", "design_pressure", "boiler_type"], fields: [
    f("boiler_type", "نوع دیگ", "Boiler Type", "SELECT", { options: ["Fire Tube", "Water Tube", "Once Through", "Thermal Oil"] }),
    f("steam_capacity", "ظرفیت تولید بخار", "Steam Capacity", "DECIMAL", { unit: "T/H", filterable: true }),
    f("design_pressure", "فشار طراحی", "Design Pressure", "DECIMAL", { unit: "BAR" }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("fuel_type", "نوع سوخت", "Fuel Type", "SELECT", { options: ["گاز طبیعی", "گازوئیل", "مازوت", "دوگانه‌سوز", "برقی"] }),
    f("thermal_efficiency", "راندمان حرارتی", "Thermal Efficiency", "DECIMAL", { unit: "%" }),
    f("heating_surface", "سطح حرارتی", "Heating Surface", "DECIMAL", { unit: "M2" }),
    f("inspection_certificate", "گواهی بازرسی", "Inspection Certificate", "BOOLEAN"),
  ]},
  { slug: "hvac-equipment", label: "HVAC Equipment", required: ["cooling_capacity", "equipment_type"], fields: [
    f("equipment_type", "نوع تجهیز", "Equipment Type", "SELECT", { options: ["چیلر", "هواساز", "فن‌کویل", "برج خنک‌کن", "پکیج", "کمپرسور تبرید"] }),
    f("cooling_capacity", "ظرفیت سرمایش", "Cooling Capacity", "DECIMAL", { unit: "KW", filterable: true }),
    f("heating_capacity", "ظرفیت گرمایش", "Heating Capacity", "DECIMAL", { unit: "KW" }),
    f("refrigerant", "مبرد", "Refrigerant", "TEXT"),
    f("airflow", "دبی هوا", "Airflow", "DECIMAL", { unit: "M3/H" }),
    f("power_input", "توان مصرفی", "Power Input", "DECIMAL", { unit: "KW" }),
    f("energy_efficiency", "شاخص راندمان انرژی", "Energy Efficiency", "TEXT"),
    f("compressor_type", "نوع کمپرسور", "Compressor Type", "TEXT"),
  ]},
  { slug: "welding-equipment", label: "Industrial Welding Equipment", required: ["welding_process", "output_current"], fields: [
    f("welding_process", "فرآیند جوشکاری", "Welding Process", "MULTI_SELECT", { options: ["MMA", "MIG/MAG", "TIG", "SAW", "Plasma"] }),
    f("output_current", "جریان خروجی", "Output Current", "TEXT"),
    f("duty_cycle", "چرخه کاری", "Duty Cycle", "TEXT"),
    f("input_voltage", "ولتاژ ورودی", "Input Voltage", "TEXT"),
    f("wire_feed_speed", "سرعت تغذیه سیم", "Wire Feed Speed", "TEXT"),
    f("cooling_type", "نوع خنک‌کاری", "Cooling Type", "SELECT", { options: ["هواخنک", "آب‌خنک"] }),
  ]},
  { slug: "cutting-equipment", label: "Industrial Cutting Equipment", required: ["cutting_process", "max_cut_thickness"], fields: [
    f("cutting_process", "روش برش", "Cutting Process", "SELECT", { options: ["لیزر", "پلاسما", "اکسی‌گاز", "واترجت", "اره نواری"] }),
    f("max_cut_thickness", "حداکثر ضخامت برش", "Maximum Cutting Thickness", "DECIMAL", { unit: "MM" }),
    f("working_area", "ابعاد میز کار", "Working Area", "TEXT"),
    f("cutting_speed", "سرعت برش", "Cutting Speed", "DECIMAL", { unit: "MM/MIN" }),
    f("power_rating", "توان نامی", "Power Rating", "DECIMAL", { unit: "KW" }),
    f("material_compatibility", "مواد قابل برش", "Material Compatibility", "MULTI_SELECT", { options: ["فولاد", "استنلس", "آلومینیوم", "مس", "سنگ", "سرامیک"] }),
  ]},
  { slug: "transformers", label: "Power Transformer", required: ["rated_power", "primary_voltage", "secondary_voltage"], fields: [
    f("rated_power", "توان نامی", "Rated Power", "DECIMAL", { unit: "KVA", filterable: true }),
    f("primary_voltage", "ولتاژ اولیه", "Primary Voltage", "DECIMAL", { unit: "KV" }),
    f("secondary_voltage", "ولتاژ ثانویه", "Secondary Voltage", "DECIMAL", { unit: "KV" }),
    f("phase_count", "تعداد فاز", "Phase Count", "INTEGER"),
    f("cooling_method", "روش خنک‌کاری", "Cooling Method", "SELECT", { options: ["ONAN", "ONAF", "OFAF", "Dry Type"] }),
    f("impedance", "امپدانس", "Impedance", "DECIMAL", { unit: "%" }),
    f("frequency", "فرکانس", "Frequency", "INTEGER", { unit: "HZ" }),
    f("vector_group", "گروه برداری", "Vector Group", "TEXT"),
  ]},
  { slug: "switchgears", label: "Electrical Switchgear", required: ["rated_voltage", "rated_current", "short_circuit_rating"], fields: [
    f("rated_voltage", "ولتاژ نامی", "Rated Voltage", "DECIMAL", { unit: "KV" }),
    f("rated_current", "جریان نامی", "Rated Current", "DECIMAL", { unit: "A" }),
    f("short_circuit_rating", "تحمل اتصال کوتاه", "Short Circuit Rating", "DECIMAL", { unit: "KA" }),
    f("insulation_type", "نوع عایق", "Insulation Type", "SELECT", { options: ["هوا", "گاز", "خلأ", "جامد"] }),
    f("installation_type", "محل نصب", "Installation Type", "SELECT", { options: ["داخلی", "فضای باز"] }),
    f("protection_relay", "رله حفاظتی", "Protection Relay", "TEXT"),
    f("ip_rating", "درجه حفاظت IP", "IP Rating", "TEXT"),
  ]},
  { slug: "sprayer", label: "Agricultural Sprayer", required: ["tank_capacity", "spraying_width"], fields: [
    f("sprayer_type", "نوع سم‌پاش", "Sprayer Type", "SELECT", { options: ["بوم‌دار", "باغی", "پشت‌تراکتوری", "خودکششی", "پهپادی"] }),
    f("tank_capacity", "ظرفیت مخزن", "Tank Capacity", "DECIMAL", { unit: "L", filterable: true }),
    f("spraying_width", "عرض پاشش", "Spraying Width", "DECIMAL", { unit: "M" }),
    f("nozzle_count", "تعداد نازل", "Nozzle Count", "INTEGER"),
    f("pump_flow", "دبی پمپ", "Pump Flow", "DECIMAL", { unit: "LPM" }),
    f("working_pressure", "فشار کاری", "Working Pressure", "DECIMAL", { unit: "BAR" }),
    f("control_system", "سیستم کنترل", "Control System", "TEXT"),
  ]},
  { slug: "irrigation-system", label: "Irrigation System", required: ["irrigated_area", "design_flow_rate_m3h"], fields: [
    f("irrigation_type", "نوع آبیاری", "Irrigation Type", "SELECT", { options: ["قطره‌ای", "بارانی", "محوری", "خطی", "سطحی"] }),
    f("irrigated_area", "مساحت تحت پوشش", "Irrigated Area", "DECIMAL", { unit: "HA" }),
    f("design_flow_rate_m3h", "دبی طراحی", "Design Flow Rate", "DECIMAL", { unit: "M3/H" }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("pipe_diameter", "قطر لوله اصلی", "Main Pipe Diameter", "DECIMAL", { unit: "MM" }),
    f("filter_type", "نوع فیلتراسیون", "Filter Type", "TEXT"),
    f("automation_level", "سطح اتوماسیون", "Automation Level", "SELECT", { options: ["دستی", "نیمه‌خودکار", "هوشمند"] }),
  ]},
  { slug: "tillage-equipment", label: "Tillage Equipment", required: ["working_width", "working_depth_cm"], fields: [
    f("implement_type", "نوع ادوات", "Implement Type", "SELECT", { options: ["گاوآهن", "دیسک", "چیزل", "زیرشکن", "روتیواتور", "لولر"] }),
    f("working_width", "عرض کار", "Working Width", "DECIMAL", { unit: "M" }),
    f("working_depth_cm", "عمق کار", "Working Depth", "DECIMAL", { unit: "CM" }),
    f("working_elements", "تعداد المان کاری", "Working Elements", "INTEGER"),
    f("required_power", "توان موردنیاز تراکتور", "Required Tractor Power", "DECIMAL", { unit: "HP" }),
    f("hitch_type", "نوع اتصال", "Hitch Type", "TEXT"),
  ]},
  { slug: "planting-equipment", label: "Planting Equipment", required: ["row_count", "row_spacing"], fields: [
    f("implement_type", "نوع دستگاه کاشت", "Implement Type", "SELECT", { options: ["بذرکار", "ردیف‌کار", "نشاکار", "سیب‌زمینی‌کار", "کاشت دقیق"] }),
    f("row_count", "تعداد ردیف", "Row Count", "INTEGER"),
    f("row_spacing", "فاصله ردیف‌ها", "Row Spacing", "DECIMAL", { unit: "MM" }),
    f("working_width", "عرض کار", "Working Width", "DECIMAL", { unit: "M" }),
    f("hopper_capacity", "ظرفیت مخزن بذر", "Seed Hopper Capacity", "DECIMAL", { unit: "L" }),
    f("metering_type", "نوع موزع", "Metering Type", "TEXT"),
    f("required_power", "توان موردنیاز تراکتور", "Required Tractor Power", "DECIMAL", { unit: "HP" }),
  ]},
  { slug: "harvesting-equipment", label: "Harvesting Equipment", required: ["working_width", "crop_type"], fields: [
    f("implement_type", "نوع دستگاه برداشت", "Implement Type", "SELECT", { options: ["دروگر", "هد کمباین", "چاپر", "بیلر", "برداشت پنبه"] }),
    f("crop_type", "نوع محصول", "Crop Type", "MULTI_SELECT", { options: ["گندم", "جو", "ذرت", "برنج", "پنبه", "نیشکر", "علوفه", "محصولات باغی", "سبزیجات"] }),
    f("working_width", "عرض کار", "Working Width", "DECIMAL", { unit: "M" }),
    f("field_capacity", "ظرفیت برداشت مزرعه‌ای", "Field Capacity", "DECIMAL", { unit: "HA/H" }),
    f("power_requirement", "توان موردنیاز", "Power Requirement", "DECIMAL", { unit: "HP" }),
  ]},

  { slug: "excavator-chain", label: "Crawler Excavator", required: ["operating_weight", "track_shoe_width", "track_width"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("track_shoe_width", "عرض کفشک زنجیر", "Track Shoe Width", "DECIMAL", { unit: "MM" }),
    f("track_width", "عرض زنجیر", "Track Width", "DECIMAL", { unit: "MM" }),
    f("track_length_ground", "طول تماس زنجیر با زمین", "Track Length on Ground", "DECIMAL", { unit: "M" }),
    f("ground_pressure", "فشار بر زمین", "Ground Pressure", "DECIMAL", { unit: "KPA" }),
    f("track_roller_count", "تعداد رولر هر طرف", "Track Roller Count per Side", "INTEGER"),
    f("track_shoe_count", "تعداد کفشک هر طرف", "Track Shoe Count per Side", "INTEGER"),
  ]},
  { slug: "excavator-wheel", label: "Wheeled Excavator", required: ["operating_weight", "travel_speed", "tire_size"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true }),
    f("travel_speed", "سرعت حرکت جاده‌ای", "Travel Speed", "DECIMAL", { unit: "KMH" }),
    f("tire_size", "سایز تایر", "Tire Size", "TEXT"),
    f("axle_count", "تعداد محور", "Axle Count", "INTEGER"),
    f("outrigger_type", "نوع پایه تثبیت", "Stabilizer Type", "SELECT", { options: ["جک جلو و عقب", "بولدوزر بلید", "بدون"] }),
    f("turning_radius", "شعاع گردش", "Turning Radius", "DECIMAL", { unit: "M" }),
    f("bucket_capacity", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3" }),
  ]},
  { slug: "long-reach", label: "Long Reach Excavator", required: ["boom_reach", "max_digging_depth"], fields: [
    f("boom_reach", "حداکثر برد بازو", "Maximum Boom Reach", "DECIMAL", { unit: "M", filterable: true, card: true }),
    f("max_digging_depth", "حداکثر عمق حفاری", "Maximum Digging Depth", "DECIMAL", { unit: "M", filterable: true }),
    f("max_dump_height", "حداکثر ارتفاع تخلیه", "Maximum Dump Height", "DECIMAL", { unit: "M" }),
    f("bucket_capacity", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3" }),
    f("boom_length", "طول بوم", "Boom Length", "DECIMAL", { unit: "M" }),
    f("arm_length", "طول استیک", "Arm Length", "DECIMAL", { unit: "M" }),
    f("counterweight", "وزنه تعادل", "Counterweight", "DECIMAL", { unit: "TON" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "mining-excavator", label: "Mining Excavator Variant", required: ["operating_weight", "bucket_capacity"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("bucket_capacity", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3", filterable: true }),
    f("payload_capacity", "ظرفیت بارگیری", "Payload Capacity", "DECIMAL", { unit: "TON" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("digging_force", "نیروی حفاری", "Digging Force", "DECIMAL", { unit: "KN" }),
    f("ground_pressure", "فشار بر زمین", "Ground Pressure", "DECIMAL", { unit: "KPA" }),
    f("undercarriage_type", "نوع زیربندی", "Undercarriage Type", "TEXT"),
  ]},
  { slug: "drill", label: "Drilling Machine / Drill", required: ["drilling_method", "drilling_capacity"], fields: [
    f("drilling_method", "روش حفاری", "Drilling Method", "SELECT", { options: ["چرخشی", "ضربه‌ای", "مغزه‌گیری", "DTH", "Top Hammer"] }),
    f("drilling_capacity", "ظرفیت حفاری", "Drilling Capacity", "TEXT"),
    f("hole_diameter_range", "محدوده قطر حفاری", "Hole Diameter Range", "TEXT"),
    f("rotation_speed", "سرعت چرخش", "Rotation Speed", "DECIMAL", { unit: "RPM" }),
    f("torque", "گشتاور", "Torque", "DECIMAL", { unit: "NM" }),
    f("power_source", "منبع نیرو", "Power Source", "SELECT", { options: ["برقی", "دیزلی", "هیدرولیک", "پنوماتیک"] }),
  ]},
  { slug: "extraction-machinery", label: "Extraction Machinery", required: ["extraction_method", "production_capacity"], fields: [
    f("extraction_method", "روش استخراج", "Extraction Method", "SELECT", { options: ["روباز", "زیرزمینی", "پیوسته", "مرحله‌ای"] }),
    f("production_capacity", "ظرفیت تولید", "Production Capacity", "DECIMAL", { unit: "T/H" }),
    f("material_type", "نوع ماده معدنی", "Material Type", "TEXT"),
    f("cutting_width", "عرض برش", "Cutting Width", "DECIMAL", { unit: "M" }),
    f("cutting_height", "ارتفاع برش", "Cutting Height", "DECIMAL", { unit: "M" }),
    f("power_rating", "توان نامی", "Power Rating", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "other-mining", label: "Other Mining Machinery", required: ["equipment_type"], fields: [
    f("equipment_type", "نوع ماشین معدنی", "Equipment Type", "TEXT", { searchable: true }),
    f("mining_application", "کاربرد معدنی", "Mining Application", "MULTI_SELECT", { options: ["استخراج", "بارگیری", "حمل", "حفاری", "نگهداری معدن", "فرآوری"] }),
    f("production_capacity", "ظرفیت عملیاتی", "Operating Capacity", "TEXT"),
    f("power_rating", "توان نامی", "Power Rating", "DECIMAL", { unit: "KW" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "other-drilling", label: "Other Drilling Equipment", required: ["drilling_method"], fields: [
    f("drilling_method", "روش حفاری", "Drilling Method", "TEXT"),
    f("hole_diameter_range", "محدوده قطر حفاری", "Hole Diameter Range", "TEXT"),
    f("max_drilling_depth", "حداکثر عمق حفاری", "Maximum Drilling Depth", "DECIMAL", { unit: "M" }),
    f("power_rating", "توان", "Power Rating", "DECIMAL", { unit: "KW" }),
    f("machine_weight_kg", "وزن دستگاه", "Machine Weight", "DECIMAL", { unit: "KG" }),
  ]},
  { slug: "other-crane", label: "Other Crane", required: ["crane_configuration", "lifting_capacity"], fields: [
    f("crane_configuration", "پیکربندی جرثقیل", "Crane Configuration", "TEXT"),
    f("lifting_capacity", "ظرفیت باربرداری", "Lifting Capacity", "DECIMAL", { unit: "TON", filterable: true }),
    f("max_lift_height", "حداکثر ارتفاع بالابری", "Maximum Lift Height", "DECIMAL", { unit: "M" }),
    f("working_radius", "شعاع کاری", "Working Radius", "DECIMAL", { unit: "M" }),
    f("load_chart_available", "جدول بار موجود", "Load Chart Available", "BOOLEAN"),
  ]},
  { slug: "reach-truck", label: "Reach Truck", required: ["rated_lifting_capacity_kg", "lift_height"], fields: [
    f("rated_lifting_capacity_kg", "ظرفیت باربرداری", "Rated Capacity", "DECIMAL", { unit: "KG", filterable: true, card: true }),
    f("lift_height", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "M", filterable: true }),
    f("reach_mechanism", "مکانیزم ریچ", "Reach Mechanism", "SELECT", { options: ["دکل متحرک", "شاخک متحرک", "دکل و شاخک"] }),
    f("aisle_width", "عرض راهروی کاری", "Aisle Width", "DECIMAL", { unit: "MM" }),
    f("battery_voltage", "ولتاژ باتری", "Battery Voltage", "INTEGER", { unit: "V" }),
    f("battery_capacity", "ظرفیت باتری", "Battery Capacity", "DECIMAL", { unit: "KWH" }),
    f("mast_type", "نوع دکل", "Mast Type", "TEXT"),
  ]},
  { slug: "pallet-truck", label: "Pallet Truck", required: ["load_capacity", "fork_length"], fields: [
    f("load_capacity", "ظرفیت حمل", "Load Capacity", "DECIMAL", { unit: "KG", filterable: true, card: true }),
    f("fork_length", "طول شاخک", "Fork Length", "DECIMAL", { unit: "MM" }),
    f("fork_width", "عرض شاخک", "Fork Width", "DECIMAL", { unit: "MM" }),
    f("lift_height_mm", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "MM" }),
    f("drive_type", "نوع محرک", "Drive Type", "SELECT", { options: ["دستی", "برقی", "نیمه‌برقی"] }),
    f("battery_capacity_ah", "ظرفیت باتری", "Battery Capacity", "DECIMAL", { unit: "AH" }),
  ]},
  { slug: "stacker", label: "Warehouse Stacker", required: ["load_capacity", "lift_height"], fields: [
    f("load_capacity", "ظرفیت باربرداری", "Load Capacity", "DECIMAL", { unit: "KG", filterable: true }),
    f("lift_height", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "M", filterable: true }),
    f("mast_type", "نوع دکل", "Mast Type", "TEXT"),
    f("operator_type", "نوع اپراتوری", "Operator Type", "SELECT", { options: ["پیاده‌رو", "سوارشو", "سکودار"] }),
    f("aisle_width", "عرض راهرو", "Aisle Width", "DECIMAL", { unit: "MM" }),
    f("battery_capacity_ah", "ظرفیت باتری", "Battery Capacity", "DECIMAL", { unit: "AH" }),
  ]},
  { slug: "other-forklift", label: "Other Warehouse Handling Equipment", required: ["equipment_type"], fields: [
    f("equipment_type", "نوع تجهیزات انبار", "Equipment Type", "TEXT"),
    f("load_capacity", "ظرفیت حمل", "Load Capacity", "DECIMAL", { unit: "KG" }),
    f("lift_height", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "M" }),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
    f("operator_type", "نوع اپراتوری", "Operator Type", "TEXT"),
  ]},
  { slug: "complete-line", label: "Complete Crushing / Processing Line", required: ["plant_capacity", "process_stages"], fields: [
    f("plant_capacity", "ظرفیت خط", "Plant Capacity", "DECIMAL", { unit: "T/H", filterable: true, card: true }),
    f("process_stages", "مراحل فرآیند", "Process Stages", "MULTI_SELECT", { options: ["خردایش اولیه", "خردایش ثانویه", "خردایش ثالثیه", "سرند", "شستشو", "دانه‌بندی", "بسته‌بندی"] }),
    f("feed_material", "نوع خوراک", "Feed Material", "TEXT"),
    f("feed_size", "اندازه خوراک", "Feed Size", "TEXT"),
    f("product_size_range", "محدوده اندازه محصول", "Product Size Range", "TEXT"),
    f("installed_power", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
    f("mobile_or_stationary", "نوع استقرار", "Installation Type", "SELECT", { options: ["ثابت", "متحرک", "نیمه‌متحرک"] }),
  ]},
  { slug: "recycling-line", label: "Recycling Line", required: ["input_capacity", "material_stream"], fields: [
    f("input_capacity", "ظرفیت ورودی", "Input Capacity", "DECIMAL", { unit: "T/H", filterable: true }),
    f("material_stream", "نوع مواد ورودی", "Material Stream", "MULTI_SELECT", { options: ["پلاستیک", "فلز", "لاستیک", "شیشه", "پسماند ساختمانی", "کاغذ"] }),
    f("sorting_stages", "تعداد مراحل جداسازی", "Sorting Stages", "INTEGER"),
    f("output_fractions", "خروجی‌های تفکیک‌شده", "Output Fractions", "TEXT"),
    f("automation_level", "سطح اتوماسیون", "Automation Level", "SELECT", { options: ["دستی", "نیمه‌خودکار", "تمام‌خودکار"] }),
    f("installed_power", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "sorter", label: "Industrial Sorting Machine", required: ["sorting_method", "throughput"], fields: [
    f("sorting_method", "روش جداسازی", "Sorting Method", "SELECT", { options: ["نوری", "مغناطیسی", "ادی‌کارنت", "هوایی", "دستی/مکانیکی"] }),
    f("throughput", "ظرفیت عبوری", "Throughput", "DECIMAL", { unit: "T/H", filterable: true }),
    f("material_type", "نوع ماده", "Material Type", "TEXT"),
    f("sorting_accuracy", "دقت جداسازی", "Sorting Accuracy", "TEXT"),
    f("number_of_channels", "تعداد کانال", "Number of Channels", "INTEGER"),
    f("conveyor_width", "عرض نوار ورودی", "Feed Conveyor Width", "DECIMAL", { unit: "MM" }),
  ]},
  { slug: "reach-stacker", label: "Reach Stacker", required: ["lifting_capacity", "stacking_height", "container_size"], fields: [
    f("lifting_capacity", "ظرفیت باربرداری", "Lifting Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("stacking_height", "ارتفاع چیدمان", "Stacking Height", "INTEGER", { unit: "ROWS" }),
    f("container_size", "ابعاد کانتینر", "Container Size", "MULTI_SELECT", { options: ["20ft", "40ft", "45ft"] }),
    f("reach_distance", "محدوده دسترسی", "Reach Distance", "DECIMAL", { unit: "M" }),
    f("spreader_type", "نوع اسپریدر", "Spreader Type", "TEXT"),
    f("spreader_rotation", "چرخش اسپریدر", "Spreader Rotation", "DECIMAL", { unit: "DEG" }),
    f("wheelbase", "فاصله محوری", "Wheelbase", "DECIMAL", { unit: "M" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "harvester", label: "Forestry Harvester", required: ["cutting_diameter", "boom_reach"], fields: [
    f("machine_configuration", "پیکربندی دستگاه", "Machine Configuration", "SELECT", { options: ["چرخ‌دار", "زنجیری", "پایه‌دار"] }),
    f("cutting_diameter", "حداکثر قطر برش", "Maximum Cutting Diameter", "DECIMAL", { unit: "MM", filterable: true }),
    f("boom_reach", "برد بوم", "Boom Reach", "DECIMAL", { unit: "M" }),
    f("harvester_head_type", "نوع هد برداشت", "Harvester Head Type", "TEXT"),
    f("feed_force", "نیروی تغذیه", "Feed Force", "DECIMAL", { unit: "KN" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "forwarder", label: "Forestry Forwarder", required: ["load_capacity", "bunk_volume"], fields: [
    f("load_capacity", "ظرفیت حمل", "Load Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("bunk_volume", "حجم محفظه بار", "Bunk Volume", "DECIMAL", { unit: "M3" }),
    f("boom_reach", "برد جرثقیل بارگیری", "Loading Crane Reach", "DECIMAL", { unit: "M" }),
    f("grapple_area", "سطح گیرش گراپل", "Grapple Area", "DECIMAL", { unit: "M2" }),
    f("drive_configuration", "آرایش محرک", "Drive Configuration", "SELECT", { options: ["6x6", "8x8", "6x8"] }),
    f("ground_clearance_mm", "فاصله از زمین", "Ground Clearance", "DECIMAL", { unit: "MM" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "production-line", label: "Industrial Production Line", required: ["line_type", "production_capacity"], fields: [
    f("line_type", "نوع خط تولید", "Production Line Type", "TEXT"),
    f("production_capacity", "ظرفیت تولید", "Production Capacity", "TEXT"),
    f("product_type", "نوع محصول", "Product Type", "TEXT"),
    f("number_of_stations", "تعداد ایستگاه‌ها", "Number of Stations", "INTEGER"),
    f("automation_level", "سطح اتوماسیون", "Automation Level", "SELECT", { options: ["دستی", "نیمه‌خودکار", "تمام‌خودکار"] }),
    f("installed_power", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
    f("line_length", "طول خط", "Line Length", "DECIMAL", { unit: "M" }),
  ]},
  { slug: "special-machinery", label: "Special Purpose Machinery", required: ["machine_purpose", "machine_configuration"], fields: [
    f("machine_purpose", "کاربری تخصصی", "Machine Purpose", "TEXT", { searchable: true }),
    f("machine_configuration", "پیکربندی دستگاه", "Machine Configuration", "LONG_TEXT"),
    f("operating_capacity", "ظرفیت عملیاتی", "Operating Capacity", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
    f("dimensions", "ابعاد", "Dimensions", "TEXT"),
    f("compliance_standards", "استانداردهای انطباق", "Compliance Standards", "TEXT"),
  ]},
  { slug: "other-industrial-machinery", label: "Other Industrial Machinery", required: ["equipment_type"], fields: [
    f("equipment_type", "نوع ماشین صنعتی", "Equipment Type", "TEXT", { searchable: true }),
    f("rated_capacity", "ظرفیت نامی", "Rated Capacity", "TEXT"),
    f("power_rating", "توان نامی", "Power Rating", "DECIMAL", { unit: "KW" }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("dimensions", "ابعاد", "Dimensions", "TEXT"),
    f("installation_type", "نوع نصب", "Installation Type", "TEXT"),
  ]},
  { slug: "other-forestry-machinery", label: "Other Forestry Machinery", required: ["equipment_type"], fields: [
    f("equipment_type", "نوع ماشین جنگلداری", "Equipment Type", "TEXT"),
    f("forestry_application", "کاربرد جنگلداری", "Forestry Application", "TEXT"),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("working_reach", "برد کاری", "Working Reach", "DECIMAL", { unit: "M" }),
  ]},
  { slug: "other-port-machinery", label: "Other Port Machinery", required: ["equipment_type"], fields: [
    f("equipment_type", "نوع تجهیزات بندری", "Equipment Type", "TEXT"),
    f("safe_working_load", "بار کاری ایمن", "Safe Working Load", "DECIMAL", { unit: "TON" }),
    f("container_compatibility", "سازگاری کانتینر", "Container Compatibility", "TEXT"),
    f("working_reach", "برد کاری", "Working Reach", "DECIMAL", { unit: "M" }),
    f("drive_type", "نوع محرک", "Drive Type", "TEXT"),
  ]},

  { slug: "mining-equipment", label: "Mining Equipment (General)", required: ["equipment_type", "mining_application"], fields: [
    f("equipment_type", "نوع تجهیزات معدنی", "Equipment Type", "TEXT", { searchable: true }),
    f("mining_application", "کاربرد معدنی", "Mining Application", "MULTI_SELECT", { options: ["استخراج", "بارگیری", "حمل", "حفاری", "تهویه", "نگهداری", "فرآوری"] }),
    f("production_capacity", "ظرفیت عملیاتی", "Operating Capacity", "TEXT"),
    f("power_rating", "توان نامی", "Power Rating", "DECIMAL", { unit: "KW" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("underground_or_surface", "محیط عملیاتی", "Operating Environment", "SELECT", { options: ["روباز", "زیرزمینی", "هر دو"] }),
  ]},
  { slug: "forestry", label: "Forestry Machinery (General)", required: ["equipment_type", "forestry_application"], fields: [
    f("equipment_type", "نوع ماشین جنگلداری", "Equipment Type", "TEXT"),
    f("forestry_application", "کاربرد جنگلداری", "Forestry Application", "MULTI_SELECT", { options: ["قطع درخت", "هرس", "جمع‌آوری", "حمل الوار", "آماده‌سازی زمین"] }),
    f("working_reach", "برد کاری", "Working Reach", "DECIMAL", { unit: "M" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("machine_configuration", "پیکربندی", "Machine Configuration", "TEXT"),
  ]},
  { slug: "other-road-construction", label: "Other Road Construction Machinery", required: ["equipment_type"], fields: [
    f("equipment_type", "نوع ماشین راهسازی", "Equipment Type", "TEXT", { searchable: true }),
    f("working_capacity", "ظرفیت کاری", "Working Capacity", "TEXT"),
    f("working_width", "عرض کاری", "Working Width", "DECIMAL", { unit: "M" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("operating_hours", "ساعت کارکرد", "Operating Hours", "INTEGER", { unit: "HOUR" }),
  ]},
  { slug: "other-conveying", label: "Other Conveying Equipment", required: ["conveyor_type"], fields: [
    f("conveyor_type", "نوع سامانه انتقال", "Conveying Equipment Type", "TEXT"),
    f("rated_capacity", "ظرفیت انتقال", "Rated Capacity", "DECIMAL", { unit: "T/H" }),
    f("conveying_distance", "مسافت انتقال", "Conveying Distance", "DECIMAL", { unit: "M" }),
    f("drive_power", "توان محرک", "Drive Power", "DECIMAL", { unit: "KW" }),
    f("material_handled", "نوع مواد قابل انتقال", "Material Handled", "TEXT"),
  ]},
  { slug: "other-recycling", label: "Other Recycling Machinery", required: ["equipment_type"], fields: [
    f("equipment_type", "نوع ماشین بازیافت", "Equipment Type", "TEXT"),
    f("material_stream", "نوع مواد", "Material Stream", "TEXT"),
    f("processing_capacity", "ظرفیت فرآوری", "Processing Capacity", "DECIMAL", { unit: "T/H" }),
    f("installed_power", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
    f("output_product", "محصول خروجی", "Output Product", "TEXT"),
  ]},
  { slug: "other-industrial-equipment", label: "Other Industrial Equipment", required: ["equipment_type"], fields: [
    f("equipment_type", "نوع تجهیز صنعتی", "Equipment Type", "TEXT", { searchable: true }),
    f("rated_capacity", "ظرفیت نامی", "Rated Capacity", "TEXT"),
    f("power_rating", "توان نامی", "Power Rating", "DECIMAL", { unit: "KW" }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("operating_temperature", "دمای کاری", "Operating Temperature", "TEXT"),
    f("installation_type", "نوع نصب", "Installation Type", "TEXT"),
  ]},
  { slug: "other-special-machinery", label: "Other Special Purpose Machinery", required: ["machine_purpose"], fields: [
    f("machine_purpose", "کاربری تخصصی", "Machine Purpose", "TEXT", { searchable: true }),
    f("machine_configuration", "پیکربندی", "Machine Configuration", "LONG_TEXT"),
    f("rated_capacity", "ظرفیت نامی", "Rated Capacity", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
    f("compliance_standards", "استانداردهای انطباق", "Compliance Standards", "TEXT"),
  ]},
  { slug: "livestock-equipment", label: "Livestock Equipment", required: ["equipment_type", "animal_capacity"], fields: [
    f("equipment_type", "نوع تجهیزات دامپروری", "Equipment Type", "TEXT"),
    f("animal_type", "نوع دام", "Animal Type", "MULTI_SELECT", { options: ["گاو", "گوسفند", "بز", "طیور", "آبزیان"] }),
    f("animal_capacity", "ظرفیت دام", "Animal Capacity", "INTEGER", { unit: "HEAD" }),
    f("throughput", "ظرفیت عملیاتی", "Throughput", "TEXT"),
    f("automation_level", "سطح اتوماسیون", "Automation Level", "SELECT", { options: ["دستی", "نیمه‌خودکار", "تمام‌خودکار"] }),
    f("power_rating", "توان مصرفی", "Power Rating", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "greenhouse-equipment", label: "Greenhouse Equipment", required: ["equipment_type", "coverage_area"], fields: [
    f("equipment_type", "نوع تجهیزات گلخانه", "Equipment Type", "TEXT"),
    f("coverage_area", "مساحت تحت پوشش", "Coverage Area", "DECIMAL", { unit: "M2" }),
    f("climate_control", "کنترل اقلیم", "Climate Control", "MULTI_SELECT", { options: ["دما", "رطوبت", "تهویه", "CO2", "نور"] }),
    f("automation_level", "سطح اتوماسیون", "Automation Level", "SELECT", { options: ["دستی", "نیمه‌خودکار", "هوشمند"] }),
    f("power_rating", "توان مصرفی", "Power Rating", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "garden-equipment", label: "Garden & Grounds Equipment", required: ["equipment_type"], fields: [
    f("equipment_type", "نوع تجهیزات باغداری", "Equipment Type", "TEXT"),
    f("working_width", "عرض کاری", "Working Width", "DECIMAL", { unit: "M" }),
    f("working_capacity", "ظرفیت کاری", "Working Capacity", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "SELECT", { options: ["بنزینی", "دیزلی", "برقی", "باتری", "PTO"] }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "other-agriculture", label: "Other Agricultural Equipment", required: ["equipment_type"], fields: [
    f("equipment_type", "نوع تجهیزات کشاورزی", "Equipment Type", "TEXT"),
    f("agricultural_operation", "عملیات کشاورزی", "Agricultural Operation", "MULTI_SELECT", { options: ["خاک‌ورزی", "کاشت", "داشت", "برداشت", "آبیاری", "دامپروری"] }),
    f("working_width", "عرض کاری", "Working Width", "DECIMAL", { unit: "M" }),
    f("required_power", "توان موردنیاز", "Required Power", "DECIMAL", { unit: "HP" }),
    f("capacity", "ظرفیت", "Capacity", "TEXT"),
  ]},

  { slug: "diesel-forklift", label: "Diesel Forklift", required: ["rated_lifting_capacity_kg", "lift_height", "load_center"], fields: [
    f("rated_lifting_capacity_kg", "ظرفیت باربرداری", "Rated Capacity", "DECIMAL", { unit: "KG", filterable: true, card: true }),
    f("load_center", "مرکز بار", "Load Center", "DECIMAL", { unit: "MM" }),
    f("lift_height", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "M", filterable: true }),
    f("mast_type", "نوع دکل", "Mast Type", "TEXT"),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("fuel_tank_capacity", "ظرفیت مخزن سوخت", "Fuel Tank Capacity", "DECIMAL", { unit: "L" }),
    f("transmission_type", "نوع گیربکس", "Transmission Type", "TEXT"),
    f("tire_type", "نوع تایر", "Tire Type", "SELECT", { options: ["بادی", "سوپرالاستیک"] }),
  ]},
  { slug: "electric-forklift", label: "Electric Forklift", required: ["rated_lifting_capacity_kg", "lift_height", "battery_voltage"], fields: [
    f("rated_lifting_capacity_kg", "ظرفیت باربرداری", "Rated Capacity", "DECIMAL", { unit: "KG", filterable: true, card: true }),
    f("load_center", "مرکز بار", "Load Center", "DECIMAL", { unit: "MM" }),
    f("lift_height", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "M" }),
    f("battery_voltage", "ولتاژ باتری", "Battery Voltage", "INTEGER", { unit: "V" }),
    f("battery_capacity", "ظرفیت باتری", "Battery Capacity", "DECIMAL", { unit: "KWH" }),
    f("charger_type", "نوع شارژر", "Charger Type", "TEXT"),
    f("motor_type", "نوع موتور محرک", "Drive Motor Type", "SELECT", { options: ["AC", "DC"] }),
    f("turning_radius", "شعاع گردش", "Turning Radius", "DECIMAL", { unit: "M" }),
  ]},
  { slug: "lpg-forklift", label: "LPG Forklift", required: ["rated_lifting_capacity_kg", "lift_height", "load_center"], fields: [
    f("rated_lifting_capacity_kg", "ظرفیت باربرداری", "Rated Capacity", "DECIMAL", { unit: "KG", filterable: true }),
    f("load_center", "مرکز بار", "Load Center", "DECIMAL", { unit: "MM" }),
    f("lift_height", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "M" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("lpg_cylinder_capacity", "ظرفیت کپسول LPG", "LPG Cylinder Capacity", "DECIMAL", { unit: "KG" }),
    f("mast_type", "نوع دکل", "Mast Type", "TEXT"),
    f("tire_type", "نوع تایر", "Tire Type", "SELECT", { options: ["بادی", "سوپرالاستیک"] }),
  ]},
  { slug: "gasoline-forklift", label: "Gasoline Forklift", required: ["rated_lifting_capacity_kg", "lift_height"], fields: [
    f("rated_lifting_capacity_kg", "ظرفیت باربرداری", "Rated Capacity", "DECIMAL", { unit: "KG", filterable: true }),
    f("load_center", "مرکز بار", "Load Center", "DECIMAL", { unit: "MM" }),
    f("lift_height", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "M" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("fuel_tank_capacity", "ظرفیت مخزن سوخت", "Fuel Tank Capacity", "DECIMAL", { unit: "L" }),
    f("emission_standard", "استاندارد آلایندگی", "Emission Standard", "TEXT"),
  ]},
  { slug: "heavy-duty-forklift", label: "Heavy Duty Forklift", required: ["lifting_capacity", "load_center", "lift_height"], fields: [
    f("lifting_capacity", "ظرفیت باربرداری", "Rated Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("load_center", "مرکز بار", "Load Center", "DECIMAL", { unit: "MM" }),
    f("lift_height", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "M" }),
    f("mast_type", "نوع دکل", "Mast Type", "TEXT"),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("axle_load", "بار محوری", "Axle Load", "DECIMAL", { unit: "TON" }),
    f("tire_size", "سایز تایر", "Tire Size", "TEXT"),
  ]},
  { slug: "rough-terrain-forklift", label: "Rough Terrain Forklift", required: ["rated_lifting_capacity_kg", "gradeability", "four_wheel_drive"], fields: [
    f("rated_lifting_capacity_kg", "ظرفیت باربرداری", "Rated Capacity", "DECIMAL", { unit: "KG", filterable: true }),
    f("lift_height", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "M" }),
    f("gradeability", "قابلیت عبور از شیب", "Gradeability", "DECIMAL", { unit: "%" }),
    f("four_wheel_drive", "چهارچرخ محرک", "Four Wheel Drive", "BOOLEAN"),
    f("ground_clearance_mm", "فاصله از زمین", "Ground Clearance", "DECIMAL", { unit: "MM" }),
    f("tire_type", "نوع تایر", "Tire Type", "TEXT"),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "side-loader-forklift", label: "Side Loader Forklift", required: ["lifting_capacity", "load_length"], fields: [
    f("lifting_capacity", "ظرفیت باربرداری", "Rated Capacity", "DECIMAL", { unit: "TON", filterable: true }),
    f("load_length", "حداکثر طول بار", "Maximum Load Length", "DECIMAL", { unit: "M" }),
    f("lift_height", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "M" }),
    f("aisle_width_m", "عرض راهرو", "Aisle Width", "DECIMAL", { unit: "M" }),
    f("fork_length", "طول شاخک", "Fork Length", "DECIMAL", { unit: "MM" }),
    f("drive_type", "نوع محرک", "Drive Type", "TEXT"),
  ]},
  { slug: "container-forklift", label: "Container Forklift", required: ["lifting_capacity", "container_size", "lift_height"], fields: [
    f("lifting_capacity", "ظرفیت باربرداری", "Rated Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("container_size", "ابعاد کانتینر", "Container Size", "MULTI_SELECT", { options: ["20ft", "40ft", "45ft"] }),
    f("lift_height", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "M" }),
    f("spreader_type", "نوع اسپریدر", "Spreader Type", "TEXT"),
    f("stacking_rows", "تعداد ردیف چیدمان", "Stacking Rows", "INTEGER"),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "grapple", label: "Grapple Attachment", required: ["grapple_capacity", "opening_width"], fields: [
    f("grapple_capacity", "ظرفیت گیرش", "Grapple Capacity", "DECIMAL", { unit: "KG" }),
    f("opening_width", "عرض بازشدگی", "Opening Width", "DECIMAL", { unit: "MM", filterable: true }),
    f("jaw_type", "نوع فک", "Jaw Type", "SELECT", { options: ["چنگکی", "چندشاخه", "چوب‌گیر", "ضایعات"] }),
    f("rotation", "قابلیت چرخش", "Rotation", "SELECT", { options: ["ثابت", "چرخش 360 درجه"] }),
    f("hydraulic_flow", "دبی هیدرولیک", "Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("attachment_weight", "وزن متعلقه", "Attachment Weight", "DECIMAL", { unit: "KG" }),
  ]},
  { slug: "auger", label: "Auger Attachment", required: ["drilling_diameter", "torque"], fields: [
    f("drilling_diameter", "قطر حفاری", "Drilling Diameter", "DECIMAL", { unit: "MM", filterable: true }),
    f("torque", "گشتاور", "Torque", "DECIMAL", { unit: "NM" }),
    f("rotation_speed", "سرعت چرخش", "Rotation Speed", "DECIMAL", { unit: "RPM" }),
    f("auger_length", "طول اوگر", "Auger Length", "DECIMAL", { unit: "M" }),
    f("drive_type", "نوع محرک", "Drive Type", "SELECT", { options: ["هیدرولیک", "مکانیکی"] }),
    f("host_machine_class", "کلاس ماشین میزبان", "Host Machine Class", "TEXT"),
  ]},
  { slug: "ripper", label: "Ripper Attachment", required: ["shank_count", "working_depth_mm"], fields: [
    f("shank_count", "تعداد ناخن", "Shank Count", "INTEGER"),
    f("working_depth_mm", "عمق کاری", "Working Depth", "DECIMAL", { unit: "MM" }),
    f("working_width_mm", "عرض کاری", "Working Width", "DECIMAL", { unit: "MM" }),
    f("tooth_type", "نوع ناخن", "Tooth Type", "TEXT"),
    f("host_machine_weight", "وزن ماشین میزبان", "Host Machine Weight", "TEXT"),
    f("attachment_weight", "وزن متعلقه", "Attachment Weight", "DECIMAL", { unit: "KG" }),
  ]},
  { slug: "fork", label: "Fork Attachment", required: ["rated_capacity", "fork_length"], fields: [
    f("rated_capacity", "ظرفیت بار نامی", "Rated Capacity", "DECIMAL", { unit: "KG", filterable: true }),
    f("fork_length", "طول شاخک", "Fork Length", "DECIMAL", { unit: "MM" }),
    f("fork_width", "عرض شاخک", "Fork Width", "DECIMAL", { unit: "MM" }),
    f("fork_thickness", "ضخامت شاخک", "Fork Thickness", "DECIMAL", { unit: "MM" }),
    f("carriage_class", "کلاس کالسکه", "Carriage Class", "TEXT"),
    f("fork_section", "مقطع شاخک", "Fork Section", "TEXT"),
  ]},
  { slug: "quick-coupler", label: "Quick Coupler", required: ["coupler_type", "pin_diameter"], fields: [
    f("coupler_type", "نوع کوپلر", "Coupler Type", "SELECT", { options: ["مکانیکی", "هیدرولیکی", "نیمه‌خودکار"] }),
    f("pin_diameter", "قطر پین", "Pin Diameter", "DECIMAL", { unit: "MM" }),
    f("pin_center_distance", "فاصله مرکز پین", "Pin Center Distance", "DECIMAL", { unit: "MM" }),
    f("machine_class", "کلاس ماشین", "Machine Class", "TEXT"),
    f("safety_lock", "قفل ایمنی", "Safety Lock", "BOOLEAN"),
    f("hydraulic_pressure", "فشار هیدرولیک", "Hydraulic Pressure", "DECIMAL", { unit: "BAR" }),
  ]},
  { slug: "blade", label: "Blade Attachment", required: ["blade_width", "blade_type"], fields: [
    f("blade_type", "نوع تیغه", "Blade Type", "SELECT", { options: ["مستقیم", "زاویه‌دار", "شش‌جهته", "U شکل", "S شکل"] }),
    f("blade_width", "عرض تیغه", "Blade Width", "DECIMAL", { unit: "M", filterable: true }),
    f("blade_height", "ارتفاع تیغه", "Blade Height", "DECIMAL", { unit: "M" }),
    f("blade_angle", "زاویه تیغه", "Blade Angle", "DECIMAL", { unit: "DEG" }),
    f("blade_tilt", "زاویه انحراف", "Blade Tilt", "DECIMAL", { unit: "DEG" }),
    f("host_machine_class", "کلاس ماشین میزبان", "Host Machine Class", "TEXT"),
  ]},
  { slug: "shear", label: "Hydraulic Shear", required: ["cutting_force", "jaw_opening"], fields: [
    f("cutting_force", "نیروی برش", "Cutting Force", "DECIMAL", { unit: "KN" }),
    f("jaw_opening", "دهانه فک", "Jaw Opening", "DECIMAL", { unit: "MM" }),
    f("cutting_capacity", "ظرفیت برش", "Cutting Capacity", "TEXT"),
    f("rotation", "چرخش", "Rotation", "SELECT", { options: ["ثابت", "360 درجه"] }),
    f("hydraulic_flow", "دبی هیدرولیک", "Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
  ]},
  { slug: "pulverizer", label: "Pulverizer Attachment", required: ["jaw_opening", "crushing_force"], fields: [
    f("jaw_opening", "دهانه فک", "Jaw Opening", "DECIMAL", { unit: "MM" }),
    f("crushing_force", "نیروی خردایش", "Crushing Force", "DECIMAL", { unit: "KN" }),
    f("cycle_time", "زمان سیکل", "Cycle Time", "DECIMAL", { unit: "S" }),
    f("rotation", "چرخش", "Rotation", "SELECT", { options: ["ثابت", "360 درجه"] }),
    f("hydraulic_flow", "دبی هیدرولیک", "Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
  ]},

  { slug: "tractor-truck", label: "Tractor Truck", required: ["gross_vehicle_weight", "engine_power_kw", "axle_configuration"], fields: [
    f("gross_vehicle_weight", "وزن ناخالص مجاز", "Gross Vehicle Weight", "DECIMAL", { unit: "TON", filterable: true }),
    f("gross_combination_weight", "وزن ناخالص ترکیبی", "Gross Combination Weight", "DECIMAL", { unit: "TON" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("engine_torque", "گشتاور موتور", "Engine Torque", "DECIMAL", { unit: "NM" }),
    f("axle_configuration", "آرایش محورها", "Axle Configuration", "SELECT", { options: ["4x2", "4x4", "6x2", "6x4", "6x6", "8x4"] }),
    f("transmission_type", "نوع گیربکس", "Transmission Type", "TEXT"),
    f("fifth_wheel_capacity", "ظرفیت ففت‌ویل", "Fifth Wheel Capacity", "DECIMAL", { unit: "TON" }),
    f("fuel_tank_capacity", "ظرفیت مخزن سوخت", "Fuel Tank Capacity", "DECIMAL", { unit: "L" }),
  ]},
  { slug: "trailer", label: "Trailer", required: ["payload_capacity", "axle_count", "deck_length"], fields: [
    f("trailer_type", "نوع تریلر", "Trailer Type", "SELECT", { options: ["کفی", "لبه‌دار", "کمپرسی", "کمرشکن", "تانکری", "یخچالی", "کانتینربر"] }),
    f("payload_capacity", "ظرفیت بار مفید", "Payload Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("axle_count", "تعداد محور", "Axle Count", "INTEGER"),
    f("deck_length", "طول بارگیر", "Deck Length", "DECIMAL", { unit: "M" }),
    f("deck_width", "عرض بارگیر", "Deck Width", "DECIMAL", { unit: "M" }),
    f("suspension_type", "نوع تعلیق", "Suspension Type", "TEXT"),
    f("brake_system", "سیستم ترمز", "Brake System", "TEXT"),
    f("kingpin_size", "سایز کینگ‌پین", "Kingpin Size", "TEXT"),
  ]},
  { slug: "semi-trailer", label: "Semi Trailer", required: ["payload_capacity", "axle_count", "kingpin_capacity"], fields: [
    f("semi_trailer_type", "نوع نیم‌تریلر", "Semi Trailer Type", "SELECT", { options: ["کفی", "بوژی", "کمرشکن", "تانکر", "کمپرسی", "کانتینربر", "یخچالی"] }),
    f("payload_capacity", "ظرفیت بار مفید", "Payload Capacity", "DECIMAL", { unit: "TON", filterable: true }),
    f("axle_count", "تعداد محور", "Axle Count", "INTEGER"),
    f("kingpin_capacity", "ظرفیت کینگ‌پین", "Kingpin Capacity", "DECIMAL", { unit: "TON" }),
    f("deck_length", "طول بارگیر", "Deck Length", "DECIMAL", { unit: "M" }),
    f("deck_width", "عرض بارگیر", "Deck Width", "DECIMAL", { unit: "M" }),
    f("suspension_type", "نوع تعلیق", "Suspension Type", "TEXT"),
    f("brake_system", "سیستم ترمز", "Brake System", "TEXT"),
  ]},
  { slug: "pickup", label: "Pickup Truck", required: ["payload_capacity", "engine_power_kw", "drive_configuration"], fields: [
    f("payload_capacity", "ظرفیت بار مفید", "Payload Capacity", "DECIMAL", { unit: "KG", filterable: true }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("engine_torque", "گشتاور موتور", "Engine Torque", "DECIMAL", { unit: "NM" }),
    f("drive_configuration", "آرایش محرک", "Drive Configuration", "SELECT", { options: ["4x2", "4x4"] }),
    f("cab_type", "نوع کابین", "Cab Type", "SELECT", { options: ["تک‌کابین", "دوکابین"] }),
    f("bed_length", "طول اتاق بار", "Cargo Bed Length", "DECIMAL", { unit: "MM" }),
    f("fuel_type", "نوع سوخت", "Fuel Type", "SELECT", { options: ["بنزین", "دیزل", "هیبریدی", "برقی"] }),
  ]},
  { slug: "bus", label: "Bus", required: ["passenger_capacity", "gross_vehicle_weight"], fields: [
    f("passenger_capacity", "ظرفیت مسافر", "Passenger Capacity", "INTEGER", { filterable: true }),
    f("gross_vehicle_weight", "وزن ناخالص مجاز", "Gross Vehicle Weight", "DECIMAL", { unit: "TON" }),
    f("bus_type", "نوع اتوبوس", "Bus Type", "SELECT", { options: ["شهری", "بین‌شهری", "گردشگری", "مینی‌بوس", "برقی"] }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("fuel_type", "نوع سوخت", "Fuel Type", "TEXT"),
    f("wheelchair_access", "دسترسی ویلچر", "Wheelchair Accessibility", "BOOLEAN"),
    f("air_conditioning", "تهویه مطبوع", "Air Conditioning", "BOOLEAN"),
  ]},
  { slug: "tanker-truck", label: "Tanker Truck", required: ["tank_volume", "tank_material", "axle_configuration"], fields: [
    f("tank_volume", "حجم مخزن", "Tank Volume", "DECIMAL", { unit: "L", filterable: true, card: true }),
    f("tank_material", "جنس مخزن", "Tank Material", "SELECT", { options: ["فولاد کربنی", "استنلس استیل", "آلومینیوم", "کامپوزیت"] }),
    f("compartment_count", "تعداد محفظه", "Compartment Count", "INTEGER"),
    f("axle_configuration", "آرایش محورها", "Axle Configuration", "TEXT"),
    f("pump_system", "سامانه پمپاژ", "Pump System", "BOOLEAN"),
    f("product_type", "نوع محموله", "Product Type", "TEXT"),
    f("gross_vehicle_weight", "وزن ناخالص مجاز", "Gross Vehicle Weight", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "refrigerated-truck", label: "Refrigerated Truck", required: ["cargo_volume", "temperature_range"], fields: [
    f("cargo_volume", "حجم محفظه بار", "Cargo Volume", "DECIMAL", { unit: "M3" }),
    f("temperature_range", "محدوده دمایی", "Temperature Range", "TEXT", { filterable: true }),
    f("refrigeration_unit_brand", "برند یونیت سرمایشی", "Refrigeration Unit Brand", "TEXT"),
    f("refrigeration_capacity", "ظرفیت سرمایش", "Refrigeration Capacity", "DECIMAL", { unit: "KW" }),
    f("insulation_thickness", "ضخامت عایق", "Insulation Thickness", "DECIMAL", { unit: "MM" }),
    f("gross_vehicle_weight", "وزن ناخالص مجاز", "Gross Vehicle Weight", "DECIMAL", { unit: "TON" }),
    f("axle_configuration", "آرایش محورها", "Axle Configuration", "TEXT"),
  ]},
  { slug: "other-vehicles", label: "Other Commercial Vehicles", required: ["vehicle_type"], fields: [
    f("vehicle_type", "نوع وسیله نقلیه", "Vehicle Type", "TEXT"),
    f("gross_vehicle_weight", "وزن ناخالص مجاز", "Gross Vehicle Weight", "DECIMAL", { unit: "TON" }),
    f("payload_capacity", "ظرفیت بار مفید", "Payload Capacity", "DECIMAL", { unit: "TON" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("axle_configuration", "آرایش محورها", "Axle Configuration", "TEXT"),
    f("fuel_type", "نوع سوخت", "Fuel Type", "TEXT"),
  ]},
  { slug: "agricultural", label: "Agricultural Machinery (General)", required: ["equipment_type", "agricultural_operation"], fields: [
    f("equipment_type", "نوع ماشین کشاورزی", "Equipment Type", "TEXT"),
    f("agricultural_operation", "عملیات کشاورزی", "Agricultural Operation", "MULTI_SELECT", { options: ["خاک‌ورزی", "کاشت", "داشت", "برداشت", "آبیاری", "دامپروری"] }),
    f("working_width", "عرض کاری", "Working Width", "DECIMAL", { unit: "M" }),
    f("required_power", "توان موردنیاز", "Required Power", "DECIMAL", { unit: "HP" }),
    f("capacity", "ظرفیت", "Capacity", "TEXT"),
    f("hitch_type", "نوع اتصال", "Hitch Type", "TEXT"),
  ]},
  { slug: "other-attachments", label: "Other Attachments", required: ["attachment_type"], fields: [
    f("attachment_type", "نوع متعلقه", "Attachment Type", "TEXT"),
    f("host_machine_type", "نوع ماشین میزبان", "Host Machine Type", "TEXT"),
    f("host_machine_weight_range", "محدوده وزن ماشین میزبان", "Host Machine Weight Range", "TEXT"),
    f("working_capacity", "ظرفیت کاری", "Working Capacity", "TEXT"),
    f("hydraulic_flow", "دبی هیدرولیک", "Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("attachment_weight", "وزن متعلقه", "Attachment Weight", "DECIMAL", { unit: "KG" }),
  ]},

  { slug: "transport-vehicle", label: "Transport Vehicle", required: ["vehicle_configuration", "gross_vehicle_weight"], fields: [
    f("vehicle_configuration", "پیکربندی وسیله نقلیه", "Vehicle Configuration", "TEXT"),
    f("gross_vehicle_weight", "وزن ناخالص مجاز", "Gross Vehicle Weight", "DECIMAL", { unit: "TON", filterable: true }),
    f("payload_capacity", "ظرفیت بار مفید", "Payload Capacity", "DECIMAL", { unit: "TON" }),
    f("axle_configuration", "آرایش محورها", "Axle Configuration", "TEXT"),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("fuel_type", "نوع سوخت", "Fuel Type", "TEXT"),
    f("body_type", "نوع اتاق/کاربری", "Body Type", "TEXT"),
  ]},
  { slug: "specialized-vehicle", label: "Specialized Vehicle", required: ["specialized_application", "gross_vehicle_weight"], fields: [
    f("specialized_application", "کاربری تخصصی", "Specialized Application", "TEXT", { searchable: true }),
    f("gross_vehicle_weight", "وزن ناخالص مجاز", "Gross Vehicle Weight", "DECIMAL", { unit: "TON" }),
    f("payload_capacity", "ظرفیت بار/تجهیزات", "Payload or Equipment Capacity", "TEXT"),
    f("body_configuration", "پیکربندی بدنه", "Body Configuration", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
    f("axle_configuration", "آرایش محورها", "Axle Configuration", "TEXT"),
    f("compliance_standards", "استانداردهای تخصصی", "Specialist Compliance", "TEXT"),
  ]},
  { slug: "other-machinery", label: "Other Machinery", required: ["machine_type", "technical_description"], fields: [
    f("machine_type", "نوع ماشین‌آلات", "Machine Type", "TEXT", { searchable: true }),
    f("technical_description", "شرح مشخصات فنی", "Technical Description", "LONG_TEXT"),
    f("operating_capacity", "ظرفیت عملیاتی", "Operating Capacity", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("overall_dimensions", "ابعاد کلی", "Overall Dimensions", "TEXT"),
  ]},
];


function cloneTemplate(
  sourceSlug: string,
  slug: string,
  label: string,
  required?: string[],
  extraFields: Field[] = [],
): Template {
  const source = templates.find((template) => template.slug === sourceSlug);
  if (!source) throw new Error(`Cannot clone missing source template: ${sourceSlug}`);
  const fields = [...source.fields];
  for (const field of extraFields) {
    if (!fields.some((existing) => existing.key === field.key)) fields.push(field);
  }
  return {
    slug,
    label,
    required: required ?? source.required,
    fields,
  };
}

// Canonical 16-family machine tree: exact L3 forms add subtype-specific fields
// to the shared L2 family fields. L2 terminal categories receive full forms.
templates.push(
  cloneTemplate("long-reach", "excavator-long-reach", "Long Reach Excavator", ["boom_reach", "max_digging_depth"]),
  cloneTemplate("mining-excavator-machine", "excavator-mining", "Mining Excavator", ["operating_weight", "bucket_capacity", "payload_capacity"]),
  cloneTemplate("excavator-chain", "excavator-demolition", "Demolition Excavator", ["demolition_reach", "hydraulic_flow"], [
    f("demolition_reach", "برد کاری تخریب", "Demolition Reach", "DECIMAL", { unit: "M" }),
    f("hydraulic_flow", "دبی هیدرولیک متعلقات", "Attachment Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("hydraulic_pressure", "فشار هیدرولیک متعلقات", "Attachment Hydraulic Pressure", "DECIMAL", { unit: "BAR" }),
    f("cab_falling_object_protection", "حفاظت کابین در برابر سقوط اجسام", "Falling Object Protection", "BOOLEAN"),
  ]),
  cloneTemplate("excavator-wheel", "excavator-material-handling", "Material Handling Excavator", ["material_handler_reach", "grapple_capacity"], [
    f("material_handler_reach", "برد بوم جابه‌جایی مواد", "Material Handler Reach", "DECIMAL", { unit: "M" }),
    f("grapple_capacity", "ظرفیت گراپل", "Grapple Capacity", "DECIMAL", { unit: "KG" }),
    f("cab_elevation", "ارتفاع کابین", "Cab Elevation", "DECIMAL", { unit: "M" }),
    f("undercarriage_stabilizer", "پایه تثبیت شاسی", "Undercarriage Stabilizer", "BOOLEAN"),
  ]),
  cloneTemplate("excavator-chain", "excavator-spider", "Spider Excavator", ["maximum_working_slope", "leg_stabilization"], [
    f("maximum_working_slope", "حداکثر شیب کاری", "Maximum Working Slope", "DECIMAL", { unit: "DEG" }),
    f("leg_stabilization", "پایه‌های تثبیت مستقل", "Independent Leg Stabilization", "BOOLEAN"),
    f("leg_count", "تعداد پایه‌های متحرک", "Articulated Leg Count", "INTEGER"),
    f("terrain_clearance", "فاصله از سطح ناهموار", "Terrain Clearance", "DECIMAL", { unit: "MM" }),
  ]),
  cloneTemplate("excavator-chain", "excavator-zero-tail-swing", "Zero Tail Swing Excavator", ["tail_swing_radius", "overall_width_mm"], [
    f("tail_swing_radius", "شعاع گردش انتهای دستگاه", "Tail Swing Radius", "DECIMAL", { unit: "MM" }),
    f("overall_width_mm", "عرض کلی", "Overall Width", "DECIMAL", { unit: "MM" }),
    f("counterweight_profile", "پروفیل وزنه تعادل", "Counterweight Profile", "SELECT", { options: ["Zero Tail", "Reduced Tail", "Conventional"] }),
  ]),
  cloneTemplate("long-reach", "excavator-long-radius", "Long Radius Excavator", ["boom_reach", "max_digging_depth"]),
  cloneTemplate("long-reach", "excavator-telescopic", "Telescopic Boom Excavator", ["telescopic_reach", "max_digging_depth"], [
    f("telescopic_reach", "برد بازوی تلسکوپی", "Telescopic Reach", "DECIMAL", { unit: "M" }),
    f("telescopic_sections", "تعداد قطعات تلسکوپی", "Telescopic Sections", "INTEGER"),
    f("extension_system", "سامانه افزایش طول", "Extension System", "SELECT", { options: ["هیدرولیکی", "مکانیکی"] }),
  ]),
  cloneTemplate("other-machinery", "excavator-special", "Special Configuration Excavator", ["machine_type", "technical_description"], [
    f("base_excavator_type", "نوع پایه بیل", "Base Excavator Type", "TEXT"),
    f("special_conversion", "تبدیل تخصصی", "Special Conversion", "LONG_TEXT"),
  ]),

  cloneTemplate("compact-track-loader", "compact-loader", "Compact Loader", ["rated_operating_capacity", "operating_weight"]),
  cloneTemplate("wheel-loader", "industrial-loader", "Industrial Wheel Loader", ["bucket_capacity", "rated_operating_capacity"], [
    f("duty_class", "کلاس کاری", "Duty Class", "SELECT", { options: ["سبک", "متوسط", "سنگین", "پیوسته"] }),
    f("cycle_time", "زمان سیکل بارگیری", "Loading Cycle Time", "DECIMAL", { unit: "S" }),
    f("tire_type", "نوع تایر", "Tire Type", "TEXT"),
  ]),
  cloneTemplate("mining-loader", "underground-loader", "Underground Loader", ["bucket_capacity", "payload_capacity"], [
    f("machine_width", "عرض دستگاه", "Machine Width", "DECIMAL", { unit: "MM" }),
    f("machine_height", "ارتفاع دستگاه", "Machine Height", "DECIMAL", { unit: "MM" }),
    f("articulation_angle", "زاویه مفصل", "Articulation Angle", "DECIMAL", { unit: "DEG" }),
    f("low_profile_design", "طراحی کم‌ارتفاع", "Low Profile Design", "BOOLEAN"),
  ]),
  cloneTemplate("wheel-loader", "multi-purpose-loader", "Multi-purpose Loader", ["bucket_capacity", "attachment_mount"], [
    f("attachment_mount", "استاندارد اتصال متعلقات", "Attachment Mount", "TEXT"),
    f("auxiliary_hydraulic_circuit", "مدار هیدرولیک کمکی", "Auxiliary Hydraulic Circuit", "BOOLEAN"),
    f("quick_coupler", "کوپلر سریع", "Quick Coupler", "BOOLEAN"),
  ]),

  // Bulldozer variants inherit the common bulldozer family fields.
  { slug: "dozer-track", label: "Track Bulldozer", required: ["track_shoe_width", "blade_width"], fields: [
    f("track_shoe_width", "عرض کفشک زنجیر", "Track Shoe Width", "DECIMAL", { unit: "MM" }),
    f("blade_width", "عرض تیغه", "Blade Width", "DECIMAL", { unit: "M" }),
    f("ground_pressure", "فشار بر زمین", "Ground Pressure", "DECIMAL", { unit: "KPA" }),
    f("drawbar_pull", "نیروی کشش", "Drawbar Pull", "DECIMAL", { unit: "KN" }),
  ]},
  { slug: "dozer-wheel", label: "Wheel Bulldozer", required: ["blade_width", "tire_size"], fields: [
    f("blade_width", "عرض تیغه", "Blade Width", "DECIMAL", { unit: "M" }),
    f("tire_size", "سایز تایر", "Tire Size", "TEXT"),
    f("axle_count", "تعداد محور", "Axle Count", "INTEGER"),
    f("travel_speed", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "KMH" }),
  ]},
  { slug: "mini-dozer", label: "Mini Bulldozer", required: ["operating_weight", "blade_width"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("blade_width", "عرض تیغه", "Blade Width", "DECIMAL", { unit: "M" }),
    f("transport_width", "عرض حمل", "Transport Width", "DECIMAL", { unit: "M" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "heavy-dozer", label: "Heavy Bulldozer", required: ["operating_weight", "blade_capacity"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("blade_capacity", "ظرفیت تیغه", "Blade Capacity", "DECIMAL", { unit: "M3" }),
    f("drawbar_pull", "نیروی کشش", "Drawbar Pull", "DECIMAL", { unit: "KN" }),
    f("ripper_force", "نیروی ریپر", "Ripper Force", "DECIMAL", { unit: "KN" }),
  ]},
  { slug: "mining-dozer", label: "Mining Bulldozer", required: ["ground_pressure", "blade_capacity"], fields: [
    f("ground_pressure", "فشار بر زمین", "Ground Pressure", "DECIMAL", { unit: "KPA" }),
    f("blade_capacity", "ظرفیت تیغه", "Blade Capacity", "DECIMAL", { unit: "M3" }),
    f("ripper_force", "نیروی ریپر", "Ripper Force", "DECIMAL", { unit: "KN" }),
    f("heavy_duty_undercarriage", "زیربندی معدن", "Heavy Duty Undercarriage", "BOOLEAN"),
  ]},
  { slug: "pipe-dozer", label: "Pipeline Dozer", required: ["side_boom_capacity", "pipe_diameter_range"], fields: [
    f("side_boom_capacity", "ظرفیت بوم جانبی", "Side Boom Capacity", "DECIMAL", { unit: "TON" }),
    f("pipe_diameter_range", "محدوده قطر لوله", "Pipe Diameter Range", "TEXT"),
    f("side_boom_reach", "برد بوم جانبی", "Side Boom Reach", "DECIMAL", { unit: "M" }),
    f("counterweight", "وزنه تعادل", "Counterweight", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "angle-dozer", label: "Angle Dozer", required: ["blade_width", "blade_angle"], fields: [
    f("blade_width", "عرض تیغه", "Blade Width", "DECIMAL", { unit: "M" }),
    f("blade_angle", "زاویه تیغه", "Blade Angle", "DECIMAL", { unit: "DEG" }),
    f("blade_tilt", "زاویه انحراف تیغه", "Blade Tilt", "DECIMAL", { unit: "DEG" }),
    f("blade_type", "نوع تیغه", "Blade Type", "SELECT", { options: ["مستقیم", "زاویه‌دار", "U شکل"] }),
  ]},
  { slug: "swamp-dozer", label: "Swamp / Low Ground Pressure Dozer", required: ["ground_pressure", "track_shoe_width"], fields: [
    f("ground_pressure", "فشار بر زمین", "Ground Pressure", "DECIMAL", { unit: "KPA" }),
    f("track_shoe_width", "عرض کفشک زنجیر", "Track Shoe Width", "DECIMAL", { unit: "MM" }),
    f("track_gauge", "فاصله زنجیرها", "Track Gauge", "DECIMAL", { unit: "M" }),
    f("flotation_configuration", "پیکربندی شناوری", "Flotation Configuration", "TEXT"),
  ]},

  // Motor grader family and its six distinct configurations.
  { slug: "motor-grader", label: "Motor Grader", required: ["moldboard_width", "engine_power_kw"], fields: [
    f("moldboard_width", "عرض تیغه گریدر", "Moldboard Width", "DECIMAL", { unit: "M", filterable: true }),
    f("moldboard_height", "ارتفاع تیغه", "Moldboard Height", "DECIMAL", { unit: "MM" }),
    f("circle_rotation", "زاویه چرخش دایره", "Circle Rotation", "DECIMAL", { unit: "DEG" }),
    f("articulation_angle", "زاویه مفصل", "Articulation Angle", "DECIMAL", { unit: "DEG" }),
    f("front_axle_oscillation", "نوسان محور جلو", "Front Axle Oscillation", "DECIMAL", { unit: "DEG" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  cloneTemplate("motor-grader", "compact-grader", "Compact Motor Grader", ["moldboard_width", "operating_weight"], [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("transport_width", "عرض حمل", "Transport Width", "DECIMAL", { unit: "M" }),
    f("turning_radius", "شعاع گردش", "Turning Radius", "DECIMAL", { unit: "M" }),
  ]),
  cloneTemplate("motor-grader", "heavy-grader", "Heavy Motor Grader", ["moldboard_width", "engine_power_kw"], [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("axle_load", "بار محوری", "Axle Load", "DECIMAL", { unit: "TON" }),
  ]),
  cloneTemplate("motor-grader", "mining-grader", "Mining Grader", ["moldboard_width", "ground_clearance_mm"], [
    f("ground_clearance_mm", "فاصله از زمین", "Ground Clearance", "DECIMAL", { unit: "MM" }),
    f("heavy_duty_axle", "محور تقویت‌شده", "Heavy Duty Axle", "BOOLEAN"),
  ]),
  cloneTemplate("motor-grader", "quarry-grader", "Quarry Grader", ["moldboard_width", "operating_weight"], [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("rock_guard", "محافظ سنگ", "Rock Guard", "BOOLEAN"),
    f("axle_load", "بار محوری", "Axle Load", "DECIMAL", { unit: "TON" }),
  ]),
  cloneTemplate("motor-grader", "gps-grader", "GPS / 3D Grader", ["moldboard_width", "gps_machine_control"], [
    f("gps_machine_control", "کنترل سه‌بعدی GPS", "GPS Machine Control", "BOOLEAN"),
    f("gnss_receivers", "تعداد گیرنده GNSS", "GNSS Receivers", "INTEGER"),
    f("automatic_blade_control", "کنترل خودکار تیغه", "Automatic Blade Control", "BOOLEAN"),
  ]),

  // Backhoe loader variants.
  { slug: "backhoe-loader-standard", label: "Standard Backhoe Loader", required: ["loader_bucket_capacity", "backhoe_digging_depth"], fields: [
    f("loader_bucket_capacity", "ظرفیت باکت جلو", "Loader Bucket Capacity", "DECIMAL", { unit: "M3" }),
    f("backhoe_bucket_capacity", "ظرفیت باکت عقب", "Backhoe Bucket Capacity", "DECIMAL", { unit: "M3" }),
    f("backhoe_digging_depth", "عمق حفاری عقب", "Backhoe Digging Depth", "DECIMAL", { unit: "M" }),
    f("loader_lift_capacity", "ظرفیت بالابری جلو", "Loader Lift Capacity", "DECIMAL", { unit: "KG" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("drive_configuration", "آرایش محرک", "Drive Configuration", "SELECT", { options: ["4x2", "4x4"] }),
  ]},
  cloneTemplate("backhoe-loader-standard", "backhoe-4wd", "4WD Backhoe Loader", ["loader_bucket_capacity", "backhoe_digging_depth"], [
    f("four_wheel_drive", "چهارچرخ محرک", "Four Wheel Drive", "BOOLEAN"),
    f("axle_differential_lock", "قفل دیفرانسیل", "Axle Differential Lock", "BOOLEAN"),
  ]),
  cloneTemplate("backhoe-loader-standard", "backhoe-center-mount", "Center Mount Backhoe Loader", ["loader_bucket_capacity", "backhoe_digging_depth"], [
    f("backhoe_mount", "نوع نصب بکهو", "Backhoe Mount", "SELECT", { options: ["مرکزی", "کناری"] }),
    f("swing_arc", "قوس چرخش بازو", "Swing Arc", "DECIMAL", { unit: "DEG" }),
  ]),
  cloneTemplate("backhoe-loader-standard", "backhoe-side-shift", "Side Shift Backhoe Loader", ["loader_bucket_capacity", "backhoe_digging_depth"], [
    f("side_shift_range", "محدوده جابه‌جایی جانبی", "Side Shift Range", "DECIMAL", { unit: "MM" }),
    f("stabilizer_span", "فاصله بازشدگی پایه‌ها", "Stabilizer Span", "DECIMAL", { unit: "M" }),
  ]),
  cloneTemplate("backhoe-loader-standard", "compact-backhoe", "Compact Backhoe Loader", ["loader_bucket_capacity", "backhoe_digging_depth"], [
    f("transport_width", "عرض حمل", "Transport Width", "DECIMAL", { unit: "M" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
  ]),
  cloneTemplate("backhoe-loader-standard", "industrial-backhoe", "Industrial Backhoe Loader", ["loader_bucket_capacity", "backhoe_digging_depth"], [
    f("industrial_tire_type", "نوع تایر صنعتی", "Industrial Tire Type", "TEXT"),
    f("continuous_duty_rating", "رتبه کارکرد پیوسته", "Continuous Duty Rating", "TEXT"),
  ]),

  // Scraper variants.
  cloneTemplate("scraper", "motor-scraper", "Motor Scraper", ["bowl_capacity", "rated_payload"]),
  cloneTemplate("scraper", "towed-scraper", "Towed Scraper", ["bowl_capacity", "rated_payload"], [
    f("towing_tractor_power", "توان تراکتور کشنده", "Towing Tractor Power", "DECIMAL", { unit: "KW" }),
    f("drawbar_type", "نوع اتصال کشنده", "Drawbar Type", "TEXT"),
  ]),
  cloneTemplate("scraper", "open-bowl-scraper", "Open Bowl Scraper", ["bowl_capacity", "rated_payload"], [
    f("bowl_type", "نوع جام", "Bowl Type", "SELECT", { options: ["باز", "بسته"] }),
    f("ejector_type", "نوع تخلیه‌کننده", "Ejector Type", "TEXT"),
  ]),
  cloneTemplate("scraper", "elevating-scraper", "Elevating Scraper", ["bowl_capacity", "rated_payload"], [
    f("elevator_type", "نوع الواتور", "Elevator Type", "TEXT"),
    f("elevator_speed", "سرعت الواتور", "Elevator Speed", "DECIMAL", { unit: "RPM" }),
  ]),
  cloneTemplate("scraper", "twin-engine-scraper", "Twin Engine Scraper", ["bowl_capacity", "rated_payload"], [
    f("engine_count", "تعداد موتور", "Engine Count", "INTEGER"),
    f("front_engine_power_kw", "توان موتور جلو", "Front Engine Power", "DECIMAL", { unit: "KW" }),
    f("rear_engine_power_kw", "توان موتور عقب", "Rear Engine Power", "DECIMAL", { unit: "KW" }),
  ]),
  cloneTemplate("scraper", "mining-scraper", "Mining Scraper", ["bowl_capacity", "rated_payload"], [
    f("underground_clearance", "فاصله از سقف تونل", "Underground Clearance", "DECIMAL", { unit: "M" }),
    f("low_profile_configuration", "پیکربندی کم‌ارتفاع", "Low Profile Configuration", "BOOLEAN"),
  ]),

  // Roller variants.
  cloneTemplate("single-drum-roller", "soil-roller", "Soil Compactor Roller", ["operating_weight", "drum_width"], [
    f("soil_compaction_depth", "عمق تراکم خاک", "Soil Compaction Depth", "DECIMAL", { unit: "M" }),
    f("padfoot_shell_kit", "قابلیت نصب پد‌فوت", "Padfoot Shell Kit", "BOOLEAN"),
  ]),
  cloneTemplate("double-drum-roller", "asphalt-roller", "Asphalt Tandem Roller", ["operating_weight", "working_width_mm"], [
    f("asphalt_compaction_mode", "حالت تراکم آسفالت", "Asphalt Compaction Mode", "SELECT", { options: ["ارتعاشی", "نوسانی", "استاتیک"] }),
    f("water_spray_system", "سیستم آب‌پاش درام", "Drum Water Spray System", "BOOLEAN"),
  ]),
  cloneTemplate("double-drum-roller", "combination-roller", "Combination Roller", ["operating_weight", "working_width_mm"], [
    f("front_drum_rear_tire", "درام جلو و تایر عقب", "Front Drum / Rear Tire", "BOOLEAN"),
    f("tire_count", "تعداد تایر", "Tire Count", "INTEGER"),
  ]),

  // Remaining terminal road/civil families.
  { slug: "grading-earthmoving", label: "Grading & Earthmoving Equipment", required: ["working_width", "working_capacity"], fields: [
    f("equipment_type", "نوع تجهیزات تسطیح و خاکی", "Equipment Type", "TEXT"),
    f("working_width", "عرض کاری", "Working Width", "DECIMAL", { unit: "M" }),
    f("working_depth_m", "عمق کاری", "Working Depth", "DECIMAL", { unit: "M" }),
    f("working_capacity", "ظرفیت عملیات", "Working Capacity", "TEXT"),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "piling-foundation", label: "Piling & Foundation Machinery", required: ["piling_method", "max_pile_depth"], fields: [
    f("piling_method", "روش اجرای شمع", "Piling Method", "MULTI_SELECT", { options: ["شمع‌کوبی", "حفاری اوگر", "Rotary", "CFA", "میکروپایل"] }),
    f("max_pile_depth", "حداکثر عمق شمع", "Maximum Pile Depth", "DECIMAL", { unit: "M" }),
    f("pile_diameter_range", "محدوده قطر شمع", "Pile Diameter Range", "TEXT"),
    f("crowd_force", "نیروی پیشروی", "Crowd Force", "DECIMAL", { unit: "KN" }),
    f("rotation_torque_knm", "گشتاور حفاری", "Drilling Torque", "DECIMAL", { unit: "KNM" }),
    f("mast_height", "ارتفاع دکل", "Mast Height", "DECIMAL", { unit: "M" }),
  ]},
  { slug: "site-haulage", label: "Construction Site Haulage", required: ["payload_capacity", "body_volume"], fields: [
    f("payload_capacity", "ظرفیت بار مفید", "Payload Capacity", "DECIMAL", { unit: "TON", filterable: true }),
    f("body_volume", "حجم اتاق بار", "Body Volume", "DECIMAL", { unit: "M3" }),
    f("axle_configuration", "آرایش محورها", "Axle Configuration", "TEXT"),
    f("gradeability_percent", "قابلیت عبور از شیب", "Gradeability", "DECIMAL", { unit: "%" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "multi-purpose-civil", label: "Multi-purpose Civil Machinery", required: ["machine_type", "working_capacity"], fields: [
    f("machine_type", "نوع ماشین عمرانی", "Machine Type", "TEXT"),
    f("working_capacity", "ظرفیت کاری", "Working Capacity", "TEXT"),
    f("attachment_compatibility", "سازگاری متعلقات", "Attachment Compatibility", "MULTI_SELECT", { options: ["باکت", "چنگک", "چکش", "مته", "تیغه", "شاخک"] }),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "other-civil", label: "Other Civil Engineering Machinery", required: ["machine_type", "technical_description"], fields: [
    f("machine_type", "نوع ماشین عمرانی", "Machine Type", "TEXT"),
    f("technical_description", "شرح فنی", "Technical Description", "LONG_TEXT"),
    f("working_capacity", "ظرفیت کاری", "Working Capacity", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
  ]},
);


templates.push(
  // L2 parent forms for complete inheritance into subtype leaves.
  { slug: "mining-dump-truck", label: "Mining Dump Truck Family", required: ["rated_payload_ton", "body_volume", "axle_configuration"], fields: [
    f("rated_payload_ton", "ظرفیت بار اسمی", "Rated Payload", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("body_volume", "حجم اتاق بار", "Body Volume", "DECIMAL", { unit: "M3" }),
    f("gross_vehicle_weight", "وزن ناخالص مجاز", "Gross Vehicle Weight", "DECIMAL", { unit: "TON" }),
    f("axle_configuration", "آرایش محورها", "Axle Configuration", "TEXT"),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("gradeability_percent", "قابلیت عبور از شیب", "Gradeability", "DECIMAL", { unit: "%" }),
    f("retarder_type", "نوع ریتاردر", "Retarder Type", "TEXT"),
  ]},
  { slug: "fuel-station-equipment", label: "Fuel Station Equipment Family", required: ["product_type", "certification"], fields: [
    f("product_type", "نوع فرآورده", "Fuel Product", "MULTI_SELECT", { options: ["بنزین", "گازوئیل", "نفت سفید", "سوخت هواپیما", "CNG", "AdBlue"] }),
    f("certification", "استانداردها و تأییدیه‌ها", "Certification", "TEXT"),
    f("hazardous_area_rating", "کلاس ناحیه خطرناک", "Hazardous Area Rating", "TEXT"),
    f("flow_rate", "دبی نامی", "Rated Flow Rate", "DECIMAL", { unit: "LPM" }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("installation_type", "نوع نصب", "Installation Type", "SELECT", { options: ["داخل جایگاه", "زیرزمینی", "روززمینی", "اتاق تجهیزات"] }),
  ]},

  // Mining haulage variants inherit the mining-dump-truck family fields.
  { slug: "rigid-mining-truck", label: "Rigid Mining Dump Truck", required: ["rigid_frame_type"], fields: [
    f("rigid_frame_type", "نوع شاسی صلب", "Rigid Frame Type", "TEXT"),
    f("front_axle_load", "بار محور جلو", "Front Axle Load", "DECIMAL", { unit: "TON" }),
    f("rear_axle_load", "بار محور عقب", "Rear Axle Load", "DECIMAL", { unit: "TON" }),
    f("dump_body_type", "نوع اتاق کمپرسی", "Dump Body Type", "SELECT", { options: ["استاندارد", "سنگین معدن", "گرم‌شونده"] }),
  ]},
  { slug: "articulated-mining-truck", label: "Articulated Mining Truck", required: ["articulation_angle"], fields: [
    f("articulation_angle", "زاویه مفصل", "Articulation Angle", "DECIMAL", { unit: "DEG" }),
    f("all_wheel_drive", "محرک تمام چرخ", "All Wheel Drive", "BOOLEAN"),
    f("body_volume", "حجم اتاق بار", "Body Volume", "DECIMAL", { unit: "M3" }),
    f("turning_radius", "شعاع گردش", "Turning Radius", "DECIMAL", { unit: "M" }),
  ]},
  { slug: "underground-dump-truck", label: "Underground Dump Truck", required: ["overall_height_mm"], fields: [
    f("overall_height_mm", "ارتفاع کلی", "Overall Height", "DECIMAL", { unit: "MM" }),
    f("overall_width_mm", "عرض کلی", "Overall Width", "DECIMAL", { unit: "MM" }),
    f("turning_radius", "شعاع گردش", "Turning Radius", "DECIMAL", { unit: "M" }),
    f("low_profile_body", "اتاق کم‌ارتفاع", "Low Profile Body", "BOOLEAN"),
    f("underground_clearance", "فاصله آزاد تونل", "Underground Clearance", "DECIMAL", { unit: "M" }),
  ]},
  { slug: "electric-mining-truck", label: "Electric Mining Truck", required: ["battery_capacity_kwh"], fields: [
    f("battery_capacity_kwh", "ظرفیت باتری", "Battery Capacity", "DECIMAL", { unit: "KWH" }),
    f("motor_power_kw", "توان موتور محرک", "Drive Motor Power", "DECIMAL", { unit: "KW" }),
    f("charging_time", "زمان شارژ", "Charging Time", "DECIMAL", { unit: "HOUR" }),
    f("regenerative_braking", "ترمز احیاکننده", "Regenerative Braking", "BOOLEAN"),
  ]},
  { slug: "diesel-mining-truck", label: "Diesel Mining Truck", required: ["engine_power_kw"], fields: [
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("fuel_tank_capacity", "ظرفیت مخزن سوخت", "Fuel Tank Capacity", "DECIMAL", { unit: "L" }),
    f("fuel_consumption", "مصرف سوخت", "Fuel Consumption", "TEXT"),
    f("emission_standard", "استاندارد آلایندگی", "Emission Standard", "TEXT"),
  ]},
  { slug: "hybrid-mining-truck", label: "Hybrid Mining Truck", required: ["hybrid_drive_type"], fields: [
    f("hybrid_drive_type", "نوع سامانه هیبرید", "Hybrid Drive Type", "SELECT", { options: ["دیزل-الکتریک", "باتری-الکتریک", "سری", "موازی"] }),
    f("battery_capacity_kwh", "ظرفیت باتری", "Battery Capacity", "DECIMAL", { unit: "KWH" }),
    f("regenerative_braking", "ترمز احیاکننده", "Regenerative Braking", "BOOLEAN"),
    f("engine_power_kw", "توان موتور احتراقی", "Combustion Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "ultra-class-mining-truck", label: "Ultra Class Mining Truck", required: ["gross_vehicle_weight"], fields: [
    f("gross_vehicle_weight", "وزن ناخالص مجاز", "Gross Vehicle Weight", "DECIMAL", { unit: "TON" }),
    f("body_volume", "حجم اتاق بار", "Body Volume", "DECIMAL", { unit: "M3" }),
    f("tire_size", "سایز تایر", "Tire Size", "TEXT"),
    f("hoist_capacity", "ظرفیت بالابر اتاق", "Hoist Capacity", "DECIMAL", { unit: "TON" }),
    f("payload_monitoring", "پایش بار مفید", "Payload Monitoring", "BOOLEAN"),
  ]},

  // Mining shovels and loading machinery.
  { slug: "hydraulic-shovel", label: "Hydraulic Mining Shovel", required: ["shovel_capacity", "digging_force"], fields: [
    f("shovel_capacity", "ظرفیت جام", "Shovel Capacity", "DECIMAL", { unit: "M3", filterable: true }),
    f("digging_force", "نیروی حفاری", "Digging Force", "DECIMAL", { unit: "KN" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("swing_speed", "سرعت گردش", "Swing Speed", "DECIMAL", { unit: "RPM" }),
    f("crowd_force", "نیروی پیشروی", "Crowd Force", "DECIMAL", { unit: "KN" }),
  ]},
  { slug: "electric-rope-shovel", label: "Electric Rope Shovel", required: ["shovel_capacity", "hoist_rope_pull"], fields: [
    f("shovel_capacity", "ظرفیت جام", "Shovel Capacity", "DECIMAL", { unit: "M3", filterable: true }),
    f("hoist_rope_pull", "کشش سیم‌بکسل بالابر", "Hoist Rope Pull", "DECIMAL", { unit: "KN" }),
    f("crowd_force", "نیروی پیشروی", "Crowd Force", "DECIMAL", { unit: "KN" }),
    f("swing_speed", "سرعت گردش", "Swing Speed", "DECIMAL", { unit: "RPM" }),
    f("shovel_power_supply_voltage_kv", "ولتاژ تغذیه", "Power Supply Voltage", "DECIMAL", { unit: "KV" }),
    f("cable_reel_type", "نوع کابل‌جمع‌کن", "Cable Reel Type", "TEXT"),
  ]},
  cloneTemplate("hydraulic-shovel", "mining-shovel", "Mining Shovel", ["shovel_capacity", "digging_force"]),
  cloneTemplate("hydraulic-shovel", "front-shovel", "Front Shovel", ["shovel_capacity", "digging_force"], [
    f("front_shovel_configuration", "پیکربندی فرانت‌شاول", "Front Shovel Configuration", "TEXT"),
    f("dump_height", "ارتفاع تخلیه", "Dump Height", "DECIMAL", { unit: "M" }),
  ]),
  cloneTemplate("hydraulic-shovel", "backhoe-shovel", "Backhoe Shovel", ["shovel_capacity", "max_digging_depth"], [
    f("max_digging_depth", "حداکثر عمق حفاری", "Maximum Digging Depth", "DECIMAL", { unit: "M" }),
    f("bucket_breakout_force", "نیروی کندن باکت", "Bucket Breakout Force", "DECIMAL", { unit: "KN" }),
  ]),
  cloneTemplate("mining-loader", "mining-loader-machine", "Mining Loader Machine", ["bucket_capacity", "payload_capacity"]),
  { slug: "loading-machinery", label: "Mining Loading Machinery", required: ["loading_method", "rated_capacity"], fields: [
    f("loading_method", "روش بارگیری", "Loading Method", "SELECT", { options: ["باکت", "پیوسته", "اسکریپر", "نقاله‌ای", "شاول"] }),
    f("rated_capacity", "ظرفیت نامی", "Rated Capacity", "DECIMAL", { unit: "T/H" }),
    f("material_density", "چگالی ماده", "Material Density", "DECIMAL", { unit: "T/M3" }),
    f("loading_height", "ارتفاع بارگیری", "Loading Height", "DECIMAL", { unit: "M" }),
    f("power_rating", "توان نامی", "Power Rating", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "mining-transport", label: "Mining Transport Equipment", required: ["transport_capacity", "drive_configuration"], fields: [
    f("transport_capacity", "ظرفیت حمل", "Transport Capacity", "DECIMAL", { unit: "TON" }),
    f("drive_configuration", "آرایش محرک", "Drive Configuration", "TEXT"),
    f("vehicle_configuration", "پیکربندی وسیله", "Vehicle Configuration", "TEXT"),
    f("gradeability_percent", "قابلیت عبور از شیب", "Gradeability", "DECIMAL", { unit: "%" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "underground-machinery", label: "Underground Mining Machinery", required: ["machine_type", "overall_height_mm"], fields: [
    f("machine_type", "نوع ماشین زیرزمینی", "Machine Type", "TEXT"),
    f("overall_height_mm", "ارتفاع کلی", "Overall Height", "DECIMAL", { unit: "MM" }),
    f("overall_width_mm", "عرض کلی", "Overall Width", "DECIMAL", { unit: "MM" }),
    f("power_source", "منبع نیرو", "Power Source", "SELECT", { options: ["دیزلی", "برقی کابلی", "باتری"] }),
    f("ventilation_requirement", "نیاز تهویه", "Ventilation Requirement", "TEXT"),
    f("fire_suppression_system", "سامانه اطفای حریق", "Fire Suppression System", "BOOLEAN"),
  ]},
  cloneTemplate("lhd", "diesel-lhd", "Diesel Load Haul Dump", ["bucket_capacity", "payload_capacity"], [
    f("engine_power_kw", "توان موتور دیزلی", "Diesel Engine Power", "DECIMAL", { unit: "KW" }),
    f("emission_standard", "استاندارد آلایندگی", "Emission Standard", "TEXT"),
  ]),
  cloneTemplate("lhd", "electric-lhd", "Electric Load Haul Dump", ["bucket_capacity", "payload_capacity"], [
    f("lhd_power_supply_voltage_v", "ولتاژ تغذیه", "Power Supply Voltage", "DECIMAL", { unit: "V" }),
    f("cable_length", "طول کابل", "Cable Length", "DECIMAL", { unit: "M" }),
  ]),
  cloneTemplate("lhd", "battery-lhd", "Battery Electric Load Haul Dump", ["bucket_capacity", "payload_capacity"], [
    f("battery_capacity_kwh", "ظرفیت باتری", "Battery Capacity", "DECIMAL", { unit: "KWH" }),
    f("charging_time", "زمان شارژ", "Charging Time", "DECIMAL", { unit: "HOUR" }),
    f("battery_swap_system", "سامانه تعویض باتری", "Battery Swap System", "BOOLEAN"),
  ]),
  cloneTemplate("lhd", "low-profile-lhd", "Low Profile Load Haul Dump", ["bucket_capacity", "payload_capacity"], [
    f("overall_height_mm", "ارتفاع کلی", "Overall Height", "DECIMAL", { unit: "MM" }),
    f("overall_width_mm", "عرض کلی", "Overall Width", "DECIMAL", { unit: "MM" }),
    f("low_profile_configuration", "پیکربندی کم‌ارتفاع", "Low Profile Configuration", "BOOLEAN"),
  ]),
  { slug: "mining-drilling", label: "Mining Drilling Equipment", required: ["drilling_method", "hole_diameter_range"], fields: [
    f("drilling_method", "روش حفاری", "Drilling Method", "MULTI_SELECT", { options: ["DTH", "Top Hammer", "Rotary", "Core", "RC"] }),
    f("hole_diameter_range", "محدوده قطر چال", "Hole Diameter Range", "TEXT"),
    f("max_drilling_depth", "حداکثر عمق حفاری", "Maximum Drilling Depth", "DECIMAL", { unit: "M" }),
    f("air_pressure", "فشار هوای کاری", "Working Air Pressure", "DECIMAL", { unit: "BAR" }),
    f("air_flow", "دبی هوا", "Air Flow", "DECIMAL", { unit: "M3/MIN" }),
  ]},
  { slug: "blasting-machinery", label: "Mining Blasting Support Machinery", required: ["equipment_type", "remote_operation"], fields: [
    f("equipment_type", "نوع تجهیزات پشتیبان آتشباری", "Equipment Type", "TEXT"),
    f("remote_operation", "کنترل از راه دور", "Remote Operation", "BOOLEAN"),
    f("drill_pattern_capacity", "ظرفیت الگوی حفاری", "Drill Pattern Capacity", "TEXT"),
    f("positioning_system", "سامانه موقعیت‌یابی", "Positioning System", "TEXT"),
    f("safety_interlocks", "اینترلاک‌های ایمنی", "Safety Interlocks", "BOOLEAN"),
  ]},
  { slug: "mine-maintenance", label: "Mine Maintenance Equipment", required: ["service_capacity", "equipment_type"], fields: [
    f("equipment_type", "نوع تجهیزات تعمیر و نگهداری", "Equipment Type", "TEXT"),
    f("service_capacity", "ظرفیت سرویس", "Service Capacity", "TEXT"),
    f("workshop_configuration", "پیکربندی کارگاه", "Workshop Configuration", "TEXT"),
    f("lifting_capacity", "ظرفیت بالابری", "Lifting Capacity", "DECIMAL", { unit: "TON" }),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
  ]},
  { slug: "mobile-processing", label: "Mobile Mining Processing Plant", required: ["throughput_tph", "processing_method"], fields: [
    f("throughput_tph", "ظرفیت فرآوری", "Processing Throughput", "DECIMAL", { unit: "T/H", filterable: true }),
    f("processing_method", "روش فرآوری", "Processing Method", "MULTI_SELECT", { options: ["خردایش", "سرند", "شستشو", "جداسازی مغناطیسی", "دانه‌بندی"] }),
    f("feed_size_range", "محدوده اندازه خوراک", "Feed Size Range", "TEXT"),
    f("product_size_range", "محدوده اندازه محصول", "Product Size Range", "TEXT"),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
    f("mobility_type", "نوع تحرک", "Mobility Type", "SELECT", { options: ["چرخ‌دار", "زنجیری", "نیمه‌متحرک"] }),
  ]},

  // Canonical drilling slugs.
  cloneTemplate("dth", "dth-drill", "Down-the-Hole Drill Rig", ["hole_diameter_min", "hole_diameter_max", "drilling_depth"]),
  cloneTemplate("top-hammer", "top-hammer-drill", "Top Hammer Drill Rig", ["hole_diameter_min", "hole_diameter_max", "feed_length"]),
  cloneTemplate("water-well-drilling", "water-well-drill", "Water Well Drilling Rig", ["max_drilling_depth", "drilling_method"]),
  { slug: "drilling-accessories", label: "Drilling Accessories", required: ["accessory_type", "compatibility"], fields: [
    f("accessory_type", "نوع متعلقه حفاری", "Accessory Type", "SELECT", { options: ["راد", "مته", "چکش DTH", "استیل", "کلی بار", "استابلایزر", "کوپلینگ"] }),
    f("compatibility", "سازگاری دستگاه", "Rig Compatibility", "TEXT"),
    f("thread_type", "نوع رزوه", "Thread Type", "TEXT"),
    f("outer_diameter_mm", "قطر خارجی", "Outer Diameter", "DECIMAL", { unit: "MM" }),
    f("overall_length_m", "طول کلی", "Overall Length", "DECIMAL", { unit: "M" }),
    f("material_grade", "گرید مواد", "Material Grade", "TEXT"),
  ]},

  // Crushing, sizing and mineral processing.
  { slug: "cubiti-crusher", label: "Cubic / Specialized Crusher", required: ["crusher_type", "throughput_tph"], fields: [
    f("crusher_type", "نوع سنگ‌شکن", "Crusher Type", "TEXT"),
    f("throughput_tph", "ظرفیت تولید", "Throughput", "DECIMAL", { unit: "T/H", filterable: true }),
    f("feed_size_mm", "اندازه خوراک", "Feed Size", "DECIMAL", { unit: "MM" }),
    f("product_size_mm", "اندازه محصول", "Product Size", "DECIMAL", { unit: "MM" }),
    f("motor_power_kw", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "hammer-crusher", label: "Hammer Crusher", required: ["throughput_tph", "rotor_speed"], fields: [
    f("throughput_tph", "ظرفیت تولید", "Throughput", "DECIMAL", { unit: "T/H", filterable: true }),
    f("max_feed_size_mm", "حداکثر اندازه خوراک", "Maximum Feed Size", "DECIMAL", { unit: "MM" }),
    f("rotor_speed", "سرعت روتور", "Rotor Speed", "DECIMAL", { unit: "RPM" }),
    f("hammer_count", "تعداد چکش", "Hammer Count", "INTEGER"),
    f("motor_power_kw", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "gyratory-crusher", label: "Gyratory Crusher", required: ["throughput_tph", "gyratory_diameter"], fields: [
    f("throughput_tph", "ظرفیت تولید", "Throughput", "DECIMAL", { unit: "T/H", filterable: true }),
    f("gyratory_diameter", "قطر مخروط خردایش", "Gyratory Diameter", "DECIMAL", { unit: "M" }),
    f("feed_opening", "ابعاد دهانه ورودی", "Feed Opening", "TEXT"),
    f("closed_side_setting_mm", "تنظیم دهانه خروجی", "Closed Side Setting", "DECIMAL", { unit: "MM" }),
    f("motor_power_kw", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "roll-crusher", label: "Roll Crusher", required: ["throughput_tph", "roll_diameter"], fields: [
    f("throughput_tph", "ظرفیت تولید", "Throughput", "DECIMAL", { unit: "T/H", filterable: true }),
    f("roll_diameter", "قطر رول", "Roll Diameter", "DECIMAL", { unit: "MM" }),
    f("roll_width", "عرض رول", "Roll Width", "DECIMAL", { unit: "MM" }),
    f("roll_gap", "فاصله رول‌ها", "Roll Gap", "DECIMAL", { unit: "MM" }),
    f("motor_power_kw", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "feeder", label: "Industrial Feeder", required: ["feeder_type", "throughput_tph"], fields: [
    f("feeder_type", "نوع فیدر", "Feeder Type", "SELECT", { options: ["ویبره‌ای", "نواری", "زنجیری", "گریزلی", "اسکرو"] }),
    f("throughput_tph", "ظرفیت خوراک‌دهی", "Feed Throughput", "DECIMAL", { unit: "T/H" }),
    f("feed_size_mm", "حداکثر اندازه خوراک", "Maximum Feed Size", "DECIMAL", { unit: "MM" }),
    f("trough_width_mm", "عرض ناودانی", "Trough Width", "DECIMAL", { unit: "MM" }),
    f("drive_power_kw", "توان محرک", "Drive Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "conveyor", label: "Industrial Conveyor", required: ["belt_width_mm", "conveyor_length_m", "throughput_tph"], fields: [
    f("conveyor_type", "نوع نقاله", "Conveyor Type", "SELECT", { options: ["نواری", "زنجیری", "رولیکی", "اسکرو", "کاسه‌ای"] }),
    f("belt_width_mm", "عرض نوار", "Belt Width", "DECIMAL", { unit: "MM" }),
    f("conveyor_length_m", "طول نقاله", "Conveyor Length", "DECIMAL", { unit: "M" }),
    f("throughput_tph", "ظرفیت انتقال", "Throughput", "DECIMAL", { unit: "T/H" }),
    f("belt_speed_mps", "سرعت نوار", "Belt Speed", "DECIMAL", { unit: "M/S" }),
    f("incline_angle", "زاویه شیب", "Incline Angle", "DECIMAL", { unit: "DEG" }),
    f("drive_power_kw", "توان محرک", "Drive Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "scalper", label: "Scalping Screen", required: ["screen_area_m2", "deck_count"], fields: [
    f("screen_area_m2", "سطح سرند", "Screen Area", "DECIMAL", { unit: "M2" }),
    f("deck_count", "تعداد طبقات", "Deck Count", "INTEGER"),
    f("throughput_tph", "ظرفیت سرند", "Screening Throughput", "DECIMAL", { unit: "T/H" }),
    f("screen_opening_mm", "اندازه چشمه", "Screen Opening", "DECIMAL", { unit: "MM" }),
    f("screen_motion", "نوع حرکت سرند", "Screen Motion", "SELECT", { options: ["دایره‌ای", "بیضوی", "خطی"] }),
  ]},
  { slug: "washing-plant", label: "Aggregate Washing Plant", required: ["throughput_tph", "water_flow_m3h"], fields: [
    f("throughput_tph", "ظرفیت شستشو", "Washing Throughput", "DECIMAL", { unit: "T/H" }),
    f("water_flow_m3h", "دبی آب", "Water Flow", "DECIMAL", { unit: "M3/H" }),
    f("washing_stages", "تعداد مراحل شستشو", "Washing Stages", "INTEGER"),
    f("slurry_recovery", "بازیابی دوغاب", "Slurry Recovery", "BOOLEAN"),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "sand-washer", label: "Sand Washing Machine", required: ["throughput_tph", "wheel_diameter_mm"], fields: [
    f("throughput_tph", "ظرفیت شستشوی ماسه", "Sand Washing Throughput", "DECIMAL", { unit: "T/H" }),
    f("wheel_diameter_mm", "قطر چرخ", "Wheel Diameter", "DECIMAL", { unit: "MM" }),
    f("water_flow_m3h", "دبی آب", "Water Flow", "DECIMAL", { unit: "M3/H" }),
    f("sand_recovery_rate", "نرخ بازیابی ماسه", "Sand Recovery Rate", "DECIMAL", { unit: "%" }),
    f("drive_power_kw", "توان محرک", "Drive Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "hydrocyclone", label: "Hydrocyclone", required: ["cyclone_diameter_mm", "feed_pressure_bar"], fields: [
    f("cyclone_diameter_mm", "قطر هیدروسیکلون", "Cyclone Diameter", "DECIMAL", { unit: "MM" }),
    f("feed_pressure_bar", "فشار خوراک", "Feed Pressure", "DECIMAL", { unit: "BAR" }),
    f("flow_capacity_m3h", "ظرفیت دبی", "Flow Capacity", "DECIMAL", { unit: "M3/H" }),
    f("cut_size_micron", "اندازه برش", "Cut Size", "DECIMAL", { unit: "MICRON" }),
    f("liner_material", "جنس لاینر", "Liner Material", "TEXT"),
  ]},
  { slug: "magnetic-equipment", label: "Magnetic Separation Equipment", required: ["magnetic_type", "throughput_tph"], fields: [
    f("magnetic_type", "نوع جداساز مغناطیسی", "Magnetic Separator Type", "SELECT", { options: ["درام", "اورباند", "پولی", "الکترومغناطیسی", "مغناطیس دائم"] }),
    f("throughput_tph", "ظرفیت فرآوری", "Processing Throughput", "DECIMAL", { unit: "T/H" }),
    f("magnetic_field_strength_t", "شدت میدان مغناطیسی", "Magnetic Field Strength", "DECIMAL", { unit: "T" }),
    f("belt_width_mm", "عرض نوار", "Belt Width", "DECIMAL", { unit: "MM" }),
    f("separation_size_mm", "اندازه جداسازی", "Separation Size", "DECIMAL", { unit: "MM" }),
  ]},
  cloneTemplate("complete-line", "crushing-line", "Crushing Line", ["plant_capacity", "process_stages"]),
  cloneTemplate("complete-line", "mobile-processing-line", "Mobile Processing Line", ["plant_capacity", "process_stages"], [
    f("mobility_type", "نوع تحرک", "Mobility Type", "SELECT", { options: ["چرخ‌دار", "زنجیری", "نیمه‌متحرک"] }),
    f("setup_time", "زمان استقرار", "Setup Time", "DECIMAL", { unit: "HOUR" }),
  ]),
  { slug: "screening-line", label: "Screening Line", required: ["throughput_tph", "screening_stages"], fields: [
    f("throughput_tph", "ظرفیت دانه‌بندی", "Screening Throughput", "DECIMAL", { unit: "T/H" }),
    f("screening_stages", "تعداد مراحل سرند", "Screening Stages", "INTEGER"),
    f("screen_types", "انواع سرند", "Screen Types", "MULTI_SELECT", { options: ["ارتعاشی", "دوار", "آبگیری", "گریزلی"] }),
    f("product_fractions", "دانه‌بندی خروجی", "Product Fractions", "TEXT"),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
  ]},
);


templates.push(
  // Concrete pumping / placing subtypes.
  cloneTemplate("concrete-pump", "truck-mounted-pump", "Truck Mounted Concrete Pump", ["concrete_output", "max_pumping_pressure"], [
    f("truck_chassis_axle_count", "تعداد محور شاسی", "Truck Chassis Axle Count", "INTEGER"),
    f("boom_reach_vertical", "برد عمودی بوم", "Vertical Boom Reach", "DECIMAL", { unit: "M" }),
    f("boom_reach_horizontal", "برد افقی بوم", "Horizontal Boom Reach", "DECIMAL", { unit: "M" }),
    f("outrigger_span", "فاصله بازشدگی جک‌ها", "Outrigger Span", "DECIMAL", { unit: "M" }),
  ]),
  cloneTemplate("concrete-pump", "trailer-pump", "Trailer Concrete Pump", ["concrete_output", "max_pumping_pressure"], [
    f("trailer_configuration", "پیکربندی تریلر", "Trailer Configuration", "TEXT"),
    f("towing_vehicle_requirement", "نیازمندی کشنده", "Towing Vehicle Requirement", "TEXT"),
    f("delivery_line_length", "طول خط انتقال", "Delivery Line Length", "DECIMAL", { unit: "M" }),
  ]),
  cloneTemplate("concrete-pump", "line-pump", "Line Concrete Pump", ["concrete_output", "max_pumping_pressure"], [
    f("delivery_line_length", "طول خط انتقال", "Delivery Line Length", "DECIMAL", { unit: "M" }),
    f("max_aggregate_size", "حداکثر اندازه سنگدانه", "Maximum Aggregate Size", "DECIMAL", { unit: "MM" }),
    f("pipeline_diameter_mm", "قطر خط لوله", "Pipeline Diameter", "DECIMAL", { unit: "MM" }),
  ]),
  cloneTemplate("concrete-pump", "boom-pump", "Boom Concrete Pump", ["concrete_output", "boom_reach_vertical"], [
    f("boom_section_count", "تعداد سکشن بوم", "Boom Section Count", "INTEGER"),
    f("boom_fold_type", "نوع تا شدن بوم", "Boom Fold Type", "TEXT"),
    f("outrigger_span", "فاصله بازشدگی جک‌ها", "Outrigger Span", "DECIMAL", { unit: "M" }),
  ]),
  cloneTemplate("concrete-pump", "stationary-pump", "Stationary Concrete Pump", ["concrete_output", "max_pumping_pressure"], [
    f("delivery_line_length", "طول خط انتقال", "Delivery Line Length", "DECIMAL", { unit: "M" }),
    f("pipeline_diameter_mm", "قطر خط لوله", "Pipeline Diameter", "DECIMAL", { unit: "MM" }),
    f("electric_or_diesel", "نوع محرک", "Power Configuration", "SELECT", { options: ["برقی", "دیزلی"] }),
  ]),
  cloneTemplate("shotcrete-machine", "shotcrete", "Shotcrete Equipment", ["concrete_output", "spraying_method"]),
  cloneTemplate("batching-plant", "concrete-production", "Concrete Production Plant", ["plant_capacity", "mixer_capacity"], [
    f("aggregate_dosing_system", "سامانه توزین سنگدانه", "Aggregate Dosing System", "TEXT"),
    f("cement_dosing_accuracy", "دقت توزین سیمان", "Cement Dosing Accuracy", "TEXT"),
  ]),
  cloneTemplate("concrete-pump", "concrete-placing", "Concrete Placing Equipment", ["concrete_output"], [
    f("placing_method", "روش بتن‌ریزی", "Placing Method", "SELECT", { options: ["پمپاژ", "نوار نقاله", "اسکیپ", "باکت جرثقیلی"] }),
    f("placing_reach", "برد بتن‌ریزی", "Placing Reach", "DECIMAL", { unit: "M" }),
  ]),

  // Asphalt paving and plant subtypes.
  cloneTemplate("asphalt-finisher", "track-paver", "Tracked Asphalt Paver", ["paving_width", "paving_capacity"], [
    f("track_shoe_width", "عرض زنجیر", "Track Shoe Width", "DECIMAL", { unit: "MM" }),
    f("traction_force", "نیروی کشش", "Traction Force", "DECIMAL", { unit: "KN" }),
  ]),
  cloneTemplate("asphalt-finisher", "wheel-paver", "Wheeled Asphalt Paver", ["paving_width", "paving_capacity"], [
    f("tire_configuration", "آرایش تایر", "Tire Configuration", "TEXT"),
    f("travel_speed", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "KMH" }),
  ]),
  cloneTemplate("asphalt-finisher", "mini-paver", "Mini Asphalt Paver", ["paving_width", "paving_capacity"], [
    f("minimum_paving_width", "حداقل عرض پخش", "Minimum Paving Width", "DECIMAL", { unit: "M" }),
    f("transport_width", "عرض حمل", "Transport Width", "DECIMAL", { unit: "M" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
  ]),
  cloneTemplate("asphalt-finisher", "highway-paver", "Highway Asphalt Paver", ["paving_width", "paving_capacity"], [
    f("maximum_paving_width", "حداکثر عرض پخش", "Maximum Paving Width", "DECIMAL", { unit: "M" }),
    f("highway_paving_capacity", "ظرفیت پخش جاده‌ای", "Highway Paving Capacity", "DECIMAL", { unit: "T/H" }),
    f("screed_extension_type", "نوع افزایش عرض اتو", "Screed Extension Type", "TEXT"),
  ]),
  { slug: "asphalt-plant", label: "Asphalt Mixing Plant", required: ["plant_capacity", "mixer_type", "drying_drum_capacity"], fields: [
    f("plant_capacity", "ظرفیت تولید آسفالت", "Plant Capacity", "DECIMAL", { unit: "T/H", filterable: true }),
    f("plant_configuration", "پیکربندی کارخانه", "Plant Configuration", "SELECT", { options: ["Batch", "Drum Mix", "Continuous"] }),
    f("mixer_type", "نوع میکسر", "Mixer Type", "TEXT"),
    f("drying_drum_capacity", "ظرفیت درام خشک‌کن", "Drying Drum Capacity", "DECIMAL", { unit: "T/H" }),
    f("burner_fuel_type", "نوع سوخت مشعل", "Burner Fuel Type", "TEXT"),
    f("bitumen_tank_capacity", "ظرفیت مخزن قیر", "Bitumen Tank Capacity", "DECIMAL", { unit: "L" }),
    f("aggregate_bins", "تعداد مخازن مصالح", "Aggregate Bins", "INTEGER"),
    f("baghouse_filter", "فیلتر غبارگیر کیسه‌ای", "Baghouse Filter", "BOOLEAN"),
  ]},
  { slug: "asphalt-distributor", label: "Asphalt Distributor", required: ["tank_capacity", "spray_width", "spray_rate"], fields: [
    f("tank_capacity", "ظرفیت مخزن قیر", "Tank Capacity", "DECIMAL", { unit: "L", filterable: true }),
    f("spray_width", "عرض پاشش", "Spray Width", "DECIMAL", { unit: "M" }),
    f("spray_rate", "نرخ پاشش", "Spray Rate", "DECIMAL", { unit: "L/M2" }),
    f("spray_bar_nozzle_count", "تعداد نازل‌های لوله پاشش", "Spray Bar Nozzle Count", "INTEGER"),
    f("heating_system", "سیستم گرم‌کن", "Heating System", "TEXT"),
    f("pump_flow_lpm", "دبی پمپ", "Pump Flow", "DECIMAL", { unit: "LPM" }),
  ]},
  { slug: "asphalt-recycling", label: "Asphalt Recycling Machine", required: ["milling_width", "recycling_depth"], fields: [
    f("milling_width", "عرض بازیافت/تراش", "Milling Width", "DECIMAL", { unit: "M" }),
    f("recycling_depth", "عمق بازیافت", "Recycling Depth", "DECIMAL", { unit: "MM" }),
    f("recycling_capacity", "ظرفیت بازیافت", "Recycling Capacity", "DECIMAL", { unit: "T/H" }),
    f("binder_dosing_system", "سامانه تزریق قیر/بایندر", "Binder Dosing System", "TEXT"),
    f("mixing_chamber_type", "نوع محفظه اختلاط", "Mixing Chamber Type", "TEXT"),
  ]},
  { slug: "bitumen-equipment", label: "Bitumen Handling Equipment", required: ["equipment_type", "heating_method"], fields: [
    f("equipment_type", "نوع تجهیزات قیر", "Equipment Type", "SELECT", { options: ["مخزن", "پمپ انتقال", "سیستم گرمایش", "واحد امولسیون", "توزین"] }),
    f("heating_method", "روش گرمایش", "Heating Method", "SELECT", { options: ["روغن داغ", "برقی", "مشعل مستقیم"] }),
    f("storage_capacity_l", "ظرفیت ذخیره", "Storage Capacity", "DECIMAL", { unit: "L" }),
    f("temperature_range", "محدوده دمای کاری", "Operating Temperature Range", "TEXT"),
    f("transfer_flow_lpm", "دبی انتقال", "Transfer Flow", "DECIMAL", { unit: "LPM" }),
    f("insulation_type", "نوع عایق", "Insulation Type", "TEXT"),
  ]},

  // Crane configurations and lifting machinery.
  cloneTemplate("mobile-crane", "telescopic-crane", "Telescopic Boom Crane", ["max_load_capacity", "boom_length"], [
    f("boom_section_count", "تعداد سکشن بوم", "Boom Section Count", "INTEGER"),
    f("telescopic_extension_time", "زمان بازشدن بوم", "Telescopic Extension Time", "DECIMAL", { unit: "S" }),
    f("boom_extension_system", "سامانه تلسکوپی", "Boom Extension System", "TEXT"),
  ]),
  cloneTemplate("wheel-crane", "rough-terrain-crane", "Rough Terrain Crane", ["max_load_capacity", "boom_length"], [
    f("four_wheel_drive", "چهارچرخ محرک", "Four Wheel Drive", "BOOLEAN"),
    f("all_wheel_steer", "فرمان‌پذیری تمام چرخ‌ها", "All Wheel Steering", "BOOLEAN"),
    f("gradeability_percent", "قابلیت عبور از شیب", "Gradeability", "DECIMAL", { unit: "%" }),
  ]),
  cloneTemplate("overhead-crane", "industrial-crane", "Industrial Crane", ["lifting_capacity", "span"], [
    f("duty_class", "کلاس کاری", "Duty Class", "TEXT"),
    f("duty_cycle", "چرخه کاری", "Duty Cycle", "TEXT"),
    f("lifting_mechanism", "مکانیزم بالابری", "Lifting Mechanism", "TEXT"),
  ]),
  { slug: "winch", label: "Industrial Winch", required: ["line_pull", "rope_capacity"], fields: [
    f("line_pull", "نیروی کشش خط", "Line Pull", "DECIMAL", { unit: "KN", filterable: true }),
    f("rope_capacity", "ظرفیت طول سیم‌بکسل", "Rope Capacity", "DECIMAL", { unit: "M" }),
    f("rope_diameter_mm", "قطر سیم‌بکسل", "Rope Diameter", "DECIMAL", { unit: "MM" }),
    f("drum_speed", "سرعت درام", "Drum Speed", "DECIMAL", { unit: "M/MIN" }),
    f("brake_type", "نوع ترمز", "Brake Type", "TEXT"),
    f("drive_power_kw", "توان محرک", "Drive Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "hoist", label: "Industrial Hoist", required: ["lifting_capacity", "lifting_height"], fields: [
    f("lifting_capacity", "ظرفیت بالابری", "Lifting Capacity", "DECIMAL", { unit: "TON", filterable: true }),
    f("lifting_height", "ارتفاع بالابری", "Lifting Height", "DECIMAL", { unit: "M" }),
    f("hoist_type", "نوع بالابر", "Hoist Type", "SELECT", { options: ["سیمی", "زنجیری", "برقی", "دستی"] }),
    f("lifting_speed", "سرعت بالابری", "Lifting Speed", "DECIMAL", { unit: "M/MIN" }),
    f("duty_class", "کلاس کاری", "Duty Class", "TEXT"),
    f("trolley_included", "دارای ترولی", "Trolley Included", "BOOLEAN"),
  ]},
  { slug: "lifting-equipment", label: "Lifting Equipment", required: ["equipment_type", "safe_working_load"], fields: [
    f("equipment_type", "نوع تجهیزات لیفتینگ", "Equipment Type", "TEXT"),
    f("safe_working_load", "بار کاری ایمن", "Safe Working Load", "DECIMAL", { unit: "TON" }),
    f("lifting_height", "ارتفاع بالابری", "Lifting Height", "DECIMAL", { unit: "M" }),
    f("drive_type", "نوع محرک", "Drive Type", "TEXT"),
    f("safety_certification", "گواهی ایمنی", "Safety Certification", "TEXT"),
  ]},

  // Forklift and warehouse handling subtypes.
  cloneTemplate("stacker", "stackers", "Warehouse Stackers", ["load_capacity", "lift_height"]),
  cloneTemplate("telehandler-loader", "telehandler", "Telehandler", ["rated_lifting_capacity_kg", "max_lift_height", "max_forward_reach"]),
  { slug: "material-handler", label: "Industrial Material Handler", required: ["operating_weight", "boom_reach"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("boom_reach", "برد بوم", "Boom Reach", "DECIMAL", { unit: "M" }),
    f("grapple_capacity", "ظرفیت گراپل", "Grapple Capacity", "DECIMAL", { unit: "KG" }),
    f("cab_elevation", "ارتفاع کابین", "Cab Elevation", "DECIMAL", { unit: "M" }),
    f("hydraulic_flow", "دبی هیدرولیک", "Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("undercarriage_type", "نوع شاسی", "Undercarriage Type", "SELECT", { options: ["چرخ‌دار", "زنجیری"] }),
  ]},
  cloneTemplate("container-forklift", "container-handler", "Container Handler", ["lifting_capacity", "container_size", "lift_height"], [
    f("spreader_rotation", "چرخش اسپریدر", "Spreader Rotation", "DECIMAL", { unit: "DEG" }),
    f("stacking_rows", "تعداد ردیف چیدمان", "Stacking Rows", "INTEGER"),
  ]),
  { slug: "warehouse-equipment", label: "Warehouse Material Handling Equipment", required: ["equipment_type", "load_capacity"], fields: [
    f("equipment_type", "نوع تجهیزات انبار", "Equipment Type", "TEXT"),
    f("load_capacity", "ظرفیت حمل", "Load Capacity", "DECIMAL", { unit: "KG" }),
    f("lift_height", "ارتفاع بالابری", "Lift Height", "DECIMAL", { unit: "M" }),
    f("aisle_width_mm", "عرض راهرو", "Aisle Width", "DECIMAL", { unit: "MM" }),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
  ]},

  // Industrial haulage families.
  cloneTemplate("mining-dump-truck", "site-dump-truck", "Construction Site Dump Truck", ["rated_payload_ton", "body_volume"]),
  { slug: "site-transport", label: "Construction Site Transport Vehicle", required: ["payload_capacity", "drive_configuration"], fields: [
    f("payload_capacity", "ظرفیت بار مفید", "Payload Capacity", "DECIMAL", { unit: "TON" }),
    f("drive_configuration", "آرایش محرک", "Drive Configuration", "TEXT"),
    f("ground_clearance_mm", "فاصله از زمین", "Ground Clearance", "DECIMAL", { unit: "MM" }),
    f("gradeability_percent", "قابلیت عبور از شیب", "Gradeability", "DECIMAL", { unit: "%" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  cloneTemplate("mining-dump-truck", "haul-truck", "Industrial Haul Truck", ["rated_payload_ton", "body_volume"]),
  cloneTemplate("rigid-mining-truck", "off-highway-truck", "Off Highway Truck", ["rated_payload_ton", "gross_vehicle_weight"], [
    f("rated_payload_ton", "ظرفیت بار مفید", "Rated Payload", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("gross_vehicle_weight", "وزن ناخالص خودرو", "Gross Vehicle Weight", "DECIMAL", { unit: "TON" }),
  ]),
  cloneTemplate("mining-dump-truck", "mining-truck", "Mining Truck", ["rated_payload_ton", "body_volume"]),
  { slug: "industrial-tractor", label: "Industrial Tractor", required: ["drawbar_pull", "engine_power_kw"], fields: [
    f("drawbar_pull", "نیروی کشش", "Drawbar Pull", "DECIMAL", { unit: "KN" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("transmission_type", "نوع گیربکس", "Transmission Type", "TEXT"),
    f("axle_configuration", "آرایش محورها", "Axle Configuration", "TEXT"),
    f("tire_type", "نوع تایر", "Tire Type", "TEXT"),
    f("hydraulic_lift_capacity", "ظرفیت بالابر هیدرولیک", "Hydraulic Lift Capacity", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "project-transport", label: "Heavy Project Transport Equipment", required: ["payload_capacity", "axle_line_count"], fields: [
    f("payload_capacity", "ظرفیت حمل", "Payload Capacity", "DECIMAL", { unit: "TON" }),
    f("axle_line_count", "تعداد خطوط محور", "Axle Line Count", "INTEGER"),
    f("deck_length", "طول عرشه", "Deck Length", "DECIMAL", { unit: "M" }),
    f("deck_width", "عرض عرشه", "Deck Width", "DECIMAL", { unit: "M" }),
    f("hydraulic_suspension", "تعلیق هیدرولیکی", "Hydraulic Suspension", "BOOLEAN"),
    f("steering_mode", "حالت فرمان‌پذیری", "Steering Mode", "TEXT"),
  ]},

  // Port and marine cargo handling.
  cloneTemplate("reach-stacker", "port-reach-stacker", "Port Reach Stacker", ["lifting_capacity", "stacking_height", "container_size"]),
  cloneTemplate("reach-stacker", "empty-container-handler", "Empty Container Handler", ["lifting_capacity", "stacking_height", "container_size"], [
    f("empty_container_stack_height", "ارتفاع چیدمان کانتینر خالی", "Empty Container Stack Height", "INTEGER", { unit: "ROWS" }),
    f("spreader_type", "نوع اسپریدر", "Spreader Type", "TEXT"),
  ]),
  { slug: "straddle-carrier", label: "Straddle Carrier", required: ["container_size", "lifting_capacity", "travel_speed"], fields: [
    f("container_size", "ابعاد کانتینر", "Container Size", "MULTI_SELECT", { options: ["20ft", "40ft", "45ft"] }),
    f("lifting_capacity", "ظرفیت حمل", "Lifting Capacity", "DECIMAL", { unit: "TON" }),
    f("stacking_height", "ارتفاع چیدمان", "Stacking Height", "INTEGER", { unit: "ROWS" }),
    f("travel_speed", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "KMH" }),
    f("drive_type", "نوع محرک", "Drive Type", "SELECT", { options: ["دیزلی", "هیبریدی", "برقی"] }),
    f("steering_mode", "حالت فرمان‌پذیری", "Steering Mode", "TEXT"),
  ]},
  cloneTemplate("marine-crane", "port-crane", "Port Crane", ["max_load_capacity", "max_outreach"]),
  { slug: "ship-loader", label: "Ship Loader", required: ["throughput_tph", "loading_reach"], fields: [
    f("throughput_tph", "ظرفیت بارگیری", "Loading Throughput", "DECIMAL", { unit: "T/H" }),
    f("loading_reach", "برد بارگیری", "Loading Reach", "DECIMAL", { unit: "M" }),
    f("boom_conveyor_width_mm", "عرض نوار بوم", "Boom Conveyor Width", "DECIMAL", { unit: "MM" }),
    f("ship_size_compatibility", "سازگاری ابعاد کشتی", "Ship Size Compatibility", "TEXT"),
    f("dust_suppression", "سیستم کنترل گردوغبار", "Dust Suppression", "BOOLEAN"),
  ]},
  { slug: "ship-unloader", label: "Ship Unloader", required: ["throughput_tph", "unloading_method"], fields: [
    f("throughput_tph", "ظرفیت تخلیه", "Unloading Throughput", "DECIMAL", { unit: "T/H" }),
    f("unloading_method", "روش تخلیه", "Unloading Method", "SELECT", { options: ["مکنده", "باکتی", "نوار نقاله", "Grab"] }),
    f("grab_capacity_m3", "ظرفیت گراب", "Grab Capacity", "DECIMAL", { unit: "M3" }),
    f("boom_reach", "برد بوم", "Boom Reach", "DECIMAL", { unit: "M" }),
    f("dust_suppression", "سیستم کنترل گردوغبار", "Dust Suppression", "BOOLEAN"),
  ]},
  cloneTemplate("mobile-crane", "mobile-harbor-crane", "Mobile Harbor Crane", ["max_load_capacity", "boom_length"], [
    f("port_duty_cycle", "چرخه کاری بندری", "Port Duty Cycle", "TEXT"),
    f("ship_side_reach", "برد سمت کشتی", "Ship Side Reach", "DECIMAL", { unit: "M" }),
  ]),
  { slug: "port-loading-equipment", label: "Port Loading Equipment", required: ["equipment_type", "throughput_tph"], fields: [
    f("equipment_type", "نوع تجهیزات بارگیری بندر", "Equipment Type", "TEXT"),
    f("throughput_tph", "ظرفیت بارگیری", "Loading Throughput", "DECIMAL", { unit: "T/H" }),
    f("cargo_type", "نوع محموله", "Cargo Type", "MULTI_SELECT", { options: ["کانتینر", "فله خشک", "فله مایع", "عمومی", "خودرو"] }),
    f("conveyor_or_grab", "روش انتقال", "Transfer Method", "TEXT"),
    f("drive_power_kw", "توان محرک", "Drive Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "marine-service-equipment", label: "Marine Service Equipment", required: ["equipment_type", "working_capacity"], fields: [
    f("equipment_type", "نوع تجهیزات خدمات دریایی", "Equipment Type", "TEXT"),
    f("working_capacity", "ظرفیت کاری", "Working Capacity", "TEXT"),
    f("marine_environment_rating", "رتبه محیط دریایی", "Marine Environment Rating", "TEXT"),
    f("corrosion_protection", "حفاظت خوردگی", "Corrosion Protection", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
  ]},
);


templates.push(
  // Recycling and waste processing equipment.
  { slug: "shredder-machine", label: "Industrial Shredder", required: ["throughput_tph", "rotor_type"], fields: [
    f("throughput_tph", "ظرفیت خردایش", "Throughput", "DECIMAL", { unit: "T/H" }),
    f("rotor_type", "نوع روتور", "Rotor Type", "SELECT", { options: ["تک‌محور", "دو‌محور", "چهارمحور", "چکشی"] }),
    f("feed_opening_mm", "دهانه ورودی", "Feed Opening", "DECIMAL", { unit: "MM" }),
    f("output_size_mm", "اندازه خروجی", "Output Size", "DECIMAL", { unit: "MM" }),
    f("rotor_speed_rpm", "سرعت روتور", "Rotor Speed", "DECIMAL", { unit: "RPM" }),
    f("drive_power_kw", "توان محرک", "Drive Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "industrial-shredder", label: "Heavy Duty Industrial Shredder", required: ["shaft_count", "throughput_tph"], fields: [
    f("shaft_count", "تعداد شفت", "Shaft Count", "INTEGER"),
    f("throughput_tph", "ظرفیت خردایش", "Throughput", "DECIMAL", { unit: "T/H" }),
    f("shaft_torque_knm", "گشتاور شفت", "Shaft Torque", "DECIMAL", { unit: "KNM" }),
    f("cutting_chamber_width_mm", "عرض محفظه خردایش", "Cutting Chamber Width", "DECIMAL", { unit: "MM" }),
    f("hydraulic_pusher", "پشر هیدرولیکی", "Hydraulic Pusher", "BOOLEAN"),
    f("drive_power_kw", "توان محرک", "Drive Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "baler", label: "Industrial Baler", required: ["baling_force", "bale_dimensions"], fields: [
    f("baler_type", "نوع پرس", "Baler Type", "SELECT", { options: ["عمودی", "افقی", "کانالی", "دو‌محفظه"] }),
    f("baling_force", "نیروی پرس", "Baling Force", "DECIMAL", { unit: "KN" }),
    f("bale_dimensions", "ابعاد عدل", "Bale Dimensions", "TEXT"),
    f("throughput_tph", "ظرفیت پرس", "Baling Throughput", "DECIMAL", { unit: "T/H" }),
    f("cycle_time_s", "زمان سیکل", "Cycle Time", "DECIMAL", { unit: "S" }),
    f("material_type", "نوع مواد", "Material Type", "MULTI_SELECT", { options: ["کاغذ", "مقوا", "پلاستیک", "فلز", "ضایعات"] }),
  ]},
  cloneTemplate("sorter", "sorting-machine", "Industrial Sorting Machine", ["sorting_method", "throughput"]),
  cloneTemplate("recycling-line", "recycling-plant", "Recycling Plant", ["input_capacity", "material_stream"], [
    f("plant_configuration", "پیکربندی کارخانه", "Plant Configuration", "TEXT"),
    f("recovery_rate_percent", "نرخ بازیابی", "Recovery Rate", "DECIMAL", { unit: "%" }),
  ]),
  { slug: "waste-compactor", label: "Waste Compactor", required: ["compaction_force_kn", "hopper_volume_m3"], fields: [
    f("compactor_type", "نوع کمپکتور", "Compactor Type", "SELECT", { options: ["ثابت", "متحرک", "کانتینری", "ایستگاهی"] }),
    f("compaction_force_kn", "نیروی تراکم", "Compaction Force", "DECIMAL", { unit: "KN" }),
    f("hopper_volume_m3", "حجم هاپر", "Hopper Volume", "DECIMAL", { unit: "M3" }),
    f("compaction_ratio", "نسبت تراکم", "Compaction Ratio", "TEXT"),
    f("cycle_time_s", "زمان سیکل", "Cycle Time", "DECIMAL", { unit: "S" }),
    f("drive_power_kw", "توان محرک", "Drive Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "glass-recycling", label: "Glass Recycling Equipment", required: ["throughput_tph", "glass_size_range"], fields: [
    f("throughput_tph", "ظرفیت فرآوری شیشه", "Glass Processing Throughput", "DECIMAL", { unit: "T/H" }),
    f("glass_size_range", "محدوده اندازه شیشه ورودی", "Glass Feed Size Range", "TEXT"),
    f("sorting_method", "روش جداسازی", "Sorting Method", "MULTI_SELECT", { options: ["نوری", "رنگی", "مغناطیسی", "سرند", "دستی"] }),
    f("contamination_limit", "حد مجاز ناخالصی", "Contamination Limit", "TEXT"),
    f("cullet_output_size", "اندازه خرده‌شیشه خروجی", "Cullet Output Size", "TEXT"),
  ]},
  { slug: "plastic-recycling", label: "Plastic Recycling Line", required: ["throughput_tph", "polymer_types"], fields: [
    f("throughput_tph", "ظرفیت فرآوری پلاستیک", "Plastic Processing Throughput", "DECIMAL", { unit: "T/H" }),
    f("polymer_types", "انواع پلیمر", "Polymer Types", "MULTI_SELECT", { options: ["PET", "HDPE", "LDPE", "PP", "PVC", "PS", "ABS"] }),
    f("washing_stages", "مراحل شستشو", "Washing Stages", "INTEGER"),
    f("shredding_capacity_tph", "ظرفیت خردایش", "Shredding Capacity", "DECIMAL", { unit: "T/H" }),
    f("pelletizing_system", "سامانه گرانول‌سازی", "Pelletizing System", "BOOLEAN"),
    f("extruder_type", "نوع اکسترودر", "Extruder Type", "TEXT"),
  ]},
  { slug: "metal-recycling", label: "Metal Recycling Equipment", required: ["throughput_tph", "metal_types"], fields: [
    f("throughput_tph", "ظرفیت فرآوری فلز", "Metal Processing Throughput", "DECIMAL", { unit: "T/H" }),
    f("metal_types", "انواع فلز", "Metal Types", "MULTI_SELECT", { options: ["آهنی", "آلومینیوم", "مس", "استنلس", "قراضه مخلوط"] }),
    f("shear_force_kn", "نیروی قیچی", "Shear Force", "DECIMAL", { unit: "KN" }),
    f("shredder_type", "نوع خردکن", "Shredder Type", "TEXT"),
    f("magnetic_separation", "جداسازی مغناطیسی", "Magnetic Separation", "BOOLEAN"),
    f("baling_force_kn", "نیروی پرس عدل", "Baling Force", "DECIMAL", { unit: "KN" }),
  ]},
  { slug: "construction-waste-recycling", label: "Construction Waste Recycling Plant", required: ["throughput_tph", "feed_size_range"], fields: [
    f("throughput_tph", "ظرفیت فرآوری پسماند", "Processing Throughput", "DECIMAL", { unit: "T/H" }),
    f("feed_size_range", "محدوده اندازه خوراک", "Feed Size Range", "TEXT"),
    f("crusher_type", "نوع سنگ‌شکن", "Crusher Type", "TEXT"),
    f("screening_stages", "مراحل سرند", "Screening Stages", "INTEGER"),
    f("dust_suppression", "کنترل گردوغبار", "Dust Suppression", "BOOLEAN"),
    f("recovered_materials", "مواد بازیافتی", "Recovered Materials", "MULTI_SELECT", { options: ["بتن", "آجر", "آسفالت", "فلز", "چوب"] }),
  ]},
  cloneTemplate("asphalt-recycling", "asphalt-recycling-machine", "Asphalt Recycling Machine", ["milling_width", "recycling_depth"]),

  // Tunnel and underground construction machinery.
  { slug: "tbm", label: "Tunnel Boring Machine", required: ["cutterhead_diameter_m", "thrust_force_kn"], fields: [
    f("cutterhead_diameter_m", "قطر کله‌حفار", "Cutterhead Diameter", "DECIMAL", { unit: "M", filterable: true }),
    f("thrust_force_kn", "نیروی رانش", "Thrust Force", "DECIMAL", { unit: "KN" }),
    f("cutterhead_torque_knm", "گشتاور کله‌حفار", "Cutterhead Torque", "DECIMAL", { unit: "KNM" }),
    f("advance_rate_m_day", "سرعت پیشروی", "Advance Rate", "DECIMAL", { unit: "M/DAY" }),
    f("segment_length_m", "طول سگمنت", "Segment Length", "DECIMAL", { unit: "M" }),
    f("tunnel_diameter_m", "قطر نهایی تونل", "Tunnel Diameter", "DECIMAL", { unit: "M" }),
    f("ground_condition_range", "محدوده شرایط زمین", "Ground Condition Range", "TEXT"),
  ]},
  { slug: "roadheader", label: "Roadheader", required: ["cutting_head_power_kw", "cutting_height_m"], fields: [
    f("cutting_head_power_kw", "توان کله‌برش", "Cutting Head Power", "DECIMAL", { unit: "KW" }),
    f("cutting_height_m", "ارتفاع برش", "Cutting Height", "DECIMAL", { unit: "M" }),
    f("cutting_width_m", "عرض برش", "Cutting Width", "DECIMAL", { unit: "M" }),
    f("cutting_force_kn", "نیروی برش", "Cutting Force", "DECIMAL", { unit: "KN" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("conveyor_capacity_tph", "ظرفیت نقاله", "Conveyor Capacity", "DECIMAL", { unit: "T/H" }),
  ]},
  cloneTemplate("jumbo-drill", "tunnel-jumbo", "Tunneling Jumbo", ["boom_count", "drilling_coverage"]),
  cloneTemplate("lhd", "underground-lhd", "Underground Load Haul Dump", ["bucket_capacity", "payload_capacity"], [
    f("overall_height_mm", "ارتفاع کلی", "Overall Height", "DECIMAL", { unit: "MM" }),
    f("low_profile_configuration", "پیکربندی کم‌ارتفاع", "Low Profile Configuration", "BOOLEAN"),
  ]),
  cloneTemplate("underground-dump-truck", "underground-truck-machine", "Underground Haul Truck", ["overall_height_mm"], [
    f("ventilation_requirement", "نیاز تهویه", "Ventilation Requirement", "TEXT"),
    f("fire_suppression_system", "سامانه اطفای حریق", "Fire Suppression System", "BOOLEAN"),
  ]),
  { slug: "bolter", label: "Underground Rock Bolter", required: ["bolt_length_m", "drill_count"], fields: [
    f("bolt_length_m", "طول بولت", "Bolt Length", "DECIMAL", { unit: "M" }),
    f("drill_count", "تعداد واحد حفاری", "Drill Count", "INTEGER"),
    f("drilling_coverage", "پوشش حفاری", "Drilling Coverage", "TEXT"),
    f("bolt_type", "نوع بولت", "Bolt Type", "TEXT"),
    f("resin_injection_system", "سامانه تزریق رزین", "Resin Injection System", "BOOLEAN"),
    f("machine_width_mm", "عرض دستگاه", "Machine Width", "DECIMAL", { unit: "MM" }),
  ]},
  { slug: "scaling-machine", label: "Underground Scaling Machine", required: ["boom_reach", "scaling_tool_type"], fields: [
    f("boom_reach", "برد بوم", "Boom Reach", "DECIMAL", { unit: "M" }),
    f("scaling_tool_type", "نوع ابزار لق‌گیری", "Scaling Tool Type", "SELECT", { options: ["چکش هیدرولیک", "ریپر", "قلم", "ابزار ترکیبی"] }),
    f("working_height_m", "ارتفاع کاری", "Working Height", "DECIMAL", { unit: "M" }),
    f("hydraulic_flow", "دبی هیدرولیک", "Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "underground-utility-vehicle", label: "Underground Utility Vehicle", required: ["payload_capacity", "power_source"], fields: [
    f("payload_capacity", "ظرفیت حمل", "Payload Capacity", "DECIMAL", { unit: "TON" }),
    f("passenger_capacity", "ظرفیت نفرات", "Passenger Capacity", "INTEGER"),
    f("power_source", "منبع نیرو", "Power Source", "SELECT", { options: ["دیزلی", "برقی کابلی", "باتری"] }),
    f("overall_height_mm", "ارتفاع کلی", "Overall Height", "DECIMAL", { unit: "MM" }),
    f("overall_width_mm", "عرض کلی", "Overall Width", "DECIMAL", { unit: "MM" }),
    f("ventilation_requirement", "نیاز تهویه", "Ventilation Requirement", "TEXT"),
  ]},
  { slug: "tunnel-equipment", label: "Tunnel Construction Equipment", required: ["equipment_type", "working_capacity"], fields: [
    f("equipment_type", "نوع تجهیزات تونل", "Equipment Type", "TEXT"),
    f("working_capacity", "ظرفیت کاری", "Working Capacity", "TEXT"),
    f("tunnel_profile_range", "محدوده مقطع تونل", "Tunnel Profile Range", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
    f("dust_suppression", "کنترل گردوغبار", "Dust Suppression", "BOOLEAN"),
  ]},

  // Heavy industrial and production machinery.
  { slug: "steel-machinery", label: "Steel Processing Machinery", required: ["process_type", "material_thickness_mm"], fields: [
    f("process_type", "فرآیند", "Process Type", "MULTI_SELECT", { options: ["نورد", "برش", "خم‌کاری", "پرس", "پروفیل‌سازی", "کشش"] }),
    f("material_thickness_mm", "ضخامت ماده", "Material Thickness", "DECIMAL", { unit: "MM" }),
    f("working_width_mm", "عرض کاری", "Working Width", "DECIMAL", { unit: "MM" }),
    f("production_capacity", "ظرفیت تولید", "Production Capacity", "TEXT"),
    f("drive_power_kw", "توان محرک", "Drive Power", "DECIMAL", { unit: "KW" }),
    f("control_system", "سیستم کنترل", "Control System", "TEXT"),
  ]},
  { slug: "cement-machinery", label: "Cement Plant Machinery", required: ["equipment_type", "capacity_tpd"], fields: [
    f("equipment_type", "نوع تجهیزات سیمان", "Equipment Type", "SELECT", { options: ["کوره", "آسیاب مواد", "آسیاب سیمان", "کولر کلینکر", "سنگ‌شکن", "سپراتور"] }),
    f("capacity_tpd", "ظرفیت تولید روزانه", "Daily Capacity", "DECIMAL", { unit: "T/DAY" }),
    f("operating_temperature_c", "دمای کاری", "Operating Temperature", "DECIMAL", { unit: "C" }),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
    f("process_stage", "مرحله فرآیند", "Process Stage", "TEXT"),
  ]},
  { slug: "mineral-processing-machinery", label: "Mineral Processing Machinery", required: ["throughput_tph", "separation_method"], fields: [
    f("throughput_tph", "ظرفیت فرآوری", "Processing Throughput", "DECIMAL", { unit: "T/H" }),
    f("separation_method", "روش جداسازی", "Separation Method", "MULTI_SELECT", { options: ["ثقلی", "مغناطیسی", "فلوتاسیون", "لیچینگ", "الکترواستاتیک"] }),
    f("feed_size_range", "محدوده اندازه خوراک", "Feed Size Range", "TEXT"),
    f("product_grade", "عیار محصول", "Product Grade", "TEXT"),
    f("water_consumption_m3h", "مصرف آب", "Water Consumption", "DECIMAL", { unit: "M3/H" }),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "stone-cutting-machinery", label: "Stone Cutting Machinery", required: ["cutting_method", "cutting_thickness_mm"], fields: [
    f("cutting_method", "روش برش", "Cutting Method", "SELECT", { options: ["دیسک", "سیم الماسه", "اره پل", "واترجت"] }),
    f("cutting_thickness_mm", "ضخامت برش", "Cutting Thickness", "DECIMAL", { unit: "MM" }),
    f("cutting_length_mm", "طول برش", "Cutting Length", "DECIMAL", { unit: "MM" }),
    f("blade_diameter_mm", "قطر تیغه", "Blade Diameter", "DECIMAL", { unit: "MM" }),
    f("table_size_mm", "ابعاد میز", "Table Size", "TEXT"),
    f("motor_power_kw", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "glass-machinery", label: "Glass Processing Machinery", required: ["process_type", "glass_thickness_mm"], fields: [
    f("process_type", "فرآیند شیشه", "Glass Process", "MULTI_SELECT", { options: ["برش", "لبه‌زنی", "سوراخ‌کاری", "سکوریت", "لمینیت", "چاپ"] }),
    f("glass_thickness_mm", "ضخامت شیشه", "Glass Thickness", "DECIMAL", { unit: "MM" }),
    f("working_width_mm", "عرض کاری", "Working Width", "DECIMAL", { unit: "MM" }),
    f("line_speed_m_min", "سرعت خط", "Line Speed", "DECIMAL", { unit: "M/MIN" }),
    f("max_glass_size", "حداکثر ابعاد شیشه", "Maximum Glass Size", "TEXT"),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "ceramic-machinery", label: "Ceramic Processing Machinery", required: ["process_type", "production_capacity"], fields: [
    f("process_type", "فرآیند سرامیک", "Ceramic Process", "MULTI_SELECT", { options: ["آماده‌سازی مواد", "پرس", "اکستروژن", "خشک‌کن", "کوره", "لعاب‌زنی"] }),
    f("production_capacity", "ظرفیت تولید", "Production Capacity", "TEXT"),
    f("kiln_temperature_c", "دمای کوره", "Kiln Temperature", "DECIMAL", { unit: "C" }),
    f("kiln_length_m", "طول کوره", "Kiln Length", "DECIMAL", { unit: "M" }),
    f("automation_level", "سطح اتوماسیون", "Automation Level", "SELECT", { options: ["دستی", "نیمه‌خودکار", "تمام‌خودکار"] }),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "industrial-production", label: "Industrial Production Machinery", required: ["machine_type", "production_capacity"], fields: [
    f("machine_type", "نوع ماشین تولیدی", "Machine Type", "TEXT"),
    f("production_capacity", "ظرفیت تولید", "Production Capacity", "TEXT"),
    f("process_type", "فرآیند تولید", "Production Process", "TEXT"),
    f("automation_level", "سطح اتوماسیون", "Automation Level", "SELECT", { options: ["دستی", "نیمه‌خودکار", "تمام‌خودکار"] }),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
    f("line_length_m", "طول خط", "Line Length", "DECIMAL", { unit: "M" }),
  ]},
  { slug: "industrial-packaging", label: "Industrial Packaging Machinery", required: ["packaging_type", "line_speed_ppm"], fields: [
    f("packaging_type", "نوع بسته‌بندی", "Packaging Type", "MULTI_SELECT", { options: ["پرکن", "درب‌بند", "لیبل‌زن", "شرینک", "کارتن‌گذار", "پالتایزر"] }),
    f("line_speed_ppm", "سرعت خط", "Line Speed", "DECIMAL", { unit: "PPM" }),
    f("package_size_range", "محدوده ابعاد بسته", "Package Size Range", "TEXT"),
    f("filling_accuracy", "دقت پرکن", "Filling Accuracy", "TEXT"),
    f("automation_level", "سطح اتوماسیون", "Automation Level", "SELECT", { options: ["دستی", "نیمه‌خودکار", "تمام‌خودکار"] }),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "heavy-factory-equipment", label: "Heavy Factory Equipment", required: ["equipment_type", "rated_capacity"], fields: [
    f("equipment_type", "نوع تجهیزات کارخانه", "Equipment Type", "TEXT"),
    f("rated_capacity", "ظرفیت نامی", "Rated Capacity", "TEXT"),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("operating_temperature_c", "دمای کاری", "Operating Temperature", "DECIMAL", { unit: "C" }),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
    f("overall_dimensions", "ابعاد کلی", "Overall Dimensions", "TEXT"),
  ]},

  // Power, energy and mobile utility machinery.
  { slug: "generator", label: "Industrial Generator Set", required: ["rated_power_kw", "output_voltage_v", "frequency_hz"], fields: [
    f("rated_power_kw", "توان نامی", "Rated Power", "DECIMAL", { unit: "KW", filterable: true }),
    f("standby_power_kw", "توان اضطراری", "Standby Power", "DECIMAL", { unit: "KW" }),
    f("output_voltage_v", "ولتاژ خروجی", "Output Voltage", "DECIMAL", { unit: "V" }),
    f("frequency_hz", "فرکانس", "Frequency", "INTEGER", { unit: "HZ" }),
    f("phase_count", "تعداد فاز", "Phase Count", "INTEGER"),
    f("power_factor", "ضریب توان", "Power Factor", "DECIMAL"),
    f("cooling_type", "نوع خنک‌کاری", "Cooling Type", "TEXT"),
  ]},
  cloneTemplate("generator", "diesel-generator", "Diesel Generator", ["rated_power_kw", "output_voltage_v", "frequency_hz"], [
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("fuel_tank_capacity", "ظرفیت مخزن سوخت", "Fuel Tank Capacity", "DECIMAL", { unit: "L" }),
    f("fuel_consumption", "مصرف سوخت", "Fuel Consumption", "TEXT"),
  ]),
  cloneTemplate("generator", "gas-generator", "Gas Generator", ["rated_power_kw", "output_voltage_v", "frequency_hz"], [
    f("gas_type", "نوع گاز", "Gas Type", "SELECT", { options: ["گاز طبیعی", "LPG", "بیوگاز"] }),
    f("gas_pressure_bar", "فشار ورودی گاز", "Gas Inlet Pressure", "DECIMAL", { unit: "BAR" }),
    f("gas_consumption", "مصرف گاز", "Gas Consumption", "TEXT"),
  ]),
  cloneTemplate("generator", "natural-gas-generator", "Natural Gas Generator", ["rated_power_kw", "output_voltage_v", "frequency_hz"], [
    f("gas_inlet_pressure_bar", "فشار ورودی گاز طبیعی", "Natural Gas Inlet Pressure", "DECIMAL", { unit: "BAR" }),
    f("gas_consumption", "مصرف گاز", "Gas Consumption", "TEXT"),
    f("emission_standard", "استاندارد آلایندگی", "Emission Standard", "TEXT"),
  ]),
  cloneTemplate("generator", "bi-fuel-generator", "Bi-Fuel Generator", ["rated_power_kw", "output_voltage_v", "frequency_hz"], [
    f("secondary_fuel_type", "سوخت دوم", "Secondary Fuel Type", "TEXT"),
    f("fuel_switching_system", "سامانه تغییر سوخت", "Fuel Switching System", "BOOLEAN"),
  ]),
  cloneTemplate("generator", "hybrid-generator", "Hybrid Generator", ["rated_power_kw", "output_voltage_v", "frequency_hz"], [
    f("battery_capacity_kwh", "ظرفیت باتری", "Battery Capacity", "DECIMAL", { unit: "KWH" }),
    f("energy_storage_type", "نوع ذخیره‌ساز انرژی", "Energy Storage Type", "TEXT"),
    f("hybrid_controller", "کنترلر هیبرید", "Hybrid Controller", "BOOLEAN"),
  ]),
  cloneTemplate("generator", "mobile-generator", "Mobile Generator", ["rated_power_kw", "output_voltage_v", "frequency_hz"], [
    f("trailer_mounted", "نصب روی تریلر", "Trailer Mounted", "BOOLEAN"),
    f("transport_dimensions", "ابعاد حمل", "Transport Dimensions", "TEXT"),
    f("road_registration", "قابلیت شماره‌گذاری جاده‌ای", "Road Registration", "BOOLEAN"),
  ]),
  cloneTemplate("generator", "silent-generator", "Silent Generator", ["rated_power_kw", "output_voltage_v", "frequency_hz"], [
    f("noise_level_dba", "سطح صدا", "Noise Level", "DECIMAL", { unit: "DBA" }),
    f("canopy_type", "نوع کانوپی", "Canopy Type", "TEXT"),
    f("sound_attenuation_db", "کاهش صدا", "Sound Attenuation", "DECIMAL", { unit: "DB" }),
  ]),
  cloneTemplate("generator", "containerized-generator", "Containerized Generator", ["rated_power_kw", "output_voltage_v", "frequency_hz"], [
    f("container_size_ft", "ابعاد کانتینر", "Container Size", "SELECT", { options: ["10ft", "20ft", "40ft"] }),
    f("fire_suppression_system", "سامانه اطفای حریق", "Fire Suppression System", "BOOLEAN"),
    f("ventilation_system", "سامانه تهویه", "Ventilation System", "BOOLEAN"),
  ]),
  cloneTemplate("generator", "trailer-generator", "Trailer Generator", ["rated_power_kw", "output_voltage_v", "frequency_hz"], [
    f("trailer_axle_count", "تعداد محور تریلر", "Trailer Axle Count", "INTEGER"),
    f("trailer_brake_system", "سیستم ترمز تریلر", "Trailer Brake System", "TEXT"),
    f("transport_dimensions", "ابعاد حمل", "Transport Dimensions", "TEXT"),
  ]),
  { slug: "pump", label: "Industrial Pump", required: ["pump_flow_lpm", "pump_head_m", "motor_power_kw"], fields: [
    f("pump_type", "نوع پمپ", "Pump Type", "SELECT", { options: ["گریز از مرکز", "جابجایی مثبت", "دنده‌ای", "پیستونی", "دیافراگمی", "اسکرو"] }),
    f("pump_flow_lpm", "دبی پمپ", "Pump Flow", "DECIMAL", { unit: "LPM" }),
    f("pump_head_m", "هد پمپ", "Pump Head", "DECIMAL", { unit: "M" }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("motor_power_kw", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
    f("liquid_compatibility", "سازگاری سیال", "Liquid Compatibility", "TEXT"),
    f("suction_size_mm", "قطر مکش", "Suction Size", "DECIMAL", { unit: "MM" }),
  ]},
  { slug: "power-pack", label: "Hydraulic Power Pack", required: ["hydraulic_flow", "hydraulic_pressure"], fields: [
    f("hydraulic_flow", "دبی هیدرولیک", "Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("hydraulic_pressure", "فشار هیدرولیک", "Hydraulic Pressure", "DECIMAL", { unit: "BAR" }),
    f("reservoir_capacity_l", "ظرفیت مخزن روغن", "Reservoir Capacity", "DECIMAL", { unit: "L" }),
    f("motor_power_kw", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
    f("pump_configuration", "پیکربندی پمپ", "Pump Configuration", "TEXT"),
    f("cooling_system", "سیستم خنک‌کاری", "Cooling System", "TEXT"),
  ]},
  { slug: "portable-power", label: "Portable Power Equipment", required: ["output_power_kw", "output_voltage_v"], fields: [
    f("equipment_type", "نوع تجهیزات برق سیار", "Equipment Type", "TEXT"),
    f("output_power_kw", "توان خروجی", "Output Power", "DECIMAL", { unit: "KW" }),
    f("output_voltage_v", "ولتاژ خروجی", "Output Voltage", "DECIMAL", { unit: "V" }),
    f("frequency_hz", "فرکانس", "Frequency", "INTEGER", { unit: "HZ" }),
    f("runtime_hours", "زمان کارکرد", "Runtime", "DECIMAL", { unit: "HOUR" }),
    f("fuel_or_battery", "سوخت یا باتری", "Fuel or Battery", "TEXT"),
  ]},
  cloneTemplate("welding-equipment", "industrial-welding", "Industrial Welding Equipment", ["welding_process", "output_current"]),
  { slug: "project-lighting", label: "Mobile Project Lighting Tower", required: ["mast_height_m", "light_output_lumens"], fields: [
    f("mast_height_m", "ارتفاع دکل", "Mast Height", "DECIMAL", { unit: "M" }),
    f("light_output_lumens", "شار نوری", "Light Output", "DECIMAL", { unit: "LUMEN" }),
    f("light_head_count", "تعداد چراغ", "Light Head Count", "INTEGER"),
    f("generator_output_power_kw", "توان ژنراتور", "Generator Output Power", "DECIMAL", { unit: "KW" }),
    f("fuel_tank_capacity", "ظرفیت مخزن سوخت", "Fuel Tank Capacity", "DECIMAL", { unit: "L" }),
    f("mast_extension_type", "نوع بازشدن دکل", "Mast Extension Type", "SELECT", { options: ["دستی", "هیدرولیکی"] }),
  ]},
  cloneTemplate("hvac-equipment", "industrial-hvac", "Industrial HVAC Equipment", ["cooling_capacity", "equipment_type"], [
    f("industrial_duty_rating", "رتبه کارکرد صنعتی", "Industrial Duty Rating", "TEXT"),
    f("corrosion_protection", "حفاظت خوردگی", "Corrosion Protection", "TEXT"),
  ]},

  // Municipal and environmental machinery.
  { slug: "garbage-truck", label: "Garbage Collection Truck", required: ["body_volume_m3", "compaction_ratio"], fields: [
    f("body_volume_m3", "حجم مخزن زباله", "Body Volume", "DECIMAL", { unit: "M3", filterable: true }),
    f("compaction_ratio", "نسبت فشرده‌سازی", "Compaction Ratio", "TEXT"),
    f("loading_system", "سامانه بارگیری", "Loading System", "SELECT", { options: ["عقب‌بار", "جلو‌بار", "کنار‌بار", "مخزن‌بر"] }),
    f("payload_capacity", "ظرفیت بار مفید", "Payload Capacity", "DECIMAL", { unit: "TON" }),
    f("container_lift_capacity", "ظرفیت بالابر مخزن", "Container Lift Capacity", "DECIMAL", { unit: "KG" }),
    f("chassis_axle_configuration", "آرایش محور شاسی", "Chassis Axle Configuration", "TEXT"),
  ]},
  { slug: "street-sweeper", label: "Street Sweeper", required: ["sweeping_width_m", "hopper_volume_m3"], fields: [
    f("sweeping_width_m", "عرض جاروب", "Sweeping Width", "DECIMAL", { unit: "M" }),
    f("hopper_volume_m3", "حجم مخزن زباله", "Hopper Volume", "DECIMAL", { unit: "M3" }),
    f("brush_count", "تعداد برس", "Brush Count", "INTEGER"),
    f("vacuum_system", "سامانه مکش", "Vacuum System", "BOOLEAN"),
    f("water_tank_capacity_l", "ظرفیت مخزن آب", "Water Tank Capacity", "DECIMAL", { unit: "L" }),
    f("filter_type", "نوع فیلتر", "Filter Type", "TEXT"),
  ]},
  { slug: "street-washer", label: "Street Washing Truck", required: ["water_tank_capacity_l", "spray_width_m"], fields: [
    f("water_tank_capacity_l", "ظرفیت مخزن آب", "Water Tank Capacity", "DECIMAL", { unit: "L" }),
    f("spray_width_m", "عرض پاشش", "Spray Width", "DECIMAL", { unit: "M" }),
    f("pump_pressure_bar", "فشار پمپ", "Pump Pressure", "DECIMAL", { unit: "BAR" }),
    f("water_flow_m3h", "دبی آب", "Water Flow", "DECIMAL", { unit: "M3/H" }),
    f("nozzle_count", "تعداد نازل", "Nozzle Count", "INTEGER"),
  ]},
  { slug: "vacuum-truck", label: "Industrial Vacuum Truck", required: ["tank_volume_l", "vacuum_pressure_kpa"], fields: [
    f("tank_volume_l", "حجم مخزن", "Tank Volume", "DECIMAL", { unit: "L", filterable: true }),
    f("vacuum_pressure_kpa", "فشار خلأ", "Vacuum Pressure", "DECIMAL", { unit: "KPA" }),
    f("vacuum_flow_m3h", "دبی مکش", "Vacuum Flow", "DECIMAL", { unit: "M3/H" }),
    f("hose_length_m", "طول شیلنگ", "Hose Length", "DECIMAL", { unit: "M" }),
    f("debris_type", "نوع مواد مکش‌شونده", "Debris Type", "TEXT"),
    f("tank_unloading_method", "روش تخلیه مخزن", "Tank Unloading Method", "TEXT"),
  ]},
  { slug: "snow-plow", label: "Snow Plow", required: ["blade_width_m", "plow_angle_deg"], fields: [
    f("blade_width_m", "عرض تیغه برف‌روب", "Blade Width", "DECIMAL", { unit: "M" }),
    f("plow_angle_deg", "زاویه تیغه", "Plow Angle", "DECIMAL", { unit: "DEG" }),
    f("blade_height_mm", "ارتفاع تیغه", "Blade Height", "DECIMAL", { unit: "MM" }),
    f("mounting_type", "نوع اتصال", "Mounting Type", "TEXT"),
    f("hydraulic_lift", "بالابر هیدرولیک", "Hydraulic Lift", "BOOLEAN"),
  ]},
  { slug: "salt-spreader", label: "Road Salt Spreader", required: ["hopper_volume_m3", "spread_width_m"], fields: [
    f("hopper_volume_m3", "حجم مخزن", "Hopper Volume", "DECIMAL", { unit: "M3" }),
    f("spread_width_m", "عرض پخش", "Spread Width", "DECIMAL", { unit: "M" }),
    f("spread_rate_kg_km", "نرخ پخش", "Spread Rate", "DECIMAL", { unit: "KG/KM" }),
    f("material_type", "نوع ماده پخش‌شونده", "Material Type", "MULTI_SELECT", { options: ["نمک", "شن", "ماسه", "ضدیخ"] }),
    f("drive_type", "نوع محرک", "Drive Type", "SELECT", { options: ["هیدرولیک", "برقی", "مکانیکی"] }),
  ]},
  { slug: "municipal-service-truck", label: "Municipal Service Truck", required: ["vehicle_type", "payload_capacity"], fields: [
    f("vehicle_type", "نوع خودروی خدمات شهری", "Vehicle Type", "TEXT"),
    f("payload_capacity", "ظرفیت بار مفید", "Payload Capacity", "DECIMAL", { unit: "TON" }),
    f("equipment_body_type", "نوع بدنه تجهیزاتی", "Equipment Body Type", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
    f("auxiliary_hydraulic_system", "هیدرولیک کمکی", "Auxiliary Hydraulic System", "BOOLEAN"),
  ]},
  { slug: "heavy-green-space", label: "Heavy Green Space Maintenance Machinery", required: ["equipment_type", "working_width_m"], fields: [
    f("equipment_type", "نوع ماشین فضای سبز", "Equipment Type", "SELECT", { options: ["چمن‌زن سنگین", "درخت‌زن", "چیپر", "مالچر", "جاروب محوطه"] }),
    f("working_width_m", "عرض کاری", "Working Width", "DECIMAL", { unit: "M" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("collection_capacity_m3", "ظرفیت جمع‌آوری", "Collection Capacity", "DECIMAL", { unit: "M3" }),
    f("terrain_type", "نوع زمین", "Terrain Type", "TEXT"),
  ]},
  { slug: "environmental-machinery", label: "Environmental Protection Machinery", required: ["equipment_type", "processing_capacity"], fields: [
    f("equipment_type", "نوع تجهیزات محیط‌زیستی", "Equipment Type", "TEXT"),
    f("processing_capacity", "ظرفیت فرآوری", "Processing Capacity", "TEXT"),
    f("pollutant_type", "نوع آلاینده", "Pollutant Type", "MULTI_SELECT", { options: ["گردوغبار", "گاز", "فاضلاب", "پسماند جامد", "روغن"] }),
    f("treatment_method", "روش تصفیه", "Treatment Method", "TEXT"),
    f("emission_standard", "استاندارد آلایندگی", "Emission Standard", "TEXT"),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
  ]},

  // Special project machinery and reviewed fallback categories.
  { slug: "industrial-rescue", label: "Industrial Rescue Machinery", required: ["equipment_type", "lifting_capacity"], fields: [
    f("equipment_type", "نوع تجهیزات امداد صنعتی", "Equipment Type", "TEXT"),
    f("lifting_capacity", "ظرفیت بالابری", "Lifting Capacity", "DECIMAL", { unit: "TON" }),
    f("working_reach_m", "برد کاری", "Working Reach", "DECIMAL", { unit: "M" }),
    f("access_height_m", "ارتفاع دسترسی", "Access Height", "DECIMAL", { unit: "M" }),
    f("rescue_configuration", "پیکربندی امداد", "Rescue Configuration", "TEXT"),
  ]},
  { slug: "military-engineering", label: "Military Engineering Machinery", required: ["equipment_type", "engineering_application"], fields: [
    f("equipment_type", "نوع ماشین مهندسی", "Equipment Type", "TEXT"),
    f("engineering_application", "کاربرد مهندسی", "Engineering Application", "MULTI_SELECT", { options: ["خاک‌برداری", "پل‌سازی", "پاکسازی مسیر", "حمل", "تخریب سازه"] }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("working_capacity", "ظرفیت کاری", "Working Capacity", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
  ]},
  { slug: "industrial-fire-truck", label: "Industrial Fire Truck", required: ["water_tank_capacity_l", "pump_flow_lpm"], fields: [
    f("water_tank_capacity_l", "ظرفیت مخزن آب", "Water Tank Capacity", "DECIMAL", { unit: "L" }),
    f("foam_tank_capacity_l", "ظرفیت مخزن فوم", "Foam Tank Capacity", "DECIMAL", { unit: "L" }),
    f("pump_flow_lpm", "دبی پمپ آتش‌نشانی", "Fire Pump Flow", "DECIMAL", { unit: "LPM" }),
    f("pump_pressure_bar", "فشار پمپ", "Pump Pressure", "DECIMAL", { unit: "BAR" }),
    f("ladder_reach_m", "برد نردبان", "Ladder Reach", "DECIMAL", { unit: "M" }),
    f("crew_capacity", "ظرفیت خدمه", "Crew Capacity", "INTEGER"),
  ]},
  { slug: "airport-machinery", label: "Airport Ground Support Equipment", required: ["equipment_type", "operating_capacity"], fields: [
    f("equipment_type", "نوع تجهیزات فرودگاهی", "Equipment Type", "SELECT", { options: ["تراکتور پوش‌بک", "لودر بار", "دی‌آیسینگ", "تجهیزات سوخت‌رسانی", "پله متحرک", "ژنراتور زمینی"] }),
    f("operating_capacity", "ظرفیت عملیاتی", "Operating Capacity", "TEXT"),
    f("vehicle_drive_type", "نوع محرک", "Vehicle Drive Type", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
    f("airport_compatibility", "سازگاری عملیاتی فرودگاه", "Airport Compatibility", "TEXT"),
  ]},
  { slug: "special-project-machinery", label: "Special Project Machinery", required: ["project_application", "machine_configuration"], fields: [
    f("project_application", "کاربرد پروژه", "Project Application", "TEXT"),
    f("machine_configuration", "پیکربندی ماشین", "Machine Configuration", "LONG_TEXT"),
    f("operating_capacity", "ظرفیت عملیاتی", "Operating Capacity", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
    f("project_specific_compliance", "استانداردهای پروژه", "Project Specific Compliance", "TEXT"),
  ]},
  { slug: "custom-machinery", label: "Custom Built Machinery", required: ["machine_purpose", "technical_description"], fields: [
    f("machine_purpose", "کاربری ماشین", "Machine Purpose", "TEXT"),
    f("technical_description", "شرح فنی", "Technical Description", "LONG_TEXT"),
    f("custom_design_reference", "مرجع طراحی سفارشی", "Custom Design Reference", "TEXT"),
    f("rated_capacity", "ظرفیت نامی", "Rated Capacity", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
  ]},
  { slug: "prototype-machinery", label: "Prototype Machinery", required: ["prototype_stage", "technical_description"], fields: [
    f("prototype_stage", "مرحله نمونه‌سازی", "Prototype Stage", "SELECT", { options: ["مفهومی", "نمونه اولیه", "آزمایش میدانی", "پیش‌تولید"] }),
    f("technical_description", "شرح فنی", "Technical Description", "LONG_TEXT"),
    f("test_status", "وضعیت آزمون", "Test Status", "TEXT"),
    f("rated_capacity", "ظرفیت هدف", "Target Capacity", "TEXT"),
    f("compliance_status", "وضعیت انطباق", "Compliance Status", "TEXT"),
  ]},
  { slug: "new-special", label: "New Specialist Machinery", required: ["machine_type", "technical_description"], fields: [
    f("machine_type", "نوع ماشین", "Machine Type", "TEXT"),
    f("technical_description", "شرح فنی", "Technical Description", "LONG_TEXT"),
    f("intended_application", "کاربرد موردنظر", "Intended Application", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
    f("review_required", "نیازمند بررسی فنی", "Technical Review Required", "BOOLEAN"),
  ]},
  { slug: "unknown-machine", label: "Unclassified Machine", required: ["machine_type", "technical_description"], fields: [
    f("machine_type", "نوع ماشین", "Machine Type", "TEXT"),
    f("technical_description", "شرح مشخصات", "Technical Description", "LONG_TEXT"),
    f("manufacturer_reference", "مرجع سازنده", "Manufacturer Reference", "TEXT"),
    f("machine_photos_available", "تصاویر فنی موجود", "Technical Images Available", "BOOLEAN"),
    f("review_required", "نیازمند بررسی فنی", "Technical Review Required", "BOOLEAN"),
  ]},
  { slug: "combination-machine", label: "Combination Machinery", required: ["machine_configuration", "technical_description"], fields: [
    f("machine_configuration", "ترکیب عملکردها", "Machine Configuration", "LONG_TEXT"),
    f("technical_description", "شرح فنی", "Technical Description", "LONG_TEXT"),
    f("primary_function", "عملکرد اصلی", "Primary Function", "TEXT"),
    f("secondary_function", "عملکرد ثانویه", "Secondary Function", "TEXT"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
  ]},
  { slug: "custom-machine", label: "Custom Machine", required: ["machine_purpose", "technical_description"], fields: [
    f("machine_purpose", "کاربری ماشین", "Machine Purpose", "TEXT"),
    f("technical_description", "شرح فنی", "Technical Description", "LONG_TEXT"),
    f("custom_design_reference", "مرجع طراحی", "Custom Design Reference", "TEXT"),
    f("rated_capacity", "ظرفیت نامی", "Rated Capacity", "TEXT"),
    f("manufacturer_reference", "مرجع سازنده", "Manufacturer Reference", "TEXT"),
  ]},
  { slug: "needs-review", label: "Needs Technical Review", required: ["machine_type", "technical_description"], fields: [
    f("machine_type", "نوع ماشین", "Machine Type", "TEXT"),
    f("technical_description", "شرح فنی", "Technical Description", "LONG_TEXT"),
    f("manufacturer_reference", "مرجع سازنده", "Manufacturer Reference", "TEXT"),
    f("supporting_document_available", "مدرک پشتیبان موجود", "Supporting Document Available", "BOOLEAN"),
    f("review_required", "نیازمند بررسی فنی", "Technical Review Required", "BOOLEAN"),
  ]},

  // Missing terminal taxonomy families identified by the 270-leaf coverage audit.
  { slug: "mini-excavator", label: "Mini Excavator", required: ["operating_weight", "bucket_capacity", "max_digging_depth"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("bucket_capacity", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3", filterable: true, card: true }),
    f("max_digging_depth", "حداکثر عمق حفاری", "Maximum Digging Depth", "DECIMAL", { unit: "M", filterable: true }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("overall_width_mm", "عرض کلی", "Overall Width", "DECIMAL", { unit: "MM" }),
    f("overall_height_mm", "ارتفاع کلی", "Overall Height", "DECIMAL", { unit: "MM" }),
    f("tail_swing_type", "نوع گردش عقب", "Tail Swing Type", "SELECT", { options: ["Zero Tail Swing", "Reduced Tail Swing", "Conventional"] }),
    f("auxiliary_hydraulic_flow_lpm", "دبی هیدرولیک کمکی", "Auxiliary Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("track_width_mm", "عرض زنجیر", "Track Width", "DECIMAL", { unit: "MM" }),
  ]},
  { slug: "asphalt-machinery", label: "Asphalt Construction Machinery", required: ["asphalt_machine_type", "working_or_production_capacity"], fields: [
    f("asphalt_machine_type", "نوع ماشین‌آلات آسفالت", "Asphalt Machine Type", "SELECT", { options: ["کارخانه آسفالت", "فینیشر", "اسکریدر و میلینگ", "قیرپاش", "بازیافت آسفالت", "توزیع‌کننده آسفالت", "تجهیزات تراکم آسفالت", "سایر"] }),
    f("working_or_production_capacity", "ظرفیت کاری یا تولید", "Working or Production Capacity", "TEXT"),
    f("paving_width_m", "عرض پخش", "Paving Width", "DECIMAL", { unit: "M" }),
    f("paving_thickness_mm", "ضخامت پخش", "Paving Thickness", "DECIMAL", { unit: "MM" }),
    f("plant_capacity_tph", "ظرفیت کارخانه", "Plant Capacity", "DECIMAL", { unit: "T/H", filterable: true }),
    f("mixing_temperature_c", "دمای اختلاط", "Mixing Temperature", "DECIMAL", { unit: "C" }),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
    f("heating_system", "سیستم گرمایش", "Heating System", "TEXT"),
    f("mobility_configuration", "پیکربندی نصب و جابه‌جایی", "Mobility Configuration", "SELECT", { options: ["ثابت", "متحرک", "نیمه‌متحرک"] }),
  ]},
  { slug: "concrete-machinery", label: "Concrete Construction Machinery", required: ["concrete_machine_type", "rated_capacity"], fields: [
    f("concrete_machine_type", "نوع ماشین‌آلات بتن", "Concrete Machine Type", "SELECT", { options: ["بچینگ پلانت", "پمپ بتن", "میکسر بتن", "فینیشر بتن", "توزیع‌کننده بتن", "بچینگ سیار", "کارخانه قطعات پیش‌ساخته", "تجهیزات شاتکریت", "سایر"] }),
    f("rated_capacity", "ظرفیت نامی", "Rated Capacity", "TEXT"),
    f("concrete_output_m3h", "ظرفیت تولید یا پمپاژ بتن", "Concrete Output", "DECIMAL", { unit: "M3/H", filterable: true }),
    f("aggregate_bin_count", "تعداد مخازن سنگدانه", "Aggregate Bin Count", "INTEGER"),
    f("mixer_volume_l", "حجم میکسر", "Mixer Volume", "DECIMAL", { unit: "L" }),
    f("pump_pressure_bar", "فشار پمپاژ", "Pumping Pressure", "DECIMAL", { unit: "BAR" }),
    f("placing_boom_reach_m", "برد بوم بتن‌ریزی", "Placing Boom Reach", "DECIMAL", { unit: "M" }),
    f("installed_power_kw", "توان نصب‌شده", "Installed Power", "DECIMAL", { unit: "KW" }),
    f("installation_configuration", "پیکربندی نصب", "Installation Configuration", "SELECT", { options: ["ثابت", "متحرک", "تریلری", "کامیونی"] }),
  ]},
  { slug: "mine-services", label: "Mining Service and Support Machinery", required: ["mine_service_equipment_type", "operating_capacity"], fields: [
    f("mine_service_equipment_type", "نوع تجهیزات خدمات معدن", "Mine Service Equipment Type", "SELECT", { options: ["خودروی سرویس و تعمیرات", "سوخت‌رسان معدن", "آب‌پاش و کنترل گردوغبار", "روغن‌کاری سیار", "خودروی امداد", "حمل نفرات", "تجهیزات تهویه", "تجهیزات ایمنی و نجات", "سایر"] }),
    f("operating_capacity", "ظرفیت عملیاتی", "Operating Capacity", "TEXT"),
    f("tank_capacity_l", "ظرفیت مخزن", "Tank Capacity", "DECIMAL", { unit: "L" }),
    f("service_bay_count", "تعداد ایستگاه سرویس", "Service Bay Count", "INTEGER"),
    f("vehicle_payload_ton", "ظرفیت حمل", "Vehicle Payload", "DECIMAL", { unit: "TON" }),
    f("mine_compatibility", "سازگاری با محیط معدن", "Mine Compatibility", "TEXT"),
    f("fire_suppression_system", "سامانه اطفای حریق", "Fire Suppression System", "BOOLEAN"),
    f("power_source", "منبع نیرو", "Power Source", "TEXT"),
  ]},
  { slug: "drill-rig", label: "General Purpose Drilling Rig", required: ["drilling_method", "max_drilling_depth_m", "max_hole_diameter_mm"], fields: [
    f("drilling_rig_type", "نوع دستگاه حفاری", "Drilling Rig Type", "SELECT", { options: ["سطحی", "زیرزمینی", "اکتشافی", "ژئوتکنیک", "چاه آب", "حفاری افقی", "حفاری عمیق", "چندمنظوره"] }),
    f("drilling_method", "روش حفاری", "Drilling Method", "SELECT", { options: ["چرخشی", "DTH", "Top Hammer", "مغزه‌گیری", "اوگر", "RC", "گل‌گردشی", "حفاری افقی"] }),
    f("max_drilling_depth_m", "حداکثر عمق حفاری", "Maximum Drilling Depth", "DECIMAL", { unit: "M", filterable: true }),
    f("max_hole_diameter_mm", "حداکثر قطر گمانه", "Maximum Hole Diameter", "DECIMAL", { unit: "MM", filterable: true }),
    f("rotary_torque_nm", "گشتاور هد چرخشی", "Rotary Torque", "DECIMAL", { unit: "NM" }),
    f("rotation_speed_rpm", "سرعت دوران", "Rotation Speed", "DECIMAL", { unit: "RPM" }),
    f("feed_force_kn", "نیروی پیشروی", "Feed Force", "DECIMAL", { unit: "KN" }),
    f("pullback_force_kn", "نیروی بیرون‌کشی", "Pullback Force", "DECIMAL", { unit: "KN" }),
    f("feed_stroke_mm", "طول کورس پیشروی", "Feed Stroke", "DECIMAL", { unit: "MM" }),
    f("mast_length_m", "طول دکل", "Mast Length", "DECIMAL", { unit: "M" }),
    f("power_pack_kw", "توان واحد محرک", "Power Pack", "DECIMAL", { unit: "KW" }),
    f("air_compressor_capacity_m3_min", "ظرفیت کمپرسور هوا", "Air Compressor Capacity", "DECIMAL", { unit: "M3/MIN" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "screen", label: "Screening and Sizing Equipment", required: ["screen_type", "screening_capacity_tph", "screen_area_m2"], fields: [
    f("screen_type", "نوع سرند", "Screen Type", "SELECT", { options: ["ویبره‌ای", "ترومل", "فلیپ‌فلو", "گریزلی", "دورانی", "آبگیر", "چندطبقه"] }),
    f("screening_capacity_tph", "ظرفیت دانه‌بندی", "Screening Capacity", "DECIMAL", { unit: "T/H", filterable: true }),
    f("screen_area_m2", "سطح سرند", "Screen Area", "DECIMAL", { unit: "M2" }),
    f("deck_count", "تعداد طبقات", "Deck Count", "INTEGER"),
    f("screening_cut_sizes_mm", "اندازه دانه‌بندی خروجی", "Screening Cut Sizes", "TEXT"),
    f("feed_size_max_mm", "حداکثر اندازه خوراک", "Maximum Feed Size", "DECIMAL", { unit: "MM" }),
    f("vibration_frequency_hz", "فرکانس ارتعاش", "Vibration Frequency", "DECIMAL", { unit: "HZ" }),
    f("drive_power_kw", "توان محرک", "Drive Power", "DECIMAL", { unit: "KW" }),
    f("wet_or_dry_screening", "نوع فرآیند", "Screening Process", "SELECT", { options: ["خشک", "تر", "قابل تبدیل"] }),
  ]},
  { slug: "heavy-haulage", label: "Heavy Haulage and Modular Transport", required: ["transport_payload_ton", "axle_line_count", "deck_length_m"], fields: [
    f("transport_payload_ton", "ظرفیت بار قابل حمل", "Transport Payload", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("axle_line_count", "تعداد خطوط محور", "Axle Line Count", "INTEGER"),
    f("axle_count_total", "تعداد کل محورها", "Total Axle Count", "INTEGER"),
    f("deck_length_m", "طول سطح بارگیری", "Deck Length", "DECIMAL", { unit: "M" }),
    f("deck_width_m", "عرض سطح بارگیری", "Deck Width", "DECIMAL", { unit: "M" }),
    f("deck_height_m", "ارتفاع سطح بارگیری", "Deck Height", "DECIMAL", { unit: "M" }),
    f("steering_type", "نوع فرمان‌پذیری", "Steering Type", "SELECT", { options: ["مکانیکی", "هیدرولیکی", "الکترونیکی", "چندمحوره مستقل"] }),
    f("suspension_type", "نوع تعلیق", "Suspension Type", "SELECT", { options: ["هیدرولیکی", "پنوماتیکی", "مکانیکی"] }),
    f("modular_configuration", "پیکربندی مدولار", "Modular Configuration", "TEXT"),
    f("power_pack_included", "واحد پاورپک همراه", "Power Pack Included", "BOOLEAN"),
    f("gross_combination_weight_ton", "وزن ناخالص ترکیبی", "Gross Combination Weight", "DECIMAL", { unit: "TON" }),
  ]},
  { slug: "compressor", label: "Industrial Air Compressor", required: ["compressor_type", "free_air_delivery_m3_min", "working_pressure_bar"], fields: [
    f("compressor_type", "نوع کمپرسور", "Compressor Type", "SELECT", { options: ["اسکرو", "پیستونی", "سانتریفیوژ", "اسکرال", "لوب", "پرتابل حفاری", "گاز فرایندی"] }),
    f("free_air_delivery_m3_min", "دبی هوای آزاد", "Free Air Delivery", "DECIMAL", { unit: "M3/MIN", filterable: true, card: true }),
    f("working_pressure_bar", "فشار کاری", "Working Pressure", "DECIMAL", { unit: "BAR", filterable: true, card: true }),
    f("maximum_pressure_bar", "حداکثر فشار", "Maximum Pressure", "DECIMAL", { unit: "BAR" }),
    f("motor_power_kw", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW", filterable: true }),
    f("drive_type", "نوع محرک", "Drive Type", "SELECT", { options: ["الکتریکی", "دیزلی", "گازی"] }),
    f("lubrication_type", "نوع روغن‌کاری", "Lubrication Type", "SELECT", { options: ["روغنی", "بدون روغن"] }),
    f("cooling_method", "روش خنک‌کاری", "Cooling Method", "SELECT", { options: ["هواخنک", "آب‌خنک"] }),
    f("receiver_tank_volume_l", "حجم مخزن هوا", "Receiver Tank Volume", "DECIMAL", { unit: "L" }),
    f("duty_cycle_percent", "ضریب کارکرد", "Duty Cycle", "DECIMAL", { unit: "%" }),
    f("noise_level_dba", "سطح صدا", "Noise Level", "DECIMAL", { unit: "DBA" }),
  ]},
  { slug: "industrial-pumps", label: "Industrial Process Pumps", required: ["industrial_pump_type", "pump_flow_m3h", "pump_head_m"], fields: [
    f("industrial_pump_type", "نوع پمپ صنعتی", "Industrial Pump Type", "SELECT", { options: ["گریز از مرکز", "چندمرحله‌ای", "دنده‌ای", "اسکرو", "پیستونی", "دیافراگمی", "لوب", "مستغرق", "دوغاب‌کش", "دوزینگ"] }),
    f("pump_flow_m3h", "دبی پمپ", "Pump Flow", "DECIMAL", { unit: "M3/H", filterable: true, card: true }),
    f("pump_head_m", "هد پمپ", "Pump Head", "DECIMAL", { unit: "M", filterable: true, card: true }),
    f("differential_pressure_bar", "اختلاف فشار", "Differential Pressure", "DECIMAL", { unit: "BAR" }),
    f("pump_efficiency_percent", "بازده پمپ", "Pump Efficiency", "DECIMAL", { unit: "%" }),
    f("npsh_required_m", "هد مکش مثبت خالص موردنیاز", "NPSH Required", "DECIMAL", { unit: "M" }),
    f("impeller_type", "نوع پروانه", "Impeller Type", "SELECT", { options: ["بسته", "نیمه‌باز", "باز", "گردابی", "چندمرحله‌ای"] }),
    f("wetted_material", "جنس قطعات در تماس با سیال", "Wetted Material", "TEXT"),
    f("seal_type", "نوع آب‌بند", "Seal Type", "SELECT", { options: ["مکانیکی", "بسته‌بندی", "مگنتی", "بدون آب‌بند"] }),
    f("solid_handling_size_mm", "حداکثر اندازه ذرات جامد", "Solids Handling Size", "DECIMAL", { unit: "MM" }),
    f("motor_power_kw", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
    f("pump_speed_rpm", "سرعت دورانی", "Pump Speed", "DECIMAL", { unit: "RPM" }),
  ]},


  { slug: "wagon-drill", label: "Wagon Drill / Surface Drill Wagon", required: ["drilling_method", "hole_diameter_min_mm", "hole_diameter_max_mm"], fields: [
    f("drilling_method", "روش حفاری", "Drilling Method", "SELECT", { options: ["DTH", "Top Hammer", "Rotary"] }),
    f("hole_diameter_min_mm", "حداقل قطر حفاری", "Minimum Hole Diameter", "DECIMAL", { unit: "MM" }),
    f("hole_diameter_max_mm", "حداکثر قطر حفاری", "Maximum Hole Diameter", "DECIMAL", { unit: "MM" }),
    f("maximum_drilling_depth_m", "حداکثر عمق حفاری", "Maximum Drilling Depth", "DECIMAL", { unit: "M" }),
    f("mast_inclination_range_deg", "محدوده زاویه دکل", "Mast Inclination Range", "TEXT"),
    f("rotary_torque_nm", "گشتاور هد چرخشی", "Rotary Torque", "DECIMAL", { unit: "NM" }),
    f("rotation_speed_rpm", "سرعت دوران", "Rotation Speed", "DECIMAL", { unit: "RPM" }),
    f("feed_force_kn", "نیروی پیشروی", "Feed Force", "DECIMAL", { unit: "KN" }),
    f("pullback_force_kn", "نیروی بیرون‌کشی", "Pullback Force", "DECIMAL", { unit: "KN" }),
    f("air_compressor_flow_m3_min", "دبی کمپرسور هوا", "Air Compressor Flow", "DECIMAL", { unit: "M3/MIN" }),
    f("air_compressor_pressure_bar", "فشار کمپرسور هوا", "Air Compressor Pressure", "DECIMAL", { unit: "BAR" }),
    f("dust_collector", "غبارگیر", "Dust Collector", "BOOLEAN"),
    f("carrier_type", "نوع شاسی واگن", "Wagon Carrier Type", "SELECT", { options: ["چرخ‌دار", "زنجیری", "ریل‌دار", "یدک‌کش"] }),
    f("travel_speed_kmh", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "KMH" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("operating_weight_ton", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
  ]},


  // Additional CATALOG roots from taxonomy V1.1: agriculture, vehicles and attachments.
  { slug: "tractor", label: "Agricultural Tractor", required: ["engine_power_kw", "drive_configuration", "pto_power_kw"], fields: [
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW", filterable: true, card: true }),
    f("engine_power_hp", "توان موتور", "Engine Power", "DECIMAL", { unit: "HP" }),
    f("drive_configuration", "آرایش محرک", "Drive Configuration", "SELECT", { options: ["2WD", "4WD", "Tracked"] }),
    f("pto_power_kw", "توان محور توان‌دهی", "PTO Power", "DECIMAL", { unit: "KW" }),
    f("pto_speed_rpm", "سرعت محور توان‌دهی", "PTO Speed", "SELECT", { options: ["540", "540E", "1000", "1000E"] }),
    f("transmission_type", "نوع جعبه‌دنده", "Transmission Type", "SELECT", { options: ["سنکرون", "پاورشیفت", "CVT", "مکانیکی", "هیدرواستاتیک"] }),
    f("hitch_category", "رده اتصال سه‌نقطه", "Hitch Category", "SELECT", { options: ["Cat 1", "Cat 2", "Cat 3", "Cat 4"] }),
    f("rear_lift_capacity_kg", "ظرفیت بالابر عقب", "Rear Lift Capacity", "DECIMAL", { unit: "KG" }),
    f("hydraulic_flow_lpm", "دبی هیدرولیک", "Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("hydraulic_remote_valves", "تعداد شیرهای هیدرولیک", "Remote Hydraulic Valves", "INTEGER"),
    f("operating_weight_ton", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("fuel_tank_capacity_l", "ظرفیت مخزن سوخت", "Fuel Tank Capacity", "DECIMAL", { unit: "L" }),
  ]},
  { slug: "combine-harvester", label: "Combine Harvester", required: ["cutting_width_m", "grain_tank_capacity_l", "engine_power_kw"], fields: [
    f("crop_types", "نوع محصولات قابل برداشت", "Crop Types", "MULTI_SELECT", { options: ["گندم", "جو", "ذرت", "برنج", "سویا", "کلزا", "آفتابگردان"] }),
    f("cutting_width_m", "عرض هد برداشت", "Cutting Width", "DECIMAL", { unit: "M", filterable: true }),
    f("grain_tank_capacity_l", "ظرفیت مخزن غله", "Grain Tank Capacity", "DECIMAL", { unit: "L", filterable: true, card: true }),
    f("unloading_rate_l_s", "سرعت تخلیه مخزن", "Unloading Rate", "DECIMAL", { unit: "L/S" }),
    f("threshing_system", "سامانه کوبش", "Threshing System", "SELECT", { options: ["کوبه‌ای", "روتوری", "ترکیبی"] }),
    f("threshing_drum_width_mm", "عرض استوانه کوبنده", "Threshing Drum Width", "DECIMAL", { unit: "MM" }),
    f("rotor_speed_rpm", "سرعت روتور", "Rotor Speed", "DECIMAL", { unit: "RPM" }),
    f("cleaning_area_m2", "سطح پاک‌سازی", "Cleaning Area", "DECIMAL", { unit: "M2" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW", filterable: true, card: true }),
    f("operating_weight_ton", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON" }),
    f("unloading_height_m", "ارتفاع تخلیه", "Unloading Height", "DECIMAL", { unit: "M" }),
    f("straw_chopper", "خردکن کاه", "Straw Chopper", "BOOLEAN"),
  ]},
  { slug: "truck", label: "Heavy Commercial Truck", required: ["gross_vehicle_weight_ton", "payload_capacity_ton", "axle_configuration"], fields: [
    f("truck_body_type", "نوع اتاق یا کاربری", "Truck Body Type", "SELECT", { options: ["کامیون باری", "کمپرسی", "کفی", "یخچالی", "تانکر", "مخلوط‌کن", "جرثقیل‌دار", "کشنده"] }),
    f("gross_vehicle_weight_ton", "وزن ناخالص مجاز", "Gross Vehicle Weight", "DECIMAL", { unit: "TON", filterable: true }),
    f("payload_capacity_ton", "ظرفیت بار مفید", "Payload Capacity", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("axle_configuration", "آرایش محورها", "Axle Configuration", "SELECT", { options: ["4x2", "4x4", "6x2", "6x4", "6x6", "8x4", "8x8"] }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("engine_displacement_l", "حجم موتور", "Engine Displacement", "DECIMAL", { unit: "L" }),
    f("transmission_type", "نوع گیربکس", "Transmission Type", "TEXT"),
    f("fuel_type", "نوع سوخت", "Fuel Type", "SELECT", { options: ["دیزل", "CNG", "LNG", "برقی", "هیبریدی"] }),
    f("wheelbase_mm", "فاصله محوری", "Wheelbase", "DECIMAL", { unit: "MM" }),
    f("body_volume_m3", "حجم اتاق بار", "Body Volume", "DECIMAL", { unit: "M3" }),
    f("maximum_speed_kmh", "حداکثر سرعت", "Maximum Speed", "DECIMAL", { unit: "KMH" }),
    f("emission_standard", "استاندارد آلایندگی", "Emission Standard", "TEXT"),
  ]},
  { slug: "commercial-vehicle", label: "Commercial Vehicle", required: ["vehicle_class", "gross_vehicle_weight_ton", "engine_power_kw"], fields: [
    f("vehicle_class", "کلاس خودرو تجاری", "Vehicle Class", "SELECT", { options: ["سبک", "متوسط", "سنگین", "فوق‌سنگین", "کاربری ویژه"] }),
    f("commercial_body_type", "نوع بدنه و کاربری", "Commercial Body Type", "TEXT"),
    f("gross_vehicle_weight_ton", "وزن ناخالص مجاز", "Gross Vehicle Weight", "DECIMAL", { unit: "TON" }),
    f("payload_capacity_ton", "ظرفیت بار مفید", "Payload Capacity", "DECIMAL", { unit: "TON" }),
    f("engine_power_kw", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("fuel_type", "نوع سوخت", "Fuel Type", "SELECT", { options: ["دیزل", "بنزین", "CNG", "برقی", "هیبریدی"] }),
    f("drive_configuration", "آرایش محرک", "Drive Configuration", "TEXT"),
    f("axle_configuration", "آرایش محورها", "Axle Configuration", "TEXT"),
    f("maximum_speed_kmh", "حداکثر سرعت", "Maximum Speed", "DECIMAL", { unit: "KMH" }),
    f("emission_standard", "استاندارد آلایندگی", "Emission Standard", "TEXT"),
  ]},
  { slug: "bucket", label: "Excavator and Loader Bucket Attachment", required: ["bucket_capacity_m3", "bucket_width_mm", "machine_class"], fields: [
    f("bucket_capacity_m3", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3", filterable: true, card: true }),
    f("bucket_width_mm", "عرض باکت", "Bucket Width", "DECIMAL", { unit: "MM" }),
    f("bucket_application", "کاربری باکت", "Bucket Application", "SELECT", { options: ["عمومی", "سنگین", "سنگی", "کانال‌کنی", "تسطیح", "لایروبی"] }),
    f("cutting_edge_type", "نوع لبه برش", "Cutting Edge Type", "SELECT", { options: ["پیچ‌ومهره‌ای", "جوشی", "لبه مستقیم", "لبه دندانه‌دار"] }),
    f("tooth_count", "تعداد ناخن", "Tooth Count", "INTEGER"),
    f("pin_diameter_mm", "قطر پین اتصال", "Pin Diameter", "DECIMAL", { unit: "MM" }),
    f("machine_class", "کلاس ماشین سازگار", "Compatible Machine Class", "TEXT"),
    f("attachment_weight_kg", "وزن متعلقه", "Attachment Weight", "DECIMAL", { unit: "KG" }),
    f("material_grade", "گرید فولاد", "Material Grade", "TEXT"),
  ]},
  { slug: "rock-bucket", label: "Rock Excavation Bucket", required: ["bucket_capacity_m3", "bucket_width_mm", "wear_plate_grade"], fields: [
    f("bucket_capacity_m3", "ظرفیت باکت سنگی", "Rock Bucket Capacity", "DECIMAL", { unit: "M3", filterable: true }),
    f("bucket_width_mm", "عرض باکت", "Bucket Width", "DECIMAL", { unit: "MM" }),
    f("wear_plate_grade", "گرید ورق ضدسایش", "Wear Plate Grade", "TEXT"),
    f("wear_plate_thickness_mm", "ضخامت ورق ضدسایش", "Wear Plate Thickness", "DECIMAL", { unit: "MM" }),
    f("tooth_adapter_type", "نوع آداپتور ناخن", "Tooth Adapter Type", "TEXT"),
    f("tooth_count", "تعداد ناخن", "Tooth Count", "INTEGER"),
    f("pin_diameter_mm", "قطر پین اتصال", "Pin Diameter", "DECIMAL", { unit: "MM" }),
    f("attachment_weight_kg", "وزن متعلقه", "Attachment Weight", "DECIMAL", { unit: "KG" }),
    f("carrier_weight_range_ton", "محدوده وزن ماشین حامل", "Carrier Weight Range", "TEXT"),
  ]},
  { slug: "hydraulic-breaker", label: "Hydraulic Breaker Attachment", required: ["impact_energy_j", "blow_frequency_bpm", "tool_diameter_mm"], fields: [
    f("impact_energy_j", "انرژی ضربه", "Impact Energy", "DECIMAL", { unit: "J" }),
    f("blow_frequency_bpm", "تعداد ضربه در دقیقه", "Blow Frequency", "INTEGER", { unit: "BPM" }),
    f("tool_diameter_mm", "قطر قلم", "Tool Diameter", "DECIMAL", { unit: "MM" }),
    f("operating_weight_kg", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "KG" }),
    f("hydraulic_flow_lpm", "دبی روغن هیدرولیک", "Hydraulic Oil Flow", "DECIMAL", { unit: "LPM" }),
    f("operating_pressure_bar", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("carrier_weight_range_ton", "محدوده وزن ماشین حامل", "Carrier Weight Range", "TEXT"),
    f("tool_type", "نوع قلم", "Tool Type", "SELECT", { options: ["کندن", "هرمی", "تخت", "قیچی", "تخریب سنگ"] }),
    f("accumulator_pressure_bar", "فشار آکومولاتور", "Accumulator Pressure", "DECIMAL", { unit: "BAR" }),
  ]},
  { slug: "hammer", label: "Hydraulic Hammer Attachment", required: ["hammer_type", "hammer_impact_energy_j", "hammer_tool_diameter_mm"], fields: [
    f("hammer_type", "نوع چکش", "Hammer Type", "SELECT", { options: ["هیدرولیکی", "پنوماتیکی", "برقی", "دستی صنعتی"] }),
    f("hammer_impact_energy_j", "انرژی ضربه", "Hammer Impact Energy", "DECIMAL", { unit: "J" }),
    f("hammer_blow_rate_bpm", "نرخ ضربه", "Hammer Blow Rate", "INTEGER", { unit: "BPM" }),
    f("hammer_tool_diameter_mm", "قطر ابزار", "Hammer Tool Diameter", "DECIMAL", { unit: "MM" }),
    f("hammer_operating_weight_kg", "وزن چکش", "Hammer Operating Weight", "DECIMAL", { unit: "KG" }),
    f("hammer_hydraulic_flow_lpm", "دبی هیدرولیک", "Hammer Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("hammer_operating_pressure_bar", "فشار کاری", "Hammer Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("hammer_carrier_range_ton", "محدوده وزن ماشین حامل", "Compatible Carrier Range", "TEXT"),
    f("hammer_mounting_type", "نوع نصب", "Mounting Type", "TEXT"),
  ]},

);

// AttributeDefinition.key is globally unique. Preserve an existing compatible
// definition; namespace incompatible variants by category to prevent global clobbering.
const fieldSignature = (field: Pick<Field, "type" | "unit" | "fa" | "en" | "options" | "filterable" | "searchable" | "sortable" | "card">): string =>
  JSON.stringify({
    type: field.type,
    unit: field.unit ?? null,
    fa: field.fa,
    en: field.en,
    options: field.options ?? [],
    filterable: !!field.filterable,
    searchable: !!field.searchable,
    sortable: !!field.sortable,
    visibleOnCard: !!field.card,
    seoRelevant: !!field.filterable,
    aiRelevant: !!field.filterable || !!field.searchable,
  });

async function buildResolvedFieldKeyMap(): Promise<{
  byTemplateAndKey: Map<string, string>;
  conflictingKeyCount: number;
  namespacedFieldCount: number;
}> {
  const allKeys = [...new Set(templates.flatMap((template) => template.fields.map((field) => field.key)))];
  const existing = await db.attributeDefinition.findMany({
    where: { key: { in: allKeys } },
    include: {
      options: {
        orderBy: { sortOrder: "asc" },
        select: { value: true },
      },
    },
  });
  const existingByKey = new Map<string, string>();
  for (const attribute of existing) {
    if (!attribute.key) continue;
    existingByKey.set(attribute.key, fieldSignature({
      type: attribute.type as AttrType,
      unit: attribute.unit ?? undefined,
      fa: attribute.labelFa ?? attribute.name,
      en: attribute.labelEn ?? attribute.nameEn ?? "",
      options: attribute.options.map((option) => option.value),
      filterable: attribute.filterable,
      searchable: attribute.searchable,
      sortable: attribute.sortable,
      card: attribute.visibleOnCard,
    }));
  }

  const signaturesByKey = new Map<string, Map<string, { count: number; firstSeen: number }>>();
  let sequence = 0;
  for (const template of templates) {
    for (const field of template.fields) {
      const signature = fieldSignature(field);
      let signatures = signaturesByKey.get(field.key);
      if (!signatures) {
        signatures = new Map();
        signaturesByKey.set(field.key, signatures);
      }
      const current = signatures.get(signature);
      if (current) current.count++;
      else signatures.set(signature, { count: 1, firstSeen: sequence });
      sequence++;
    }
  }

  const byTemplateAndKey = new Map<string, string>();
  const resolvedSignatures = new Map<string, string>();
  let namespacedFieldCount = 0;
  for (const [key, signatures] of signaturesByKey) {
    const existingSignature = existingByKey.get(key);
    const compatibleExisting = existingSignature && signatures.has(existingSignature);
    const canonical = compatibleExisting
      ? existingSignature
      : existingSignature
        ? null
        : [...signatures.entries()].sort((a, b) =>
            b[1].count - a[1].count || a[1].firstSeen - b[1].firstSeen
          )[0][0];

    for (const template of templates) {
      for (const field of template.fields) {
        if (field.key !== key) continue;
        const signature = fieldSignature(field);
        const resolvedKey = canonical === signature ? key : `${template.slug}__${key}`;
        const previousSignature = resolvedSignatures.get(resolvedKey);
        if (previousSignature && previousSignature !== signature) {
          throw new Error(`Resolved AttributeDefinition key collision: ${resolvedKey}`);
        }
        resolvedSignatures.set(resolvedKey, signature);
        byTemplateAndKey.set(`${template.slug}:${key}`, resolvedKey);
        if (resolvedKey !== key) namespacedFieldCount++;
      }
    }
  }

  return {
    byTemplateAndKey,
    conflictingKeyCount: [...signaturesByKey.values()].filter((signatures) => signatures.size > 1).length,
    namespacedFieldCount,
  };
}

async function upsertField(field: Field): Promise<string> {
  const data = {
    key: field.key,
    name: field.fa,
    nameEn: field.en,
    labelFa: field.fa,
    labelEn: field.en,
    type: field.type,
    unit: field.unit ?? null,
    required: false,
    filterable: !!field.filterable,
    searchable: !!field.searchable,
    sortable: !!field.sortable,
    visibleOnCard: !!field.card,
    visibleOnDetail: true,
    seoRelevant: !!field.filterable,
    aiRelevant: !!field.filterable || !!field.searchable,
  };
  const attr = await db.attributeDefinition.upsert({
    where: { key: field.key },
    create: data,
    update: data,
  });

  for (let i = 0; i < (field.options ?? []).length; i++) {
    const value = field.options![i];
    const existing = await db.attributeOption.findFirst({
      where: { attributeId: attr.id, value },
    });
    if (existing) {
      await db.attributeOption.update({
        where: { id: existing.id },
        data: { label: value, sortOrder: i },
      });
    } else {
      await db.attributeOption.create({
        data: { attributeId: attr.id, value, label: value, sortOrder: i },
      });
    }
  }
  return attr.id;
}

async function main() {
  const coverageRootSlugs = ["machinery", "vehicles", "attachments", "agriculture", "industrial-equipment"];
  const coverageRoots = await db.category.findMany({
    where: { slug: { in: coverageRootSlugs }, active: true, layer: "CATALOG" },
    select: { id: true, slug: true },
  });
  const foundRootSlugs = new Set(coverageRoots.map((root) => root.slug));
  const missingCoverageRoots = coverageRootSlugs.filter((slug) => !foundRootSlugs.has(slug));
  if (missingCoverageRoots.length) {
    throw new Error(`Required CATALOG roots are missing or inactive; seed aborted: ${missingCoverageRoots.join(", ")}`);
  }

  // Validate the complete seed before the first write: no partial catalog update.
  const duplicateTemplateSlugs = templates
    .map((template) => template.slug)
    .filter((slug, index, all) => all.indexOf(slug) !== index);
  if (duplicateTemplateSlugs.length) {
    throw new Error(`Duplicate template slugs: ${duplicateTemplateSlugs.join(", ")}`);
  }
  for (const template of templates) {
    const keys = template.fields.map((field) => field.key);
    const duplicates = keys.filter((key, index, all) => all.indexOf(key) !== index);
    const missingRequired = (template.required ?? []).filter((key) => !keys.includes(key));
    if (duplicates.length || missingRequired.length) {
      throw new Error(
        `Invalid template ${template.slug}: duplicate fields [${duplicates.join(", ")}], missing required fields [${missingRequired.join(", ")}]`,
      );
    }
  }

  const categories = await db.category.findMany({
    where: {
      slug: { in: templates.map((template) => template.slug) },
      active: true,
      layer: "CATALOG",
    },
    select: { id: true, slug: true, active: true, layer: true },
  });
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));

  // Enforce one dedicated template for every active terminal equipment category
  // under machinery, vehicles, attachments, agriculture and industrial equipment.
  const activeCatalogCategories = await db.category.findMany({
    where: { active: true, layer: "CATALOG" },
    select: { id: true, slug: true, parentId: true },
  });
  const descendantIds = new Set<string>(coverageRoots.map((root) => root.id));
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const category of activeCatalogCategories) {
      if (category.parentId && descendantIds.has(category.parentId) && !descendantIds.has(category.id)) {
        descendantIds.add(category.id);
        expanded = true;
      }
    }
  }
  const equipmentCategories = activeCatalogCategories.filter((category) => descendantIds.has(category.id));
  const categoriesWithChildren = new Set(
    equipmentCategories.map((category) => category.parentId).filter((id): id is string => !!id),
  );
  const terminalCategories = equipmentCategories.filter((category) => !categoriesWithChildren.has(category.id));
  const templateSlugSet = new Set(templates.map((template) => template.slug));
  const missingTerminalForms = terminalCategories
    .filter((category) => !templateSlugSet.has(category.slug))
    .map((category) => category.slug);
  if (missingTerminalForms.length) {
    throw new Error(
      `Missing dedicated forms for terminal equipment categories; seed aborted before writes: ${missingTerminalForms.join(", ")}`,
    );
  }

  const skippedInactiveRetired = templates
    .map((template) => template.slug)
    .filter((slug) => RETIRED_MACHINE_TEMPLATE_SLUGS.has(slug) && !categoryBySlug.has(slug));
  const missing = templates
    .map((template) => template.slug)
    .filter((slug) => !categoryBySlug.has(slug) && !RETIRED_MACHINE_TEMPLATE_SLUGS.has(slug));
  if (missing.length) {
    throw new Error(
      `Missing or inactive non-retired CATALOG categories; seed aborted before writes: ${missing.join(", ")}`,
    );
  }

  const activeTemplates = templates.filter((template) => categoryBySlug.has(template.slug));
  const fieldKeyPlan = await buildResolvedFieldKeyMap();
  const applied: { slug: string; fields: number }[] = [];

  for (const template of activeTemplates) {
    const category = categoryBySlug.get(template.slug)!;

    const required = new Set(template.required ?? []);
    for (let order = 0; order < template.fields.length; order++) {
      const field = template.fields[order];
      const resolvedKey = fieldKeyPlan.byTemplateAndKey.get(`${template.slug}:${field.key}`);
      if (!resolvedKey) throw new Error(`Missing resolved field key for ${template.slug}.${field.key}`);
      const attributeId = await upsertField({ ...field, key: resolvedKey });
      await db.categoryAttribute.upsert({
        where: {
          categoryId_attributeId: {
            categoryId: category.id,
            attributeId,
          },
        },
        create: {
          categoryId: category.id,
          attributeId,
          required: required.has(field.key),
          filterable: !!field.filterable,
          searchable: !!field.searchable,
          sortable: !!field.sortable,
          displayOrder: order,
        },
        update: {
          required: required.has(field.key),
          filterable: !!field.filterable,
          searchable: !!field.searchable,
          sortable: !!field.sortable,
          displayOrder: order,
        },
      });
    }
    applied.push({ slug: template.slug, fields: template.fields.length });
  }

  console.log(JSON.stringify({
    templatesDefined: templates.length,
    coverageRootsAudited: coverageRoots.map((root) => root.slug),
    equipmentCategoriesAudited: equipmentCategories.length,
    terminalCategoriesAudited: terminalCategories.length,
    terminalFormsCovered: terminalCategories.length - missingTerminalForms.length,
    conflictingGlobalFieldKeyCount: fieldKeyPlan.conflictingKeyCount,
    namespacedFieldDefinitionCount: fieldKeyPlan.namespacedFieldCount,
    templatesApplied: applied.length,
    missingCategorySlugs: missing,
    applied,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
