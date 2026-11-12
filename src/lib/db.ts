import type { PrismaClient } from './generated/worker-client/client'

/**
 * HEAVIX Cloudflare-compatible Prisma client.
 *
 * The Worker build generates an engine-less Prisma client for workerd. Keep
 * the runtime require guarded so modules that are transitively imported by
 * client components do not eagerly pull database code into the browser.
 */
const SCHEMA_VERSION = 'p2-auction-company-rental-worker-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaSchemaVersion?: string
}

function createPrismaClient(): PrismaClient {
  if (typeof require === 'undefined') {
    throw new Error('PrismaClient cannot be instantiated in this context (require unavailable)')
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to initialize the HEAVIX database client')
  }

  // The generated workerd client uses Prisma's driver-adapter architecture;
  // the legacy @prisma/client WASM query engine is not used in Cloudflare.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const clientModule = require('./generated/worker-client/client') as {
    PrismaClient: new (options: { adapter: unknown; log: string[] }) => PrismaClient
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adapterModule = require('@prisma/adapter-pg') as {
    PrismaPg: new (options: { connectionString: string }) => unknown
  }

  const adapter = new adapterModule.PrismaPg({ connectionString })
  return new clientModule.PrismaClient({ adapter, log: ['error', 'warn'] })
}

if (globalForPrisma.prismaSchemaVersion !== SCHEMA_VERSION) {
  globalForPrisma.prisma = undefined
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION
}
