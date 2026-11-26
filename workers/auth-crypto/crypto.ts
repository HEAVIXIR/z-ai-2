import bcrypt from "bcryptjs";

export const BCRYPT_COST = 10;
const MAX_PASSWORD_BYTES = 1024;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/;

function isBoundedPassword(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  return new TextEncoder().encode(value).byteLength <= MAX_PASSWORD_BYTES;
}

/** Hashes a password using the HEAVIX legacy-compatible bcrypt cost and format. */
export async function hashPasswordWithBcrypt(password: string): Promise<string> {
  if (!isBoundedPassword(password)) {
    throw new TypeError("Password input is invalid or exceeds the crypto service limit");
  }

  const encoded = await bcrypt.hash(password, BCRYPT_COST);
  if (!BCRYPT_HASH_PATTERN.test(encoded)) {
    throw new Error("Bcrypt provider returned an unexpected hash format");
  }
  return encoded;
}

/** Verifies only supported bcrypt cost-10 hashes; malformed hashes fail closed. */
export async function verifyPasswordWithBcrypt(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  if (!isBoundedPassword(password) || typeof encodedHash !== "string") return false;
  if (!BCRYPT_HASH_PATTERN.test(encodedHash)) return false;

  return bcrypt.compare(password, encodedHash);
}
