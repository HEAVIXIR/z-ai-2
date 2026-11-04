import { PrismaClient, Prisma } from "@/lib/generated/worker-client";
import { PrismaPg } from "@prisma/adapter-pg";

const SCHEMA_VERSION = "p3-cloudflare-prisma6-driver-adapter";

type PrismaGlobal = typeof globalThis & {
  prismaWorker?: PrismaClient;
  prismaWorkerSchemaVersion?: string;
};

const globalForPrisma = globalThis as PrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createWorkerPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: requiredEnv("DATABASE_URL"),
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter, log: ["error", "warn"] });
}

if (globalForPrisma.prismaWorkerSchemaVersion !== SCHEMA_VERSION) {
  globalForPrisma.prismaWorker = undefined;
  globalForPrisma.prismaWorkerSchemaVersion = SCHEMA_VERSION;
}

globalForPrisma.prismaWorker ??= createWorkerPrismaClient();

export const db: PrismaClient = globalForPrisma.prismaWorker;
export { Prisma };
export type { Article } from "@/lib/generated/worker-client";
