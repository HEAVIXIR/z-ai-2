import { PrismaClient, Prisma } from "@/lib/generated/worker-client/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";

const SCHEMA_VERSION = "p3-cloudflare-prisma6-ppg";

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
  const adapter = new PrismaPostgresAdapter({
    connectionString: requiredEnv("DATABASE_URL"),
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
export type { Article } from "@/lib/generated/worker-client/client";
