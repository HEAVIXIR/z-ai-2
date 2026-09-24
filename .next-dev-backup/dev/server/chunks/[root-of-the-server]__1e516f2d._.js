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
"[project]/src/app/api/taxonomy/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "dynamic",
    ()=>dynamic,
    "runtime",
    ()=>runtime
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
;
;
const runtime = "nodejs";
const dynamic = "force-dynamic";
/* ============================================================
   GET /api/taxonomy — unified public Taxonomy V1.2 endpoint.

   Returns the full taxonomy structure for the frontend:
   {
     catalogRoots:       [{ id, name, slug, icon, children: [...] }]  // layer=CATALOG
     marketplaceRoots:   [...]   // layer=MARKETPLACE
     serviceRoots:       [...]   // layer=SERVICE
     transactionTypes:   [...]   // from TransactionType
     serviceTypes:       [...]   // from ServiceType
     applicationIndustries: [...] // 16 industries
   }

   Public, cached in-memory for 5 minutes (TTL).
   Roots include their direct children (level 1) for navigation dropdowns.

   V1.2: For the `machinery` CATALOG root ONLY, each L1 child also carries
   its own `children` array (the L2 families — e.g. بیل مکانیکی, لودر, بولدوزر
   under راهسازی). Other roots remain flat (1 level deep) to keep the
   response small. Required by the public mega-menu per HEAVIX-REQUIREMENTS §1.
   ============================================================ */ const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache = null;
async function buildPayload() {
    const [categories, transactionTypes, serviceTypes, applicationIndustries] = await Promise.all([
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].category.findMany({
            where: {
                active: true,
                level: {
                    lte: 2
                }
            },
            orderBy: [
                {
                    sortOrder: "asc"
                },
                {
                    name: "asc"
                }
            ],
            select: {
                id: true,
                name: true,
                nameEn: true,
                slug: true,
                icon: true,
                imageUrl: true,
                layer: true,
                level: true,
                parentId: true,
                sortOrder: true
            }
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].transactionType.findMany({
            where: {
                active: true
            },
            orderBy: [
                {
                    sortOrder: "asc"
                },
                {
                    nameFa: "asc"
                }
            ],
            select: {
                id: true,
                key: true,
                nameFa: true,
                nameEn: true,
                description: true,
                icon: true,
                sortOrder: true
            }
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].serviceType.findMany({
            where: {
                active: true
            },
            orderBy: [
                {
                    sortOrder: "asc"
                },
                {
                    nameFa: "asc"
                }
            ],
            select: {
                id: true,
                key: true,
                nameFa: true,
                nameEn: true,
                description: true,
                icon: true,
                sortOrder: true
            }
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].applicationIndustry.findMany({
            where: {
                active: true
            },
            orderBy: [
                {
                    sortOrder: "asc"
                },
                {
                    nameFa: "asc"
                }
            ],
            select: {
                id: true,
                key: true,
                nameFa: true,
                nameEn: true,
                icon: true,
                sortOrder: true
            }
        })
    ]);
    const nodes = new Map();
    categories.forEach((c)=>nodes.set(c.id, {
            id: c.id,
            name: c.name,
            nameEn: c.nameEn,
            slug: c.slug,
            icon: c.icon,
            imageUrl: c.imageUrl,
            layer: c.layer,
            level: c.level,
            sortOrder: c.sortOrder,
            children: []
        }));
    const roots = [];
    categories.forEach((c)=>{
        const node = nodes.get(c.id);
        if (c.parentId && nodes.has(c.parentId)) {
            // Push the full node (which carries its own children) so we can later
            // surface L2 grandchildren for the machinery root.
            nodes.get(c.parentId).children.push(node);
        } else if (c.level === 0) {
            roots.push(node);
        }
    });
    // Build a flat child payload. When `withGrandchildren` is true, the L2
    // grandchildren are attached under each child (used for machinery only).
    const toChild = (n, withGrandchildren)=>{
        const base = {
            id: n.id,
            name: n.name,
            nameEn: n.nameEn,
            slug: n.slug,
            icon: n.icon
        };
        if (withGrandchildren && n.children.length > 0) {
            base.children = n.children.map((gc)=>({
                    id: gc.id,
                    name: gc.name,
                    nameEn: gc.nameEn,
                    slug: gc.slug,
                    icon: gc.icon
                }));
        }
        return base;
    };
    const byLayer = (layer)=>roots.filter((r)=>r.layer === layer).map((r)=>{
            // V1.2: only the machinery root exposes L2 grandchildren.
            const isMachinery = r.slug === "machinery";
            return {
                id: r.id,
                name: r.name,
                nameEn: r.nameEn,
                slug: r.slug,
                icon: r.icon,
                imageUrl: r.imageUrl,
                sortOrder: r.sortOrder,
                children: r.children.map((ch)=>toChild(ch, isMachinery))
            };
        });
    return {
        catalogRoots: byLayer("CATALOG"),
        marketplaceRoots: byLayer("MARKETPLACE"),
        serviceRoots: byLayer("SERVICE"),
        transactionTypes: transactionTypes.map((t)=>({
                id: t.id,
                key: t.key,
                nameFa: t.nameFa,
                nameEn: t.nameEn,
                description: t.description,
                icon: t.icon,
                sortOrder: t.sortOrder
            })),
        serviceTypes: serviceTypes.map((t)=>({
                id: t.id,
                key: t.key,
                nameFa: t.nameFa,
                nameEn: t.nameEn,
                description: t.description,
                icon: t.icon,
                sortOrder: t.sortOrder
            })),
        applicationIndustries: applicationIndustries.map((i)=>({
                id: i.id,
                key: i.key,
                nameFa: i.nameFa,
                nameEn: i.nameEn,
                icon: i.icon,
                sortOrder: i.sortOrder
            })),
        // Convenience: FALLBACK layer (categories that don't fit a specific layer)
        fallbackRoots: byLayer("FALLBACK")
    };
}
async function GET() {
    try {
        const now = Date.now();
        if (cache && cache.expiresAt > now) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(cache.data);
        }
        const data = await buildPayload();
        cache = {
            data,
            expiresAt: now + CACHE_TTL_MS
        };
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(data);
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

//# sourceMappingURL=%5Broot-of-the-server%5D__1e516f2d._.js.map