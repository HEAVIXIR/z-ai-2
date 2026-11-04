import { PrismaClient } from "@/lib/generated/store-worker-client/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";

type StorePrismaGlobal = typeof globalThis & {
  storeDbWorker?: PrismaClient;
};

const globalForStore = globalThis as StorePrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Worker secret: ${name}`);
  return value;
}

function createWorkerStorePrismaClient(): PrismaClient {
  const adapter = new PrismaPostgresAdapter({
    connectionString: requiredEnv("STORE_DATABASE_URL"),
  });
  return new PrismaClient({ adapter });
}

export const storeDb =
  globalForStore.storeDbWorker ??
  (globalForStore.storeDbWorker = createWorkerStorePrismaClient());
