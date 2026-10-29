import { PrismaClient } from "@/lib/generated/store-client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * HEAVIX Store Prisma Client singleton.
 *
 * Store uses its own PostgreSQL database and STORE_DATABASE_URL. The
 * engine-less Prisma client plus pg adapter avoids shipping a Rust query
 * engine binary in the Cloudflare Workers runtime.
 */
const globalForStore = globalThis as unknown as {
  storeDb: PrismaClient | undefined;
};

function createStorePrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.STORE_DATABASE_URL as string,
  });

  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}

export const storeDb = globalForStore.storeDb ?? createStorePrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForStore.storeDb = storeDb;
}
