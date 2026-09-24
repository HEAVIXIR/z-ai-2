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
"[project]/src/app/api/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
;
;
const dynamic = 'force-dynamic';
async function GET() {
    try {
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].$queryRaw`SELECT 1`;
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ok: true,
            db: 'connected',
            service: 'HEAVIX'
        });
    } catch (err) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ok: false,
            error: String(err)
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__d318f4d2._.js.map