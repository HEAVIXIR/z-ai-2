import { cookies } from "next/headers";
import crypto from "node:crypto";
import { db } from "@/lib/db";

/* ============================================================
   HEAVIX auth — cookie-based sessions for admin + users.

   Security Baseline:
   - Admin credentials are read ONLY from environment variables.
   - Missing admin credentials fail closed; there are NO fallback
     credentials in source code.
   - Admin sessions use a 32-byte CSPRNG token.
   - ONLY the SHA-256 token hash is persisted in AdminSession.
   - The raw token is stored only in an HttpOnly cookie.
   - Admin sessions are rejected when expired/revoked.
   - destroySession() immediately revokes the current session.
   - User sessions continue to use the server-side Session table.
   ============================================================ */

export const ADMIN_COOKIE = "heavix-admin";
export const USER_COOKIE = "heavix-user";

/** Admin session lifetime: 24 hours (in seconds). */
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24;
/** User session lifetime: 7 days (in seconds). */
const USER_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function getAdminCredentials(): { username: string; password: string; } {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Admin authentication is not configured: ADMIN_USERNAME and ADMIN_PASSWORD are required."
    );
  }

  return { username, password, };
}

/**
 * Constant-time admin credential check.
 *
 * Admin credentials are read only from environment variables.
 * There are intentionally no hardcoded fallback credentials.
 *
 * NOTE:
 * This is the PRIMARY authenticator only — on success it issues a
 * cryptographically secure session token (see createSession()).
 * The password itself is NEVER put in a cookie.
 */
export function validateLogin(username: string, password: string): boolean {
  try {
    const credentials = getAdminCredentials();

    const a = Buffer.from(String(username));
    const b = Buffer.from(credentials.username);
    const c = Buffer.from(String(password));
    const d = Buffer.from(credentials.password);

    // timingSafeEqual requires buffers of equal length.
    if (a.length !== b.length || c.length !== d.length) {
      return false;
    }

    return (
      crypto.timingSafeEqual(a, b) &&
      crypto.timingSafeEqual(c, d)
    );
  } catch {
    // Fail closed when authentication is not configured or comparison fails.
    return false;
  }
}

/** SHA-256 hex of a token — what we persist in AdminSession.tokenHash. */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const isProd = process.env.NODE_ENV === "production";

/** Server-only: create a cryptographically secure admin session. */
export async function createSession(): Promise<void> {
  const credentials = getAdminCredentials();

  // 32 bytes of CSPRNG entropy → base64url (~43 chars).
  // This raw token is handed to the client only through an HttpOnly cookie.
  // We never persist the raw token.
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const now = Date.now();
  const nowDate = new Date(now);
  const expiresAt = new Date(now + ADMIN_SESSION_MAX_AGE * 1000);

  /*
   * Best-effort cleanup of expired sessions on each new login so the
   * table doesn't grow without bound. Failure here is non-fatal.
   */
  try {
    await db.adminSession.deleteMany({
      where: {
        expiresAt: {
          lt: nowDate,
        },
      },
    });
  } catch {
    /* ignore */
  }

  /*
   * Keep one active admin session per configured admin username.
   *
   * This prevents repeated successful logins from accumulating
   * indefinitely active admin sessions. The current login receives
   * a fresh token immediately afterward.
   */
  try {
    await db.adminSession.deleteMany({
      where: {
        username: credentials.username,
      },
    });
  } catch {
    /*
     * Do not silently continue if duplicate-session cleanup fails.
     *
     * If the database cannot revoke previous admin sessions, creating
     * another privileged session would weaken the intended security
     * invariant. Fail closed instead.
     */
    throw new Error("Unable to revoke previous admin sessions.");
  }

  await db.adminSession.create({
    data: {
      tokenHash,
      username: credentials.username,
      expiresAt,
    },
  });

  const store = await cookies();
  store.set(ADMIN_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });
}

/** Server-only: revoke the current admin session (delete the DB row). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const rawToken = store.get(ADMIN_COOKIE)?.value;

  if (rawToken) {
    try {
      const tokenHash = hashToken(rawToken);
      await db.adminSession.deleteMany({
        where: {
          tokenHash,
        },
      });
    } catch {
      /* ignore */
    }
  }

  store.delete(ADMIN_COOKIE);
}

/**
 * Server-only: check if the current request carries a valid,
 * non-expired admin session.
 *
 * Hashes the incoming cookie and looks it up in AdminSession.
 * Expired rows are pruned on read.
 */
export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const rawToken = store.get(ADMIN_COOKIE)?.value;

  if (!rawToken) {
    return false;
  }

  try {
    const tokenHash = hashToken(rawToken);
    const session = await db.adminSession.findUnique({
      where: {
        tokenHash,
      },
    });

    if (!session) {
      return false;
    }

    if (session.expiresAt.getTime() < Date.now()) {
      // Prune expired session on read.
      await db.adminSession
        .delete({
          where: {
            id: session.id,
          },
        })
        .catch(() => {});

      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/* ── User sessions (cookie-based, server-side Session table) ── */

export async function createUserSession(userId: string): Promise<void> {
  /*
   * 32 bytes of CSPRNG entropy for user sessions too.
   *
   * The Session table stores the raw token in `token @unique`;
   * we preserve that existing contract while strengthening token
   * entropy.
   */
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + USER_SESSION_MAX_AGE * 1000
  );

  await db.session.create({
    data: {
      userId,
      token: rawToken,
      expiresAt,
    },
  });

  const store = await cookies();
  store.set(USER_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: USER_SESSION_MAX_AGE,
    path: "/",
  });
}

export async function destroyUserSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(USER_COOKIE)?.value;

  if (token) {
    try {
      await db.session.deleteMany({
        where: {
          token,
        },
      });
    } catch {
      /* ignore */
    }
  }

  store.delete(USER_COOKIE);
}

/** Returns the current User record if the user cookie is a valid session. */
export async function getCurrentUser() {
  const store = await cookies();

  // 1. Try user session (heavix-user cookie → Session table)
  const token = store.get(USER_COOKIE)?.value;

  if (token) {
    try {
      const session = await db.session.findUnique({
        where: {
          token,
        },
        include: {
          user: true,
        },
      });

      if (session) {
        if (session.expiresAt.getTime() < Date.now()) {
          await db.session
            .delete({
              where: {
                id: session.id,
              },
            })
            .catch(() => {});
        } else if (session.user.status === "BLOCKED") {
          // Revoke the session immediately — BLOCKED users must not
          // retain access even if their session was created before the
          // block was applied.
          await db.session
            .delete({
              where: {
                id: session.id,
              },
            })
            .catch(() => {});
        } else {
          return session.user;
        }
      }
    } catch {
      /* fall through to admin check */
    }
  }

  // 2. Fall back to admin session
  // (heavix-admin cookie → AdminSession table)
  //
  // E2E-06 GAP FIX:
  // admin login sets heavix-admin, but getCurrentUser() previously
  // only checked heavix-user. This keeps admin login aligned with
  // getCurrentUser().
  const adminToken = store.get(ADMIN_COOKIE)?.value;

  if (adminToken) {
    try {
      const tokenHash = hashToken(adminToken);
      const adminSession = await db.adminSession.findUnique({
        where: {
          tokenHash,
        },
      });

      if (adminSession) {
        if (adminSession.expiresAt.getTime() < Date.now()) {
          await db.adminSession
            .delete({
              where: {
                id: adminSession.id,
              },
            })
            .catch(() => {});
        } else {
          /*
           * Admin sessions are not linked to a User record.
           *
           * Return a synthetic admin user whose id 'ADMIN' is recognized
           * by authorization logic as having all permissions.
           */
          return {
            id: "ADMIN",
            firstName: "Admin",
          } as any;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const u = await getCurrentUser();
  return u?.id ?? null;
}
