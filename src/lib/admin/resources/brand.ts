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
    { key: 'name', label: 'نام (فارسی)', type: 'text', required: true },
    { key: 'nameEn', label: 'نام (انگلیسی)', type: 'text' },
    { key: 'shortName', label: 'نام کوتاه', type: 'text' },
    { key: 'slug', label: 'اسلاگ', type: 'slug', slugFrom: 'name', visible: false },
    { key: 'description', label: 'توضیحات', type: 'textarea' },
    { key: 'logoUrl', label: 'لوگو', type: 'media' },
    { key: 'website', label: 'وب‌سایت', type: 'text' },
    { key: 'country', label: 'کشور', type: 'text' },
    { key: 'foundedYear', label: 'سال تأسیس', type: 'number' },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' },
      { value: 'INACTIVE', label: 'غیرفعال' },
    ]},
    { key: 'verification', label: 'تأیید', type: 'select', options: [
      { value: 'VERIFIED', label: 'تأییدشده' },
      { value: 'UNVERIFIED', label: 'تأییدنشده' },
    ]},
    { key: 'featured', label: 'ویژه', type: 'boolean' },
    { key: 'active', label: 'فعال', type: 'boolean', defaultValue: true },
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
    { key: 'verify', label: 'تأیید برند', icon: 'ShieldCheck', permission: 'brand.publish', type: 'confirm', confirmMessage: 'این برند تأیید شود؟' },
    { key: 'feature', label: 'ویژه کردن', icon: 'Star', permission: 'brand.update', type: 'confirm', confirmMessage: 'این برند ویژه شود؟' },
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'brand.delete', type: 'confirm', variant: 'destructive', confirmMessage: 'این برند حذف شود؟' },
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
