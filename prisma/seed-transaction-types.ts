/**
 * Narrow, App-Preview-only seed for the canonical HEAVIX seven-key TransactionType catalog.
 *
 * This script does not seed Categories, ServiceTypes, Industries, Locations,
 * Brands, Attributes, Products, Listings, or any other reference data.
 *
 * --apply requires explicit approval plus a verified Preview database OID and
 * PostgreSQL cluster system identifier. No seed is run automatically.
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
  { key: "SERVICE_OFFER", nameFa: "ارائه خدمت", nameEn: "Service Offer", icon: "handshake", sortOrder: 7 },
] as const;

type PreviewDatabaseIdentity = { databaseName: string; databaseOid: string; systemIdentifier: string };

async function assertApprovedPreviewTarget() {
  if (process.env.HEAVIX_ENV !== "preview") {
    throw new Error("Refusing TransactionType seed: HEAVIX_ENV must be exactly preview.");
  }
  if (process.env.HEAVIX_PREVIEW_TRANSACTION_TYPE_SEED_APPROVED !== "YES") {
    throw new Error("Refusing TransactionType seed: explicit HEAVIX_PREVIEW_TRANSACTION_TYPE_SEED_APPROVED=YES is required.");
  }

  const expectedDatabaseOid = process.env.HEAVIX_APP_PREVIEW_DATABASE_OID?.trim() ?? "";
  const expectedSystemIdentifier = process.env.HEAVIX_EXPECTED_SYSTEM_IDENTIFIER?.trim() ?? "";
  const isDigits = (value: string) => value.length > 0 && [...value].every((character) => character >= "0" && character <= "9");
  if (!isDigits(expectedDatabaseOid) || !isDigits(expectedSystemIdentifier)) {
    throw new Error("Refusing TransactionType seed: expected Preview database OID and PostgreSQL system identifier are required.");
  }

  const rows = await db.$queryRawUnsafe<PreviewDatabaseIdentity[]>(
    "SELECT current_database() AS \"databaseName\", " +
    "(SELECT oid::text FROM pg_database WHERE datname = current_database()) AS \"databaseOid\", " +
    "(SELECT system_identifier::text FROM pg_control_system()) AS \"systemIdentifier\"",
  );
  const identity = rows[0];
  if (!identity || identity.databaseOid !== expectedDatabaseOid || identity.systemIdentifier !== expectedSystemIdentifier) {
    throw new Error("Refusing TransactionType seed: connected PostgreSQL identity does not match the approved Preview target. " + JSON.stringify({
      databaseName: identity?.databaseName ?? null,
      databaseOidMatches: identity?.databaseOid === expectedDatabaseOid,
      systemIdentifierMatches: identity?.systemIdentifier === expectedSystemIdentifier,
    }));
  }

  console.log("[transaction-type-seed] verified Preview target", identity);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const apply = process.argv.includes("--apply");
  if (dryRun === apply) throw new Error("Pass exactly one mode: --dry-run or --apply.");
  if (apply) await assertApprovedPreviewTarget();

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
      (row.active !== true && seed.key !== "SERVICE_OFFER")
    );
  });
  if (conflicts.length) {
    throw new Error("Existing TransactionType rows differ from the canonical seed; refusing to overwrite: " + conflicts.map((item) => item.key).join(", "));
  }

  const missing = TRANSACTION_TYPES.filter((item) => !existingByKey.has(item.key));
  const rowsToReactivate = TRANSACTION_TYPES.filter((item) => item.key === "SERVICE_OFFER" && existingByKey.get(item.key)?.active === false);
  console.log(JSON.stringify({
    mode: dryRun ? "dry-run" : "apply",
    canonicalKeyCount: TRANSACTION_TYPES.length,
    existingCanonicalRows: existing.length,
    rowsToCreate: missing,
    rowsToReactivate,
    untouchedTables: ["Category", "ServiceType", "ApplicationIndustry", "Country", "Province", "City", "Brand", "ProductModel", "Product", "Listing"],
  }, null, 2));

  if (dryRun) return;
  for (const item of missing) await db.transactionType.create({ data: { ...item, active: true } });
  for (const item of rowsToReactivate) await db.transactionType.update({ where: { key: item.key }, data: { active: true } });

  const verified = await db.transactionType.findMany({
    where: { key: { in: [...keys] } },
    orderBy: { sortOrder: "asc" },
    select: { key: true, nameFa: true, nameEn: true, icon: true, active: true, sortOrder: true },
  });
  if (verified.length !== TRANSACTION_TYPES.length || verified.some((row, index) =>
    row.key !== TRANSACTION_TYPES[index].key ||
    row.nameFa !== TRANSACTION_TYPES[index].nameFa ||
    row.nameEn !== TRANSACTION_TYPES[index].nameEn ||
    row.icon !== TRANSACTION_TYPES[index].icon ||
    row.sortOrder !== TRANSACTION_TYPES[index].sortOrder ||
    row.active !== true
  )) {
    throw new Error("Post-seed verification failed; canonical seven TransactionType rows do not match.");
  }
  console.log("PASS: seven canonical TransactionType rows are present and active.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
