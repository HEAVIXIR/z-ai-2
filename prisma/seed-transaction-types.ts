/**
 * Narrow, App-Preview-safe seed for the canonical HEAVIX TransactionType catalog.
 *
 * Deliberately does not seed Categories, ServiceTypes, Industries, Locations,
 * Brands, Attributes, Products, or any other reference data.
 *
 * Usage:
 *   DATABASE_URL=... bunx tsx prisma/seed-transaction-types.ts --dry-run
 *   DATABASE_URL=... bunx tsx prisma/seed-transaction-types.ts --apply
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const TRANSACTION_TYPES = [
  { key: "SALE", nameFa: "فروش", nameEn: "Sale", icon: "tag", sortOrder: 1 },
  { key: "RENT", nameFa: "اجاره", nameEn: "Rent", icon: "key", sortOrder: 2 },
  { key: "WANTED", nameFa: "درخواست خرید", nameEn: "Wanted", icon: "megaphone", sortOrder: 3 },
  { key: "QUOTE", nameFa: "پیشنهاد قیمت", nameEn: "Quote", icon: "file-text", sortOrder: 4 },
  { key: "AUCTION", nameFa: "مزایده", nameEn: "Auction", icon: "gavel", sortOrder: 5 },
  { key: "SERVICE_REQUEST", nameFa: "درخواست خدمت", nameEn: "Service Request", icon: "wrench", sortOrder: 6 },
] as const;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const apply = process.argv.includes("--apply");
  if (dryRun === apply) {
    throw new Error("Pass exactly one mode: --dry-run or --apply.");
  }

  const keys = TRANSACTION_TYPES.map((item) => item.key);
  const existing = await db.transactionType.findMany({
    where: { key: { in: [...keys] } },
    select: { key: true, nameFa: true, nameEn: true, icon: true, active: true, sortOrder: true },
  });
  const existingByKey = new Map(existing.map((item) => [item.key, item]));

  const conflicts = TRANSACTION_TYPES.filter((seed) => {
    const row = existingByKey.get(seed.key);
    return row && (
      row.nameFa !== seed.nameFa ||
      row.nameEn !== seed.nameEn ||
      row.icon !== seed.icon ||
      row.sortOrder !== seed.sortOrder ||
      row.active !== true
    );
  });
  if (conflicts.length) {
    throw new Error(
      "Existing TransactionType rows differ from the canonical seed; refusing to overwrite: " +
      conflicts.map((item) => item.key).join(", "),
    );
  }

  const missing = TRANSACTION_TYPES.filter((item) => !existingByKey.has(item.key));
  console.log(JSON.stringify({
    mode: dryRun ? "dry-run" : "apply",
    existingCanonicalRows: existing.length,
    rowsToCreate: missing,
    untouchedTables: [
      "Category", "ServiceType", "ApplicationIndustry", "Country", "Province",
      "City", "Brand", "ProductModel", "Product", "Listing",
    ],
  }, null, 2));

  if (dryRun) return;

  for (const item of missing) {
    await db.transactionType.create({ data: { ...item, active: true } });
  }

  const verified = await db.transactionType.findMany({
    where: { key: { in: [...keys] } },
    orderBy: { sortOrder: "asc" },
    select: { key: true, nameFa: true, nameEn: true, icon: true, active: true, sortOrder: true },
  });
  if (
    verified.length !== TRANSACTION_TYPES.length ||
    verified.some((row, index) =>
      row.key !== TRANSACTION_TYPES[index].key ||
      row.nameFa !== TRANSACTION_TYPES[index].nameFa ||
      row.active !== true
    )
  ) {
    throw new Error("Post-seed verification failed; canonical TransactionType rows do not match.");
  }

  console.log("PASS: six canonical TransactionType rows are present and active.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
