import { createHash } from "node:crypto";
import { isLegacyBcryptHash, isPbkdf2Hash, verifyPassword } from "./password";

/**
 * Verify password-reset codes across supported persisted formats.
 *
 * New codes are stored as PBKDF2 hashes by the forgot-password route. Older
 * records may contain bcrypt, a SHA-256 digest, or a legacy raw code.
 */
export async function verifyPasswordResetCode(
  candidate: string,
  stored: string,
): Promise<boolean> {
  if (isPbkdf2Hash(stored) || isLegacyBcryptHash(stored)) {
    return verifyPassword(candidate, stored);
  }

  return (
    stored === candidate ||
    stored === createHash("sha256").update(candidate).digest("hex")
  );
}
