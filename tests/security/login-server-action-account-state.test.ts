import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("login server action account-state contract", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../src/app/login/actions.ts"),
    "utf8",
  );

  it("rejects accounts unless ACTIVE and email-verified before creating a session", () => {
    const guard = source.indexOf('user.status !== "ACTIVE" || !user.emailVerified');
    const session = source.indexOf("await createUserSession(user.id)");
    expect(guard).toBeGreaterThan(-1);
    expect(session).toBeGreaterThan(guard);
  });

  it("uses the generic login error for account-state rejection", () => {
    expect(source).toMatch(/user\.status !== "ACTIVE" \|\| !user\.emailVerified\) redirect\("\/login\?error=1"\)/);
  });
});
