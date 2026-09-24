import type { AdminResourceConfig } from '../types';

export const brandConfig: AdminResourceConfig = {
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
    export: 'brand.read',
  },

  columns: [
    { key: 'name', label: 'نام', type: 'text', sortable: true, filterable: true },
    { key: 'slug', label: 'اسلاگ', type: 'text', sortable: true, visible: false },
    { key: 'country', label: 'کشور', type: 'text', filterable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'verification', label: 'تأیید', type: 'badge', filterable: true },
    { key: 'featured', label: 'ویژه', type: 'boolean', sortable: true },
    { key: 'active', label: 'فعال', type: 'boolean', sortable: true },
    { key: 'foundedYear', label: 'سال تأسیس', type: 'number', sortable: true, visible: false },
    { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' },
      { value: 'INACTIVE', label: 'غیرفعال' },
    ]},
    { key: 'verification', label: 'تأیید', type: 'select', options: [
      { value: 'VERIFIED', label: 'تأییدشده' },
      { value: 'UNVERIFIED', label: 'تأییدنشده' },
    ]},
    { key: 'featured', label: 'فقط ویژه‌ها', type: 'boolean' },
    { key: 'country', label: 'کشور', type: 'text' },
  ],

  defaultSort: { field: 'name', order: 'asc' },
  pageSize: 50,
  searchable: true,
  searchFields: ['name', 'nameEn', 'shortName', 'slug', 'country'],

  fields: [
    { key: 'name', label: 'نام (فارسی)', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 100, message: 'نام برند باید بین ۲ تا ۱۰۰ نویسه باشد' } },
    { key: 'nameEn', label: 'نام (انگلیسی)', type: 'text',
      validation: { maxLength: 100, message: 'نام انگلیسی نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'shortName', label: 'نام کوتاه', type: 'text',
      validation: { maxLength: 50, message: 'نام کوتاه نباید بیش از ۵۰ نویسه باشد' } },
    { key: 'slug', label: 'اسلاگ', type: 'slug', slugFrom: 'name', visible: false,
      validation: { maxLength: 120, message: 'اسلاگ نباید بیش از ۱۲۰ نویسه باشد' } },
    { key: 'description', label: 'توضیحات', type: 'textarea',
      validation: { maxLength: 5000, message: 'توضیحات نباید بیش از ۵,۰۰۰ نویسه باشد' } },
    { key: 'logoUrl', label: 'لوگو', type: 'media' },
    { key: 'website', label: 'وب‌سایت', type: 'text',
      validation: { pattern: '^https?://.+', message: 'وب‌سایت باید با http:// یا https:// شروع شود' } },
    { key: 'country', label: 'کشور', type: 'text',
      validation: { maxLength: 100, message: 'کشور نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'foundedYear', label: 'سال تأسیس', type: 'number',
      validation: { min: 1800, max: 2100, message: 'سال تأسیس باید بین ۱۸۰۰ تا ۲۱۰۰ باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' },
      { value: 'INACTIVE', label: 'غیرفعال' },
    ]},
    { key: 'verification', label: 'تأیید', type: 'select', options: [
      { value: 'VERIFIED', label: 'تأییدشده' },
      { value: 'UNVERIFIED', label: 'تأییدنشده' },
    ],
      permissions: { read: 'brand.read', write: 'brand.publish' } },
    { key: 'featured', label: 'ویژه', type: 'boolean',
      permissions: { read: 'brand.read', write: 'brand.update' } },
    { key: 'active', label: 'فعال', type: 'boolean', defaultValue: true,
      permissions: { read: 'brand.read', write: 'brand.update' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'aliases', label: 'اسم‌های مستعار', type: 'relations' },
    { key: 'models', label: 'مدل‌ها', type: 'relations' },
    { key: 'media', label: 'رسانه', type: 'media' },
    { key: 'seo', label: 'سئو', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'verify', label: 'تأیید برند', icon: 'ShieldCheck', permission: 'brand.publish', type: 'confirm', confirmMessage: 'این برند تأیید شود؟', apiPath: '/api/admin/resources/brands', apiMethod: 'PATCH' },
    { key: 'feature', label: 'ویژه کردن', icon: 'Star', permission: 'brand.update', type: 'confirm', confirmMessage: 'این برند ویژه شود؟', apiPath: '/api/admin/resources/brands', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'brand.delete', type: 'confirm', variant: 'destructive', confirmMessage: 'این برند حذف شود؟', apiPath: '/api/admin/resources/brands', apiMethod: 'DELETE' },
  ],

  bulkActions: [
    { key: 'bulk-verify', label: 'تأیید گروهی', icon: 'ShieldCheck', permission: 'brand.publish', type: 'confirm', confirmMessage: 'برندهای انتخاب‌شده تأیید شوند؟' },
    { key: 'bulk-feature', label: 'ویژه کردن گروهی', icon: 'Star', permission: 'brand.update', type: 'confirm', confirmMessage: 'برندهای انتخاب‌شده ویژه شوند؟' },
  ],

  audit: {
    enabled: true,
    entityType: 'Brand',
    actions: ['brand.update', 'brand.delete', 'brand.publish'],
  },

  relations: [
    { label: 'اسم‌های مستعار', resource: 'brand-aliases', filterField: 'brandId' },
    { label: 'مدل‌های محصول', resource: 'product-models', filterField: 'brandId' },
  ],
};
