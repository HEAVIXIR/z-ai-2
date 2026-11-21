import { PrismaClient } from "@/lib/generated/store-client";

/**
 * Node.js Prisma client for the separate HEAVIX Store PostgreSQL database.
 * Cloudflare builds replace this module with store-db.worker.ts.
 */
const globalForStore = globalThis as unknown as {
  storeDb: PrismaClient | undefined;
};

export const storeDb =
  globalForStore.storeDb ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForStore.storeDb = storeDb;
}
