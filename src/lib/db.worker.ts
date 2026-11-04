import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaClient, Prisma } from "@/lib/generated/worker-client/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";
import {
  createRequestScopedClientResolver,
  createRequestScopedPrismaProxy,
} from "@/lib/prisma-worker-proxy";

type WorkerEnv = {
  DATABASE_URL?: string;
};

// ExecutionContext is unique to the current request. Never put the Prisma
// client itself on globalThis: its I/O context cannot cross Worker requests.
const getRequestClient = createRequestScopedClientResolver(
  () => getCloudflareContext().ctx as object,
  () => {
    const { env } = getCloudflareContext();
    const connectionString = (env as WorkerEnv).DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing Cloudflare Worker secret: DATABASE_URL");
    }

    return new PrismaClient({
      adapter: new PrismaPostgresAdapter({ connectionString }),
      log: ["error", "warn"],
    });
  },
);

export const db = createRequestScopedPrismaProxy(getRequestClient) as PrismaClient;
export { Prisma };
export type { Article } from "@/lib/generated/worker-client/client";
