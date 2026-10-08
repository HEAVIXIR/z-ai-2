/**
 * HEAVIX — P3 Seed/Data Remediation: Test Fixtures
 *
 * Resolves the 5 remaining "expected X > 0" test failures by backfilling
 * the specific cross-table linkages and entities that the phase tests
 * assert exist (but that earlier business-data seeds never populated):
 *
 *   F1 (phase3-marketplace): listings with companyId set
 *   F2 (phase5-trust):        CompanyDocument rows
 *   F3 (phase5-trust):        listings linked to companies (same as F1)
 *   F4 (phase7-rfq-matching): BuyRequests with userId set
 *   F5 (phase8-messaging):    >= 2 Users (admin + BUYER test fixtures)
 *
 * Design rules (per owner directive):
 *   - Deterministic: fixed mobiles/emails/URLs/types (no RNG, no Date.now()
 *     in keys). createdAt defaults are fine — they only affect display.
 *   - Idempotent: upsert / findFirst-or-create / where-exists guards.
 *     Safe to re-run; never throws on second run.
 *   - Distinguishable from Business Data: every fixture uses the
 *     `test-fixture-` prefix in its email/url so it can be identified
 *     and removed without touching real rows.
 *   - Non-destructive: never deletes or overwrites existing real data.
 *     listing.companyId / buyRequest.userId are ONLY set when currently
 *     NULL — already-linked rows are left untouched.
 *
 * NOTE on re-run order: `prisma/seed.ts` deletes + recreates listings on
 * every run (line ~189), which wipes `Listing.companyId`. If you re-run
 * `seed.ts`, you must re-run this fixture seed afterwards to restore the
 * listing→company linkage required by phase3/phase5 tests. BuyRequests,
 * CompanyDocuments, and Users are NOT affected by `seed.ts` re-runs.
 *
 * Run:
 *   bunx tsx prisma/seed-test-fixtures.ts
 */
import { db } from "../src/lib/db";
import bcrypt from "bcryptjs";

async function main() {
  console.log("=== P3 SEED: TEST FIXTURES ===\n");

  // ── 0. Reference admin user (must already exist) ──
  const adminMobile = process.env.ADMIN_USERNAME ?? "09120000000";
  const admin = await db.user.findFirst({ where: { mobile: adminMobile } });
  if (!admin) {
    throw new Error(
      `Admin user not found (mobile=${adminMobile}). Run seed-user-roles.ts first.`,
    );
  }

  // ── 1. BUYER test-fixture users (F5 — phase8 "users for conversations") ──
  // The DB only has the admin user. phase8-messaging.test.ts asserts
  // db.user.count() >= 2. We add 4 deterministic BUYER users with the
  // `test-fixture-` email prefix so they are trivially distinguishable
  // from real registrations and can be removed without touching real rows.
  console.log("1. Seeding BUYER test-fixture users...");
  const fixturePasswordHash = await bcrypt.hash("TestFixtureBuyer#2026", 10);
  const fixtureUserSpecs = [
    { mobile: "09120000001", email: "test-fixture-buyer-1@heavix.local", firstName: "TestFixture", lastName: "BuyerOne" },
    { mobile: "09120000002", email: "test-fixture-buyer-2@heavix.local", firstName: "TestFixture", lastName: "BuyerTwo" },
    { mobile: "09120000003", email: "test-fixture-buyer-3@heavix.local", firstName: "TestFixture", lastName: "BuyerThree" },
    { mobile: "09120000004", email: "test-fixture-buyer-4@heavix.local", firstName: "TestFixture", lastName: "BuyerFour" },
  ];
  const buyerIds: string[] = [];
  for (const spec of fixtureUserSpecs) {
    // upsert by mobile (unique). `update: {}` ensures we NEVER overwrite
    // an existing user's fields (e.g. passwordHash, status) on re-run.
    const user = await db.user.upsert({
      where: { mobile: spec.mobile },
      update: {},
      create: {
        mobile: spec.mobile,
        email: spec.email,
        firstName: spec.firstName,
        lastName: spec.lastName,
        passwordHash: fixturePasswordHash,
        role: "BUYER",
        userType: "INDIVIDUAL",
        status: "ACTIVE",
        emailVerified: true,
        mobileVerified: true,
      },
    });
    buyerIds.push(user.id);
  }
  console.log(`  ✓ ${buyerIds.length} BUYER test-fixture users ensured`);

  // ── 2. Listings with companyId (F1, F3 — phase3 + phase5) ──
  // seed.ts wipes+recreates listings on every run, so they have no
  // companyId. Link them round-robin to the existing companies. Only
  // touch listings whose companyId is currently NULL — already-linked
  // rows (e.g. from a prior seed-phase3a run) are left untouched.
  console.log("\n2. Linking listings to companies...");
  const companies = await db.company.findMany({
    orderBy: { slug: "asc" },
    take: 8,
    select: { id: true, slug: true, verified: true },
  });
  const unlinked = await db.listing.findMany({
    where: { companyId: null },
    select: { id: true, slug: true },
    orderBy: { slug: "asc" },
  });
  let linkCount = 0;
  if (companies.length > 0 && unlinked.length > 0) {
    for (let i = 0; i < unlinked.length; i++) {
      const company = companies[i % companies.length];
      await db.listing.update({
        where: { id: unlinked[i].id },
        data: { companyId: company.id },
      });
      linkCount++;
    }
  }
  console.log(
    `  ✓ ${linkCount} listings linked to companies (${companies.length} companies available, ${unlinked.length} were unlinked)`,
  );

  // ── 3. CompanyDocument rows (F2 — phase5 "should have company documents") ──
  // No existing seed creates CompanyDocument rows. Create one per
  // company using a deterministic `test-fixture-doc://` URL (so the rows
  // are trivially distinguishable from any future real-document upload).
  // Verified companies get VERIFIED docs; unverified companies get PENDING.
  console.log("\n3. Seeding CompanyDocuments...");
  const docTypes = ["BUSINESS_LICENSE", "TAX_CERT", "OWNERSHIP_PROOF"] as const;
  const VERIFIED_AT = new Date("2026-01-01T00:00:00.000Z"); // deterministic
  let docCount = 0;
  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    const docType = docTypes[i % docTypes.length];
    const url = `test-fixture-doc://${c.slug}/${docType.toLowerCase()}.pdf`;
    const existing = await db.companyDocument.findFirst({
      where: { companyId: c.id, type: docType, url },
    });
    if (!existing) {
      await db.companyDocument.create({
        data: {
          companyId: c.id,
          type: docType,
          url,
          status: c.verified ? "VERIFIED" : "PENDING",
          verifiedAt: c.verified ? VERIFIED_AT : null,
          verifiedBy: c.verified ? admin.id : null,
        },
      });
      docCount++;
    }
  }
  console.log(`  ✓ ${docCount} company documents created`);

  // ── 4. BuyRequests with userId (F4 — phase7 "should have requests with userId") ──
  // seed-phase4-marketplace.ts creates 5 BuyRequests but never sets
  // userId. Update each BuyRequest whose userId is NULL to assign it
  // round-robin to the BUYER test-fixture users. Already-linked
  // BuyRequests are left untouched.
  console.log("\n4. Setting userId on BuyRequests...");
  const unlinkedRequests = await db.buyRequest.findMany({
    where: { userId: null },
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });
  let brCount = 0;
  if (buyerIds.length > 0) {
    for (let i = 0; i < unlinkedRequests.length; i++) {
      const userId = buyerIds[i % buyerIds.length];
      await db.buyRequest.update({
        where: { id: unlinkedRequests[i].id },
        data: { userId },
      });
      brCount++;
    }
  }
  console.log(`  ✓ ${brCount} buy requests linked to users`);

  // ── 5. VERIFICATION ──
  console.log("\n5. VERIFICATION:");
  const usersCount = await db.user.count();
  const listingsWithCompany = await db.listing.count({
    where: { companyId: { not: null } },
  });
  const companyDocs = await db.companyDocument.count();
  const buyWithUser = await db.buyRequest.count({
    where: { userId: { not: null } },
  });
  console.log(`  Users:                       ${usersCount}        (expect >= 2)`);
  console.log(`  Listings with companyId:     ${listingsWithCompany}        (expect > 0)`);
  console.log(`  CompanyDocuments:            ${companyDocs}        (expect > 0)`);
  console.log(`  BuyRequests with userId:     ${buyWithUser}        (expect > 0)`);

  console.log("\n=== P3 SEED COMPLETE ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
}).finally(() => db.$disconnect());
