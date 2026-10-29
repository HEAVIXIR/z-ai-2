import { PrismaClient } from "@/lib/generated/store-client/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * HEAVIX Store Prisma Client (Prisma 7 + runtime=cloudflare).
 *
 * The store has a dedicated PostgreSQL database and generated client.
 */
type StorePrismaGlobal = typeof globalThis & {
  storeDb?: PrismaClient;
};

const globalForStore = globalThis as StorePrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createStorePrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: requiredEnv("STORE_DATABASE_URL"),
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
