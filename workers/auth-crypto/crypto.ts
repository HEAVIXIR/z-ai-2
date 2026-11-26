import bcrypt from "bcryptjs";

export const BCRYPT_COST = 10;
const MAX_PASSWORD_BYTES = 1024;
const BCRYPT_MAX_EFFECTIVE_BYTES = 72;
const BCRYPT_HASH_PATTERN = /^\\$2[aby]\\$10\\$[./A-Za-z0-9]{53}$/;

function isBoundedPassword(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  return new TextEncoder().encode(value).byteLength <= MAX_PASSWORD_BYTES;
}

/** Hashes new passwords without bcrypt's silent 72-byte truncation. */
export async function hashPasswordWithBcrypt(password: string): Promise<string> {
  if (!isBoundedPassword(password)) {
    throw new TypeError("Password input is invalid or exceeds the crypto service limit");
  }
  if (bcrypt.truncates(password)) {
    throw new RangeError(`New bcrypt passwords must not exceed ${BCRYPT_MAX_EFFECTIVE_BYTES} UTF-8 bytes`);
  }

  const encoded = await bcrypt.hash(password, BCRYPT_COST);
  if (!BCRYPT_HASH_PATTERN.test(encoded)) {
    throw new Error("Bcrypt provider returned an unexpected hash format");
  }
  return encoded;
}

/**
 * Verifies supported legacy bcrypt cost-10 hashes. Inputs up to the transport
 * ceiling remain accepted here to preserve bcrypt's historical comparison
 * semantics for accounts created before the 72-byte hash-input rule.
 */
export async function verifyPasswordWithBcrypt(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  if (!isBoundedPassword(password) || typeof encodedHash !== "string") return false;
  if (!BCRYPT_HASH_PATTERN.test(encodedHash)) return false;

  return bcrypt.compare(password, encodedHash);
}
