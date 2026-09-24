module.exports = [
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/src/app/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/src/app/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/src/app/admin/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/src/app/admin/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/src/lib/admin/resource-registry.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/admin/resources/listing.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/admin/resources/brand.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/admin/resources/user.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/admin/resources/store-resources.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/admin/resources/marketplace-resources.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
"[project]/src/lib/admin/resource-index.ts [app-rsc] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * HEAVIX — STEP 05: Admin Resource Registry Index
 * Registers all admin resources.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resource-registry.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$listing$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resources/listing.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$brand$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resources/brand.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$user$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resources/user.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resources/store-resources.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resources/marketplace-resources.ts [app-rsc] (ecmascript)");
;
;
;
;
;
;
// Marketplace
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$listing$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["listingConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$brand$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["brandConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$user$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["userConfig"]);
// Store
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["productConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["partConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["orderConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["paymentConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["companyConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["machineConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$store$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["reviewConfig"]);
// Marketplace CP
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["dealConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["rfqConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["offerConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["auctionConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["inspectionConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["transportConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["disputeConfig"]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerResource"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resources$2f$marketplace$2d$resources$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["buyRequestConfig"]);
;
}),
"[project]/src/components/admin/universal-table.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "UniversalTable",
    ()=>UniversalTable
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const UniversalTable = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call UniversalTable() from the server but UniversalTable is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/admin/universal-table.tsx <module evaluation>", "UniversalTable");
}),
"[project]/src/components/admin/universal-table.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "UniversalTable",
    ()=>UniversalTable
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const UniversalTable = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call UniversalTable() from the server but UniversalTable is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/components/admin/universal-table.tsx", "UniversalTable");
}),
"[project]/src/components/admin/universal-table.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$admin$2f$universal$2d$table$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/src/components/admin/universal-table.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$admin$2f$universal$2d$table$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/components/admin/universal-table.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$admin$2f$universal$2d$table$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/src/app/admin/resources/[resource]/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ResourceListPage,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$index$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/src/lib/admin/resource-index.ts [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/admin/resource-registry.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$admin$2f$universal$2d$table$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/admin/universal-table.tsx [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.react-server.js [app-rsc] (ecmascript)");
;
;
;
;
;
;
const dynamic = 'force-dynamic';
async function ResourceListPage({ params }) {
    const { resource: resourceKey } = await params;
    const config = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$admin$2f$resource$2d$registry$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registry"].get(resourceKey);
    if (!config) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])('/admin/dashboard');
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4 p-4 md:p-6",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                className: "text-lg font-bold",
                                children: config.titleFa
                            }, void 0, false, {
                                fileName: "[project]/src/app/admin/resources/[resource]/page.tsx",
                                lineNumber: 23,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs text-muted-foreground",
                                children: config.titleEn
                            }, void 0, false, {
                                fileName: "[project]/src/app/admin/resources/[resource]/page.tsx",
                                lineNumber: 24,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/admin/resources/[resource]/page.tsx",
                        lineNumber: 22,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
                        href: `/admin/resources/${resourceKey}/new`,
                        className: "rounded-md bg-[#F58220] px-4 py-2 text-xs font-medium text-white hover:bg-[#F58220]/90",
                        children: "+ افزودن"
                    }, void 0, false, {
                        fileName: "[project]/src/app/admin/resources/[resource]/page.tsx",
                        lineNumber: 26,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/admin/resources/[resource]/page.tsx",
                lineNumber: 21,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$admin$2f$universal$2d$table$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["UniversalTable"], {
                config: config
            }, void 0, false, {
                fileName: "[project]/src/app/admin/resources/[resource]/page.tsx",
                lineNumber: 33,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/admin/resources/[resource]/page.tsx",
        lineNumber: 20,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/app/admin/resources/[resource]/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/src/app/admin/resources/[resource]/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__6bfcdd9a._.js.map