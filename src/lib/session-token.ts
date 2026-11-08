import crypto from "node:crypto";

/** Hash an opaque session bearer before persistence. */
export function hashSessionToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}
