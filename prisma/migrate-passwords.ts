/* ============================================================
   prisma/migrate-passwords.ts — one-time password-hash migration.

   Recovers legacy plaintext / base64-obfuscated passwords and stores
   them using PBKDF2-HMAC-SHA256 (600,000 iterations), the format used
   by the current Worker-compatible password helper.

   Existing bcrypt hashes are preserved for backward compatibility;
   successful Node/Vercel login migrates them lazily to PBKDF2. Existing
   PBKDF2 hashes are skipped, so this script is idempotent.

   Run:
       bun run db:migrate-passwords
   ============================================================ */

import { PrismaClient } from "@prisma/client";
import { hashPassword, isLegacyBcryptHash, isPbkdf2Hash } from "../src/lib/password";

const db = new PrismaClient();
const HEAVIX_PREFIX = "heavix:";

function looksLikeSupportedHash(value: string): boolean {
  return typeof value === "string" && (isLegacyBcryptHash(value) || isPbkdf2Hash(value));
}

function recoverPlaintext(stored: string): { plaintext: string; source: string } {
  if (stored.startsWith("aGVhdml4Og")) {
    try {
      const decoded = Buffer.from(stored, "base64").toString("utf-8");
      if (decoded.startsWith(HEAVIX_PREFIX)) {
        return { plaintext: decoded.slice(HEAVIX_PREFIX.length), source: "legacy-base64" };
      }
    } catch {
      // Fall through to the legacy plaintext fallback.
    }
  }
  return { plaintext: stored, source: "plaintext" };
}

async function main(): Promise<void> {
  const users = await db.user.findMany({
    select: { id: true, email: true, mobile: true, passwordHash: true },
  });

  const toMigrate = users.filter((user) => !looksLikeSupportedHash(user.passwordHash));
  const alreadySupported = users.length - toMigrate.length;

  console.log("[migrate-passwords] total users: " + users.length);
  console.log("[migrate-passwords] already supported: " + alreadySupported);
  console.log("[migrate-passwords] need migration: " + toMigrate.length);

  if (toMigrate.length === 0) {
    console.log("[migrate-passwords] nothing to do. All passwords use a supported hash format.");
    return;
  }

  let migrated = 0;
  let recoveredFromLegacy = 0;
  let recoveredFromPlaintext = 0;
  const failures: { id: string; email: string; reason: string }[] = [];

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
      console.log("  ✓ " + (user.email ?? user.mobile) + " (" + user.id + ") ← " + recovered.source + " → PBKDF2");
    } catch (err: any) {
      failures.push({
        id: user.id,
        email: user.email ?? user.mobile,
        reason: err?.message ?? String(err),
      });
      console.error("  ✗ " + (user.email ?? user.mobile) + " (" + user.id + ") FAILED: " + (err?.message ?? err));
    }
  }

  console.log("");
  console.log("[migrate-passwords] done.");
  console.log("  migrated (from plaintext):       " + recoveredFromPlaintext);
  console.log("  migrated (from legacy base64):   " + recoveredFromLegacy);
  console.log("  total migrated:                  " + migrated);
  console.log("  failures:                        " + failures.length);
  if (failures.length > 0) {
    console.log("[migrate-passwords] FAILURES:");
    for (const failure of failures) {
      console.log("  - " + failure.email + " (" + failure.id + "): " + failure.reason);
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
