import { PrismaClient } from "@/lib/generated/store-worker-client";
import { PrismaPg } from "@prisma/adapter-pg";

const SCHEMA_VERSION = "p3-cloudflare-store-prisma6-driver-adapter";

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
  const adapter = new PrismaPg({
    connectionString: requiredEnv("STORE_DATABASE_URL"),
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter, log: ["error", "warn"] });
}

if (globalForStore.storeDbWorkerSchemaVersion !== SCHEMA_VERSION) {
  globalForStore.storeDbWorker = undefined;
  globalForStore.storeDbWorkerSchemaVersion = SCHEMA_VERSION;
}

globalForStore.storeDbWorker ??= createWorkerStorePrismaClient();

export const storeDb: PrismaClient = globalForStore.storeDbWorker;
