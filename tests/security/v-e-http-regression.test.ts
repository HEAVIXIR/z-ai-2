import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import http from "http";

/* ============================================================
   49.2X-17.1 — V-E HTTP Regression Test (Security Branch)
   ------------------------------------------------------------
   Tests the V-E persistence chain end-to-end via real HTTP:
     HTTP request → getCurrentUser → requirePermission → can
     → AUTHZ_DENY → logSecurityEvent → logAudit → headers()
     → db.auditLog.create → AuditLog row persisted

   Route: GET /api/analytics/events (OUTSIDE /api/admin/* middleware)
   Permission: analytics.read
   Subject: authenticated user with NO UserRole (permissions=[])

   NO fake/mock — real HTTP, real Prisma, real audit chain.
   ============================================================ */

const SERVER_PORT = 3000;
const SERVER_CWD = "/home/z/my-project";
const DB_URL = "file:/home/z/my-project/db/custom.db";

let serverProcess: ChildProcess | null = null;
let prisma: PrismaClient;

/** Wait for server readiness by polling GET / */
async function waitForServer(timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://localhost:${SERVER_PORT}/`, {
        signal: AbortSignal.timeout(2000),
      });
      if (resp.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server not ready within ${timeoutMs}ms`);
}

/** Kill the dev server process deterministically */
function killServer(): void {
  if (serverProcess) {
    try {
      serverProcess.kill("SIGTERM");
      // Give it 3 seconds to shut down gracefully
      const start = Date.now();
      while (Date.now() - start < 3000) {
        if (serverProcess.killed) break;
      }
      if (!serverProcess.killed) {
        serverProcess.kill("SIGKILL");
      }
    } catch {
      // process already dead
    }
    serverProcess = null;
  }
  // Also kill any lingering next dev processes
  try {
    const { execSync } = require("child_process");
    execSync('pkill -f "next dev" 2>/dev/null || true', { timeout: 2000 });
  } catch {
    // ignore
  }
}

/** Create a test user with no UserRole (no permissions) */
async function createTestUser(
  prisma: PrismaClient,
  runId: string
): Promise<{ id: string; mobile: string; password: string }> {
  const mobile = `va-test-${runId}`;
  const password = `va-pass-${runId}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      mobile,
      email: `${runId}@va-test.local`,
      firstName: "VA",
      lastName: "Test",
      passwordHash,
      status: "ACTIVE",
      userType: "INDIVIDUAL",
      role: "BUYER",
    },
    select: { id: true, mobile: true },
  });
  return { id: user.id, mobile: user.mobile, password };
}

/** Login via HTTP and return session cookie */
async function loginViaHttp(
  mobile: string,
  password: string
): Promise<string> {
  const resp = await fetch(`http://localhost:${SERVER_PORT}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile, password }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    throw new Error(`Login failed: HTTP ${resp.status}`);
  }
  // Extract heavix-user cookie from Set-Cookie header
  const setCookie = resp.headers.get("set-cookie") || "";
  const match = setCookie.match(/heavix-user=([^;]+)/);
  if (!match) {
    throw new Error("No heavix-user cookie in Set-Cookie header");
  }
  return `heavix-user=${match[1]}`;
}

/** Cleanup test artifacts (user, session, auditlog) */
async function cleanup(prisma: PrismaClient, userId: string): Promise<void> {
  try {
    await prisma.auditLog.deleteMany({ where: { actorId: userId } });
  } catch { /* non-fatal */ }
  try {
    await prisma.session.deleteMany({ where: { userId } });
  } catch { /* non-fatal */ }
  try {
    await prisma.userRole.deleteMany({ where: { userId } });
  } catch { /* non-fatal */ }
  try {
    await prisma.user.deleteMany({ where: { id: userId } });
  } catch { /* non-fatal */ }
}

describe("V-E HTTP Regression — AUTHZ_DENY persistence", () => {
  beforeAll(async () => {
    // Set up Prisma
    process.env.DATABASE_URL = DB_URL;
    prisma = new PrismaClient();

    // Kill any existing server on port 3000
    killServer();
    await new Promise((r) => setTimeout(r, 1000));

    // Spawn canonical dev server (no env var overrides — platform-stable)
    serverProcess = spawn("bun", ["run", "dev"], {
      cwd: SERVER_CWD,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env }, // inherit env (including DATABASE_URL from .env)
      detached: false,
    });

    // Wait for readiness
    await waitForServer(30000);
  }, 60000);

  afterAll(async () => {
    killServer();
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  afterEach(async () => {
    // Cleanup any test artifacts after each test
    if (prisma) {
      try {
        await prisma.auditLog.deleteMany({
          where: { actorId: { contains: "va-test" } },
        });
        await prisma.session.deleteMany({
          where: { user: { mobile: { contains: "va-test" } } },
        });
        await prisma.user.deleteMany({
          where: { mobile: { contains: "va-test" } },
        });
      } catch { /* non-fatal */ }
    }
  });

  it("denies analytics.read for user without permission and persists AUTHZ_DENY", async () => {
    const runId = `17x1-${Date.now()}`;
    const baselineAuditLog = await prisma.auditLog.count();
    const baselineArticle = await prisma.article.count();

    // 1. Create test user (no UserRole → no permissions)
    const testUser = await createTestUser(prisma, runId);
    const userRoleCount = await prisma.userRole.count({
      where: { userId: testUser.id },
    });
    expect(userRoleCount).toBe(0);

    // 2. Login via HTTP → get session cookie
    const cookie = await loginViaHttp(testUser.mobile, testUser.password);

    // 3. GET /api/analytics/events with cookie → expect 403
    const resp = await fetch(
      `http://localhost:${SERVER_PORT}/api/analytics/events`,
      {
        headers: { Cookie: cookie },
        signal: AbortSignal.timeout(10000),
      }
    );
    expect(resp.status).toBe(403);

    // 4. Verify exactly 1 AUTHZ_DENY AuditLog row was persisted
    const afterAuditLog = await prisma.auditLog.count();
    expect(afterAuditLog).toBe(baselineAuditLog + 1);

    const auditRow = await prisma.auditLog.findFirst({
      where: {
        action: "security.authz.deny",
        actorId: testUser.id,
      },
      orderBy: { createdAt: "desc" },
    });

    // 5. Assert all AuditLog fields
    expect(auditRow).not.toBeNull();
    expect(auditRow!.actorId).toBe(testUser.id);
    expect(auditRow!.action).toBe("security.authz.deny");
    expect(auditRow!.entityType).toBe("SecurityEvent");
    expect(auditRow!.reason).toContain("analytics.read");
    expect(auditRow!.createdAt).toBeTruthy();
    // ip and userAgent should be captured (proves real request scope)
    expect(auditRow!.ip).toBeTruthy();
    expect(auditRow!.userAgent).toBeTruthy();

    // 6. Assert no business mutation
    const afterArticle = await prisma.article.count();
    expect(afterArticle).toBe(baselineArticle);

    // 7. Cleanup
    await cleanup(prisma, testUser.id);

    // 8. Verify cleanup
    const finalUserCount = await prisma.user.count({
      where: { mobile: { contains: "va-test" } },
    });
    expect(finalUserCount).toBe(0);
    const finalAuditCount = await prisma.auditLog.count();
    expect(finalAuditCount).toBe(baselineAuditLog);
  });

  it("repeats V-E denial 3 times with independent users (repeatability)", async () => {
    for (let i = 0; i < 3; i++) {
      const runId = `17x1-rep${i}-${Date.now()}`;
      const baselineAuditLog = await prisma.auditLog.count();

      // Create user
      const testUser = await createTestUser(prisma, runId);

      // Login
      const cookie = await loginViaHttp(testUser.mobile, testUser.password);

      // GET analytics → 403
      const resp = await fetch(
        `http://localhost:${SERVER_PORT}/api/analytics/events`,
        {
          headers: { Cookie: cookie },
          signal: AbortSignal.timeout(10000),
        }
      );
      expect(resp.status).toBe(403);

      // Verify AUTHZ_DENY persisted
      const afterAuditLog = await prisma.auditLog.count();
      expect(afterAuditLog).toBe(baselineAuditLog + 1);

      const auditRow = await prisma.auditLog.findFirst({
        where: {
          action: "security.authz.deny",
          actorId: testUser.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(auditRow).not.toBeNull();
      expect(auditRow!.actorId).toBe(testUser.id);
      expect(auditRow!.action).toBe("security.authz.deny");
      expect(auditRow!.reason).toContain("analytics.read");
      expect(auditRow!.ip).toBeTruthy();
      expect(auditRow!.userAgent).toBeTruthy();

      // Cleanup
      await cleanup(prisma, testUser.id);
      const finalAuditCount = await prisma.auditLog.count();
      expect(finalAuditCount).toBe(baselineAuditLog);
    }
  });

  /* ============================================================
     49.2X-17.2 — Positive Control
     ------------------------------------------------------------
     Create a user WITH analytics.read permission → GET should
     succeed (200) and NOT generate AUTHZ_DENY.
     ============================================================ */
  it("positive control: user WITH analytics.read gets 200 and no AUTHZ_DENY", async () => {
    const runId = `17x2-${Date.now()}`;
    const baselineAuditLog = await prisma.auditLog.count();

    // 1. Create test fixture: Permission + Role + RolePermission + User + UserRole
    const permission = await prisma.permission.create({
      data: {
        key: "analytics.read",
        nameFa: "Analytics Read",
        nameEn: "Analytics Read",
        description: "VA-test permission for analytics.read",
        resource: "analytics",
      },
    });

    const role = await prisma.role.create({
      data: {
        key: `VA-TEST-ROLE-${runId}`,
        nameFa: "VA Test Role",
        nameEn: "VA Test Role",
        description: "VA-test role for positive control",
      },
    });

    await prisma.rolePermission.create({
      data: {
        roleId: role.id,
        permissionId: permission.id,
      },
    });

    const mobile = `va-test-${runId}`;
    const password = `va-pass-${runId}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        mobile,
        email: `${runId}@va-test.local`,
        firstName: "VA",
        lastName: "TestPos",
        passwordHash,
        status: "ACTIVE",
        userType: "INDIVIDUAL",
        role: "BUYER",
      },
      select: { id: true, mobile: true },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
      },
    });

    // 2. Verify user has the permission via getUserPermissions
    const userRoles = await prisma.userRole.findMany({
      where: { userId: user.id },
      select: {
        role: {
          select: {
            permissions: {
              select: { permission: { select: { key: true } } },
            },
          },
        },
      },
    });
    const perms: string[] = [];
    for (const ur of userRoles) {
      for (const rp of ur.role.permissions) {
        perms.push(rp.permission.key);
      }
    }
    expect(perms).toContain("analytics.read");

    // 3. Login via HTTP → get session cookie
    const cookie = await loginViaHttp(user.mobile, password);

    // 4. GET /api/analytics/events with cookie → expect 200 (NOT 403)
    const resp = await fetch(
      `http://localhost:${SERVER_PORT}/api/analytics/events`,
      {
        headers: { Cookie: cookie },
        signal: AbortSignal.timeout(10000),
      }
    );

    // 5. Assert request succeeded (200) — NOT denied
    expect(resp.status).toBe(200);

    // 6. Assert NO AUTHZ_DENY was generated for this user
    const afterAuditLog = await prisma.auditLog.count();
    expect(afterAuditLog).toBe(baselineAuditLog); // delta = 0

    const denyRow = await prisma.auditLog.findFirst({
      where: {
        action: "security.authz.deny",
        actorId: user.id,
      },
    });
    expect(denyRow).toBeNull(); // no false denial

    // 7. Verify response contract (success path returns { success, total, data })
    const body = await resp.json();
    expect(body).toHaveProperty("success");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("data");

    // 8. No business mutation (GET is read-only — no new articles/orders/etc.)
    // (analytics events route is read-only — no business record created)

    // 9. Cleanup in FK-safe order
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id },
    });
    await prisma.role.deleteMany({ where: { id: role.id } });
    await prisma.permission.deleteMany({
      where: { key: "analytics.read" },
    });

    // 10. Verify cleanup
    const finalUserCount = await prisma.user.count({
      where: { mobile: { contains: "va-test" } },
    });
    expect(finalUserCount).toBe(0);
    const finalRoleCount = await prisma.role.count({
      where: { key: { contains: "VA-TEST" } },
    });
    expect(finalRoleCount).toBe(0);
    const finalPermCount = await prisma.permission.count({
      where: { key: "analytics.read" },
    });
    expect(finalPermCount).toBe(0);
    const finalAuditCount = await prisma.auditLog.count();
    expect(finalAuditCount).toBe(baselineAuditLog);
  });

  it("positive control repeatability: 2 independent users with analytics.read", async () => {
    for (let i = 0; i < 2; i++) {
      const runId = `17x2-rep${i}-${Date.now()}`;
      const baselineAuditLog = await prisma.auditLog.count();

      // Create fixture: Permission + Role + RolePermission + User + UserRole
      const perm = await prisma.permission.upsert({
        where: { key: "analytics.read" },
        create: {
          key: "analytics.read",
          nameFa: "Analytics Read",
          nameEn: "Analytics Read",
          description: "VA-test",
          resource: "analytics",
        },
        update: {},
      });

      const role = await prisma.role.create({
        data: {
          key: `VA-TEST-ROLE-${runId}`,
          nameFa: "VA Test",
          nameEn: "VA Test",
        },
      });

      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: perm.id },
      });

      const mobile = `va-test-${runId}`;
      const password = `va-pass-${runId}`;
      const ph = await bcrypt.hash(password, 10);
      const u = await prisma.user.create({
        data: {
          mobile,
          email: `${runId}@va-test.local`,
          firstName: "VA",
          lastName: "TestPos",
          passwordHash: ph,
          status: "ACTIVE",
          userType: "INDIVIDUAL",
          role: "BUYER",
        },
        select: { id: true, mobile: true },
      });

      await prisma.userRole.create({
        data: { userId: u.id, roleId: role.id },
      });

      // Login + GET → expect 200
      const cookie = await loginViaHttp(u.mobile, password);
      const resp = await fetch(
        `http://localhost:${SERVER_PORT}/api/analytics/events`,
        {
          headers: { Cookie: cookie },
          signal: AbortSignal.timeout(10000),
        }
      );
      expect(resp.status).toBe(200);

      // No AUTHZ_DENY
      const denyRow = await prisma.auditLog.findFirst({
        where: { action: "security.authz.deny", actorId: u.id },
      });
      expect(denyRow).toBeNull();

      // Cleanup
      await prisma.userRole.deleteMany({ where: { userId: u.id } });
      await prisma.user.deleteMany({ where: { id: u.id } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id },
      });
      await prisma.role.deleteMany({ where: { id: role.id } });
      await prisma.permission.deleteMany({
        where: { key: "analytics.read" },
      });

      const finalAudit = await prisma.auditLog.count();
      expect(finalAudit).toBe(baselineAuditLog);
    }
  });
});
