import bcrypt from "bcryptjs";

const ROUNDS = 10;
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

/**
 * bcrypt only incorporates the first 72 UTF-8 bytes. Validate bytes (not
 * JavaScript characters) so distinct long passwords cannot silently collide.
 */
export function isPasswordWithinBcryptLimit(password: string): boolean {
  return typeof password === "string" &&
    password.length > 0 &&
    new TextEncoder().encode(password).byteLength <= BCRYPT_MAX_PASSWORD_BYTES;
}

export async function hashPassword(password: string): Promise<string> {
  if (!isPasswordWithinBcryptLimit(password)) {
    throw new RangeError("Password must contain between 1 and 72 UTF-8 bytes for bcrypt");
  }
  return bcrypt.hash(password, ROUNDS);
}

/**
 * Verification intentionally keeps bcrypt's historical comparison behavior.
 * This avoids locking out the existing owner account if its test-era password
 * exceeded 72 bytes; new hashes are always subject to the strict byte limit.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (typeof password !== "string" || typeof hash !== "string" || password.length === 0) {
    return false;
  }
  return bcrypt.compare(password, hash);
}
