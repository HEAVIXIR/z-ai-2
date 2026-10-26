/**
 * Read-only catalog health diagnostic.
 *
 * Counts canonical entities to verify that the Main Prisma client can reach
 * their tables. Empty tables are informational, not failures: a valid fresh
 * database may have zero records. This script never writes to the database.
 */
import { db } from "../src/lib/db";

type Check = {
  label: string;
  run: () => Promise<number>;
};

const checks: Check[] = [
  { label: "Categories", run: () => db.category.count() },
  { label: "Brands", run: () => db.brand.count() },
  { label: "Product models", run: () => db.productModel.count() },
  { label: "Products", run: () => db.product.count() },
  { label: "Machines", run: () => db.machine.count() },
  { label: "Parts", run: () => db.part.count() },
  { label: "Listings", run: () => db.listing.count() },
  { label: "Companies", run: () => db.company.count() },
  { label: "Buy requests", run: () => db.buyRequest.count() },
  { label: "Price records", run: () => db.priceRecord.count() },
  { label: "Price observations", run: () => db.priceObservation.count() },
  { label: "Users", run: () => db.user.count() },
  { label: "Audit logs", run: () => db.auditLog.count() },
];

async function main(): Promise<void> {
  console.log("HEAVIX catalog health — read-only");
  console.log("A zero count is not treated as a schema or connectivity failure.\n");

  let failed = 0;
  for (const check of checks) {
    try {
      const count = await check.run();
      console.log("PASS  " + check.label + ": " + count);
    } catch (error) {
      failed += 1;
      const errorType = error instanceof Error ? error.name : "UnknownError";
      // Do not print database URLs, SQL, parameters, or raw driver errors.
      console.error("FAIL  " + check.label + ": query failed (" + errorType + ")");
    }
  }

  console.log("\nResult: " + (failed === 0 ? "PASS" : "FAIL") + " (" + failed + " failed checks)");
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error("FATAL: catalog health check could not complete (" + errorType + ")");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
