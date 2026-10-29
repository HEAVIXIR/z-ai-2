import { PrismaClient } from "@/lib/generated/store-client";
import { PrismaClient as WorkerStorePrismaClient } from "@/lib/generated/store-worker-client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * HEAVIX Store Prisma Client singleton.
 *
 * Node.js tasks keep the standard generated client. The Cloudflare Preview
 * Worker uses the separate engine-less client with its own database URL.
 */
const globalForStore = globalThis as unknown as {
  storeDb: PrismaClient | undefined;
};

function createStorePrismaClient(): PrismaClient {
  if (process.env.HEAVIX_ENV === "preview") {
    const adapter = new PrismaPg({
      connectionString: process.env.STORE_DATABASE_URL as string,
    });

    return new WorkerStorePrismaClient({
      adapter,
      log: ["error", "warn"],
    }) as unknown as PrismaClient;
  }

  return new PrismaClient({ log: ["error", "warn"] });
}

export const storeDb = globalForStore.storeDb ?? createStorePrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForStore.storeDb = storeDb;
}
