import type { AdminResourceConfig } from '../types';

export const listingConfig: AdminResourceConfig = {
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
    export: 'listing.export',
  },

  // PR-SC-00 — Row-level tenant scoping for the primary seller-owned resource.
  // Listing.sellerId is the owner column. A SELLER sees/edits only their own
  // listings; a user with `listing.moderate` (moderators/admins) sees all;
  // ADMIN sees all. The owner identity is resolved server-side from the
  // authenticated session — never from a client-supplied sellerId.
  ownership: {
    ownerField: 'sellerId',
    moderatePermission: 'listing.moderate',
  },

  columns: [
    { key: 'title', label: 'عنوان', type: 'text', sortable: true, filterable: true, visible: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true, visible: true },
    { key: 'listingType', label: 'نوع', type: 'badge', sortable: true, filterable: true, visible: true },
    { key: 'price', label: 'قیمت', type: 'currency', sortable: true, visible: true },
    { key: 'condition', label: 'وضعیت دستگاه', type: 'text', visible: true },
    { key: 'city', label: 'شهر', type: 'text', filterable: true, visible: true },
    { key: 'year', label: 'سال', type: 'number', sortable: true, visible: true },
    { key: 'viewCount', label: 'بازدید', type: 'number', sortable: true, visible: false },
    { key: 'featured', label: 'ویژه', type: 'boolean', sortable: true, visible: false },
    { key: 'verified', label: 'تأییدشده', type: 'boolean', sortable: true, visible: false },
    { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', sortable: true, visible: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PUBLISHED', label: 'منتشرشده' },
      { value: 'DRAFT', label: 'پیش‌نویس' },
      { value: 'REJECTED', label: 'ردشده' },
      { value: 'SOLD', label: 'فروخته‌شده' },
    ]},
    { key: 'listingType', label: 'نوع معامله', type: 'select', options: [
      { value: 'SALE', label: 'فروش' },
      { value: 'RENT', label: 'اجاره' },
      { value: 'WANTED', label: 'درخواست خرید' },
    ]},
    { key: 'featured', label: 'فقط ویژه‌ها', type: 'boolean' },
    { key: 'verified', label: 'فقط تأییدشده‌ها', type: 'boolean' },
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['title', 'description', 'city', 'sellerName', 'sellerPhone'],

  fields: [
    { key: 'title', label: 'عنوان', type: 'text', required: true, placeholder: 'عنوان آگهی',
      validation: { minLength: 5, maxLength: 200, message: 'عنوان آگهی باید بین ۵ تا ۲۰۰ نویسه باشد' } },
    { key: 'slug', label: 'اسلاگ', type: 'slug', slugFrom: 'title', visible: false,
      validation: { maxLength: 220, message: 'اسلاگ نباید بیش از ۲۲۰ نویسه باشد' } },
    { key: 'description', label: 'توضیحات', type: 'textarea',
      validation: { maxLength: 10000, message: 'توضیحات نباید بیش از ۱۰,۰۰۰ نویسه باشد' } },
    { key: 'shortDesc', label: 'خلاصه', type: 'textarea', helpText: 'حداکثر ۲۰۰ کاراکتر',
      validation: { maxLength: 200, message: 'خلاصه باید حداکثر ۲۰۰ نویسه باشد' } },
    { key: 'price', label: 'قیمت (تومان)', type: 'currency',
      validation: { min: 0, message: 'قیمت باید عدد نامنفی باشد' } },
    { key: 'priceType', label: 'نوع قیمت', type: 'select', options: [
      { value: 'NEGOTIABLE', label: 'توافقی' },
      { value: 'FIXED', label: 'ثابت' },
    ]},
    { key: 'listingType', label: 'نوع معامله', type: 'select', options: [
      { value: 'SALE', label: 'فروش' },
      { value: 'RENT', label: 'اجاره' },
    ]},
    { key: 'condition', label: 'وضعیت دستگاه', type: 'select', options: [
      { value: 'NEW', label: 'نو' },
      { value: 'EXCELLENT', label: 'عالی' },
      { value: 'GOOD', label: 'خوب' },
      { value: 'FAIR', label: 'متوسط' },
      { value: 'NEEDS_REPAIR', label: 'نیاز به تعمیر' },
    ]},
    { key: 'year', label: 'سال ساخت', type: 'number',
      validation: { min: 1950, max: 2100, message: 'سال ساخت باید بین ۱۹۵۰ تا ۲۱۰۰ باشد' } },
    { key: 'workingHours', label: 'ساعت کارکرد', type: 'number',
      validation: { min: 0, message: 'ساعت کارکرد باید عدد نامنفی باشد' } },
    { key: 'province', label: 'استان', type: 'text',
      validation: { maxLength: 100, message: 'استان نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'city', label: 'شهر', type: 'text',
      validation: { maxLength: 100, message: 'شهر نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'sellerPhone', label: 'تماس', type: 'text',
      validation: { pattern: '^0\\d{10}$', message: 'تماس باید ۱۱ رقم و با ۰ شروع شود (مثال: 09123456789)' },
      permissions: { read: 'user.read', write: 'listing.update' } },
    { key: 'sellerName', label: 'نام فروشنده', type: 'text',
      validation: { maxLength: 200, message: 'نام فروشنده نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PUBLISHED', label: 'منتشرشده' },
      { value: 'DRAFT', label: 'پیش‌نویس' },
      { value: 'SOLD', label: 'فروخته‌شده' },
    ]},
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'attributes', label: 'ویژگی‌ها', type: 'relations' },
    { key: 'media', label: 'تصاویر', type: 'media' },
    { key: 'activity', label: 'فعالیت', type: 'activity' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'publish', label: 'انتشار', icon: 'CheckCircle', permission: 'listing.publish', type: 'confirm', variant: 'default', confirmMessage: 'این آگهی منتشر شود؟', apiPath: '/api/admin/resources/listings', apiMethod: 'POST' },
    { key: 'feature', label: 'ویژه کردن', icon: 'Star', permission: 'listing.update', type: 'confirm', confirmMessage: 'این آگهی ویژه شود؟', apiPath: '/api/admin/resources/listings', apiMethod: 'PATCH' },
    { key: 'verify', label: 'تأیید', icon: 'ShieldCheck', permission: 'listing.update', type: 'confirm', confirmMessage: 'این آگهی تأیید شود؟', apiPath: '/api/admin/resources/listings', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'listing.delete', type: 'confirm', variant: 'destructive', confirmMessage: 'این آگهی حذف شود؟ این عملیات قابل بازگشت نیست.', apiPath: '/api/admin/resources/listings', apiMethod: 'DELETE' },
  ],

  bulkActions: [
    { key: 'bulk-publish', label: 'انتشار گروهی', icon: 'CheckCircle', permission: 'listing.publish', type: 'confirm', confirmMessage: 'آگهی‌های انتخاب‌شده منتشر شوند؟' },
    { key: 'bulk-feature', label: 'ویژه کردن گروهی', icon: 'Star', permission: 'listing.update', type: 'confirm', confirmMessage: 'آگهی‌های انتخاب‌شده ویژه شوند؟' },
    { key: 'bulk-delete', label: 'حذف گروهی', icon: 'Trash2', permission: 'listing.delete', type: 'confirm', confirmMessage: 'آگهی‌های انتخاب‌شده حذف شوند؟' },
  ],

  audit: {
    enabled: true,
    entityType: 'Listing',
    actions: ['listing.publish', 'listing.update', 'listing.delete', 'listing.moderate'],
  },

  relations: [
    { label: 'تصاویر', resource: 'listing-images', filterField: 'listingId' },
    { label: 'پیشنهادها', resource: 'offers', filterField: 'listingId' },
  ],
};
