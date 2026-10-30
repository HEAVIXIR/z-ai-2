/**
 * Compatibility Node entrypoint. Next.js/Vitest/TypeScript resolve this
 * module to the target-specific main database runtime; Worker builds alias
 * it to db.worker.ts.
 */
export { db, Prisma } from "@/lib/db.node";
