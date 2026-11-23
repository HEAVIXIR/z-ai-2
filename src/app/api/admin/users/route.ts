import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { hashPassword } from "@/lib/password";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/users — admin user management.

   GET  (admin)  → list users with filters + counts
   POST (admin)  → create a new user (admin-created)
   ============================================================ */

const MAX_ADMIN_USER_BODY_BYTES = 16 * 1024;

async function readBoundedAdminUserBody(req: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ADMIN_USER_BODY_BYTES) return null;
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ADMIN_USER_BODY_BYTES) {
      try { await reader.cancel(); } catch { /* request already closed */ }
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function serialize(u: any) {
  return {
    ...u,
    passwordHash: undefined, // never leak
    listingsCount: u._count?.listings ?? 0,
    offersCount: u._count?.offers ?? 0,
    requestsCount: u._count?.requests ?? 0,
    _count: undefined,
  };
}

/* GET /api/admin/users?q=&role=&status=&emailVerified=&sort=&limit=&offset= */
export async function GET(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "user.read"))) {
    return NextResponse.json(
      { error: "Forbidden: missing permission 'user.read'" },
      { status: 403 },
    );
  }
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const role = (url.searchParams.get("role") ?? "").trim();
    const status = (url.searchParams.get("status") ?? "").trim();
    const emailVerified = url.searchParams.get("emailVerified");
    const mobileVerified = url.searchParams.get("mobileVerified");
    const sort = url.searchParams.get("sort") ?? "createdAt";
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    const where: any = {};
    if (q) {
      where.OR = [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { email: { contains: q } },
        { mobile: { contains: q } },
        { companyName: { contains: q } },
      ];
    }
    if (role) where.userType = role.toUpperCase();
    if (status) where.status = status.toUpperCase();
    if (emailVerified === "true") where.emailVerified = true;
    if (emailVerified === "false") where.emailVerified = false;
    if (mobileVerified === "true") where.mobileVerified = true;
    if (mobileVerified === "false") where.mobileVerified = false;

    const orderBy: any =
      sort === "name"
        ? [{ firstName: "asc" }, { lastName: "asc" }]
        : sort === "lastLoginAt"
          ? { lastLoginAt: "desc" }
          : sort === "listings"
            ? { listings: { _count: "desc" } }
            : { createdAt: "desc" };

    // SQLite doesn't support relation-based orderBy sugar for some operations;
    // if "listings" sort was requested, fall back to in-memory sort.
    let users: any[];
    let total: number;
    if (sort === "listings") {
      total = await db.user.count({ where });
      users = await db.user.findMany({
        where,
        include: {
          _count: { select: { listings: true, offers: true, requests: true } },
        },
        take: 1000, // fetch then sort in-memory
      });
      users.sort(
        (a, b) =>
          (b._count?.listings ?? 0) - (a._count?.listings ?? 0) ||
          a.firstName.localeCompare(b.firstName, "fa"),
      );
      users = users.slice(offset, offset + limit);
    } else {
      [users, total] = await Promise.all([
        db.user.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
          include: {
            _count: { select: { listings: true, offers: true, requests: true } },
          },
        }),
        db.user.count({ where }),
      ]);
    }

    return NextResponse.json({
      success: true,
      total,
      data: users.map(serialize),
    });
  } catch (err: any) {
    console.error("[admin/users] request failed:", err);
    return NextResponse.json({ error: "Unable to process user request" }, { status: 500 });
  }
}

/* POST /api/admin/users — admin creates a user.
   (P0-RBAC: requires user.suspend — covers role/status lifecycle operations) */
export async function POST(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "user.suspend"))) {
    return NextResponse.json(
      { error: "Forbidden: missing permission 'user.suspend'" },
      { status: 403 },
    );
  }
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  const contentType = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  try {
    const body = await readBoundedAdminUserBody(req);
    if (!body) return NextResponse.json({ error: "Invalid or oversized request body" }, { status: 400 });
    const allowedFields = new Set([
      "firstName", "lastName", "email", "mobile", "password", "role",
      "userType", "status", "companyName", "emailVerified", "mobileVerified",
    ]);
    if (Object.keys(body).some((key) => !allowedFields.has(key))) {
      return NextResponse.json({ error: "Unknown request field" }, { status: 400 });
    }
    if (["firstName", "lastName", "email", "mobile", "password"].some((key) => body[key] !== undefined && typeof body[key] !== "string")) {
      return NextResponse.json({ error: "Invalid user fields" }, { status: 400 });
    }
    if (body.companyName !== undefined && body.companyName !== null && typeof body.companyName !== "string") {
      return NextResponse.json({ error: "Invalid companyName" }, { status: 400 });
    }
    if (body.emailVerified !== undefined && typeof body.emailVerified !== "boolean") {
      return NextResponse.json({ error: "Invalid emailVerified" }, { status: 400 });
    }
    if (body.mobileVerified !== undefined && typeof body.mobileVerified !== "boolean") {
      return NextResponse.json({ error: "Invalid mobileVerified" }, { status: 400 });
    }
    if (body.role !== undefined && typeof body.role !== "string") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (body.userType !== undefined && typeof body.userType !== "string") {
      return NextResponse.json({ error: "Invalid userType" }, { status: 400 });
    }
    if (body.status !== undefined && typeof body.status !== "string") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const mobile = String(body.mobile ?? "").trim();
    const password = String(body.password ?? "").trim();

    if (!firstName || !lastName || !email || !mobile || firstName.length > 100 || lastName.length > 100 || email.length > 254 || mobile.length > 32 || password.length > 128) {
      return NextResponse.json(
        { error: "نام، نام خانوادگی، ایمیل و موبایل الزامی هستند" },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "رمز عبور باید حداقل ۶ نویسه باشد" },
        { status: 400 },
      );
    }

    // Uniqueness check
    const existing = await db.user.findFirst({
      where: { OR: [{ email }, { mobile }] },
    });
    if (existing) {
      return NextResponse.json(
        { error: "ایمیل یا موبایل قبلاً ثبت شده است" },
        { status: 409 },
      );
    }

    // Store new passwords using the shared Worker-compatible PBKDF2 format.
    const passwordHash = await hashPassword(password);

    // P0-2: admin CAN set the role (admin-gated endpoint). Validate it
    // against the allowed enum; default to BUYER. Public registration does
    // NOT get this privilege.
    const allowedRoles = ["ADMIN", "SELLER", "BUYER"];
    const requestedRole = body.role === undefined ? "BUYER" : String(body.role).toUpperCase();
    if (!allowedRoles.includes(requestedRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const role = requestedRole;

    // ── STEP 15.40 Phase B (REVISION-1, W3): Transactional dual-write ──
    // Admin-created users MUST get a canonical UserRole row from day 1
    // alongside the legacy User.role column. Wrap both writes in a single
    // $transaction so neither partial state can persist on failure.
    // Role row is resolved BEFORE the transaction (fail-fast on missing catalog).
    const roleRow = await db.role.findUnique({
      where: { key: role },
      select: { id: true },
    });
    if (!roleRow) {
      return NextResponse.json(
        { error: `Role '${role}' not found in RBAC catalog` },
        { status: 500 },
      );
    }

    const user = await db.$transaction(async (tx) => {
      // 1. Create the User row (legacy `role` column populated)
      const u = await tx.user.create({
        data: {
          firstName,
          lastName,
          email,
          mobile,
          passwordHash,
          userType: String(body.userType ?? "INDIVIDUAL").toUpperCase(),
          role,
          status: String(body.status ?? "ACTIVE").toUpperCase(),
          companyName: body.companyName ? String(body.companyName) : null,
          emailVerified: Boolean(body.emailVerified),
          mobileVerified: Boolean(body.mobileVerified),
        },
        include: {
          _count: { select: { listings: true, offers: true, requests: true } },
        },
      });

      // 2. Create the canonical UserRole row (idempotent via @@unique).
      //    upsert guards against the (extremely unlikely) case where a
      //    UserRole row for this (userId, roleId) pair already exists.
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: u.id, roleId: roleRow.id } },
        create: { userId: u.id, roleId: roleRow.id },
        update: {},
      });

      await tx.auditLog.create({
        data: {
          actorId: sessionUser.id,
          actorType: "ADMIN",
          action: "admin.users.create",
          entityType: "User",
          entityId: u.id,
          afterJson: JSON.stringify({
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            mobile: u.mobile,
            role: u.role,
            status: u.status,
            companyName: u.companyName,
          }),
          reason: "via admin API",
        },
      });
      return u;
    });

    return NextResponse.json({ success: true, data: serialize(user) });
  } catch (err: any) {
    console.error("[admin/users POST] failed:", err);
    return NextResponse.json({ error: "Unable to create user" }, { status: 500 });
  }
}
