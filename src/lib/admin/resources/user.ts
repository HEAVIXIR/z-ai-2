import type { AdminResourceConfig } from '../types';

export const userConfig: AdminResourceConfig = {
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
    export: 'user.read',
  },

  columns: [
    { key: 'firstName', label: 'نام', type: 'text', sortable: true, filterable: true },
    { key: 'lastName', label: 'نام خانوادگی', type: 'text', sortable: true, filterable: true },
    { key: 'email', label: 'ایمیل', type: 'text', sortable: true, filterable: true },
    { key: 'mobile', label: 'موبایل', type: 'text', sortable: true, filterable: true },
    { key: 'role', label: 'نقش', type: 'badge', filterable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'emailVerified', label: 'ایمیل تأییدشده', type: 'boolean', visible: false },
    { key: 'mobileVerified', label: 'موبایل تأییدشده', type: 'boolean', visible: false },
    { key: 'companyName', label: 'شرکت', type: 'text', visible: false },
    { key: 'lastLoginAt', label: 'آخرین ورود', type: 'date', sortable: true, visible: true },
    { key: 'createdAt', label: 'تاریخ عضویت', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'role', label: 'نقش', type: 'select', options: [
      { value: 'ADMIN', label: 'مدیر' },
      { value: 'SELLER', label: 'فروشنده' },
      { value: 'BUYER', label: 'خریدار' },
      { value: 'MODERATOR', label: 'ناظر' },
      { value: 'SUPPORT', label: 'پشتیبان' },
    ]},
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' },
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'SUSPENDED', label: 'معلق' },
    ]},
    { key: 'emailVerified', label: 'ایمیل تأییدشده', type: 'boolean' },
    { key: 'mobileVerified', label: 'موبایل تأییدشده', type: 'boolean' },
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['firstName', 'lastName', 'email', 'mobile', 'companyName'],

  fields: [
    { key: 'firstName', label: 'نام', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 50, message: 'نام باید بین ۲ تا ۵۰ نویسه باشد' } },
    { key: 'lastName', label: 'نام خانوادگی', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 50, message: 'نام خانوادگی باید بین ۲ تا ۵۰ نویسه باشد' } },
    { key: 'email', label: 'ایمیل', type: 'text', required: true, placeholder: 'user@example.com',
      validation: {
        pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
        message: 'فرمت ایمیل نامعتبر است (مثال: user@example.com)',
      } },
    { key: 'mobile', label: 'موبایل', type: 'text', required: true, placeholder: '09123456789',
      validation: {
        pattern: '^09\\d{9}$',
        message: 'موبایل باید با ۰۹ شروع و ۱۱ رقم باشد (مثال: 09123456789)',
      } },
    { key: 'passwordHash', label: 'رمز عبور', type: 'password', helpText: 'فقط هنگام ایجاد کاربر جدید',
      validation: { minLength: 8, maxLength: 128, message: 'رمز عبور باید حداقل ۸ نویسه باشد' } },
    { key: 'userType', label: 'نوع کاربر', type: 'select', options: [
      { value: 'INDIVIDUAL', label: 'حقیقی' },
      { value: 'COMPANY', label: 'حقوقی' },
    ]},
    { key: 'role', label: 'نقش', type: 'select', options: [
      { value: 'ADMIN', label: 'مدیر' },
      { value: 'SELLER', label: 'فروشنده' },
      { value: 'BUYER', label: 'خریدار' },
      { value: 'MODERATOR', label: 'ناظر' },
      { value: 'SUPPORT', label: 'پشتیبان' },
    ]},
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' },
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'SUSPENDED', label: 'معلق' },
    ]},
    { key: 'companyName', label: 'نام شرکت', type: 'text',
      validation: { maxLength: 200, message: 'نام شرکت نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'emailVerified', label: 'ایمیل تأییدشده', type: 'boolean', defaultValue: false },
    { key: 'mobileVerified', label: 'موبایل تأییدشده', type: 'boolean', defaultValue: false },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'listings', label: 'آگهی‌ها', type: 'relations' },
    { key: 'activity', label: 'فعالیت', type: 'activity' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'suspend', label: 'تعلیق', icon: 'Ban', permission: 'user.suspend', type: 'confirm', variant: 'destructive', confirmMessage: 'این کاربر معلق شود؟' },
    { key: 'activate', label: 'فعال‌سازی', icon: 'CheckCircle', permission: 'user.update', type: 'confirm', confirmMessage: 'این کاربر فعال شود؟' },
    { key: 'verify-email', label: 'تأیید ایمیل', icon: 'Mail', permission: 'user.update', type: 'confirm', confirmMessage: 'ایمیل این کاربر تأیید شود؟' },
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'user.delete', type: 'confirm', variant: 'destructive', confirmMessage: 'این کاربر حذف شود؟' },
  ],

  bulkActions: [
    { key: 'bulk-suspend', label: 'تعلیق گروهی', icon: 'Ban', permission: 'user.suspend', type: 'confirm', variant: 'destructive', confirmMessage: 'کاربران انتخاب‌شده معلق شوند؟' },
  ],

  audit: {
    enabled: true,
    entityType: 'User',
    actions: ['user.create', 'user.update', 'user.delete', 'user.suspend'],
  },

  relations: [
    { label: 'آگهی‌ها', resource: 'listings', filterField: 'sellerId' },
  ],
};
