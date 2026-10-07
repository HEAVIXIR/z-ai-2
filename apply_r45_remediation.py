
#!/usr/bin/env python3
from pathlib import Path
import re, sys

ROOT = Path.cwd()

def read(rel):
    p = ROOT / rel
    if not p.exists():
        raise SystemExit(f"ABORT: missing file: {rel}")
    return p.read_text(encoding="utf-8")

def write(rel, content):
    (ROOT / rel).write_text(content, encoding="utf-8")

def require(s, needle, label):
    if needle not in s:
        raise SystemExit(f"ABORT: required anchor missing: {label}")

def replace_once(s, old, new, label):
    require(s, old, label)
    if s.count(old) != 1:
        raise SystemExit(f"ABORT: expected one match for {label}; got {s.count(old)}")
    return s.replace(old, new, 1)

# 1) Canonical auth.ts
auth = read("src/lib/auth.ts")
require(auth, 'export const USER_COOKIE = "heavix-user";', "USER_COOKIE")
require(auth, "export async function createUserSession", "createUserSession")
require(auth, "export async function destroyUserSession", "destroyUserSession")
require(auth, "export async function getCurrentUser()", "getCurrentUser")

write("src/lib/auth.ts", r'''import { cookies } from "next/headers";
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
 * No AdminSession, ADMIN_COOKIE, synthetic ADMIN identity, or
 * credential-pair fallback exists in this path.
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
''')

# 2) Canonical login route
write("src/app/api/auth/login/route.ts", r'''import { NextResponse } from "next/server";
import { createUserSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { isAdmin } from "@/lib/authorization";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { LOGIN } from "@/lib/rate-limit-presets";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit({
      key: rateLimitKey(ip, LOGIN.label),
      limit: LOGIN.limit,
      windowMs: LOGIN.windowMs,
    });

    if (!rl.ok) {
      return NextResponse.json(
        { error: "درخواست بیش از حد. بعداً تلاش کنید.", retryAfter: retryAfterSeconds(rl.resetAt) },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { password, mobile, email } = body ?? {};

    if (!password) return NextResponse.json({ error: "رمز عبور الزامی است" }, { status: 400 });
    if (!mobile && !email) {
      return NextResponse.json({ error: "شماره موبایل یا ایمیل الزامی است" }, { status: 400 });
    }

    const user = await db.user.findFirst({
      where: {
        OR: [
          mobile ? { mobile: String(mobile) } : {},
          email ? { email: String(email).toLowerCase() } : {},
        ].filter((c) => Object.keys(c).length > 0),
      },
    });

    if (!user) return NextResponse.json({ error: "کاربر یافت نشد یا رمز نادرست است" }, { status: 401 });

    const passwordValid = await verifyPassword(String(password), user.passwordHash);
    if (!passwordValid) return NextResponse.json({ error: "کاربر یافت نشد یا رمز نادرست است" }, { status: 401 });

    if (user.status === "BLOCKED") {
      return NextResponse.json({ error: "حساب کاربری شما مسدود شده است" }, { status: 403 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await createUserSession(user.id);

    const admin = await isAdmin(user.id);
    const userRoles = await db.userRole.findMany({
      where: { userId: user.id },
      select: { role: { select: { key: true } } },
    });
    const roles = userRoles.map((r) => r.role.key);
    const role = admin ? "admin" : (roles[0] ?? "BUYER");

    return NextResponse.json({
      ok: true,
      role,
      roles,
      user: {
        id: user.id, firstName: user.firstName, lastName: user.lastName,
        mobile: user.mobile, email: user.email, userType: user.userType,
        role, roles, status: user.status,
        emailVerified: user.emailVerified, mobileVerified: user.mobileVerified,
      },
    });
  } catch (err: any) {
    trackError(err, { endpoint: "POST /api/auth/login" });
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
''')

# 3) Server action
write("src/app/login/actions.ts", r'''"use server";

import { redirect } from "next/navigation";
import { createUserSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { isAdmin } from "@/lib/authorization";

export async function loginAction(formData: FormData): Promise<void> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) redirect("/login?error=1");

  const user = await db.user.findFirst({
    where: { OR: [{ email: identifier.toLowerCase() }, { mobile: identifier }] },
  });
  if (!user || user.status === "BLOCKED") redirect("/login?error=1");

  if (!(await verifyPassword(password, user.passwordHash))) redirect("/login?error=1");

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createUserSession(user.id);
  redirect((await isAdmin(user.id)) ? "/admin/dashboard" : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  const { destroyUserSession } = await import("@/lib/auth");
  await destroyUserSession();
  redirect("/login");
}
''')

# 4) Login UI
write("src/app/login/LoginForm.tsx", r''' "use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function kind(v: string): "email" | "mobile" {
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return "email";
  return "mobile";
}

export default function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    sp.get("error") === "1" ? "ایمیل/موبایل یا رمز عبور اشتباه است." : null,
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(null);
    const formData = new FormData(e.currentTarget);
    const identifier = String(formData.get("identifier") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!identifier || !password) {
      setError("ایمیل/موبایل و رمز عبور الزامی است.");
      setLoading(false); return;
    }

    const k = kind(identifier);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [k]: k === "email" ? identifier.toLowerCase() : identifier, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "ورود ناموفق بود.");
        setLoading(false); return;
      }
      router.push(data.role === "admin" ? "/admin/dashboard" : "/dashboard");
      router.refresh();
    } catch {
      setError("خطای شبکه. دوباره تلاش کنید.");
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#161616] to-[#0c0c0c] p-8">
      <h1 className="text-center text-2xl font-black text-white">ورود</h1>
      {error && <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm font-bold text-red-400">{error}</div>}
      <div className="mt-6 space-y-4">
        <input name="identifier" type="text" autoComplete="username" placeholder="موبایل / ایمیل"
          className="h-12 w-full rounded-xl border border-white/10 bg-black/50 px-4 text-sm text-white" />
        <input name="password" type="password" autoComplete="current-password" placeholder="••••••••"
          className="h-12 w-full rounded-xl border border-white/10 bg-black/50 px-4 text-sm text-white" />
      </div>
      <button type="submit" disabled={loading} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-[#F58220] text-sm font-bold text-white">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "ورود"}
      </button>
      <p className="mt-5 text-center text-[11px] text-white/35">
        مدیران نیز با حساب کاربری دارای نقش ADMIN در RBAC وارد می‌شوند.
      </p>
    </form>
  );
}
'''.lstrip())

# 5) Middleware
write("src/middleware.ts", r'''import { NextResponse, type NextRequest } from "next/server";

const USER_COOKIE_NAME = "heavix-user";
const ADMIN_PAGE_PREFIX = "/admin";
const ADMIN_API_PREFIX = "/api/admin";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminPage = pathname === ADMIN_PAGE_PREFIX || pathname.startsWith(`${ADMIN_PAGE_PREFIX}/`);
  const isAdminApi = pathname.startsWith(`${ADMIN_API_PREFIX}/`);

  if (!isAdminPage && !isAdminApi) return NextResponse.next();
  if (pathname.endsWith("/health")) return NextResponse.next();

  const userCookie = req.cookies.get(USER_COOKIE_NAME)?.value;
  if (userCookie && userCookie.length > 0) return NextResponse.next();

  if (isAdminApi) {
    return NextResponse.json(
      { error: "Unauthorized", message: "User authentication required." },
      { status: 401 },
    );
  }

  const loginUrl = req.nextUrl.clone();
  const redirectTo = pathname + (req.nextUrl.search ?? "");
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("redirect", redirectTo);
  return NextResponse.redirect(loginUrl, 307);
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
''')

# 6) Admin guard: remove legacy cookie branch from authorizeAdmin.
guard = read("src/lib/admin-guard.ts")
guard = guard.replace('import { isAuthenticated, getCurrentUser } from "@/lib/auth";',
                      'import { getCurrentUser } from "@/lib/auth";')
guard = re.sub(
    r'/\*\*\n \* Shared authorizeAdmin\(\).*?\nexport async function authorizeAdmin\(\): Promise<boolean> \{\n.*?\n\}',
    '''/**
 * Shared authorizeAdmin helper — canonical user-session + RBAC path only.
 */
export async function authorizeAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  return isAdmin(user.id);
}''',
    guard, count=1, flags=re.S)
write("src/lib/admin-guard.ts", guard)

# 7) Authorization: remove sentinel and make lookups fail closed.
authz = read("src/lib/authorization/index.ts")
authz = re.sub(r'\n\s*// E2E-06 GAP FIX: admin sessions return id=\'ADMIN\' from getCurrentUser\(\)\.\n\s*// Admin has all permissions.*?\n\s*if \(userId === \'ADMIN\'\) return true;', '', authz, count=1, flags=re.S)
authz = re.sub(r'\n\s*// The server-issued admin session uses the synthetic ADMIN id\.\n\s*if \(userId === \'ADMIN\'\) return true;', '', authz, count=1)
authz = re.sub(r'\n\s*// The server-issued admin session has unrestricted permissions\.\n\s*if \(userId === \'ADMIN\'\) return true;', '', authz, count=1)
authz = re.sub(r'\n\s*// Admin cookie sessions resolve to the synthetic ADMIN id\.\n\s*if \(userId === \'ADMIN\'\) return true;', '', authz, count=1)

authz = re.sub(
    r'export async function can\(\n.*?\n\}\n\n// ── canAny',
    '''export async function can(
  userId: string | null | undefined,
  permission: string,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const perms = await getUserPermissions(userId);
    return perms.includes(permission);
  } catch {
    return false;
  }
}

// ── canAny''',
    authz, count=1, flags=re.S)

authz = re.sub(
    r'export async function canAny\(\n.*?\n\}\n\n// ── canAll',
    '''export async function canAny(
  userId: string | null | undefined,
  permissions: string[],
): Promise<boolean> {
  if (!userId || permissions.length === 0) return false;
  try {
    const perms = await getUserPermissions(userId);
    return permissions.some((p) => perms.includes(p));
  } catch {
    return false;
  }
}

// ── canAll''',
    authz, count=1, flags=re.S)

authz = re.sub(
    r'export async function canAll\(\n.*?\n\}\n\n// ── requirePermission',
    '''export async function canAll(
  userId: string | null | undefined,
  permissions: string[],
): Promise<boolean> {
  if (!userId) return false;
  try {
    const perms = await getUserPermissions(userId);
    return permissions.every((p) => perms.includes(p));
  } catch {
    return false;
  }
}

// ── requirePermission''',
    authz, count=1, flags=re.S)
write("src/lib/authorization/index.ts", authz)

# 8) AI policy: remove legacy User.role fallback.
ai = read("src/lib/ai-policy.ts")
ai = re.sub(
    r'\n\s*// Fall back to the legacy User\.role column.*?\n\s*\} catch \{\n\s*return false;\n\s*\}',
    '',
    ai, count=1, flags=re.S)
ai = ai.replace('const actorId = user?.id ?? "admin";', 'const actorId = user?.id ?? "anonymous";')
write("src/lib/ai-policy.ts", ai)

# 9) Seller registration: canonical UserRole membership.
seller = read("src/lib/seller-service.ts")
old = '''  // ── 1. Update User.role → SELLER (+ optional companyId link) ──
  const userData: { role: string; companyId?: string | null } = {
    role: "SELLER",
  };
  if (companyId) userData.companyId = companyId;

  const updatedUser = await db.user.update({
    where: { id: userId },
    data: userData,
    select: { id: true, role: true, companyId: true },
  });

  // ── 2. Upsert FoundingSeller in PENDING state (active=false) ──'''
new = '''  // ── 1. Assign canonical SELLER UserRole (+ optional companyId link) ──
  const sellerRole = await db.role.findUnique({
    where: { key: "SELLER" },
    select: { id: true },
  });
  if (!sellerRole) {
    throw new SellerServiceError(500, "نقش SELLER در RBAC تعریف نشده است");
  }

  const updatedUser = await db.user.update({
    where: { id: userId },
    data: companyId ? { companyId } : {},
    select: { id: companyId ? true : true, companyId: true },
  });

  await db.userRole.upsert({
    where: { userId_roleId: { userId, roleId: sellerRole.id } },
    create: { userId, roleId: sellerRole.id },
    update: {},
  });

  // ── 2. Upsert FoundingSeller in PENDING state (active=false) ──'''
if old not in seller:
    raise SystemExit("ABORT: seller role mutation block not found exactly")
seller = seller.replace(old, new, 1)
seller = seller.replace('    role: updatedUser.role,', '    role: "SELLER",')
write("src/lib/seller-service.ts", seller)

# 10) Regression test.
write("tests/contract/r45-canonical-auth-contract.test.ts", r'''import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("R45 canonical authentication contract", () => {
  it("uses only USER_COOKIE -> Session -> User", () => {
    const s = read("src/lib/auth.ts");
    expect(s).toContain('USER_COOKIE = "heavix-user"');
    expect(s).toContain("db.session.findUnique");
    expect(s).toContain("include: { user: true }");
    expect(s).not.toContain("ADMIN_COOKIE");
    expect(s).not.toContain("AdminSession");
    expect(s).not.toContain('id: "ADMIN"');
  });

  it("removes admin credential authentication from login route", () => {
    const s = read("src/app/api/auth/login/route.ts");
    expect(s).toContain("createUserSession");
    expect(s).not.toContain("validateLogin");
    expect(s).not.toContain("createSession");
    expect(s).not.toContain("ADMIN_USERNAME");
    expect(s).not.toMatch(/\busername\b/);
  });

  it("removes the ADMIN sentinel bypass", () => {
    const s = read("src/lib/authorization/index.ts");
    expect(s).not.toMatch(/userId\s*===\s*["']ADMIN["']/);
  });

  it("uses USER_COOKIE at the edge", () => {
    const s = read("src/middleware.ts");
    expect(s).toContain('USER_COOKIE_NAME = "heavix-user"');
    expect(s).not.toContain("heavix-admin");
  });

  it("does not authorize AI through User.role fallback", () => {
    const s = read("src/lib/ai-policy.ts");
    expect(s).not.toMatch(/user\.role/);
    expect(s).not.toContain("select: { role: true }");
  });

  it("registerSeller assigns canonical SELLER UserRole", () => {
    const s = read("src/lib/seller-service.ts");
    expect(s).toContain('where: { key: "SELLER" }');
    expect(s).toContain("db.userRole.upsert");
    expect(s).not.toContain('role: "SELLER"');
  });
});
''')

print("R45 remediation files written.")
print("Next: inspect `git diff --check`, run TypeScript/lint/tests/build, and commit only after all gates pass.")
