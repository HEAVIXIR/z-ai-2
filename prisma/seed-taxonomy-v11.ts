/* HEAVIX Taxonomy Seed V1.1 — HBR §3-§19
   Idempotent seed that populates:
   - 6 TransactionTypes (§18)
   - 9  ServiceTypes (§19)
   - 16 ApplicationIndustries (§17)
   - Full Category tree V1.1 (§3-§16): 14 roots (7 CATALOG + 4 MARKETPLACE + 2 SERVICE + 1 FALLBACK)
     with 16 legacy root categories reparented into the new tree.
   - 30+ Category ↔ ApplicationIndustry links
   - Locations: 1 Country (Iran) + 31 Provinces + ~150 cities

   Run: bunx tsx prisma/seed-taxonomy-v11.ts

   Strategy: upsert by slug for Categories, by key for TransactionType/ServiceType/ApplicationIndustry,
   by (countryId,name) for Province, by (provinceId,name) for City. Existing categories whose slug
   matches a V1.1 child slug are reparented (parentId/level/layer/taxPath updated). Existing categories
   whose slug does NOT match a V1.1 child are left alone. */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// ════════════════════════════════════════════════════════════
// 1. TRANSACTION TYPES — HBR §18 (6)
// ════════════════════════════════════════════════════════════
const TRANSACTIONS = [
  { key: "SALE",            nameFa: "فروش",            nameEn: "Sale",             icon: "tag",        sortOrder: 1 },
  { key: "RENT",            nameFa: "اجاره",           nameEn: "Rent",             icon: "key",        sortOrder: 2 },
  { key: "WANTED",          nameFa: "درخواست خرید",    nameEn: "Wanted",           icon: "megaphone",  sortOrder: 3 },
  { key: "QUOTE",           nameFa: "پیشنهاد قیمت",    nameEn: "Quote",            icon: "file-text",  sortOrder: 4 },
  { key: "AUCTION",         nameFa: "مزایده",          nameEn: "Auction",          icon: "gavel",      sortOrder: 5 },
  { key: "SERVICE_REQUEST", nameFa: "درخواست خدمت",    nameEn: "Service Request",  icon: "wrench",     sortOrder: 6 },
];

// ════════════════════════════════════════════════════════════
// 2. SERVICE TYPES — HBR §19 (9)
// ════════════════════════════════════════════════════════════
const SERVICES = [
  { key: "INSPECTION",   nameFa: "بازرسی و کارشناسی", nameEn: "Inspection",            icon: "search",     sortOrder: 1 },
  { key: "REPAIR",       nameFa: "تعمیرات",          nameEn: "Repair",                icon: "wrench",     sortOrder: 2 },
  { key: "MAINTENANCE",  nameFa: "سرویس و نگهداری",  nameEn: "Maintenance",           icon: "settings",   sortOrder: 3 },
  { key: "TRANSPORT",    nameFa: "حمل‌ونقل",          nameEn: "Transport",             icon: "truck",      sortOrder: 4 },
  { key: "CONSULTING",   nameFa: "مشاوره",           nameEn: "Consulting",            icon: "lightbulb",  sortOrder: 5 },
  { key: "VALUATION",    nameFa: "ارزش‌گذاری",        nameEn: "Valuation",             icon: "calculator", sortOrder: 6 },
  { key: "INSTALLATION", nameFa: "نصب و راه‌اندازی", nameEn: "Installation",          icon: "package",    sortOrder: 7 },
  { key: "TRAINING",     nameFa: "آموزش",            nameEn: "Training",              icon: "book-open",  sortOrder: 8 },
  { key: "OTHER",        nameFa: "سایر خدمات",       nameEn: "Other Services",        icon: "more",       sortOrder: 9 },
];

// ════════════════════════════════════════════════════════════
// 3. APPLICATION INDUSTRIES — HBR §17 (16)
// ════════════════════════════════════════════════════════════
const APP_INDUSTRIES = [
  { key: "MINING",        nameFa: "معدن",            nameEn: "Mining",                icon: "mountain",     sortOrder: 1 },
  { key: "ROAD_CONSTRUCTION", nameFa: "راهسازی",     nameEn: "Road Construction",     icon: "road",         sortOrder: 2 },
  { key: "CONSTRUCTION",  nameFa: "ساختمان",         nameEn: "Construction",          icon: "building",     sortOrder: 3 },
  { key: "CIVIL",         nameFa: "عمران",           nameEn: "Civil",                 icon: "hard-hat",     sortOrder: 4 },
  { key: "OIL_GAS",       nameFa: "نفت و گاز",       nameEn: "Oil & Gas",             icon: "fuel",         sortOrder: 5 },
  { key: "PETROCHEMICAL", nameFa: "پتروشیمی",        nameEn: "Petrochemical",         icon: "flask-conical",sortOrder: 6 },
  { key: "STEEL",         nameFa: "فولاد",           nameEn: "Steel",                 icon: "anvil",        sortOrder: 7 },
  { key: "CEMENT",        nameFa: "سیمان",           nameEn: "Cement",                icon: "box",          sortOrder: 8 },
  { key: "POWER",         nameFa: "نیرو",            nameEn: "Power",                 icon: "zap",          sortOrder: 9 },
  { key: "PORT_MARINE",   nameFa: "بندر و دریانوردی", nameEn: "Port & Marine",        icon: "anchor",       sortOrder: 10 },
  { key: "AGRICULTURE",   nameFa: "کشاورزی",         nameEn: "Agriculture",           icon: "wheat",        sortOrder: 11 },
  { key: "FORESTRY",      nameFa: "جنگلداری",        nameEn: "Forestry",              icon: "tree-pine",    sortOrder: 12 },
  { key: "RECYCLING",     nameFa: "بازیافت",         nameEn: "Recycling",             icon: "recycle",      sortOrder: 13 },
  { key: "FACTORY",       nameFa: "کارخانه و تولید", nameEn: "Factory & Production",  icon: "factory",      sortOrder: 14 },
  { key: "TRANSPORT",     nameFa: "حمل‌ونقل",         nameEn: "Transport",             icon: "truck",        sortOrder: 15 },
  { key: "OTHER",         nameFa: "سایر صنایع",      nameEn: "Other Industries",      icon: "grid",         sortOrder: 16 },
];

// ════════════════════════════════════════════════════════════
// 4. CATEGORY TREE V1.1 — HBR §3-§16
// ════════════════════════════════════════════════════════════
type CatSeed = {
  name: string;
  nameEn?: string;
  slug: string;
  layer: "CATALOG" | "MARKETPLACE" | "SERVICE" | "FALLBACK";
  icon?: string;
  domain?: string;
  featured?: boolean;
  sortOrder?: number;
  children?: CatSeed[];
  appIndustries?: string[]; // AppIndustry keys
};

const TREE: CatSeed[] = [
  // ─── 01 ماشین‌آلات (machinery) — CATALOG — §3 deep tree ─────
  {
    name: "۰۱ ماشین‌آلات", nameEn: "Machinery", slug: "machinery", layer: "CATALOG",
    icon: "🏗️", domain: "MACHINE", featured: true, sortOrder: 1,
    children: [
      {
        name: "۰۱.۰۱ ماشین‌آلات راهسازی و عمرانی", nameEn: "Road Construction Machinery",
        slug: "road-construction", layer: "CATALOG", icon: "🚜", domain: "MACHINE", sortOrder: 1,
        children: [
          {
            name: "بیل مکانیکی", nameEn: "Excavator", slug: "excavator", layer: "CATALOG",
            icon: "🛠️", domain: "MACHINE", sortOrder: 1,
            appIndustries: ["MINING", "ROAD_CONSTRUCTION", "CONSTRUCTION"],
            children: [
              { name: "زنجیری",        nameEn: "Chain Excavator",    slug: "excavator-chain",    layer: "CATALOG", sortOrder: 1, appIndustries: ["MINING", "ROAD_CONSTRUCTION", "CONSTRUCTION"] },
              { name: "چرخ لاستیکی",   nameEn: "Wheel Excavator",    slug: "excavator-wheel",    layer: "CATALOG", sortOrder: 2, appIndustries: ["ROAD_CONSTRUCTION", "CONSTRUCTION"] },
              { name: "مینی بیل",      nameEn: "Mini Excavator",     slug: "mini-excavator",     layer: "CATALOG", sortOrder: 3, appIndustries: ["CONSTRUCTION", "CIVIL"] },
              { name: "Long Reach",    nameEn: "Long Reach Excavator", slug: "long-reach",       layer: "CATALOG", sortOrder: 4, appIndustries: ["CIVIL", "MINING"] },
              { name: "Mining Excavator", nameEn: "Mining Excavator", slug: "mining-excavator",  layer: "CATALOG", sortOrder: 5, appIndustries: ["MINING"] },
            ],
          },
          {
            name: "لودر", nameEn: "Loader", slug: "loader", layer: "CATALOG",
            domain: "MACHINE", sortOrder: 2, appIndustries: ["CONSTRUCTION", "MINING", "ROAD_CONSTRUCTION"],
            children: [
              { name: "لودر چرخ لاستیکی", nameEn: "Wheel Loader", slug: "wheel-loader", layer: "CATALOG", sortOrder: 1 },
              { name: "لودر زنجیری", nameEn: "Track Loader", slug: "track-loader", layer: "CATALOG", sortOrder: 2 },
              { name: "اسکید استیر", nameEn: "Skid Steer Loader", slug: "skid-steer-loader", layer: "CATALOG", sortOrder: 3 },
              { name: "کامپکت ترک لودر", nameEn: "Compact Track Loader", slug: "compact-track-loader", layer: "CATALOG", sortOrder: 4 },
              { name: "لودر تلسکوپی", nameEn: "Telehandler", slug: "telehandler-loader", layer: "CATALOG", sortOrder: 5 },
            ],
          },
          { name: "بولدوزر",       nameEn: "Bulldozer",         slug: "bulldozer",         layer: "CATALOG", domain: "MACHINE", sortOrder: 3, appIndustries: ["CONSTRUCTION", "MINING", "ROAD_CONSTRUCTION"] },
          { name: "گریدر",         nameEn: "Grader",            slug: "grader",            layer: "CATALOG", domain: "MACHINE", sortOrder: 4, appIndustries: ["ROAD_CONSTRUCTION", "CIVIL"] },
          { name: "بکهو لودر",     nameEn: "Backhoe Loader",    slug: "backhoe-loader",    layer: "CATALOG", domain: "MACHINE", sortOrder: 5, appIndustries: ["CONSTRUCTION", "CIVIL"] },
          { name: "اسکریپر",       nameEn: "Scraper",           slug: "scraper",           layer: "CATALOG", domain: "MACHINE", sortOrder: 6, appIndustries: ["ROAD_CONSTRUCTION", "CIVIL"] },
          {
            name: "غلتک", nameEn: "Road Roller", slug: "road-roller", layer: "CATALOG",
            domain: "MACHINE", sortOrder: 7, appIndustries: ["ROAD_CONSTRUCTION", "CIVIL"],
            children: [
              { name: "غلتک تک‌درام", nameEn: "Single Drum Roller", slug: "single-drum-roller", layer: "CATALOG", sortOrder: 1 },
              { name: "غلتک دو‌درام", nameEn: "Double Drum Roller", slug: "double-drum-roller", layer: "CATALOG", sortOrder: 2 },
              { name: "غلتک ارتعاشی", nameEn: "Vibratory Roller", slug: "vibratory-roller", layer: "CATALOG", sortOrder: 3 },
              { name: "غلتک پنوماتیک", nameEn: "Pneumatic Tire Roller", slug: "pneumatic-roller", layer: "CATALOG", sortOrder: 4 },
            ],
          },
          { name: "فینیشر آسفالت", nameEn: "Asphalt Finisher",  slug: "asphalt-finisher",  layer: "CATALOG", domain: "MACHINE", sortOrder: 8, appIndustries: ["ROAD_CONSTRUCTION"] },
          { name: "ماشین‌آلات آسفالت", nameEn: "Asphalt Machinery", slug: "asphalt-machinery", layer: "CATALOG", domain: "MACHINE", sortOrder: 9, appIndustries: ["ROAD_CONSTRUCTION"] },
          {
            name: "ماشین‌آلات بتن", nameEn: "Concrete Machinery", slug: "concrete-machinery", layer: "CATALOG",
            domain: "MACHINE", sortOrder: 10, appIndustries: ["CONSTRUCTION", "CIVIL"],
            children: [
              { name: "پمپ بتن", nameEn: "Concrete Pump", slug: "concrete-pump", layer: "CATALOG", sortOrder: 1 },
              { name: "بچینگ پلانت", nameEn: "Concrete Batching Plant", slug: "batching-plant", layer: "CATALOG", sortOrder: 2 },
              { name: "تراک میکسر", nameEn: "Transit Mixer", slug: "transit-mixer", layer: "CATALOG", sortOrder: 3 },
              { name: "میکسر بتن", nameEn: "Concrete Mixer", slug: "concrete-mixer", layer: "CATALOG", sortOrder: 4 },
              { name: "شاتکریت", nameEn: "Shotcrete Machine", slug: "shotcrete-machine", layer: "CATALOG", sortOrder: 5 },
            ],
          },
          { name: "سایر",          nameEn: "Other Road Construction", slug: "other-road-construction", layer: "CATALOG", domain: "MACHINE", sortOrder: 11 },
        ],
      },
      {
        name: "۰۱.۰۲ ماشین‌آلات معدنی", nameEn: "Mining Machinery",
        slug: "mining-machinery", layer: "CATALOG", icon: "⛏️", domain: "MACHINE", sortOrder: 2,
        children: [
          { name: "بیل معدنی",        nameEn: "Mining Excavator Machine", slug: "mining-excavator-machine", layer: "CATALOG", sortOrder: 1, appIndustries: ["MINING"] },
          { name: "دامپتراک",         nameEn: "Dump Truck",                slug: "dump-truck",               layer: "CATALOG", sortOrder: 2, appIndustries: ["MINING", "CONSTRUCTION"] },
          { name: "لودر معدنی",       nameEn: "Mining Loader",             slug: "mining-loader",            layer: "CATALOG", sortOrder: 3, appIndustries: ["MINING"] },
          { name: "حفاری",             nameEn: "Drilling Machine",          slug: "drilling-machine",         layer: "CATALOG", sortOrder: 4, appIndustries: ["MINING", "OIL_GAS"] },
          { name: "دریل",              nameEn: "Drill",                     slug: "drill",                    layer: "CATALOG", sortOrder: 5, appIndustries: ["MINING", "OIL_GAS"] },
          { name: "ماشین‌آلات زیرزمینی", nameEn: "Underground Machinery",   slug: "underground-machinery",    layer: "CATALOG", sortOrder: 6, appIndustries: ["MINING"] },
          { name: "LHD",               nameEn: "LHD",                       slug: "lhd",                      layer: "CATALOG", sortOrder: 7, appIndustries: ["MINING"] },
          { name: "شاول",              nameEn: "Shovel",                    slug: "shovel",                   layer: "CATALOG", sortOrder: 8, appIndustries: ["MINING"] },
          { name: "ماشین‌آلات استخراج", nameEn: "Extraction Machinery",     slug: "extraction-machinery",     layer: "CATALOG", sortOrder: 9, appIndustries: ["MINING"] },
          { name: "سایر",              nameEn: "Other Mining Machinery",    slug: "other-mining",             layer: "CATALOG", sortOrder: 10 },
        ],
      },
      {
        name: "۰۱.۰۳ ماشین‌آلات حفاری", nameEn: "Drilling Rigs",
        slug: "drilling-rigs", layer: "CATALOG", icon: "🔩", domain: "MACHINE", sortOrder: 3,
        children: [
          { name: "Drill Rig",       nameEn: "Drill Rig",        slug: "drill-rig",       layer: "CATALOG", sortOrder: 1, appIndustries: ["MINING", "OIL_GAS"] },
          { name: "Rotary Drill",    nameEn: "Rotary Drill",     slug: "rotary-drill",    layer: "CATALOG", sortOrder: 2, appIndustries: ["MINING"] },
          { name: "DTH",             nameEn: "Down-The-Hole",    slug: "dth",             layer: "CATALOG", sortOrder: 3, appIndustries: ["MINING"] },
          { name: "Top Hammer",      nameEn: "Top Hammer",       slug: "top-hammer",      layer: "CATALOG", sortOrder: 4, appIndustries: ["MINING"] },
          { name: "حفاری چاه",        nameEn: "Water Well Drilling", slug: "water-well-drilling", layer: "CATALOG", sortOrder: 5, appIndustries: ["AGRICULTURE", "CIVIL"] },
          { name: "مغزه‌گیر", nameEn: "Core Drill", slug: "core-drill", layer: "CATALOG", sortOrder: 6, appIndustries: ["MINING", "GEOTECHNICAL"] },
          { name: "حفاری RC", nameEn: "Reverse Circulation Drill", slug: "rc-drill", layer: "CATALOG", sortOrder: 7, appIndustries: ["MINING"] },
          { name: "حفاری ژئوتکنیک", nameEn: "Geotechnical Drill", slug: "geotechnical-drill", layer: "CATALOG", sortOrder: 8, appIndustries: ["CIVIL", "GEOTECHNICAL"] },
          { name: "حفاری چال انفجاری", nameEn: "Blast Hole Drill", slug: "blast-hole-drill", layer: "CATALOG", sortOrder: 9, appIndustries: ["MINING"] },
          { name: "حفاری زیرزمینی", nameEn: "Underground Drill", slug: "underground-drill", layer: "CATALOG", sortOrder: 10, appIndustries: ["MINING"] },
          { name: "جامبو حفاری تونل", nameEn: "Tunneling Jumbo Drill", slug: "jumbo-drill", layer: "CATALOG", sortOrder: 11, appIndustries: ["MINING", "CIVIL"] },
          { name: "حفاری نفت و گاز", nameEn: "Oil & Gas Drilling Rig", slug: "oil-gas-drilling", layer: "CATALOG", sortOrder: 12, appIndustries: ["OIL_GAS"] },
          { name: "سایر", nameEn: "Other Drilling", slug: "other-drilling", layer: "CATALOG", sortOrder: 13 },
        ],
      },
      {
        name: "۰۱.۰۴ سنگ‌شکن و دانه‌بندی", nameEn: "Crushing & Screening",
        slug: "crushing-screening", layer: "CATALOG", icon: "🪨", domain: "MACHINE", sortOrder: 4,
        children: [
          { name: "فکی",         nameEn: "Jaw Crusher",      slug: "jaw-crusher",     layer: "CATALOG", sortOrder: 1, appIndustries: ["MINING", "CEMENT"] },
          { name: "مخروطی",      nameEn: "Cone Crusher",     slug: "cone-crusher",    layer: "CATALOG", sortOrder: 2, appIndustries: ["MINING", "CEMENT"] },
          { name: "ضربه‌ای",      nameEn: "Impact Crusher",   slug: "impact-crusher",  layer: "CATALOG", sortOrder: 3, appIndustries: ["MINING"] },
          { name: "کوبیت",       nameEn: "Cubic Crusher",    slug: "cubic-crusher",   layer: "CATALOG", sortOrder: 4, appIndustries: ["MINING"] },
          { name: "سرند",        nameEn: "Screen",           slug: "screen",          layer: "CATALOG", sortOrder: 5, appIndustries: ["MINING", "CEMENT"] },
          { name: "نوار نقاله",  nameEn: "Conveyor Belt",    slug: "conveyor-belt",   layer: "CATALOG", sortOrder: 6, appIndustries: ["MINING", "FACTORY", "PORT_MARINE"] },
          { name: "خطوط کامل",   nameEn: "Complete Line",    slug: "complete-line",   layer: "CATALOG", sortOrder: 7, appIndustries: ["MINING"] },
        ],
      },
      {
        name: "۰۱.۰۵ جرثقیل و بالابر", nameEn: "Cranes & Lifting",
        slug: "cranes-lifting", layer: "CATALOG", icon: "🏗️", domain: "MACHINE", sortOrder: 5,
        children: [
          { name: "جرثقیل",       nameEn: "Crane",           slug: "crane",           layer: "CATALOG", sortOrder: 1, appIndustries: ["CONSTRUCTION", "FACTORY", "PORT_MARINE"] },
          { name: "برجی",         nameEn: "Tower Crane",     slug: "tower-crane",     layer: "CATALOG", sortOrder: 2, appIndustries: ["CONSTRUCTION"] },
          { name: "چرخدار",       nameEn: "Wheel Crane",     slug: "wheel-crane",     layer: "CATALOG", sortOrder: 3, appIndustries: ["CONSTRUCTION"] },
          { name: "زنجیری",       nameEn: "Chain Crane",     slug: "chain-crane",     layer: "CATALOG", sortOrder: 4, appIndustries: ["FACTORY"] },
          { name: "متحرک",        nameEn: "Mobile Crane",    slug: "mobile-crane",    layer: "CATALOG", sortOrder: 5, appIndustries: ["CONSTRUCTION", "PORT_MARINE"] },
          { name: "سقفی",         nameEn: "Overhead Crane",  slug: "overhead-crane",  layer: "CATALOG", sortOrder: 6, appIndustries: ["FACTORY", "STEEL"] },
          { name: "جرثقیل زنجیری", nameEn: "Crawler Crane", slug: "crawler-crane", layer: "CATALOG", sortOrder: 7, appIndustries: ["CONSTRUCTION", "MINING"] },
          { name: "جرثقیل کامیونی", nameEn: "Truck-Mounted Crane", slug: "truck-crane", layer: "CATALOG", sortOrder: 8, appIndustries: ["CONSTRUCTION", "TRANSPORT"] },
          { name: "جرثقیل تمام‌زمین", nameEn: "All Terrain Crane", slug: "all-terrain-crane", layer: "CATALOG", sortOrder: 9, appIndustries: ["CONSTRUCTION"] },
          { name: "جرثقیل دریایی", nameEn: "Marine Crane", slug: "marine-crane", layer: "CATALOG", sortOrder: 10, appIndustries: ["PORT_MARINE", "OIL_GAS"] },
          { name: "دیگر", nameEn: "Other Crane", slug: "other-crane", layer: "CATALOG", sortOrder: 11 },
        ],
      },
      {
        name: "۰۱.۰۶ لیفتراک و تجهیزات انبار", nameEn: "Forklift & Warehouse",
        slug: "forklift-warehouse", layer: "CATALOG", icon: "📦", domain: "MACHINE", sortOrder: 6,
        children: [
          {
            name: "لیفتراک", nameEn: "Forklift", slug: "forklift", layer: "CATALOG",
            sortOrder: 1, appIndustries: ["FACTORY", "PORT_MARINE"],
            children: [
              { name: "لیفتراک دیزلی", nameEn: "Diesel Forklift", slug: "diesel-forklift", layer: "CATALOG", sortOrder: 1 },
              { name: "لیفتراک برقی", nameEn: "Electric Forklift", slug: "electric-forklift", layer: "CATALOG", sortOrder: 2 },
              { name: "لیفتراک LPG", nameEn: "LPG Forklift", slug: "lpg-forklift", layer: "CATALOG", sortOrder: 3 },
              { name: "لیفتراک بنزینی", nameEn: "Gasoline Forklift", slug: "gasoline-forklift", layer: "CATALOG", sortOrder: 4 },
              { name: "لیفتراک سنگین", nameEn: "Heavy Duty Forklift", slug: "heavy-duty-forklift", layer: "CATALOG", sortOrder: 5 },
              { name: "لیفتراک آفرود", nameEn: "Rough Terrain Forklift", slug: "rough-terrain-forklift", layer: "CATALOG", sortOrder: 6 },
              { name: "لیفتراک جانبی", nameEn: "Side Loader Forklift", slug: "side-loader-forklift", layer: "CATALOG", sortOrder: 7 },
              { name: "لیفتراک کانتینری", nameEn: "Container Forklift", slug: "container-forklift", layer: "CATALOG", sortOrder: 8 },
            ],
          },
          { name: "ریچ‌تراک",    nameEn: "Reach Truck",   slug: "reach-truck",   layer: "CATALOG", sortOrder: 2, appIndustries: ["FACTORY"] },
          { name: "پالت‌تراک",   nameEn: "Pallet Truck",  slug: "pallet-truck",  layer: "CATALOG", sortOrder: 3, appIndustries: ["FACTORY"] },
          { name: "استکر",       nameEn: "Stacker",       slug: "stacker",       layer: "CATALOG", sortOrder: 4, appIndustries: ["FACTORY"] },
          { name: "سایر",        nameEn: "Other Forklift", slug: "other-forklift", layer: "CATALOG", sortOrder: 5 },
        ],
      },
      {
        name: "۰۱.۰۷ ماشین‌آلات حمل", nameEn: "Conveying",
        slug: "conveying", layer: "CATALOG", icon: "➡️", domain: "MACHINE", sortOrder: 7,
        children: [
          { name: "نقاله سرنداری",  nameEn: "Sizing Conveyor", slug: "sizing-conveyor",  layer: "CATALOG", sortOrder: 1, appIndustries: ["MINING", "FACTORY"] },
          { name: "نقاله تسمه‌ای",  nameEn: "Belt Conveyor",   slug: "belt-conveyor",    layer: "CATALOG", sortOrder: 2, appIndustries: ["MINING", "FACTORY"] },
          { name: "سایر",           nameEn: "Other Conveying", slug: "other-conveying",  layer: "CATALOG", sortOrder: 3 },
        ],
      },
      {
        name: "۰۱.۰۸ ماشین‌آلات بازیافت", nameEn: "Recycling Machinery",
        slug: "recycling", layer: "CATALOG", icon: "♻️", domain: "MACHINE", sortOrder: 8,
        children: [
          { name: "خط بازیافت",      nameEn: "Recycling Line",   slug: "recycling-line",   layer: "CATALOG", sortOrder: 1, appIndustries: ["RECYCLING"] },
          { name: "دسته‌بند",        nameEn: "Sorter",            slug: "sorter",           layer: "CATALOG", sortOrder: 2, appIndustries: ["RECYCLING"] },
          { name: "سایر",            nameEn: "Other Recycling",   slug: "other-recycling",  layer: "CATALOG", sortOrder: 3 },
        ],
      },
      {
        name: "۰۱.۰۹ ماشین‌آلات بندری", nameEn: "Port Machinery",
        slug: "port-machinery", layer: "CATALOG", icon: "⚓", domain: "MACHINE", sortOrder: 9,
        children: [
          { name: "ریچ استاکر",      nameEn: "Reach Stacker",     slug: "reach-stacker",     layer: "CATALOG", sortOrder: 1, appIndustries: ["PORT_MARINE"] },
          { name: "گانتری کرین",     nameEn: "Gantry Crane",      slug: "gantry-crane",      layer: "CATALOG", sortOrder: 2, appIndustries: ["PORT_MARINE"] },
          { name: "سایر",            nameEn: "Other Port Machinery", slug: "other-port-machinery", layer: "CATALOG", sortOrder: 3 },
        ],
      },
      {
        name: "۰۱.۱۰ ماشین‌آلات جنگلداری", nameEn: "Forestry Machinery",
        slug: "forestry-machinery", layer: "CATALOG", icon: "🌲", domain: "MACHINE", sortOrder: 10,
        children: [
          { name: "ماشین‌آلات جنگل", nameEn: "Forestry",       slug: "forestry",       layer: "CATALOG", sortOrder: 1, appIndustries: ["FORESTRY"] },
          { name: "هاروستر",         nameEn: "Harvester",      slug: "harvester",      layer: "CATALOG", sortOrder: 2, appIndustries: ["FORESTRY"] },
          { name: "فوروادر",         nameEn: "Forwarder",      slug: "forwarder",      layer: "CATALOG", sortOrder: 3, appIndustries: ["FORESTRY"] },
          { name: "سایر",            nameEn: "Other Forestry", slug: "other-forestry-machinery", layer: "CATALOG", sortOrder: 4 },
        ],
      },
      {
        name: "۰۱.۱۱ ماشین‌آلات صنعتی", nameEn: "Industrial Machinery",
        slug: "industrial-machinery", layer: "CATALOG", icon: "🏭", domain: "MACHINE", sortOrder: 11,
        children: [
          { name: "خط تولید",         nameEn: "Production Line",   slug: "production-line",   layer: "CATALOG", sortOrder: 1, appIndustries: ["FACTORY"] },
          { name: "سایر",             nameEn: "Other Industrial",  slug: "other-industrial-machinery", layer: "CATALOG", sortOrder: 2 },
        ],
      },
      {
        name: "۰۱.۱۲ ماشین‌آلات خاص", nameEn: "Special Machinery",
        slug: "special-machinery", layer: "CATALOG", icon: "⚙️", domain: "MACHINE", sortOrder: 12,
        children: [
          { name: "سایر", nameEn: "Other Special Machinery", slug: "other-special-machinery", layer: "CATALOG", sortOrder: 1 },
        ],
      },
    ],
  },

  // ─── 02 خودرو و ناوگان صنعتی (vehicles) — CATALOG — §4 ─────
  {
    name: "۰۲ خودروها و ناوگان صنعتی", nameEn: "Vehicles & Industrial Fleet",
    slug: "vehicles", layer: "CATALOG", icon: "🚛", domain: "VEHICLE", featured: true, sortOrder: 2,
    children: [
      { name: "کامیون",            nameEn: "Truck",              slug: "truck",              layer: "CATALOG", domain: "VEHICLE", sortOrder: 1, appIndustries: ["TRANSPORT", "CONSTRUCTION"] },
      { name: "کشنده",             nameEn: "Tractor Truck",      slug: "tractor-truck",      layer: "CATALOG", domain: "VEHICLE", sortOrder: 2, appIndustries: ["TRANSPORT"] },
      { name: "تریلر",             nameEn: "Trailer",            slug: "trailer",            layer: "CATALOG", domain: "VEHICLE", sortOrder: 3, appIndustries: ["TRANSPORT"] },
      { name: "نیم‌تریلر",         nameEn: "Semi Trailer",       slug: "semi-trailer",       layer: "CATALOG", domain: "VEHICLE", sortOrder: 4, appIndustries: ["TRANSPORT"] },
      { name: "پیکاپ",             nameEn: "Pickup",             slug: "pickup",             layer: "CATALOG", domain: "VEHICLE", sortOrder: 5, appIndustries: ["TRANSPORT"] },
      { name: "خودرو تجاری",       nameEn: "Commercial Vehicle", slug: "commercial-vehicle", layer: "CATALOG", domain: "VEHICLE", sortOrder: 6, appIndustries: ["TRANSPORT"] },
      { name: "خودرو حمل",         nameEn: "Transport Vehicle",  slug: "transport-vehicle",  layer: "CATALOG", domain: "VEHICLE", sortOrder: 7, appIndustries: ["TRANSPORT"] },
      { name: "خودرو تخصصی",       nameEn: "Specialized Vehicle", slug: "specialized-vehicle", layer: "CATALOG", domain: "VEHICLE", sortOrder: 8 },
      { name: "اتوبوس",            nameEn: "Bus",                slug: "bus",                layer: "CATALOG", domain: "VEHICLE", sortOrder: 9, appIndustries: ["TRANSPORT"] },
      { name: "تانکر",             nameEn: "Tanker Truck",       slug: "tanker-truck",       layer: "CATALOG", domain: "VEHICLE", sortOrder: 10, appIndustries: ["OIL_GAS", "TRANSPORT"] },
      { name: "خودرو سردخانه",     nameEn: "Refrigerated Truck", slug: "refrigerated-truck", layer: "CATALOG", domain: "VEHICLE", sortOrder: 11, appIndustries: ["AGRICULTURE", "TRANSPORT"] },
      { name: "سایر",              nameEn: "Other Vehicles",     slug: "other-vehicles",     layer: "CATALOG", domain: "VEHICLE", sortOrder: 12 },
    ],
  },

  // ─── 03 قطعات و لوازم یدکی (parts) — CATALOG — §5 ─────
  {
    name: "۰۳ قطعات و لوازم یدکی", nameEn: "Parts & Spare Parts",
    slug: "parts", layer: "CATALOG", icon: "⚙️", domain: "PART", featured: true, sortOrder: 3,
    children: [
      { name: "قطعات یدکی",         nameEn: "Spare Parts",        slug: "spare-parts",         layer: "CATALOG", domain: "PART", sortOrder: 1, appIndustries: ["FACTORY", "MINING", "CONSTRUCTION"] },
      { name: "قطعات موتور",        nameEn: "Engine Parts",       slug: "engine-parts",        layer: "CATALOG", domain: "PART", sortOrder: 2, appIndustries: ["FACTORY"] },
      { name: "قطعات گیربکس",       nameEn: "Transmission Parts", slug: "transmission-parts",  layer: "CATALOG", domain: "PART", sortOrder: 3, appIndustries: ["FACTORY"] },
      { name: "قطعات هیدرولیک",     nameEn: "Hydraulic Parts",    slug: "hydraulic-parts",     layer: "CATALOG", domain: "PART", sortOrder: 4, appIndustries: ["FACTORY"] },
      { name: "قطعات الکتریکی",     nameEn: "Electrical Parts",   slug: "electrical-parts",    layer: "CATALOG", domain: "PART", sortOrder: 5, appIndustries: ["FACTORY"] },
      { name: "تجهیزات زیرین",      nameEn: "Undercarriage",      slug: "undercarriage",       layer: "CATALOG", domain: "PART", sortOrder: 6, appIndustries: ["MINING", "CONSTRUCTION"] },
      { name: "پمپ هیدرولیک",       nameEn: "Hydraulic Pump",     slug: "hydraulic-pump",      layer: "CATALOG", domain: "PART", sortOrder: 7, appIndustries: ["FACTORY"] },
      { name: "شیر هیدرولیک",       nameEn: "Hydraulic Valve",    slug: "hydraulic-valve",     layer: "CATALOG", domain: "PART", sortOrder: 8, appIndustries: ["FACTORY"] },
      { name: "دریایو نهایی",       nameEn: "Final Drive",        slug: "final-drive",         layer: "CATALOG", domain: "PART", sortOrder: 9, appIndustries: ["FACTORY"] },
      { name: "موتور چرخشی",        nameEn: "Swing Motor",        slug: "swing-motor",         layer: "CATALOG", domain: "PART", sortOrder: 10, appIndustries: ["FACTORY"] },
      { name: "فیلترها",            nameEn: "Filters",            slug: "filters",             layer: "CATALOG", domain: "PART", sortOrder: 11, appIndustries: ["FACTORY"] },
      { name: "سیستم خنک‌کننده",    nameEn: "Cooling System",     slug: "cooling-system",      layer: "CATALOG", domain: "PART", sortOrder: 12, appIndustries: ["FACTORY"] },
      { name: "قطعات مصرفی",        nameEn: "Wear Parts",         slug: "wear-parts",          layer: "CATALOG", domain: "PART", sortOrder: 13, appIndustries: ["MINING", "CEMENT"] },
      { name: "لاستیک و زنجیر",     nameEn: "Tires & Tracks",     slug: "tires-tracks",        layer: "CATALOG", domain: "PART", sortOrder: 14, appIndustries: ["MINING", "CONSTRUCTION"] },
      { name: "بلبرینگ",            nameEn: "Bearings",           slug: "bearings",            layer: "CATALOG", domain: "PART", sortOrder: 15, appIndustries: ["FACTORY"] },
      { name: "سایر قطعات",         nameEn: "Other Parts",        slug: "other-parts",         layer: "CATALOG", domain: "PART", sortOrder: 16 },
    ],
  },

  // ─── 04 متعلقات و تجهیزات جانبی (attachments) — CATALOG — §6 ─────
  {
    name: "۰۴ متعلقات و تجهیزات جانبی", nameEn: "Attachments & Accessories",
    slug: "attachments", layer: "CATALOG", icon: "🔧", domain: "ATTACHMENT", sortOrder: 4,
    children: [
      { name: "بیلجه",          nameEn: "Bucket",           slug: "bucket",          layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 1, appIndustries: ["CONSTRUCTION", "MINING"] },
      { name: "بیلجه سنگی",     nameEn: "Rock Bucket",      slug: "rock-bucket",     layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 2, appIndustries: ["MINING"] },
      { name: "بریکر هیدرولیک", nameEn: "Hydraulic Breaker", slug: "hydraulic-breaker", layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 3, appIndustries: ["CONSTRUCTION", "MINING"] },
      { name: "گرپل",           nameEn: "Grapple",          slug: "grapple",         layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 4, appIndustries: ["FORESTRY", "RECYCLING"] },
      { name: "اوگر",           nameEn: "Auger",            slug: "auger",           layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 5, appIndustries: ["CONSTRUCTION", "CIVIL"] },
      { name: "ریپر",           nameEn: "Ripper",           slug: "ripper",          layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 6, appIndustries: ["MINING", "CIVIL"] },
      { name: "چنگال",          nameEn: "Fork",             slug: "fork",            layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 7, appIndustries: ["FACTORY"] },
      { name: "کوپلر سریع",     nameEn: "Quick Coupler",    slug: "quick-coupler",   layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 8, appIndustries: ["CONSTRUCTION"] },
      { name: "تیغه",           nameEn: "Blade",            slug: "blade",           layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 9, appIndustries: ["CONSTRUCTION", "ROAD_CONSTRUCTION"] },
      { name: "چکش",            nameEn: "Hammer",           slug: "hammer",          layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 10, appIndustries: ["MINING"] },
      { name: "قیچی",           nameEn: "Shear",            slug: "shear",           layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 11, appIndustries: ["STEEL", "RECYCLING"] },
      { name: "پودرکننده",      nameEn: "Pulverizer",       slug: "pulverizer",      layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 12, appIndustries: ["RECYCLING", "CEMENT"] },
      { name: "سایر متعلقات",   nameEn: "Other Attachments", slug: "other-attachments", layer: "CATALOG", domain: "ATTACHMENT", sortOrder: 13 },
    ],
  },

  // ─── 05 اجاره (rent) — MARKETPLACE vertical — §7 (placeholder nav) ─────
  {
    name: "۰۵ اجاره ماشین‌آلات و تجهیزات", nameEn: "Machinery & Equipment Rental", slug: "rent", layer: "MARKETPLACE",
    icon: "🔑", domain: "RENTAL", featured: true, sortOrder: 5,
  },

  // ─── 06 خدمات فنی و صنعتی (services) — SERVICE — §8 ─────
  {
    name: "۰۶ خدمات فنی و صنعتی", nameEn: "Technical & Industrial Services",
    slug: "services", layer: "SERVICE", icon: "🛠️", domain: "SERVICE", featured: true, sortOrder: 6,
    children: [
      {
        name: "کارشناسی", nameEn: "Consulting & Valuation", slug: "consulting", layer: "SERVICE", domain: "SERVICE", sortOrder: 1,
        children: [
          { name: "ارزش‌گذاری ماشین‌آلات", nameEn: "Machine Valuation", slug: "machine-valuation", layer: "SERVICE", sortOrder: 1 },
          { name: "ارزش‌گذاری برند",     nameEn: "Brand Valuation",   slug: "brand-valuation",   layer: "SERVICE", sortOrder: 2 },
          { name: "تحقیقات بازار",       nameEn: "Market Research",   slug: "market-research",   layer: "SERVICE", sortOrder: 3 },
          { name: "گزارش کارشناسی",      nameEn: "Expert Report",     slug: "expert-report",     layer: "SERVICE", sortOrder: 4 },
        ],
      },
      {
        name: "بازرسی", nameEn: "Inspection", slug: "inspection", layer: "SERVICE", domain: "SERVICE", sortOrder: 2,
        children: [
          { name: "بازرسی ماشین‌آلات", nameEn: "Machine Inspection", slug: "machine-inspection", layer: "SERVICE", sortOrder: 1 },
          { name: "بازرسی خودرو",      nameEn: "Vehicle Inspection", slug: "vehicle-inspection", layer: "SERVICE", sortOrder: 2 },
          { name: "بازرسی قطعات",      nameEn: "Parts Inspection",   slug: "parts-inspection",   layer: "SERVICE", sortOrder: 3 },
          { name: "ممیزی فنی",         nameEn: "Technical Audit",    slug: "technical-audit",    layer: "SERVICE", sortOrder: 4 },
        ],
      },
      {
        name: "تعمیرات", nameEn: "Repair", slug: "repair", layer: "SERVICE", domain: "SERVICE", sortOrder: 3,
        children: [
          { name: "تعمیر موتور",       nameEn: "Engine Repair",       slug: "engine-repair",       layer: "SERVICE", sortOrder: 1 },
          { name: "تعمیر هیدرولیک",    nameEn: "Hydraulic Repair",    slug: "hydraulic-repair",    layer: "SERVICE", sortOrder: 2 },
          { name: "تعمیر الکتریکی",    nameEn: "Electrical Repair",   slug: "electrical-repair",   layer: "SERVICE", sortOrder: 3 },
          { name: "تعمیر گیربکس",      nameEn: "Transmission Repair", slug: "transmission-repair", layer: "SERVICE", sortOrder: 4 },
          { name: "تعمیر بدنه",        nameEn: "Body Repair",         slug: "body-repair",         layer: "SERVICE", sortOrder: 5 },
          { name: "تعمیر میدانی",      nameEn: "Field Repair",        slug: "field-repair",        layer: "SERVICE", sortOrder: 6 },
        ],
      },
      {
        name: "سرویس", nameEn: "Service & Maintenance", slug: "service", layer: "SERVICE", domain: "SERVICE", sortOrder: 4,
        children: [
          { name: "سرویس دوره‌ای",      nameEn: "Scheduled Service",     slug: "scheduled-service",     layer: "SERVICE", sortOrder: 1 },
          { name: "نگهداری پیشگیرانه", nameEn: "Preventive Maintenance", slug: "preventive-maintenance", layer: "SERVICE", sortOrder: 2 },
          { name: "تعویض روغن",        nameEn: "Oil Change",            slug: "oil-change",            layer: "SERVICE", sortOrder: 3 },
          { name: "کالیبراسیون",       nameEn: "Calibration",           slug: "calibration",           layer: "SERVICE", sortOrder: 4 },
          { name: "عیب‌یابی",          nameEn: "Diagnostics",           slug: "diagnostics",           layer: "SERVICE", sortOrder: 5 },
        ],
      },
    ],
  },

  // ─── 07 حمل‌ونقل و لجستیک (transport-logistics) — SERVICE — §9 ─────
  {
    name: "۰۷ حمل‌ونقل و لجستیک", nameEn: "Transport & Logistics",
    slug: "transport-logistics", layer: "SERVICE", icon: "🚚", domain: "TRANSPORT", featured: true, sortOrder: 7,
    children: [
      { name: "حمل سنگین",         nameEn: "Heavy Haulage",        slug: "heavy-haulage",        layer: "SERVICE", domain: "TRANSPORT", sortOrder: 1, appIndustries: ["TRANSPORT", "CONSTRUCTION"] },
      { name: "حمل کانتینری",      nameEn: "Container Transport",  slug: "container-transport",  layer: "SERVICE", domain: "TRANSPORT", sortOrder: 2, appIndustries: ["TRANSPORT", "PORT_MARINE"] },
      { name: "حمل بندری",         nameEn: "Port Transport",       slug: "port-transport",       layer: "SERVICE", domain: "TRANSPORT", sortOrder: 3, appIndustries: ["PORT_MARINE"] },
      { name: "حمل ریلی",          nameEn: "Rail Transport",       slug: "rail-transport",       layer: "SERVICE", domain: "TRANSPORT", sortOrder: 4, appIndustries: ["TRANSPORT"] },
      { name: "حمل هوایی",         nameEn: "Air Freight",          slug: "air-freight",          layer: "SERVICE", domain: "TRANSPORT", sortOrder: 5, appIndustries: ["TRANSPORT"] },
      { name: "انبارداری",         nameEn: "Warehouse Logistics",  slug: "warehouse-logistics",  layer: "SERVICE", domain: "TRANSPORT", sortOrder: 6, appIndustries: ["TRANSPORT", "FACTORY"] },
      { name: "ترخیص گمرکی",       nameEn: "Customs Clearance",    slug: "customs-clearance",    layer: "SERVICE", domain: "TRANSPORT", sortOrder: 7, appIndustries: ["TRANSPORT"] },
      { name: "فورواردر",          nameEn: "Freight Forwarding",   slug: "freight-forwarding",   layer: "SERVICE", domain: "TRANSPORT", sortOrder: 8, appIndustries: ["TRANSPORT"] },
      { name: "توزیع آخرین مایل",  nameEn: "Last Mile",            slug: "last-mile",            layer: "SERVICE", domain: "TRANSPORT", sortOrder: 9, appIndustries: ["TRANSPORT"] },
      { name: "زنجیره سرد",        nameEn: "Cold Chain",           slug: "cold-chain",           layer: "SERVICE", domain: "TRANSPORT", sortOrder: 10, appIndustries: ["AGRICULTURE", "TRANSPORT"] },
      { name: "سایر",              nameEn: "Other Transport",      slug: "other-transport",      layer: "SERVICE", domain: "TRANSPORT", sortOrder: 11 },
    ],
  },

  // ─── 08 مواد معدنی و مصالح (minerals-materials) — CATALOG — §10 ─────
  {
    name: "۰۸ مواد معدنی و مصالح", nameEn: "Minerals & Materials",
    slug: "minerals-materials", layer: "CATALOG", icon: "⛰️", domain: "MATERIAL", featured: true, sortOrder: 8,
    children: [
      { name: "سنگ آهن",        nameEn: "Iron Ore",        slug: "iron-ore",        layer: "CATALOG", domain: "MATERIAL", sortOrder: 1, appIndustries: ["STEEL", "MINING"] },
      { name: "مس",             nameEn: "Copper Ore",      slug: "copper-ore",      layer: "CATALOG", domain: "MATERIAL", sortOrder: 2, appIndustries: ["MINING"] },
      { name: "زغال سنگ",       nameEn: "Coal",            slug: "coal",            layer: "CATALOG", domain: "MATERIAL", sortOrder: 3, appIndustries: ["MINING", "POWER"] },
      { name: "سنگ لاشه",       nameEn: "Stone Block",     slug: "stone-block",     layer: "CATALOG", domain: "MATERIAL", sortOrder: 4, appIndustries: ["MINING", "CONSTRUCTION"] },
      { name: "ماسه",           nameEn: "Sand",            slug: "sand",            layer: "CATALOG", domain: "MATERIAL", sortOrder: 5, appIndustries: ["CONSTRUCTION", "CEMENT"] },
      { name: "شن",             nameEn: "Gravel",          slug: "gravel",          layer: "CATALOG", domain: "MATERIAL", sortOrder: 6, appIndustries: ["CONSTRUCTION", "CEMENT"] },
      { name: "کلینکر سیمان",   nameEn: "Cement Clinker",  slug: "cement-clinker",  layer: "CATALOG", domain: "MATERIAL", sortOrder: 7, appIndustries: ["CEMENT"] },
      { name: "گچ",             nameEn: "Gypsum",          slug: "gypsum",          layer: "CATALOG", domain: "MATERIAL", sortOrder: 8, appIndustries: ["CEMENT", "CONSTRUCTION"] },
      { name: "آهک",            nameEn: "Limestone",       slug: "limestone",       layer: "CATALOG", domain: "MATERIAL", sortOrder: 9, appIndustries: ["CEMENT", "STEEL"] },
      { name: "مرمر",           nameEn: "Marble",          slug: "marble",          layer: "CATALOG", domain: "MATERIAL", sortOrder: 10, appIndustries: ["MINING", "CONSTRUCTION"] },
      { name: "گرانیت",         nameEn: "Granite",         slug: "granite",         layer: "CATALOG", domain: "MATERIAL", sortOrder: 11, appIndustries: ["MINING", "CONSTRUCTION"] },
      { name: "بازالت",         nameEn: "Basalt",          slug: "basalt",          layer: "CATALOG", domain: "MATERIAL", sortOrder: 12, appIndustries: ["MINING"] },
      { name: "سرامیک",         nameEn: "Ceramic",         slug: "ceramic",         layer: "CATALOG", domain: "MATERIAL", sortOrder: 13, appIndustries: ["FACTORY"] },
      { name: "شیشه",           nameEn: "Glass",           slug: "glass",           layer: "CATALOG", domain: "MATERIAL", sortOrder: 14, appIndustries: ["FACTORY"] },
      { name: "مواد فولادی",    nameEn: "Steel Materials", slug: "steel-materials", layer: "CATALOG", domain: "MATERIAL", sortOrder: 15, appIndustries: ["STEEL", "CONSTRUCTION"] },
      { name: "سایر مصالح",     nameEn: "Other Materials", slug: "other-materials", layer: "CATALOG", domain: "MATERIAL", sortOrder: 16 },
    ],
  },

  // ─── 09 تجهیزات صنعتی (industrial-equipment) — CATALOG — §11 ─────
  {
    name: "۰۹ تجهیزات صنعتی", nameEn: "Industrial Equipment",
    slug: "industrial-equipment", layer: "CATALOG", icon: "🏭", domain: "INDUSTRIAL_EQUIPMENT", featured: true, sortOrder: 9,
    children: [
      { name: "ژنراتور",         nameEn: "Generator",          slug: "generator",          layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 1, appIndustries: ["POWER", "OIL_GAS", "FACTORY"] },
      { name: "کمپرسور",         nameEn: "Compressor",         slug: "compressor",         layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 2, appIndustries: ["FACTORY", "MINING"] },
      { name: "سکوی بلندبر",     nameEn: "Aerial Platform",    slug: "aerial-platform",    layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 3, appIndustries: ["CONSTRUCTION", "FACTORY"] },
      { name: "تجهیزات معدنی",   nameEn: "Mining Equipment",   slug: "mining-equipment",   layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 4, appIndustries: ["MINING"] },
      { name: "پمپ‌های صنعتی", nameEn: "Industrial Pumps", slug: "industrial-pumps", layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 5, appIndustries: ["OIL_GAS", "PETROCHEMICAL", "POWER"] },
      {
        name: "تجهیزات جایگاه سوخت", nameEn: "Fuel Station Equipment", slug: "fuel-station-equipment",
        layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 6,
        appIndustries: ["OIL_GAS", "PETROCHEMICAL", "TRANSPORT"],
        children: [
          { name: "دیسپنسر سوخت", nameEn: "Fuel Dispenser", slug: "fuel-dispenser", layer: "CATALOG", sortOrder: 1 },
          { name: "مخزن ذخیره سوخت", nameEn: "Fuel Storage Tank", slug: "fuel-storage-tank", layer: "CATALOG", sortOrder: 2 },
          { name: "پمپ مستغرق سوخت", nameEn: "Submersible Fuel Pump", slug: "submersible-fuel-pump", layer: "CATALOG", sortOrder: 3 },
          { name: "سامانه پایش مخزن و نشتی", nameEn: "Tank Monitoring & Leak Detection", slug: "tank-monitoring-system", layer: "CATALOG", sortOrder: 4 },
          { name: "فیلتراسیون سوخت", nameEn: "Fuel Filtration", slug: "fuel-filtration", layer: "CATALOG", sortOrder: 5 },
          { name: "شلنگ و نازل سوخت", nameEn: "Fuel Hose & Nozzle", slug: "fuel-hose-nozzle", layer: "CATALOG", sortOrder: 6 },
          { name: "بازیابی بخارات سوخت", nameEn: "Vapour Recovery Equipment", slug: "vapour-recovery-equipment", layer: "CATALOG", sortOrder: 7 },
        ],
      },
      { name: "فن‌های صنعتی",    nameEn: "Industrial Fans",    slug: "industrial-fans",    layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 6, appIndustries: ["FACTORY", "POWER"] },
      { name: "دیگ‌های بخار",    nameEn: "Boilers",            slug: "boilers",            layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 7, appIndustries: ["POWER", "PETROCHEMICAL"] },
      { name: "تجهیزات تهویه",   nameEn: "HVAC Equipment",     slug: "hvac-equipment",     layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 8, appIndustries: ["FACTORY"] },
      { name: "تجهیزات جوشکاری", nameEn: "Welding Equipment",  slug: "welding-equipment",  layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 9, appIndustries: ["STEEL", "CONSTRUCTION", "FACTORY"] },
      { name: "تجهیزات برش",     nameEn: "Cutting Equipment",  slug: "cutting-equipment",  layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 10, appIndustries: ["STEEL", "FACTORY"] },
      { name: "ترانسفورماتور",  nameEn: "Transformers",       slug: "transformers",       layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 11, appIndustries: ["POWER"] },
      { name: "تابلوهای برق",    nameEn: "Switchgears",        slug: "switchgears",        layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 12, appIndustries: ["POWER", "FACTORY"] },
      { name: "موتورهای الکتریکی", nameEn: "Electric Motors", slug: "electric-motors",    layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 13, appIndustries: ["FACTORY"] },
      { name: "سایر تجهیزات",    nameEn: "Other Industrial",   slug: "other-industrial-equipment", layer: "CATALOG", domain: "INDUSTRIAL_EQUIPMENT", sortOrder: 14 },
    ],
  },

  // ─── 10 ماشین‌آلات و تجهیزات کشاورزی (agriculture) — CATALOG — §12 ─────
  {
    name: "۱۰ ماشین‌آلات و تجهیزات کشاورزی", nameEn: "Agriculture Machinery & Equipment",
    slug: "agriculture", layer: "CATALOG", icon: "🌾", domain: "AGRICULTURE", featured: true, sortOrder: 10,
    children: [
      { name: "ماشین‌آلات کشاورزی", nameEn: "Agricultural Machinery", slug: "agricultural",   layer: "CATALOG", domain: "AGRICULTURE", sortOrder: 1, appIndustries: ["AGRICULTURE"] },
      { name: "تراکتور",            nameEn: "Tractor",                slug: "tractor",        layer: "CATALOG", domain: "AGRICULTURE", sortOrder: 2, appIndustries: ["AGRICULTURE"] },
      { name: "کمباین",             nameEn: "Combine Harvester",      slug: "combine-harvester", layer: "CATALOG", domain: "AGRICULTURE", sortOrder: 3, appIndustries: ["AGRICULTURE"] },
      { name: "سم‌پاش",             nameEn: "Sprayer",                slug: "sprayer",        layer: "CATALOG", domain: "AGRICULTURE", sortOrder: 4, appIndustries: ["AGRICULTURE"] },
      { name: "سیستم آبیاری",       nameEn: "Irrigation System",      slug: "irrigation-system", layer: "CATALOG", domain: "AGRICULTURE", sortOrder: 5, appIndustries: ["AGRICULTURE"] },
      { name: "تجهیات خاک‌ورزی",    nameEn: "Tillage Equipment",      slug: "tillage-equipment", layer: "CATALOG", domain: "AGRICULTURE", sortOrder: 6, appIndustries: ["AGRICULTURE"] },
      { name: "تجهیزات کاشت",       nameEn: "Planting Equipment",     slug: "planting-equipment", layer: "CATALOG", domain: "AGRICULTURE", sortOrder: 7, appIndustries: ["AGRICULTURE"] },
      { name: "تجهیزات برداشت",     nameEn: "Harvesting Equipment",   slug: "harvesting-equipment", layer: "CATALOG", domain: "AGRICULTURE", sortOrder: 8, appIndustries: ["AGRICULTURE"] },
      { name: "تجهیزات دامپروری",   nameEn: "Livestock Equipment",    slug: "livestock-equipment", layer: "CATALOG", domain: "AGRICULTURE", sortOrder: 9, appIndustries: ["AGRICULTURE"] },
      { name: "تجهیزات گلخانه",     nameEn: "Greenhouse Equipment",   slug: "greenhouse-equipment", layer: "CATALOG", domain: "AGRICULTURE", sortOrder: 10, appIndustries: ["AGRICULTURE"] },
      { name: "تجهیزات باغداری",     nameEn: "Garden Equipment",       slug: "garden-equipment", layer: "CATALOG", domain: "AGRICULTURE", sortOrder: 11, appIndustries: ["AGRICULTURE", "FORESTRY"] },
      { name: "سایر",               nameEn: "Other Agriculture",      slug: "other-agriculture", layer: "CATALOG", domain: "AGRICULTURE", sortOrder: 12 },
    ],
  },

  // ─── 11 بازرگانی و تأمین (trading) — MARKETPLACE — §13 ─────
  {
    name: "۱۱ بازرگانی و تأمین", nameEn: "Trading & Supply",
    slug: "trading", layer: "MARKETPLACE", icon: "📦", domain: "TRADING", sortOrder: 11,
    children: [
      { name: "بازرگانی ماشین‌آلات", nameEn: "Machinery Trading", slug: "machinery-trading", layer: "MARKETPLACE", domain: "TRADING", sortOrder: 1 },
      { name: "بازرگانی قطعات",     nameEn: "Parts Trading",     slug: "parts-trading",     layer: "MARKETPLACE", domain: "TRADING", sortOrder: 2 },
      { name: "بازرگانی مصالح",     nameEn: "Materials Trading", slug: "materials-trading", layer: "MARKETPLACE", domain: "TRADING", sortOrder: 3 },
      { name: "بازرگانی خودرو",     nameEn: "Vehicles Trading",  slug: "vehicles-trading",  layer: "MARKETPLACE", domain: "TRADING", sortOrder: 4 },
      { name: "خدمات واردات",       nameEn: "Import Services",   slug: "import-services",   layer: "MARKETPLACE", domain: "TRADING", sortOrder: 5 },
      { name: "خدمات صادرات",       nameEn: "Export Services",   slug: "export-services",   layer: "MARKETPLACE", domain: "TRADING", sortOrder: 6 },
      { name: "کارگزاری",           nameEn: "Brokerage",         slug: "brokerage",         layer: "MARKETPLACE", domain: "TRADING", sortOrder: 7 },
      { name: "سایر",               nameEn: "Other Trading",     slug: "other-trading",     layer: "MARKETPLACE", domain: "TRADING", sortOrder: 8 },
    ],
  },

  // ─── 12 مزایده و فروش ویژه (auction) — MARKETPLACE — §14 ─────
  {
    name: "۱۲ مزایده و فروش ویژه", nameEn: "Auction & Special Sale",
    slug: "auction", layer: "MARKETPLACE", icon: "🔨", domain: "AUCTION", sortOrder: 12,
    children: [
      { name: "مزایده ماشین‌آلات", nameEn: "Machinery Auction", slug: "machinery-auction", layer: "MARKETPLACE", domain: "AUCTION", sortOrder: 1 },
      { name: "مزایده خودرو",      nameEn: "Vehicle Auction",   slug: "vehicle-auction",   layer: "MARKETPLACE", domain: "AUCTION", sortOrder: 2 },
      { name: "مزایده قطعات",      nameEn: "Parts Auction",     slug: "parts-auction",     layer: "MARKETPLACE", domain: "AUCTION", sortOrder: 3 },
      { name: "مزایده مصالح",      nameEn: "Materials Auction", slug: "materials-auction", layer: "MARKETPLACE", domain: "AUCTION", sortOrder: 4 },
      { name: "مزایده دولتی",      nameEn: "Government Auction", slug: "government-auction", layer: "MARKETPLACE", domain: "AUCTION", sortOrder: 5 },
      { name: "حراج ورشکستگی",     nameEn: "Bankruptcy Auction", slug: "bankruptcy-auction", layer: "MARKETPLACE", domain: "AUCTION", sortOrder: 6 },
      { name: "سایر",              nameEn: "Other Auction",     slug: "other-auction",     layer: "MARKETPLACE", domain: "AUCTION", sortOrder: 7 },
    ],
  },

  // ─── 13 درخواست خرید / تأمین (wanted) — MARKETPLACE — §15 ─────
  {
    name: "۱۳ درخواست خرید / تأمین", nameEn: "Wanted / Procurement",
    slug: "wanted", layer: "MARKETPLACE", icon: "📢", domain: "REQUEST", sortOrder: 13,
    children: [
      { name: "درخواست ماشین‌آلات", nameEn: "Machinery Wanted",  slug: "machinery-wanted",  layer: "MARKETPLACE", domain: "REQUEST", sortOrder: 1 },
      { name: "درخواست خودرو",      nameEn: "Vehicle Wanted",    slug: "vehicle-wanted",    layer: "MARKETPLACE", domain: "REQUEST", sortOrder: 2 },
      { name: "درخواست قطعات",      nameEn: "Parts Wanted",      slug: "parts-wanted",      layer: "MARKETPLACE", domain: "REQUEST", sortOrder: 3 },
      { name: "درخواست مصالح",      nameEn: "Materials Wanted",  slug: "materials-wanted",  layer: "MARKETPLACE", domain: "REQUEST", sortOrder: 4 },
      { name: "درخواست متعلقات",    nameEn: "Attachments Wanted", slug: "attachments-wanted", layer: "MARKETPLACE", domain: "REQUEST", sortOrder: 5 },
      { name: "درخواست خدمات",      nameEn: "Services Wanted",   slug: "services-wanted",   layer: "MARKETPLACE", domain: "REQUEST", sortOrder: 6 },
      { name: "درخواست اجاره",      nameEn: "Rental Wanted",     slug: "rental-wanted",     layer: "MARKETPLACE", domain: "REQUEST", sortOrder: 7 },
      { name: "درخواست عمده",       nameEn: "Bulk Wanted",       slug: "bulk-wanted",       layer: "MARKETPLACE", domain: "REQUEST", sortOrder: 8 },
      { name: "سایر",               nameEn: "Other Wanted",      slug: "other-wanted",      layer: "MARKETPLACE", domain: "REQUEST", sortOrder: 9 },
    ],
  },

  // ─── 14 سایر (other) — FALLBACK — §16 ─────
  {
    name: "۱۴ سایر", nameEn: "Other", slug: "other", layer: "FALLBACK",
    icon: "🗂️", domain: "GENERAL", sortOrder: 14,
    children: [
      { name: "سایر ماشین‌آلات", nameEn: "Other Machinery", slug: "other-machinery", layer: "FALLBACK", domain: "GENERAL", sortOrder: 1 },
      { name: "سایر خودروها",    nameEn: "Other Vehicles",  slug: "other-vehicles-fallback", layer: "FALLBACK", domain: "GENERAL", sortOrder: 2 },
      { name: "سایر قطعات",      nameEn: "Other Parts",     slug: "other-parts-fallback",    layer: "FALLBACK", domain: "GENERAL", sortOrder: 3 },
      { name: "متفرقه",          nameEn: "Miscellaneous",   slug: "other-misc",              layer: "FALLBACK", domain: "GENERAL", sortOrder: 4 },
    ],
  },
];

// ════════════════════════════════════════════════════════════
// 5. LOCATIONS — Iran: 1 country + 31 provinces + cities
// ════════════════════════════════════════════════════════════
const LEGACY_ROOT_REPARENT_SLUGS = [
  "excavator", "loader", "bulldozer", "grader", "dump-truck",
  "crane", "road-roller", "forklift", "generator", "compressor",
  "concrete-machinery", "agricultural", "spare-parts", "mining-equipment",
  "aerial-platform", "forestry",
] as const;

type PlannedTaxonomyCategory = {
  slug: string;
  parentSlug: string | null;
  layer: CatSeed["layer"];
  domain: string | null;
  level: number;
  taxPath: string;
};

function collectTaxonomyPlan(
  nodes: CatSeed[],
  parentSlug: string | null = null,
  parentPath?: string,
  level = 0,
  out: PlannedTaxonomyCategory[] = [],
): PlannedTaxonomyCategory[] {
  for (const node of nodes) {
    const taxPath = parentPath ? `${parentPath}.${node.slug}` : node.slug;
    const domain = node.domain ?? (node.layer === "CATALOG" ? "MACHINE" : null);
    out.push({ slug: node.slug, parentSlug, layer: node.layer, domain, level, taxPath });
    if (node.children?.length) {
      collectTaxonomyPlan(node.children, node.slug, taxPath, level + 1, out);
    }
  }
  return out;
}

// Read-only hierarchy validation. It runs before the first upsert so unexpected
// slug collisions or administrator-managed reparenting stop the entire seed.
async function preflightTaxonomyHierarchy(): Promise<void> {
  const plan = collectTaxonomyPlan(TREE);
  const plannedBySlug = new Map(plan.map((item) => [item.slug, item]));
  if (plannedBySlug.size !== plan.length) {
    throw new Error("Duplicate category slug in V1.1 taxonomy plan; no writes were made");
  }

  const missingLegacyTargets = LEGACY_ROOT_REPARENT_SLUGS.filter((slug) => !plannedBySlug.has(slug));
  if (missingLegacyTargets.length) {
    throw new Error(`Legacy reparent allowlist is not represented in the taxonomy plan: ${missingLegacyTargets.join(", ")}; no writes were made`);
  }

  const missingParents = plan
    .filter((item) => item.parentSlug !== null && !plannedBySlug.has(item.parentSlug))
    .map((item) => `${item.slug}->${item.parentSlug}`);
  if (missingParents.length) {
    throw new Error(`Taxonomy plan contains missing parents: ${missingParents.join(", ")}; no writes were made`);
  }

  const existing = await db.category.findMany({
    where: { slug: { in: plan.map((item) => item.slug) } },
    select: { id: true, slug: true, parentId: true, level: true, layer: true, domain: true, taxPath: true },
  });
  const existingBySlug = new Map(existing.map((row) => [row.slug, row]));

  for (const item of plan) {
    const row = existingBySlug.get(item.slug);
    if (!row) continue;

    const expectedParent = item.parentSlug ? existingBySlug.get(item.parentSlug) : undefined;
    const isLegacyRootAwaitingReviewedReparent =
      LEGACY_ROOT_REPARENT_SLUGS.includes(item.slug as (typeof LEGACY_ROOT_REPARENT_SLUGS)[number]) &&
      row.parentId === null &&
      row.level === 0 &&
      (row.taxPath === null || row.taxPath === item.slug) &&
      row.layer === item.layer &&
      (row.domain === null || row.domain === item.domain);

    if (!isLegacyRootAwaitingReviewedReparent && (row.layer !== item.layer || row.domain !== item.domain)) {
      throw new Error(`Category layer/domain collision for "${item.slug}" (expected ${item.layer}/${item.domain ?? "null"}); no writes were made`);
    }

    if (item.parentSlug !== null && !expectedParent) {
      if (isLegacyRootAwaitingReviewedReparent) continue;
      throw new Error(`Expected parent "${item.parentSlug}" is not present for existing category "${item.slug}"; no writes were made`);
    }

    const expectedParentId = expectedParent?.id ?? null;
    const hierarchyMatches =
      row.parentId === expectedParentId &&
      row.level === item.level &&
      row.taxPath === item.taxPath;

    if (!hierarchyMatches && !isLegacyRootAwaitingReviewedReparent) {
      throw new Error(`Category hierarchy collision for "${item.slug}" (expected parent "${item.parentSlug ?? "<root>"}", level ${item.level}, taxPath "${item.taxPath}"); no writes were made`);
    }
  }
}

import IRAN_LOCATION_DATA from "./data/iran-locations-1404.json";
import IRAN_LOCATION_MANIFEST from "./data/iran-locations-1404.manifest.json";

type ProvinceSeed = {
  sourceCode: string;
  name: string;
  cities: Array<{ sourceCode: string; name: string; sortOrder: number }>;
};

// Canonical Country → Province → City catalog. County/district/village rows
// are intentionally absent from the listing selector's normalized dataset.
const IRAN_PROVINCES: ProvinceSeed[] = IRAN_LOCATION_DATA.provinces.map((province) => ({
  sourceCode: province.sourceCode,
  name: province.name,
  cities: IRAN_LOCATION_DATA.cities
    .filter((city) => city.provinceCode === province.sourceCode)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((city) => ({ sourceCode: city.sourceCode, name: city.name, sortOrder: city.sortOrder })),
}));

// ════════════════════════════════════════════════════════════
// RECURSIVE UPSERT
// ════════════════════════════════════════════════════════════
async function upsertCat(c: CatSeed, parentId?: string, parentPath?: string, level = 0): Promise<{ id: string }> {
  const taxPath = parentPath ? `${parentPath}.${c.slug}` : c.slug;
  const domain = c.domain ?? (c.layer === "CATALOG" ? "MACHINE" : undefined);

  const cat = await db.category.upsert({
    where: { slug: c.slug },
    create: {
      name: c.name,
      nameEn: c.nameEn ?? null,
      slug: c.slug,
      layer: c.layer,
      icon: c.icon ?? null,
      imageUrl: null,
      description: null,
      domain: domain ?? null,
      taxPath,
      parentId: parentId ?? null,
      level,
      sortOrder: c.sortOrder ?? 0,
      featured: c.featured ?? false,
      active: true,
      showOnHome: true,
    },
    // Canonical labels, ordering and hierarchy come from the reviewed V1.1 tree.
    update: {
      // The reviewed V1.1 tree is canonical for category labels and hierarchy.
      // Preserve media/descriptions and curated fields not explicitly in this seed.
      name: c.name,
      nameEn: c.nameEn ?? null,
      layer: c.layer,
      domain: domain ?? null,
      taxPath,
      parentId: parentId ?? null,
      level,
      sortOrder: c.sortOrder ?? 0,
      ...(c.icon ? { icon: c.icon } : {}),
    },
  });

  // Link to application industries (idempotent via unique constraint)
  if (c.appIndustries && c.appIndustries.length > 0) {
    for (const indKey of c.appIndustries) {
      const ind = await db.applicationIndustry.findUnique({ where: { key: indKey } });
      if (!ind) {
        console.warn(`  ⚠ ApplicationIndustry not found for key "${indKey}" (cat slug=${c.slug})`);
        continue;
      }
      await db.categoryApplicationIndustry.upsert({
        where: { categoryId_applicationIndustryId: { categoryId: cat.id, applicationIndustryId: ind.id } },
        create: { categoryId: cat.id, applicationIndustryId: ind.id },
        update: {},
      });
    }
  }

  // Recurse into children
  if (c.children && c.children.length > 0) {
    for (let i = 0; i < c.children.length; i++) {
      // Default sortOrder = index+1 if not specified
      const child = c.children[i];
      if (child.sortOrder === undefined) child.sortOrder = i + 1;
      await upsertCat(child, cat.id, taxPath, level + 1);
    }
  }

  return cat;
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════
async function main() {
  if (!process.argv.includes("--apply")) {
    console.log("DRY RUN: no database writes performed. Verify the Preview database and backup, then rerun with --apply.");
    return;
  }
  if (process.env.HEAVIX_ENV !== "preview") {
    throw new Error("Refusing to seed: HEAVIX_ENV must be preview. No writes performed.");
  }
  if (
    IRAN_LOCATION_MANIFEST.rightsReviewStatus !== "APPROVED" ||
    IRAN_LOCATION_MANIFEST.commercialUseAllowed !== true
  ) {
    throw new Error(
      "Refusing to seed: Iran location dataset rights gate is not approved. " +
      "No database writes performed; review prisma/data/iran-locations-1404.manifest.json first.",
    );
  }
  console.log("🌱 HEAVIX Taxonomy Seed V1.1 starting...\n");

  console.log("Preflighting existing category hierarchy (read-only)...");
  await preflightTaxonomyHierarchy();

  // Category-only mode is isolated from TransactionTypes, ServiceTypes,
  // ApplicationIndustries and Location seeds.
  if (process.argv.includes("--categories-only")) {
    console.log(`Applying canonical HEAVIX category hierarchy (${TREE.length} roots)...`);
    for (let i = 0; i < TREE.length; i++) {
      const root = TREE[i];
      if (root.sortOrder === undefined) root.sortOrder = i + 1;
      await upsertCat(root, undefined, undefined, 0);
    }

    const plan = collectTaxonomyPlan(TREE);
    const rows = await db.category.findMany({
      where: { active: true },
      select: { id: true, slug: true, parentId: true, level: true, taxPath: true },
    });
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    const mismatches = plan.filter((item) => {
      const row = bySlug.get(item.slug);
      const parent = item.parentSlug ? bySlug.get(item.parentSlug) : undefined;
      return !row ||
        row.parentId !== (parent?.id ?? null) ||
        row.level !== item.level ||
        row.taxPath !== item.taxPath;
    }).map((item) => item.slug);
    const expectedRoots = TREE.map((root) => root.slug).sort();
    const actualRoots = rows.filter((row) => row.parentId === null).map((row) => row.slug).sort();
    const unexpectedCategories = rows.filter((row) => !plan.some((item) => item.slug === row.slug)).map((row) => row.slug);
    if (mismatches.length || unexpectedCategories.length ||
        JSON.stringify(expectedRoots) !== JSON.stringify(actualRoots)) {
      throw new Error("Category hierarchy verification failed: " + JSON.stringify({
        mismatches, unexpectedCategories, expectedRoots, actualRoots,
      }));
    }
    console.log("CATEGORY HIERARCHY VERIFIED");
    console.log(JSON.stringify({
      activeCategories: rows.length,
      plannedCategories: plan.length,
      rootCount: actualRoots.length,
      roots: expectedRoots,
      parentChildEdges: plan.filter((item) => item.parentSlug !== null).length,
      maxDepth: Math.max(...plan.map((item) => item.level)),
    }, null, 2));
    return;
  }

  // 1. TransactionTypes
  console.log(`1/6 Seeding ${TRANSACTIONS.length} TransactionTypes (HBR §18)...`);
  for (const t of TRANSACTIONS) {
    await db.transactionType.upsert({
      where: { key: t.key },
      create: t,
      update: {},
    });
  }

  // 2. ServiceTypes
  console.log(`2/6 Seeding ${SERVICES.length} ServiceTypes (HBR §19)...`);
  for (const s of SERVICES) {
    await db.serviceType.upsert({
      where: { key: s.key },
      create: s,
      update: {},
    });
  }

  // 3. ApplicationIndustries
  console.log(`3/6 Seeding ${APP_INDUSTRIES.length} ApplicationIndustries (HBR §17)...`);
  for (const i of APP_INDUSTRIES) {
    await db.applicationIndustry.upsert({
      where: { key: i.key },
      create: i,
      update: {},
    });
  }

  // 4. Category tree V1.1
  console.log(`4/6 Seeding Category tree V1.1 (${TREE.length} roots)...`);
  for (let i = 0; i < TREE.length; i++) {
    const root = TREE[i];
    if (root.sortOrder === undefined) root.sortOrder = i + 1;
    await upsertCat(root, undefined, undefined, 0);
  }

  // 5. Locations (Iran): all 31 provinces and every distinct real-city
  // name from the official-source-year-1404 dataset. Two same-name records
  // occur in different counties of the same province; the current City model
  // is province/name unique, so identical selectable names are deduplicated.
  console.log(`5/6 Seeding Locations (Iran + ${IRAN_PROVINCES.length} provinces + ${IRAN_LOCATION_DATA.metadata.distinctCityCount} distinct city names)...`);
  const iran = await db.country.upsert({
    where: { name: "ایران" },
    create: { name: "ایران", nameEn: "Iran", code: "IR", phoneCode: "+98", sortOrder: 1 },
    update: {},
  });

  // Correct the historical seed spelling without replacing the province row
  // or changing its ID/relations. If both spellings exist, stop for reviewed
  // reconciliation rather than creating another ambiguous province.
  const legacyChaharmahal = await db.province.findUnique({
    where: { countryId_name: { countryId: iran.id, name: "چاهارمحال و بختیاری" } },
    select: { id: true },
  });
  const canonicalChaharmahal = await db.province.findUnique({
    where: { countryId_name: { countryId: iran.id, name: "چهارمحال و بختیاری" } },
    select: { id: true },
  });
  if (legacyChaharmahal && canonicalChaharmahal) {
    throw new Error("Both legacy and canonical Chaharmahal province rows exist; reviewed data reconciliation is required before seeding locations.");
  }
  if (legacyChaharmahal) {
    await db.province.update({
      where: { id: legacyChaharmahal.id },
      data: { name: "چهارمحال و بختیاری" },
    });
  }

  let totalCities = 0;
  for (let p = 0; p < IRAN_PROVINCES.length; p++) {
    const pr = IRAN_PROVINCES[p];
    const prov = await db.province.upsert({
      where: { countryId_name: { countryId: iran.id, name: pr.name } },
      create: { countryId: iran.id, name: pr.name, sourceCode: pr.sourceCode, sortOrder: p + 1 },
      update: { sourceCode: pr.sourceCode },
    });
    for (const city of pr.cities) {
      await db.city.upsert({
        where: { provinceId_name: { provinceId: prov.id, name: city.name } },
        create: {
          provinceId: prov.id,
          name: city.name,
          sourceCode: city.sourceCode,
          sortOrder: city.sortOrder,
        },
        update: { sourceCode: city.sourceCode },
      });
      totalCities++;
    }
  }
  if (totalCities !== IRAN_LOCATION_DATA.metadata.distinctCityCount) {
    throw new Error(`Location seed count mismatch: expected ${IRAN_LOCATION_DATA.metadata.distinctCityCount}, processed ${totalCities}`);
  }

  // 6. Final counts
  console.log("6/6 Counting final state...\n");
  const [
    categories, transactionTypes, serviceTypes, appIndustries,
    countries, provinces, cities, catIndustries, rootsAll,
  ] = await Promise.all([
    db.category.count(),
    db.transactionType.count(),
    db.serviceType.count(),
    db.applicationIndustry.count(),
    db.country.count(),
    db.province.count(),
    db.city.count(),
    db.categoryApplicationIndustry.count(),
    db.category.count({ where: { parentId: null } }),
  ]);

  const layerBreakdown = await db.category.groupBy({
    by: ["layer"],
    _count: true,
    orderBy: { layer: "asc" },
  });

  // Verify reparenting: check that the 16 legacy root slugs are no longer at root level
  const LEGACY_ROOT_SLUGS = LEGACY_ROOT_REPARENT_SLUGS;
  const stillAtRoot: string[] = [];
  for (const slug of LEGACY_ROOT_SLUGS) {
    const cat = await db.category.findUnique({
      where: { slug },
      select: { slug: true, parentId: true, level: true, taxPath: true },
    });
    if (!cat || cat.parentId === null) stillAtRoot.push(slug);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("✅ TAXONOMY SEED V1.1 — FINAL COUNTS");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(JSON.stringify({
    categories,
    transactionTypes,
    serviceTypes,
    appIndustries,
    countries,
    provinces,
    cities,
    catIndustries,
    rootCategories: rootsAll,
    layerBreakdown: layerBreakdown.map(l => ({ layer: l.layer, count: l._count })),
    legacyRootsStillAtRoot: stillAtRoot,
    legacyRootsReparented: LEGACY_ROOT_SLUGS.length - stillAtRoot.length,
  }, null, 2));
  console.log("═══════════════════════════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
