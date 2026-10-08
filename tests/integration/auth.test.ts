import { describe, it, expect } from "vitest";
import * as authModule from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

/* ============================================================
   Integration tests for the auth flow (P0-2 / P0-3, P1-20)
   HEAVIX-SECURITY-BASELINE-V1.md §2  (Authentication Hardening)
   HEAVIX-P0-IMPLEMENTATION-PLAN.md   STEP 2 (Authentication)
   ------------------------------------------------------------
   R45-16 CANONICAL AUTH CONTRACT (replaces legacy validateLogin):
   The legacy admin authenticator (`validateLogin`, `ADMIN_CREDENTIALS`,
   `ADMIN_COOKIE`, `AdminSession`, synthetic `id="ADMIN"` User) was
   REMOVED by R45-16. The canonical identity path is:
       USER_COOKIE → Session.token → Session.userId → User
   These tests verify the canonical contract:
     1. Only canonical exports exist (no legacy admin symbols).
     2. The password hash/verify cycle (user auth path) works.
   ============================================================ */

describe("R45-16 canonical auth contract", () => {
  it("exports ONLY the canonical session-based API (no legacy admin symbols)", () => {
    const exportedKeys = Object.keys(authModule).sort();

    // Canonical exports that MUST exist.
    const required = [
      "USER_COOKIE",
      "createUserSession",
      "destroyUserSession",
      "getCurrentUser",
      "getCurrentUserId",
      "isAuthenticated",
      "destroySession",
    ];
    for (const key of required) {
      expect(exportedKeys).toContain(key);
    }

    // Legacy admin symbols that MUST NOT exist (removed by R45-16).
    const forbidden = [
      "validateLogin",
      "ADMIN_CREDENTIALS",
      "ADMIN_COOKIE",
      "createSession",        // legacy admin session creator
      "getCurrentAdmin",      // legacy admin resolver
    ];
    for (const key of forbidden) {
      expect(exportedKeys).not.toContain(key);
    }
  });

  it("USER_COOKIE is the canonical 'heavix-user' cookie (not a legacy admin cookie)", () => {
    expect(authModule.USER_COOKIE).toBe("heavix-user");
  });

  it("does not import or reference the legacy AdminSession model", async () => {
    // Read the auth.ts source to ensure no legacy admin path remains.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/auth.ts"),
      "utf8",
    );
    // Legacy symbols that must not appear in the canonical auth module.
    expect(src).not.toMatch(/ADMIN_COOKIE/);
    expect(src).not.toMatch(/validateLogin/);
    expect(src).not.toMatch(/ADMIN_CREDENTIALS/);
    expect(src).not.toMatch(/adminSession/i);
    expect(src).not.toMatch(/id:\s*["']ADMIN["']/);
  });

  it("canonical session functions are async (DB-backed, not synthetic)", () => {
    expect(typeof authModule.createUserSession).toBe("function");
    expect(authModule.createUserSession.constructor.name).toBe("AsyncFunction");
    expect(typeof authModule.destroyUserSession).toBe("function");
    expect(authModule.destroyUserSession.constructor.name).toBe("AsyncFunction");
    expect(typeof authModule.getCurrentUser).toBe("function");
    expect(authModule.getCurrentUser.constructor.name).toBe("AsyncFunction");
    expect(typeof authModule.isAuthenticated).toBe("function");
    expect(authModule.isAuthenticated.constructor.name).toBe("AsyncFunction");
  });
});

describe("password hash/verify cycle (user auth path)", () => {
  it("round-trips a typical user password", async () => {
    const pw = "MyP@ssword123";
    const hash = await hashPassword(pw);
    // Hash is bcrypt format.
    expect(hash.startsWith("$2")).toBe(true);
    // Verify accepts the original password.
    expect(await verifyPassword(pw, hash)).toBe(true);
    // Verify rejects a near-miss.
    expect(await verifyPassword(`${pw}!`, hash)).toBe(false);
  });

  it("produces independent hashes for different users (unique salts)", async () => {
    const pw = "shared-password";
    const h1 = await hashPassword(pw);
    const h2 = await hashPassword(pw);
    // The two hashes must differ — proves the salt is random per call.
    expect(h1).not.toBe(h2);
    // But both must verify against the original password.
    expect(await verifyPassword(pw, h1)).toBe(true);
    expect(await verifyPassword(pw, h2)).toBe(true);
  });
});

/* ============================================================
   ❗ SPEC ONLY — NOT RUNNABLE WITHOUT A TEST DB ❗
   ------------------------------------------------------------
   The blocks below document the integration test plan for the
   register → verify-email → login → logout flow. They are
   skipped because they need:
     1. A dedicated test SQLite DB (e.g. file:test.db) OR a
        Postgres test schema, isolated from the dev DB.
     2. vi.mock("next/headers", ...) to stub `cookies()` so
        createSession / destroySession can be observed.
     3. A seeded RBAC environment (5 roles, 20 permissions) so
        isAdmin() resolves correctly for the test admin user.

   See tests/README.md for the full plan.
   ============================================================ */

describe.skip("SPEC: register → verify-email → login flow", () => {
  it("registers a new BUYER (never ADMIN), sets verificationDeadline = +7d", async () => {
    // 1. POST /api/auth/register with { firstName, lastName, email,
    //    mobile, password, userType } — body.role MUST be ignored
    //    and forced to "BUYER" (HEAVIX Principle 4 + P0-2).
    // 2. Verify User row exists with role="BUYER", emailVerified=false,
    //    verificationDeadline ≈ now + 7d, passwordHash startsWith "$2".
    // 3. Verify the password is NOT stored in plaintext — i.e. the
    //    raw password string is NOT present in the DB.
    // 4. Verify a Session row was created and a HttpOnly cookie set.
    // 5. Verify a VerificationCode row was created.
  });

  it("rejects public registration with role=ADMIN in the body", async () => {
    // 1. POST /api/auth/register with body.role = "ADMIN".
    // 2. Verify the resulting User has role="BUYER" (not ADMIN).
    // 3. Verify an AuditLog entry was written for the attempt
    //    (action="user.register.role_ignored" or similar).
  });

  it("verifies email with the correct code and flips emailVerified=true", async () => {
    // 1. Register → grab VerificationCode from DB.
    // 2. POST /api/auth/verify-email with { email, code }.
    // 3. Verify User.emailVerified is now true and
    //    VerificationCode row is consumed/deleted.
  });

  it("login throttles after 10 failed attempts (rate-limit preset LOGIN)", async () => {
    // 1. Hit POST /api/auth/login 10 times with a wrong password.
    // 2. The 11th attempt MUST return 429 with a Retry-After header.
    // 3. After the window elapses, login must work again.
  });

  it("logout destroys the Session row + clears the cookie", async () => {
    // 1. Login → grab the session token from the cookie.
    // 2. POST /api/auth/logout.
    // 3. Verify Session row for that token is gone.
    // 4. Verify the cookie is cleared (Set-Cookie with Max-Age=0).
  });
});

describe.skip("SPEC: admin session lifecycle (P0-3)", () => {
  it("createSession mints a 32-byte CSPRNG token and persists only its SHA-256 hash", async () => {
    // 1. Call createSession().
    // 2. Read the cookie value (the raw token) — must be base64url,
    //    ~43 chars.
    // 3. Query AdminSession table — the tokenHash column must
    //    equal sha256(rawToken). The rawToken MUST NOT appear
    //    anywhere in the DB.
    // 4. Cookie must have HttpOnly + SameSite=Lax (+ Secure in prod).
  });

  it("isAuthenticated returns false for an expired session", async () => {
    // 1. Create a session, manually set its expiresAt to now-1s.
    // 2. isAuthenticated() must return false AND prune the row.
  });

  it("destroySession deletes the AdminSession row → immediate revocation", async () => {
    // 1. createSession() → isAuthenticated() returns true.
    // 2. destroySession() → isAuthenticated() returns false,
    //    AdminSession row is gone.
  });
});
