/**
 * HEAVIX — STEP 13.53 Phase C — P2-B seed-phase-catalog
 * ----------------------------------------------------------------
 * Resolves the 67 phase-tests seed-gap failures by backfilling the
 * catalog / marketplace / location / moderation / deal / search
 * data that phase1..phase9 contract tests assert exists.
 *
 * ROOT CAUSE (verified in STEP 13.52 root-cause):
 *   The CI `phase-tests` job only runs seed-rbac + seed-brands-a/b +
 *   seed-user-roles + seed-test-fixtures. That stack creates:
 *     - Industries, BrandFamilies, Brands, BrandAliases, BrandIndustries
 *     - Roles, Permissions, RolePermissions, UserRoles
 *     - 1 admin User + 4 BUYER test-fixture Users
 *   It does NOT create: Country/Province/City, TransactionType,
 *   AttributeDefinition/AttributeOption/CategoryAttribute, Category,
 *   Company/CompanyBranch/CompanyVerification/CompanyDocument,
 *   ProductModel/Product/Listing/ListingImage, ModerationLog,
 *   ListingRejection, DealRoom/ListingOffer/Payment, SearchQuery,
 *   BuyRequest, Inspection.
 *
 *   67 of the 69 phase-tests failures are direct assertions against
 *   these missing tables (counts, findFirst, groupBy, findMany).
 *
 * DESIGN RULES (per owner directive §4.2):
 *   - Idempotent: every write is upsert-by-stable-key or
 *     findFirst-or-create. Safe to re-run; never throws on second
 *     run; never creates duplicates.
 *   - Deterministic keys: no RNG, no Date.now() in keys. Stable
 *     slugs like `phase-cat-country-ir`, `phase-cat-txtype-sale`,
 *     `phase-cat-listing-1`, etc. createdAt defaults are fine —
 *     they only affect display ordering.
 *   - FK order respected: Country → Province → City; Category (root
 *     → child) before CategoryAttribute; Brand → ProductModel →
 *     Product → Listing; TransactionType before Listing; User +
 *     Company + Listing before DealRoom/ListingOffer/Payment;
 *     AttributeDefinition → AttributeOption → CategoryAttribute
 *     before ListingAttributeValue (not strictly required by tests
 *     but kept for completeness).
 *   - Distinguishable from real data: every fixture uses the
 *     `phase-cat-` prefix in slugs/emails/codes so it can be
 *     identified and removed without touching real rows.
 *   - Non-destructive: never deletes or overwrites existing real
 *     rows. Only sets nullable FK fields when currently NULL on
 *     rows we own; existing rows from other seeds are untouched.
 *   - Test-isolated: data is for the test DB only (uses the same
 *     `db` client as the app; same DATABASE_URL).
 *
 * Run:
 *   bunx tsx prisma/seed-phase-catalog.ts
 *   or: bun run db:seed-phase-catalog
 */
import { db } from "../src/lib/db";
import bcrypt from "bcryptjs";

// ════════════════════════════════════════════════════════════
// DETERMINISTIC CONSTANTS
// ════════════════════════════════════════════════════════════

// Stable timestamps (not Date.now()) — kept deterministic so re-runs
// don't change row state.
const PUBLISHED_AT = new Date("2026-01-15T08:00:00.000Z");
const EXPIRES_AT = new Date("2026-12-31T23:59:59.000Z");
const VERIFIED_AT = new Date("2026-01-05T00:00:00.000Z");
const SUBMITTED_AT = new Date("2026-01-10T00:00:00.000Z");
const REVIEWED_AT = new Date("2026-01-12T00:00:00.000Z");
const REVOKED_AT = new Date("2026-02-01T00:00:00.000Z");

// Stable password hash (deterministic; bcrypt with fixed salt).
// Computed lazily inside main() because top-level await is not supported
// with the CJS output format used by tsx.
// Note: the value is not used for real auth — these are test fixtures.
let FIXTURE_PASSWORD_HASH = "";

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

/** findFirst-or-create idempotency: never overwrites existing rows. */
async function findOrCreate<T>(params: {
  find: () => Promise<T | null>;
  create: () => Promise<T>;
}): Promise<T> {
  const existing = await params.find();
  if (existing) return existing;
  return params.create();
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════

async function main() {
  console.log("=== STEP 13.53 Phase C — P2-B SEED PHASE CATALOG ===\n");

  // Compute the fixture password hash now (top-level await is not supported
  // under the CJS output format used by tsx).
  FIXTURE_PASSWORD_HASH = await bcrypt.hash("PhaseCatTestFixtures#2026", 10);

  // ── 0. Reference admin (must already exist from seed-user-roles) ──
  const adminMobile = process.env.ADMIN_USERNAME ?? "ci-admin";
  const admin = await db.user.findFirst({ where: { mobile: adminMobile } });
  if (!admin) {
    throw new Error(
      `Admin user not found (mobile=${adminMobile}). Run seed-user-roles first.`,
    );
  }
  console.log(`  ✓ Admin reference: ${admin.email} (${admin.id})\n`);

  // ════════════════════════════════════════════════════════════
  // 1. COUNTRY / PROVINCE / CITY  (phase1 #10, phase3 #5, phase4 #7)
  // ════════════════════════════════════════════════════════════
  console.log("1. Seeding Country / Province / City...");
  const iran = await db.country.upsert({
    where: { code: "IR" },
    update: {},
    create: {
      name: "ایران",
      nameEn: "Iran",
      code: "IR",
      phoneCode: "+98",
      sortOrder: 1,
    },
  });

  const provinces = [
    { slug: "phase-cat-province-tehran", name: "تهران", nameEn: "Tehran", sortOrder: 1 },
    { slug: "phase-cat-province-esfahan", name: "اصفهان", nameEn: "Esfahan", sortOrder: 2 },
    { slug: "phase-cat-province-fars", name: "فارس", nameEn: "Fars", sortOrder: 3 },
  ];
  const provinceIds: Record<string, string> = {};
  for (const p of provinces) {
    // Province has @@unique([countryId, name]) — use that as the upsert key.
    const row = await db.province.upsert({
      where: { countryId_name: { countryId: iran.id, name: p.name } },
      update: {},
      create: {
        countryId: iran.id,
        name: p.name,
        nameEn: p.nameEn,
        code: p.slug.replace("phase-cat-province-", "").toUpperCase(),
        sortOrder: p.sortOrder,
      },
    });
    provinceIds[p.slug] = row.id;
  }

  const cities = [
    { slug: "phase-cat-city-tehran", provinceSlug: "phase-cat-province-tehran", name: "تهران", nameEn: "Tehran", lat: 35.6892, lng: 51.3890 },
    { slug: "phase-cat-city-shiraz", provinceSlug: "phase-cat-province-fars", name: "شیراز", nameEn: "Shiraz", lat: 29.5918, lng: 52.5837 },
    { slug: "phase-cat-city-kashan", provinceSlug: "phase-cat-province-esfahan", name: "کاشان", nameEn: "Kashan", lat: 33.9850, lng: 51.4144 },
    { slug: "phase-cat-city-esfahan", provinceSlug: "phase-cat-province-esfahan", name: "اصفهان", nameEn: "Esfahan", lat: 32.6539, lng: 51.6660 },
  ];
  const cityIds: Record<string, string> = {};
  for (const c of cities) {
    const provinceId = provinceIds[c.provinceSlug];
    const row = await db.city.upsert({
      where: { provinceId_name: { provinceId, name: c.name } },
      update: {},
      create: {
        provinceId,
        name: c.name,
        nameEn: c.nameEn,
        latitude: c.lat,
        longitude: c.lng,
        sortOrder: 1,
      },
    });
    cityIds[c.slug] = row.id;
  }
  console.log(
    `  ✓ 1 country, ${Object.keys(provinceIds).length} provinces, ${Object.keys(cityIds).length} cities`,
  );

  // ════════════════════════════════════════════════════════════
  // 2. CATEGORIES (phase1 #1, phase4 #12)
  // phase1 expects slug="machinery" root + a child.
  // ════════════════════════════════════════════════════════════
  console.log("\n2. Seeding Categories...");
  const machinery = await db.category.upsert({
    where: { slug: "machinery" },
    update: {},
    create: {
      name: "ماشین‌آلات",
      nameEn: "Machinery",
      slug: "machinery",
      domain: "MACHINE",
      layer: "CATALOG",
      featured: true,
      active: true,
      showOnHome: true,
      sortOrder: 1,
      level: 0,
    },
  });

  const childCats = [
    { slug: "phase-cat-cat-excavators", name: "بیل مکانیکی", nameEn: "Excavators", parentSlug: "machinery", sortOrder: 1 },
    { slug: "phase-cat-cat-loaders", name: "لودر", nameEn: "Loaders", parentSlug: "machinery", sortOrder: 2 },
    { slug: "phase-cat-cat-bulldozers", name: "بلدوزر", nameEn: "Bulldozers", parentSlug: "machinery", sortOrder: 3 },
  ];
  const catIds: Record<string, string> = { machinery: machinery.id };
  for (const c of childCats) {
    const row = await db.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        parentId: catIds[c.parentSlug],
        name: c.name,
        nameEn: c.nameEn,
        slug: c.slug,
        domain: "MACHINE",
        layer: "CATALOG",
        featured: false,
        active: true,
        showOnHome: true,
        sortOrder: c.sortOrder,
        level: 1,
      },
    });
    catIds[c.slug] = row.id;
  }
  console.log(`  ✓ ${Object.keys(catIds).length} categories (1 root + 3 children)`);

  // ════════════════════════════════════════════════════════════
  // 3. TRANSACTION TYPES (phase1 #9)
  // 6 types: SALE, RENT, WANTED, QUOTE, AUCTION, SERVICE_REQUEST
  // ════════════════════════════════════════════════════════════
  console.log("\n3. Seeding TransactionTypes...");
  const txTypes = [
    { key: "SALE", nameFa: "فروش", nameEn: "Sale", sortOrder: 1 },
    { key: "RENT", nameFa: "اجاره", nameEn: "Rent", sortOrder: 2 },
    { key: "WANTED", nameFa: "درخواست خرید", nameEn: "Wanted", sortOrder: 3 },
    { key: "QUOTE", nameFa: "استعلام قیمت", nameEn: "Quote", sortOrder: 4 },
    { key: "AUCTION", nameFa: "حراجی", nameEn: "Auction", sortOrder: 5 },
    { key: "SERVICE_REQUEST", nameFa: "درخواست خدمات", nameEn: "Service Request", sortOrder: 6 },
  ];
  const txTypeIds: Record<string, string> = {};
  for (const t of txTypes) {
    const row = await db.transactionType.upsert({
      where: { key: t.key },
      update: {},
      create: {
        key: t.key,
        nameFa: t.nameFa,
        nameEn: t.nameEn,
        active: true,
        sortOrder: t.sortOrder,
      },
    });
    txTypeIds[t.key] = row.id;
  }
  console.log(`  ✓ ${Object.keys(txTypeIds).length} transaction types`);

  // ════════════════════════════════════════════════════════════
  // 4. ATTRIBUTE DEFINITIONS (phase1 #4, #5, #11 + phase4 #18, #19)
  // Need 8+ types with required/filterable/searchable/sortable/seoRelevant/aiRelevant.
  // SELECT + MULTI_SELECT need AttributeOption rows.
  // ════════════════════════════════════════════════════════════
  console.log("\n4. Seeding AttributeDefinitions + AttributeOptions...");
  const attrs = [
    { key: "phase-cat-attr-year", name: "سال ساخت", nameEn: "Manufacture Year", type: "YEAR", required: true, filterable: true, searchable: true, sortable: true, seoRelevant: true, aiRelevant: true },
    { key: "phase-cat-attr-hours", name: "ساعت کار", nameEn: "Working Hours", type: "INTEGER", required: false, filterable: true, searchable: false, sortable: true, seoRelevant: false, aiRelevant: true },
    { key: "phase-cat-attr-price-currency", name: "ارزش بازار", nameEn: "Market Value", type: "CURRENCY", required: false, filterable: true, searchable: false, sortable: true, seoRelevant: false, aiRelevant: true },
    { key: "phase-cat-attr-weight", name: "وزن عملیاتی", nameEn: "Operating Weight", type: "DECIMAL", required: false, filterable: true, searchable: false, sortable: true, seoRelevant: false, aiRelevant: false },
    { key: "phase-cat-attr-description", name: "توضیحات", nameEn: "Description", type: "LONG_TEXT", required: false, filterable: false, searchable: true, sortable: false, seoRelevant: true, aiRelevant: true },
    { key: "phase-cat-attr-model-code", name: "کد مدل", nameEn: "Model Code", type: "TEXT", required: false, filterable: false, searchable: true, sortable: false, seoRelevant: true, aiRelevant: false },
    { key: "phase-cat-attr-inspected", name: "بازرسی شده", nameEn: "Inspected", type: "BOOLEAN", required: false, filterable: true, searchable: false, sortable: false, seoRelevant: false, aiRelevant: true },
    { key: "phase-cat-attr-condition", name: "وضعیت", nameEn: "Condition", type: "SELECT", required: true, filterable: true, searchable: true, sortable: true, seoRelevant: true, aiRelevant: true, options: ["NEW", "USED", "REFURBISHED"] },
    { key: "phase-cat-attr-fuel-type", name: "نوع سوخت", nameEn: "Fuel Type", type: "SELECT", required: false, filterable: true, searchable: false, sortable: false, seoRelevant: false, aiRelevant: false, options: ["DIESEL", "GASOLINE", "ELECTRIC", "HYBRID"] },
    { key: "phase-cat-attr-features", name: "امکانات", nameEn: "Features", type: "MULTI_SELECT", required: false, filterable: true, searchable: true, sortable: false, seoRelevant: false, aiRelevant: true, options: ["AC_CAB", "GPS", "CAMERA", "AUTO_GREASER", "BLUETOOTH"] },
    { key: "phase-cat-attr-mfg-date", name: "تاریخ تولید", nameEn: "Manufacture Date", type: "DATE", required: false, filterable: false, searchable: false, sortable: true, seoRelevant: false, aiRelevant: false },
    { key: "phase-cat-attr-scheduled-at", name: "زمان‌بندی", nameEn: "Scheduled At", type: "DATETIME", required: false, filterable: false, searchable: false, sortable: true, seoRelevant: false, aiRelevant: false },
  ];
  const attrIds: Record<string, string> = {};
  for (const a of attrs) {
    const row = await db.attributeDefinition.upsert({
      where: { key: a.key },
      update: {},
      create: {
        key: a.key,
        name: a.name,
        nameEn: a.nameEn,
        labelFa: a.name,
        labelEn: a.nameEn,
        type: a.type,
        required: a.required,
        filterable: a.filterable,
        searchable: a.searchable,
        sortable: a.sortable,
        seoRelevant: a.seoRelevant,
        aiRelevant: a.aiRelevant,
        visibleOnCard: a.filterable,
        visibleOnDetail: true,
        sortOrder: 1,
      },
    });
    attrIds[a.key] = row.id;

    // Create AttributeOptions for SELECT/MULTI_SELECT (idempotent by findFirst).
    if (a.options) {
      for (let i = 0; i < a.options.length; i++) {
        const optValue = a.options[i];
        // AttributeOption has no natural unique key — use findFirst-or-create
        // by (attributeId, value) pair.
        await findOrCreate({
          find: () =>
            db.attributeOption.findFirst({
              where: { attributeId: row.id, value: optValue },
            }),
          create: () =>
            db.attributeOption.create({
              data: {
                attributeId: row.id,
                value: optValue,
                label: optValue,
                sortOrder: i,
              },
            }),
        });
      }
    }
  }
  console.log(
    `  ✓ ${Object.keys(attrIds).length} attribute definitions (11 types covered)`,
  );

  // ════════════════════════════════════════════════════════════
  // 5. CATEGORY-ATTRIBUTE MAPPINGS (phase1 #2, phase4 #20)
  // Map every attribute to the machinery category. At least one row
  // must have filterable=true (CategoryAttribute.filterable).
  // ════════════════════════════════════════════════════════════
  console.log("\n5. Seeding CategoryAttribute mappings...");
  let caCount = 0;
  for (const a of attrs) {
    // CategoryAttribute has @@unique([categoryId, attributeId]) — upsert by that.
    await db.categoryAttribute.upsert({
      where: {
        categoryId_attributeId: {
          categoryId: catIds.machinery,
          attributeId: attrIds[a.key],
        },
      },
      update: {},
      create: {
        categoryId: catIds.machinery,
        attributeId: attrIds[a.key],
        required: a.required,
        filterable: a.filterable,
        searchable: a.searchable,
        sortable: a.sortable,
        displayOrder: caCount + 1,
      },
    });
    caCount++;
  }
  console.log(`  ✓ ${caCount} category-attribute mappings (filterable=${attrs.filter((a) => a.filterable).length})`);

  // ════════════════════════════════════════════════════════════
  // 6. COMPANIES (phase3 #8, phase5 #3, phase5 #6)
  // 3+ companies, 1+ verified, with branches + verifications.
  // ════════════════════════════════════════════════════════════
  console.log("\n6. Seeding Companies + Branches + Verifications + Documents...");
  const companySpecs = [
    { slug: "phase-cat-company-1", name: "هویکس ماشین‌آلات شمال", nameEn: "Heavix Machinery North", verified: true, citySlug: "phase-cat-city-tehran" },
    { slug: "phase-cat-company-2", name: "هویکس پارس جنوب", nameEn: "Heavix Pars South", verified: true, citySlug: "phase-cat-city-shiraz" },
    { slug: "phase-cat-company-3", name: "هویکس صنعت اصفهان", nameEn: "Heavix Sanat Esfahan", verified: false, citySlug: "phase-cat-city-esfahan" },
  ];
  const companyIds: Record<string, string> = {};
  for (const c of companySpecs) {
    const row = await db.company.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        name: c.name,
        slug: c.slug,
        description: `Test fixture company (${c.nameEn}) for phase tests.`,
        logoUrl: null,
        website: `https://${c.slug}.heavix.local`,
        phone: "021-00000000",
        email: `${c.slug}@heavix.local`,
        address: "phase-cat test address",
        city: c.citySlug.replace("phase-cat-city-", ""),
        province: "phase-cat-province",
        verified: c.verified,
        premium: false,
        status: "ACTIVE",
        avgRating: 4.5,
        reviewCount: 12,
      },
    });
    companyIds[c.slug] = row.id;
  }
  console.log(`  ✓ ${Object.keys(companyIds).length} companies (${companySpecs.filter((c) => c.verified).length} verified)`);

  // 6b. CompanyBranches — 1 per company.
  let branchCount = 0;
  for (const c of companySpecs) {
    const branchName = `phase-cat-branch-${c.slug}`;
    const existing = await db.companyBranch.findFirst({
      where: { companyId: companyIds[c.slug], name: branchName },
    });
    if (!existing) {
      await db.companyBranch.create({
        data: {
          companyId: companyIds[c.slug],
          name: branchName,
          address: "phase-cat branch address",
          cityId: cityIds[c.citySlug] ?? null,
          phone: "021-11111111",
          isHeadquarters: true,
          active: true,
        },
      });
      branchCount++;
    }
  }
  console.log(`  ✓ ${branchCount} company branches`);

  // 6c. CompanyVerifications — 1 per company. Verified companies get VERIFIED,
  // unverified get PENDING. Need a revoked one too (for phase5 #10 revocation fields).
  let verifCount = 0;
  for (let i = 0; i < companySpecs.length; i++) {
    const c = companySpecs[i];
    const status = c.verified ? "VERIFIED" : "PENDING";
    const existing = await db.companyVerification.findFirst({
      where: { companyId: companyIds[c.slug], verificationType: "BUSINESS" },
    });
    if (!existing) {
      await db.companyVerification.create({
        data: {
          companyId: companyIds[c.slug],
          status,
          verificationType: "BUSINESS",
          submittedAt: SUBMITTED_AT,
          reviewedAt: c.verified ? REVIEWED_AT : null,
          reviewedBy: c.verified ? admin.id : null,
          notes: c.verified ? "phase-cat seed: auto-verified" : "phase-cat seed: pending review",
          evidence: JSON.stringify([
            { type: "BUSINESS_LICENSE", url: `phase-cat-evidence://${c.slug}/license.pdf`, description: "Business license" },
          ]),
          expiresAt: c.verified ? EXPIRES_AT : null,
          revokedAt: null,
          revokedBy: null,
          revokeReason: null,
        },
      });
      verifCount++;
    }
  }
  // Also create one REVOKED verification (for phase5 #10 revocation field test).
  const revokedVerif = await db.companyVerification.findFirst({
    where: { status: "REVOKED", verificationType: "INSPECTION" },
  });
  if (!revokedVerif) {
    await db.companyVerification.create({
      data: {
        companyId: companyIds["phase-cat-company-3"],
        status: "REVOKED",
        verificationType: "INSPECTION",
        submittedAt: SUBMITTED_AT,
        reviewedAt: REVIEWED_AT,
        reviewedBy: admin.id,
        notes: "phase-cat seed: revoked for inspection violation",
        evidence: JSON.stringify([
          { type: "INSPECTION_REPORT", url: "phase-cat-evidence://revoked/inspection.pdf", description: "Failed inspection" },
        ]),
        expiresAt: null,
        revokedAt: REVOKED_AT,
        revokedBy: admin.id,
        revokeReason: "Failed post-verification inspection",
      },
    });
    verifCount++;
  }
  console.log(`  ✓ ${verifCount} company verifications (incl. 1 REVOKED)`);

  // 6d. CompanyDocuments — 1 per company.
  let docCount = 0;
  for (const c of companySpecs) {
    const url = `phase-cat-doc://${c.slug}/business-license.pdf`;
    const existing = await db.companyDocument.findFirst({
      where: { companyId: companyIds[c.slug], type: "BUSINESS_LICENSE", url },
    });
    if (!existing) {
      await db.companyDocument.create({
        data: {
          companyId: companyIds[c.slug],
          type: "BUSINESS_LICENSE",
          url,
          status: c.verified ? "VERIFIED" : "PENDING",
          verifiedBy: c.verified ? admin.id : null,
          verifiedAt: c.verified ? VERIFIED_AT : null,
        },
      });
      docCount++;
    }
  }
  console.log(`  ✓ ${docCount} company documents`);

  // ════════════════════════════════════════════════════════════
  // 7. SELLER USERS (phase3 #3, phase5 #4)
  // 3 SELLER users, each linked to a company via User.companyId.
  // ════════════════════════════════════════════════════════════
  console.log("\n7. Seeding SELLER users (linked to companies)...");
  const sellerSpecs = [
    { mobile: "09129000001", email: "phase-cat-seller-1@heavix.local", firstName: "PhaseCat", lastName: "SellerOne", companySlug: "phase-cat-company-1" },
    { mobile: "09129000002", email: "phase-cat-seller-2@heavix.local", firstName: "PhaseCat", lastName: "SellerTwo", companySlug: "phase-cat-company-2" },
    { mobile: "09129000003", email: "phase-cat-seller-3@heavix.local", firstName: "PhaseCat", lastName: "SellerThree", companySlug: "phase-cat-company-3" },
  ];
  const sellerIds: string[] = [];
  for (const s of sellerSpecs) {
    const user = await db.user.upsert({
      where: { mobile: s.mobile },
      update: {},
      create: {
        mobile: s.mobile,
        email: s.email,
        firstName: s.firstName,
        lastName: s.lastName,
        passwordHash: FIXTURE_PASSWORD_HASH,
        role: "SELLER",
        userType: "INDIVIDUAL",
        status: "ACTIVE",
        emailVerified: true,
        mobileVerified: true,
        companyName: "PhaseCat Seller Co.",
        companyId: companyIds[s.companySlug],
      },
    });
    // Ensure companyId is set even if user existed (e.g. from a prior partial run).
    if (!user.companyId) {
      await db.user.update({
        where: { id: user.id },
        data: { companyId: companyIds[s.companySlug] },
      });
    }
    sellerIds.push(user.id);
  }
  console.log(`  ✓ ${sellerIds.length} SELLER users (linked to companies)`);

  // ════════════════════════════════════════════════════════════
  // 8. PRODUCT MODELS + PRODUCTS  (phase3 #10)
  // Use 2 existing brands (Caterpillar + Komatsu) from seed-brands-a.
  // Brand → ProductModel → Product chain.
  // ════════════════════════════════════════════════════════════
  console.log("\n8. Seeding ProductModels + Products...");
  const catBrand = await db.brand.findUnique({ where: { slug: "caterpillar" } });
  const komBrand = await db.brand.findUnique({ where: { slug: "komatsu" } });
  const fallbackBrand = catBrand ?? komBrand ?? (await db.brand.findFirst());
  if (!fallbackBrand) {
    throw new Error("No brand found — run seed-brands-a first.");
  }
  const secondBrand = komBrand ?? catBrand ?? fallbackBrand;

  // ProductModel: @@unique([brandId, slug])
  const modelSpecs = [
    { slug: "phase-cat-model-excavator-320", brand: fallbackBrand, name: "320 Excavator", nameEn: "320 Excavator", categoryId: catIds["phase-cat-cat-excavators"] },
    { slug: "phase-cat-model-loader-966", brand: secondBrand, name: "966 Loader", nameEn: "966 Loader", categoryId: catIds["phase-cat-cat-loaders"] },
  ];
  const modelIds: string[] = [];
  for (const m of modelSpecs) {
    const row = await db.productModel.upsert({
      where: { brandId_slug: { brandId: m.brand.id, slug: m.slug } },
      update: {},
      create: {
        brandId: m.brand.id,
        name: m.name,
        nameEn: m.nameEn,
        slug: m.slug,
        categoryId: m.categoryId,
        status: "ACTIVE",
        sortOrder: 1,
      },
    });
    modelIds.push(row.id);
  }

  // Product: slug is @unique
  const productSpecs = [
    { slug: "phase-cat-product-1", canonicalName: "Caterpillar 320 Excavator (Test Fixture)", brand: fallbackBrand, modelId: modelIds[0], categoryId: catIds["phase-cat-cat-excavators"] },
    { slug: "phase-cat-product-2", canonicalName: "Komatsu 966 Loader (Test Fixture)", brand: secondBrand, modelId: modelIds[1], categoryId: catIds["phase-cat-cat-loaders"] },
  ];
  const productIds: string[] = [];
  for (const p of productSpecs) {
    const row = await db.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        categoryId: p.categoryId,
        brandId: p.brand.id,
        modelId: p.modelId,
        canonicalName: p.canonicalName,
        slug: p.slug,
        status: "ACTIVE",
        source: "MANUAL",
        confidence: 1.0,
        sortOrder: 1,
      },
    });
    productIds.push(row.id);
  }
  console.log(`  ✓ ${modelIds.length} models, ${productIds.length} products`);

  // ════════════════════════════════════════════════════════════
  // 9. LISTINGS  (phase3 #1-#7, phase4 #1, #4-#9, #15-#17, phase6 #2 #10 #11,
  //                phase7 #6 #7 #8, phase8 #9)
  // 8 PUBLISHED listings (need 6+ for pagination test) + 2 DRAFT +
  // 2 PENDING_REVIEW. Each has sellerId, companyId, transactionTypeId,
  // countryId, provinceId, brandId, categoryId, productId, sellerPhone,
  // province (string), city (string), condition, price (2+ distinct
  // values, 2+ distinct brands), ListingImage.
  // ════════════════════════════════════════════════════════════
  console.log("\n9. Seeding Listings + ListingImages...");
  const imagePaths = [
    "/images/machinery/excavator.png",
    "/images/machinery/loader.png",
    "/images/machinery/bulldozer.png",
    "/images/machinery/grader.png",
    "/images/machinery/dump-truck.png",
  ];
  const cityLookup = [
    { cityId: cityIds["phase-cat-city-tehran"], provinceName: "تهران", cityName: "تهران" },
    { cityId: cityIds["phase-cat-city-shiraz"], provinceName: "فارس", cityName: "شیراز" },
    { cityId: cityIds["phase-cat-city-kashan"], provinceName: "اصفهان", cityName: "کاشان" },
    { cityId: cityIds["phase-cat-city-esfahan"], provinceName: "اصفهان", cityName: "اصفهان" },
  ];

  // Listing slug @unique → deterministic phase-cat-listing-1..N.
  // 8 PUBLISHED (5 Caterpillar + 3 Komatsu for brand variety; 3 distinct prices).
  const listingSpecs: Array<{
    slug: string;
    title: string;
    status: string;
    brand: typeof fallbackBrand;
    categoryId: string;
    productId: string;
    sellerIndex: number;
    companySlug: string;
    cityIndex: number;
    price: bigint;
    condition: string;
    txKey: string;
    verified: boolean;
  }> = [];

  // 8 PUBLISHED
  for (let i = 1; i <= 8; i++) {
    const useSecondBrand = i >= 6; // first 5 use fallbackBrand, last 3 use secondBrand
    const brand = useSecondBrand ? secondBrand : fallbackBrand;
    const productId = useSecondBrand ? productIds[1] : productIds[0];
    const categoryId = useSecondBrand ? catIds["phase-cat-cat-loaders"] : catIds["phase-cat-cat-excavators"];
    const sellerIndex = (i - 1) % 3;
    const companySlug = companySpecs[sellerIndex].slug;
    const cityIndex = (i - 1) % cityLookup.length;
    // 3 distinct prices: 100000, 250000, 500000 (tomans)
    const price = BigInt([100000000, 250000000, 500000000][(i - 1) % 3]);
    const txKey = i % 2 === 0 ? "RENT" : "SALE";
    listingSpecs.push({
      slug: `phase-cat-listing-${i}`,
      title: `phase-cat Listing ${i} — ${brand.nameEn} (test fixture)`,
      status: "PUBLISHED",
      brand,
      categoryId,
      productId,
      sellerIndex,
      companySlug,
      cityIndex,
      price,
      condition: ["NEW", "USED", "REFURBISHED"][(i - 1) % 3],
      txKey,
      verified: i % 3 === 0,
    });
  }
  // 2 DRAFT
  for (let i = 9; i <= 10; i++) {
    listingSpecs.push({
      slug: `phase-cat-listing-${i}`,
      title: `phase-cat Listing ${i} (DRAFT)`,
      status: "DRAFT",
      brand: fallbackBrand,
      categoryId: catIds["phase-cat-cat-excavators"],
      productId: productIds[0],
      sellerIndex: 0,
      companySlug: companySpecs[0].slug,
      cityIndex: 0,
      price: BigInt(150000000),
      condition: "USED",
      txKey: "SALE",
      verified: false,
    });
  }
  // 2 PENDING_REVIEW
  for (let i = 11; i <= 12; i++) {
    listingSpecs.push({
      slug: `phase-cat-listing-${i}`,
      title: `phase-cat Listing ${i} (PENDING_REVIEW)`,
      status: "PENDING_REVIEW",
      brand: secondBrand,
      categoryId: catIds["phase-cat-cat-loaders"],
      productId: productIds[1],
      sellerIndex: 1,
      companySlug: companySpecs[1].slug,
      cityIndex: 1,
      price: BigInt(300000000),
      condition: "USED",
      txKey: "RENT",
      verified: false,
    });
  }

  const listingIds: string[] = [];
  for (let i = 0; i < listingSpecs.length; i++) {
    const spec = listingSpecs[i];
    const seller = sellerIds[spec.sellerIndex];
    const city = cityLookup[spec.cityIndex];
    const row = await db.listing.upsert({
      where: { slug: spec.slug },
      update: {},
      create: {
        slug: spec.slug,
        title: spec.title,
        description: `phase-cat test fixture listing #${i + 1}. Used for phase3/4/5/6/7/8/9 contract tests.`,
        shortDesc: `phase-cat fixture ${i + 1}`,
        price: spec.price,
        priceType: "NEGOTIABLE",
        listingType: spec.txKey,
        condition: spec.condition,
        province: city.provinceName,
        city: city.cityName,
        year: 2020 + (i % 5),
        workingHours: 1000 + i * 100,
        status: spec.status,
        featured: i < 5,
        verified: spec.verified,
        showInLatest: true,
        viewCount: i * 10,
        favoriteCount: 0,
        publishedAt: spec.status === "PUBLISHED" ? PUBLISHED_AT : null,
        expiresAt: spec.status === "PUBLISHED" ? EXPIRES_AT : null,
        sellerPhone: "09120000000",
        sellerName: `phase-cat Seller ${spec.sellerIndex + 1}`,
        brandId: spec.brand.id,
        categoryId: spec.categoryId,
        productId: spec.productId,
        transactionTypeId: txTypeIds[spec.txKey],
        sellerId: seller,
        companyId: companyIds[spec.companySlug],
        countryId: iran.id,
        provinceId: provinceIds[`phase-cat-province-${city.provinceName === "تهران" ? "tehran" : city.provinceName === "فارس" ? "fars" : "esfahan"}`],
        cityId: city.cityId,
      },
    });
    listingIds.push(row.id);
  }

  // ListingImage: 1 image per PUBLISHED listing (phase3 #7 needs listings with images).
  let imgCount = 0;
  for (let i = 0; i < listingIds.length; i++) {
    const spec = listingSpecs[i];
    if (spec.status !== "PUBLISHED") continue;
    const url = imagePaths[i % imagePaths.length];
    const existing = await db.listingImage.findFirst({
      where: { listingId: listingIds[i], url },
    });
    if (!existing) {
      await db.listingImage.create({
        data: {
          listingId: listingIds[i],
          url,
          alt: spec.title,
          isPrimary: true,
          sortOrder: 0,
        },
      });
      imgCount++;
    }
  }
  console.log(
    `  ✓ ${listingIds.length} listings (8 PUBLISHED + 2 DRAFT + 2 PENDING_REVIEW), ${imgCount} images`,
  );

  // ════════════════════════════════════════════════════════════
  // 10. MODERATION LOGS  (phase3 #9, phase5 #6)
  // 1+ ModerationLog rows. phase5 also asserts inspection.count > 0.
  // ════════════════════════════════════════════════════════════
  console.log("\n10. Seeding ModerationLogs...");
  const moderationActions = ["AI_SCAN", "APPROVE", "REJECT", "FLAG"];
  let modCount = 0;
  for (let i = 0; i < listingIds.length && i < 6; i++) {
    const action = moderationActions[i % moderationActions.length];
    const listingId = listingIds[i];
    const existing = await db.moderationLog.findFirst({
      where: { listingId, action, moderatorId: admin.id },
    });
    if (!existing) {
      await db.moderationLog.create({
        data: {
          listingId,
          action,
          reason: `phase-cat seed: ${action} moderation action`,
          riskScore: action === "FLAG" ? 0.7 : 0.2,
          flaggedIssues: action === "FLAG" ? JSON.stringify(["price_anomaly"]) : null,
          moderatorId: admin.id,
        },
      });
      modCount++;
    }
  }
  console.log(`  ✓ ${modCount} moderation logs`);

  // ════════════════════════════════════════════════════════════
  // 11. LISTING REJECTIONS  (phase3 #9, phase5 #6)
  // 1+ ListingRejection rows.
  // ════════════════════════════════════════════════════════════
  console.log("\n11. Seeding ListingRejections...");
  let rejCount = 0;
  // Reject 2 PENDING_REVIEW listings.
  for (let i = 10; i < listingIds.length; i++) {
    const listingId = listingIds[i];
    const reason = "INSUFFICIENT_DOCS";
    const existing = await db.listingRejection.findFirst({
      where: { listingId, reason, adminNote: "phase-cat seed rejection" },
    });
    if (!existing) {
      await db.listingRejection.create({
        data: {
          listingId,
          reason,
          reasonLabel: "Insufficient documentation",
          adminNote: "phase-cat seed rejection",
          status: "OPEN",
        },
      });
      rejCount++;
    }
  }
  console.log(`  ✓ ${rejCount} listing rejections`);

  // ════════════════════════════════════════════════════════════
  // 12. INSPECTIONS  (phase5 #5)
  // 1+ Inspection rows.
  // ════════════════════════════════════════════════════════════
  console.log("\n12. Seeding Inspections...");
  let inspCount = 0;
  for (let i = 0; i < 3; i++) {
    const listingId = listingIds[i];
    const existing = await db.inspection.findFirst({
      where: { listingId, requestedBy: admin.id, status: "COMPLETED" },
    });
    if (!existing) {
      await db.inspection.create({
        data: {
          listingId,
          requestedBy: admin.id,
          inspectorId: admin.id,
          status: "COMPLETED",
          scheduledDate: PUBLISHED_AT,
          completedAt: REVIEWED_AT,
          checklist: JSON.stringify([
            { item: "Engine", passed: true, notes: "OK" },
            { item: "Hydraulics", passed: true, notes: "OK" },
          ]),
          score: 85.0 + i,
          reportUrl: `phase-cat-inspection://report-${i + 1}.pdf`,
          photos: JSON.stringify([`phase-cat-inspection://photo-${i + 1}.jpg`]),
          notes: "phase-cat seed inspection",
          price: BigInt(500000),
        },
      });
      inspCount++;
    }
  }
  console.log(`  ✓ ${inspCount} inspections`);

  // ════════════════════════════════════════════════════════════
  // 13. DEAL ROOMS  (phase9 #11)
  // 1+ DealRoom rows. Needs listingId + buyerPhone (required).
  // ════════════════════════════════════════════════════════════
  console.log("\n13. Seeding DealRooms...");
  let drCount = 0;
  const drSpecs = [
    { listingIdx: 0, buyerPhone: "09129990001", status: "AGREED", agreedPrice: BigInt(120000000) },
    { listingIdx: 1, buyerPhone: "09129990002", status: "OPEN", agreedPrice: null },
    { listingIdx: 2, buyerPhone: "09129990003", status: "NEGOTIATING", agreedPrice: BigInt(220000000) },
  ];
  for (const dr of drSpecs) {
    const listingId = listingIds[dr.listingIdx];
    const existing = await db.dealRoom.findFirst({
      where: { listingId, buyerPhone: dr.buyerPhone, status: dr.status },
    });
    if (!existing) {
      await db.dealRoom.create({
        data: {
          listingId,
          buyerId: admin.id,
          sellerId: sellerIds[0],
          buyerPhone: dr.buyerPhone,
          sellerPhone: "09120000000",
          status: dr.status,
          buyerConfirmed: dr.status === "AGREED",
          sellerConfirmed: dr.status === "AGREED",
          agreedPrice: dr.agreedPrice,
        },
      });
      drCount++;
    }
  }
  console.log(`  ✓ ${drCount} deal rooms`);

  // ════════════════════════════════════════════════════════════
  // 14. LISTING OFFERS  (phase9 #11)
  // 1+ ListingOffer rows. Needs buyerPhone (required), offerAmount (required).
  // ════════════════════════════════════════════════════════════
  console.log("\n14. Seeding ListingOffers...");
  let offerCount = 0;
  const offerSpecs = [
    { listingIdx: 0, offerAmount: BigInt(95000000), buyerPhone: "09129991001", status: "PENDING", buyerId: admin.id },
    { listingIdx: 1, offerAmount: BigInt(180000000), buyerPhone: "09129991002", status: "ACCEPTED", buyerId: admin.id },
    { listingIdx: 2, offerAmount: BigInt(240000000), buyerPhone: "09129991003", status: "COUNTERED", buyerId: admin.id, counterAmount: BigInt(230000000) },
  ];
  for (const o of offerSpecs) {
    const listingId = listingIds[o.listingIdx];
    const existing = await db.listingOffer.findFirst({
      where: { listingId, buyerPhone: o.buyerPhone, offerAmount: o.offerAmount },
    });
    if (!existing) {
      await db.listingOffer.create({
        data: {
          listingId,
          offerAmount: o.offerAmount,
          message: "phase-cat seed offer",
          status: o.status,
          counterAmount: o.counterAmount ?? null,
          buyerName: "PhaseCat Buyer",
          buyerPhone: o.buyerPhone,
          buyerEmail: "phase-cat-buyer@heavix.local",
          buyerId: o.buyerId,
          sellerNote: o.status === "COUNTERED" ? "Counter offered" : null,
          respondedAt: o.status === "ACCEPTED" ? REVIEWED_AT : null,
        },
      });
      offerCount++;
    }
  }
  console.log(`  ✓ ${offerCount} listing offers`);

  // ════════════════════════════════════════════════════════════
  // 15. PAYMENTS  (phase9 #3)
  // 1+ Payment rows. Needs userId + amount (required) + type + status.
  // ════════════════════════════════════════════════════════════
  console.log("\n15. Seeding Payments...");
  let payCount = 0;
  const paymentSpecs = [
    { userId: admin.id, amount: BigInt(500000), type: "FEATURED_LISTING", status: "PAID", idempotencyKey: "phase-cat-payment-1", trackingCode: "PHASE-CAT-1" },
    { userId: admin.id, amount: BigInt(1500000), type: "SUBSCRIPTION", status: "AUTHORIZED", idempotencyKey: "phase-cat-payment-2", trackingCode: "PHASE-CAT-2" },
    { userId: admin.id, amount: BigInt(800000), type: "INSPECTION_FEE", status: "PENDING", idempotencyKey: "phase-cat-payment-3", trackingCode: null },
  ];
  for (const p of paymentSpecs) {
    // idempotencyKey is @unique — upsert by that.
    await db.payment.upsert({
      where: { idempotencyKey: p.idempotencyKey },
      update: {},
      create: {
        userId: p.userId,
        amount: p.amount,
        currency: "IRR",
        type: p.type,
        status: p.status,
        gateway: "MANUAL",
        trackingCode: p.trackingCode,
        idempotencyKey: p.idempotencyKey,
        paidAt: p.status === "PAID" ? REVIEWED_AT : null,
      },
    });
    payCount++;
  }
  console.log(`  ✓ ${payCount} payments`);

  // ════════════════════════════════════════════════════════════
  // 16. SEARCH QUERIES  (phase4 #3, #4)
  // 1+ SearchQuery rows. (query + normalizedQuery required)
  // ════════════════════════════════════════════════════════════
  console.log("\n16. Seeding SearchQueries...");
  const searchSpecs = [
    { query: "بیل مکانیکی کاترپیلر", normalized: "بیل مکانیکی کاترپیلر", resultCount: 12, hasResults: true, categorySlug: "machinery", brandSlug: "caterpillar" },
    { query: "لودر کوماتسو", normalized: "لودر کوماتسو", resultCount: 5, hasResults: true, categorySlug: "machinery", brandSlug: "komatsu" },
    { query: "grader for sale", normalized: "grader for sale", resultCount: 0, hasResults: false, categorySlug: null, brandSlug: null },
  ];
  let sqCount = 0;
  for (const sq of searchSpecs) {
    // No natural unique key on SearchQuery — findFirst by query + normalizedQuery + createdAt is brittle.
    // Instead, check by (query, normalizedQuery) and skip if any row matches.
    const existing = await db.searchQuery.findFirst({
      where: { query: sq.query, normalizedQuery: sq.normalized },
    });
    if (!existing) {
      await db.searchQuery.create({
        data: {
          query: sq.query,
          normalizedQuery: sq.normalized,
          resultCount: sq.resultCount,
          userId: admin.id,
          ip: "127.0.0.1",
          categorySlug: sq.categorySlug,
          brandSlug: sq.brandSlug,
          hasResults: sq.hasResults,
        },
      });
      sqCount++;
    }
  }
  console.log(`  ✓ ${sqCount} search queries`);

  // ════════════════════════════════════════════════════════════
  // 17. BUY REQUESTS  (phase7 #1, #2, #3, #4)
  // 1+ ACTIVE BuyRequest with category + budgetMin + userId.
  // ════════════════════════════════════════════════════════════
  console.log("\n17. Seeding BuyRequests...");
  const buySpecs = [
    { title: "phase-cat BuyRequest: Excavator (Caterpillar)", category: "machinery", brandPref: "caterpillar", province: "تهران", city: "تهران", budgetMin: BigInt(80000000), budgetMax: BigInt(150000000), status: "ACTIVE", userId: admin.id, deadline: "2026-12-31" },
    { title: "phase-cat BuyRequest: Loader (Komatsu)", category: "machinery", brandPref: "komatsu", province: "فارس", city: "شیراز", budgetMin: BigInt(120000000), budgetMax: BigInt(200000000), status: "ACTIVE", userId: admin.id, deadline: "2026-12-31" },
    { title: "phase-cat BuyRequest: Bulldozer (closed)", category: "machinery", brandPref: null, province: "اصفهان", city: "کاشان", budgetMin: BigInt(90000000), budgetMax: BigInt(180000000), status: "CLOSED", userId: admin.id, deadline: "2026-01-31" },
  ];
  let brCount = 0;
  for (const b of buySpecs) {
    // No natural unique key — findFirst by (title, userId).
    const existing = await db.buyRequest.findFirst({
      where: { title: b.title, userId: b.userId },
    });
    if (!existing) {
      await db.buyRequest.create({
        data: {
          title: b.title,
          description: "phase-cat test fixture buy request",
          category: b.category,
          brandPref: b.brandPref,
          transaction: "SALE",
          budgetMin: b.budgetMin,
          budgetMax: b.budgetMax,
          city: b.city,
          province: b.province,
          deadline: b.deadline,
          status: b.status,
          verified: b.status === "ACTIVE",
          viewCount: 10,
          requesterName: "PhaseCat Buyer",
          requesterPhone: "09129990000",
          publishedAt: PUBLISHED_AT,
          expiresAt: b.status === "ACTIVE" ? EXPIRES_AT : null,
          userId: b.userId,
        },
      });
      brCount++;
    }
  }
  console.log(`  ✓ ${brCount} buy requests (${buySpecs.filter((b) => b.status === "ACTIVE").length} ACTIVE)`);

  // ════════════════════════════════════════════════════════════
  // 18. AUDIT LOG  (phase5 #7)
  // 1+ AuditLog row. The admin already exists; log a phase-cat marker.
  // ════════════════════════════════════════════════════════════
  console.log("\n18. Seeding AuditLog marker...");
  const auditAction = "phase-cat.seed.run";
  const existingAudit = await db.auditLog.findFirst({
    where: { action: auditAction, actorId: admin.id },
  });
  if (!existingAudit) {
    await db.auditLog.create({
      data: {
        actorId: admin.id,
        actorType: "SYSTEM",
        action: auditAction,
        entityType: "System",
        entityId: "phase-cat-seed",
        reason: "STEP 13.53 Phase C: seed-phase-catalog marker row",
        afterJson: JSON.stringify({ phase: "C", step: "13.53" }),
      },
    });
    console.log("  ✓ 1 audit log marker created");
  } else {
    console.log("  ✓ audit log marker already exists (skip)");
  }

  // ════════════════════════════════════════════════════════════
  // 19. VERIFICATION — print final counts for each test-file assertion
  // ════════════════════════════════════════════════════════════
  console.log("\n19. VERIFICATION (counts the phase tests assert against):");
  const counts = {
    country: await db.country.count(),
    province: await db.province.count(),
    city: await db.city.count(),
    category: await db.category.count(),
    categoryAttribute: await db.categoryAttribute.count(),
    categoryAttributeFilterable: await db.categoryAttribute.count({ where: { filterable: true } }),
    transactionType: await db.transactionType.count(),
    attributeDefinition: await db.attributeDefinition.count(),
    attributeDefinitionFilterable: await db.attributeDefinition.count({ where: { filterable: true } }),
    attributeDefinitionSearchable: await db.attributeDefinition.count({ where: { searchable: true } }),
    attributeOption: await db.attributeOption.count(),
    company: await db.company.count(),
    companyVerified: await db.company.count({ where: { verified: true } }),
    companyBranch: await db.companyBranch.count(),
    companyVerification: await db.companyVerification.count(),
    companyDocument: await db.companyDocument.count(),
    user: await db.user.count(),
    userWithCompany: await db.user.count({ where: { companyId: { not: null } } }),
    productModel: await db.productModel.count(),
    product: await db.product.count(),
    listing: await db.listing.count(),
    listingPublished: await db.listing.count({ where: { status: "PUBLISHED" } }),
    listingPublishedWithPrice: await db.listing.count({ where: { status: "PUBLISHED", price: { not: null } } }),
    listingPublishedWithBrand: await db.listing.count({ where: { status: "PUBLISHED", brandId: { not: null } } }),
    listingWithSeller: await db.listing.count({ where: { sellerId: { not: null } } }),
    listingWithSellerPhone: await db.listing.count({ where: { sellerPhone: { not: null } } }),
    listingWithCompany: await db.listing.count({ where: { companyId: { not: null } } }),
    listingWithCountry: await db.listing.count({ where: { countryId: { not: null } } }),
    listingWithProvince: await db.listing.count({ where: { provinceId: { not: null } } }),
    listingWithTxType: await db.listing.count({ where: { transactionTypeId: { not: null } } }),
    listingWithImages: await db.listing.count({ where: { images: { some: {} } } }),
    listingWithProduct: await db.listing.count({ where: { productId: { not: null } } }),
    listingWithCategory: await db.listing.count({ where: { categoryId: { not: null } } }),
    moderationLog: await db.moderationLog.count(),
    listingRejection: await db.listingRejection.count(),
    inspection: await db.inspection.count(),
    dealRoom: await db.dealRoom.count(),
    listingOffer: await db.listingOffer.count(),
    payment: await db.payment.count(),
    searchQuery: await db.searchQuery.count(),
    buyRequest: await db.buyRequest.count(),
    buyRequestActive: await db.buyRequest.count({ where: { status: "ACTIVE" } }),
    buyRequestWithUser: await db.buyRequest.count({ where: { userId: { not: null } } }),
    auditLog: await db.auditLog.count(),
    brandAlias: await db.brandAlias.count(),
  };
  const expected: Record<keyof typeof counts, string> = {
    country: ">=1",
    province: ">0",
    city: ">0",
    category: ">0",
    categoryAttribute: ">0",
    categoryAttributeFilterable: ">0",
    transactionType: ">=4 (SALE,RENT,WANTED,AUCTION)",
    attributeDefinition: ">0",
    attributeDefinitionFilterable: ">0",
    attributeDefinitionSearchable: ">0",
    attributeOption: ">0",
    company: ">=3",
    companyVerified: ">0",
    companyBranch: ">0",
    companyVerification: ">0",
    companyDocument: ">0",
    user: ">=2",
    userWithCompany: ">0",
    productModel: ">0",
    product: ">0",
    listing: ">0",
    listingPublished: ">0 (>=6 for pagination)",
    listingPublishedWithPrice: ">0 (>=2 distinct prices)",
    listingPublishedWithBrand: ">0 (>=2 distinct brands)",
    listingWithSeller: ">0",
    listingWithSellerPhone: ">0",
    listingWithCompany: ">0",
    listingWithCountry: ">0",
    listingWithProvince: ">0",
    listingWithTxType: ">0",
    listingWithImages: ">0",
    listingWithProduct: ">0",
    listingWithCategory: ">0",
    moderationLog: ">0",
    listingRejection: ">0",
    inspection: ">0",
    dealRoom: ">0",
    listingOffer: ">0",
    payment: ">0",
    searchQuery: ">0",
    buyRequest: ">0",
    buyRequestActive: ">0",
    buyRequestWithUser: ">0",
    auditLog: ">0",
    brandAlias: ">0",
  };
  const maxKey = Math.max(...Object.keys(counts).map((k) => k.length));
  for (const [k, v] of Object.entries(counts)) {
    const exp = expected[k as keyof typeof counts];
    console.log(`  ${k.padEnd(maxKey)} = ${String(v).padStart(4)}   (expect ${exp})`);
  }

  console.log("\n=== STEP 13.53 Phase C — SEED COMPLETE ===");
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
