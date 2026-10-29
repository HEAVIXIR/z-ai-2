import { PrismaClient as WorkerStorePrismaClient } from "@/lib/generated/store-client/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Store Prisma client.
 * The Cloudflare-compatible generated client is used across runtimes to keep
 * transaction and model types canonical.
 */
type StorePrismaGlobal = typeof globalThis & {
  storeDb?: WorkerStorePrismaClient;
};

const globalForStore = globalThis as StorePrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createStorePrismaClient(): WorkerStorePrismaClient {
  const adapter = new PrismaPg({
    connectionString: requiredEnv("STORE_DATABASE_URL"),
  });

  return new WorkerStorePrismaClient({ adapter });
}

export const storeDb = globalForStore.storeDb ?? createStorePrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForStore.storeDb = storeDb;
}
