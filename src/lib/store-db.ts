import type { PrismaClient } from './generated/store-worker-client/client'

/**
 * HEAVIX Store uses its own PostgreSQL database and a separate workerd Prisma
 * client. Do not load the legacy Node/WASM client in Cloudflare Workers.
 */
const globalForStore = globalThis as unknown as {
  storeDb: PrismaClient | undefined
}

function createStorePrismaClient(): PrismaClient {
  if (typeof require === 'undefined') {
    throw new Error('Store PrismaClient cannot be instantiated in this context (require unavailable)')
  }

  const connectionString = process.env.STORE_DATABASE_URL
  if (!connectionString) {
    throw new Error('STORE_DATABASE_URL is required to initialize the Store database client')
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const clientModule = require('./generated/store-worker-client/client') as {
    PrismaClient: new (options: { adapter: unknown; log: string[] }) => PrismaClient
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adapterModule = require('@prisma/adapter-pg') as {
    PrismaPg: new (options: { connectionString: string }) => unknown
  }

  const adapter = new adapterModule.PrismaPg({ connectionString })
  return new clientModule.PrismaClient({ adapter, log: ['error', 'warn'] })
}

export const storeDb = globalForStore.storeDb ?? createStorePrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForStore.storeDb = storeDb
}
