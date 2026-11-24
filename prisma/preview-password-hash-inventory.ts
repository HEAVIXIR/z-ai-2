import { PrismaClient } from "@prisma/client";
import {
  isLegacyBcryptHash,
  isPbkdf2Hash,
} from "../src/lib/password";

function requiredDigits(name: string, value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  if (!/^[0-9]{1,20}$/.test(normalized)) {
    throw new Error(`[preview-password-inventory] ${name} is missing or invalid.`);
  }
  return normalized;
}

async function main() {
  if (process.env.HEAVIX_ENV !== "preview") {
    throw new Error("[preview-password-inventory] HEAVIX_ENV must be exactly preview.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("[preview-password-inventory] DATABASE_URL is required.");
  }

  const expectedDatabaseOid = requiredDigits(
    "HEAVIX_APP_PREVIEW_DATABASE_OID",
    process.env.HEAVIX_APP_PREVIEW_DATABASE_OID,
  );
  const expectedSystemIdentifier = requiredDigits(
    "HEAVIX_EXPECTED_SYSTEM_IDENTIFIER",
    process.env.HEAVIX_EXPECTED_SYSTEM_IDENTIFIER,
  );

  const prisma = new PrismaClient();
  try {
    const identity = await prisma.$queryRaw<
      Array<{ databaseName: string; databaseOid: string; systemIdentifier: string }>
    >`
      SELECT
        current_database() AS "databaseName",
        (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS "databaseOid",
        (SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier"
    `;

    const actual = identity[0];
    if (
      !actual ||
      actual.databaseName !== "postgres" ||
      actual.databaseOid !== expectedDatabaseOid ||
      actual.systemIdentifier !== expectedSystemIdentifier
    ) {
      throw new Error(
        "[preview-password-inventory] Exact App Preview database identity mismatch; no user rows were read.",
      );
    }

    const users = await prisma.user.findMany({
      select: { passwordHash: true },
    });

    let pbkdf2Count = 0;
    let bcryptCount = 0;
    let unsupportedBcryptCount = 0;
    let malformedPbkdf2Count = 0;
    let legacyCount = 0;

    for (const user of users) {
      const hash = user.passwordHash;
      if (isPbkdf2Hash(hash)) {
        pbkdf2Count += 1;
      } else if (isLegacyBcryptHash(hash)) {
        bcryptCount += 1;
      } else {
        legacyCount += 1;
        if (/^\$2[aby]\$/.test(hash)) unsupportedBcryptCount += 1;
        if (hash.startsWith("pbkdf2$")) malformedPbkdf2Count += 1;
      }
    }

    console.log("[preview-password-inventory] mode: READ ONLY");
    console.log(`[preview-password-inventory] database identity: PASS (OID ${actual.databaseOid}; system identifier matched)`);
    console.log(`[preview-password-inventory] total users: ${users.length}`);
    console.log(`[preview-password-inventory] PBKDF2 hashes: ${pbkdf2Count}`);
    console.log(`[preview-password-inventory] supported bcrypt: ${bcryptCount}`);
    console.log(`[preview-password-inventory] unsupported/legacy: ${legacyCount}`);
    console.log(`[preview-password-inventory] unsupported bcrypt: ${unsupportedBcryptCount}`);
    console.log(`[preview-password-inventory] malformed PBKDF2: ${malformedPbkdf2Count}`);
    console.log("[preview-password-inventory] no user identifiers or password hashes were emitted; no rows were changed.");

    if (unsupportedBcryptCount > 0 || malformedPbkdf2Count > 0) {
      throw new Error("[preview-password-inventory] Unsupported credential formats detected; refusing to report a clean inventory.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "[preview-password-inventory] failed.");
  process.exitCode = 1;
});
