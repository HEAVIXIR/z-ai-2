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
"[project]/src/lib/recommendations.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_LIMIT",
    ()=>DEFAULT_LIMIT,
    "REASON_LABEL_FA",
    ()=>REASON_LABEL_FA,
    "RECOMMENDATION_REASONS",
    ()=>RECOMMENDATION_REASONS,
    "dismissRecommendation",
    ()=>dismissRecommendation,
    "generateRecommendations",
    ()=>generateRecommendations,
    "getRecommendations",
    ()=>getRecommendations,
    "recordRecommendationClick",
    ()=>recordRecommendationClick
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
;
const RECOMMENDATION_REASONS = [
    "SIMILAR_TO_VIEWED",
    "SAME_CATEGORY",
    "SAME_BRAND",
    "PRICE_DROP",
    "NEW_IN_WATCHLIST_CATEGORY",
    "TRENDING"
];
const REASON_LABEL_FA = {
    SIMILAR_TO_VIEWED: "مشابه آگهی‌های دیده‌شده",
    SAME_CATEGORY: "همان دسته‌بندی",
    SAME_BRAND: "همان برند",
    PRICE_DROP: "کاهش قیمت",
    NEW_IN_WATCHLIST_CATEGORY: "جدید در دسته‌های تحت پیگیری",
    TRENDING: "پربازدیدترین‌ها"
};
const DEFAULT_LIMIT = 12;
const WATCH_WINDOW_DAYS = 30;
const NEW_WINDOW_DAYS = 7;
const TRENDING_LIMIT = 12;
const MAX_PER_REASON = 8;
async function generateRecommendations(userId, limit = DEFAULT_LIMIT) {
    if (!userId) return [];
    // 1) User's favorite listings (the closest signal we have on
    //    SQLite without a ListingView table). Favorites give us the
    //    (categoryId, brandId) affinity vector.
    const favorites = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].favorite.findMany({
        where: {
            userId
        },
        select: {
            listingId: true,
            listing: {
                select: {
                    id: true,
                    categoryId: true,
                    brandId: true,
                    status: true
                }
            }
        },
        orderBy: {
            createdAt: "desc"
        },
        take: 50
    });
    // Build the affinity vectors.
    const watchedListingIds = new Set();
    const categoryAffinity = new Map(); // categoryId → weight
    const brandAffinity = new Map(); // brandId → weight
    for (const f of favorites){
        if (!f.listing) continue;
        watchedListingIds.add(f.listing.id);
        if (f.listing.categoryId) {
            categoryAffinity.set(f.listing.categoryId, (categoryAffinity.get(f.listing.categoryId) ?? 0) + 1);
        }
        if (f.listing.brandId) {
            brandAffinity.set(f.listing.brandId, (brandAffinity.get(f.listing.brandId) ?? 0) + 1);
        }
    }
    // Normalize affinity weights to 0..1.
    const maxCat = Math.max(1, ...categoryAffinity.values());
    const maxBrand = Math.max(1, ...brandAffinity.values());
    categoryAffinity.forEach((v, k)=>categoryAffinity.set(k, v / maxCat));
    brandAffinity.forEach((v, k)=>brandAffinity.set(k, v / maxBrand));
    // The set of listing IDs the user has already favorited — we
    // never recommend those.
    const excludeIds = Array.from(watchedListingIds);
    // Holds the (listingId, reason, score) triples we want to upsert.
    // Map key = `${listingId}::${reason}` for dedup.
    const candidates = new Map();
    /* --- 2a) SIMILAR_TO_VIEWED / SAME_CATEGORY / SAME_BRAND --- */ if (categoryAffinity.size > 0 || brandAffinity.size > 0) {
        const watchedListings = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listing.findMany({
            where: {
                status: "PUBLISHED",
                id: {
                    in: Array.from(watchedListingIds)
                }
            },
            select: {
                id: true,
                categoryId: true,
                brandId: true
            }
        });
        // For each watched listing, find similar listings in the same
        // category OR with the same brand.
        for (const wl of watchedListings){
            if (!wl.categoryId && !wl.brandId) continue;
            const similar = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listing.findMany({
                where: {
                    status: "PUBLISHED",
                    id: {
                        notIn: excludeIds
                    },
                    OR: [
                        ...wl.categoryId ? [
                            {
                                categoryId: wl.categoryId
                            }
                        ] : [],
                        ...wl.brandId ? [
                            {
                                brandId: wl.brandId
                            }
                        ] : []
                    ]
                },
                select: {
                    id: true,
                    categoryId: true,
                    brandId: true
                },
                orderBy: {
                    viewCount: "desc"
                },
                take: MAX_PER_REASON
            });
            for (const s of similar){
                const sameCat = wl.categoryId && s.categoryId === wl.categoryId;
                const sameBrand = wl.brandId && s.brandId === wl.brandId;
                // Score: stronger if both cat + brand match; weight by affinity.
                let score = 0.4; // base
                if (sameCat) {
                    score += 0.3 * (categoryAffinity.get(s.categoryId) ?? 0);
                }
                if (sameBrand) {
                    score += 0.3 * (brandAffinity.get(s.brandId) ?? 0);
                }
                score = Math.min(1, score);
                // Reason priority: SIMILAR_TO_VIEWED if both match,
                // SAME_CATEGORY if only cat matches, SAME_BRAND if only brand.
                const reason = sameCat && sameBrand ? "SIMILAR_TO_VIEWED" : sameCat ? "SAME_CATEGORY" : "SAME_BRAND";
                const key = `${s.id}::${reason}`;
                const prev = candidates.get(key);
                if (!prev || prev.score < score) {
                    candidates.set(key, {
                        listingId: s.id,
                        reason,
                        score
                    });
                }
            }
        }
    }
    /* --- 2b) NEW_IN_WATCHLIST_CATEGORY ---
     Listings published in the last NEW_WINDOW_DAYS in a category
     the user has shown interest in. */ if (categoryAffinity.size > 0) {
        const newCutoff = new Date(Date.now() - NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const freshInWatchedCats = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listing.findMany({
            where: {
                status: "PUBLISHED",
                id: {
                    notIn: excludeIds
                },
                categoryId: {
                    in: Array.from(categoryAffinity.keys())
                },
                createdAt: {
                    gte: newCutoff
                }
            },
            select: {
                id: true,
                categoryId: true,
                createdAt: true
            },
            orderBy: {
                createdAt: "desc"
            },
            take: MAX_PER_REASON * 2
        });
        for (const l of freshInWatchedCats){
            const affinity = categoryAffinity.get(l.categoryId) ?? 0;
            // Newer + higher-affinity → higher score.
            const ageDays = (Date.now() - l.createdAt.getTime()) / (24 * 60 * 60 * 1000);
            const recencyBoost = Math.max(0, 1 - ageDays / NEW_WINDOW_DAYS);
            const score = Math.min(1, 0.3 + affinity * 0.4 + recencyBoost * 0.3);
            const key = `${l.id}::NEW_IN_WATCHLIST_CATEGORY`;
            const prev = candidates.get(key);
            if (!prev || prev.score < score) {
                candidates.set(key, {
                    listingId: l.id,
                    reason: "NEW_IN_WATCHLIST_CATEGORY",
                    score
                });
            }
        }
    }
    /* --- 2c) TRENDING ---
     Highest viewCount listings published in the last WATCH_WINDOW_DAYS.
     Always added so cold-start users get a feed. */ const trendingCutoff = new Date(Date.now() - WATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const trending = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listing.findMany({
        where: {
            status: "PUBLISHED",
            id: {
                notIn: excludeIds
            },
            // Use createdAt as the trending window (older listings with
            // high viewCount aren't really "trending" anymore).
            createdAt: {
                gte: trendingCutoff
            }
        },
        select: {
            id: true,
            viewCount: true
        },
        orderBy: {
            viewCount: "desc"
        },
        take: TRENDING_LIMIT
    });
    const maxViews = Math.max(1, ...trending.map((t)=>t.viewCount ?? 0));
    for (const t of trending){
        const score = Math.min(1, 0.3 + 0.7 * ((t.viewCount ?? 0) / maxViews));
        const key = `${t.id}::TRENDING`;
        const prev = candidates.get(key);
        if (!prev || prev.score < score) {
            candidates.set(key, {
                listingId: t.id,
                reason: "TRENDING",
                score
            });
        }
    }
    // If we still have no candidates (cold-start with no favorites),
    // fall back to all-time trending + newest published listings.
    if (candidates.size === 0) {
        const fallback = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].listing.findMany({
            where: {
                status: "PUBLISHED"
            },
            orderBy: [
                {
                    featured: "desc"
                },
                {
                    viewCount: "desc"
                }
            ],
            take: TRENDING_LIMIT,
            select: {
                id: true,
                viewCount: true
            }
        });
        const fbMaxViews = Math.max(1, ...fallback.map((t)=>t.viewCount ?? 0));
        for (const t of fallback){
            const score = Math.min(1, 0.3 + 0.7 * ((t.viewCount ?? 0) / fbMaxViews));
            candidates.set(`${t.id}::TRENDING`, {
                listingId: t.id,
                reason: "TRENDING",
                score
            });
        }
    }
    // Cap to the requested limit (after sorting by score desc).
    const sorted = Array.from(candidates.values()).sort((a, b)=>b.score - a.score);
    const top = sorted.slice(0, Math.max(1, limit));
    // Upsert into UserRecommendation. On conflict (same userId +
    // listingId + reason), only refresh `score`. We deliberately do
    // NOT touch `dismissed` — a dismissed rec stays dismissed even
    // when its score bumps up.
    await Promise.all(top.map((c)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userRecommendation.upsert({
            where: {
                userId_listingId_reason: {
                    userId,
                    listingId: c.listingId,
                    reason: c.reason
                }
            },
            create: {
                userId,
                listingId: c.listingId,
                reason: c.reason,
                score: c.score,
                dismissed: false
            },
            update: {
                score: c.score
            }
        })));
    // Return the active (non-dismissed) recommendations, ordered by
    // score desc, createdAt desc — same shape as `getRecommendations`
    // but without the Listing join (callers wanting the listings
    // should call `getRecommendations`).
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userRecommendation.findMany({
        where: {
            userId,
            dismissed: false
        },
        orderBy: [
            {
                score: "desc"
            },
            {
                createdAt: "desc"
            }
        ],
        take: Math.max(1, limit)
    });
}
async function getRecommendations(userId, limit = DEFAULT_LIMIT, opts = {}) {
    if (!userId) return [];
    if (opts.refresh) {
        await generateRecommendations(userId, limit);
    }
    const rows = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userRecommendation.findMany({
        where: {
            userId,
            dismissed: false
        },
        orderBy: [
            {
                score: "desc"
            },
            {
                createdAt: "desc"
            }
        ],
        take: Math.max(1, limit),
        include: {
            listing: {
                include: {
                    brand: {
                        select: {
                            id: true,
                            name: true,
                            nameEn: true,
                            slug: true
                        }
                    },
                    category: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            icon: true
                        }
                    },
                    images: {
                        orderBy: [
                            {
                                isPrimary: "desc"
                            },
                            {
                                sortOrder: "asc"
                            }
                        ]
                    }
                }
            }
        }
    });
    return rows.map((r)=>({
            ...r.listing,
            reason: r.reason,
            score: r.score,
            recommendationId: r.id
        }));
}
async function dismissRecommendation(userId, listingId, reason) {
    if (!userId || !listingId || !reason) return;
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userRecommendation.updateMany({
        where: {
            userId,
            listingId,
            reason
        },
        data: {
            dismissed: true
        }
    });
}
async function recordRecommendationClick(userId, listingId, reason) {
    if (!userId || !listingId || !reason) return;
    await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userRecommendation.updateMany({
        where: {
            userId,
            listingId,
            reason
        },
        data: {
            clickedAt: new Date()
        }
    });
}
}),
"[project]/src/app/api/recommendations/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$recommendations$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/recommendations.ts [app-route] (ecmascript)");
;
;
;
;
const runtime = "nodejs";
const dynamic = "force-dynamic";
/* ============================================================
   /api/recommendations — user-facing recommendation feed.

   GET   — returns the current user's active recommendations.
           Auth required. Auto-refreshes the feed on each GET.
   POST  — { listingId, reason, action: "dismiss"|"click" }
           Records a dismiss or click on a recommendation.
           Auth required.
   ============================================================ */ const REASON_LABEL_FA = {
    SIMILAR_TO_VIEWED: "مشابه آگهی‌های دیده‌شده",
    SAME_CATEGORY: "همان دسته‌بندی",
    SAME_BRAND: "همان برند",
    PRICE_DROP: "کاهش قیمت",
    NEW_IN_WATCHLIST_CATEGORY: "جدید در دسته‌های تحت پیگیری",
    TRENDING: "پربازدیدترین‌ها"
};
function serialize(listing) {
    return {
        id: listing.id,
        slug: listing.slug,
        title: listing.title,
        shortDesc: listing.shortDesc,
        description: listing.description,
        price: listing.price ? listing.price.toString() : null,
        priceType: listing.priceType,
        listingType: listing.listingType,
        condition: listing.condition,
        province: listing.province,
        city: listing.city,
        year: listing.year,
        workingHours: listing.workingHours,
        featured: listing.featured,
        verified: listing.verified,
        viewCount: listing.viewCount,
        brand: listing.brand,
        category: listing.category,
        image: listing.images?.[0]?.url ?? null,
        // Recommendation metadata
        reason: listing.reason,
        reasonLabel: REASON_LABEL_FA[listing.reason] ?? listing.reason,
        score: listing.score,
        recommendationId: listing.recommendationId
    };
}
async function GET(req) {
    try {
        const userId = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getCurrentUserId"])();
        if (!userId) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "Unauthorized"
            }, {
                status: 401
            });
        }
        const url = new URL(req.url);
        const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$recommendations$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["DEFAULT_LIMIT"]));
        const refresh = (url.searchParams.get("refresh") ?? "1") !== "0";
        // Generate (refresh) recommendations on each GET — generateRecommendations
        // is idempotent (upsert) so this is safe.
        if (refresh) {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$recommendations$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["generateRecommendations"])(userId, limit);
        }
        const listings = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$recommendations$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getRecommendations"])(userId, limit, {
            refresh: false
        });
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            success: true,
            count: listings.length,
            data: listings.map(serialize)
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
        const userId = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getCurrentUserId"])();
        if (!userId) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "Unauthorized"
            }, {
                status: 401
            });
        }
        const body = await req.json().catch(()=>({}));
        const listingId = String(body.listingId ?? "");
        const reason = String(body.reason ?? "");
        const action = String(body.action ?? "").toLowerCase();
        if (!listingId || !reason) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "listingId and reason are required"
            }, {
                status: 400
            });
        }
        if (!__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$recommendations$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["RECOMMENDATION_REASONS"].includes(reason)) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "Invalid reason"
            }, {
                status: 400
            });
        }
        if (action !== "dismiss" && action !== "click") {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'action must be "dismiss" or "click"'
            }, {
                status: 400
            });
        }
        // Verify the recommendation belongs to the user.
        const rec = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].userRecommendation.findUnique({
            where: {
                userId_listingId_reason: {
                    userId,
                    listingId,
                    reason
                }
            }
        });
        if (!rec) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "Recommendation not found"
            }, {
                status: 404
            });
        }
        if (action === "dismiss") {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$recommendations$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["dismissRecommendation"])(userId, listingId, reason);
        } else {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$recommendations$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["recordRecommendationClick"])(userId, listingId, reason);
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            success: true,
            action
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

//# sourceMappingURL=%5Broot-of-the-server%5D__e2520bde._.js.map