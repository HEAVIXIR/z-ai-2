module.exports = [
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[project]/src/lib/db.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/auth.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:crypto [external] (node:crypto, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-rsc] (ecmascript)");
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
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["db"].adminSession.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date(now)
                }
            }
        });
    } catch  {
    /* ignore */ }
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["db"].adminSession.create({
        data: {
            tokenHash,
            username: ADMIN_CREDENTIALS.username,
            expiresAt
        }
    });
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    store.set(ADMIN_COOKIE, rawToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        maxAge: ADMIN_SESSION_MAX_AGE,
        path: "/"
    });
}
async function destroySession() {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    const rawToken = store.get(ADMIN_COOKIE)?.value;
    if (rawToken) {
        try {
            const tokenHash = hashToken(rawToken);
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["db"].adminSession.deleteMany({
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
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    const rawToken = store.get(ADMIN_COOKIE)?.value;
    if (!rawToken) return false;
    try {
        const tokenHash = hashToken(rawToken);
        const session = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["db"].adminSession.findUnique({
            where: {
                tokenHash
            }
        });
        if (!session) return false;
        if (session.expiresAt.getTime() < Date.now()) {
            // Prune expired session on read.
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["db"].adminSession.delete({
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
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["db"].session.create({
        data: {
            userId,
            token: rawToken,
            expiresAt
        }
    });
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    store.set(USER_COOKIE, rawToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        maxAge: USER_SESSION_MAX_AGE,
        path: "/"
    });
}
async function destroyUserSession() {
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    const token = store.get(USER_COOKIE)?.value;
    if (token) {
        try {
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["db"].session.deleteMany({
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
    const store = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
    const token = store.get(USER_COOKIE)?.value;
    if (!token) return null;
    try {
        const session = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["db"].session.findUnique({
            where: {
                token
            },
            include: {
                user: true
            }
        });
        if (!session) return null;
        if (session.expiresAt.getTime() < Date.now()) {
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["db"].session.delete({
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
"[project]/src/lib/rbac-legacy.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-rsc] (ecmascript)");
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
        const userRoles = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["db"].userRole.findMany({
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
"[project]/src/lib/authorization/index.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2d$legacy$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/rbac-legacy.ts [app-rsc] (ecmascript)");
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
    const perms = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2d$legacy$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getUserPermissions"])(userId);
    return perms.includes(permission);
}
async function canAny(userId, permissions) {
    if (!userId || permissions.length === 0) return false;
    const perms = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2d$legacy$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getUserPermissions"])(userId);
    return permissions.some((p)=>perms.includes(p));
}
async function canAll(userId, permissions) {
    if (!userId) return false;
    const perms = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2d$legacy$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getUserPermissions"])(userId);
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
        const adminRole = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["db"].userRole.findFirst({
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
        const row = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["db"].$queryRawUnsafe(`SELECT "${options.ownerField}" as owner_id FROM "${resource}" WHERE id = $1`, resourceId);
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
"[project]/src/app/admin/LogoutButton.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/src/app/admin/LogoutButton.tsx <module evaluation> from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/app/admin/LogoutButton.tsx <module evaluation>", "default");
}),
"[project]/src/app/admin/LogoutButton.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/src/app/admin/LogoutButton.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/app/admin/LogoutButton.tsx", "default");
}),
"[project]/src/app/admin/LogoutButton.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$admin$2f$LogoutButton$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/src/app/admin/LogoutButton.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$admin$2f$LogoutButton$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/app/admin/LogoutButton.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$admin$2f$LogoutButton$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/src/components/admin/AdminSidebarNav.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/src/components/admin/AdminSidebarNav.tsx <module evaluation> from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/admin/AdminSidebarNav.tsx <module evaluation>", "default");
}),
"[project]/src/components/admin/AdminSidebarNav.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/src/components/admin/AdminSidebarNav.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/admin/AdminSidebarNav.tsx", "default");
}),
"[project]/src/components/admin/AdminSidebarNav.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$admin$2f$AdminSidebarNav$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/src/components/admin/AdminSidebarNav.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$admin$2f$AdminSidebarNav$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/components/admin/AdminSidebarNav.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$admin$2f$AdminSidebarNav$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/src/app/admin/layout.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AdminLayout,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/authorization/index.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$admin$2f$LogoutButton$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/app/admin/LogoutButton.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$admin$2f$AdminSidebarNav$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/admin/AdminSidebarNav.tsx [app-rsc] (ecmascript)");
;
;
;
;
;
;
;
const dynamic = "force-dynamic";
async function AdminLayout({ children }) {
    // STEP 03: RBAC-only path — no more AdminSession cookie fallback.
    const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();
    if (!user) (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])("/login");
    const adminOk = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["isAdmin"])(user.id);
    if (!adminOk) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])("/dashboard");
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        dir: "rtl",
        className: "min-h-screen bg-zinc-100 text-zinc-900",
        style: {
            "--admin-sidebar-width": "18rem"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                className: "fixed inset-y-0 right-0 z-[100] flex flex-col bg-zinc-950 text-white shadow-2xl",
                style: {
                    width: "var(--admin-sidebar-width)"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "shrink-0 border-b border-zinc-800 px-5 py-5",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                    src: "/logos/heavix-logo.svg",
                                    alt: "HEAVIX",
                                    className: "h-9 w-auto"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/admin/layout.tsx",
                                    lineNumber: 47,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mr-auto",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-[10px] text-zinc-500",
                                        children: "پنل مدیریت"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/admin/layout.tsx",
                                        lineNumber: 53,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/admin/layout.tsx",
                                    lineNumber: 52,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/admin/layout.tsx",
                            lineNumber: 45,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/admin/layout.tsx",
                        lineNumber: 44,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                        className: "min-h-0 flex-1 overflow-y-auto px-3 py-4",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$admin$2f$AdminSidebarNav$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/app/admin/layout.tsx",
                            lineNumber: 60,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/admin/layout.tsx",
                        lineNumber: 59,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "shrink-0 border-t border-zinc-800 p-3",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$app$2f$admin$2f$LogoutButton$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
                            fileName: "[project]/src/app/admin/layout.tsx",
                            lineNumber: 65,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/admin/layout.tsx",
                        lineNumber: 64,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/admin/layout.tsx",
                lineNumber: 39,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex min-h-screen min-w-0 flex-col",
                style: {
                    marginRight: "var(--admin-sidebar-width)"
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                        className: "sticky top-0 z-40 flex min-h-20 shrink-0 items-center justify-between border-b border-zinc-200 bg-white/95 px-6 shadow-sm backdrop-blur lg:px-8",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        className: "truncate text-xl font-black text-zinc-900",
                                        children: "پنل مدیریت هویکس"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/admin/layout.tsx",
                                        lineNumber: 77,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-1 truncate text-xs text-zinc-500",
                                        children: "مدیریت آگهی‌ها، برندها و کاربران مارکت‌پلیس صنعتی"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/admin/layout.tsx",
                                        lineNumber: 80,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/admin/layout.tsx",
                                lineNumber: 76,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mr-4 flex shrink-0 items-center gap-3",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                                    href: "/",
                                    target: "_blank",
                                    rel: "noopener noreferrer",
                                    className: "inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-[#F58220] hover:text-[#F58220]",
                                    children: "مشاهده سایت"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/admin/layout.tsx",
                                    lineNumber: 85,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/admin/layout.tsx",
                                lineNumber: 84,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/admin/layout.tsx",
                        lineNumber: 75,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                        className: "min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8",
                        children: children
                    }, void 0, false, {
                        fileName: "[project]/src/app/admin/layout.tsx",
                        lineNumber: 97,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/admin/layout.tsx",
                lineNumber: 70,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/admin/layout.tsx",
        lineNumber: 33,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__028ee084._.js.map