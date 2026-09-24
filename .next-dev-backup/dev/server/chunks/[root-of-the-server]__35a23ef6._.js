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
"[project]/src/lib/admin/resource-registry.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * HEAVIX — STEP 05: Admin Resource Registry
 *
 * Central registry for all admin resources. Each resource defines
 * its columns, filters, fields, actions, and permissions.
 * The <AdminResource> component uses this registry to render
 * tables, forms, and details automatically.
 *
 * Usage:
 *   import { registry, registerResource } from '@/lib/admin/resource-registry';
 *   import { listingConfig } from './resources/listing';
 *
 *   registerResource(listingConfig);
 *
 *   const config = registry.get('listings');
 */ __turbopack_context__.s([
    "getResource",
    ()=>getResource,
    "registerResource",
    ()=>registerResource,
    "registry",
    ()=>registry
]);
// ── Registry singleton ──────────────────────────────────────
const _registry = {
    resources: new Map(),
    register (config) {
        _registry.resources.set(config.key, config);
        if ("TURBOPACK compile-time truthy", 1) {
            console.log(`[registry] registered resource: ${config.key} (${config.titleFa})`);
        }
    },
    get (key) {
        return _registry.resources.get(key);
    },
    list () {
        return Array.from(_registry.resources.values());
    },
    has (key) {
        return _registry.resources.has(key);
    }
};
const registry = _registry;
function registerResource(config) {
    _registry.register(config);
}
function getResource(key) {
    const config = _registry.get(key);
    if (!config) {
        throw new Error(`Admin resource "${key}" not registered`);
    }
    return config;
}
}),
"[project]/src/lib/admin/resources/listing.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "listingConfig",
    ()=>listingConfig
]);
const listingConfig = {
    key: 'listings',
    titleFa: 'آگهی‌ها',
    titleEn: 'Listings',
    icon: 'Megaphone',
    model: 'listing',
    apiBase: '/api/admin/listings',
    adminPath: '/admin/listings',
    permissions: {
        read: 'listing.read',
        create: 'listing.create',
        update: 'listing.update',
        delete: 'listing.delete',
        export: 'listing.export'
    },
    columns: [
        {
            key: 'title',
            label: 'عنوان',
            type: 'text',
            sortable: true,
            filterable: true,
            visible: true
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true,
            visible: true
        },
        {
            key: 'listingType',
            label: 'نوع',
            type: 'badge',
            sortable: true,
            filterable: true,
            visible: true
        },
        {
            key: 'price',
            label: 'قیمت',
            type: 'currency',
            sortable: true,
            visible: true
        },
        {
            key: 'condition',
            label: 'وضعیت دستگاه',
            type: 'text',
            visible: true
        },
        {
            key: 'city',
            label: 'شهر',
            type: 'text',
            filterable: true,
            visible: true
        },
        {
            key: 'year',
            label: 'سال',
            type: 'number',
            sortable: true,
            visible: true
        },
        {
            key: 'viewCount',
            label: 'بازدید',
            type: 'number',
            sortable: true,
            visible: false
        },
        {
            key: 'featured',
            label: 'ویژه',
            type: 'boolean',
            sortable: true,
            visible: false
        },
        {
            key: 'verified',
            label: 'تأییدشده',
            type: 'boolean',
            sortable: true,
            visible: false
        },
        {
            key: 'createdAt',
            label: 'تاریخ ایجاد',
            type: 'date',
            sortable: true,
            visible: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'PUBLISHED',
                    label: 'منتشرشده'
                },
                {
                    value: 'DRAFT',
                    label: 'پیش‌نویس'
                },
                {
                    value: 'REJECTED',
                    label: 'ردشده'
                },
                {
                    value: 'SOLD',
                    label: 'فروخته‌شده'
                }
            ]
        },
        {
            key: 'listingType',
            label: 'نوع معامله',
            type: 'select',
            options: [
                {
                    value: 'SALE',
                    label: 'فروش'
                },
                {
                    value: 'RENT',
                    label: 'اجاره'
                },
                {
                    value: 'WANTED',
                    label: 'درخواست خرید'
                }
            ]
        },
        {
            key: 'featured',
            label: 'فقط ویژه‌ها',
            type: 'boolean'
        },
        {
            key: 'verified',
            label: 'فقط تأییدشده‌ها',
            type: 'boolean'
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'title',
        'description',
        'city',
        'sellerName',
        'sellerPhone'
    ],
    fields: [
        {
            key: 'title',
            label: 'عنوان',
            type: 'text',
            required: true,
            placeholder: 'عنوان آگهی'
        },
        {
            key: 'slug',
            label: 'اسلاگ',
            type: 'slug',
            slugFrom: 'title',
            visible: false
        },
        {
            key: 'description',
            label: 'توضیحات',
            type: 'textarea'
        },
        {
            key: 'shortDesc',
            label: 'خلاصه',
            type: 'textarea',
            helpText: 'حداکثر ۲۰۰ کاراکتر'
        },
        {
            key: 'price',
            label: 'قیمت (تومان)',
            type: 'currency'
        },
        {
            key: 'priceType',
            label: 'نوع قیمت',
            type: 'select',
            options: [
                {
                    value: 'NEGOTIABLE',
                    label: 'توافقی'
                },
                {
                    value: 'FIXED',
                    label: 'ثابت'
                }
            ]
        },
        {
            key: 'listingType',
            label: 'نوع معامله',
            type: 'select',
            options: [
                {
                    value: 'SALE',
                    label: 'فروش'
                },
                {
                    value: 'RENT',
                    label: 'اجاره'
                }
            ]
        },
        {
            key: 'condition',
            label: 'وضعیت دستگاه',
            type: 'select',
            options: [
                {
                    value: 'NEW',
                    label: 'نو'
                },
                {
                    value: 'EXCELLENT',
                    label: 'عالی'
                },
                {
                    value: 'GOOD',
                    label: 'خوب'
                },
                {
                    value: 'FAIR',
                    label: 'متوسط'
                },
                {
                    value: 'NEEDS_REPAIR',
                    label: 'نیاز به تعمیر'
                }
            ]
        },
        {
            key: 'year',
            label: 'سال ساخت',
            type: 'number'
        },
        {
            key: 'workingHours',
            label: 'ساعت کارکرد',
            type: 'number'
        },
        {
            key: 'province',
            label: 'استان',
            type: 'text'
        },
        {
            key: 'city',
            label: 'شهر',
            type: 'text'
        },
        {
            key: 'sellerPhone',
            label: 'تماس',
            type: 'text'
        },
        {
            key: 'sellerName',
            label: 'نام فروشنده',
            type: 'text'
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'PUBLISHED',
                    label: 'منتشرشده'
                },
                {
                    value: 'DRAFT',
                    label: 'پیش‌نویس'
                },
                {
                    value: 'SOLD',
                    label: 'فروخته‌شده'
                }
            ]
        }
    ],
    detailTabs: [
        {
            key: 'overview',
            label: 'مشاهده کلی',
            type: 'overview'
        },
        {
            key: 'attributes',
            label: 'ویژگی‌ها',
            type: 'relations'
        },
        {
            key: 'media',
            label: 'تصاویر',
            type: 'media'
        },
        {
            key: 'activity',
            label: 'فعالیت',
            type: 'activity'
        },
        {
            key: 'audit',
            label: 'ممیزی',
            type: 'audit'
        }
    ],
    actions: [
        {
            key: 'publish',
            label: 'انتشار',
            icon: 'CheckCircle',
            permission: 'listing.publish',
            type: 'confirm',
            variant: 'default',
            confirmMessage: 'این آگهی منتشر شود؟'
        },
        {
            key: 'feature',
            label: 'ویژه کردن',
            icon: 'Star',
            permission: 'listing.update',
            type: 'confirm',
            confirmMessage: 'این آگهی ویژه شود؟'
        },
        {
            key: 'verify',
            label: 'تأیید',
            icon: 'ShieldCheck',
            permission: 'listing.update',
            type: 'confirm',
            confirmMessage: 'این آگهی تأیید شود؟'
        },
        {
            key: 'delete',
            label: 'حذف',
            icon: 'Trash2',
            permission: 'listing.delete',
            type: 'confirm',
            variant: 'destructive',
            confirmMessage: 'این آگهی حذف شود؟ این عملیات قابل بازگشت نیست.'
        }
    ],
    bulkActions: [
        {
            key: 'bulk-publish',
            label: 'انتشار گروهی',
            icon: 'CheckCircle',
            permission: 'listing.publish',
            type: 'confirm',
            confirmMessage: 'آگهی‌های انتخاب‌شده منتشر شوند؟'
        },
        {
            key: 'bulk-feature',
            label: 'ویژه کردن گروهی',
            icon: 'Star',
            permission: 'listing.update',
            type: 'confirm',
            confirmMessage: 'آگهی‌های انتخاب‌شده ویژه شوند؟'
        },
        {
            key: 'bulk-delete',
            label: 'حذف گروهی',
            icon: 'Trash2',
            permission: 'listing.delete',
            type: 'confirm',
            confirmMessage: 'آگهی‌های انتخاب‌شده حذف شوند؟'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Listing',
        actions: [
            'listing.publish',
            'listing.update',
            'listing.delete',
            'listing.moderate'
        ]
    },
    relations: [
        {
            label: 'تصاویر',
            resource: 'listing-images',
            filterField: 'listingId'
        },
        {
            label: 'پیشنهادها',
            resource: 'offers',
            filterField: 'listingId'
        }
    ]
};
}),
"[project]/src/lib/admin/resources/brand.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "brandConfig",
    ()=>brandConfig
]);
const brandConfig = {
    key: 'brands',
    titleFa: 'برندها',
    titleEn: 'Brands',
    icon: 'Building2',
    model: 'brand',
    apiBase: '/api/admin/taxonomy/brands',
    adminPath: '/admin/taxonomy/brands',
    permissions: {
        read: 'brand.read',
        create: 'brand.create',
        update: 'brand.update',
        delete: 'brand.delete',
        export: 'brand.read'
    },
    columns: [
        {
            key: 'name',
            label: 'نام',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'slug',
            label: 'اسلاگ',
            type: 'text',
            sortable: true,
            visible: false
        },
        {
            key: 'country',
            label: 'کشور',
            type: 'text',
            filterable: true
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'verification',
            label: 'تأیید',
            type: 'badge',
            filterable: true
        },
        {
            key: 'featured',
            label: 'ویژه',
            type: 'boolean',
            sortable: true
        },
        {
            key: 'active',
            label: 'فعال',
            type: 'boolean',
            sortable: true
        },
        {
            key: 'foundedYear',
            label: 'سال تأسیس',
            type: 'number',
            sortable: true,
            visible: false
        },
        {
            key: 'createdAt',
            label: 'تاریخ ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'INACTIVE',
                    label: 'غیرفعال'
                }
            ]
        },
        {
            key: 'verification',
            label: 'تأیید',
            type: 'select',
            options: [
                {
                    value: 'VERIFIED',
                    label: 'تأییدشده'
                },
                {
                    value: 'UNVERIFIED',
                    label: 'تأییدنشده'
                }
            ]
        },
        {
            key: 'featured',
            label: 'فقط ویژه‌ها',
            type: 'boolean'
        },
        {
            key: 'country',
            label: 'کشور',
            type: 'text'
        }
    ],
    defaultSort: {
        field: 'name',
        order: 'asc'
    },
    pageSize: 50,
    searchable: true,
    searchFields: [
        'name',
        'nameEn',
        'shortName',
        'slug',
        'country'
    ],
    fields: [
        {
            key: 'name',
            label: 'نام (فارسی)',
            type: 'text',
            required: true
        },
        {
            key: 'nameEn',
            label: 'نام (انگلیسی)',
            type: 'text'
        },
        {
            key: 'shortName',
            label: 'نام کوتاه',
            type: 'text'
        },
        {
            key: 'slug',
            label: 'اسلاگ',
            type: 'slug',
            slugFrom: 'name',
            visible: false
        },
        {
            key: 'description',
            label: 'توضیحات',
            type: 'textarea'
        },
        {
            key: 'logoUrl',
            label: 'لوگو',
            type: 'media'
        },
        {
            key: 'website',
            label: 'وب‌سایت',
            type: 'text'
        },
        {
            key: 'country',
            label: 'کشور',
            type: 'text'
        },
        {
            key: 'foundedYear',
            label: 'سال تأسیس',
            type: 'number'
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'INACTIVE',
                    label: 'غیرفعال'
                }
            ]
        },
        {
            key: 'verification',
            label: 'تأیید',
            type: 'select',
            options: [
                {
                    value: 'VERIFIED',
                    label: 'تأییدشده'
                },
                {
                    value: 'UNVERIFIED',
                    label: 'تأییدنشده'
                }
            ]
        },
        {
            key: 'featured',
            label: 'ویژه',
            type: 'boolean'
        },
        {
            key: 'active',
            label: 'فعال',
            type: 'boolean',
            defaultValue: true
        }
    ],
    detailTabs: [
        {
            key: 'overview',
            label: 'مشاهده کلی',
            type: 'overview'
        },
        {
            key: 'aliases',
            label: 'اسم‌های مستعار',
            type: 'relations'
        },
        {
            key: 'models',
            label: 'مدل‌ها',
            type: 'relations'
        },
        {
            key: 'media',
            label: 'رسانه',
            type: 'media'
        },
        {
            key: 'seo',
            label: 'سئو',
            type: 'relations'
        },
        {
            key: 'audit',
            label: 'ممیزی',
            type: 'audit'
        }
    ],
    actions: [
        {
            key: 'verify',
            label: 'تأیید برند',
            icon: 'ShieldCheck',
            permission: 'brand.publish',
            type: 'confirm',
            confirmMessage: 'این برند تأیید شود؟'
        },
        {
            key: 'feature',
            label: 'ویژه کردن',
            icon: 'Star',
            permission: 'brand.update',
            type: 'confirm',
            confirmMessage: 'این برند ویژه شود؟'
        },
        {
            key: 'delete',
            label: 'حذف',
            icon: 'Trash2',
            permission: 'brand.delete',
            type: 'confirm',
            variant: 'destructive',
            confirmMessage: 'این برند حذف شود؟'
        }
    ],
    bulkActions: [
        {
            key: 'bulk-verify',
            label: 'تأیید گروهی',
            icon: 'ShieldCheck',
            permission: 'brand.publish',
            type: 'confirm',
            confirmMessage: 'برندهای انتخاب‌شده تأیید شوند؟'
        },
        {
            key: 'bulk-feature',
            label: 'ویژه کردن گروهی',
            icon: 'Star',
            permission: 'brand.update',
            type: 'confirm',
            confirmMessage: 'برندهای انتخاب‌شده ویژه شوند؟'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Brand',
        actions: [
            'brand.update',
            'brand.delete',
            'brand.publish'
        ]
    },
    relations: [
        {
            label: 'اسم‌های مستعار',
            resource: 'brand-aliases',
            filterField: 'brandId'
        },
        {
            label: 'مدل‌های محصول',
            resource: 'product-models',
            filterField: 'brandId'
        }
    ]
};
}),
"[project]/src/lib/admin/resources/user.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "userConfig",
    ()=>userConfig
]);
const userConfig = {
    key: 'users',
    titleFa: 'کاربران',
    titleEn: 'Users',
    icon: 'Users',
    model: 'user',
    apiBase: '/api/admin/users',
    adminPath: '/admin/users',
    permissions: {
        read: 'user.read',
        create: 'user.create',
        update: 'user.update',
        delete: 'user.delete',
        export: 'user.read'
    },
    columns: [
        {
            key: 'firstName',
            label: 'نام',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'lastName',
            label: 'نام خانوادگی',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'email',
            label: 'ایمیل',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'mobile',
            label: 'موبایل',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'role',
            label: 'نقش',
            type: 'badge',
            filterable: true
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'emailVerified',
            label: 'ایمیل تأییدشده',
            type: 'boolean',
            visible: false
        },
        {
            key: 'mobileVerified',
            label: 'موبایل تأییدشده',
            type: 'boolean',
            visible: false
        },
        {
            key: 'companyName',
            label: 'شرکت',
            type: 'text',
            visible: false
        },
        {
            key: 'lastLoginAt',
            label: 'آخرین ورود',
            type: 'date',
            sortable: true,
            visible: true
        },
        {
            key: 'createdAt',
            label: 'تاریخ عضویت',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'role',
            label: 'نقش',
            type: 'select',
            options: [
                {
                    value: 'ADMIN',
                    label: 'مدیر'
                },
                {
                    value: 'SELLER',
                    label: 'فروشنده'
                },
                {
                    value: 'BUYER',
                    label: 'خریدار'
                },
                {
                    value: 'MODERATOR',
                    label: 'ناظر'
                },
                {
                    value: 'SUPPORT',
                    label: 'پشتیبان'
                }
            ]
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'PENDING',
                    label: 'در انتظار'
                },
                {
                    value: 'SUSPENDED',
                    label: 'معلق'
                }
            ]
        },
        {
            key: 'emailVerified',
            label: 'ایمیل تأییدشده',
            type: 'boolean'
        },
        {
            key: 'mobileVerified',
            label: 'موبایل تأییدشده',
            type: 'boolean'
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'firstName',
        'lastName',
        'email',
        'mobile',
        'companyName'
    ],
    fields: [
        {
            key: 'firstName',
            label: 'نام',
            type: 'text',
            required: true
        },
        {
            key: 'lastName',
            label: 'نام خانوادگی',
            type: 'text',
            required: true
        },
        {
            key: 'email',
            label: 'ایمیل',
            type: 'text',
            required: true,
            placeholder: 'user@example.com'
        },
        {
            key: 'mobile',
            label: 'موبایل',
            type: 'text',
            required: true,
            placeholder: '09123456789'
        },
        {
            key: 'passwordHash',
            label: 'رمز عبور',
            type: 'password',
            helpText: 'فقط هنگام ایجاد کاربر جدید'
        },
        {
            key: 'userType',
            label: 'نوع کاربر',
            type: 'select',
            options: [
                {
                    value: 'INDIVIDUAL',
                    label: 'حقیقی'
                },
                {
                    value: 'COMPANY',
                    label: 'حقوقی'
                }
            ]
        },
        {
            key: 'role',
            label: 'نقش',
            type: 'select',
            options: [
                {
                    value: 'ADMIN',
                    label: 'مدیر'
                },
                {
                    value: 'SELLER',
                    label: 'فروشنده'
                },
                {
                    value: 'BUYER',
                    label: 'خریدار'
                },
                {
                    value: 'MODERATOR',
                    label: 'ناظر'
                },
                {
                    value: 'SUPPORT',
                    label: 'پشتیبان'
                }
            ]
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'PENDING',
                    label: 'در انتظار'
                },
                {
                    value: 'SUSPENDED',
                    label: 'معلق'
                }
            ]
        },
        {
            key: 'companyName',
            label: 'نام شرکت',
            type: 'text'
        },
        {
            key: 'emailVerified',
            label: 'ایمیل تأییدشده',
            type: 'boolean',
            defaultValue: false
        },
        {
            key: 'mobileVerified',
            label: 'موبایل تأییدشده',
            type: 'boolean',
            defaultValue: false
        }
    ],
    detailTabs: [
        {
            key: 'overview',
            label: 'مشاهده کلی',
            type: 'overview'
        },
        {
            key: 'listings',
            label: 'آگهی‌ها',
            type: 'relations'
        },
        {
            key: 'activity',
            label: 'فعالیت',
            type: 'activity'
        },
        {
            key: 'audit',
            label: 'ممیزی',
            type: 'audit'
        }
    ],
    actions: [
        {
            key: 'suspend',
            label: 'تعلیق',
            icon: 'Ban',
            permission: 'user.suspend',
            type: 'confirm',
            variant: 'destructive',
            confirmMessage: 'این کاربر معلق شود؟'
        },
        {
            key: 'activate',
            label: 'فعال‌سازی',
            icon: 'CheckCircle',
            permission: 'user.update',
            type: 'confirm',
            confirmMessage: 'این کاربر فعال شود؟'
        },
        {
            key: 'verify-email',
            label: 'تأیید ایمیل',
            icon: 'Mail',
            permission: 'user.update',
            type: 'confirm',
            confirmMessage: 'ایمیل این کاربر تأیید شود؟'
        },
        {
            key: 'delete',
            label: 'حذف',
            icon: 'Trash2',
            permission: 'user.delete',
            type: 'confirm',
            variant: 'destructive',
            confirmMessage: 'این کاربر حذف شود؟'
        }
    ],
    bulkActions: [
        {
            key: 'bulk-suspend',
            label: 'تعلیق گروهی',
            icon: 'Ban',
            permission: 'user.suspend',
            type: 'confirm',
            variant: 'destructive',
            confirmMessage: 'کاربران انتخاب‌شده معلق شوند؟'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'User',
        actions: [
            'user.create',
            'user.update',
            'user.delete',
            'user.suspend'
        ]
    },
    relations: [
        {
            label: 'آگهی‌ها',
            resource: 'listings',
            filterField: 'sellerId'
        }
    ]
};
}),
"[project]/src/lib/admin/resources/store-resources.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "companyConfig",
    ()=>companyConfig,
    "machineConfig",
    ()=>machineConfig,
    "orderConfig",
    ()=>orderConfig,
    "partConfig",
    ()=>partConfig,
    "paymentConfig",
    ()=>paymentConfig,
    "productConfig",
    ()=>productConfig,
    "reviewConfig",
    ()=>reviewConfig
]);
const productConfig = {
    key: 'products',
    titleFa: 'محصولات',
    titleEn: 'Products',
    icon: 'Package',
    model: 'product',
    apiBase: '/api/admin/products',
    adminPath: '/admin/resources/products',
    permissions: {
        read: 'product.read',
        create: 'product.create',
        update: 'product.update',
        delete: 'product.delete',
        export: 'product.read'
    },
    columns: [
        {
            key: 'canonicalName',
            label: 'نام',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'slug',
            label: 'اسلاگ',
            type: 'text',
            sortable: true,
            visible: false
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'description',
            label: 'توضیحات',
            type: 'text',
            visible: false
        },
        {
            key: 'source',
            label: 'منبع',
            type: 'badge',
            filterable: true,
            visible: false
        },
        {
            key: 'confidence',
            label: 'اطمینان',
            type: 'number',
            sortable: true,
            visible: false
        },
        {
            key: 'verifiedAt',
            label: 'تأییدشده',
            type: 'date',
            sortable: true,
            visible: false
        },
        {
            key: 'sortOrder',
            label: 'ترتیب',
            type: 'number',
            sortable: true,
            visible: false
        },
        {
            key: 'createdAt',
            label: 'تاریخ ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'DRAFT',
                    label: 'پیش‌نویس'
                },
                {
                    value: 'INACTIVE',
                    label: 'غیرفعال'
                },
                {
                    value: 'ARCHIVED',
                    label: 'بایگانی'
                }
            ]
        },
        {
            key: 'source',
            label: 'منبع',
            type: 'select',
            options: [
                {
                    value: 'MANUAL',
                    label: 'دستی'
                },
                {
                    value: 'AI_SUGGESTED',
                    label: 'AI'
                },
                {
                    value: 'IMPORTED',
                    label: 'واردشده'
                }
            ]
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'canonicalName',
        'slug',
        'description'
    ],
    fields: [
        {
            key: 'canonicalName',
            label: 'نام محصول',
            type: 'text',
            required: true
        },
        {
            key: 'slug',
            label: 'اسلاگ',
            type: 'slug',
            slugFrom: 'canonicalName',
            visible: false
        },
        {
            key: 'description',
            label: 'توضیحات',
            type: 'textarea'
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'DRAFT',
                    label: 'پیش‌نویس'
                },
                {
                    value: 'INACTIVE',
                    label: 'غیرفعال'
                },
                {
                    value: 'ARCHIVED',
                    label: 'بایگانی'
                }
            ]
        },
        {
            key: 'source',
            label: 'منبع',
            type: 'select',
            options: [
                {
                    value: 'MANUAL',
                    label: 'دستی'
                },
                {
                    value: 'AI_SUGGESTED',
                    label: 'AI'
                }
            ]
        },
        {
            key: 'sortOrder',
            label: 'ترتیب نمایش',
            type: 'number',
            defaultValue: 0
        }
    ],
    detailTabs: [
        {
            key: 'overview',
            label: 'مشاهده کلی',
            type: 'overview'
        },
        {
            key: 'machines',
            label: 'ماشین‌آلات',
            type: 'relations'
        },
        {
            key: 'parts',
            label: 'قطعات',
            type: 'relations'
        },
        {
            key: 'audit',
            label: 'ممیزی',
            type: 'audit'
        }
    ],
    actions: [
        {
            key: 'verify',
            label: 'تأیید',
            icon: 'ShieldCheck',
            permission: 'product.update',
            type: 'confirm'
        },
        {
            key: 'delete',
            label: 'حذف',
            icon: 'Trash2',
            permission: 'product.delete',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    bulkActions: [
        {
            key: 'bulk-delete',
            label: 'حذف گروهی',
            icon: 'Trash2',
            permission: 'product.delete',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Product',
        actions: [
            'product.create',
            'product.update',
            'product.delete'
        ]
    },
    relations: [
        {
            label: 'ماشین‌آلات',
            resource: 'machines',
            filterField: 'productId'
        },
        {
            label: 'قطعات',
            resource: 'parts',
            filterField: 'productId'
        }
    ]
};
const partConfig = {
    key: 'parts',
    titleFa: 'قطعات یدکی',
    titleEn: 'Parts',
    icon: 'Wrench',
    model: 'part',
    apiBase: '/api/admin/parts',
    adminPath: '/admin/resources/parts',
    permissions: {
        read: 'product.read',
        create: 'product.create',
        update: 'product.update',
        delete: 'product.delete'
    },
    columns: [
        {
            key: 'partNumber',
            label: 'شماره قطعه',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'oemNumber',
            label: 'شماره OEM',
            type: 'text',
            filterable: true
        },
        {
            key: 'condition',
            label: 'وضعیت',
            type: 'badge',
            filterable: true
        },
        {
            key: 'status',
            label: 'فعال',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'createdAt',
            label: 'تاریخ ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'partNumber',
        'oemNumber'
    ],
    fields: [
        {
            key: 'partNumber',
            label: 'شماره قطعه',
            type: 'text'
        },
        {
            key: 'oemNumber',
            label: 'شماره OEM',
            type: 'text'
        },
        {
            key: 'condition',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'NEW',
                    label: 'نو'
                },
                {
                    value: 'USED',
                    label: 'کارکرده'
                },
                {
                    value: 'REFURBISHED',
                    label: 'بازسازی‌شده'
                }
            ]
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'INACTIVE',
                    label: 'غیرفعال'
                }
            ]
        }
    ],
    actions: [
        {
            key: 'delete',
            label: 'حذف',
            icon: 'Trash2',
            permission: 'product.delete',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Part',
        actions: [
            'part.update',
            'part.delete'
        ]
    }
};
const orderConfig = {
    key: 'orders',
    titleFa: 'سفارش‌ها',
    titleEn: 'Orders',
    icon: 'ShoppingCart',
    model: 'order',
    apiBase: '/api/admin/resources/orders',
    adminPath: '/admin/resources/orders',
    permissions: {
        read: 'order.read',
        create: 'order.update',
        update: 'order.update',
        delete: 'order.manage',
        export: 'order.read'
    },
    columns: [
        {
            key: 'orderNumber',
            label: 'شماره سفارش',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'titleSnapshot',
            label: 'عنوان',
            type: 'text',
            filterable: true
        },
        {
            key: 'priceSnapshot',
            label: 'مبلغ',
            type: 'currency',
            sortable: true
        },
        {
            key: 'currencySnapshot',
            label: 'ارز',
            type: 'badge',
            visible: false
        },
        {
            key: 'quantity',
            label: 'تعداد',
            type: 'number',
            sortable: true
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'commissionRate',
            label: 'کارمزد %',
            type: 'number',
            visible: false
        },
        {
            key: 'commissionAmount',
            label: 'کارمزد',
            type: 'currency',
            visible: false
        },
        {
            key: 'sellerAmount',
            label: 'مبلغ فروشنده',
            type: 'currency',
            visible: false
        },
        {
            key: 'confirmedAt',
            label: 'تأیید',
            type: 'date',
            sortable: true,
            visible: false
        },
        {
            key: 'completedAt',
            label: 'تکمیل',
            type: 'date',
            sortable: true
        },
        {
            key: 'createdAt',
            label: 'تاریخ ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'PENDING',
                    label: 'در انتظار'
                },
                {
                    value: 'CONFIRMED',
                    label: 'تأییدشده'
                },
                {
                    value: 'PROCESSING',
                    label: 'در حال پردازش'
                },
                {
                    value: 'FULFILLED',
                    label: 'ارسال‌شده'
                },
                {
                    value: 'COMPLETED',
                    label: 'تکمیل‌شده'
                },
                {
                    value: 'CANCELLED',
                    label: 'لغوشده'
                }
            ]
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'orderNumber',
        'titleSnapshot'
    ],
    fields: [
        {
            key: 'orderNumber',
            label: 'شماره سفارش',
            type: 'text',
            required: true
        },
        {
            key: 'titleSnapshot',
            label: 'عنوان',
            type: 'text',
            required: true
        },
        {
            key: 'priceSnapshot',
            label: 'مبلغ',
            type: 'currency',
            required: true
        },
        {
            key: 'currencySnapshot',
            label: 'ارز',
            type: 'text',
            defaultValue: 'IRR'
        },
        {
            key: 'quantity',
            label: 'تعداد',
            type: 'number',
            defaultValue: 1
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'PENDING',
                    label: 'در انتظار'
                },
                {
                    value: 'CONFIRMED',
                    label: 'تأییدشده'
                },
                {
                    value: 'PROCESSING',
                    label: 'در حال پردازش'
                },
                {
                    value: 'COMPLETED',
                    label: 'تکمیل‌شده'
                }
            ]
        },
        {
            key: 'commissionRate',
            label: 'نرخ کارمزد %',
            type: 'number'
        },
        {
            key: 'notes',
            label: 'یادداشت',
            type: 'textarea'
        }
    ],
    detailTabs: [
        {
            key: 'overview',
            label: 'مشاهده کلی',
            type: 'overview'
        },
        {
            key: 'payments',
            label: 'پرداخت‌ها',
            type: 'relations'
        },
        {
            key: 'disputes',
            label: 'اختلافات',
            type: 'relations'
        },
        {
            key: 'audit',
            label: 'ممیزی',
            type: 'audit'
        }
    ],
    actions: [
        {
            key: 'confirm',
            label: 'تأیید',
            icon: 'CheckCircle',
            permission: 'order.update',
            type: 'confirm'
        },
        {
            key: 'cancel',
            label: 'لغو',
            icon: 'X',
            permission: 'order.manage',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    bulkActions: [
        {
            key: 'bulk-confirm',
            label: 'تأیید گروهی',
            icon: 'CheckCircle',
            permission: 'order.update',
            type: 'confirm'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Order',
        actions: [
            'order.update',
            'order.manage'
        ]
    },
    relations: [
        {
            label: 'پرداخت‌ها',
            resource: 'payments',
            filterField: 'orderId'
        }
    ]
};
const paymentConfig = {
    key: 'payments',
    titleFa: 'پرداخت‌ها',
    titleEn: 'Payments',
    icon: 'CreditCard',
    model: 'payment',
    apiBase: '/api/admin/payments',
    adminPath: '/admin/resources/payments',
    permissions: {
        read: 'payment.read',
        create: 'payment.manage',
        update: 'payment.manage',
        delete: 'payment.manage',
        export: 'payment.read'
    },
    columns: [
        {
            key: 'amount',
            label: 'مبلغ',
            type: 'currency',
            sortable: true
        },
        {
            key: 'currency',
            label: 'ارز',
            type: 'badge'
        },
        {
            key: 'type',
            label: 'نوع',
            type: 'badge',
            filterable: true
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'gateway',
            label: 'درگاه',
            type: 'badge',
            filterable: true,
            visible: false
        },
        {
            key: 'trackingCode',
            label: 'کد پیگیری',
            type: 'text',
            visible: false
        },
        {
            key: 'paidAt',
            label: 'پرداخت',
            type: 'date',
            sortable: true
        },
        {
            key: 'createdAt',
            label: 'تاریخ ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'PENDING',
                    label: 'در انتظار'
                },
                {
                    value: 'PAID',
                    label: 'پرداخت‌شده'
                },
                {
                    value: 'FAILED',
                    label: 'ناموفق'
                },
                {
                    value: 'REFUNDED',
                    label: 'بازگشت‌داده‌شده'
                }
            ]
        },
        {
            key: 'type',
            label: 'نوع',
            type: 'select',
            options: [
                {
                    value: 'ORDER_PAYMENT',
                    label: 'پرداخت سفارش'
                },
                {
                    value: 'COMMISSION',
                    label: 'کارمزد'
                },
                {
                    value: 'SUBSCRIPTION',
                    label: 'اشتراک'
                },
                {
                    value: 'REFUND',
                    label: 'بازگشت'
                }
            ]
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'trackingCode',
        'providerReference'
    ],
    fields: [
        {
            key: 'amount',
            label: 'مبلغ',
            type: 'currency',
            required: true
        },
        {
            key: 'currency',
            label: 'ارز',
            type: 'text',
            defaultValue: 'IRR'
        },
        {
            key: 'type',
            label: 'نوع',
            type: 'select',
            options: [
                {
                    value: 'ORDER_PAYMENT',
                    label: 'پرداخت سفارش'
                },
                {
                    value: 'COMMISSION',
                    label: 'کارمزد'
                },
                {
                    value: 'REFUND',
                    label: 'بازگشت'
                }
            ]
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'PENDING',
                    label: 'در انتظار'
                },
                {
                    value: 'PAID',
                    label: 'پرداخت‌شده'
                },
                {
                    value: 'FAILED',
                    label: 'ناموفق'
                }
            ]
        },
        {
            key: 'gateway',
            label: 'درگاه پرداخت',
            type: 'select',
            options: [
                {
                    value: 'ZARINPAL',
                    label: 'زرین‌پال'
                },
                {
                    value: 'PAYIR',
                    label: 'Pay.ir'
                },
                {
                    value: 'MANUAL',
                    label: 'دستی'
                }
            ]
        },
        {
            key: 'trackingCode',
            label: 'کد پیگیری',
            type: 'text'
        },
        {
            key: 'idempotencyKey',
            label: 'کلید Idempotency',
            type: 'text',
            visible: false
        }
    ],
    detailTabs: [
        {
            key: 'overview',
            label: 'مشاهده کلی',
            type: 'overview'
        },
        {
            key: 'audit',
            label: 'ممیزی مالی',
            type: 'audit'
        }
    ],
    actions: [
        {
            key: 'refund',
            label: 'بازگشت وجه',
            icon: 'RotateCcw',
            permission: 'payment.refund',
            type: 'confirm',
            variant: 'destructive',
            confirmMessage: 'بازگشت وجه انجام شود؟ این عملیات حساس است.'
        },
        {
            key: 'verify',
            label: 'تأیید پرداخت',
            icon: 'CheckCircle',
            permission: 'payment.manage',
            type: 'confirm'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Payment',
        actions: [
            'payment.manage',
            'payment.refund'
        ]
    }
};
const companyConfig = {
    key: 'companies',
    titleFa: 'شرکت‌ها',
    titleEn: 'Companies',
    icon: 'Building2',
    model: 'company',
    apiBase: '/api/admin/companies',
    adminPath: '/admin/resources/companies',
    permissions: {
        read: 'company.read',
        create: 'company.create',
        update: 'company.update',
        delete: 'company.delete',
        export: 'company.read'
    },
    columns: [
        {
            key: 'name',
            label: 'نام',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'slug',
            label: 'اسلاگ',
            type: 'text',
            visible: false
        },
        {
            key: 'verified',
            label: 'تأییدشده',
            type: 'boolean',
            sortable: true,
            filterable: true
        },
        {
            key: 'premium',
            label: 'ویژه',
            type: 'boolean',
            sortable: true,
            filterable: true
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'city',
            label: 'شهر',
            type: 'text',
            filterable: true
        },
        {
            key: 'phone',
            label: 'تلفن',
            type: 'text',
            visible: false
        },
        {
            key: 'email',
            label: 'ایمیل',
            type: 'text',
            visible: false
        },
        {
            key: 'viewCount',
            label: 'بازدید',
            type: 'number',
            sortable: true,
            visible: false
        },
        {
            key: 'avgRating',
            label: 'امتیاز',
            type: 'number',
            sortable: true,
            visible: false
        },
        {
            key: 'createdAt',
            label: 'تاریخ ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'INACTIVE',
                    label: 'غیرفعال'
                }
            ]
        },
        {
            key: 'verified',
            label: 'فقط تأییدشده‌ها',
            type: 'boolean'
        },
        {
            key: 'premium',
            label: 'فقط ویژه‌ها',
            type: 'boolean'
        }
    ],
    defaultSort: {
        field: 'name',
        order: 'asc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'name',
        'slug',
        'city',
        'phone',
        'email'
    ],
    fields: [
        {
            key: 'name',
            label: 'نام شرکت',
            type: 'text',
            required: true
        },
        {
            key: 'slug',
            label: 'اسلاگ',
            type: 'slug',
            slugFrom: 'name',
            visible: false
        },
        {
            key: 'description',
            label: 'توضیحات',
            type: 'textarea'
        },
        {
            key: 'logoUrl',
            label: 'لوگو',
            type: 'media'
        },
        {
            key: 'website',
            label: 'وب‌سایت',
            type: 'text'
        },
        {
            key: 'phone',
            label: 'تلفن',
            type: 'text'
        },
        {
            key: 'email',
            label: 'ایمیل',
            type: 'text'
        },
        {
            key: 'address',
            label: 'آدرس',
            type: 'textarea'
        },
        {
            key: 'city',
            label: 'شهر',
            type: 'text'
        },
        {
            key: 'province',
            label: 'استان',
            type: 'text'
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'INACTIVE',
                    label: 'غیرفعال'
                }
            ]
        },
        {
            key: 'verified',
            label: 'تأییدشده',
            type: 'boolean'
        },
        {
            key: 'premium',
            label: 'ویژه',
            type: 'boolean'
        }
    ],
    detailTabs: [
        {
            key: 'overview',
            label: 'مشاهده کلی',
            type: 'overview'
        },
        {
            key: 'branches',
            label: 'شعب',
            type: 'relations'
        },
        {
            key: 'verifications',
            label: 'تأییدیه‌ها',
            type: 'relations'
        },
        {
            key: 'partners',
            label: 'شرکا',
            type: 'relations'
        },
        {
            key: 'reviews',
            label: 'نظرات',
            type: 'relations'
        },
        {
            key: 'audit',
            label: 'ممیزی',
            type: 'audit'
        }
    ],
    actions: [
        {
            key: 'verify',
            label: 'تأیید شرکت',
            icon: 'ShieldCheck',
            permission: 'company.verify',
            type: 'confirm'
        },
        {
            key: 'delete',
            label: 'حذف',
            icon: 'Trash2',
            permission: 'company.delete',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    bulkActions: [
        {
            key: 'bulk-verify',
            label: 'تأیید گروهی',
            icon: 'ShieldCheck',
            permission: 'company.verify',
            type: 'confirm'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Company',
        actions: [
            'company.update',
            'company.verify',
            'company.delete'
        ]
    },
    relations: [
        {
            label: 'شعب',
            resource: 'company-branches',
            filterField: 'companyId'
        },
        {
            label: 'تأییدیه‌ها',
            resource: 'company-verifications',
            filterField: 'companyId'
        }
    ]
};
const machineConfig = {
    key: 'machines',
    titleFa: 'ماشین‌آلات',
    titleEn: 'Machines',
    icon: 'Truck',
    model: 'machine',
    apiBase: '/api/admin/machines',
    adminPath: '/admin/resources/machines',
    permissions: {
        read: 'product.read',
        create: 'product.create',
        update: 'product.update',
        delete: 'product.delete'
    },
    columns: [
        {
            key: 'serialNumber',
            label: 'سریال',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'manufactureYear',
            label: 'سال ساخت',
            type: 'number',
            sortable: true,
            filterable: true
        },
        {
            key: 'hours',
            label: 'ساعت کارکرد',
            type: 'number',
            sortable: true
        },
        {
            key: 'condition',
            label: 'وضعیت',
            type: 'badge',
            filterable: true
        },
        {
            key: 'status',
            label: 'فعال',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'createdAt',
            label: 'تاریخ ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'SOLD',
                    label: 'فروخته‌شده'
                },
                {
                    value: 'ARCHIVED',
                    label: 'بایگانی'
                }
            ]
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'serialNumber'
    ],
    fields: [
        {
            key: 'serialNumber',
            label: 'شماره سریال',
            type: 'text'
        },
        {
            key: 'manufactureYear',
            label: 'سال ساخت',
            type: 'number'
        },
        {
            key: 'hours',
            label: 'ساعت کارکرد',
            type: 'number'
        },
        {
            key: 'condition',
            label: 'وضعیت دستگاه',
            type: 'select',
            options: [
                {
                    value: 'NEW',
                    label: 'نو'
                },
                {
                    value: 'EXCELLENT',
                    label: 'عالی'
                },
                {
                    value: 'GOOD',
                    label: 'خوب'
                },
                {
                    value: 'FAIR',
                    label: 'متوسط'
                }
            ]
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'SOLD',
                    label: 'فروخته'
                }
            ]
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Machine',
        actions: [
            'machine.update'
        ]
    }
};
const reviewConfig = {
    key: 'reviews',
    titleFa: 'نظرات',
    titleEn: 'Reviews',
    icon: 'Star',
    model: 'review',
    apiBase: '/api/admin/resources/reviews',
    adminPath: '/admin/resources/reviews',
    permissions: {
        read: 'review.read',
        create: 'review.moderate',
        update: 'review.moderate',
        delete: 'review.moderate'
    },
    columns: [
        {
            key: 'rating',
            label: 'امتیاز',
            type: 'number',
            sortable: true,
            filterable: true
        },
        {
            key: 'title',
            label: 'عنوان',
            type: 'text',
            filterable: true
        },
        {
            key: 'body',
            label: 'متن',
            type: 'text',
            visible: false
        },
        {
            key: 'verifiedDeal',
            label: 'معامله تأییدشده',
            type: 'boolean',
            filterable: true
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'sellerResponse',
            label: 'پاسخ فروشنده',
            type: 'boolean',
            visible: false
        },
        {
            key: 'createdAt',
            label: 'تاریخ',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'PENDING',
                    label: 'در انتظار'
                },
                {
                    value: 'PUBLISHED',
                    label: 'منتشرشده'
                },
                {
                    value: 'REJECTED',
                    label: 'ردشده'
                },
                {
                    value: 'HIDDEN',
                    label: 'مخفی'
                }
            ]
        },
        {
            key: 'verifiedDeal',
            label: 'فقط معاملات تأییدشده',
            type: 'boolean'
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'title',
        'body'
    ],
    fields: [
        {
            key: 'rating',
            label: 'امتیاز (۱-۵)',
            type: 'number',
            required: true
        },
        {
            key: 'title',
            label: 'عنوان',
            type: 'text'
        },
        {
            key: 'body',
            label: 'متن نظر',
            type: 'textarea',
            required: true
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'PENDING',
                    label: 'در انتظار'
                },
                {
                    value: 'PUBLISHED',
                    label: 'منتشرشده'
                },
                {
                    value: 'REJECTED',
                    label: 'ردشده'
                }
            ]
        },
        {
            key: 'verifiedDeal',
            label: 'معامله تأییدشده',
            type: 'boolean'
        }
    ],
    detailTabs: [
        {
            key: 'overview',
            label: 'مشاهده کلی',
            type: 'overview'
        },
        {
            key: 'audit',
            label: 'ممیزی',
            type: 'audit'
        }
    ],
    actions: [
        {
            key: 'publish',
            label: 'انتشار',
            icon: 'CheckCircle',
            permission: 'review.moderate',
            type: 'confirm'
        },
        {
            key: 'reject',
            label: 'رد',
            icon: 'X',
            permission: 'review.moderate',
            type: 'confirm',
            variant: 'destructive'
        },
        {
            key: 'hide',
            label: 'مخفی',
            icon: 'EyeOff',
            permission: 'review.moderate',
            type: 'confirm'
        }
    ],
    bulkActions: [
        {
            key: 'bulk-publish',
            label: 'انتشار گروهی',
            icon: 'CheckCircle',
            permission: 'review.moderate',
            type: 'confirm'
        },
        {
            key: 'bulk-reject',
            label: 'رد گروهی',
            icon: 'X',
            permission: 'review.moderate',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Review',
        actions: [
            'review.moderate'
        ]
    }
};
}),
"[project]/src/lib/admin/resources/marketplace-resources.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "auctionConfig",
    ()=>auctionConfig,
    "buyRequestConfig",
    ()=>buyRequestConfig,
    "dealConfig",
    ()=>dealConfig,
    "disputeConfig",
    ()=>disputeConfig,
    "inspectionConfig",
    ()=>inspectionConfig,
    "offerConfig",
    ()=>offerConfig,
    "rfqConfig",
    ()=>rfqConfig,
    "transportConfig",
    ()=>transportConfig
]);
const dealConfig = {
    key: 'deals',
    titleFa: 'معاملات',
    titleEn: 'Deals',
    icon: 'Handshake',
    model: 'deal',
    apiBase: '/api/admin/resources/deals',
    adminPath: '/admin/resources/deals',
    permissions: {
        read: 'deal.read',
        create: 'deal.manage',
        update: 'deal.manage',
        delete: 'deal.manage',
        export: 'deal.read'
    },
    columns: [
        {
            key: 'dealNumber',
            label: 'شماره معامله',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'sourceType',
            label: 'منبع',
            type: 'badge',
            filterable: true
        },
        {
            key: 'agreedAmount',
            label: 'مبلغ توافق',
            type: 'currency',
            sortable: true
        },
        {
            key: 'currency',
            label: 'ارز',
            type: 'badge'
        },
        {
            key: 'transactionType',
            label: 'نوع',
            type: 'badge',
            filterable: true
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'agreedAt',
            label: 'توافق',
            type: 'date',
            sortable: true,
            visible: false
        },
        {
            key: 'confirmedAt',
            label: 'تأیید',
            type: 'date',
            sortable: true,
            visible: false
        },
        {
            key: 'completedAt',
            label: 'تکمیل',
            type: 'date',
            sortable: true
        },
        {
            key: 'createdAt',
            label: 'ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'DRAFT',
                    label: 'پیش‌نویس'
                },
                {
                    value: 'PENDING_CONFIRMATION',
                    label: 'در انتظار تأیید'
                },
                {
                    value: 'CONFIRMED',
                    label: 'تأییدشده'
                },
                {
                    value: 'IN_PROGRESS',
                    label: 'در حال انجام'
                },
                {
                    value: 'COMPLETED',
                    label: 'تکمیل‌شده'
                },
                {
                    value: 'CANCELLED',
                    label: 'لغوشده'
                },
                {
                    value: 'DISPUTED',
                    label: 'مختلص'
                }
            ]
        },
        {
            key: 'sourceType',
            label: 'منبع',
            type: 'select',
            options: [
                {
                    value: 'LISTING_OFFER',
                    label: 'پیشنهاد آگهی'
                },
                {
                    value: 'RFQ_QUOTE',
                    label: 'پیشنهاد RFQ'
                },
                {
                    value: 'DEAL_ROOM',
                    label: 'اتاق معامله'
                }
            ]
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'dealNumber'
    ],
    fields: [
        {
            key: 'dealNumber',
            label: 'شماره معامله',
            type: 'text',
            required: true
        },
        {
            key: 'sourceType',
            label: 'منبع',
            type: 'select',
            options: [
                {
                    value: 'LISTING_OFFER',
                    label: 'پیشنهاد آگهی'
                },
                {
                    value: 'RFQ_QUOTE',
                    label: 'پیشنهاد RFQ'
                },
                {
                    value: 'DEAL_ROOM',
                    label: 'اتاق معامله'
                }
            ]
        },
        {
            key: 'agreedAmount',
            label: 'مبلغ توافق',
            type: 'currency'
        },
        {
            key: 'currency',
            label: 'ارز',
            type: 'text',
            defaultValue: 'IRR'
        },
        {
            key: 'transactionType',
            label: 'نوع معامله',
            type: 'select',
            options: [
                {
                    value: 'SALE',
                    label: 'فروش'
                },
                {
                    value: 'RENT',
                    label: 'اجاره'
                }
            ]
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'DRAFT',
                    label: 'پیش‌نویس'
                },
                {
                    value: 'CONFIRMED',
                    label: 'تأییدشده'
                },
                {
                    value: 'COMPLETED',
                    label: 'تکمیل‌شده'
                },
                {
                    value: 'CANCELLED',
                    label: 'لغوشده'
                }
            ]
        },
        {
            key: 'notes',
            label: 'یادداشت',
            type: 'textarea'
        }
    ],
    detailTabs: [
        {
            key: 'overview',
            label: 'مشاهده کلی',
            type: 'overview'
        },
        {
            key: 'order',
            label: 'سفارش',
            type: 'relations'
        },
        {
            key: 'disputes',
            label: 'اختلافات',
            type: 'relations'
        },
        {
            key: 'audit',
            label: 'ممیزی',
            type: 'audit'
        }
    ],
    actions: [
        {
            key: 'confirm',
            label: 'تأیید معامله',
            icon: 'CheckCircle',
            permission: 'deal.manage',
            type: 'confirm'
        },
        {
            key: 'cancel',
            label: 'لغو معامله',
            icon: 'X',
            permission: 'deal.manage',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    bulkActions: [
        {
            key: 'bulk-cancel',
            label: 'لغو گروهی',
            icon: 'X',
            permission: 'deal.manage',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Deal',
        actions: [
            'deal.manage',
            'deal.read'
        ]
    },
    relations: [
        {
            label: 'سفارش',
            resource: 'orders',
            filterField: 'dealId'
        },
        {
            label: 'اختلافات',
            resource: 'disputes',
            filterField: 'dealId'
        }
    ]
};
const rfqConfig = {
    key: 'rfqs',
    titleFa: 'درخواست‌های خرید (RFQ)',
    titleEn: 'RFQ',
    icon: 'FileText',
    model: 'rFQ',
    apiBase: '/api/admin/resources/rfqs',
    adminPath: '/admin/resources/rfqs',
    permissions: {
        read: 'rfq.read',
        create: 'rfq.manage',
        update: 'rfq.manage',
        delete: 'rfq.manage',
        export: 'rfq.read'
    },
    columns: [
        {
            key: 'title',
            label: 'عنوان',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'machineType',
            label: 'نوع دستگاه',
            type: 'text',
            filterable: true
        },
        {
            key: 'quantity',
            label: 'تعداد',
            type: 'number',
            sortable: true
        },
        {
            key: 'budgetMin',
            label: 'حداقل بودجه',
            type: 'currency',
            visible: false
        },
        {
            key: 'budgetMax',
            label: 'حداکثر بودجه',
            type: 'currency',
            visible: false
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'buyerName',
            label: 'خریدار',
            type: 'text'
        },
        {
            key: 'buyerPhone',
            label: 'تماس',
            type: 'text',
            visible: false
        },
        {
            key: 'deadline',
            label: 'مهلت',
            type: 'date',
            sortable: true
        },
        {
            key: 'createdAt',
            label: 'ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'OPEN',
                    label: 'باز'
                },
                {
                    value: 'QUOTING',
                    label: 'در حال پیشنهاد'
                },
                {
                    value: 'AWARDED',
                    label: 'تخصیص‌یافته'
                },
                {
                    value: 'CLOSED',
                    label: 'بسته'
                }
            ]
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'title',
        'machineType',
        'buyerName',
        'buyerPhone'
    ],
    fields: [
        {
            key: 'title',
            label: 'عنوان درخواست',
            type: 'text',
            required: true
        },
        {
            key: 'description',
            label: 'توضیحات',
            type: 'textarea'
        },
        {
            key: 'machineType',
            label: 'نوع دستگاه',
            type: 'text'
        },
        {
            key: 'brandPref',
            label: 'ترجیح برند',
            type: 'text'
        },
        {
            key: 'quantity',
            label: 'تعداد',
            type: 'number',
            defaultValue: 1
        },
        {
            key: 'budgetMin',
            label: 'حداقل بودجه',
            type: 'currency'
        },
        {
            key: 'budgetMax',
            label: 'حداکثر بودجه',
            type: 'currency'
        },
        {
            key: 'location',
            label: 'موقعیت',
            type: 'text'
        },
        {
            key: 'deadline',
            label: 'مهلت',
            type: 'datetime'
        },
        {
            key: 'terms',
            label: 'شرایط',
            type: 'textarea'
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'OPEN',
                    label: 'باز'
                },
                {
                    value: 'CLOSED',
                    label: 'بسته'
                }
            ]
        },
        {
            key: 'buyerName',
            label: 'نام خریدار',
            type: 'text'
        },
        {
            key: 'buyerPhone',
            label: 'تماس',
            type: 'text',
            required: true
        },
        {
            key: 'buyerEmail',
            label: 'ایمیل',
            type: 'text'
        }
    ],
    detailTabs: [
        {
            key: 'overview',
            label: 'مشاهده کلی',
            type: 'overview'
        },
        {
            key: 'quotes',
            label: 'پیشنهادها',
            type: 'relations'
        },
        {
            key: 'audit',
            label: 'ممیزی',
            type: 'audit'
        }
    ],
    actions: [
        {
            key: 'close',
            label: 'بستن درخواست',
            icon: 'Lock',
            permission: 'rfq.manage',
            type: 'confirm'
        },
        {
            key: 'delete',
            label: 'حذف',
            icon: 'Trash2',
            permission: 'rfq.manage',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'RFQ',
        actions: [
            'rfq.manage'
        ]
    },
    relations: [
        {
            label: 'پیشنهادها',
            resource: 'rfq-quotes',
            filterField: 'rfqId'
        }
    ]
};
const offerConfig = {
    key: 'offers',
    titleFa: 'پیشنهادها',
    titleEn: 'Offers',
    icon: 'Tag',
    model: 'listingOffer',
    apiBase: '/api/admin/resources/offers',
    adminPath: '/admin/resources/offers',
    permissions: {
        read: 'listing.read',
        create: 'listing.read',
        update: 'listing.update',
        delete: 'listing.update',
        export: 'listing.read'
    },
    columns: [
        {
            key: 'offerAmount',
            label: 'مبلغ پیشنهاد',
            type: 'currency',
            sortable: true,
            filterable: true
        },
        {
            key: 'message',
            label: 'پیام',
            type: 'text',
            visible: false
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'counterAmount',
            label: 'مبلغ ضدپیشنهاد',
            type: 'currency',
            visible: false
        },
        {
            key: 'buyerName',
            label: 'خریدار',
            type: 'text'
        },
        {
            key: 'buyerPhone',
            label: 'تماس',
            type: 'text',
            visible: false
        },
        {
            key: 'sellerNote',
            label: 'یادداشت فروشنده',
            type: 'text',
            visible: false
        },
        {
            key: 'respondedAt',
            label: 'پاسخ',
            type: 'date',
            sortable: true,
            visible: false
        },
        {
            key: 'createdAt',
            label: 'ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'PENDING',
                    label: 'در انتظار'
                },
                {
                    value: 'ACCEPTED',
                    label: 'پذیرفته‌شده'
                },
                {
                    value: 'REJECTED',
                    label: 'ردشده'
                },
                {
                    value: 'COUNTERED',
                    label: 'ضدپیشنهاد'
                }
            ]
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'buyerName',
        'buyerPhone',
        'message'
    ],
    fields: [
        {
            key: 'offerAmount',
            label: 'مبلغ پیشنهاد',
            type: 'currency',
            required: true
        },
        {
            key: 'message',
            label: 'پیام',
            type: 'textarea'
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'PENDING',
                    label: 'در انتظار'
                },
                {
                    value: 'ACCEPTED',
                    label: 'پذیرفته‌شده'
                },
                {
                    value: 'REJECTED',
                    label: 'ردشده'
                }
            ]
        },
        {
            key: 'counterAmount',
            label: 'مبلغ ضدپیشنهاد',
            type: 'currency'
        },
        {
            key: 'buyerName',
            label: 'نام خریدار',
            type: 'text'
        },
        {
            key: 'buyerPhone',
            label: 'تماس خریدار',
            type: 'text',
            required: true
        },
        {
            key: 'buyerEmail',
            label: 'ایمیل',
            type: 'text'
        },
        {
            key: 'sellerNote',
            label: 'یادداشت فروشنده',
            type: 'textarea'
        }
    ],
    actions: [
        {
            key: 'accept',
            label: 'پذیرش',
            icon: 'CheckCircle',
            permission: 'listing.update',
            type: 'confirm'
        },
        {
            key: 'reject',
            label: 'رد',
            icon: 'X',
            permission: 'listing.update',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'ListingOffer',
        actions: [
            'listing.update'
        ]
    }
};
const auctionConfig = {
    key: 'auctions',
    titleFa: 'مزایده‌ها',
    titleEn: 'Auctions',
    icon: 'Gavel',
    model: 'auction',
    apiBase: '/api/admin/auctions',
    adminPath: '/admin/resources/auctions',
    permissions: {
        read: 'auction.manage',
        create: 'auction.manage',
        update: 'auction.manage',
        delete: 'auction.manage',
        export: 'auction.manage'
    },
    columns: [
        {
            key: 'title',
            label: 'عنوان',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'startPrice',
            label: 'قیمت شروع',
            type: 'currency',
            sortable: true
        },
        {
            key: 'reservePrice',
            label: 'قیمت رزرو',
            type: 'currency',
            visible: false
        },
        {
            key: 'minIncrement',
            label: 'حداقل افزایش',
            type: 'currency',
            visible: false
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'winnerName',
            label: 'برنده',
            type: 'text',
            visible: false
        },
        {
            key: 'winningBid',
            label: 'پیشنهاد برنده',
            type: 'currency',
            visible: false
        },
        {
            key: 'startDate',
            label: 'شروع',
            type: 'date',
            sortable: true
        },
        {
            key: 'endDate',
            label: 'پایان',
            type: 'date',
            sortable: true
        },
        {
            key: 'createdAt',
            label: 'ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'SCHEDULED',
                    label: 'زمان‌بندی‌شده'
                },
                {
                    value: 'LIVE',
                    label: 'در جریان'
                },
                {
                    value: 'ENDED',
                    label: 'پایان‌یافته'
                },
                {
                    value: 'CANCELLED',
                    label: 'لغوشده'
                }
            ]
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'title',
        'winnerName'
    ],
    fields: [
        {
            key: 'title',
            label: 'عنوان مزایده',
            type: 'text',
            required: true
        },
        {
            key: 'description',
            label: 'توضیحات',
            type: 'textarea'
        },
        {
            key: 'startPrice',
            label: 'قیمت شروع',
            type: 'currency',
            required: true
        },
        {
            key: 'reservePrice',
            label: 'قیمت رزرو',
            type: 'currency'
        },
        {
            key: 'minIncrement',
            label: 'حداقل افزایش',
            type: 'currency'
        },
        {
            key: 'startDate',
            label: 'تاریخ شروع',
            type: 'datetime',
            required: true
        },
        {
            key: 'endDate',
            label: 'تاریخ پایان',
            type: 'datetime',
            required: true
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'SCHEDULED',
                    label: 'زمان‌بندی‌شده'
                },
                {
                    value: 'LIVE',
                    label: 'در جریان'
                },
                {
                    value: 'ENDED',
                    label: 'پایان‌یافته'
                }
            ]
        }
    ],
    detailTabs: [
        {
            key: 'overview',
            label: 'مشاهده کلی',
            type: 'overview'
        },
        {
            key: 'bids',
            label: 'پیشنهادها',
            type: 'relations'
        },
        {
            key: 'audit',
            label: 'ممیزی',
            type: 'audit'
        }
    ],
    actions: [
        {
            key: 'start',
            label: 'شروع مزایده',
            icon: 'Play',
            permission: 'auction.manage',
            type: 'confirm'
        },
        {
            key: 'end',
            label: 'پایان مزایده',
            icon: 'Square',
            permission: 'auction.manage',
            type: 'confirm'
        },
        {
            key: 'cancel',
            label: 'لغو',
            icon: 'X',
            permission: 'auction.manage',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Auction',
        actions: [
            'auction.manage'
        ]
    },
    relations: [
        {
            label: 'پیشنهادها',
            resource: 'auction-bids',
            filterField: 'auctionId'
        }
    ]
};
const inspectionConfig = {
    key: 'inspections',
    titleFa: 'کارشناسی',
    titleEn: 'Inspections',
    icon: 'Search',
    model: 'inspection',
    apiBase: '/api/admin/inspections',
    adminPath: '/admin/resources/inspections',
    permissions: {
        read: 'inspection.read',
        create: 'inspection.read',
        update: 'inspection.read',
        delete: 'inspection.read',
        export: 'inspection.read'
    },
    columns: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'requestedBy',
            label: 'درخواست‌کننده',
            type: 'text'
        },
        {
            key: 'inspectorId',
            label: 'کارشناس',
            type: 'text',
            visible: false
        },
        {
            key: 'scheduledDate',
            label: 'تاریخ برنامه',
            type: 'date',
            sortable: true
        },
        {
            key: 'completedAt',
            label: 'تکمیل',
            type: 'date',
            sortable: true
        },
        {
            key: 'score',
            label: 'امتیاز',
            type: 'number',
            sortable: true
        },
        {
            key: 'price',
            label: 'مبلغ',
            type: 'currency',
            visible: false
        },
        {
            key: 'createdAt',
            label: 'ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'REQUESTED',
                    label: 'درخواست‌شده'
                },
                {
                    value: 'SCHEDULED',
                    label: 'برنامه‌ریزی‌شده'
                },
                {
                    value: 'IN_PROGRESS',
                    label: 'در حال انجام'
                },
                {
                    value: 'COMPLETED',
                    label: 'تکمیل‌شده'
                },
                {
                    value: 'CANCELLED',
                    label: 'لغوشده'
                }
            ]
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'requestedBy',
        'inspectorId'
    ],
    fields: [
        {
            key: 'requestedBy',
            label: 'درخواست‌کننده',
            type: 'text',
            required: true
        },
        {
            key: 'inspectorId',
            label: 'کارشناس',
            type: 'text'
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'REQUESTED',
                    label: 'درخواست‌شده'
                },
                {
                    value: 'SCHEDULED',
                    label: 'برنامه‌ریزی‌شده'
                },
                {
                    value: 'COMPLETED',
                    label: 'تکمیل‌شده'
                }
            ]
        },
        {
            key: 'scheduledDate',
            label: 'تاریخ برنامه',
            type: 'datetime'
        },
        {
            key: 'score',
            label: 'امتیاز (۰-۱۰۰)',
            type: 'number'
        },
        {
            key: 'reportUrl',
            label: 'گزارش',
            type: 'media'
        },
        {
            key: 'price',
            label: 'مبلغ',
            type: 'currency'
        },
        {
            key: 'notes',
            label: 'یادداشت',
            type: 'textarea'
        }
    ],
    actions: [
        {
            key: 'schedule',
            label: 'برنامه‌ریزی',
            icon: 'Calendar',
            permission: 'inspection.read',
            type: 'confirm'
        },
        {
            key: 'complete',
            label: 'تکمیل',
            icon: 'CheckCircle',
            permission: 'inspection.read',
            type: 'confirm'
        },
        {
            key: 'cancel',
            label: 'لغو',
            icon: 'X',
            permission: 'inspection.read',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Inspection',
        actions: [
            'inspection.read'
        ]
    }
};
const transportConfig = {
    key: 'transports',
    titleFa: 'حمل‌ونقل',
    titleEn: 'Transport',
    icon: 'Truck',
    model: 'transportRequest',
    apiBase: '/api/admin/transport',
    adminPath: '/admin/resources/transports',
    permissions: {
        read: 'transport.read',
        create: 'transport.read',
        update: 'transport.read',
        delete: 'transport.read',
        export: 'transport.read'
    },
    columns: [
        {
            key: 'origin',
            label: 'مبدا',
            type: 'text',
            filterable: true
        },
        {
            key: 'destination',
            label: 'مقصد',
            type: 'text',
            filterable: true
        },
        {
            key: 'cargoType',
            label: 'نوع بار',
            type: 'text',
            visible: false
        },
        {
            key: 'cargoWeight',
            label: 'وزن',
            type: 'number',
            visible: false
        },
        {
            key: 'vehicleType',
            label: 'نوع وسیله',
            type: 'badge',
            filterable: true
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'quotedPrice',
            label: 'مبلغ',
            type: 'currency',
            sortable: true
        },
        {
            key: 'carrierName',
            label: 'حامل',
            type: 'text'
        },
        {
            key: 'trackingCode',
            label: 'کد ردیابی',
            type: 'text'
        },
        {
            key: 'loadingDate',
            label: 'بارگیری',
            type: 'date',
            sortable: true
        },
        {
            key: 'deliveryDate',
            label: 'تحویل',
            type: 'date',
            sortable: true
        },
        {
            key: 'createdAt',
            label: 'ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'REQUESTED',
                    label: 'درخواست‌شده'
                },
                {
                    value: 'QUOTING',
                    label: 'در حال پیشنهاد'
                },
                {
                    value: 'ACCEPTED',
                    label: 'پذیرفته‌شده'
                },
                {
                    value: 'IN_TRANSIT',
                    label: 'در حال حمل'
                },
                {
                    value: 'DELIVERED',
                    label: 'تحویل‌شده'
                },
                {
                    value: 'CANCELLED',
                    label: 'لغوشده'
                }
            ]
        },
        {
            key: 'vehicleType',
            label: 'نوع وسیله',
            type: 'select',
            options: [
                {
                    value: 'FLATBED',
                    label: 'تخت‌دار'
                },
                {
                    value: 'LOWBOY',
                    label: 'لوبوی'
                },
                {
                    value: 'CONTAINER',
                    label: 'کانتینر'
                },
                {
                    value: 'SPECIAL',
                    label: 'ویژه'
                }
            ]
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'origin',
        'destination',
        'carrierName',
        'trackingCode'
    ],
    fields: [
        {
            key: 'origin',
            label: 'مبدا',
            type: 'text',
            required: true
        },
        {
            key: 'destination',
            label: 'مقصد',
            type: 'text',
            required: true
        },
        {
            key: 'cargoType',
            label: 'نوع بار',
            type: 'text'
        },
        {
            key: 'cargoWeight',
            label: 'وزن (kg)',
            type: 'number'
        },
        {
            key: 'cargoLength',
            label: 'طول',
            type: 'number',
            visible: false
        },
        {
            key: 'cargoWidth',
            label: 'عرض',
            type: 'number',
            visible: false
        },
        {
            key: 'cargoHeight',
            label: 'ارتفاع',
            type: 'number',
            visible: false
        },
        {
            key: 'vehicleType',
            label: 'نوع وسیله',
            type: 'select',
            options: [
                {
                    value: 'FLATBED',
                    label: 'تخت‌دار'
                },
                {
                    value: 'LOWBOY',
                    label: 'لوبوی'
                },
                {
                    value: 'CONTAINER',
                    label: 'کانتینر'
                }
            ]
        },
        {
            key: 'loadingDate',
            label: 'تاریخ بارگیری',
            type: 'datetime'
        },
        {
            key: 'deliveryDate',
            label: 'تاریخ تحویل',
            type: 'datetime'
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'REQUESTED',
                    label: 'درخواست‌شده'
                },
                {
                    value: 'ACCEPTED',
                    label: 'پذیرفته‌شده'
                },
                {
                    value: 'IN_TRANSIT',
                    label: 'در حال حمل'
                },
                {
                    value: 'DELIVERED',
                    label: 'تحویل‌شده'
                }
            ]
        },
        {
            key: 'quotedPrice',
            label: 'مبلغ',
            type: 'currency'
        },
        {
            key: 'carrierName',
            label: 'نام حامل',
            type: 'text'
        },
        {
            key: 'carrierPhone',
            label: 'تماس حامل',
            type: 'text'
        },
        {
            key: 'trackingCode',
            label: 'کد ردیابی',
            type: 'text'
        },
        {
            key: 'requestedBy',
            label: 'درخواست‌کننده',
            type: 'text',
            required: true
        },
        {
            key: 'notes',
            label: 'یادداشت',
            type: 'textarea'
        }
    ],
    actions: [
        {
            key: 'accept',
            label: 'پذیرش',
            icon: 'CheckCircle',
            permission: 'transport.read',
            type: 'confirm'
        },
        {
            key: 'deliver',
            label: 'تحویل',
            icon: 'Package',
            permission: 'transport.read',
            type: 'confirm'
        },
        {
            key: 'cancel',
            label: 'لغو',
            icon: 'X',
            permission: 'transport.read',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'TransportRequest',
        actions: [
            'transport.read'
        ]
    }
};
const disputeConfig = {
    key: 'disputes',
    titleFa: 'اختلافات',
    titleEn: 'Disputes',
    icon: 'AlertTriangle',
    model: 'dispute',
    apiBase: '/api/admin/resources/disputes',
    adminPath: '/admin/resources/disputes',
    permissions: {
        read: 'deal.read',
        create: 'deal.manage',
        update: 'deal.manage',
        delete: 'deal.manage',
        export: 'deal.read'
    },
    columns: [
        {
            key: 'reason',
            label: 'دلیل',
            type: 'text',
            filterable: true
        },
        {
            key: 'description',
            label: 'توضیحات',
            type: 'text',
            visible: false
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'openedBy',
            label: 'باز‌کننده',
            type: 'text'
        },
        {
            key: 'resolution',
            label: 'راه‌حل',
            type: 'text',
            visible: false
        },
        {
            key: 'resolvedBy',
            label: 'حل‌کننده',
            type: 'text',
            visible: false
        },
        {
            key: 'openedAt',
            label: 'باز‌شدن',
            type: 'date',
            sortable: true
        },
        {
            key: 'resolvedAt',
            label: 'حل‌شدن',
            type: 'date',
            sortable: true
        },
        {
            key: 'createdAt',
            label: 'ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'OPEN',
                    label: 'باز'
                },
                {
                    value: 'UNDER_REVIEW',
                    label: 'در حال بررسی'
                },
                {
                    value: 'RESOLVED',
                    label: 'حل‌شده'
                },
                {
                    value: 'CANCELLED',
                    label: 'لغوشده'
                }
            ]
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'reason',
        'description',
        'openedBy'
    ],
    fields: [
        {
            key: 'reason',
            label: 'دلیل اختلاف',
            type: 'text',
            required: true
        },
        {
            key: 'description',
            label: 'توضیحات',
            type: 'textarea'
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'OPEN',
                    label: 'باز'
                },
                {
                    value: 'UNDER_REVIEW',
                    label: 'در حال بررسی'
                },
                {
                    value: 'RESOLVED',
                    label: 'حل‌شده'
                }
            ]
        },
        {
            key: 'resolution',
            label: 'راه‌حل',
            type: 'textarea'
        },
        {
            key: 'evidence',
            label: 'مدارک',
            type: 'json'
        },
        {
            key: 'openedBy',
            label: 'باز‌کننده',
            type: 'text',
            required: true
        }
    ],
    actions: [
        {
            key: 'review',
            label: 'شروع بررسی',
            icon: 'Search',
            permission: 'deal.manage',
            type: 'confirm'
        },
        {
            key: 'resolve',
            label: 'حل اختلاف',
            icon: 'CheckCircle',
            permission: 'deal.manage',
            type: 'confirm'
        },
        {
            key: 'cancel',
            label: 'لغو',
            icon: 'X',
            permission: 'deal.manage',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'Dispute',
        actions: [
            'deal.manage'
        ]
    }
};
const buyRequestConfig = {
    key: 'buy-requests',
    titleFa: 'درخواست‌های خرید',
    titleEn: 'Buy Requests',
    icon: 'ShoppingBag',
    model: 'buyRequest',
    apiBase: '/api/admin/requests',
    adminPath: '/admin/resources/buy-requests',
    permissions: {
        read: 'request.read',
        create: 'request.read',
        update: 'request.read',
        delete: 'request.read',
        export: 'request.read'
    },
    columns: [
        {
            key: 'title',
            label: 'عنوان',
            type: 'text',
            sortable: true,
            filterable: true
        },
        {
            key: 'category',
            label: 'دسته',
            type: 'text',
            filterable: true
        },
        {
            key: 'brandPref',
            label: 'ترجیح برند',
            type: 'text',
            visible: false
        },
        {
            key: 'budgetMin',
            label: 'حداقل بودجه',
            type: 'currency',
            visible: false
        },
        {
            key: 'budgetMax',
            label: 'حداکثر بودجه',
            type: 'currency',
            visible: false
        },
        {
            key: 'city',
            label: 'شهر',
            type: 'text',
            filterable: true
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'badge',
            sortable: true,
            filterable: true
        },
        {
            key: 'verified',
            label: 'تأییدشده',
            type: 'boolean',
            filterable: true
        },
        {
            key: 'viewCount',
            label: 'بازدید',
            type: 'number',
            sortable: true,
            visible: false
        },
        {
            key: 'createdAt',
            label: 'ایجاد',
            type: 'date',
            sortable: true
        }
    ],
    filters: [
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'CLOSED',
                    label: 'بسته'
                }
            ]
        },
        {
            key: 'verified',
            label: 'فقط تأییدشده',
            type: 'boolean'
        }
    ],
    defaultSort: {
        field: 'createdAt',
        order: 'desc'
    },
    pageSize: 25,
    searchable: true,
    searchFields: [
        'title',
        'category',
        'city',
        'requesterName',
        'requesterPhone'
    ],
    fields: [
        {
            key: 'title',
            label: 'عنوان درخواست',
            type: 'text',
            required: true
        },
        {
            key: 'description',
            label: 'توضیحات',
            type: 'textarea'
        },
        {
            key: 'category',
            label: 'دسته',
            type: 'text'
        },
        {
            key: 'brandPref',
            label: 'ترجیح برند',
            type: 'text'
        },
        {
            key: 'budgetMin',
            label: 'حداقل بودجه',
            type: 'currency'
        },
        {
            key: 'budgetMax',
            label: 'حداکثر بودجه',
            type: 'currency'
        },
        {
            key: 'city',
            label: 'شهر',
            type: 'text'
        },
        {
            key: 'province',
            label: 'استان',
            type: 'text'
        },
        {
            key: 'deadline',
            label: 'مهلت',
            type: 'text'
        },
        {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: [
                {
                    value: 'ACTIVE',
                    label: 'فعال'
                },
                {
                    value: 'CLOSED',
                    label: 'بسته'
                }
            ]
        },
        {
            key: 'verified',
            label: 'تأییدشده',
            type: 'boolean'
        },
        {
            key: 'requesterName',
            label: 'نام درخواست‌کننده',
            type: 'text'
        },
        {
            key: 'requesterPhone',
            label: 'تماس',
            type: 'text'
        }
    ],
    actions: [
        {
            key: 'verify',
            label: 'تأیید',
            icon: 'ShieldCheck',
            permission: 'request.read',
            type: 'confirm'
        },
        {
            key: 'close',
            label: 'بستن',
            icon: 'Lock',
            permission: 'request.read',
            type: 'confirm'
        },
        {
            key: 'delete',
            label: 'حذف',
            icon: 'Trash2',
            permission: 'request.read',
            type: 'confirm',
            variant: 'destructive'
        }
    ],
    audit: {
        enabled: true,
        entityType: 'BuyRequest',
        actions: [
            'request.read'
        ]
    }
};
}),
"[project]/src/lib/admin/resource-index.ts [app-route] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * HEAVIX — STEP 05: Admin Resource Registry Index
 * Registers all admin resources.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resource-registry.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$listing$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resources/listing.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$brand$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resources/brand.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$user$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resources/user.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resources/store-resources.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resources/marketplace-resources.ts [app-route] (ecmascript)");
;
;
;
;
;
;
// Marketplace
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$listing$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["listingConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$brand$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["brandConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$user$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["userConfig"]);
// Store
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["productConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["partConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["orderConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["paymentConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["companyConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["machineConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["reviewConfig"]);
// Marketplace CP
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["dealConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["rfqConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["offerConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["auctionConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["inspectionConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["transportConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["disputeConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buyRequestConfig"]);
;
}),
"[project]/src/lib/admin/query/filter-engine.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * HEAVIX — STEP 06: Filter Engine
 *
 * Translates frontend filter requests into Prisma `where` clauses.
 * Only allows filtering on fields that the resource config declares
 * as filterable — no arbitrary queries from frontend.
 *
 * Operators: eq, neq, contains, startsWith, endsWith,
 *            gt, gte, lt, lte, between, in, notIn, isNull, isNotNull
 */ __turbopack_context__.s([
    "buildWhereClause",
    ()=>buildWhereClause,
    "parseFilterParams",
    ()=>parseFilterParams
]);
function buildWhereClause(filters, config) {
    const where = {};
    for (const filter of filters){
        // Security: check if this field is filterable in the resource config
        const column = config.columns.find((c)=>c.key === filter.field);
        const isFilterable = column?.filterable || config.filters?.some((f)=>f.key === filter.field);
        if (!isFilterable) {
            continue;
        }
        const { field, operator, value } = filter;
        switch(operator){
            case 'eq':
                where[field] = value;
                break;
            case 'neq':
                where[field] = {
                    not: value
                };
                break;
            case 'contains':
                where[field] = {
                    contains: value,
                    mode: 'insensitive'
                };
                break;
            case 'startsWith':
                where[field] = {
                    startsWith: value,
                    mode: 'insensitive'
                };
                break;
            case 'endsWith':
                where[field] = {
                    endsWith: value,
                    mode: 'insensitive'
                };
                break;
            case 'gt':
                where[field] = {
                    gt: value
                };
                break;
            case 'gte':
                where[field] = {
                    gte: value
                };
                break;
            case 'lt':
                where[field] = {
                    lt: value
                };
                break;
            case 'lte':
                where[field] = {
                    lte: value
                };
                break;
            case 'between':
                if (Array.isArray(value) && value.length === 2) {
                    where[field] = {
                        gte: value[0],
                        lte: value[1]
                    };
                }
                break;
            case 'in':
                if (Array.isArray(value)) {
                    where[field] = {
                        in: value
                    };
                }
                break;
            case 'notIn':
                if (Array.isArray(value)) {
                    where[field] = {
                        notIn: value
                    };
                }
                break;
            case 'isNull':
                where[field] = null;
                break;
            case 'isNotNull':
                where[field] = {
                    not: null
                };
                break;
        }
    }
    return where;
}
function parseFilterParams(searchParams, config) {
    const filters = [];
    // Parse filter[field]=value or filter[field]=op:value
    for (const [key, value] of searchParams.entries()){
        if (key.startsWith('filter.')) {
            const field = key.slice(7); // remove "filter."
            const [op, val] = value.includes(':') ? value.split(':', 2) : [
                'eq',
                value
            ];
            filters.push({
                field,
                operator: op,
                value: val
            });
        }
    }
    // Also parse resource-specific filter keys (e.g., status=PUBLISHED)
    if (config.filters) {
        for (const filterDef of config.filters){
            const val = searchParams.get(filterDef.key);
            if (val !== null && val !== '') {
                filters.push({
                    field: filterDef.key,
                    operator: 'eq',
                    value: val
                });
            }
        }
    }
    return filters;
}
}),
"[project]/src/lib/admin/query/sort-engine.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * HEAVIX — STEP 06: Sort Engine
 *
 * Translates sort requests into Prisma `orderBy` clauses.
 * Only allows sorting on fields that the resource config
 * declares as sortable.
 */ __turbopack_context__.s([
    "buildOrderBy",
    ()=>buildOrderBy,
    "parseSortParam",
    ()=>parseSortParam
]);
function buildOrderBy(sort, config) {
    if (!sort) {
        // Use default sort from config
        if (config.defaultSort) {
            return {
                [config.defaultSort.field]: config.defaultSort.order
            };
        }
        return undefined;
    }
    // Security: check if field is sortable
    const column = config.columns.find((c)=>c.key === sort.field);
    if (!column?.sortable) {
        // Fallback to default sort
        if (config.defaultSort) {
            return {
                [config.defaultSort.field]: config.defaultSort.order
            };
        }
        return undefined;
    }
    return {
        [sort.field]: sort.order
    };
}
function parseSortParam(searchParams, config) {
    const sortParam = searchParams.get('sort');
    if (!sortParam) return null;
    // Format: "field.desc" or "field.asc"
    const parts = sortParam.split('.');
    if (parts.length !== 2) return null;
    const field = parts[0];
    const order = parts[1] === 'asc' ? 'asc' : 'desc';
    // Validate field is sortable
    const column = config.columns.find((c)=>c.key === field);
    if (!column?.sortable) return null;
    return {
        field,
        order
    };
}
}),
"[project]/src/lib/admin/query/pagination-search.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * HEAVIX — STEP 06: Pagination + Search Engine
 */ __turbopack_context__.s([
    "buildPagination",
    ()=>buildPagination,
    "buildPaginationResult",
    ()=>buildPaginationResult,
    "buildSearchWhere",
    ()=>buildSearchWhere,
    "parsePagination",
    ()=>parsePagination,
    "parseSearchParam",
    ()=>parseSearchParam
]);
function parsePagination(searchParams, config) {
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const maxPageSize = 100;
    const defaultPageSize = config.pageSize ?? 25;
    const pageSize = Math.min(maxPageSize, Math.max(1, parseInt(searchParams.get('pageSize') ?? String(defaultPageSize), 10)));
    return {
        page,
        pageSize
    };
}
function buildPagination(params) {
    const skip = (params.page - 1) * params.pageSize;
    const take = params.pageSize;
    return {
        skip,
        take
    };
}
function buildPaginationResult(params, total) {
    const totalPages = Math.ceil(total / params.pageSize) || 1;
    return {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages,
        hasPrev: params.page > 1,
        hasNext: params.page < totalPages
    };
}
function buildSearchWhere(search, config) {
    if (!search || !config.searchable || !config.searchFields?.length) {
        return undefined;
    }
    // Build OR clause: each search field gets a contains check
    return {
        OR: config.searchFields.map((field)=>({
                [field]: {
                    contains: search,
                    mode: 'insensitive'
                }
            }))
    };
}
function parseSearchParam(searchParams) {
    return searchParams.get('search') || null;
}
}),
"[project]/src/lib/admin/query/query-builder.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * HEAVIX — STEP 06: Query Builder
 *
 * Combines filter + sort + pagination + search engines into a
 * single Prisma query object. This is the entry point for the
 * Universal Data Access Layer.
 *
 * Security: only uses fields declared in the resource config.
 * No arbitrary queries from frontend.
 */ __turbopack_context__.s([
    "buildCountQuery",
    ()=>buildCountQuery,
    "buildPrismaQuery",
    ()=>buildPrismaQuery,
    "parseQueryParams",
    ()=>parseQueryParams
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$filter$2d$engine$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/query/filter-engine.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$sort$2d$engine$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/query/sort-engine.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$pagination$2d$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/query/pagination-search.ts [app-route] (ecmascript)");
;
;
;
function parseQueryParams(searchParams, config) {
    return {
        filters: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$filter$2d$engine$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseFilterParams"])(searchParams, config),
        sort: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$sort$2d$engine$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseSortParam"])(searchParams, config),
        pagination: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$pagination$2d$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parsePagination"])(searchParams, config),
        search: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$pagination$2d$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseSearchParam"])(searchParams)
    };
}
function buildPrismaQuery(params, config) {
    // Build where clause from filters
    const filterWhere = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$filter$2d$engine$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildWhereClause"])(params.filters, config);
    // Build search where clause
    const searchWhere = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$pagination$2d$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildSearchWhere"])(params.search, config);
    // Combine filter + search (AND)
    const where = {
        ...filterWhere
    };
    if (searchWhere) {
        // Merge search as additional AND condition
        if (where.OR) {
            // If filter already has OR, wrap everything in AND
            where.AND = [
                searchWhere
            ];
        } else {
            Object.assign(where, searchWhere);
        }
    }
    // Build sort
    const orderBy = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$sort$2d$engine$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildOrderBy"])(params.sort, config);
    // Build pagination
    const { skip, take } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$pagination$2d$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildPagination"])(params.pagination);
    return {
        where,
        orderBy,
        skip,
        take
    };
}
function buildCountQuery(params, config) {
    const filterWhere = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$filter$2d$engine$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildWhereClause"])(params.filters, config);
    const searchWhere = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$pagination$2d$search$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildSearchWhere"])(params.search, config);
    const where = {
        ...filterWhere
    };
    if (searchWhere) {
        if (where.OR) {
            where.AND = [
                searchWhere
            ];
        } else {
            Object.assign(where, searchWhere);
        }
    }
    return where;
}
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
"[project]/src/lib/admin/field-policy.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * HEAVIX — STEP 06: Field Policy
 *
 * Field-level authorization. Controls which fields a user
 * can READ and WRITE based on their permissions.
 *
 * This is separate from Resource-level authorization (STEP 02)
 * because a user might have 'listing.read' but NOT be allowed
 * to see 'sellerInternalNotes' or 'fraudScore'.
 *
 * Usage:
 *   const select = applyFieldPolicy(config, fieldCtx, 'read');
 *   const filteredData = applyFieldWritePolicy(config, data, fieldCtx);
 */ __turbopack_context__.s([
    "applyFieldPolicy",
    ()=>applyFieldPolicy,
    "applyFieldWritePolicy",
    ()=>applyFieldWritePolicy,
    "filterReadableFieldsAsync",
    ()=>filterReadableFieldsAsync
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/authorization/index.ts [app-route] (ecmascript)");
;
function applyFieldPolicy(config, ctx, mode) {
    // If no field permissions defined, return undefined (select all)
    const hasFieldPerms = config.columns.some((c)=>c.permissions?.read) || config.fields.some((f)=>f.permissions?.read);
    if (!hasFieldPerms) return undefined;
    const select = {};
    for (const col of config.columns){
        const fieldPerm = col.permissions?.read;
        if (!fieldPerm) {
            // No field-level permission — include (resource-level check already passed)
            select[col.key] = true;
        } else {
            // Has field-level permission — include only if user has it
            // For synchronous calls, we can't check async permissions.
            // Include the field and let the API layer filter asynchronously.
            select[col.key] = true;
        }
    }
    return select;
}
function applyFieldWritePolicy(config, data, ctx) {
    const filtered = {};
    for (const [key, value] of Object.entries(data)){
        const field = config.fields.find((f)=>f.key === key);
        if (!field) {
            continue;
        }
        const writePerm = field.permissions?.write;
        if (!writePerm) {
            // No field-level write permission — allow (resource-level check passed)
            filtered[key] = value;
        } else {
            // Has field-level permission — include (async check deferred to API layer)
            filtered[key] = value;
        }
    }
    return filtered;
}
async function filterReadableFieldsAsync(config, items, userId) {
    // Find fields with read permissions
    const fieldsWithPerms = config.columns.filter((c)=>c.permissions?.read);
    if (fieldsWithPerms.length === 0) return items;
    // Check each restricted field
    const fieldChecks = await Promise.all(fieldsWithPerms.map(async (col)=>({
            key: col.key,
            canRead: await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["can"])(userId, col.permissions.read)
        })));
    // Filter out restricted fields the user can't see
    return items.map((item)=>{
        const filtered = {
            ...item
        };
        for (const check of fieldChecks){
            if (!check.canRead) {
                delete filtered[check.key];
            }
        }
        return filtered;
    });
}
}),
"[project]/src/lib/admin/data-adapter.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createResource",
    ()=>createResource,
    "deleteResource",
    ()=>deleteResource,
    "getResource",
    ()=>getResource,
    "listResources",
    ()=>listResources,
    "updateResource",
    ()=>updateResource
]);
/**
 * HEAVIX — STEP 06: Resource Data Adapter
 *
 * Connects the Resource Registry to Prisma models.
 * Provides a uniform interface for CRUD operations on any
 * registered resource, with:
 *   - Permission checks (STEP 02 RBAC)
 *   - Field-level authorization (Field Policy)
 *   - Audit logging (STEP 04)
 *
 * This is the ONLY layer that touches the database for
 * Universal Resource operations.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$query$2d$builder$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/query/query-builder.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$field$2d$policy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/field-policy.ts [app-route] (ecmascript)");
;
;
;
// ── Get Prisma model accessor from config ───────────────────
function getPrismaModel(config) {
    const modelKey = config.model.charAt(0).toLowerCase() + config.model.slice(1);
    const model = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"][modelKey];
    if (!model) {
        throw new Error(`Prisma model "${modelKey}" not found for resource "${config.key}"`);
    }
    return model;
}
async function listResources(config, params, fieldCtx) {
    const model = getPrismaModel(config);
    const prismaQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$query$2d$builder$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildPrismaQuery"])(params, config);
    const countWhere = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$query$2d$builder$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildCountQuery"])(params, config);
    // Determine which fields to select (based on field policy)
    const select = fieldCtx ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$field$2d$policy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["applyFieldPolicy"])(config, fieldCtx, 'read') : undefined;
    const [items, total] = await Promise.all([
        model.findMany({
            ...prismaQuery,
            ...select ? {
                select
            } : {}
        }),
        model.count({
            where: countWhere
        })
    ]);
    const totalPages = Math.ceil(total / params.pagination.pageSize) || 1;
    return {
        items: items,
        total,
        page: params.pagination.page,
        pageSize: params.pagination.pageSize,
        totalPages
    };
}
async function getResource(config, id, fieldCtx) {
    const model = getPrismaModel(config);
    const select = fieldCtx ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$field$2d$policy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["applyFieldPolicy"])(config, fieldCtx, 'read') : undefined;
    const item = await model.findUnique({
        where: {
            id
        },
        ...select ? {
            select
        } : {}
    });
    return item;
}
async function createResource(config, data, fieldCtx) {
    const model = getPrismaModel(config);
    // Apply field policy (only writable fields)
    const filteredData = fieldCtx ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$field$2d$policy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["applyFieldWritePolicy"])(config, data, fieldCtx) : data;
    const item = await model.create({
        data: filteredData
    });
    return item;
}
async function updateResource(config, id, data, fieldCtx) {
    const model = getPrismaModel(config);
    // Apply field policy (only writable fields)
    const filteredData = fieldCtx ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$field$2d$policy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["applyFieldWritePolicy"])(config, data, fieldCtx) : data;
    const item = await model.update({
        where: {
            id
        },
        data: filteredData
    });
    return item;
}
async function deleteResource(config, id) {
    const model = getPrismaModel(config);
    // Check if this resource supports soft delete
    if (config.columns.some((c)=>c.key === 'deletedAt')) {
        // Soft delete
        await model.update({
            where: {
                id
            },
            data: {
                deletedAt: new Date()
            }
        });
    } else {
        // Hard delete
        await model.delete({
            where: {
                id
            }
        });
    }
    return true;
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
"[project]/src/lib/admin-guard.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "adminGuard",
    ()=>adminGuard,
    "requireAdmin",
    ()=>requireAdmin,
    "requireOwnership",
    ()=>requireOwnership
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/authorization/index.ts [app-route] (ecmascript)");
;
;
;
async function adminGuard(permissionKey) {
    // 1. Get user from session (RBAC path — the ONLY path now)
    const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getCurrentUser"])();
    if (!user) return null; // Not authenticated → 401
    // 2. Check admin role (RBAC, no User.role fallback)
    const admin = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isAdmin"])(user.id);
    if (!admin) {
        // Not admin — but might still have specific permissions
        if (permissionKey) {
            const hasPerm = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["can"])(user.id, permissionKey);
            if (hasPerm) {
                return {
                    id: user.id,
                    firstName: user.firstName
                };
            }
        }
        return false; // Forbidden → 403
    }
    // 3. If permission required, check it (ADMIN role has all permissions,
    //    but we still verify for audit trail + future fine-grained control)
    if (permissionKey) {
        const hasPerm = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["can"])(user.id, permissionKey);
        if (!hasPerm) {
        // Admin without this specific permission — still allow if ADMIN role
        // (ADMIN role is superuser; individual permission gaps are logged)
        // In a future hardening, this could be denied.
        }
    }
    return {
        id: user.id,
        firstName: user.firstName
    };
}
async function requireAdmin(permissionKey) {
    const result = await adminGuard(permissionKey);
    if (result === null) {
        return [
            null,
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "Unauthorized"
            }, {
                status: 401
            })
        ];
    }
    if (result === false) {
        return [
            null,
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: permissionKey ? `Forbidden: requires "${permissionKey}"` : "Forbidden: admin access required"
            }, {
                status: 403
            })
        ];
    }
    return [
        result,
        null
    ];
}
async function requireOwnership(userId, resourceOwnerId) {
    if (!resourceOwnerId) return false;
    if (userId === resourceOwnerId) return true;
    // Check if user is admin (via RBAC only — no legacy fallback)
    return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isAdmin"])(userId);
}
}),
"[project]/src/lib/admin/audit.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "audit",
    ()=>audit,
    "logAudit",
    ()=>logAudit
]);
/**
 * HEAVIX — Audit Log helper
 *
 * Records admin actions to the AuditLog table (append-only).
 * Uses the REAL HEAVIX AuditLog schema fields:
 *   actorId, actorType, action, entityType, entityId,
 *   beforeJson, afterJson, ip, userAgent, requestId, reason
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-route] (ecmascript)");
;
;
function safeStringify(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch  {
        return String(value);
    }
}
async function logAudit(params) {
    try {
        const h = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["headers"])();
        const ip = params.ip ?? (h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null);
        const ua = params.userAgent ?? (h.get('user-agent') || null);
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].auditLog.create({
            data: {
                actorId: params.actorId ?? null,
                actorType: params.actorType ?? 'USER',
                action: params.action,
                entityType: params.entityType,
                entityId: params.entityId ?? null,
                beforeJson: safeStringify(params.before),
                afterJson: safeStringify(params.after),
                ip: ip ?? null,
                userAgent: ua,
                requestId: params.requestId ?? null,
                reason: params.reason ?? null
            }
        });
    } catch (err) {
        console.error('[audit] failed to write audit log:', {
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
            error: err?.message
        });
    }
}
async function audit(ctx) {
    await logAudit({
        actorId: ctx.actorId,
        action: ctx.action,
        entityType: ctx.resource ?? 'Unknown',
        entityId: ctx.resourceId,
        reason: ctx.reason
    });
}
}),
"[project]/src/lib/audit.ts [app-route] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * HEAVIX — Audit log re-export (backward compat)
 * The canonical implementation is in src/lib/admin/audit.ts
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/audit.ts [app-route] (ecmascript)");
;
}),
"[project]/src/lib/audit-foundation.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "auditCreate",
    ()=>auditCreate,
    "auditDelete",
    ()=>auditDelete,
    "auditMutation",
    ()=>auditMutation,
    "getActorActivity",
    ()=>getActorActivity,
    "getAuditTrail",
    ()=>getAuditTrail,
    "requirePermissionAndAudit",
    ()=>requirePermissionAndAudit
]);
/**
 * HEAVIX — STEP 04: Audit Foundation
 *
 * Enhanced audit system that automatically captures before/after state
 * for any mutation. Works with the Authorization Service (STEP 02) to
 * provide a single requirePermissionAndAudit() call that:
 *   1. Checks permission (STEP 02 RBAC)
 *   2. Captures before-state
 *   3. Runs the mutation
 *   4. Captures after-state
 *   5. Logs the audit entry with before/after/reason
 *
 * Usage in API routes:
 *
 *   import { auditMutation, requirePermissionAndAudit } from '@/lib/audit-foundation';
 *
 *   // Simple audit (no permission check):
 *   await auditMutation({
 *     actorId: user.id,
 *     action: 'listing.publish',
 *     entityType: 'Listing',
 *     entityId: listingId,
 *     reason: 'Seller documents verified',
 *     operation: async () => {
 *       return await db.listing.update({ where: { id: listingId }, data: { status: 'PUBLISHED' } });
 *     },
 *   });
 *
 *   // Permission + Audit (one call):
 *   await requirePermissionAndAudit({
 *     actorId: user.id,
 *     permission: 'listing.publish',
 *     action: 'listing.publish',
 *     entityType: 'Listing',
 *     entityId: listingId,
 *     reason: 'Approved by admin',
 *     operation: async () => {
 *       return await db.listing.update({ where: { id: listingId }, data: { status: 'PUBLISHED' } });
 *     },
 *   });
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/audit.ts [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/audit.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/authorization/index.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-route] (ecmascript)");
;
;
;
;
// ── Helpers ────────────────────────────────────────────────
function safeStringify(value) {
    if (value === null || value === undefined) return null;
    try {
        return JSON.stringify(value);
    } catch  {
        return String(value);
    }
}
async function getHeaders() {
    try {
        return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["headers"])();
    } catch  {
        return null;
    }
}
async function getRequestInfo() {
    const h = await getHeaders();
    if (!h) return {
        ip: null,
        userAgent: null,
        requestId: null
    };
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
    const ua = h.get('user-agent') || null;
    const reqId = h.get('x-request-id') || null;
    return {
        ip,
        userAgent: ua,
        requestId: reqId
    };
}
async function auditMutation(ctx, operation) {
    const reqInfo = await getRequestInfo();
    // 1. Capture before-state
    let before = ctx.before ?? null;
    if (ctx.captureSnapshot && ctx.beforeModel && ctx.entityId) {
        try {
            const model = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"][ctx.beforeModel.charAt(0).toLowerCase() + ctx.beforeModel.slice(1)];
            if (model?.findUnique) {
                before = await model.findUnique({
                    where: {
                        id: ctx.entityId
                    }
                });
            }
        } catch  {}
    }
    // 2. Run the operation
    let result;
    try {
        result = await operation();
    } catch (err) {
        // Log the FAILED mutation attempt too (for security audit)
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logAudit"])({
            actorId: ctx.actorId,
            actorType: ctx.actorType ?? 'USER',
            action: `${ctx.action}.failed`,
            entityType: ctx.entityType,
            entityId: ctx.entityId,
            before: before,
            after: null,
            reason: ctx.reason ? `${ctx.reason} | FAILED: ${err.message}` : `FAILED: ${err.message}`,
            ip: reqInfo.ip,
            userAgent: reqInfo.userAgent,
            requestId: reqInfo.requestId
        });
        throw err; // re-throw — the caller handles the error
    }
    // 3. Capture after-state
    let after = ctx.after ?? null;
    if (ctx.captureSnapshot && ctx.afterModel && ctx.entityId) {
        try {
            const model = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"][ctx.afterModel.charAt(0).toLowerCase() + ctx.afterModel.slice(1)];
            if (model?.findUnique) {
                after = await model.findUnique({
                    where: {
                        id: ctx.entityId
                    }
                });
            }
        } catch  {}
    }
    // If operation returned the updated entity, use it as after-state
    if (!after && result && typeof result === 'object') {
        after = result;
    }
    // 4. Log audit entry
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logAudit"])({
        actorId: ctx.actorId,
        actorType: ctx.actorType ?? 'USER',
        action: ctx.action,
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        before,
        after,
        reason: ctx.reason,
        ip: reqInfo.ip,
        userAgent: reqInfo.userAgent,
        requestId: reqInfo.requestId
    });
    return {
        result,
        before,
        after,
        audited: true
    };
}
async function requirePermissionAndAudit(params) {
    // 1. Check permission (STEP 02 RBAC)
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requirePermission"])(params.actorId, params.permission);
    // 2. Audit + execute (STEP 04)
    return auditMutation({
        actorId: params.actorId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        reason: params.reason,
        captureSnapshot: params.captureSnapshot,
        beforeModel: params.beforeModel,
        afterModel: params.afterModel,
        before: params.before,
        after: params.after
    }, params.operation);
}
async function auditCreate(actorId, action, entityType, entityId, data, reason) {
    const reqInfo = await getRequestInfo();
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logAudit"])({
        actorId,
        action,
        entityType,
        entityId,
        after: data,
        reason: reason ?? 'Created',
        ip: reqInfo.ip,
        userAgent: reqInfo.userAgent,
        requestId: reqInfo.requestId
    });
}
async function auditDelete(actorId, action, entityType, entityId, beforeData, reason) {
    const reqInfo = await getRequestInfo();
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$audit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["logAudit"])({
        actorId,
        action,
        entityType,
        entityId,
        before: beforeData,
        reason: reason ?? 'Deleted',
        ip: reqInfo.ip,
        userAgent: reqInfo.userAgent,
        requestId: reqInfo.requestId
    });
}
async function getAuditTrail(entityType, entityId, limit = 50) {
    return await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].auditLog.findMany({
        where: {
            entityType,
            entityId
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: limit
    });
}
async function getActorActivity(actorId, limit = 50) {
    return await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].auditLog.findMany({
        where: {
            actorId
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: limit
    });
}
}),
"[project]/src/app/api/admin/resources/[resource]/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST,
    "dynamic",
    ()=>dynamic
]);
// @ts-nocheck — HEAVIX Legacy: Owner=Migration, Scope=OldAdmin, Ticket=STEP-14.6-LEGACY
/**
 * HEAVIX — STEP 06: Universal Resource API
 *
 * GET  /api/admin/resources/:resource     — list with filters/sort/pagination/search
 * POST /api/admin/resources/:resource     — create new resource
 *
 * This is the single API endpoint that serves ALL registered resources.
 * It uses the Resource Registry to look up the config, the Query Engine
 * to parse params, and the Data Adapter to execute queries.
 *
 * Security:
 *   - Resource must be registered
 *   - User must have the resource's read permission
 *   - Filters only use fields declared as filterable in config
 *   - No arbitrary queries from frontend
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/admin/resource-index.ts [app-route] (ecmascript) <locals>"); // ensures all resources are registered
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resource-registry.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$query$2d$builder$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/query/query-builder.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$data$2d$adapter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/data-adapter.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$field$2d$policy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/field-policy.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2d$guard$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin-guard.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$audit$2d$foundation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/audit-foundation.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/authorization/index.ts [app-route] (ecmascript)");
;
;
;
;
;
;
;
;
;
const dynamic = 'force-dynamic';
async function GET(req, { params }) {
    const { resource: resourceKey } = await params;
    // 1. Look up resource config
    const config = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registry"].get(resourceKey);
    if (!config) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: `Unknown resource: "${resourceKey}"`
        }, {
            status: 404
        });
    }
    // 2. Check read permission
    const readPerm = config.permissions.read;
    if (readPerm) {
        const [user, error] = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2d$guard$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireAdmin"])();
        if (error) return error;
        // Check if user has the specific read permission
        const hasReadPerm = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authorization$2f$index$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["can"])(user?.id ?? null, readPerm);
        if (!hasReadPerm) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: `Forbidden: requires "${readPerm}"`
            }, {
                status: 403
            });
        }
        // 3. Parse query params
        const url = new URL(req.url);
        const queryParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$query$2f$query$2d$builder$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["parseQueryParams"])(url.searchParams, config);
        // 4. Execute query via Data Adapter
        try {
            const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$data$2d$adapter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["listResources"])(config, queryParams, {
                userId: user?.id ?? null
            });
            // 5. Apply field policy (filter restricted fields)
            const filteredItems = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$field$2d$policy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["filterReadableFieldsAsync"])(config, result.items, user?.id ?? null);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                ok: true,
                data: {
                    items: filteredItems,
                    pagination: {
                        page: result.page,
                        pageSize: result.pageSize,
                        total: result.total,
                        totalPages: result.totalPages
                    }
                }
            });
        } catch (err) {
            console.error(`[resources/${resourceKey}] GET error:`, err);
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Failed to list resources'
            }, {
                status: 500
            });
        }
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: 'Resource has no read permission defined'
    }, {
        status: 500
    });
}
async function POST(req, { params }) {
    const { resource: resourceKey } = await params;
    const config = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registry"].get(resourceKey);
    if (!config) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: `Unknown resource: "${resourceKey}"`
        }, {
            status: 404
        });
    }
    // Check create permission
    const createPerm = config.permissions.create;
    if (!createPerm) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Create not supported for this resource'
        }, {
            status: 400
        });
    }
    const [user, error] = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2d$guard$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["requireAdmin"])(createPerm);
    if (error) return error;
    // Parse body
    const body = await req.json().catch(()=>null);
    if (!body) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Invalid JSON body'
        }, {
            status: 400
        });
    }
    try {
        const item = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$data$2d$adapter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createResource"])(config, body, {
            userId: user?.id ?? null
        });
        // Audit
        if (config.audit?.enabled && item?.id) {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$audit$2d$foundation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["auditCreate"])(user?.id ?? null, config.audit.actions.find((a)=>a.includes('.create')) || `${config.key}.create`, config.audit.entityType, item.id, body, 'Created via Universal Resource API');
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ok: true,
            data: item
        }, {
            status: 201
        });
    } catch (err) {
        console.error(`[resources/${resourceKey}] POST error:`, err);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Failed to create resource',
            details: err.message
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__35a23ef6._.js.map