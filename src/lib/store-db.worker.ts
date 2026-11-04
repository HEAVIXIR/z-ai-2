import { PrismaClient } from "@/lib/generated/store-worker-client/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";

const SCHEMA_VERSION = "p3-cloudflare-store-prisma6-ppg";

type StorePrismaGlobal = typeof globalThis & {
  storeDbWorker?: PrismaClient;
  storeDbWorkerSchemaVersion?: string;
};

const globalForStore = globalThis as StorePrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createWorkerStorePrismaClient(): PrismaClient {
  const adapter = new PrismaPostgresAdapter({
    connectionString: requiredEnv("STORE_DATABASE_URL"),
  });
  return new PrismaClient({ adapter, log: ["error", "warn"] });
}

if (globalForStore.storeDbWorkerSchemaVersion !== SCHEMA_VERSION) {
  globalForStore.storeDbWorker = undefined;
  globalForStore.storeDbWorkerSchemaVersion = SCHEMA_VERSION;
}

globalForStore.storeDbWorker ??= createWorkerStorePrismaClient();

export const storeDb: PrismaClient = globalForStore.storeDbWorker;
