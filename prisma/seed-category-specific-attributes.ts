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
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "KG", filterable: true, card: true }),
    f("travel_speed", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "KMH" }),
    f("engine_power", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW", filterable: true }),
    f("overall_width", "عرض کلی", "Overall Width", "DECIMAL", { unit: "MM" }),
    f("overall_height", "ارتفاع کلی", "Overall Height", "DECIMAL", { unit: "MM" }),
    f("cab_type", "نوع کابین", "Cab Type", "SELECT", { options: ["کابین بسته", "سایبان", "بدون کابین"] }),
  ]},
  { slug: "compact-track-loader", label: "Compact Track Loader", required: ["rated_operating_capacity", "ground_pressure"], fields: [
    f("rated_operating_capacity", "ظرفیت عملیاتی نامی", "Rated Operating Capacity", "DECIMAL", { unit: "KG", filterable: true, card: true }),
    f("tipping_load", "بار واژگونی", "Tipping Load", "DECIMAL", { unit: "KG" }),
    f("ground_pressure", "فشار وارد بر زمین", "Ground Pressure", "DECIMAL", { unit: "KPA" }),
    f("track_width", "عرض زنجیر", "Track Width", "DECIMAL", { unit: "MM" }),
    f("track_length_ground", "طول تماس زنجیر با زمین", "Track on Ground Length", "DECIMAL", { unit: "MM" }),
    f("hydraulic_flow", "دبی هیدرولیک", "Hydraulic Flow", "DECIMAL", { unit: "LPM" }),
    f("hydraulic_pressure", "فشار هیدرولیک", "Hydraulic Pressure", "DECIMAL", { unit: "BAR" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "KG", filterable: true, card: true }),
    f("engine_power", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "wheel-loader", label: "Wheel Loader", required: ["bucket_capacity", "rated_operating_capacity"], fields: [
    f("bucket_capacity", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3", filterable: true, card: true }),
    f("rated_operating_capacity", "ظرفیت عملیاتی نامی", "Rated Operating Capacity", "DECIMAL", { unit: "KG", filterable: true }),
    f("breakout_force", "نیروی کندن", "Breakout Force", "DECIMAL", { unit: "KN" }),
    f("dump_clearance", "ارتفاع تخلیه", "Dump Clearance", "DECIMAL", { unit: "M" }),
    f("dump_reach", "برد تخلیه", "Dump Reach", "DECIMAL", { unit: "M" }),
    f("wheelbase", "فاصله محوری", "Wheelbase", "DECIMAL", { unit: "MM" }),
    f("turning_radius", "شعاع گردش", "Turning Radius", "DECIMAL", { unit: "M" }),
    f("tire_size", "سایز تایر", "Tire Size", "TEXT"),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "KG", filterable: true }),
  ]},
  { slug: "track-loader", label: "Track Loader", required: ["bucket_capacity", "track_width"], fields: [
    f("bucket_capacity", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3", filterable: true }),
    f("track_width", "عرض زنجیر", "Track Width", "DECIMAL", { unit: "MM" }),
    f("ground_pressure", "فشار بر زمین", "Ground Pressure", "DECIMAL", { unit: "KPA" }),
    f("drawbar_pull", "نیروی کشش", "Drawbar Pull", "DECIMAL", { unit: "KN" }),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "KG", filterable: true }),
    f("engine_power", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
  ]},
  { slug: "telehandler-loader", label: "Telehandler", required: ["lifting_capacity", "max_lift_height", "max_forward_reach"], fields: [
    f("lifting_capacity", "ظرفیت باربرداری", "Rated Lift Capacity", "DECIMAL", { unit: "KG", filterable: true, card: true }),
    f("max_lift_height", "حداکثر ارتفاع بالابری", "Maximum Lift Height", "DECIMAL", { unit: "M", filterable: true, card: true }),
    f("max_forward_reach", "حداکثر دسترسی افقی", "Maximum Forward Reach", "DECIMAL", { unit: "M", filterable: true }),
    f("capacity_at_max_reach", "ظرفیت در حداکثر دسترسی", "Capacity at Maximum Reach", "DECIMAL", { unit: "KG" }),
    f("boom_sections", "تعداد قطعات بوم", "Boom Sections", "INTEGER"),
    f("stabilizer_type", "نوع تثبیت‌کننده", "Stabilizer Type", "TEXT"),
    f("attachment_type", "نوع متعلقه", "Attachment Type", "MULTI_SELECT"),
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "KG" }),
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
    f("travel_speed", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "M/MIN" }),
    f("duty_class", "کلاس کاری", "Duty Classification", "TEXT"),
  ]},

  // DRILLING — parameters are method-specific; configuration values stay optional.
  { slug: "rotary-drill", label: "Rotary Drilling Rig", required: ["drilling_diameter_min", "max_drilling_depth", "rotation_torque"], fields: [
    f("drilling_diameter_min", "حداقل قطر حفاری", "Minimum Drilling Diameter", "DECIMAL", { unit: "MM" }),
    f("drilling_diameter_max", "حداکثر قطر حفاری", "Maximum Drilling Diameter", "DECIMAL", { unit: "MM", filterable: true, card: true }),
    f("max_drilling_depth", "حداکثر عمق حفاری", "Maximum Drilling Depth", "DECIMAL", { unit: "M", filterable: true }),
    f("rotation_torque", "گشتاور سرحفار", "Rotary Torque", "DECIMAL", { unit: "KNM" }),
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
    f("engine_power", "توان موتور", "Engine / Total Power", "DECIMAL", { unit: "KW" }),
    f("operating_weight", "وزن دستگاه", "Machine Weight", "DECIMAL", { unit: "KG", filterable: true }),
    f("gradeability", "قابلیت حرکت در شیب", "Gradeability", "DECIMAL", { unit: "DEG" }),
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
    f("power_source", "منبع نیرو", "Power Source", "SELECT", { options: ["دیزلی", "برقی", "الکتروهیدرولیک"] }),
  ]},

  // MINING and MATERIAL PROCESSING.
  { slug: "mining-excavator-machine", label: "Mining Excavator", required: ["operating_weight", "bucket_capacity", "engine_power"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true, card: true }),
    f("bucket_capacity", "ظرفیت باکت", "Bucket Capacity", "DECIMAL", { unit: "M3", filterable: true, card: true }),
    f("engine_power", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
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
    f("engine_power", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
    f("dump_height", "ارتفاع تخلیه", "Dump Height", "DECIMAL", { unit: "M" }),
    f("turning_radius", "شعاع گردش", "Turning Radius", "DECIMAL", { unit: "M" }),
    f("ground_clearance", "فاصله از زمین", "Ground Clearance", "DECIMAL", { unit: "MM" }),
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
  { slug: "double-drum-roller", label: "Double Drum Roller", required: ["operating_weight", "working_width"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true }),
    f("working_width", "عرض کوبش", "Working Width", "DECIMAL", { unit: "MM", filterable: true, card: true }),
    f("drum_diameter", "قطر درام", "Drum Diameter", "DECIMAL", { unit: "MM" }),
    f("vibration_frequency", "فرکانس ارتعاش", "Vibration Frequency", "DECIMAL", { unit: "HZ" }),
    f("centrifugal_force", "نیروی گریز از مرکز", "Centrifugal Force", "DECIMAL", { unit: "KN" }),
    f("travel_speed", "سرعت حرکت", "Travel Speed", "DECIMAL", { unit: "KMH" }),
  ]},
  { slug: "pneumatic-roller", label: "Pneumatic Tire Roller", required: ["operating_weight", "working_width"], fields: [
    f("operating_weight", "وزن عملیاتی", "Operating Weight", "DECIMAL", { unit: "TON", filterable: true }),
    f("working_width", "عرض کوبش", "Working Width", "DECIMAL", { unit: "MM" }),
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
    f("flow_rate", "دبی سوخت", "Fuel Flow Rate", "DECIMAL", { unit: "L/MIN", filterable: true }),
    f("metering_type", "نوع اندازه‌گیری", "Metering Type", "SELECT", { options: ["مکانیکی", "الکترونیکی", "پالس"] }),
    f("display_type", "نوع نمایشگر", "Display Type", "TEXT"),
    f("payment_terminal", "پایانه پرداخت", "Payment Terminal", "BOOLEAN"),
    f("vapor_recovery", "بازیابی بخار", "Vapor Recovery", "BOOLEAN"),
    f("dispenser_certification", "استاندارد/تأییدیه", "Certification", "TEXT"),
  ]},
  { slug: "fuel-storage-tank", label: "Fuel Storage Tank", required: ["tank_capacity", "tank_material", "tank_installation"], fields: [
    f("tank_capacity", "ظرفیت مخزن", "Tank Capacity", "DECIMAL", { unit: "L", filterable: true, card: true }),
    f("tank_material", "جنس مخزن", "Tank Material", "SELECT", { options: ["فولاد کربنی", "فایبرگلاس", "پلی‌اتیلن", "کامپوزیت"] }),
    f("tank_installation", "نحوه نصب", "Tank Installation", "SELECT", { options: ["زیرزمینی", "روززمینی", "مدفون افقی", "عمودی"] }),
    f("tank_wall_type", "ساختار جداره", "Tank Wall Type", "SELECT", { options: ["تک‌جداره", "دوجداره"] }),
    f("compartment_count", "تعداد محفظه", "Compartment Count", "INTEGER"),
    f("design_pressure", "فشار طراحی", "Design Pressure", "DECIMAL", { unit: "KPA" }),
    f("corrosion_protection", "حفاظت خوردگی", "Corrosion Protection", "TEXT"),
    f("interstitial_monitoring", "پایش فضای بین جداره", "Interstitial Monitoring", "BOOLEAN"),
  ]},
  { slug: "submersible-fuel-pump", label: "Submersible Fuel Pump", required: ["flow_rate", "pump_head", "motor_power"], fields: [
    f("flow_rate", "دبی", "Flow Rate", "DECIMAL", { unit: "L/MIN", filterable: true }),
    f("pump_head", "هد", "Pump Head", "DECIMAL", { unit: "M" }),
    f("motor_power", "توان موتور", "Motor Power", "DECIMAL", { unit: "KW" }),
    f("motor_voltage", "ولتاژ موتور", "Motor Voltage", "INTEGER", { unit: "V" }),
    f("fuel_compatibility", "سازگاری با سوخت", "Fuel Compatibility", "MULTI_SELECT", { options: ["بنزین", "گازوئیل", "سوخت ترکیبی", "سوخت هواپیما"] }),
    f("pump_diameter", "قطر پمپ", "Pump Diameter", "DECIMAL", { unit: "MM" }),
    f("explosion_protection", "حفاظت ضدانفجار", "Explosion Protection", "TEXT"),
  ]},
  { slug: "tank-monitoring-system", label: "Automatic Tank Gauging & Leak Detection", required: ["monitoring_channels", "leak_detection"], fields: [
    f("monitoring_channels", "تعداد کانال پایش", "Monitoring Channels", "INTEGER"),
    f("tank_level_accuracy", "دقت اندازه‌گیری سطح", "Tank Level Accuracy", "TEXT"),
    f("leak_detection", "قابلیت تشخیص نشتی", "Leak Detection", "BOOLEAN"),
    f("water_detection", "تشخیص آب", "Water Detection", "BOOLEAN"),
    f("temperature_sensing", "اندازه‌گیری دما", "Temperature Sensing", "BOOLEAN"),
    f("connectivity", "روش ارتباطی", "Connectivity", "MULTI_SELECT", { options: ["Ethernet", "RS-485", "Modbus", "Wireless", "Cellular"] }),
    f("probe_type", "نوع پراب", "Probe Type", "TEXT"),
  ]},
  { slug: "fuel-filtration", label: "Fuel Filtration System", required: ["flow_rate", "filtration_micron"], fields: [
    f("flow_rate", "دبی", "Flow Rate", "DECIMAL", { unit: "L/MIN" }),
    f("filtration_micron", "درجه فیلتراسیون", "Filtration Rating", "DECIMAL", { unit: "MICRON", filterable: true }),
    f("water_separation", "جداسازی آب", "Water Separation", "BOOLEAN"),
    f("filter_type", "نوع فیلتر", "Filter Type", "SELECT", { options: ["ذره‌گیر", "آب‌گیر", "دوگانه", "کوالسر"] }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("housing_material", "جنس محفظه", "Housing Material", "TEXT"),
  ]},
  { slug: "fuel-hose-nozzle", label: "Fuel Hose & Nozzle", required: ["hose_diameter", "hose_length"], fields: [
    f("hose_diameter", "قطر داخلی شیلنگ", "Hose Inner Diameter", "DECIMAL", { unit: "MM" }),
    f("hose_length", "طول شیلنگ", "Hose Length", "DECIMAL", { unit: "M" }),
    f("working_pressure", "فشار کاری", "Working Pressure", "DECIMAL", { unit: "BAR" }),
    f("nozzle_type", "نوع نازل", "Nozzle Type", "SELECT", { options: ["دستی", "اتوماتیک", "High Flow", "Aviation"] }),
    f("swivel_included", "مفصل گردان", "Swivel Included", "BOOLEAN"),
    f("breakaway_included", "اتصال جداشونده ایمن", "Breakaway Included", "BOOLEAN"),
    f("fuel_compatibility", "سازگاری سوخت", "Fuel Compatibility", "MULTI_SELECT", { options: ["بنزین", "گازوئیل", "سوخت هواپیما", "AdBlue"] }),
  ]},
  { slug: "vapour-recovery-equipment", label: "Vapour Recovery Equipment", required: ["recovery_stage", "system_type"], fields: [
    f("recovery_stage", "مرحله بازیابی بخار", "Recovery Stage", "SELECT", { options: ["مرحله اول تخلیه مخزن", "مرحله دوم نازل"] }),
    f("system_type", "نوع سیستم", "System Type", "SELECT", { options: ["مکش", "بالانس", "خلأ کمکی"] }),
    f("vapor_flow_rate", "دبی بخار", "Vapour Flow Rate", "DECIMAL", { unit: "M3/H" }),
    f("pressure_vacuum_valve", "شیر فشار-خلأ", "Pressure Vacuum Valve", "BOOLEAN"),
    f("flame_arrestor", "شعله‌گیر", "Flame Arrestor", "BOOLEAN"),
    f("certification", "استاندارد/تأییدیه", "Certification", "TEXT"),
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
    f("hopper_capacity", "ظرفیت هاپر", "Hopper Capacity", "DECIMAL", { unit: "TON" }),
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
    f("engine_power", "توان موتور", "Engine Power", "DECIMAL", { unit: "KW" }),
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
    f("pump_flow", "دبی پمپ", "Pump Flow", "DECIMAL", { unit: "L/MIN" }),
    f("working_pressure", "فشار کاری", "Working Pressure", "DECIMAL", { unit: "BAR" }),
    f("control_system", "سیستم کنترل", "Control System", "TEXT"),
  ]},
  { slug: "irrigation-system", label: "Irrigation System", required: ["irrigated_area", "flow_rate"], fields: [
    f("irrigation_type", "نوع آبیاری", "Irrigation Type", "SELECT", { options: ["قطره‌ای", "بارانی", "محوری", "خطی", "سطحی"] }),
    f("irrigated_area", "مساحت تحت پوشش", "Irrigated Area", "DECIMAL", { unit: "HA" }),
    f("flow_rate", "دبی طراحی", "Design Flow Rate", "DECIMAL", { unit: "M3/H" }),
    f("operating_pressure", "فشار کاری", "Operating Pressure", "DECIMAL", { unit: "BAR" }),
    f("pipe_diameter", "قطر لوله اصلی", "Main Pipe Diameter", "DECIMAL", { unit: "MM" }),
    f("filter_type", "نوع فیلتراسیون", "Filter Type", "TEXT"),
    f("automation_level", "سطح اتوماسیون", "Automation Level", "SELECT", { options: ["دستی", "نیمه‌خودکار", "هوشمند"] }),
  ]},
  { slug: "tillage-equipment", label: "Tillage Equipment", required: ["working_width", "working_depth"], fields: [
    f("implement_type", "نوع ادوات", "Implement Type", "SELECT", { options: ["گاوآهن", "دیسک", "چیزل", "زیرشکن", "روتیواتور", "لولر"] }),
    f("working_width", "عرض کار", "Working Width", "DECIMAL", { unit: "M" }),
    f("working_depth", "عمق کار", "Working Depth", "DECIMAL", { unit: "CM" }),
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
    f("crop_type", "نوع محصول", "Crop Type", "MULTI_SELECT"),
    f("working_width", "عرض کار", "Working Width", "DECIMAL", { unit: "M" }),
    f("field_capacity", "ظرفیت برداشت مزرعه‌ای", "Field Capacity", "DECIMAL", { unit: "HA/H" }),
    f("power_requirement", "توان موردنیاز", "Power Requirement", "DECIMAL", { unit: "HP" }),
  ]},
];

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
  const root = await db.category.findUnique({ where: { slug: "machinery" } });
  if (!root) throw new Error('Active taxonomy root "machinery" is missing; aborting.');

  const applied: { slug: string; fields: number }[] = [];
  const missing: string[] = [];

  for (const template of templates) {
    const category = await db.category.findUnique({ where: { slug: template.slug } });
    if (!category) {
      missing.push(template.slug);
      continue;
    }

    const required = new Set(template.required ?? []);
    for (let order = 0; order < template.fields.length; order++) {
      const field = template.fields[order];
      const attributeId = await upsertField(field);
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
