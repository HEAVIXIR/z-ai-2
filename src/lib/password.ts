import bcrypt from "bcryptjs";

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_KEY_LENGTH_BITS = 256;
const PBKDF2_SALT_LENGTH_BYTES = 16;
const encoder = new TextEncoder();

export interface VerifyPasswordOptions {
  /** Allow legacy bcrypt verification only on runtimes with sufficient CPU. */
  allowLegacyBcrypt?: boolean;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function isLegacyBcryptHash(hash: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(hash);
}

export function isPbkdf2Hash(hash: string): boolean {
  return "pbkdf2$sha256$" + PBKDF2_ITERATIONS + "$" + toBase64Url(salt) + "$" + toBase64Url(derived);
}

async function derivePbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    PBKDF2_KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  if (!password) throw new Error("Password is required");
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_LENGTH_BYTES));
  const derived = await derivePbkdf2(password, salt);
  return \`pbkdf2$sha256$\${PBKDF2_ITERATIONS}$\${toBase64Url(salt)}$\${toBase64Url(derived)}\`;
}

async function verifyPbkdf2Password(password: string, hash: string): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;

  const iterations = Number(parts[2]);
  // Accept only the current fixed work factor; never let stored data choose
  // an unbounded iteration count for a public login request.
  if (iterations !== PBKDF2_ITERATIONS) return false;

  const salt = fromBase64Url(parts[3]);
  const expected = fromBase64Url(parts[4]);
  if (
    !salt ||
    salt.length !== PBKDF2_SALT_LENGTH_BYTES ||
    !expected ||
    expected.length !== PBKDF2_KEY_LENGTH_BITS / 8
  ) {
    return false;
  }

  const actual = await derivePbkdf2(password, salt);
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}

export async function verifyPassword(
  password: string,
  hash: string,
  options: VerifyPasswordOptions = {},
): Promise<boolean> {
  if (typeof password !== "string" || typeof hash !== "string") return false;

  if (isPbkdf2Hash(hash)) {
    return verifyPbkdf2Password(password, hash);
  }

  if (isLegacyBcryptHash(hash)) {
    const runtimeAllowsLegacy =
      typeof process !== "undefined" &&
      process.env.HEAVIX_AUTH_ALLOW_LEGACY_BCRYPT !== "false";
    const allowLegacyBcrypt = options.allowLegacyBcrypt ?? runtimeAllowsLegacy;
    if (!allowLegacyBcrypt) return false;
    return bcrypt.compare(password, hash);
  }

  return false;
}
