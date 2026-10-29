import { PrismaClient as NodeStorePrismaClient } from "@/lib/generated/store-node-runtime-client/client";
import { PrismaClient as WorkerStorePrismaClient } from "@/lib/generated/store-client/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Store Prisma client.
 * Node.js processes use the Node-generated client; Cloudflare Preview uses
 * the separately generated Worker client. Both share the same store schema;
 * expose the Node client contract to preserve callable transaction overloads.
 */
type StorePrismaGlobal = typeof globalThis & {
  storeDb?: NodeStorePrismaClient;
};

const globalForStore = globalThis as StorePrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createStorePrismaClient(): NodeStorePrismaClient {
  const adapter = new PrismaPg({
    connectionString: requiredEnv("STORE_DATABASE_URL"),
  });

  if (process.env.HEAVIX_ENV === "preview") {
    return new WorkerStorePrismaClient({ adapter, log: ["error", "warn"] });
  }

  return new NodeStorePrismaClient({ adapter, log: ["error", "warn"] });
}

export const storeDb = globalForStore.storeDb ?? createStorePrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForStore.storeDb = storeDb;
}
