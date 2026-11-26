import type { PrismaClient } from "@prisma/client";

/** Shared fail-closed gate for Preview-only catalog seed scripts. */
export async function assertPreviewSeedTarget(db: PrismaClient, approvalVariable: string): Promise<boolean> {
  if (!process.argv.includes("--apply")) {
    console.log("DRY RUN: no database writes performed. Add --apply only after Preview backup and target review.");
    return false;
  }
  if (process.env.HEAVIX_ENV !== "preview") {
    throw new Error('Refusing seed: HEAVIX_ENV must be exactly "preview". No writes performed.');
  }
  if (process.env[approvalVariable] !== "YES") {
    throw new Error(`Refusing seed: explicit ${approvalVariable}=YES is required. No writes performed.`);
  }
  const expectedSystem = process.env.HEAVIX_EXPECTED_PREVIEW_SYSTEM_IDENTIFIER;
  const expectedOid = process.env.HEAVIX_EXPECTED_PREVIEW_DATABASE_OID;
  if (!expectedSystem || !expectedOid || !/^[1-9][0-9]{0,9}$/.test(expectedOid)) {
    throw new Error("Exact Preview database identity secrets are required; no writes performed.");
  }
  const identity = await db.$queryRaw<Array<{ database_name: string; database_oid: string; system_identifier: string }>>`SELECT current_database() AS database_name, (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid, (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier`;
  const actual = identity[0];
  if (!actual || actual.database_name !== "postgres" || actual.database_oid !== expectedOid || actual.system_identifier !== expectedSystem) {
    throw new Error("Exact App Preview database identity mismatch; no writes performed.");
  }
  console.log("PASS: exact App Preview database identity and explicit approval verified.");
  return true;
}
