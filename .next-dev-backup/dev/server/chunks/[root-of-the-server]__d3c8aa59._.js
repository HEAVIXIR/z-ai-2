module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[project]/src/lib/db.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "db",
    ()=>db
]);
/**
 * Prisma Client singleton.
 *
 * The instance is cached on `globalThis` so that Next.js dev-mode hot-reloads
 * don't exhaust DB connections. We also stamp a `prismaSchemaVersion` on the
 * cache — bump it whenever the schema gains models/fields that the running
 * dev server needs to pick up without a full process restart. When the
 * version mismatches:
 *   1. the old instance is discarded,
 *   2. the Node `require.cache` entries for `@prisma/client` and the
 *      generated `.prisma/client/*` are purged, and
 *   3. a fresh instance is built via a runtime `require()` so the freshly
 *      generated client files are re-read from disk.
 *
 * IMPORTANT — Turbopack note:
 * A static `import { PrismaClient } from '@prisma/client'` is resolved by
 * Turbopack at BUNDLE time. After `prisma generate` rewrites the files in
 * `node_modules/.prisma/client/`, Turbopack does NOT re-bundle the package
 * (it doesn't watch that folder), so the static binding keeps pointing at the
 * OLD generated class and new models (e.g. SiteStat) are `undefined` on the
 * client. To work around this we load the class through a runtime
 * `require('@prisma/client')` (guarded). On the server, Turbopack externalizes
 * node_modules requires, so this goes through Node's native require and the
 * `require.cache` purge above actually refreshes the generated client. This
 * makes the running dev server pick up new Prisma models after
 * `prisma db push` with no restart.
 *
 * Client-bundle safety: this module must remain importable from Client
 * Components (some client files transitively import it). We therefore avoid
 * any `node:` built-in import and guard all `require` usage with
 * `typeof require !== 'undefined'`. `createPrismaClient()` is never invoked
 * in the browser — only server code calls it.
 */ const SCHEMA_VERSION = 'p2-auction-company-rental' // P2-AUCTION-COMPANY-RENTAL: CompanyPartner + Listing rental fields
;
const globalForPrisma = globalThis;
function purgePrismaCache() {
    if ("TURBOPACK compile-time truthy", 1) {
        for (const key of Object.keys(__turbopack_context__.c)){
            if (key.includes('/node_modules/@prisma/client/') || key.includes('/node_modules/.prisma/client/')) {
                try {
                    delete __turbopack_context__.c[key];
                } catch  {
                /* ignore */ }
            }
        }
    }
}
function createPrismaClient() {
    purgePrismaCache();
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    // Runtime require so we re-read the freshly-generated client from disk
    // after `prisma generate`. eslint disabled for the guarded require.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = __turbopack_context__.r("[externals]/@prisma/client [external] (@prisma/client, cjs, [project]/node_modules/@prisma/client)");
    return new mod.PrismaClient({
        log: [
            'error',
            'warn'
        ]
    });
}
if (globalForPrisma.prismaSchemaVersion !== SCHEMA_VERSION) {
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION;
}
const db = globalForPrisma.prisma ?? createPrismaClient();
if ("TURBOPACK compile-time truthy", 1) {
    globalForPrisma.prisma = db;
    globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION;
}
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[project]/src/lib/auth.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ADMIN_COOKIE",
    ()=>ADMIN_COOKIE,
    "ADMIN_CREDENTIALS",
    ()=>ADMIN_CREDENTIALS,
    "USER_COOKIE",
    ()=>USER_COOKIE,
    "createSession",
    ()=>createSession,
    "createUserSession",
    ()=>createUserSession,
    "destroySession",
    ()=>destroySession,
    "destroyUserSession",
    ()=>destroyUserSession,
    "getCurrentUser",
    ()=>getCurrentUser,
    "getCurrentUserId",
    ()=>getCurrentUserId,
    "isAuthenticated",
    ()=>isAuthenticated,
    "validateLogin",
    ()=>validateLogin
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:crypto [external] (node:crypto, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
;
;
;
const ADMIN_COOKIE = "heavix-admin";
const USER_COOKIE = "heavix-user";
/** Admin session lifetime: 24 hours (in seconds). */ const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24;
/** User session lifetime: 7 days (in seconds). */ const USER_SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const ADMIN_CREDENTIALS = {
    username: process.env.ADMIN_USERNAME ?? "09121404927",
    password: process.env.ADMIN_PASSWORD ?? "ZIASAMa6365N@"
};
function validateLogin(username, password) {
    const expectedUser = ADMIN_CREDENTIALS.username;
    const expectedPass = ADMIN_CREDENTIALS.password;
    // Use timingSafeEqual to avoid trivial timing leaks on the comparison.
    try {
        const a = Buffer.from(String(username));
        const b = Buffer.from(expectedUser);
        const c = Buffer.from(String(password));
        const d = Buffer.from(expectedPass);
        if (a.length !== b.length || c.length !== d.length) return false;
        return __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["default"].timingSafeEqual(a, b) && __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["default"].timingSafeEqual(c, d);
    } catch  {
        return false;
    }
}
/** SHA-256 hex of a token — what we persist in `AdminSession.tokenHash`. */ function hashToken(token) {
    return __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["default"].createHash("sha256").update(token).digest("hex");
}
const isProd = ("TURBOPACK compile-time value", "development") === "production";
async function createSession() {
    // 32 bytes of CSPRNG entropy → base64url (~43 chars). This is what we
    // hand to the client. We never persist the raw token.
    const rawToken = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["default"].randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const now = Date.now();
    const expiresAt = new Date(now + ADMIN_SESSION_MAX_AGE * 1000);
    // Best-effort cleanup of expired sessions on each new login so the
    // table doesn't grow without bound. Failure here is non-fatal.
    try {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].adminSession.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date(now)
                }
            }
        });
    } catch  {
    /* ignore */ }
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].adminSession.create({
        data: {
            tokenHash,
            username: ADMIN_CREDENTIALS.username,
            expiresAt
        }
    });
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    store.set(ADMIN_COOKIE, rawToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        maxAge: ADMIN_SESSION_MAX_AGE,
        path: "/"
    });
}
async function destroySession() {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    const rawToken = store.get(ADMIN_COOKIE)?.value;
    if (rawToken) {
        try {
            const tokenHash = hashToken(rawToken);
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].adminSession.deleteMany({
                where: {
                    tokenHash
                }
            });
        } catch  {
        /* ignore */ }
    }
    store.delete(ADMIN_COOKIE);
}
async function isAuthenticated() {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    const rawToken = store.get(ADMIN_COOKIE)?.value;
    if (!rawToken) return false;
    try {
        const tokenHash = hashToken(rawToken);
        const session = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].adminSession.findUnique({
            where: {
                tokenHash
            }
        });
        if (!session) return false;
        if (session.expiresAt.getTime() < Date.now()) {
            // Prune expired session on read.
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].adminSession.delete({
                where: {
                    id: session.id
                }
            }).catch(()=>{});
            return false;
        }
        return true;
    } catch  {
        return false;
    }
}
async function createUserSession(userId) {
    // 32 bytes of CSPRNG entropy for user sessions too (was a weak
    // Math.random()-based token). The user `Session` table stores the raw
    // token in `token @unique`; we keep that contract but strengthen entropy.
    const rawToken = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["default"].randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + USER_SESSION_MAX_AGE * 1000);
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].session.create({
        data: {
            userId,
            token: rawToken,
            expiresAt
        }
    });
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    store.set(USER_COOKIE, rawToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        maxAge: USER_SESSION_MAX_AGE,
        path: "/"
    });
}
async function destroyUserSession() {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    const token = store.get(USER_COOKIE)?.value;
    if (token) {
        try {
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].session.deleteMany({
                where: {
                    token
                }
            });
        } catch  {
        /* ignore */ }
    }
    store.delete(USER_COOKIE);
}
async function getCurrentUser() {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    const token = store.get(USER_COOKIE)?.value;
    if (!token) return null;
    try {
        const session = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].session.findUnique({
            where: {
                token
            },
            include: {
                user: true
            }
        });
        if (!session) return null;
        if (session.expiresAt.getTime() < Date.now()) {
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].session.delete({
                where: {
                    id: session.id
                }
            }).catch(()=>{});
            return null;
        }
        return session.user;
    } catch  {
        return null;
    }
}
async function getCurrentUserId() {
    const u = await getCurrentUser();
    return u?.id ?? null;
}
}),
"[project]/src/lib/rbac-legacy.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ForbiddenError",
    ()=>ForbiddenError,
    "getUserPermissions",
    ()=>getUserPermissions
]);
/**
 * HEAVIX — Legacy RBAC helpers (kept for backward compatibility)
 *
 * getUserPermissions: resolves User → UserRole → Role → RolePermission → Permission
 * ForbiddenError: HTTP 403 error class
 *
 * The canonical authorization module is at src/lib/authorization/
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
;
class ForbiddenError extends Error {
    statusCode = 403;
    constructor(message = 'Forbidden'){
        super(message);
        this.name = 'ForbiddenError';
    }
}
async function getUserPermissions(userId) {
    try {
        const userRoles = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userRole.findMany({
            where: {
                userId
            },
            select: {
                role: {
                    select: {
                        permissions: {
                            select: {
                                permission: {
                                    select: {
                                        key: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        const set = new Set();
        for (const ur of userRoles){
            for (const rp of ur.role.permissions){
                set.add(rp.permission.key);
            }
        }
        return Array.from(set);
    } catch (err) {
        console.error('[rbac] getUserPermissions failed:', err);
        return [];
    }
}
}),
"[project]/src/lib/authorization/index.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AuthorizationError",
    ()=>AuthorizationError,
    "can",
    ()=>can,
    "canAccessResource",
    ()=>canAccessResource,
    "canAll",
    ()=>canAll,
    "canAny",
    ()=>canAny,
    "canBulkAction",
    ()=>canBulkAction,
    "canExport",
    ()=>canExport,
    "isAdmin",
    ()=>isAdmin,
    "requireAllPermissions",
    ()=>requireAllPermissions,
    "requireAnyPermission",
    ()=>requireAnyPermission,
    "requirePermission",
    ()=>requirePermission
]);
/**
 * HEAVIX — STEP 02: Authorization Service
 *
 * Central authorization layer for all HEAVIX admin/mutation operations.
 * Replaces scattered `if (user.role === 'ADMIN')` checks with
 * a single, auditable, permission-based system.
 *
 * Usage in API routes:
 *   import { requirePermission, requireAnyPermission } from '@/lib/authorization';
 *   await requirePermission(userId, 'listing.publish');
 *   await requireAnyPermission(userId, ['store.read', 'store.manage']);
 *
 * Usage in server components (for UI visibility):
 *   import { can } from '@/lib/authorization';
 *   const canEdit = await can(userId, 'listing.update');
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2d$legacy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/rbac-legacy.ts [app-route] (ecmascript)");
;
;
class AuthorizationError extends Error {
    permission;
    statusCode;
    constructor(permission, message){
        super(message || `Permission denied: requires "${permission}"`), this.permission = permission, this.statusCode = 403;
        this.name = 'AuthorizationError';
    }
}
async function can(userId, permission) {
    if (!userId) return false;
    const perms = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2d$legacy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getUserPermissions"])(userId);
    return perms.includes(permission);
}
async function canAny(userId, permissions) {
    if (!userId || permissions.length === 0) return false;
    const perms = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2d$legacy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getUserPermissions"])(userId);
    return permissions.some((p)=>perms.includes(p));
}
async function canAll(userId, permissions) {
    if (!userId) return false;
    const perms = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2d$legacy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getUserPermissions"])(userId);
    return permissions.every((p)=>perms.includes(p));
}
async function requirePermission(userId, permission) {
    const ok = await can(userId, permission);
    if (!ok) {
        throw new AuthorizationError(permission);
    }
}
async function requireAnyPermission(userId, permissions) {
    const ok = await canAny(userId, permissions);
    if (!ok) {
        throw new AuthorizationError(permissions.join(' | '), `Permission denied: requires any of [${permissions.join(', ')}]`);
    }
}
async function requireAllPermissions(userId, permissions) {
    const ok = await canAll(userId, permissions);
    if (!ok) {
        const missing = permissions.filter(async (p)=>!await can(userId, p));
        throw new AuthorizationError(permissions.join(' + '), `Permission denied: requires all of [${permissions.join(', ')}]`);
    }
}
async function isAdmin(userId) {
    if (!userId) return false;
    try {
        const adminRole = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userRole.findFirst({
            where: {
                userId,
                role: {
                    key: 'ADMIN'
                }
            },
            select: {
                id: true
            }
        });
        return Boolean(adminRole);
    } catch (err) {
        console.error('[authorization] isAdmin failed:', err);
        return false;
    }
}
async function canAccessResource(userId, resource, resourceId, options) {
    // If user has the moderate permission, they can access any resource
    if (options.moderatePermission && await can(userId, options.moderatePermission)) {
        return true;
    }
    // Otherwise, check if they own the resource
    try {
        const row = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].$queryRawUnsafe(`SELECT "${options.ownerField}" as owner_id FROM "${resource}" WHERE id = $1`, resourceId);
        return row.length > 0 && row[0].owner_id === userId;
    } catch  {
        return false;
    }
}
async function canBulkAction(userId, action) {
    // Map bulk actions to required permissions
    const BULK_PERMISSION_MAP = {
        'bulk-delete': 'listing.delete',
        'bulk-publish': 'listing.publish',
        'bulk-suspend': 'user.suspend',
        'bulk-verify': 'company.verify',
        'bulk-archive': 'listing.update',
        'bulk-export': 'listing.export'
    };
    const requiredPermission = BULK_PERMISSION_MAP[action] || action;
    return can(userId, requiredPermission);
}
async function canExport(userId, resource) {
    const EXPORT_PERMISSIONS = {
        listing: 'listing.export',
        user: 'user.read',
        order: 'order.read',
        payment: 'payment.read',
        audit: 'audit.read',
        product: 'product.read',
        brand: 'brand.read'
    };
    const perm = EXPORT_PERMISSIONS[resource] || `${resource}.read`;
    return can(userId, perm);
}
}),
"[project]/src/lib/api-helpers.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "dynamic",
    ()=>dynamic,
    "parseBig",
    ()=>parseBig,
    "parseBool",
    ()=>parseBool,
    "parseNumber",
    ()=>parseNumber,
    "requireAdmin",
    ()=>requireAdmin,
    "runtime",
    ()=>runtime,
    "slugify",
    ()=>slugify,
    "uniqueSlug",
    ()=>uniqueSlug
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/authorization/index.ts [app-route] (ecmascript)");
;
;
;
const runtime = "nodejs";
const dynamic = "force-dynamic";
async function requireAdmin() {
    const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getCurrentUser"])();
    if (!user) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Unauthorized"
        }, {
            status: 401
        });
    }
    const admin = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isAdmin"])(user.id);
    if (!admin) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Forbidden: admin access required"
        }, {
            status: 403
        });
    }
    return true;
}
function slugify(s) {
    return s.toString().trim().toLowerCase().replace(/[^\w\u0600-\u06FF-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}
async function uniqueSlug(model, base) {
    let slug = slugify(base) || `item-${Date.now()}`;
    let i = 1;
    while(await model.findUnique({
        where: {
            slug
        }
    })){
        slug = `${slugify(base)}-${i++}`;
    }
    return slug;
}
function parseBig(value) {
    if (value === null || value === undefined || value === "") return null;
    try {
        const n = typeof value === "string" ? value.replace(/[^\d-]/g, "") : String(value);
        if (n === "" || n === "-") return null;
        return BigInt(n);
    } catch  {
        return null;
    }
}
function parseBool(v) {
    if (typeof v === "boolean") return v;
    if (!v) return false;
    return [
        "1",
        "true",
        "yes",
        "on",
        "TRUE",
        "True"
    ].includes(String(v));
}
function parseNumber(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
}),
"[project]/src/lib/brand-alias.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Shared normalizer for BrandAlias values.
 *
 * Persian-aware normalization:
 *  - trims + lowercases
 *  - converts Arabic YEH (ي) → Persian YEH (ی)
 *  - converts Arabic KAF (ك) → Persian KAF (ک)
 *  - strips ZWNJ / ZWJ (U+200C, U+200D)
 *  - collapses repeated whitespace
 *
 * The normalized value is stored on BrandAlias.normalizedValue and used for
 * uniqueness + lookup so that "کاترپیلار", "كاترپیلار", and "کاترپیلار " all
 * resolve to the same record.
 */ __turbopack_context__.s([
    "normalizeAliasValue",
    ()=>normalizeAliasValue
]);
function normalizeAliasValue(s) {
    return s.trim().toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\u200d]/g, "").replace(/\s+/g, " ").trim();
}
}),
"[project]/src/lib/search.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildSearchWhere",
    ()=>buildSearchWhere,
    "mergeOrClauses",
    ()=>mergeOrClauses,
    "normalizeSearchQuery",
    ()=>normalizeSearchQuery,
    "searchBrands",
    ()=>searchBrands,
    "searchCategories",
    ()=>searchCategories,
    "searchListings",
    ()=>searchListings
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$brand$2d$alias$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/brand-alias.ts [app-route] (ecmascript)");
;
;
function normalizeSearchQuery(q) {
    if (!q) return "";
    return q.toString()// Arabic-Indic digits → Persian digits
    .replace(/[\u0660-\u0669]/g, (d)=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))// Persian digits → ASCII digits (so numeric search works against
    // both stored ASCII numbers and the user's typed Persian digits)
    .replace(/[\u06F0-\u06F9]/g, (d)=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\u200d]/g, "").replace(/\u0640/g, "") // tatweel
    .toLowerCase().replace(/\s+/g, " ").trim();
}
function buildSearchWhere(fields, q) {
    const nq = normalizeSearchQuery(q);
    if (!nq) return undefined;
    return {
        OR: fields.map((f)=>({
                [f]: {
                    contains: nq
                }
            }))
    };
}
function mergeOrClauses(base, extra) {
    if (!base && !extra) return undefined;
    if (!base) return extra;
    if (!extra) return base;
    const baseOr = Array.isArray(base.OR) ? base.OR : [
        base
    ];
    const extraOr = Array.isArray(extra.OR) ? extra.OR : [
        extra
    ];
    return {
        OR: [
            ...baseOr,
            ...extraOr
        ]
    };
}
async function searchListings(params) {
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = Math.max(0, params.offset ?? 0);
    const where = {
        status: "PUBLISHED"
    };
    // Free text
    const q = params.q?.trim();
    if (q) {
        const textClause = buildSearchWhere([
            "title",
            "shortDesc",
            "description"
        ], q);
        if (textClause) {
            where.OR = textClause.OR;
        }
    }
    // Category — slug OR name contains
    const cat = params.category?.trim();
    if (cat) {
        const catClause = {
            OR: [
                {
                    category: {
                        slug: cat
                    }
                },
                {
                    category: {
                        name: {
                            contains: normalizeSearchQuery(cat)
                        }
                    }
                }
            ]
        };
        where.OR = where.OR ? [
            ...where.OR,
            ...catClause?.OR || []
        ] : catClause.OR;
    }
    // Brand — slug OR name/nameEn contains
    const br = params.brand?.trim();
    if (br) {
        const brandClause = {
            OR: [
                {
                    brand: {
                        slug: br
                    }
                },
                {
                    brand: {
                        name: {
                            contains: normalizeSearchQuery(br)
                        }
                    }
                },
                {
                    brand: {
                        nameEn: {
                            contains: normalizeSearchQuery(br)
                        }
                    }
                }
            ]
        };
        where.OR = where.OR ? [
            ...where.OR,
            ...brandClause?.OR || []
        ] : brandClause?.OR;
    }
    // Transaction type (key)
    if (params.transactionType) {
        // Match by TransactionType.key OR legacy Listing.listingType string.
        where.OR = where.OR ? [
            ...where.OR,
            {
                transactionType: {
                    key: params.transactionType
                }
            },
            {
                listingType: params.transactionType
            }
        ] : [
            {
                transactionType: {
                    key: params.transactionType
                }
            },
            {
                listingType: params.transactionType
            }
        ];
    }
    // Province — canonical provinceId OR legacy string contains
    const prov = params.province?.trim();
    if (prov) {
        where.OR = where.OR ? [
            ...where.OR,
            {
                provinceId: prov
            },
            {
                province: {
                    contains: normalizeSearchQuery(prov)
                }
            }
        ] : [
            {
                provinceId: prov
            },
            {
                province: {
                    contains: normalizeSearchQuery(prov)
                }
            }
        ];
    }
    // City — canonical cityId OR legacy string contains
    const c = params.city?.trim();
    if (c) {
        where.OR = where.OR ? [
            ...where.OR,
            {
                cityId: c
            },
            {
                city: {
                    contains: normalizeSearchQuery(c)
                }
            }
        ] : [
            {
                cityId: c
            },
            {
                city: {
                    contains: normalizeSearchQuery(c)
                }
            }
        ];
    }
    const [total, rows] = await Promise.all([
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listing.count({
            where: where
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listing.findMany({
            where: where,
            skip: offset,
            take: limit,
            orderBy: [
                {
                    featured: "desc"
                },
                {
                    createdAt: "desc"
                }
            ],
            include: {
                brand: {
                    select: {
                        id: true,
                        name: true,
                        nameEn: true,
                        slug: true,
                        country: true
                    }
                },
                category: {
                    select: {
                        id: true,
                        name: true,
                        nameEn: true,
                        slug: true,
                        icon: true
                    }
                },
                images: {
                    take: 1,
                    orderBy: {
                        sortOrder: "asc"
                    }
                }
            }
        })
    ]);
    const results = rows.map((l)=>({
            id: l.id,
            slug: l.slug,
            title: l.title,
            description: l.description,
            shortDesc: l.shortDesc,
            price: l.price ? l.price.toString() : null,
            priceType: l.priceType,
            listingType: l.listingType,
            condition: l.condition,
            province: l.province,
            city: l.city,
            year: l.year,
            workingHours: l.workingHours,
            featured: l.featured,
            verified: l.verified,
            publishedAt: l.publishedAt ? l.publishedAt.toISOString() : null,
            brand: l.brand ? {
                id: l.brand.id,
                name: l.brand.name,
                nameEn: l.brand.nameEn,
                slug: l.brand.slug,
                country: l.brand.country
            } : null,
            category: l.category ? {
                id: l.category.id,
                name: l.category.name,
                nameEn: l.category.nameEn,
                slug: l.category.slug,
                icon: l.category.icon
            } : null,
            image: l.images?.[0]?.url ?? null
        }));
    return {
        results,
        total
    };
}
async function searchBrands(q, opts = {}) {
    const rawQ = (q ?? "").trim();
    if (!rawQ) return [];
    const normQ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$brand$2d$alias$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["normalizeAliasValue"])(rawQ);
    const take = Math.min(50, Math.max(1, opts.take ?? 20));
    // Note: SQLite `contains` is ASCII-case-insensitive but Persian
    // letters are case-less, so we still pass the normalized query.
    // The raw query is also OR-ed in so partial English matches
    // (e.g. "cat" → "Caterpillar") work.
    const where = {
        OR: [
            {
                name: {
                    contains: rawQ
                }
            },
            {
                name: {
                    contains: normQ
                }
            },
            {
                nameEn: {
                    contains: rawQ
                }
            },
            {
                nameEn: {
                    contains: normQ
                }
            },
            {
                shortName: {
                    contains: rawQ
                }
            },
            {
                shortName: {
                    contains: normQ
                }
            },
            {
                aliases: {
                    some: {
                        normalizedValue: {
                            contains: normQ
                        }
                    }
                }
            }
        ]
    };
    const brands = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].brand.findMany({
        where: where,
        take,
        orderBy: [
            {
                featured: "desc"
            },
            {
                name: "asc"
            }
        ],
        select: {
            id: true,
            slug: true,
            name: true,
            nameEn: true,
            shortName: true,
            country: true,
            logoUrl: true,
            type: true,
            status: true,
            verification: true,
            featured: true,
            _count: {
                select: {
                    listings: {
                        where: {
                            status: "PUBLISHED"
                        }
                    }
                }
            }
        }
    });
    return brands.map((b)=>({
            id: b.id,
            slug: b.slug,
            name: b.name,
            nameEn: b.nameEn,
            shortName: b.shortName,
            country: b.country,
            logoUrl: b.logoUrl,
            type: b.type,
            status: b.status,
            verification: b.verification,
            featured: b.featured,
            listingsCount: b._count.listings
        }));
}
async function searchCategories(q, opts = {}) {
    const rawQ = (q ?? "").trim();
    if (!rawQ) return [];
    const normQ = normalizeSearchQuery(rawQ);
    const take = Math.min(50, Math.max(1, opts.take ?? 20));
    const where = {
        OR: [
            {
                name: {
                    contains: rawQ
                }
            },
            {
                name: {
                    contains: normQ
                }
            },
            {
                nameEn: {
                    contains: rawQ
                }
            },
            {
                nameEn: {
                    contains: normQ
                }
            }
        ]
    };
    if (opts.layer) where.layer = opts.layer;
    const cats = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].category.findMany({
        where: where,
        take,
        orderBy: [
            {
                level: "asc"
            },
            {
                sortOrder: "asc"
            },
            {
                name: "asc"
            }
        ],
        select: {
            id: true,
            slug: true,
            name: true,
            nameEn: true,
            domain: true,
            layer: true,
            icon: true,
            parentId: true,
            level: true
        }
    });
    return cats.map((c)=>({
            id: c.id,
            slug: c.slug,
            name: c.name,
            nameEn: c.nameEn,
            domain: c.domain,
            layer: c.layer,
            icon: c.icon,
            parentId: c.parentId,
            level: c.level
        }));
}
}),
"[project]/src/lib/demand-engine.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getDemandByBrand",
    ()=>getDemandByBrand,
    "getDemandByCategory",
    ()=>getDemandByCategory,
    "getPopularQueries",
    ()=>getPopularQueries,
    "getZeroResultQueries",
    ()=>getZeroResultQueries,
    "logSearchQuery",
    ()=>logSearchQuery
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/search.ts [app-route] (ecmascript)");
;
;
/* ─────────── Private helpers ─────────── */ function daysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
}
async function logSearchQuery(params) {
    const raw = (params.query ?? "").toString().slice(0, 500);
    if (!raw.trim()) return;
    const normalized = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["normalizeSearchQuery"])(raw);
    if (!normalized) return;
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].searchQuery.create({
        data: {
            query: raw,
            normalizedQuery: normalized,
            resultCount: Math.max(0, Math.floor(Number(params.resultCount) || 0)),
            userId: params.userId ?? null,
            ip: params.ip ?? null,
            categorySlug: params.categorySlug ?? null,
            brandSlug: params.brandSlug ?? null,
            hasResults: (Number(params.resultCount) || 0) > 0
        }
    });
}
async function getZeroResultQueries(params) {
    const days = Math.min(365, Math.max(1, params.days ?? 30));
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));
    const since = daysAgo(days);
    // SQLite has no GROUP BY + ORDER BY _count sugar in Prisma that
    // works cleanly with the max(createdAt) we also need; pull rows
    // in and aggregate in JS. The dataset is bounded (searches per
    // 30 days) so this is fine.
    const rows = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].searchQuery.findMany({
        where: {
            hasResults: false,
            createdAt: {
                gte: since
            }
        },
        select: {
            normalizedQuery: true,
            query: true,
            createdAt: true
        }
    });
    const map = new Map();
    for (const r of rows){
        const existing = map.get(r.normalizedQuery);
        if (existing) {
            existing.count++;
            if (r.createdAt > existing.lastSeen) {
                existing.lastSeen = r.createdAt;
                existing.query = r.query; // keep most-recent raw form
            }
        } else {
            map.set(r.normalizedQuery, {
                query: r.query,
                count: 1,
                lastSeen: r.createdAt
            });
        }
    }
    return Array.from(map.entries()).map(([normalizedQuery, v])=>({
            query: v.query,
            normalizedQuery,
            count: v.count,
            lastSeen: v.lastSeen.toISOString()
        })).sort((a, b)=>b.count - a.count).slice(0, limit);
}
async function getPopularQueries(params) {
    const days = Math.min(365, Math.max(1, params.days ?? 30));
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));
    const since = daysAgo(days);
    const prevSince = daysAgo(days * 2);
    const [currentRows, prevRows] = await Promise.all([
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].searchQuery.findMany({
            where: {
                createdAt: {
                    gte: since
                }
            },
            select: {
                normalizedQuery: true,
                query: true
            }
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].searchQuery.findMany({
            where: {
                createdAt: {
                    gte: prevSince,
                    lt: since
                }
            },
            select: {
                normalizedQuery: true
            }
        })
    ]);
    const current = new Map();
    for (const r of currentRows){
        const ex = current.get(r.normalizedQuery);
        if (ex) {
            ex.count++;
        } else {
            current.set(r.normalizedQuery, {
                query: r.query,
                count: 1
            });
        }
    }
    const prev = new Map();
    for (const r of prevRows){
        prev.set(r.normalizedQuery, (prev.get(r.normalizedQuery) ?? 0) + 1);
    }
    return Array.from(current.entries()).map(([normalizedQuery, v])=>{
        const prevCount = prev.get(normalizedQuery) ?? 0;
        return {
            query: v.query,
            normalizedQuery,
            count: v.count,
            trend: prevCount > 0 ? v.count / prevCount : null
        };
    }).sort((a, b)=>b.count - a.count).slice(0, limit);
}
async function getDemandByCategory(days) {
    const d = Math.min(365, Math.max(1, days ?? 30));
    const since = daysAgo(d);
    const [searchRows, categories] = await Promise.all([
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].searchQuery.findMany({
            where: {
                createdAt: {
                    gte: since
                },
                categorySlug: {
                    not: null
                }
            },
            select: {
                categorySlug: true
            }
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].category.findMany({
            select: {
                id: true,
                name: true,
                slug: true,
                _count: {
                    select: {
                        listings: {
                            where: {
                                status: "PUBLISHED"
                            }
                        }
                    }
                }
            }
        })
    ]);
    const searchBySlug = new Map();
    for (const r of searchRows){
        if (!r.categorySlug) continue;
        searchBySlug.set(r.categorySlug, (searchBySlug.get(r.categorySlug) ?? 0) + 1);
    }
    const catBySlug = new Map(categories.map((c)=>[
            c.slug,
            c
        ]));
    // Include categories that have either searches or supply
    const allSlugs = new Set([
        ...searchBySlug.keys(),
        ...categories.map((c)=>c.slug)
    ]);
    const out = [];
    for (const slug of allSlugs){
        const cat = catBySlug.get(slug);
        const searchCount = searchBySlug.get(slug) ?? 0;
        const listingCount = cat?._count.listings ?? 0;
        if (searchCount === 0 && listingCount === 0) continue;
        const denom = searchCount + listingCount;
        const demandScore = denom > 0 ? Math.round(searchCount / denom * 100) : 0;
        out.push({
            category: cat ? {
                id: cat.id,
                name: cat.name,
                slug: cat.slug
            } : null,
            searchCount,
            listingCount,
            demandScore
        });
    }
    out.sort((a, b)=>b.searchCount - a.searchCount);
    return out;
}
async function getDemandByBrand(days) {
    const d = Math.min(365, Math.max(1, days ?? 30));
    const since = daysAgo(d);
    const [searchRows, brands] = await Promise.all([
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].searchQuery.findMany({
            where: {
                createdAt: {
                    gte: since
                },
                brandSlug: {
                    not: null
                }
            },
            select: {
                brandSlug: true
            }
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].brand.findMany({
            select: {
                id: true,
                name: true,
                slug: true,
                _count: {
                    select: {
                        listings: {
                            where: {
                                status: "PUBLISHED"
                            }
                        }
                    }
                }
            }
        })
    ]);
    const searchBySlug = new Map();
    for (const r of searchRows){
        if (!r.brandSlug) continue;
        searchBySlug.set(r.brandSlug, (searchBySlug.get(r.brandSlug) ?? 0) + 1);
    }
    const brandBySlug = new Map(brands.map((b)=>[
            b.slug,
            b
        ]));
    const allSlugs = new Set([
        ...searchBySlug.keys(),
        ...brands.map((b)=>b.slug)
    ]);
    const out = [];
    for (const slug of allSlugs){
        const brand = brandBySlug.get(slug);
        const searchCount = searchBySlug.get(slug) ?? 0;
        const listingCount = brand?._count.listings ?? 0;
        if (searchCount === 0 && listingCount === 0) continue;
        const denom = searchCount + listingCount;
        const demandScore = denom > 0 ? Math.round(searchCount / denom * 100) : 0;
        out.push({
            brand: brand ? {
                id: brand.id,
                name: brand.name,
                slug: brand.slug
            } : null,
            searchCount,
            listingCount,
            demandScore
        });
    }
    out.sort((a, b)=>b.searchCount - a.searchCount);
    return out;
}
}),
"[project]/src/lib/request-context.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* ============================================================
   HEAVIX — Request context helpers (P0-6)
   ------------------------------------------------------------
   Small utilities used by rate-limited API routes to extract a
   stable per-client identity. Lives here so all endpoints share
   the same definition of "IP" (and don't drift).
   ============================================================ */ /**
 * Best-effort client-IP extraction.
 *
 * Reads the canonical proxy headers (`x-forwarded-for`,
 * `x-real-ip`, `cf-connecting-ip`) and falls back to a sentinel
 * `"unknown"` when nothing is present (e.g. local dev). The
 * right-most trusted proxy hop is NOT stripped because in this
 * sandbox Caddy sits in front of Next.js and appends the real
 * client IP — the leftmost entry of `x-forwarded-for` is the
 * real client.
 */ __turbopack_context__.s([
    "getClientIp",
    ()=>getClientIp,
    "rateLimitKey",
    ()=>rateLimitKey
]);
function getClientIp(req) {
    const h = req.headers;
    const xff = h.get("x-forwarded-for");
    if (xff) {
        const first = xff.split(",")[0]?.trim();
        if (first) return first;
    }
    const xReal = h.get("x-real-ip");
    if (xReal) return xReal.trim();
    const cf = h.get("cf-connecting-ip");
    if (cf) return cf.trim();
    return "unknown";
}
function rateLimitKey(identity, label) {
    // Strip any `:` from the identity so the key stays unambiguous.
    const safe = identity.replace(/:/g, "_");
    return `${safe}:${label}`;
}
}),
"[project]/src/lib/analytics.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ANALYTICS_EVENT_TYPES",
    ()=>ANALYTICS_EVENT_TYPES,
    "getAnalyticsSummary",
    ()=>getAnalyticsSummary,
    "trackEvent",
    ()=>trackEvent
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
;
const ANALYTICS_EVENT_TYPES = [
    "LISTING_VIEW",
    "SEARCH",
    "CLICK",
    "FAVORITE",
    "COMPARE",
    "CONTACT",
    "SHARE",
    "REGISTER",
    "LOGIN",
    "LISTING_CREATE",
    "OFFER_MAKE"
];
function trackEvent(params) {
    // Detach the persist promise so the caller's microtask completes
    // before the DB write even starts. Errors are swallowed —
    // analytics MUST NEVER throw into the user flow.
    void persistEvent(params).catch((err)=>{
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[analytics] trackEvent failed:", msg);
    });
}
async function persistEvent(params) {
    // Coerce + trim string fields so we never store bloated values.
    const eventType = String(params.eventType ?? "").trim().slice(0, 64);
    if (!eventType) return; // nothing to track
    const query = typeof params.query === "string" && params.query.trim() ? params.query.trim().slice(0, 500) : null;
    const page = typeof params.page === "string" && params.page.trim() ? params.page.trim().slice(0, 500) : null;
    const referrer = typeof params.referrer === "string" && params.referrer.trim() ? params.referrer.trim().slice(0, 500) : null;
    const ip = typeof params.ip === "string" && params.ip.trim() ? params.ip.trim().slice(0, 64) : null;
    const userAgent = typeof params.userAgent === "string" && params.userAgent.trim() ? params.userAgent.trim().slice(0, 500) : null;
    const metadata = params.metadata != null ? safeStringify(params.metadata) : null;
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].analyticsEvent.create({
        data: {
            eventType,
            userId: params.userId ?? null,
            listingId: params.listingId ?? null,
            categoryId: params.categoryId ?? null,
            brandId: params.brandId ?? null,
            query,
            page,
            referrer,
            ip,
            userAgent,
            metadata
        }
    });
}
function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch  {
        try {
            return String(value);
        } catch  {
            return null;
        }
    }
}
async function getAnalyticsSummary(days) {
    const safeDays = Math.min(365, Math.max(1, Math.floor(days)));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    // Run the cheap counts in parallel — each is a single SQL pass.
    const [totalAgg, byTypeRaw, topListingsRaw, topQueriesRaw, topBrandsRaw, topCategoriesRaw, allRows] = await Promise.all([
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].analyticsEvent.aggregate({
            where: {
                createdAt: {
                    gte: since
                }
            },
            _count: {
                _all: true
            }
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].analyticsEvent.groupBy({
            by: [
                "eventType"
            ],
            where: {
                createdAt: {
                    gte: since
                }
            },
            _count: {
                _all: true
            },
            orderBy: {
                _count: {
                    eventType: "desc"
                }
            }
        }),
        // LISTING_VIEW grouped by listingId — top 10
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].analyticsEvent.groupBy({
            by: [
                "listingId"
            ],
            where: {
                createdAt: {
                    gte: since
                },
                eventType: "LISTING_VIEW",
                listingId: {
                    not: null
                }
            },
            _count: {
                _all: true
            },
            orderBy: {
                _count: {
                    listingId: "desc"
                }
            },
            take: 10
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].analyticsEvent.groupBy({
            by: [
                "query"
            ],
            where: {
                createdAt: {
                    gte: since
                },
                eventType: "SEARCH",
                query: {
                    not: null
                }
            },
            _count: {
                _all: true
            },
            orderBy: {
                _count: {
                    query: "desc"
                }
            },
            take: 10
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].analyticsEvent.groupBy({
            by: [
                "brandId"
            ],
            where: {
                createdAt: {
                    gte: since
                },
                brandId: {
                    not: null
                }
            },
            _count: {
                _all: true
            },
            orderBy: {
                _count: {
                    brandId: "desc"
                }
            },
            take: 10
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].analyticsEvent.groupBy({
            by: [
                "categoryId"
            ],
            where: {
                createdAt: {
                    gte: since
                },
                categoryId: {
                    not: null
                }
            },
            _count: {
                _all: true
            },
            orderBy: {
                _count: {
                    categoryId: "desc"
                }
            },
            take: 10
        }),
        // Pull all events in the window so we can compute the daily
        // timeline in JS — SQLite has no DATE_TRUNC and the day bucket
        // is a simple `YYYY-MM-DD` slice of the ISO timestamp.
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].analyticsEvent.findMany({
            where: {
                createdAt: {
                    gte: since
                }
            },
            select: {
                createdAt: true
            }
        })
    ]);
    // ── Resolve listing titles for top-listings table ──
    const topListingIds = topListingsRaw.map((r)=>r.listingId).filter((x)=>x !== null);
    const listingMeta = topListingIds.length > 0 ? await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listing.findMany({
        where: {
            id: {
                in: topListingIds
            }
        },
        select: {
            id: true,
            title: true,
            slug: true
        }
    }) : [];
    const listingById = new Map(listingMeta.map((l)=>[
            l.id,
            l
        ]));
    const topListings = topListingsRaw.map((r)=>{
        const meta = r.listingId ? listingById.get(r.listingId) : null;
        if (!meta) return null;
        return {
            listingId: meta.id,
            title: meta.title,
            slug: meta.slug,
            views: r._count._all
        };
    }).filter((x)=>x !== null);
    // ── Resolve brand names ──
    const topBrandIds = topBrandsRaw.map((r)=>r.brandId).filter((x)=>x !== null);
    const brandMeta = topBrandIds.length > 0 ? await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].brand.findMany({
        where: {
            id: {
                in: topBrandIds
            }
        },
        select: {
            id: true,
            name: true
        }
    }) : [];
    const brandById = new Map(brandMeta.map((b)=>[
            b.id,
            b.name
        ]));
    const topBrands = topBrandsRaw.map((r)=>{
        const id = r.brandId;
        if (!id) return null;
        return {
            brandId: id,
            brandName: brandById.get(id) ?? "—",
            count: r._count._all
        };
    }).filter((x)=>x !== null);
    // ── Resolve category names ──
    const topCategoryIds = topCategoriesRaw.map((r)=>r.categoryId).filter((x)=>x !== null);
    const categoryMeta = topCategoryIds.length > 0 ? await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].category.findMany({
        where: {
            id: {
                in: topCategoryIds
            }
        },
        select: {
            id: true,
            name: true
        }
    }) : [];
    const categoryById = new Map(categoryMeta.map((c)=>[
            c.id,
            c.name
        ]));
    const topCategories = topCategoriesRaw.map((r)=>{
        const id = r.categoryId;
        if (!id) return null;
        return {
            categoryId: id,
            categoryName: categoryById.get(id) ?? "—",
            count: r._count._all
        };
    }).filter((x)=>x !== null);
    // ── Daily timeline — JS-side bucket of createdAt ──
    const dailyMap = new Map();
    for (const row of allRows){
        const iso = row.createdAt.toISOString();
        const day = iso.slice(0, 10); // YYYY-MM-DD
        dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    }
    // Fill gaps so the chart shows continuous days (zero on no-activity days).
    const dailyTimeline = [];
    const now = new Date();
    for(let i = safeDays - 1; i >= 0; i--){
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const day = d.toISOString().slice(0, 10);
        dailyTimeline.push({
            day,
            count: dailyMap.get(day) ?? 0
        });
    }
    return {
        totalEvents: totalAgg._count._all,
        byType: byTypeRaw.map((r)=>({
                eventType: r.eventType,
                count: r._count._all
            })),
        topListings,
        topQueries: topQueriesRaw.map((r)=>({
                query: r.query ?? "",
                count: r._count._all
            })).filter((r)=>r.query.length > 0),
        topBrands,
        topCategories,
        dailyTimeline
    };
}
}),
"[project]/src/app/api/listings/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST,
    "dynamic",
    ()=>dynamic,
    "runtime",
    ()=>runtime
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api-helpers.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/search.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$demand$2d$engine$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/demand-engine.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$request$2d$context$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/request-context.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$analytics$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/analytics.ts [app-route] (ecmascript)");
;
;
;
;
;
;
;
;
const runtime = "nodejs";
const dynamic = "force-dynamic";
async function GET(req) {
    try {
        const url = new URL(req.url);
        const q = (url.searchParams.get("q") ?? "").trim();
        const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
        const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit")) || 20));
        const category = (url.searchParams.get("category") ?? "").trim();
        const brand = (url.searchParams.get("brand") ?? "").trim();
        const city = (url.searchParams.get("city") ?? "").trim();
        /* ── Dynamic attribute filters ──
       Parse `attr.KEY_min`, `attr.KEY_max`, `attr.KEY` (latter may repeat)
       from the URL and add a separate `attributeValues: { some: ... }`
       clause per attribute, joined by AND. */ const attrKeys = new Set();
        for (const k of url.searchParams.keys()){
            if (!k.startsWith("attr.")) continue;
            const stripped = k.slice(5);
            const base = stripped.replace(/_(min|max)$/, "");
            if (base) attrKeys.add(base);
        }
        // Fast path: no attribute filters → delegate to searchListings which
        // already returns the flat shape the client expects.
        if (attrKeys.size === 0) {
            const { results, total } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["searchListings"])({
                q,
                category,
                brand,
                city,
                limit,
                offset: (page - 1) * limit
            });
            // Re-shape to match the legacy /api/listings contract so the
            // existing client doesn't break: top-level `success` + `count` +
            // `data` array with brand/category/images nested objects.
            const data = results.map((l)=>({
                    id: l.id,
                    slug: l.slug,
                    title: l.title,
                    description: l.description,
                    shortDesc: l.shortDesc,
                    price: l.price,
                    priceType: l.priceType,
                    listingType: l.listingType,
                    condition: l.condition,
                    province: l.province,
                    city: l.city,
                    year: l.year,
                    workingHours: l.workingHours,
                    featured: l.featured,
                    verified: l.verified,
                    publishedAt: l.publishedAt,
                    brand: l.brand,
                    category: l.category,
                    images: l.image ? [
                        {
                            url: l.image
                        }
                    ] : []
                }));
            // P2-23 Demand Engine — log the search (fire-and-forget).
            if (q) {
                Promise.resolve().then(async ()=>{
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$demand$2d$engine$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logSearchQuery"])({
                        query: q,
                        resultCount: total,
                        ip: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$request$2d$context$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getClientIp"])(req),
                        categorySlug: category || null,
                        brandSlug: brand || null
                    });
                }).catch(()=>{
                /* demand logging must never break search */ });
                // P1-2 — track as AnalyticsEvent (fire-and-forget).
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$analytics$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["trackEvent"])({
                    eventType: "SEARCH",
                    query: q,
                    page: "/api/listings",
                    ip: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$request$2d$context$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getClientIp"])(req)
                });
            }
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                success: true,
                count: total,
                data
            });
        }
        // Slow path: attribute filters present — keep the local Prisma query
        // (so the `attributeValues: { some: ... }` AND clauses can be
        // composed) but route text/brand/category through the normalized
        // search helpers.
        const where = {
            status: "PUBLISHED"
        };
        if (q) {
            const textClause = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildSearchWhere"])([
                "title",
                "shortDesc",
                "description"
            ], q);
            if (textClause) where.OR = textClause.OR;
        }
        if (city) where.city = {
            contains: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["normalizeSearchQuery"])(city)
        };
        if (category) {
            const catClause = {
                OR: [
                    {
                        category: {
                            slug: category
                        }
                    },
                    {
                        category: {
                            name: {
                                contains: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["normalizeSearchQuery"])(category)
                            }
                        }
                    }
                ]
            };
            where.OR = where.OR ? [
                ...where.OR,
                ...catClause.OR
            ] : catClause.OR;
        }
        if (brand) {
            const brandClause = [
                {
                    brand: {
                        slug: brand
                    }
                },
                {
                    brand: {
                        name: {
                            contains: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["normalizeSearchQuery"])(brand)
                        }
                    }
                },
                {
                    brand: {
                        nameEn: {
                            contains: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["normalizeSearchQuery"])(brand)
                        }
                    }
                }
            ];
            where.OR = where.OR ? [
                ...where.OR,
                ...brandClause
            ] : brandClause;
        }
        // Build attribute AND clauses
        const keys = Array.from(attrKeys);
        const defs = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].attributeDefinition.findMany({
            where: {
                OR: [
                    {
                        key: {
                            in: keys
                        }
                    },
                    {
                        id: {
                            in: keys
                        }
                    }
                ]
            },
            select: {
                id: true,
                key: true
            }
        });
        const idByKey = new Map();
        for (const d of defs){
            if (d.key) idByKey.set(d.key, d.id);
            idByKey.set(d.id, d.id);
        }
        const andClauses = [];
        for (const key of keys){
            const attrId = idByKey.get(key);
            if (!attrId) continue;
            const minRaw = url.searchParams.get(`attr.${key}_min`);
            const maxRaw = url.searchParams.get(`attr.${key}_max`);
            const equals = url.searchParams.getAll(`attr.${key}`).filter((x)=>x !== "");
            const min = minRaw ? Number(minRaw) : NaN;
            const max = maxRaw ? Number(maxRaw) : NaN;
            if (isNaN(min) && isNaN(max) && equals.length === 0) continue;
            const clause = {
                attributeId: attrId
            };
            if (!isNaN(min) || !isNaN(max)) {
                const nv = {};
                if (!isNaN(min)) nv.gte = min;
                if (!isNaN(max)) nv.lte = max;
                clause.numberValue = nv;
            }
            if (equals.length > 0) {
                clause.OR = equals.flatMap((val)=>[
                        {
                            optionId: val
                        },
                        {
                            textValue: val
                        }
                    ]);
            }
            andClauses.push({
                attributeValues: {
                    some: clause
                }
            });
        }
        if (andClauses.length > 0) {
            where.AND = where.AND ?? [];
            where.AND.push(...andClauses);
        }
        const [total, rows] = await Promise.all([
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listing.count({
                where
            }),
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listing.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: [
                    {
                        featured: "desc"
                    },
                    {
                        createdAt: "desc"
                    }
                ],
                include: {
                    brand: {
                        select: {
                            id: true,
                            name: true,
                            nameEn: true,
                            slug: true,
                            country: true
                        }
                    },
                    category: {
                        select: {
                            id: true,
                            name: true,
                            nameEn: true,
                            slug: true,
                            icon: true
                        }
                    },
                    images: {
                        take: 1,
                        orderBy: {
                            sortOrder: "asc"
                        }
                    }
                }
            })
        ]);
        const data = rows.map((l)=>({
                ...l,
                price: l.price ? l.price.toString() : null
            }));
        // P2-23 Demand Engine — log the search (fire-and-forget).
        if (q) {
            Promise.resolve().then(async ()=>{
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$demand$2d$engine$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logSearchQuery"])({
                    query: q,
                    resultCount: total,
                    ip: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$request$2d$context$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getClientIp"])(req),
                    categorySlug: category || null,
                    brandSlug: brand || null
                });
            }).catch(()=>{
            /* demand logging must never break search */ });
            // P1-2 — track as AnalyticsEvent (fire-and-forget).
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$analytics$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["trackEvent"])({
                eventType: "SEARCH",
                query: q,
                page: "/api/listings",
                ip: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$request$2d$context$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getClientIp"])(req)
            });
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            success: true,
            count: total,
            data
        });
    } catch (err) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: err?.message ?? "Server error"
        }, {
            status: 500
        });
    }
}
async function POST(req) {
    try {
        const body = await req.json().catch(()=>({}));
        const title = String(body.title ?? "").trim();
        if (!title || title.length < 3) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "عنوان آگهی معتبر نیست"
            }, {
                status: 400
            });
        }
        if (!body.brandId && !body.categoryId) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "برند یا دسته‌بندی الزامی است"
            }, {
                status: 400
            });
        }
        const slug = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["uniqueSlug"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listing, body.slug || title);
        const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getCurrentUser"])();
        const data = {
            slug,
            title,
            description: body.description ?? null,
            shortDesc: body.shortDesc ?? null,
            price: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseBig"])(body.price),
            priceType: body.priceType || "NEGOTIABLE",
            listingType: body.listingType || "SALE",
            condition: body.condition || "USED",
            province: body.province ?? null,
            city: body.city ?? null,
            year: body.year ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseNumber"])(body.year) : null,
            workingHours: body.workingHours ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseNumber"])(body.workingHours) : null,
            status: "PENDING",
            featured: false,
            verified: false,
            showInLatest: true,
            sellerPhone: body.sellerPhone ?? null,
            sellerName: body.sellerName ?? null,
            brandId: body.brandId || null,
            categoryId: body.categoryId || null,
            modelId: body.modelId || null,
            sellerId: user?.id ?? null,
            companyId: body.companyId || null,
            publishedAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        };
        // P2-5b — Rental fields (additive; only stored when listingType=RENT).
        if ((body.listingType || body.transactionType) === "RENT") {
            if (body.rentalPeriod) data.rentalPeriod = String(body.rentalPeriod);
            if (body.deposit !== undefined && body.deposit !== "") {
                const dep = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseBig"])(body.deposit);
                if (dep !== null) data.deposit = dep;
            }
            if (body.minimumRentalPeriod !== undefined && body.minimumRentalPeriod !== "") {
                const minP = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$helpers$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseNumber"])(body.minimumRentalPeriod);
                if (minP !== null) data.minimumRentalPeriod = minP;
            }
            if (body.operatorIncluded !== undefined) data.operatorIncluded = !!body.operatorIncluded;
            if (body.fuelIncluded !== undefined) data.fuelIncluded = !!body.fuelIncluded;
            if (body.transportIncluded !== undefined) data.transportIncluded = !!body.transportIncluded;
            if (body.availabilityStart) {
                const d = new Date(body.availabilityStart);
                if (!isNaN(d.getTime())) data.availabilityStart = d;
            }
            if (body.availabilityEnd) {
                const d = new Date(body.availabilityEnd);
                if (!isNaN(d.getTime())) data.availabilityEnd = d;
            }
        }
        const listing = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listing.create({
            data
        });
        if (Array.isArray(body.images)) {
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listingImage.createMany({
                data: body.images.slice(0, 10).map((img, idx)=>({
                        listingId: listing.id,
                        url: String(img.url ?? img),
                        alt: img.alt ?? null,
                        isPrimary: idx === 0,
                        sortOrder: idx
                    }))
            });
        }
        // P1-2 — track LISTING_CREATE (fire-and-forget).
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$analytics$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["trackEvent"])({
            eventType: "LISTING_CREATE",
            listingId: listing.id,
            userId: user?.id ?? null,
            categoryId: listing.categoryId ?? null,
            brandId: listing.brandId ?? null,
            page: "/api/listings"
        });
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ok: true,
            id: listing.id,
            slug: listing.slug,
            status: listing.status
        });
    } catch (err) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: err?.message ?? "Server error"
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__d3c8aa59._.js.map