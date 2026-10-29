import { PrismaClient } from "@/lib/generated/store-client/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * HEAVIX Store Prisma Client (Prisma 7 + runtime=cloudflare).
 *
 * The HEAVIX auto-parts marketplace has its OWN PostgreSQL database
 * (`STORE_DATABASE_URL`) and its own Prisma schema
 * (`prisma/store/schema.prisma`). The generated client lives at
 * `src/lib/generated/store-client`.
 *
 * Prisma 7 generates a single TypeScript client with runtime="cloudflare"
 * that works in BOTH Node.js and Cloudflare Workers.
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
  }) as unknown as PrismaClient;
}

export const storeDb = globalForStore.storeDb ?? createStorePrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForStore.storeDb = storeDb;
}
