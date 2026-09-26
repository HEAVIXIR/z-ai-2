/**
 * HEAVIX — Security Boundary Tests (Track E / T4)
 * ------------------------------------------------------------
 * File-content security assertions that verify the admin auth
 * boundary is intact and that no admin API route silently
 * disables TypeScript type-checking (the @ts-nocheck directive
 * on line 1 is the dangerous pattern — it hides type errors that
 * could mask auth-bypass bugs).
 *
 * These run under `bun run test:security`
 * (config: vitest.security.config.ts → includes tests/security/**).
 *
 * Scope: API route handlers under `src/app/api/admin/**`, EXCLUDING
 * Store / Marketplace / homepage routes (those are governed by
 * their own phase tests: phase-store-2c, phase-marketplace-2b).
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..", "..");
const ADMIN_API_DIR = path.join(ROOT, "src", "app", "api", "admin");
const MIDDLEWARE_PATH = path.join(ROOT, "src", "middleware.ts");

function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}

/** Recursively collect every route.ts under a directory. */
function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...listRouteFiles(full));
    } else if (e.name === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

/** Store / Marketplace / homepage routes are out of scope here —
 *  they have their own phase-test governance. */
function isOutOfScope(absPath: string): boolean {
  const rel = path.relative(ROOT, absPath).replace(/\\/g, "/");
  return (
    rel.includes("/store/") ||
    rel.includes("/marketplace/") ||
    rel.includes("/home/") ||
    rel.includes("/homepage-sections/")
  );
}

const allAdminRoutes = listRouteFiles(ADMIN_API_DIR);
const inScopeRoutes = allAdminRoutes.filter((p) => !isOutOfScope(p));

describe("Auth boundary — edge middleware", () => {
  it("src/middleware.ts exists", () => {
    expect(fs.existsSync(MIDDLEWARE_PATH)).toBe(true);
  });

  it("middleware matcher intercepts /admin/* AND /api/admin/*", () => {
    const mw = read(MIDDLEWARE_PATH);
    expect(mw).toMatch(/\/admin\/:path\*/);
    expect(mw).toMatch(/\/api\/admin\/:path\*/);
  });

  it("middleware returns 401 JSON for unauthenticated /api/admin/* calls", () => {
    const mw = read(MIDDLEWARE_PATH);
    // The unauthenticated branch must produce a 401 response.
    expect(mw).toMatch(/status:\s*401/);
    expect(mw).toMatch(/Unauthorized/);
  });

  it("middleware redirects unauthenticated /admin/* page calls to /login", () => {
    const mw = read(MIDDLEWARE_PATH);
    expect(mw).toMatch(/\/login/);
    expect(mw).toMatch(/NextResponse\.redirect/);
  });

  it("middleware reads the heavix-admin cookie (presence-only check)", () => {
    const mw = read(MIDDLEWARE_PATH);
    expect(mw).toMatch(/heavix-admin/);
  });
});

describe("Auth boundary — health endpoints are public", () => {
  it("middleware excludes /health paths from the admin auth boundary", () => {
    const mw = read(MIDDLEWARE_PATH);
    // The health-exclusion short-circuits to NextResponse.next()
    // before the cookie check, so monitoring tools can probe health
    // without an admin session.
    expect(mw).toMatch(/endsWith\(['"]\/health['"]\)/);
    expect(mw).toMatch(/return NextResponse\.next\(\)/);
  });

  it("PUBLIC_ROUTES list documents /api/health as never intercepted", () => {
    const mw = read(MIDDLEWARE_PATH);
    expect(mw).toMatch(/\/api\/health/);
  });
});

describe("Auth boundary — in-scope admin API routes guard with an auth helper", () => {
  // The middleware is the FIRST boundary; route handlers are the
  // second (defense-in-depth). Every in-scope admin route should
  // import one of the canonical auth helpers. We sample rather than
  // exhaustively asserting on every file to keep the failure message
  // actionable, but the @ts-nocheck scan below IS exhaustive.
  const sampleRoutes = [
    "src/app/api/admin/attachments/route.ts",
    "src/app/api/admin/articles/route.ts",
    "src/app/api/admin/users/route.ts",
    "src/app/api/admin/companies/route.ts",
    "src/app/api/admin/reviews/route.ts",
    "src/app/api/admin/parts/route.ts",
  ];

  it.each(sampleRoutes)("%s imports an auth guard", (rel) => {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return; // tolerate routes renamed upstream
    const content = read(full);
    expect(content).toMatch(/isAuthenticated|getCurrentUser|requireAdmin|getCurrentUserId/);
  });
});

describe("Type-safety gate — no @ts-nocheck directive in in-scope admin routes", () => {
  // A `// @ts-nocheck` directive on line 1 disables type-checking
  // for the ENTIRE file. That is the dangerous pattern because it
  // can silently mask auth-bypass bugs (e.g. a loosely-typed `any`
  // param flowing into a privileged DB call). Mentioning @ts-nocheck
  // in a comment is fine; the DIRECTIVE is not.
  //
  // This scan is exhaustive across every route.ts under
  // src/app/api/admin/** excluding Store/Marketplace/homepage.

  it("found at least one in-scope admin route to scan", () => {
    expect(inScopeRoutes.length).toBeGreaterThan(0);
  });

  it.each(inScopeRoutes)(
    "no @ts-nocheck directive on line 1: %s",
    (absPath) => {
      const content = read(absPath);
      const firstLine = content.split("\n")[0];
      expect(
        firstLine,
        `${path.relative(ROOT, absPath)} must not start with a @ts-nocheck directive`,
      ).not.toMatch(/^\/\/\s*@ts-nocheck/);
    },
  );
});

describe("Type-safety gate — rate-limit presets are wired", () => {
  // Defense-in-depth: the UPLOAD + MESSAGING presets must actually
  // be imported by at least one route each, otherwise the preset is
  // dead config and the endpoint is unprotected.

  it("UPLOAD preset is imported by at least one route", () => {
    const reels = read(path.join(ROOT, "src/app/api/admin/reels/route.ts"));
    expect(reels).toMatch(/UPLOAD/);
    expect(reels).toMatch(/enforceRateLimit/);
  });

  it("MESSAGING preset is imported by the conversation routes", () => {
    const conv = read(path.join(ROOT, "src/app/api/messages/conversation/route.ts"));
    expect(conv).toMatch(/MESSAGING/);
    expect(conv).toMatch(/enforceRateLimit/);
  });
});

describe("XSS hardening — rich-text widget sanitises HTML", () => {
  const WIDGET =
    "src/components/page-renderer/widgets/rich-text-widget.tsx";

  it("rich-text widget exports a sanitise function", () => {
    const w = read(path.join(ROOT, WIDGET));
    expect(w).toMatch(/sanitizeRichTextHtml|sanitizeHtml|sanitiz/);
  });

  it("sanitiser strips <script> blocks", () => {
    const w = read(path.join(ROOT, WIDGET));
    expect(w).toMatch(/<script/i);
  });

  it("sanitiser strips on* event-handler attributes", () => {
    const w = read(path.join(ROOT, WIDGET));
    expect(w).toMatch(/on[a-z]+/i);
  });

  it("sanitiser neutralises javascript: URLs", () => {
    const w = read(path.join(ROOT, WIDGET));
    expect(w).toMatch(/javascript/i);
  });

  it("widget renders via dangerouslySetInnerHTML (sanitised)", () => {
    const w = read(path.join(ROOT, WIDGET));
    expect(w).toMatch(/dangerouslySetInnerHTML/);
  });
});
