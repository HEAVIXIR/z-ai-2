import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const auth = fs.readFileSync(path.join(ROOT, "src/lib/auth.ts"), "utf8");

describe("canonical session persistence security contract", () => {
  it("stores only a hash while keeping the raw token in the cookie", () => {
    expect(auth).toContain("const tokenHash = hashSessionToken(rawToken)");
    expect(auth).toContain("data: { userId, token: tokenHash, expiresAt }");
    expect(auth).toContain("store.set(USER_COOKIE, rawToken");
    expect(auth).not.toContain("data: { userId, token: rawToken");
  });

  it("supports and opportunistically migrates legacy raw-token sessions", () => {
    expect(auth).toContain("where: { token: tokenHash }");
    expect(auth).toContain("where: { token },");
    expect(auth).toContain("data: { token: tokenHash }");
    expect(auth).toContain("where: { id: session.id, token }");
  });

  it("revokes both hashed and legacy sessions on logout", () => {
    expect(auth).toContain("token: { in: [tokenHash, token] }");
  });
});
