import { cookies } from "next/headers";
import crypto from "node:crypto";
import { db } from "@/lib/db";

export const USER_COOKIE = "heavix-user";
const USER_SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const isProd = process.env.NODE_ENV === "production";

export async function createUserSession(userId: string): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + USER_SESSION_MAX_AGE * 1000);

  await db.session.create({
    data: { userId, token: rawToken, expiresAt },
  });

  const store = await cookies();
  store.set(USER_COOKIE, rawToken, {
    httpOnly: true, sameSite: "lax", secure: isProd,
    maxAge: USER_SESSION_MAX_AGE, path: "/",
  });
}

export async function destroyUserSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(USER_COOKIE)?.value;
  if (token) {
    try { await db.session.deleteMany({ where: { token } }); }
    catch { /* cookie is still cleared; server auth remains fail-closed */ }
  }
  store.delete(USER_COOKIE);
}

/**
 * Canonical identity contract:
 * USER_COOKIE -> Session.token -> Session.userId -> User.
 * No legacy admin cookie, legacy admin session table, synthetic
 * ADMIN identity, or credential-pair fallback exists in this path.
 */
export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(USER_COOKIE)?.value;
  if (!token) return null;

  try {
    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session) return null;

    if (session.expiresAt.getTime() < Date.now()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    if (session.user.status === "BLOCKED") {
      await db.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    return session.user;
  } catch {
    return null;
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

// ─────────────────────────────────────────────────────────────
// Backward-compat wrappers — delegate to the canonical user-session path.
//
// These exist so that the 30+ admin/api routes that still call
// `isAuthenticated()` / `destroySession()` keep compiling after R45-16
// removed the legacy admin-session-backed implementations. They MUST NOT
// be re-implemented as independent admin paths — they are pure aliases.
//
// Contract:
//   isAuthenticated() === (await getCurrentUser()) !== null
//   destroySession()  === destroyUserSession()
// ─────────────────────────────────────────────────────────────
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null;
}

export async function destroySession(): Promise<void> {
  await destroyUserSession();
}
