// @ts-nocheck — seed script, not part of runtime typecheck
/**
 * Phase 3: Canonical Catalog Seed.
 * Per HEAVIX COMPLETION MASTER SPEC V1.0 §11-19.
 *
 * Legacy Preview seed for sample Products and Locations only.
 * Compatibility and RBAC mutations are deliberately excluded.
 *
 * This bridges the gap from SCHEMA_ONLY to IMPLEMENTED by populating
 * the canonical catalog entities with real data.
 */
import { db } from "../src/lib/db";
import { assertPreviewSeedTarget } from "./seed-preview-guard";

async function main() {
  if (!(await assertPreviewSeedTarget(db, "HEAVIX_PREVIEW_LEGACY_PHASE3_SEED_APPROVED"))) return;
  console.log("=== PHASE 3: CANONICAL CATALOG SEED ===\n");

  // ── 1. Canonical Locations (Country → Province → City) ──
  console.log("1. Seeding Locations...");
  
  let iran = await db.country.findFirst({ where: { code: "IR" } });
  if (!iran) {
    iran = await db.country.create({
      data: {
        code: "IR",
        name: "ایران",
        nameEn: "Iran",
        phoneCode: "+98",
        sortOrder: 1,
      },
    });
    console.log("  ✓ Created Iran");
  }

  const provinces = [
    { name: "تهران", nameEn: "Tehran", cities: ["تهران", "اسلام‌شهر", "شهریار", "ورامین", "پاکدشت"] },
    { name: "اصفهان", nameEn: "Isfahan", cities: ["اصفهان", "کاشان", "نجف‌آباد", "خمینی‌شهر", "شاهین‌شهر"] },
    { name: "خراسان رضوی", nameEn: "Razavi Khorasan", cities: ["مشهد", "نیشابور", "تربت", "سبزوار", "قوچان"] },
    { name: "فارس", nameEn: "Fars", cities: ["شیراز", "مرودشت", "کازرون", "جهرم", "فسا"] },
    { name: "آذربایجان شرقی", nameEn: "East Azerbaijan", cities: ["تبریز", "مراغه", "میانه", "اهر", "بناب"] },
    { name: "خوزستان", nameEn: "Khuzestan", cities: ["اهواز", "آبادان", "خرمشهر", "دزفول", "ماهشهر"] },
    { name: "البرز", nameEn: "Alborz", cities: ["کرج", "نظرآباد", "هشتگرد", "محمدشهر", "اشتهارد"] },
    { name: "گیلان", nameEn: "Gilan", cities: ["رشت", "بندر انزلی", "لاهیجان", "آستارا", "صومعه‌سرا"] },
    { name: "مازندران", nameEn: "Mazandaran", cities: ["ساری", "بابل", "آمل", "قائم‌شهر", "نوشهر"] },
    { name: "کرمان", nameEn: "Kerman", cities: ["کرمان", "سیرجان", "رفسنجان", "جیرفت", "بم"] },
  ];

  let provCount = 0;
  let cityCount = 0;
  for (const p of provinces) {
    let province = await db.province.findFirst({
      where: { countryId: iran.id, name: p.name },
    });
    if (!province) {
      province = await db.province.create({
        data: {
          countryId: iran.id,
          name: p.name,
          nameEn: p.nameEn,
          code: p.nameEn.toUpperCase().replace(/\s+/g, "_").slice(0, 10),
          sortOrder: provCount + 1,
        },
      });
      provCount++;
    }

    for (const cityName of p.cities) {
      const existing = await db.city.findFirst({
        where: { provinceId: province.id, name: cityName },
      });
      if (!existing) {
        await db.city.create({
          data: {
            provinceId: province.id,
            name: cityName,
            sortOrder: cityCount + 1,
          },
        });
        cityCount++;
      }
    }
  }
  console.log(`  ✓ ${provCount} provinces, ${cityCount} cities created`);

  // ── 2. Products (canonical catalog entities) ──
  console.log("\n2. Seeding Products...");
  
  // Get some brands to link products to (Persian names)
  const komatsu = await db.brand.findFirst({ where: { slug: "komatsu" } });
  const caterpillar = await db.brand.findFirst({ where: { slug: "caterpillar" } });
  const hitachi = await db.brand.findFirst({ where: { slug: "hitachi" } });
  const volvo = await db.brand.findFirst({ where: { slug: "volvo-ce" } });
  
  // Get machinery category
  const machinery = await db.category.findFirst({ where: { slug: "machinery" } });
  const roadCat = await db.category.findFirst({ where: { slug: "road-construction" } });
  const miningCat = await db.category.findFirst({ where: { slug: "mining-machinery" } });

  const products = [
    { name: "Komatsu PC200-8 Excavator", brand: komatsu, cat: roadCat, desc: "بیل مکانیکی ۲۰ تن کوماتسو" },
    { name: "Komatsu PC220-8 Excavator", brand: komatsu, cat: roadCat, desc: "بیل مکانیکی ۲۲ تن کوماتسو" },
    { name: "Caterpillar 320D Excavator", brand: caterpillar, cat: roadCat, desc: "بیل مکانیکی ۲۰ تن کاترپیلار" },
    { name: "Caterpillar 966H Wheel Loader", brand: caterpillar, cat: roadCat, desc: "لودر چرخی کاترپیلار" },
    { name: "Caterpillar D6R Bulldozer", brand: caterpillar, cat: roadCat, desc: "بلدوزر کاترپیلار" },
    { name: "Hitachi ZX350 Excavator", brand: hitachi, cat: roadCat, desc: "بیل مکانیکی ۳۵ تن هیتاچی" },
    { name: "Hitachi ZX210 Excavator", brand: hitachi, cat: roadCat, desc: "بیل مکانیکی ۲۱ تن هیتاچی" },
    { name: "Volvo A40G Dump Truck", brand: volvo, cat: miningCat, desc: "دامپ‌تراک ۴۰ تن وولوو" },
    { name: "Volvo L120H Wheel Loader", brand: volvo, cat: roadCat, desc: "لودر چرخی وولوو" },
  ];

  let prodCount = 0;
  for (const p of products) {
    if (!p.brand || !p.cat) continue;
    const slug = p.name.toLowerCase().replace(/\s+/g, "-");
    const existing = await db.product.findFirst({ where: { slug } });
    if (!existing) {
      await db.product.create({
        data: {
          canonicalName: p.name,
          slug,
          description: p.desc,
          status: "ACTIVE",
          source: "SEED",
          brandId: p.brand.id,
          categoryId: p.cat.id,
        },
      });
      prodCount++;
    }
  }
  console.log(`  ✓ ${prodCount} products created`);

  // ── 3. Parts ──
  console.log("\n3. Seeding Parts...");
  console.log("  ⚠ Part model is minimal (no slug/canonicalName/brandId). Skipping — store.db has 289 parts.");
  // Note: The store.db (separate Prisma client) has the full Part model with
  // brandId, categoryId, priceUsd, etc. The HEAVIX main DB Part model is a
  // simple compatibility placeholder. Full parts catalog is in the store.

  // Compatibility edges and RBAC mutations are intentionally excluded.
  // FITS claims require reviewed OEM/part-number evidence; role assignment belongs to RBAC provisioning.

}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
}).finally(() => db.$disconnect());
