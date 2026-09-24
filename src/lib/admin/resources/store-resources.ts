import type { AdminResourceConfig } from '../types';

export const productConfig: AdminResourceConfig = {
  key: 'products',
  titleFa: 'محصولات',
  titleEn: 'Products',
  icon: 'Package',
  model: 'product',
  apiBase: '/api/admin/products',
  adminPath: '/admin/resources/products',

  permissions: {
    read: 'product.read', create: 'product.create',
    update: 'product.update', delete: 'product.delete',
    export: 'product.read',
  },

  columns: [
    { key: 'canonicalName', label: 'نام', type: 'text', sortable: true, filterable: true },
    { key: 'slug', label: 'اسلاگ', type: 'text', sortable: true, visible: false },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'description', label: 'توضیحات', type: 'text', visible: false },
    { key: 'source', label: 'منبع', type: 'badge', filterable: true, visible: false },
    { key: 'confidence', label: 'اطمینان', type: 'number', sortable: true, visible: false },
    { key: 'verifiedAt', label: 'تأییدشده', type: 'date', sortable: true, visible: false },
    { key: 'sortOrder', label: 'ترتیب', type: 'number', sortable: true, visible: false },
    { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' }, { value: 'DRAFT', label: 'پیش‌نویس' },
      { value: 'INACTIVE', label: 'غیرفعال' }, { value: 'ARCHIVED', label: 'بایگانی' },
    ]},
    { key: 'source', label: 'منبع', type: 'select', options: [
      { value: 'MANUAL', label: 'دستی' }, { value: 'AI_SUGGESTED', label: 'AI' },
      { value: 'IMPORTED', label: 'واردشده' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true,
  searchFields: ['canonicalName', 'slug', 'description'],

  fields: [
    { key: 'canonicalName', label: 'نام محصول', type: 'text', required: true },
    { key: 'slug', label: 'اسلاگ', type: 'slug', slugFrom: 'canonicalName', visible: false },
    { key: 'description', label: 'توضیحات', type: 'textarea' },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' }, { value: 'DRAFT', label: 'پیش‌نویس' },
      { value: 'INACTIVE', label: 'غیرفعال' }, { value: 'ARCHIVED', label: 'بایگانی' },
    ]},
    { key: 'source', label: 'منبع', type: 'select', options: [
      { value: 'MANUAL', label: 'دستی' }, { value: 'AI_SUGGESTED', label: 'AI' },
    ]},
    { key: 'sortOrder', label: 'ترتیب نمایش', type: 'number', defaultValue: 0 },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'machines', label: 'ماشین‌آلات', type: 'relations' },
    { key: 'parts', label: 'قطعات', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'verify', label: 'تأیید', icon: 'ShieldCheck', permission: 'product.update', type: 'confirm' },
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'product.delete', type: 'confirm', variant: 'destructive' },
  ],

  bulkActions: [
    { key: 'bulk-delete', label: 'حذف گروهی', icon: 'Trash2', permission: 'product.delete', type: 'confirm', variant: 'destructive' },
  ],

  audit: { enabled: true, entityType: 'Product', actions: ['product.create', 'product.update', 'product.delete'] },
  relations: [
    { label: 'ماشین‌آلات', resource: 'machines', filterField: 'productId' },
    { label: 'قطعات', resource: 'parts', filterField: 'productId' },
  ],
};

export const partConfig: AdminResourceConfig = {
  key: 'parts',
  titleFa: 'قطعات یدکی',
  titleEn: 'Parts',
  icon: 'Wrench',
  model: 'part',
  apiBase: '/api/admin/parts',
  adminPath: '/admin/resources/parts',

  permissions: {
    read: 'product.read', create: 'product.create',
    update: 'product.update', delete: 'product.delete',
  },

  columns: [
    { key: 'partNumber', label: 'شماره قطعه', type: 'text', sortable: true, filterable: true },
    { key: 'oemNumber', label: 'شماره OEM', type: 'text', filterable: true },
    { key: 'condition', label: 'وضعیت', type: 'badge', filterable: true },
    { key: 'status', label: 'فعال', type: 'badge', sortable: true, filterable: true },
    { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', sortable: true },
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['partNumber', 'oemNumber'],

  fields: [
    { key: 'partNumber', label: 'شماره قطعه', type: 'text' },
    { key: 'oemNumber', label: 'شماره OEM', type: 'text' },
    { key: 'condition', label: 'وضعیت', type: 'select', options: [
      { value: 'NEW', label: 'نو' }, { value: 'USED', label: 'کارکرده' },
      { value: 'REFURBISHED', label: 'بازسازی‌شده' },
    ]},
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' }, { value: 'INACTIVE', label: 'غیرفعال' },
    ]},
  ],

  actions: [
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'product.delete', type: 'confirm', variant: 'destructive' },
  ],

  audit: { enabled: true, entityType: 'Part', actions: ['part.update', 'part.delete'] },
};

export const orderConfig: AdminResourceConfig = {
  key: 'orders',
  titleFa: 'سفارش‌ها',
  titleEn: 'Orders',
  icon: 'ShoppingCart',
  model: 'order',
  apiBase: '/api/admin/resources/orders',
  adminPath: '/admin/resources/orders',

  permissions: {
    read: 'order.read', create: 'order.update',
    update: 'order.update', delete: 'order.manage',
    export: 'order.read',
  },

  columns: [
    { key: 'orderNumber', label: 'شماره سفارش', type: 'text', sortable: true, filterable: true },
    { key: 'titleSnapshot', label: 'عنوان', type: 'text', filterable: true },
    { key: 'priceSnapshot', label: 'مبلغ', type: 'currency', sortable: true },
    { key: 'currencySnapshot', label: 'ارز', type: 'badge', visible: false },
    { key: 'quantity', label: 'تعداد', type: 'number', sortable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'commissionRate', label: 'کارمزد %', type: 'number', visible: false },
    { key: 'commissionAmount', label: 'کارمزد', type: 'currency', visible: false },
    { key: 'sellerAmount', label: 'مبلغ فروشنده', type: 'currency', visible: false },
    { key: 'confirmedAt', label: 'تأیید', type: 'date', sortable: true, visible: false },
    { key: 'completedAt', label: 'تکمیل', type: 'date', sortable: true },
    { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'CONFIRMED', label: 'تأییدشده' },
      { value: 'PROCESSING', label: 'در حال پردازش' },
      { value: 'FULFILLED', label: 'ارسال‌شده' },
      { value: 'COMPLETED', label: 'تکمیل‌شده' },
      { value: 'CANCELLED', label: 'لغوشده' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['orderNumber', 'titleSnapshot'],

  fields: [
    { key: 'orderNumber', label: 'شماره سفارش', type: 'text', required: true },
    { key: 'titleSnapshot', label: 'عنوان', type: 'text', required: true },
    { key: 'priceSnapshot', label: 'مبلغ', type: 'currency', required: true },
    { key: 'currencySnapshot', label: 'ارز', type: 'text', defaultValue: 'IRR' },
    { key: 'quantity', label: 'تعداد', type: 'number', defaultValue: 1 },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'CONFIRMED', label: 'تأییدشده' },
      { value: 'PROCESSING', label: 'در حال پردازش' },
      { value: 'COMPLETED', label: 'تکمیل‌شده' },
    ]},
    { key: 'commissionRate', label: 'نرخ کارمزد %', type: 'number' },
    { key: 'notes', label: 'یادداشت', type: 'textarea' },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'payments', label: 'پرداخت‌ها', type: 'relations' },
    { key: 'disputes', label: 'اختلافات', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'confirm', label: 'تأیید', icon: 'CheckCircle', permission: 'order.update', type: 'confirm' },
    { key: 'cancel', label: 'لغو', icon: 'X', permission: 'order.manage', type: 'confirm', variant: 'destructive' },
  ],

  bulkActions: [
    { key: 'bulk-confirm', label: 'تأیید گروهی', icon: 'CheckCircle', permission: 'order.update', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'Order', actions: ['order.update', 'order.manage'] },
  relations: [
    { label: 'پرداخت‌ها', resource: 'payments', filterField: 'orderId' },
  ],
};

export const paymentConfig: AdminResourceConfig = {
  key: 'payments',
  titleFa: 'پرداخت‌ها',
  titleEn: 'Payments',
  icon: 'CreditCard',
  model: 'payment',
  apiBase: '/api/admin/payments',
  adminPath: '/admin/resources/payments',

  permissions: {
    read: 'payment.read', create: 'payment.manage',
    update: 'payment.manage', delete: 'payment.manage',
    export: 'payment.read',
  },

  columns: [
    { key: 'amount', label: 'مبلغ', type: 'currency', sortable: true },
    { key: 'currency', label: 'ارز', type: 'badge' },
    { key: 'type', label: 'نوع', type: 'badge', filterable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'gateway', label: 'درگاه', type: 'badge', filterable: true, visible: false },
    { key: 'trackingCode', label: 'کد پیگیری', type: 'text', visible: false },
    { key: 'providerReference', label: 'مرجع درگاه', type: 'text', visible: false },
    { key: 'paidAt', label: 'پرداخت', type: 'date', sortable: true },
    { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'PAID', label: 'پرداخت‌شده' },
      { value: 'FAILED', label: 'ناموفق' },
      { value: 'REFUNDED', label: 'بازگشت‌داده‌شده' },
    ]},
    { key: 'type', label: 'نوع', type: 'select', options: [
      { value: 'ORDER_PAYMENT', label: 'پرداخت سفارش' },
      { value: 'COMMISSION', label: 'کارمزد' },
      { value: 'SUBSCRIPTION', label: 'اشتراک' },
      { value: 'REFUND', label: 'بازگشت' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['trackingCode', 'providerReference'],

  fields: [
    { key: 'amount', label: 'مبلغ', type: 'currency', required: true },
    { key: 'currency', label: 'ارز', type: 'text', defaultValue: 'IRR' },
    { key: 'type', label: 'نوع', type: 'select', options: [
      { value: 'ORDER_PAYMENT', label: 'پرداخت سفارش' },
      { value: 'COMMISSION', label: 'کارمزد' },
      { value: 'REFUND', label: 'بازگشت' },
    ]},
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'PAID', label: 'پرداخت‌شده' },
      { value: 'FAILED', label: 'ناموفق' },
    ]},
    { key: 'gateway', label: 'درگاه پرداخت', type: 'select', options: [
      { value: 'ZARINPAL', label: 'زرین‌پال' },
      { value: 'PAYIR', label: 'Pay.ir' },
      { value: 'MANUAL', label: 'دستی' },
    ]},
    { key: 'trackingCode', label: 'کد پیگیری', type: 'text' },
    { key: 'idempotencyKey', label: 'کلید Idempotency', type: 'text', visible: false },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'audit', label: 'ممیزی مالی', type: 'audit' },
  ],

  actions: [
    { key: 'refund', label: 'بازگشت وجه', icon: 'RotateCcw', permission: 'payment.refund', type: 'confirm', variant: 'destructive', confirmMessage: 'بازگشت وجه انجام شود؟ این عملیات حساس است.' },
    { key: 'verify', label: 'تأیید پرداخت', icon: 'CheckCircle', permission: 'payment.manage', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'Payment', actions: ['payment.manage', 'payment.refund'] },
};

export const companyConfig: AdminResourceConfig = {
  key: 'companies',
  titleFa: 'شرکت‌ها',
  titleEn: 'Companies',
  icon: 'Building2',
  model: 'company',
  apiBase: '/api/admin/companies',
  adminPath: '/admin/resources/companies',

  permissions: {
    read: 'company.read', create: 'company.create',
    update: 'company.update', delete: 'company.delete',
    export: 'company.read',
  },

  columns: [
    { key: 'name', label: 'نام', type: 'text', sortable: true, filterable: true },
    { key: 'slug', label: 'اسلاگ', type: 'text', visible: false },
    { key: 'verified', label: 'تأییدشده', type: 'boolean', sortable: true, filterable: true },
    { key: 'premium', label: 'ویژه', type: 'boolean', sortable: true, filterable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'city', label: 'شهر', type: 'text', filterable: true },
    { key: 'phone', label: 'تلفن', type: 'text', visible: false },
    { key: 'email', label: 'ایمیل', type: 'text', visible: false },
    { key: 'viewCount', label: 'بازدید', type: 'number', sortable: true, visible: false },
    { key: 'avgRating', label: 'امتیاز', type: 'number', sortable: true, visible: false },
    { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' }, { value: 'INACTIVE', label: 'غیرفعال' },
    ]},
    { key: 'verified', label: 'فقط تأییدشده‌ها', type: 'boolean' },
    { key: 'premium', label: 'فقط ویژه‌ها', type: 'boolean' },
  ],

  defaultSort: { field: 'name', order: 'asc' },
  pageSize: 25, searchable: true, searchFields: ['name', 'slug', 'city', 'phone', 'email'],

  fields: [
    { key: 'name', label: 'نام شرکت', type: 'text', required: true },
    { key: 'slug', label: 'اسلاگ', type: 'slug', slugFrom: 'name', visible: false },
    { key: 'description', label: 'توضیحات', type: 'textarea' },
    { key: 'logoUrl', label: 'لوگو', type: 'media' },
    { key: 'website', label: 'وب‌سایت', type: 'text' },
    { key: 'phone', label: 'تلفن', type: 'text' },
    { key: 'email', label: 'ایمیل', type: 'text' },
    { key: 'address', label: 'آدرس', type: 'textarea' },
    { key: 'city', label: 'شهر', type: 'text' },
    { key: 'province', label: 'استان', type: 'text' },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' }, { value: 'INACTIVE', label: 'غیرفعال' },
    ]},
    { key: 'verified', label: 'تأییدشده', type: 'boolean' },
    { key: 'premium', label: 'ویژه', type: 'boolean' },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'branches', label: 'شعب', type: 'relations' },
    { key: 'verifications', label: 'تأییدیه‌ها', type: 'relations' },
    { key: 'partners', label: 'شرکا', type: 'relations' },
    { key: 'reviews', label: 'نظرات', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'verify', label: 'تأیید شرکت', icon: 'ShieldCheck', permission: 'company.verify', type: 'confirm' },
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'company.delete', type: 'confirm', variant: 'destructive' },
  ],

  bulkActions: [
    { key: 'bulk-verify', label: 'تأیید گروهی', icon: 'ShieldCheck', permission: 'company.verify', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'Company', actions: ['company.update', 'company.verify', 'company.delete'] },
  relations: [
    { label: 'شعب', resource: 'company-branches', filterField: 'companyId' },
    { label: 'تأییدیه‌ها', resource: 'company-verifications', filterField: 'companyId' },
  ],
};

export const machineConfig: AdminResourceConfig = {
  key: 'machines',
  titleFa: 'ماشین‌آلات',
  titleEn: 'Machines',
  icon: 'Truck',
  model: 'machine',
  apiBase: '/api/admin/machines',
  adminPath: '/admin/resources/machines',

  permissions: {
    read: 'product.read', create: 'product.create',
    update: 'product.update', delete: 'product.delete',
  },

  columns: [
    { key: 'serialNumber', label: 'سریال', type: 'text', sortable: true, filterable: true },
    { key: 'manufactureYear', label: 'سال ساخت', type: 'number', sortable: true, filterable: true },
    { key: 'hours', label: 'ساعت کارکرد', type: 'number', sortable: true },
    { key: 'condition', label: 'وضعیت', type: 'badge', filterable: true },
    { key: 'status', label: 'فعال', type: 'badge', sortable: true, filterable: true },
    { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' },
      { value: 'SOLD', label: 'فروخته‌شده' },
      { value: 'ARCHIVED', label: 'بایگانی' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['serialNumber'],

  fields: [
    { key: 'serialNumber', label: 'شماره سریال', type: 'text' },
    { key: 'manufactureYear', label: 'سال ساخت', type: 'number' },
    { key: 'hours', label: 'ساعت کارکرد', type: 'number' },
    { key: 'condition', label: 'وضعیت دستگاه', type: 'select', options: [
      { value: 'NEW', label: 'نو' }, { value: 'EXCELLENT', label: 'عالی' },
      { value: 'GOOD', label: 'خوب' }, { value: 'FAIR', label: 'متوسط' },
    ]},
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' }, { value: 'SOLD', label: 'فروخته' },
    ]},
  ],

  audit: { enabled: true, entityType: 'Machine', actions: ['machine.update'] },
};

export const reviewConfig: AdminResourceConfig = {
  key: 'reviews',
  titleFa: 'نظرات',
  titleEn: 'Reviews',
  icon: 'Star',
  model: 'review',
  apiBase: '/api/admin/resources/reviews',
  adminPath: '/admin/resources/reviews',

  permissions: {
    read: 'review.read', create: 'review.moderate',
    update: 'review.moderate', delete: 'review.moderate',
  },

  columns: [
    { key: 'rating', label: 'امتیاز', type: 'number', sortable: true, filterable: true },
    { key: 'title', label: 'عنوان', type: 'text', filterable: true },
    { key: 'body', label: 'متن', type: 'text', visible: false },
    { key: 'verifiedDeal', label: 'معامله تأییدشده', type: 'boolean', filterable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'sellerResponse', label: 'پاسخ فروشنده', type: 'boolean', visible: false },
    { key: 'createdAt', label: 'تاریخ', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'PUBLISHED', label: 'منتشرشده' },
      { value: 'REJECTED', label: 'ردشده' },
      { value: 'HIDDEN', label: 'مخفی' },
    ]},
    { key: 'verifiedDeal', label: 'فقط معاملات تأییدشده', type: 'boolean' },
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['title', 'body'],

  fields: [
    { key: 'rating', label: 'امتیاز (۱-۵)', type: 'number', required: true },
    { key: 'title', label: 'عنوان', type: 'text' },
    { key: 'body', label: 'متن نظر', type: 'textarea', required: true },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'PUBLISHED', label: 'منتشرشده' },
      { value: 'REJECTED', label: 'ردشده' },
    ]},
    { key: 'verifiedDeal', label: 'معامله تأییدشده', type: 'boolean' },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'publish', label: 'انتشار', icon: 'CheckCircle', permission: 'review.moderate', type: 'confirm' },
    { key: 'reject', label: 'رد', icon: 'X', permission: 'review.moderate', type: 'confirm', variant: 'destructive' },
    { key: 'hide', label: 'مخفی', icon: 'EyeOff', permission: 'review.moderate', type: 'confirm' },
  ],

  bulkActions: [
    { key: 'bulk-publish', label: 'انتشار گروهی', icon: 'CheckCircle', permission: 'review.moderate', type: 'confirm' },
    { key: 'bulk-reject', label: 'رد گروهی', icon: 'X', permission: 'review.moderate', type: 'confirm', variant: 'destructive' },
  ],

  audit: { enabled: true, entityType: 'Review', actions: ['review.moderate'] },
};
