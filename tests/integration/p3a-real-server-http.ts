/**
 * STEP 13.57 — P3-A Real Next.js HTTP Server Test (NO mocks of next/headers or @/lib/auth)
 * =====================================================================================
 *
 * OWNER DIRECTIVE (STEP 13.56 review 5560494185):
 *   dellk00k: "This is a handler-boundary test with a cookie adapter, not a request
 *   through the real Next.js HTTP server. To fully close the gate, a test from the
 *   real HTTP server or harness of the application must run, without mocking
 *   next/headers or @/lib/auth. At minimum the anonymous request and the valid-session
 *   request must go through the same real path, and the database state before and after
 *   the request must be independently checked."
 *
 * DESIGN:
 *   - NO mocking of @/lib/auth or next/headers. The REAL Next.js runtime is exercised.
 *   - This test spawns a REAL Next.js HTTP server (`next start` on a free port) as a
 *     child process in beforeAll. The server runs the REAL production build (.next/standalone).
 *   - Tests send REAL HTTP requests via `fetch("http://localhost:<port>/api/deals/...", { ... })`
 *     with a real Cookie header. The request flows through Next.js's real HTTP layer →
 *     real cookies() runtime context → real getCurrentUserId() → real Session DB lookup.
 *   - DB state is read before + after each request via independent Prisma queries.
 *
 * PREREQUISITES:
 *   - The project must be built (`bun run build`) before this test runs. In CI, the
 *     "Production build" step runs before this integration test.
 *   - DATABASE_URL must point to a real PostgreSQL instance (same as other integration tests).
 *
 * RUN (CI): bunx vitest run --config vitest.integration.config.ts tests/integration/p3a-real-server-http.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import crypto from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";

const RUN =
  process.env.DATABASE_URL?.startsWith("postgresql://") ||
  process.env.DATABASE_URL?.startsWith("postgres://");

/**
 * finalizeCollecting: runs ops, collects EVERY error without swallowing.
 */
async function finalizeCollecting(ops: Array<() => Promise<unknown>>): Promise<Error[]> {
  const errors: Error[] = [];
  for (const op of ops) {
    try { await op(); } catch (e) { errors.push(e as Error); }
  }
  return errors;
}
function throwCombined(primary: Error | null, finalizeErrors: Error[], label: string): void {
  if (primary && finalizeErrors.length > 0) {
    throw new AggregateError([primary, ...finalizeErrors], `${label}: primary + finalize error(s)`);
  }
  if (finalizeErrors.length > 0) {
    throw new AggregateError(finalizeErrors, `${label}: finalize error(s)`);
  }
  if (primary) throw primary;
}

/** Get a free TCP port by binding to port 0 then closing. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const port = (srv.address() as AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

/** Wait for the Next.js server to be ready (poll the health endpoint). */
async function waitForServer(port: number, timeoutMs = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 404) return; // 404 is fine — server is up, route just doesn't exist
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Next.js server on port ${port} did not become ready within ${timeoutMs}ms`);
}

describe.skipIf(!RUN)("STEP 13.57 P3-A — Real Next.js HTTP server (no mocks)", () => {
  let buyerId: string;
  let sellerId: string;
  let listingId: string;
  let dealId: string;
  let validSessionToken: string;
  let serverProcess: ChildProcess | null = null;
  let serverPort: number;
  let serverBaseUrl: string;

  // STEP 13.57 P3-A: failure-safe beforeAll — track each ID immediately, partial cleanup
  // on setup failure. Both setup + cleanup errors preserved (AggregateError).
  const setupIds: { buyerId?: string; sellerId?: string; listingId?: string; dealId?: string; sessionId?: string } = {};

  beforeAll(async () => {
    let setupError: Error | null = null;
    try {
      const buyer = await db.user.create({
        data: { mobile: "09129992001", email: "p3a-server-buyer@test.com", firstName: "P3S", lastName: "Buyer", passwordHash: "hash" },
      });
      setupIds.buyerId = buyer.id;
      buyerId = buyer.id;
      const seller = await db.user.create({
        data: { mobile: "09129992002", email: "p3a-server-seller@test.com", firstName: "P3S", lastName: "Seller", passwordHash: "hash" },
      });
      setupIds.sellerId = seller.id;
      sellerId = seller.id;
      const listing = await db.listing.create({
        data: { slug: "p3a-server-listing-" + Date.now(), title: "P3S Listing", sellerId, sellerName: "P3S Seller", status: "PUBLISHED", price: 500000000n },
      });
      setupIds.listingId = listing.id;
      listingId = listing.id;
      const deal = await db.deal.create({
        data: {
          dealNumber: "P3S-SRV-" + Date.now().toString(36),
          sourceType: "LISTING_OFFER", sourceId: "p3a-server",
          buyerId, sellerId, listingId,
          agreedAmount: 500000000n, currency: "IRR", transactionType: "SALE",
          status: "PENDING_CONFIRMATION", agreedAt: new Date(),
        },
      });
      setupIds.dealId = deal.id;
      dealId = deal.id;
      // Create a real session for the buyer
      validSessionToken = crypto.randomBytes(32).toString("base64url");
      const session = await db.session.create({
        data: { userId: buyerId, token: validSessionToken, expiresAt: new Date(Date.now() + 3600000) },
      });
      setupIds.sessionId = session.id;
    } catch (e) {
      setupError = e as Error;
    }

    // If setup failed, attempt independent cleanup of every created fixture.
    if (setupError) {
      let cleanupError: Error | null = null;
      try {
        await finalizeCollecting([
          () => (setupIds.dealId ? db.order.deleteMany({ where: { dealId: setupIds.dealId } }) : Promise.resolve()),
          () => (setupIds.dealId ? db.deal.delete({ where: { id: setupIds.dealId } }) : Promise.resolve()),
          () => (setupIds.listingId ? db.listing.delete({ where: { id: setupIds.listingId } }) : Promise.resolve()),
          () => (setupIds.sessionId ? db.session.delete({ where: { id: setupIds.sessionId } }) : Promise.resolve()),
          () => (setupIds.buyerId ? db.user.delete({ where: { id: setupIds.buyerId } }) : Promise.resolve()),
          () => (setupIds.sellerId ? db.user.delete({ where: { id: setupIds.sellerId } }) : Promise.resolve()),
        ]);
      } catch (e) {
        cleanupError = e as Error;
      }
      if (cleanupError) throw new AggregateError([setupError, cleanupError], "beforeAll setup + cleanup");
      throw setupError;
    }

    // Start the REAL Next.js server on a free port.
    serverPort = await getFreePort();
    serverBaseUrl = `http://localhost:${serverPort}`;
    serverProcess = spawn("bunx", ["next", "start", "-p", String(serverPort)], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(serverPort) },
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
    });
    serverProcess.stdout?.on("data", () => {}); // drain
    serverProcess.stderr?.on("data", () => {}); // drain
    await waitForServer(serverPort);
  }, 120000); // 2-min timeout for beforeAll (includes server startup)

  afterAll(async () => {
    // Stop the real Next.js server.
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1000));
      if (!serverProcess.killed) serverProcess.kill("SIGKILL");
      serverProcess = null;
    }
    // Independent cleanup — NO .catch(()=>{}); uses finalizeCollecting.
    const errors = await finalizeCollecting([
      () => (dealId ? db.order.deleteMany({ where: { dealId } }) : Promise.resolve()),
      () => (dealId ? db.deal.delete({ where: { id: dealId } }) : Promise.resolve()),
      () => (listingId ? db.listing.delete({ where: { id: listingId } }) : Promise.resolve()),
      () => db.session.deleteMany({ where: { userId: buyerId } }),
      () => (buyerId ? db.user.delete({ where: { id: buyerId } }) : Promise.resolve()),
      () => (sellerId ? db.user.delete({ where: { id: sellerId } }) : Promise.resolve()),
    ]);
    throwCombined(null, errors, "afterAll cleanup");
  });

  // Helper: snapshot deal + order state for before/after comparison
  async function snapshotDeal(id: string) {
    const deal = await db.deal.findUnique({ where: { id }, select: { id: true, status: true, confirmedAt: true } });
    const orderCount = await db.order.count({ where: { dealId: id } });
    return { deal, orderCount };
  }

  // ── S1: anonymous request (no cookie) → 401, DB unchanged ──
  // The request goes through the REAL Next.js HTTP server → real cookies() runtime
  // → real getCurrentUserId() → returns null (no cookie) → 401.
  it("S1 anonymous real HTTP → 401, deal+order unchanged (real Next.js server, no mocks)", async () => {
    const before = await snapshotDeal(dealId);
    const res = await fetch(`${serverBaseUrl}/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CONFIRMED" }),
    });
    expect(res.status).toBe(401);
    const after = await snapshotDeal(dealId);
    expect(after.deal?.status).toBe(before.deal?.status);
    expect(after.deal?.confirmedAt).toBe(before.deal?.confirmedAt);
    expect(after.orderCount).toBe(before.orderCount);
  });

  // ── S2: valid session (real Cookie header) → 200, deal+order mutated ──
  // The request goes through the REAL Next.js HTTP server → real cookies() runtime
  // → real getCurrentUserId() → real Session DB lookup → real User → 200 + mutation.
  it("S2 valid session real HTTP → 200, deal CONFIRMED + 1 order created (real Next.js server, no mocks)", async () => {
    const before = await snapshotDeal(dealId);
    expect(before.deal?.status).toBe("PENDING_CONFIRMATION");
    expect(before.orderCount).toBe(0);
    const res = await fetch(`${serverBaseUrl}/api/deals/${dealId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `heavix-user=${validSessionToken}`, // REAL Cookie header through real HTTP
      },
      body: JSON.stringify({ status: "CONFIRMED" }),
    });
    expect(res.status).toBe(200);
    const after = await snapshotDeal(dealId);
    expect(after.deal?.status).toBe("CONFIRMED");
    expect(after.orderCount).toBe(1);
  });

  // ── S3: spoofed X-User-Id header IGNORED through real HTTP ──
  it("S3 spoofed X-User-Id header ignored through real HTTP → identity from cookie only", async () => {
    // Create a fresh PENDING deal for this test (main deal is now CONFIRMED from S2)
    const freshDeal = await db.deal.create({
      data: {
        dealNumber: "P3S-SPOOF-" + Date.now().toString(36),
        sourceType: "LISTING_OFFER", sourceId: "p3a-spoof",
        buyerId, sellerId, listingId,
        agreedAmount: 100000000n, currency: "IRR", transactionType: "SALE",
        status: "PENDING_CONFIRMATION", agreedAt: new Date(),
      },
    });
    let primaryError: Error | null = null;
    try {
      const res = await fetch(`${serverBaseUrl}/api/deals/${freshDeal.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `heavix-user=${validSessionToken}`, // real buyer session
          "X-User-Id": "attacker-spoofed-id", // SPOOFED — must be ignored by real handler
        },
        body: JSON.stringify({ status: "CONFIRMED" }),
      });
      // buyer (from cookie) IS a party → 200. If handler used spoofed header → 403.
      expect(res.status).toBe(200);
      const after = await db.deal.findUnique({ where: { id: freshDeal.id }, select: { status: true } });
      expect(after?.status).toBe("CONFIRMED");
    } catch (e) {
      primaryError = e as Error;
    } finally {
      const errs = await finalizeCollecting([
        () => db.order.deleteMany({ where: { dealId: freshDeal.id } }),
        () => db.deal.delete({ where: { id: freshDeal.id } }),
      ]);
      throwCombined(primaryError, errs, "S3 cleanup");
    }
  });

  // ── S4: invalid transition → 409, no duplicate order (real HTTP) ──
  it("S4 invalid transition real HTTP → 409, no duplicate order", async () => {
    const before = await snapshotDeal(dealId);
    expect(before.orderCount).toBe(1); // 1 order from S2
    const res = await fetch(`${serverBaseUrl}/api/deals/${dealId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `heavix-user=${validSessionToken}`,
      },
      body: JSON.stringify({ status: "CONFIRMED" }), // already CONFIRMED → 409
    });
    expect(res.status).toBe(409);
    const after = await snapshotDeal(dealId);
    expect(after.orderCount).toBe(1); // still 1, no duplicate
    expect(after.deal?.status).toBe("CONFIRMED");
  });
});
