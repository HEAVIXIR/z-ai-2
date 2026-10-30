import { PrismaClient } from "@/lib/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SCHEMA_VERSION = "p2-auction-company-rental";

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
  const adapter = new PrismaPg({ connectionString: requiredEnv("DATABASE_URL") });
  return new PrismaClient({ adapter });
}

if (globalForPrisma.prismaWorkerSchemaVersion !== SCHEMA_VERSION) {
  globalForPrisma.prismaWorker = undefined;
  globalForPrisma.prismaWorkerSchemaVersion = SCHEMA_VERSION;
}

globalForPrisma.prismaWorker ??= createWorkerPrismaClient();

export const db: PrismaClient = globalForPrisma.prismaWorker;
