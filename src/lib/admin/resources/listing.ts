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
    { key: 'title', label: 'عنوان', type: 'text', required: true, placeholder: 'عنوان آگهی' },
    { key: 'slug', label: 'اسلاگ', type: 'slug', slugFrom: 'title', visible: false },
    { key: 'description', label: 'توضیحات', type: 'textarea' },
    { key: 'shortDesc', label: 'خلاصه', type: 'textarea', helpText: 'حداکثر ۲۰۰ کاراکتر' },
    { key: 'price', label: 'قیمت (تومان)', type: 'currency' },
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
    { key: 'year', label: 'سال ساخت', type: 'number' },
    { key: 'workingHours', label: 'ساعت کارکرد', type: 'number' },
    { key: 'province', label: 'استان', type: 'text' },
    { key: 'city', label: 'شهر', type: 'text' },
    { key: 'sellerPhone', label: 'تماس', type: 'text' },
    { key: 'sellerName', label: 'نام فروشنده', type: 'text' },
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
    { key: 'publish', label: 'انتشار', icon: 'CheckCircle', permission: 'listing.publish', type: 'confirm', variant: 'default', confirmMessage: 'این آگهی منتشر شود؟' },
    { key: 'feature', label: 'ویژه کردن', icon: 'Star', permission: 'listing.update', type: 'confirm', confirmMessage: 'این آگهی ویژه شود؟' },
    { key: 'verify', label: 'تأیید', icon: 'ShieldCheck', permission: 'listing.update', type: 'confirm', confirmMessage: 'این آگهی تأیید شود؟' },
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'listing.delete', type: 'confirm', variant: 'destructive', confirmMessage: 'این آگهی حذف شود؟ این عملیات قابل بازگشت نیست.' },
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
