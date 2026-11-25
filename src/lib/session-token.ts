import crypto from "node:crypto";

/**
 * Hash the opaque session bearer before persistence.
 * The raw token is retained only in the HttpOnly browser cookie.
 */
export function hashSessionToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}
