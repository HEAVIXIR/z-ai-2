# Content Diffs — Legacy vs Current Main

Total CHANGED files: 307
Showing diffs for 10 key files below.

## prisma/schema.prisma

Old lines: 2449, Current lines: 2652, Diff lines: 326

```diff
--- old:prisma/schema.prisma
+++ current:prisma/schema.prisma
@@ -1,12 +1,12 @@
 // HEAVIX — Industrial heavy-machinery marketplace

-// PostgreSQL production schema (migrated from SQLite per ADR-001)

+// SQLite development schema (PostgreSQL for production — switch provider + url for deployment)

 

 generator client {

   provider = "prisma-client-js"

 }

 

 datasource db {

-  provider = "sqlite"

+  provider = "postgresql"

   url      = env("DATABASE_URL")

 }

 

@@ -50,6 +50,14 @@
   listings    Listing[]

   aliases     BrandAlias[]

   industries  BrandIndustry[]

+

+  // STEP 15-B.4.1: PROVEN via EXPLAIN ANALYZE before/after simulation in 15-B.2

+  // Query: SELECT * FROM "Brand" WHERE active=true ORDER BY name ASC LIMIT 24 OFFSET 0

+  // Before (no index): 0.220ms Seq Scan + top-N heapsort, 34kB sort memory

+  // After (with index): 0.093ms Index Scan, 0 sort memory

+  // Improvement: 3.41× faster, planner switched Seq Scan → Index Scan

+  // Acceptance: ≥2× improvement ✓, Index Scan used ✓, no test regression ✓

+  @@index([name])

 }

 

 model BrandAlias {

@@ -507,7 +515,6 @@
   attributeValues ListingAttributeValue[]

   socialReels   SocialReel[]

   machines     Machine[]

-  priceRecords PriceRecord[]

   // P2-PRICE-ENGINE — HEAVIX Price Estimation Engine (additive)

   priceObservations PriceObservation[]

   priceEstimates    PriceEstimate[]

@@ -617,6 +624,37 @@
   viewerName  String?

   note        String?

   createdAt   DateTime @default(now())

+

+  // ── PR-SC-01 — Lead CRM Foundation (additive; ADR-005 §3) ──

+  // status: CRM pipeline state. Backfill: all existing leads → "NEW".

+  // Allowed values: NEW | CONTACTED | QUALIFIED | CLOSED | LOST.

+  // Validated in the app layer (src/lib/crm/lead-status.ts); kept as a

+  // plain String (not a Postgres enum) so the migration is a single

+  // additive ALTER TABLE with a safe default and no blocking enum cast.

+  status      String   @default("NEW")

+  // assignedToId: optional sales-team member (User) responsible for

+  // follow-up. Nullable: unassigned leads are valid (the NEW bucket).

+  assignedToId String?

+  assignedTo   User?   @relation("LeadAssignee", fields: [assignedToId], references: [id], onDelete: SetNull)

+  // Deterministic Lead Score v1 (see src/lib/crm/lead-score.ts).

+  // Cached value; recalculation is a separate job (PR-SC-06).

+  // scoreVersion: "v1" (algorithm) | "v1-override" (human-corrected).

+  score              Int?

+  scoreVersion       String?

+  scoreBreakdown     Json?

+  scoredAt           DateTime?

+  // Human override (audited via auditMutationTransactional in the

+  // PATCH handler). Setting any override field flips scoreVersion

+  // to "v1-override" so the UI can distinguish algorithm vs human.

+  scoreOverrideById  String?

+  scoreOverrideBy    User?  @relation("LeadScoreOverride", fields: [scoreOverrideById], references: [id], onDelete: SetNull)

+  scoreOverrideReason String?

+  scoreOverrideNote  String?

+  scoreOverrideAt    DateTime?

+

+  @@index([status])

+  @@index([assignedToId])

+  @@index([listingId, status])

 }

 

 // ════════════════════════════════════════════════════════════

@@ -1593,6 +1631,13 @@
   reviewsWritten  Review[] @relation("ReviewAuthor")

   dealsAsBuyer    Deal[] @relation("DealBuyer")

   dealsAsSeller   Deal[] @relation("DealSeller")

+

+  // ── PR-SC-01 — Lead CRM back-relations ──

+  // assignedLeads: leads this user is responsible for following up (Lead.assignedToId).

+  // scoreOverrideLeads: leads whose algorithmic score this user manually overrode

+  //   (Lead.scoreOverrideById). Kept for audit traceability.

+  assignedLeads       Lead[] @relation("LeadAssignee")

+  scoreOverrideLeads  Lead[] @relation("LeadScoreOverride")

 }

 

 model Session {

@@ -1668,7 +1713,10 @@
 // ════════════════════════════════════════════════════════════

 

 model AuditLog {

-  id          String   @id @default(cuid())

+  id             String   @id @default(cuid())

+  // Stable delivery key for cross-database transactional outbox events.

+  // Nullable to preserve legacy logAudit callers; unique to make replay idempotent.


... (126 lines omitted) ...

+  userId            String   @unique

+  theme             String   @default("system")

+  density           String   @default("comfortable")

+  locale            String   @default("fa")

+  timezone          String   @default("Asia/Tehran")

+  sidebarCollapsed  Boolean  @default(false)

+  pinnedItems       Json?

+  hiddenItems       Json?

+  dashboardLayout   Json?

+  defaultPageSize   Int      @default(25)

+  createdAt         DateTime @default(now())

+  updatedAt         DateTime @updatedAt

+}

+

+// ════════════════════════════════════════════════════════════

+// STEP 06 — ADMIN SAVED VIEWS

+// Personal / Team / System saved table views per resource.

+// Stores filter+sort+column config as JSON (NOT arbitrary SQL).

+// ════════════════════════════════════════════════════════════

+

+model AdminSavedView {

+  id          String   @id @default(cuid())

+  userId      String?  // null = SYSTEM scope

+  resourceKey String   // e.g., 'listings', 'brands'

+  name        String   // e.g., 'آگهی‌های منتظر بررسی'

+  scope       String   @default("PERSONAL") // PERSONAL | TEAM | SYSTEM

+  config      Json     // { filters, sort, columns, pageSize, density }

+  isDefault   Boolean  @default(false)

+  active      Boolean  @default(true)

+  createdAt   DateTime @default(now())

+  updatedAt   DateTime @updatedAt

+  @@index([userId, resourceKey])

+  @@index([resourceKey, scope])

+}

+

+// ════════════════════════════════════════════════════════════

+// STEP 14 — PAGE / WIDGET BUILDER

+// Declarative JSON Schema for page layouts.

+// Versioning: Draft → Preview → Publish → Rollback.

+// NO arbitrary SQL/JS — only validated widget schemas + registry-based data sources.

+// ════════════════════════════════════════════════════════════

+

+model AdminPage {

+  id                  String   @id @default(cuid())

+  key                 String   @unique // immutable (e.g., "homepage", "category-excavator")

+  title               String             // changeable display title

+  slug                String?            // public URL slug

+  pageType            String   @default("CUSTOM") // HOME | LANDING | CATEGORY | BRAND | MODEL | CAMPAIGN | ARTICLE | CUSTOM

+  status              String   @default("DRAFT") // DRAFT | PUBLISHED | SCHEDULED | UNPUBLISHED | ARCHIVED

+  publishedVersionId  String?            // FK to AdminPageVersion (current live version)

+  scheduledPublishAt  DateTime?

+  scheduledUnpublishAt DateTime?

+  // SEO (integration contract — STEP 15 owns full SEO)

+  seoTitle            String?

+  seoDescription      String?

+  seoCanonical        String?

+  seoOgImage          String?

+  seoRobotsIndex      Boolean  @default(true)

+  seoRobotsFollow     Boolean  @default(true)

+  // Audit

+  createdBy           String?

+  updatedBy           String?

+  createdAt           DateTime @default(now())

+  updatedAt           DateTime @updatedAt

+  versions            AdminPageVersion[]

+  @@index([pageType])

+  @@index([status])

+}

+

+model AdminPageVersion {

+  id          String   @id @default(cuid())

+  pageId      String

+  page        AdminPage @relation(fields: [pageId], references: [id], onDelete: Cascade)

+  version     Int                  // version number (1, 2, 3...)

+  status      String   @default("DRAFT") // DRAFT | PUBLISHED | ARCHIVED

+  // Validated JSON layout schema: { sections: [{ title, rows: [{ widgets: [{ key, props }] }] }] }

+  // NOT arbitrary code — only widget keys from the registry with validated props

+  layout      Json

+  changeLog   String?              // human-readable description of changes

+  createdBy   String?

+  createdAt   DateTime @default(now())

+  publishedAt DateTime?

+  publishedBy String?

+  @@index([pageId])

+  @@index([status])

+  @@unique([pageId, version])

+}

+

+model AdminPageTemplate {

+  id          String   @id @default(cuid())

+  key         String   @unique // e.g., "homepage-default", "campaign-cta"

+  name        String

+  description String?

+  pageType    String   @default("CUSTOM")

+  layout      Json                 // template layout (cloneable, not directly publishable)

+  isSystem    Boolean  @default(true) // system templates are immutable

+  sortOrder   Int      @default(0)

+  createdAt   DateTime @default(now())

+  updatedAt   DateTime @updatedAt

+}

```

## src/lib/db.ts

Old lines: 84, Current lines: 84, Diff lines: 0

```diff
```

## src/lib/store-db.ts

Old lines: 27, Current lines: 27, Diff lines: 11

```diff
--- old:src/lib/store-db.ts
+++ current:src/lib/store-db.ts
@@ -5,7 +5,7 @@
  *

  * The HEAVIX auto-parts marketplace has its OWN PostgreSQL database

  * (`STORE_DATABASE_URL`) and its own Prisma schema

- * (`prisma/store-schema.prisma`). The generated client lives at

+ * (`prisma/store/schema.prisma`). The generated client lives at

  * `src/lib/generated/store-client` so it does NOT clash with the

  * main HEAVIX `@prisma/client`.

  *

```

## src/lib/audit.ts

Old lines: 90, Current lines: 5, Diff lines: 96

```diff
--- old:src/lib/audit.ts
+++ current:src/lib/audit.ts
@@ -1,90 +1,5 @@
-import { db } from "@/lib/db";

-

-/* ============================================================

-   HEAVIX — Audit Log helper (P0-4)

-   HEAVIX-SECURITY-BASELINE-V1.md §10

-   HEAVIX-P0-IMPLEMENTATION-PLAN.md STEP 4

-

-   AuditLog is APPEND-ONLY. This helper never updates or deletes

-   existing rows. Audit failures MUST NOT crash the main operation

-   — they are swallowed and logged to console.

-   ============================================================ */

-

-export type AuditActorType = "USER" | "ADMIN" | "SYSTEM" | "AI";

-

-export interface LogAuditParams {

-  /** UserId or admin/system identifier. Null allowed for SYSTEM events. */

-  actorId?: string | null;

-  /** Defaults to "USER". Use "ADMIN" for admin-cookie actions, "SYSTEM" for jobs, "AI" for AI gateway. */

-  actorType?: AuditActorType;

-  /** Action key in `resource.action` form, e.g. "listing.publish", "user.suspend". */

-  action: string;

-  /** Entity type name, e.g. "Listing", "User", "Brand". */

-  entityType: string;

-  /** Entity id (nullable for collection-level actions). */

-  entityId?: string | null;

-  /** Before-state payload (any JSON-serializable value). */

-  before?: unknown;

-  /** After-state payload (any JSON-serializable value). */

-  after?: unknown;

-  /** Request IP. */

-  ip?: string | null;

-  /** User-Agent header. */

-  userAgent?: string | null;

-  /** Correlation / request id. */

-  requestId?: string | null;

-  /** Human-readable reason / note. */

-  reason?: string | null;

-}

-

-function safeStringify(value: unknown): string | null {

-  if (value === null || value === undefined) return null;

-  if (typeof value === "string") return value;

-  try {

-    return JSON.stringify(value);

-  } catch {

-    try {

-      return String(value);

-    } catch {

-      return null;

-    }

-  }

-}

-

 /**

- * Append an entry to the AuditLog table.

- *

- * Contract:

- *   • Append-only — never update/delete (no update/delete API surface here).

- *   • Failures are non-fatal — caught + logged to console.error.

- *   • `before` / `after` are JSON-serialized.

+ * HEAVIX — Audit log re-export (backward compat)

+ * The canonical implementation is in src/lib/admin/audit.ts

  */

-export async function logAudit(params: LogAuditParams): Promise<void> {

-  try {

-    await db.auditLog.create({

-      data: {

-        actorId: params.actorId ?? null,

-        actorType: params.actorType ?? "USER",

-        action: params.action,

-        entityType: params.entityType,

-        entityId: params.entityId ?? null,

-        beforeJson: safeStringify(params.before),

-        afterJson: safeStringify(params.after),

-        ip: params.ip ?? null,

-        userAgent: params.userAgent ?? null,

-        requestId: params.requestId ?? null,

-        reason: params.reason ?? null,

-      },

-    });

-  } catch (err: any) {

-    // Audit failures must NEVER crash the main operation.

-    // Log to console and move on.

-    console.error("[audit] failed to write audit log:", {

-      action: params.action,

-      entityType: params.entityType,

-      entityId: params.entityId ?? null,

-      actorId: params.actorId ?? null,

-      error: err?.message ?? String(err),

-    });

-  }

-}

+export { logAudit, audit, type LogAuditParams, type AuditActorType } from '@/lib/admin/audit';

```

## src/lib/admin-guard.ts

Old lines: 96, Current lines: 130, Diff lines: 159

```diff
--- old:src/lib/admin-guard.ts
+++ current:src/lib/admin-guard.ts
@@ -1,58 +1,84 @@
 import { NextResponse } from "next/server";

-import { isAuthenticated, getCurrentUser } from "@/lib/auth";

-import { hasPermission, isAdmin } from "@/lib/rbac";

+import { getCurrentUser } from "@/lib/auth";

+import { can, isAdmin } from "@/lib/authorization";

 

 /* ============================================================

-   HEAVIX — Central Admin API Guard.

-   Per HEAVIX COMPLETION MASTER SPEC V1.0 §7 (Admin API Security).

+   HEAVIX — Central Admin API Guard (STEP 03 hardened).

+

+   STEP 03: Legacy AdminSession path REMOVED from authorization.

+   All admin access now goes through:

+     getCurrentUser() → user session → RBAC → Permission

+

+   The legacy AdminSession cookie path was removed in PR #58 (R45-16).

+   adminGuard() now resolves identity exclusively through

+   getCurrentUser() (USER_COOKIE → Session → User) and RBAC.

+   This means logging in via admin credentials (username/password)

+   alone is NO LONGER sufficient for admin API access.

+   Users must have a User account with ADMIN UserRole.

 

    Usage in any /api/admin/* route:

 

-     import { adminGuard, requirePerm } from "@/lib/admin-guard";

+     import { adminGuard, requireAdmin } from "@/lib/admin-guard";

 

-     export async function GET(req: Request) {

-       const user = await adminGuard(req);

-       if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

-       await requirePerm(user.id, "brand.read");

-       // ... route logic

-     }

+     // Without permission check (just admin access):

+     const [user, error] = await requireAdmin();

+     if (error) return error;

 

-   Or for permission-gated routes:

+     // With permission check:

+     const [user, error] = await requireAdmin("brand.update");

+     if (error) return error;

 

-     export async function PATCH(req: Request) {

-       const user = await adminGuard(req, "brand.update");

-       if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

-       // ... route logic

-     }

+   Or the lower-level guard:

+

+     const user = await adminGuard("listing.publish");

+     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

+     if (user === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    ============================================================ */

 

 /**

- * Checks admin authentication via legacy admin cookie OR user session.

- * If `permissionKey` is provided, also checks RBAC permission.

- * Returns the user object (if session-based) or null (if admin cookie).

- * Returns `false` if auth/permission fails — caller should return 401/403.

+ * Checks admin authentication via user session + RBAC ONLY.

+ * Legacy AdminSession cookie is NO LONGER checked.

+ *

+ * Returns:

+ *   - { id, firstName } if authenticated + authorized

+ *   - null if not authenticated (caller returns 401)

+ *   - false if authenticated but lacks permission (caller returns 403)

  */

 export async function adminGuard(

   permissionKey?: string,

 ): Promise<{ id: string; firstName?: string } | null | false> {

-  // 1. Try legacy admin cookie (backward compat)

-  const adminCookieOk = await isAuthenticated();

-  if (adminCookieOk) {

-    // Admin cookie = full admin access (legacy, will be deprecated)

-    return { id: "admin-cookie" };

+  // 1. Get user from session (RBAC path — the ONLY path now)

+  const user = await getCurrentUser();

+  if (!user) return null; // Not authenticated → 401

+

+  // 2. Check admin role (RBAC, no User.role fallback)

+  const admin = await isAdmin(user.id);

+  if (!admin) {

+    // Not admin — but might still have specific permissions

+    if (permissionKey) {

+      const hasPerm = await can(user.id, permissionKey);

+      if (hasPerm) {

+        return { id: user.id, firstName: user.firstName };

+      }

+    }

+    return false; // Forbidden → 403

   }

 

-  // 2. Try user session

-  const user = await getCurrentUser();

-  if (!user) return null; // Not authenticated

-

-  // 3. If permission required, check RBAC

+  // 3. If permission required, check it.

+  //    STEP 11.6 (Phase B.3 — Model B): NO ADMIN SUPERUSER BYPASS.

+  //    The ADMIN role is granted all 127 permissions via the RBAC seed

+  //    (seed-rbac.ts), so in practice ADMIN always passes `can()`.

+  //    But as an AUTHORIZATION CONTRACT, we do NOT bypass the check —

+  //    if an ADMIN somehow lacks the permission (e.g., partial RBAC

+  //    assignment, custom role), the request is denied with 403.

+  //    This closes the silent-bypass hole found in the STEP 11.5 audit

+  //    (admin-guard.ts:70-74 had an empty `if (!hasPerm)` body that

+  //    effectively granted ADMIN superuser access regardless of

+  //    permission checks).

   if (permissionKey) {

-    const hasPerm = await hasPermission(user.id, permissionKey);

+    const hasPerm = await can(user.id, permissionKey);

     if (!hasPerm) {

-      // Fall back to isAdmin check (for users not yet migrated to UserRole)

-      const admin = await isAdmin(user.id);

-      if (!admin) return false; // Forbidden

+      return false; // Forbidden → 403 (no bypass — Model B contract)

     }

   }

 

@@ -60,7 +86,7 @@
 }

 

 /**

- * Convenience wrapper: returns the user or a NextResponse error.

+ * Convenience wrapper: returns [user, null] on success, [null, error] on failure.

  * Usage:

  *   const [user, error] = await requireAdmin("brand.update");

  *   if (error) return error;

@@ -74,7 +100,7 @@
   }

   if (result === false) {

     return [null, NextResponse.json(

-      { error: `Forbidden: requires "${permissionKey}" permission` },

+      { error: permissionKey ? `Forbidden: requires "${permissionKey}"` : "Forbidden: admin access required" },

       { status: 403 },

     )];

   }

@@ -89,8 +115,16 @@
   resourceOwnerId: string | null | undefined,

 ): Promise<boolean> {

   if (!resourceOwnerId) return false;

-  if (userId === "admin-cookie") return true; // Admin can access all

   if (userId === resourceOwnerId) return true;

-  // Check if user is admin

+  // Check if user is admin (via RBAC only — no legacy fallback)

   return await isAdmin(userId);

 }

+

+/**

+ * Shared authorizeAdmin helper — canonical user-session + RBAC path only.

+ */

+export async function authorizeAdmin(): Promise<boolean> {

+  const user = await getCurrentUser();

+  if (!user) return false;

+  return isAdmin(user.id);

+}

```

## src/lib/auth.ts

Old lines: 198, Current lines: 90, Diff lines: 240

```diff
--- old:src/lib/auth.ts
+++ current:src/lib/auth.ts
@@ -2,159 +2,22 @@
 import crypto from "node:crypto";

 import { db } from "@/lib/db";

 

-/* ============================================================

-   HEAVIX auth — cookie-based sessions for admin + users.

-

-   P0-3 (Security Baseline V1):

-   - Admin sessions are NO LONGER a forgeable base64 blob.

-   - On login we mint a 32-byte CSPRNG token, store ONLY its

-     SHA-256 hash in `AdminSession` (with expiry), and set the

-     raw token in an HttpOnly + SameSite=Lax (+ Secure in prod)

-     cookie.

-   - `isAuthenticated()` hashes the incoming cookie and looks up

-     the hash in the DB, rejecting expired / revoked sessions.

-   - `destroySession()` deletes the row → immediate revocation.

-   - Admin credentials (ADMIN_CREDENTIALS) are still used as the

-     primary authenticator; they only ever issue a secure session

-     token and are never stored in a cookie themselves.

-

-   Users continue to use the server-side `Session` table.

-   ============================================================ */

-

-export const ADMIN_COOKIE = "heavix-admin";

 export const USER_COOKIE = "heavix-user";

-

-/** Admin session lifetime: 24 hours (in seconds). */

-const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24;

-/** User session lifetime: 7 days (in seconds). */

 const USER_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

-

-export const ADMIN_CREDENTIALS = {

-  username: process.env.ADMIN_USERNAME ?? "09121404927",

-  password: process.env.ADMIN_PASSWORD ?? "ZIASAMa6365N@",

-};

-

-/**

- * Constant-time-ish admin credential check.

- * NOTE: This is the PRIMARY authenticator only — on success it issues a

- * cryptographically secure session token (see `createSession`). The

- * password itself is NEVER put in a cookie.

- */

-export function validateLogin(username: string, password: string): boolean {

-  const expectedUser = ADMIN_CREDENTIALS.username;

-  const expectedPass = ADMIN_CREDENTIALS.password;

-  // Use timingSafeEqual to avoid trivial timing leaks on the comparison.

-  try {

-    const a = Buffer.from(String(username));

-    const b = Buffer.from(expectedUser);

-    const c = Buffer.from(String(password));

-    const d = Buffer.from(expectedPass);

-    if (a.length !== b.length || c.length !== d.length) return false;

-    return (

-      crypto.timingSafeEqual(a, b) && crypto.timingSafeEqual(c, d)

-    );

-  } catch {

-    return false;

-  }

-}

-

-/** SHA-256 hex of a token — what we persist in `AdminSession.tokenHash`. */

-function hashToken(token: string): string {

-  return crypto.createHash("sha256").update(token).digest("hex");

-}

-

 const isProd = process.env.NODE_ENV === "production";

 

-/** Server-only: create a cryptographically secure admin session. */

-export async function createSession(): Promise<void> {

-  // 32 bytes of CSPRNG entropy → base64url (~43 chars). This is what we

-  // hand to the client. We never persist the raw token.

+export async function createUserSession(userId: string): Promise<void> {

   const rawToken = crypto.randomBytes(32).toString("base64url");

-  const tokenHash = hashToken(rawToken);

-  const now = Date.now();

-  const expiresAt = new Date(now + ADMIN_SESSION_MAX_AGE * 1000);

+  const expiresAt = new Date(Date.now() + USER_SESSION_MAX_AGE * 1000);

 

-  // Best-effort cleanup of expired sessions on each new login so the

-  // table doesn't grow without bound. Failure here is non-fatal.

-  try {

-    await db.adminSession.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });

-  } catch {

-    /* ignore */

-  }

-

-  await db.adminSession.create({

-    data: {

-      tokenHash,

-      username: ADMIN_CREDENTIALS.username,

-      expiresAt,

-    },

+  await db.session.create({

+    data: { userId, token: rawToken, expiresAt },

   });

 

   const store = await cookies();

-  store.set(ADMIN_COOKIE, rawToken, {


... (40 lines omitted) ...

-    }

-    return true;

-  } catch {

-    return false;

-  }

-}

-

-/* ── User sessions (cookie-based, server-side Session table) ── */

-

-export async function createUserSession(userId: string): Promise<void> {

-  // 32 bytes of CSPRNG entropy for user sessions too (was a weak

-  // Math.random()-based token). The user `Session` table stores the raw

-  // token in `token @unique`; we keep that contract but strengthen entropy.

-  const rawToken = crypto.randomBytes(32).toString("base64url");

-  const expiresAt = new Date(Date.now() + USER_SESSION_MAX_AGE * 1000);

-  await db.session.create({ data: { userId, token: rawToken, expiresAt } });

-  const store = await cookies();

   store.set(USER_COOKIE, rawToken, {

-    httpOnly: true,

-    sameSite: "lax",

-    secure: isProd,

-    maxAge: USER_SESSION_MAX_AGE,

-    path: "/",

+    httpOnly: true, sameSite: "lax", secure: isProd,

+    maxAge: USER_SESSION_MAX_AGE, path: "/",

   });

 }

 

@@ -162,27 +25,35 @@
   const store = await cookies();

   const token = store.get(USER_COOKIE)?.value;

   if (token) {

-    try {

-      await db.session.deleteMany({ where: { token } });

-    } catch {

-      /* ignore */

-    }

+    try { await db.session.deleteMany({ where: { token } }); }

+    catch { /* cookie is still cleared; server auth remains fail-closed */ }

   }

   store.delete(USER_COOKIE);

 }

 

-/** Returns the current User record if the user cookie is a valid session. */

+/**

+ * Canonical identity contract:

+ * USER_COOKIE -> Session.token -> Session.userId -> User.

+ * No legacy admin cookie, legacy admin session table, synthetic

+ * ADMIN identity, or credential-pair fallback exists in this path.

+ */

 export async function getCurrentUser() {

   const store = await cookies();

   const token = store.get(USER_COOKIE)?.value;

   if (!token) return null;

+

   try {

     const session = await db.session.findUnique({

       where: { token },

       include: { user: true },

     });

     if (!session) return null;

+

     if (session.expiresAt.getTime() < Date.now()) {

+      await db.session.delete({ where: { id: session.id } }).catch(() => {});

+      return null;

+    }

+    if (session.user.status === "BLOCKED") {

       await db.session.delete({ where: { id: session.id } }).catch(() => {});

       return null;

     }

@@ -193,6 +64,27 @@
 }

 

 export async function getCurrentUserId(): Promise<string | null> {

-  const u = await getCurrentUser();

-  return u?.id ?? null;

+  const user = await getCurrentUser();

+  return user?.id ?? null;

 }

+

+// ─────────────────────────────────────────────────────────────

+// Backward-compat wrappers — delegate to the canonical user-session path.

+//

+// These exist so that the 30+ admin/api routes that still call

+// `isAuthenticated()` / `destroySession()` keep compiling after R45-16

+// removed the legacy admin-session-backed implementations. They MUST NOT

+// be re-implemented as independent admin paths — they are pure aliases.

+//

+// Contract:

+//   isAuthenticated() === (await getCurrentUser()) !== null

+//   destroySession()  === destroyUserSession()

+// ─────────────────────────────────────────────────────────────

+export async function isAuthenticated(): Promise<boolean> {

+  const user = await getCurrentUser();

+  return user !== null;

+}

+

+export async function destroySession(): Promise<void> {

+  await destroyUserSession();

+}

```

## src/lib/price-engine.ts

Old lines: 1014, Current lines: 910, Diff lines: 257

```diff
--- old:src/lib/price-engine.ts
+++ current:src/lib/price-engine.ts
@@ -434,50 +434,12 @@
     });

   }

 

-  // ── Fold in legacy PriceRecord observations (P2-22 intelligence

-  //    layer) when the new PriceObservation table is sparse. These

-  //    are real historical observations and widen the comparable

-  //    pool without fabricating prices.

-  try {

-    const recRows = await db.priceRecord.findMany({

-      where: {

-        brandId: target.brandId,

-        categoryId: target.categoryId,

-      },

-      select: {

-        id: true ,

-        listingId: true,

-        price: true,

-        year: true,

-        recordedAt: true,

-      },

-      take: MAX_COMPARABLES,

-      orderBy: { recordedAt: "desc" },

-    });

-    for (const r of recRows) {

-      if (!r.price) continue;

-      if (seenIds.has(r.id)) continue;

-      seenIds.add(r.id);

-      comps.push({

-        id: r.id,

-        title: "(سابقه بازار)",

-        slug: "",

-        price: Number(r.price),

-        year: r.year,

-        workingHours: null,

-        city: null,

-        observedAt: r.recordedAt,

-        similarity: computeSimilarity(target, {

-          year: r.year,

-          hours: null,

-          city: null,

-        }),

-      });

-    }

-  } catch {

-    // PriceRecord table should always exist, but if it doesn't we

-    // silently skip — non-fatal.

-  }

+  // ── STEP 6B.1: PriceRecord fold-in REMOVED.

+  // The legacy PriceRecord table is deprecated (canonical model is

+  // PriceObservation per PHASE-6A-RECONCILE). The PriceRecord writer

+  // (recordPriceFromListing) is dead code with 0 callers, so the table

+  // is empty — folding in its rows would yield zero comparables anyway.

+  // All comparable selection now uses PriceObservation exclusively.

 

   if (comps.length < 2) {

     return emptyEstimate([

@@ -557,7 +519,7 @@
     }

   }

 

-  return {

+  const result: EstimateResult = {

     estimatedPrice: med,

     priceLower: lower,

     priceUpper: upper,

@@ -579,6 +541,34 @@
       similarity: c.similarity,

     })),

   };

+

+  // STEP 6D.3: Persist estimate to PriceEstimate (best-effort, non-blocking).

+  // Only persists when we have a listingId (brand-level estimates without

+  // listingId can't be linked to a specific listing).

+  // Skips INSUFFICIENT confidence — no useful estimate to cache.

+  if (params.listingId && result.confidence !== "INSUFFICIENT") {

+    try {

+      await db.priceEstimate.create({

+        data: {

+          listingId: params.listingId,

+          estimatedPrice: result.estimatedPrice ?? 0,

+          priceLower: result.priceLower ?? 0,

+          priceUpper: result.priceUpper ?? 0,

+          confidence: result.confidence,

+          comparableCount: result.comparableCount,

+          dataFreshness: result.dataFreshness ?? null,

+          mainDrivers: JSON.stringify(result.mainDrivers),

+          warnings: JSON.stringify(result.warnings),

+          modelVersion: result.modelVersion,

+        },

+      });

+    } catch (err) {

+      // Best-effort — log but don't block the estimate from being returned.

+      console.error("[price-engine] persistEstimate failed:", err);

+    }

+  }

+

+  return result;


... (57 lines omitted) ...

-  if (params.modelId) listingWhere.modelId = params.modelId;

-

-  const listings = await db.listing.findMany({

-    where: listingWhere,

-    select: { price: true, createdAt: true },

-    take: 2000,

-    orderBy: { createdAt: "asc" },

-  });

-

-  type Bucket = { prices: number[] };

-  const buckets = new Map<string, Bucket>();

-  const ensure = (k: string): Bucket => {

-    const b = buckets.get(k);

-    if (b) return b;

-    const nb: Bucket = { prices: [] };

-    buckets.set(k, nb);

-    return nb;

-  };

-  const keyOf = (d: Date) =>

-    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

-

-  for (const o of obs) {

-    if (!o.askingPrice) continue;

-    ensure(keyOf(o.observedAt)).prices.push(Number(o.askingPrice));

-  }

-  for (const l of listings) {

-    if (!l.price) continue;

-    ensure(keyOf(l.createdAt)).prices.push(Number(l.price));

-  }

-

-  // Build a sorted, gap-filled list of months.

-  const out: PriceHistoryPoint[] = [];

-  const cursor = new Date(since);

-  cursor.setDate(1);

-  cursor.setHours(0, 0, 0, 0);

-  const now = new Date();

-  while (cursor <= now) {

-    const key = keyOf(cursor);

-    const b = buckets.get(key);

-    if (b && b.prices.length > 0) {

-      const sorted = b.prices.sort((a, b2) => a - b2);

-      const med = median(sorted) ?? null;

-      const min = sorted[0] ?? null;

-      const max = sorted[sorted.length - 1] ?? null;

-      out.push({

-        month: key,

-        medianPrice: med,

-        count: sorted.length,

-        range:

-          min != null && max != null ? ([min, max] as [number, number]) : null,

-      });

-    } else {

-      out.push({ month: key, medianPrice: null, count: 0, range: null });

-    }

-    cursor.setMonth(cursor.getMonth() + 1);

-  }

-  return out;

-}

+// STEP 6B.5: getPriceHistory REMOVED from price-engine.ts.

+// Canonical location is now src/lib/price-history-engine.ts.

+// All routes (/api/price-history, /api/pricing/history, /api/price-intelligence)

+// now import from the canonical module.

 

 /* ─────────── recordObservation ─────────── */

 

@@ -863,7 +749,8 @@
   listingId: string;

   overridePrice: number;

   reason: string;

-  adminId?: string | null;

+  /** Required: human admin responsible for the override (audit-log integrity, STEP 14.19-C D6). */

+  adminId: string;

   ip?: string | null;

   userAgent?: string | null;

 }): Promise<{ id: string }> {

@@ -874,6 +761,15 @@
   if (!args.reason || args.reason.trim().length < 3) {

     throw new Error("reason is required (min 3 chars)");

   }

+  // STEP 14.19-C D6: Fail-closed on missing adminId. Previously this

+  // fell back to the sentinel string "ADMIN", which allowed a price

+  // override to be recorded in the audit log without identifying the

+  // responsible human admin. Now we throw instead — any caller that

+  // forgets to pass adminId will fail loudly rather than silently

+  // polluting the audit trail.

+  if (!args.adminId || typeof args.adminId !== "string" || args.adminId.trim().length === 0) {

+    throw new Error("adminId is required for price override (price-engine)");

+  }

 

   // Compute the current estimate so we can record the "before" value.

   const estimate = await estimatePrice({ listingId: args.listingId });

@@ -890,7 +786,7 @@
       originalEstimate,

       overridePrice: args.overridePrice,

       reason: args.reason.trim(),

-      overriddenBy: args.adminId ?? "ADMIN",

+      overriddenBy: args.adminId,

     },

   });

 

```

## src/lib/rbac.ts

Old lines: 146, Current lines: 47, Diff lines: 193

```diff
--- old:src/lib/rbac.ts
+++ current:src/lib/rbac.ts
@@ -1,146 +1,47 @@
-import { db } from "@/lib/db";

+/**

+ * HEAVIX — RBAC helpers (P0-5)

+ *

+ * STEP 02: RBAC Hardened — legacy User.role fallback REMOVED.

+ * All admin access now requires UserRole entries.

+ *

+ * The new authorization module at src/lib/authorization/ is the

+ * canonical source for permission checks. This file delegates

+ * to the new module for backward compatibility of imports.

+ *

+ * Migration guide for existing code:

+ *   OLD: import { isAdmin } from '@/lib/rbac';

+ *   NEW: import { isAdmin, requirePermission } from '@/lib/authorization';

+ */

 

-/* ============================================================

-   HEAVIX — RBAC helpers (P0-5)

-   HEAVIX-SECURITY-BASELINE-V1.md §3, §5

-   HEAVIX-P0-IMPLEMENTATION-PLAN.md STEP 3

+// Re-export everything from the new authorization module

+export {

+  can,

+  canAny,

+  canAll,

+  requirePermission,

+  requireAnyPermission,

+  requireAllPermissions,

+  isAdmin,

+  canAccessResource,

+  canBulkAction,

+  canExport,

+  hasRole,

+  AuthorizationError,

+} from '@/lib/authorization';

 

-   Permission resolution path:

-       User → UserRole → Role → RolePermission → Permission.key

+// Keep these for backward compat

+export { getUserPermissions, ForbiddenError } from '@/lib/rbac-legacy';

 

-   Naming convention: `resource.action`

-     • taxonomy.read      • brand.publish

-     • listing.moderate   • user.suspend

-     • security.manage    • ai.execute

-

-   NOTE on backward compatibility:

-     The legacy `User.role` String column ("ADMIN" | "SELLER" | "BUYER")

-     predates RBAC. To avoid locking out existing admins that haven't been

-     migrated to UserRole yet, `isAdmin()` falls back to checking the

-     `User.role` column for "ADMIN"/"SUPERADMIN". Once the data migration

-     is complete the fallback can be removed.

-   ============================================================ */

-

-export class ForbiddenError extends Error {

-  readonly statusCode = 403;

-  constructor(message = "Forbidden") {

-    super(message);

-    this.name = "ForbiddenError";

-  }

-}

-

-/**

- * Returns all permission keys for the user, de-duplicated.

- * Resolves through UserRole → RolePermission → Permission.

- */

-export async function getUserPermissions(userId: string): Promise<string[]> {

-  try {

-    const userRoles = await db.userRole.findMany({

-      where: { userId },

-      select: {

-        role: {

-          select: {

-            permissions: {

-              select: { permission: { select: { key: true } } },

-            },

-          },

-        },

-      },

-    });

-

-    const set = new Set<string>();

-    for (const ur of userRoles) {

-      for (const rp of ur.role.permissions) {

-        set.add(rp.permission.key);

-      }

-    }

-    return Array.from(set);

-  } catch (err) {

-    console.error("[rbac] getUserPermissions failed:", err);

-    return [];

-  }

-}

-

-/**

- * True if the user has the given permission key.

- */

-export async function hasPermission(

-  userId: string,

-  permissionKey: string,

-): Promise<boolean> {

-  const perms = await getUserPermissions(userId);

-  return perms.includes(permissionKey);

-}

-

-/**

- * Throws ForbiddenError (HTTP 403) if the user lacks the permission.

- * Use in API routes / server actions:

- *

- *     await requirePermission(user.id, "listing.publish");

- */

-export async function requirePermission(

-  userId: string,

-  permissionKey: string,

-): Promise<void> {

-  const ok = await hasPermission(userId, permissionKey);

-  if (!ok) {

-    throw new ForbiddenError(

-      `Permission denied: requires "${permissionKey}"`,

-    );

-  }

-}

-

-/**

- * True if the user has the ADMIN role (via UserRole).

- *

- * Falls back to the legacy `User.role` String column ("ADMIN" | "SUPERADMIN")

- * so existing admins that haven't been migrated to UserRole are not locked

- * out. This fallback can be removed once the data migration is verified.

- */

-export async function isAdmin(userId: string): Promise<boolean> {

-  try {

-    // 1. RBAC path — user has a UserRole with role.key === "ADMIN"

-    const adminRole = await db.userRole.findFirst({

-      where: {

-        userId,

-        role: { key: "ADMIN" },

-      },

-      select: { id: true },

-    });

-    if (adminRole) return true;

-

-    // 2. Legacy fallback — User.role column.

-    const user = await db.user.findUnique({

-      where: { id: userId },

-      select: { role: true },

-    });

-    if (!user) return false;

-    const r = (user.role ?? "").toUpperCase();

-    return r === "ADMIN" || r === "SUPERADMIN";

-  } catch (err) {

-    console.error("[rbac] isAdmin failed:", err);

-    return false;

-  }

-}

-

-/**

- * True if the user has any of the given role keys (via UserRole).

- * Does NOT consult the legacy User.role column — role keys are exact.

- */

-export async function hasRole(

-  userId: string,

-  roleKey: string | string[],

-): Promise<boolean> {

-  const keys = Array.isArray(roleKey) ? roleKey : [roleKey];

-  if (keys.length === 0) return false;

-  try {

-    const found = await db.userRole.findFirst({

-      where: { userId, role: { key: { in: keys } } },

-      select: { id: true },

-    });

-    return Boolean(found);

-  } catch (err) {

-    console.error("[rbac] hasRole failed:", err);

-    return false;

-  }

-}

+// ── STEP 14.8-B: Legacy import shims ────────────────────────────

+// Older code imports { hasPermission } from "@/lib/rbac" — this is

+// the synchronous-looking async equivalent of the new can() function.

+// Re-export can under the legacy name so legacy @ts-nocheck files

+// continue to import cleanly during the migration window.

+//

+// Signature:  hasPermission(userId, permissionKey) → Promise<boolean>

+// Identical to:  can(userId, permissionKey)

+//

+// Migration target: replace `hasPermission` imports with `can` from

+// "@/lib/authorization" and remove this shim once all callers migrate.

+import { can as _can } from '@/lib/authorization';

+export const hasPermission = _can;

```

## scripts/backup.sh

Old lines: 62, Current lines: 62, Diff lines: 116

```diff
--- old:scripts/backup.sh
+++ current:scripts/backup.sh
@@ -1,62 +1,62 @@
 #!/usr/bin/env bash

-# ============================================================

-# HEAVIX — Database Backup (FIX-GAPS-2)

-# ------------------------------------------------------------

-# Copies db/custom.db to db/backups/custom-YYYYMMDD-HHMMSS.db

-# Keeps the last 10 backups (deletes older). Cron-friendly:

-#

-#   # m h  dom mon dow   command

-#   0 3 * * *  /home/z/my-project/scripts/backup.sh >> /var/log/havix-backup.log 2>&1

-#

-# Safe to run manually any time. Uses cp (not sqlite3 .backup)

-# so it works even when the sqlite3 CLI isn't installed — the

-# SQLite WAL mode is journaled, so a single-file cp gives a

-# crash-consistent snapshot in practice for our write volume.

-# For higher-write deployments, swap to `sqlite3 custom.db ".backup '$dest'"`

-# which performs an online consistent snapshot.

-# ============================================================

+# HEAVIX — paired PostgreSQL Main + Store backup.

+# Requires explicit DB_* and STORE_DB_* settings in pg_dump mode.

+# Output is published atomically only after both dumps and checksums succeed.

 set -euo pipefail

+umask 077

 

-# Resolve project root regardless of where the script is invoked from.

-SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

-PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

+BACKUP_ROOT="${BACKUP_ROOT:-./backups}"

+STAMP="$(date +%Y%m%d_%H%M%S)"

+BACKUP_DIR="$BACKUP_ROOT/$STAMP"

+WORK_DIR="$BACKUP_ROOT/.$STAMP.tmp.$$"

 

-DB_FILE="$PROJECT_ROOT/db/custom.db"

-BACKUP_DIR="$PROJECT_ROOT/db/backups"

-MAX_BACKUPS=10

-

-if [[ ! -f "$DB_FILE" ]]; then

-  echo "[backup] ERROR: database file not found at $DB_FILE" >&2

+mkdir -p "$BACKUP_ROOT"

+if [ -e "$BACKUP_DIR" ]; then

+  echo "ERROR: backup destination already exists; refusing to overwrite."

   exit 1

 fi

+mkdir "$WORK_DIR"

+cleanup() { rm -rf -- "$WORK_DIR"; }

+trap cleanup EXIT

 

-mkdir -p "$BACKUP_DIR"

+if [ "${BACKUP_DOCKER_MODE:-0}" = "1" ]; then

+  : "${DB_USER:?DB_USER is required in Docker mode}"

+  : "${DB_NAME:?DB_NAME is required in Docker mode}"

+  : "${STORE_DB_USER:?STORE_DB_USER is required in Docker mode}"

+  : "${STORE_DB_NAME:?STORE_DB_NAME is required in Docker mode}"

+  MAIN_DB_CONTAINER="${MAIN_DB_CONTAINER:-heavix-db-1}"

+  STORE_DB_CONTAINER="${STORE_DB_CONTAINER:-heavix-store-db-1}"

+  docker exec "$MAIN_DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$WORK_DIR/main.sql"

+  docker exec "$STORE_DB_CONTAINER" pg_dump -U "$STORE_DB_USER" "$STORE_DB_NAME" > "$WORK_DIR/store.sql"

+else

+  : "${DB_HOST:?DB_HOST is required}"

+  : "${DB_PORT:?DB_PORT is required}"

+  : "${DB_USER:?DB_USER is required}"

+  : "${DB_NAME:?DB_NAME is required}"

+  : "${DB_PASSWORD:?DB_PASSWORD is required}"

+  : "${STORE_DB_HOST:?STORE_DB_HOST is required}"

+  : "${STORE_DB_PORT:?STORE_DB_PORT is required}"

+  : "${STORE_DB_USER:?STORE_DB_USER is required}"

+  : "${STORE_DB_NAME:?STORE_DB_NAME is required}"

+  : "${STORE_DB_PASSWORD:?STORE_DB_PASSWORD is required}"

 

-STAMP="$(date +%Y%m%d-%H%M%S)"

-DEST="$BACKUP_DIR/custom-$STAMP.db"

-

-# Copy with explicit error handling so a failed cp doesn't leave

-# a half-written file in the backups dir.

-if cp "$DB_FILE" "$DEST"; then

-  echo "[backup] OK: $DEST ($(du -h "$DEST" | cut -f1))"

-else

-  echo "[backup] ERROR: cp failed for $DB_FILE -> $DEST" >&2

-  rm -f "$DEST"

-  exit 1

+  PGPASSWORD="$DB_PASSWORD" pg_dump --no-owner --no-privileges \

+    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" > "$WORK_DIR/main.sql"

+  PGPASSWORD="$STORE_DB_PASSWORD" pg_dump --no-owner --no-privileges \

+    -h "$STORE_DB_HOST" -p "$STORE_DB_PORT" -U "$STORE_DB_USER" "$STORE_DB_NAME" > "$WORK_DIR/store.sql"

 fi

 

-# Rotate: keep newest $MAX_BACKUPS, delete the rest. `ls -t`

-# sorts by mtime newest-first; we tail everything past the

-# first $MAX_BACKUPS lines and rm each.

-cd "$BACKUP_DIR"

-# shellcheck disable=SC2012

-ls -t custom-*.db 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | while read -r old; do

-  if [[ -n "$old" && -f "$old" ]]; then

-    rm -f "$old"

-    echo "[backup] rotated: $old"

-  fi

-done

+# Empty/partial dumps must never be published as a successful paired backup.

+test -s "$WORK_DIR/main.sql" || { echo "ERROR: Main database dump is empty."; exit 1; }

+test -s "$WORK_DIR/store.sql" || { echo "ERROR: Store database dump is empty."; exit 1; }

+(

+  cd "$WORK_DIR"

+  sha256sum main.sql store.sql > checksums.txt

+  sha256sum -c checksums.txt >/dev/null

+)

 

-# Summary

-COUNT=$(ls -1 custom-*.db 2>/dev/null | wc -l | tr -d ' ')

-echo "[backup] total backups in $BACKUP_DIR: $COUNT"

+mv -- "$WORK_DIR" "$BACKUP_DIR"

+trap - EXIT

+echo "Backup complete: $BACKUP_DIR"

+echo "Main DB bytes: $(wc -c < "$BACKUP_DIR/main.sql")"

+echo "Store DB bytes: $(wc -c < "$BACKUP_DIR/store.sql")"

```

## prisma/seed-rbac.ts

Old lines: 227, Current lines: 227, Diff lines: 83

```diff
--- old:prisma/seed-rbac.ts
+++ current:prisma/seed-rbac.ts
@@ -11,6 +11,7 @@
      bun run db:seed-rbac

 */

 import { PrismaClient } from "@prisma/client";

+import { PERMISSIONS as CANONICAL_PERMISSIONS, ROLE_PERMISSIONS as CANONICAL_ROLE_PERMISSIONS } from "../src/lib/authorization/permissions";

 

 const db = new PrismaClient();

 

@@ -99,42 +100,41 @@
   { key: "auction.manage", nameFa: "مدیریت مزایده",       nameEn: "Manage auction",  resource: "auction",  description: "مدیریت مزایده‌های ماشین‌آلات" },

   // settings

   { key: "settings.manage", nameFa: "مدیریت تنظیمات",     nameEn: "Manage settings", resource: "settings", description: "ویرایش تنظیمات سایت" },

+  // ── PR-SC-01 — Store Center CRM permissions (hand-crafted Persian names) ──

+  { key: "store.crm.read",  nameFa: "مشاهده سرنخ‌ها و CRM",  nameEn: "Read store CRM",  resource: "store",    description: "مشاهده سرنخ‌ها و جریان پیگیری فروش (محدود به سرنخ‌های شرکت خود)" },

+  { key: "store.crm.manage", nameFa: "مدیریت سرنخ‌ها و CRM", nameEn: "Manage store CRM", resource: "store",    description: "به‌روزرسانی وضعیت سرنخ، تخصیص، و اصلاح امتیاز سرنخ" },

 ];

 

+// ── Reconciliation: ensure ALL canonical permissions are seeded ──

+// The local PERMISSIONS array above has 20 hand-crafted entries with

+// proper Persian/English names. The canonical PERMISSIONS from

+// src/lib/authorization/permissions.ts has 127 keys. This loop adds

+// the 107 missing keys with auto-generated metadata so the seed

+// creates a complete RBAC matrix.

+{

+  const _existingKeys = new Set(PERMISSIONS.map(p => p.key));

+  for (const key of CANONICAL_PERMISSIONS) {

+    if (!_existingKeys.has(key)) {

+      const parts = key.split(".");

+      const resource = parts[0] || key;

+      const action = parts.slice(1).join(".") || "manage";

+      PERMISSIONS.push({

+        key,

+        nameFa: `${action} ${resource}`,

+        nameEn: `${action} ${resource}`,

+        resource,

+        description: `${action} permission for ${resource}`,

+      });

+    }

+  }

+}

+

 /* ───────────── Role → Permission matrix ───────────── */

 

+// Use canonical ROLE_PERMISSIONS from permissions.ts + local SUPPORT additions

 const ROLE_PERMISSIONS: Record<string, string[]> = {

-  // ADMIN — all permissions

-  ADMIN: PERMISSIONS.map((p) => p.key),

-

-  // MODERATOR — content moderation tools

-  MODERATOR: [

-    "taxonomy.read",

-    "brand.read",

-    "listing.read",

-    "listing.moderate",

-    "review.moderate",

-    "user.suspend",

-    "audit.read",

-    "media.upload",

-  ],

-

-  // SELLER — manage own listings + media

-  SELLER: [

-    "listing.read",

-    "listing.publish",

-    "media.upload",

-    "rfq.manage",

-    "brand.read",

-  ],

-

-  // BUYER — browse + upload

-  BUYER: [

-    "listing.read",

-    "media.upload",

-  ],

-

-  // SUPPORT — read-only + suspend

+  ...CANONICAL_ROLE_PERMISSIONS,

+  // SUPPORT is not in canonical ROLE_PERMISSIONS — add locally

   SUPPORT: [

     "user.read",

     "user.suspend",

```

