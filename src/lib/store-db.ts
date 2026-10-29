import { PrismaClient as NodeStorePrismaClient } from "@/lib/generated/store-node-client";
import { PrismaClient as WorkerStorePrismaClient } from "@/lib/generated/store-client/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Store Prisma client.
 * Node.js processes use the Node-generated client; Cloudflare Preview uses
 * the separately generated Worker client.
 */
type StorePrismaClient = NodeStorePrismaClient | WorkerStorePrismaClient;
type StorePrismaGlobal = typeof globalThis & {
  storeDb?: StorePrismaClient;
};

const globalForStore = globalThis as StorePrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createStorePrismaClient(): StorePrismaClient {
  const adapter = new PrismaPg({
    connectionString: requiredEnv("STORE_DATABASE_URL"),
  });
  const options = { adapter, log: ["error", "warn"] };

  return process.env.HEAVIX_ENV === "preview"
    ? new WorkerStorePrismaClient(options)
    : new NodeStorePrismaClient(options);
}

export const storeDb = globalForStore.storeDb ?? createStorePrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForStore.storeDb = storeDb;
}
