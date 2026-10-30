import { Prisma, PrismaClient } from "@/lib/generated/node-client";
import { PrismaPg } from "@prisma/adapter-pg";

const SCHEMA_VERSION = "p2-auction-company-rental";

type PrismaGlobal = typeof globalThis & {
  prismaNode?: PrismaClient;
  prismaNodeSchemaVersion?: string;
};

const globalForPrisma = globalThis as PrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createNodePrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: requiredEnv("DATABASE_URL") });
  return new PrismaClient({ adapter });
}

if (globalForPrisma.prismaNodeSchemaVersion !== SCHEMA_VERSION) {
  globalForPrisma.prismaNode = undefined;
  globalForPrisma.prismaNodeSchemaVersion = SCHEMA_VERSION;
}

globalForPrisma.prismaNode ??= createNodePrismaClient();

export const db: PrismaClient = globalForPrisma.prismaNode;
export { Prisma };
