/**
 * Compatibility Node entrypoint. Next.js/Vitest/TypeScript resolve this
 * module to the target-specific entrypoint; Worker builds alias it to
 * store-db.worker.ts and Node builds alias it to store-db.node.ts.
 */
export { storeDb } from "@/lib/store-db.node";
