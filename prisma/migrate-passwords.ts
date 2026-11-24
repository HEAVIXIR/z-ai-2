/* ============================================================
   prisma/migrate-passwords.ts — P0-1 one-time safety migration.

   Background:
   - Before P0-1, `User.passwordHash` was stored as PLAINTEXT (the
     raw password typed by the user) for public registrations, and as
     a base64-of-`heavix:<password>` obfuscation for admin-created
     users. Neither is a hash; both are trivially reversible.

   What this script does:
   - Finds every User whose `passwordHash` does NOT already look like a
     bcrypt hash (bcrypt hashes start with `$2`, e.g. `$2a$10$...`).
   - For each such user, recovers the original plaintext password:
       • Plain `passwordHash` → use it as-is.
       • Legacy `heavix:<pw>` base64 obfuscation → base64-decode and
         strip the `heavix:` prefix to recover `<pw>`.
       • Anything else → best-effort: hash whatever's there and warn.
   - Hashes the recovered plaintext with bcrypt (cost 10, same as
     `src/lib/password.ts`) and writes it back.
   - Does NOT delete or skip any user — every user ends up with a
     real bcrypt hash, so nobody gets locked out and nobody keeps a
     plaintext password.

   Run once:
       bun run db:migrate-passwords
   (or directly: `bun run prisma/migrate-passwords.ts`)

   Idempotent: re-running is a no-op because every user will already
   have a `$2…` hash on the second run.
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
  const users = await db.user.findMany({
    select: { id: true, email: true, mobile: true, passwordHash: true },
  });

  const malformedPbkdf2 = users.filter(
    (user) => user.passwordHash.startsWith("pbkdf2$") && !isPbkdf2Hash(user.passwordHash),
  );
  if (malformedPbkdf2.length > 0) {
    console.error(
      "[migrate-passwords] Refusing to continue: " +
      malformedPbkdf2.length +
      " malformed PBKDF2 record(s) require manual review.",
    );
    process.exitCode = 1;
    return;
  }

  const toMigrate = users.filter((user) => !looksLikeSupportedHash(user.passwordHash));
  const alreadySupported = users.length - toMigrate.length;

  console.log(`[migrate-passwords] total users:        ${users.length}`);
  console.log(`[migrate-passwords] already supported:  ${alreadySupported}`);
  console.log(`[migrate-passwords] need migration:     ${toMigrate.length}`);

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
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });
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
