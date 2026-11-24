/* ============================================================
   prisma/migrate-passwords.ts — guarded one-time credential migration.

   SAFETY:
   - Default mode is DRY RUN. It reports counts only and never writes.
   - Mutation requires --apply, an explicit expected DATABASE_URL host,
     and a non-empty backup/recovery reference supplied by the operator.
   - The backup reference is an audit input, NOT proof that a backup is
     valid or restorable. Verify restoreability independently before apply.
   - Each write uses compare-and-swap against the exact original hash so a
     concurrent password reset is never overwritten.
   - Malformed PBKDF2 or unsupported bcrypt records stop the whole run.

   Apply example (only after independently verifying target + restore):
     HEAVIX_PASSWORD_MIGRATION_EXPECTED_DB_HOST=<exact-db-host> \
     HEAVIX_PASSWORD_MIGRATION_BACKUP_REF=<verified-backup-reference> \
     bun run prisma/migrate-passwords.ts --apply

   This script is never run by CI and must not be executed against Production
   without a separately approved and verified backup/recovery gate.
   ============================================================ */

import { PrismaClient } from "@prisma/client";
import { hashPassword, isLegacyBcryptHash, isPbkdf2Hash } from "../src/lib/password";

const db = new PrismaClient();

const HEAVIX_PREFIX = "heavix:";

function looksLikeSupportedHash(value: string): boolean {
  return isLegacyBcryptHash(value) || isPbkdf2Hash(value);
}

/**
 * Try to recover the original plaintext password from a legacy stored
 * value. Returns the recovered plaintext, or null if we genuinely
 * cannot recover it (in which case the caller hashes the stored value
 * verbatim as a best-effort fallback).
 */
function recoverPlaintext(stored: string): { plaintext: string; source: string } {
  // Plain plaintext (e.g. "password123") → use as-is.
  // Detect the legacy base64 obfuscation: base64 of `heavix:<pw>`.
  // base64("heavix:") starts with "aGVhdml4Og" — quick sniff.
  if (stored.startsWith("aGVhdml4Og")) {
    try {
      const decoded = Buffer.from(stored, "base64").toString("utf-8");
      if (decoded.startsWith(HEAVIX_PREFIX)) {
        return { plaintext: decoded.slice(HEAVIX_PREFIX.length), source: "legacy-base64" };
      }
    } catch {
      /* fall through */
    }
  }
  return { plaintext: stored, source: "plaintext" };
}

async function main(): Promise<void> {
  const applyRequested = process.argv.includes("--apply");
  const users = await db.user.findMany({
    select: { id: true, passwordHash: true },
  });

  const malformedPbkdf2 = users.filter(
    (user) => user.passwordHash.startsWith("pbkdf2$") && !isPbkdf2Hash(user.passwordHash),
  );
  const unsupportedBcrypt = users.filter(
    (user) => /^\$2[aby]\$/.test(user.passwordHash) && !isLegacyBcryptHash(user.passwordHash),
  );
  if (malformedPbkdf2.length > 0 || unsupportedBcrypt.length > 0) {
    console.error(
      "[migrate-passwords] Refusing to continue: " +
      malformedPbkdf2.length + " malformed PBKDF2 and " +
      unsupportedBcrypt.length + " unsupported bcrypt record(s) require manual review.",
    );
    process.exitCode = 1;
    return;
  }

  const toMigrate = users.filter((user) => !looksLikeSupportedHash(user.passwordHash));
  const alreadySupported = users.length - toMigrate.length;

  console.log(`[migrate-passwords] mode:               ${applyRequested ? "APPLY" : "DRY RUN"}`);
  console.log(`[migrate-passwords] total users:        ${users.length}`);
  console.log(`[migrate-passwords] already supported:  ${alreadySupported}`);
  console.log(`[migrate-passwords] need migration:     ${toMigrate.length}`);

  if (!applyRequested) {
    console.log("[migrate-passwords] dry run only; no credentials were changed.");
    console.log("[migrate-passwords] pass --apply only after verifying the target and a restorable backup.");
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  const expectedHost = process.env.HEAVIX_PASSWORD_MIGRATION_EXPECTED_DB_HOST?.trim();
  const backupRef = process.env.HEAVIX_PASSWORD_MIGRATION_BACKUP_REF?.trim();
  let actualHost = "";
  try {
    actualHost = databaseUrl ? new URL(databaseUrl).host : "";
  } catch {
    actualHost = "";
  }
  if (!actualHost || !expectedHost || actualHost !== expectedHost || !backupRef) {
    console.error("[migrate-passwords] APPLY refused: DATABASE_URL host must exactly match HEAVIX_PASSWORD_MIGRATION_EXPECTED_DB_HOST and HEAVIX_PASSWORD_MIGRATION_BACKUP_REF must be set.");
    process.exitCode = 1;
    return;
  }
  console.log(`[migrate-passwords] confirmed database host: ${actualHost}`);
  console.log("[migrate-passwords] backup/recovery reference supplied; restoreability must have been verified independently.");

  if (toMigrate.length === 0) {
    console.log("[migrate-passwords] nothing to do. All passwords use a supported hash format.");
    return;
  }

  let migrated = 0;
  let recoveredFromLegacy = 0;
  let recoveredFromPlaintext = 0;
  const failures: { reason: string }[] = [];

  for (const user of toMigrate) {
    try {
      const recovered = recoverPlaintext(user.passwordHash);
      const newHash = await hashPassword(recovered.plaintext);
      const write = await db.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash },
        data: { passwordHash: newHash },
      });
      if (write.count !== 1) {
        failures.push({ reason: "credential changed concurrently; compare-and-swap skipped the write" });
        continue;
      }
      migrated += 1;
      if (recovered.source === "legacy-base64") recoveredFromLegacy += 1;
      else recoveredFromPlaintext += 1;
      console.log(`  ✓ migrated one legacy credential (${recovered.source} → PBKDF2)`);
    } catch (err: any) {
      const reason = err?.message ?? String(err);
      failures.push({ reason });
      console.error("  ✗ one credential migration failed: " + reason);
    }
  }

  console.log("");
  console.log("[migrate-passwords] done.");
  console.log(`  migrated (from plaintext):       ${recoveredFromPlaintext}`);
  console.log(`  migrated (from legacy base64):   ${recoveredFromLegacy}`);
  console.log(`  total migrated:                  ${migrated}`);
  console.log(`  failures:                        ${failures.length}`);
  if (failures.length > 0) {
    console.log("[migrate-passwords] FAILURES:");
    for (const [index, failure] of failures.entries()) {
      console.log(`  - record ${index + 1}: ${failure.reason}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[migrate-passwords] FATAL:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
