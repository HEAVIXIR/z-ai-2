import type { AdminResourceConfig } from '../types';

export const productConfig: AdminResourceConfig = {
  key: 'products',
  titleFa: 'محصولات',
  titleEn: 'Products',
  icon: 'Package',
  model: 'product',
  database: 'main',  // P4: explicit main-schema ownership (marketplace domain)
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
    { key: 'canonicalName', label: 'نام محصول', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 200, message: 'نام محصول باید بین ۲ تا ۲۰۰ نویسه باشد' } },
    { key: 'slug', label: 'اسلاگ', type: 'slug', slugFrom: 'canonicalName', visible: false,
      validation: { maxLength: 220, message: 'اسلاگ نباید بیش از ۲۲۰ نویسه باشد' } },
    { key: 'description', label: 'توضیحات', type: 'textarea',
      validation: { maxLength: 5000, message: 'توضیحات نباید بیش از ۵,۰۰۰ نویسه باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' }, { value: 'DRAFT', label: 'پیش‌نویس' },
      { value: 'INACTIVE', label: 'غیرفعال' }, { value: 'ARCHIVED', label: 'بایگانی' },
    ],
      permissions: { read: 'product.read', write: 'product.update' } },
    { key: 'source', label: 'منبع', type: 'select', options: [
      { value: 'MANUAL', label: 'دستی' }, { value: 'AI_SUGGESTED', label: 'AI' },
    ]},
    { key: 'sortOrder', label: 'ترتیب نمایش', type: 'number', defaultValue: 0,
      validation: { min: 0, message: 'ترتیب نمایش باید عدد نامنفی باشد' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'machines', label: 'ماشین‌آلات', type: 'relations' },
    { key: 'parts', label: 'قطعات', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'verify', label: 'تأیید', icon: 'ShieldCheck', permission: 'product.update', type: 'confirm', apiPath: '/api/admin/resources/products', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'product.delete', type: 'confirm', variant: 'destructive', apiPath: '/api/admin/resources/products', apiMethod: 'DELETE' },
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
  database: 'main',  // P4: explicit main-schema ownership (marketplace domain)
  apiBase: '/api/admin/parts',
  adminPath: '/admin/resources/parts',

  permissions: {
    read: 'part.read', create: 'part.update',
    update: 'part.update', delete: 'part.delete',
    export: 'part.read',
  },

  columns: [
    { key: 'partNumber', label: 'شماره قطعه', type: 'text', sortable: true, filterable: true },
    { key: 'oemNumber', label: 'شماره OEM', type: 'text', filterable: true },
    { key: 'condition', label: 'وضعیت', type: 'badge', filterable: true },
    { key: 'status', label: 'فعال', type: 'badge', sortable: true, filterable: true },
    { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' },
      { value: 'INACTIVE', label: 'غیرفعال' },
    ]},
    { key: 'condition', label: 'وضعیت قطعه', type: 'select', options: [
      { value: 'NEW', label: 'نو' },
      { value: 'USED', label: 'کارکرده' },
      { value: 'REFURBISHED', label: 'بازسازی‌شده' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['partNumber', 'oemNumber'],

  fields: [
    { key: 'partNumber', label: 'شماره قطعه', type: 'text',
      validation: { maxLength: 100, message: 'شماره قطعه نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'oemNumber', label: 'شماره OEM', type: 'text',
      validation: { maxLength: 100, message: 'شماره OEM نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'condition', label: 'وضعیت', type: 'select', options: [
      { value: 'NEW', label: 'نو' }, { value: 'USED', label: 'کارکرده' },
      { value: 'REFURBISHED', label: 'بازسازی‌شده' },
    ]},
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' }, { value: 'INACTIVE', label: 'غیرفعال' },
    ],
      permissions: { read: 'part.read', write: 'part.update' } },
  ],

  actions: [
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'part.delete', type: 'confirm', variant: 'destructive', apiPath: '/api/admin/resources/parts', apiMethod: 'DELETE' },
    { key: 'activate', label: 'فعال‌سازی', icon: 'CheckCircle', permission: 'part.update', type: 'confirm', apiPath: '/api/admin/resources/parts', apiMethod: 'PATCH' },
  ],

  bulkActions: [
    { key: 'bulk-delete', label: 'حذف گروهی', icon: 'Trash2', permission: 'part.delete', type: 'confirm', variant: 'destructive', confirmMessage: 'قطعات انتخاب‌شده حذف شوند؟' },
    { key: 'bulk-activate', label: 'فعال‌سازی گروهی', icon: 'CheckCircle', permission: 'part.update', type: 'confirm' },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  relations: [
    { label: 'محصول مرتبط', resource: 'products', filterField: 'partId' },
  ],

  audit: { enabled: true, entityType: 'Part', actions: ['part.update', 'part.delete'] },
};

export const orderConfig: AdminResourceConfig = {
  key: 'orders',
  titleFa: 'سفارش‌ها',
  titleEn: 'Orders',
  icon: 'ShoppingCart',
  model: 'order',
  database: 'main',  // P4: explicit main-schema ownership (marketplace domain)
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
    { key: 'titleSnapshot', label: 'عنوان', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 200, message: 'عنوان باید بین ۲ تا ۲۰۰ نویسه باشد' } },
    { key: 'priceSnapshot', label: 'مبلغ', type: 'currency', required: true,
      validation: { min: 0, message: 'مبلغ باید عدد نامنفی باشد' } },
    { key: 'currencySnapshot', label: 'ارز', type: 'text', defaultValue: 'IRR',
      validation: { pattern: '^(IRR|USD|EUR)', message: 'ارز باید یکی از IRR، USD یا EUR باشد' } },
    { key: 'quantity', label: 'تعداد', type: 'number', defaultValue: 1,
      validation: { min: 1, max: 10000, message: 'تعداد باید بین ۱ تا ۱۰,۰۰۰ باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'CONFIRMED', label: 'تأییدشده' },
      { value: 'PROCESSING', label: 'در حال پردازش' },
      { value: 'COMPLETED', label: 'تکمیل‌شده' },
    ]},
    { key: 'commissionRate', label: 'نرخ کارمزد %', type: 'number',
      validation: { min: 0, max: 100, message: 'نرخ کارمزد باید بین ۰ تا ۱۰۰ درصد باشد' },
      permissions: { read: 'order.read', write: 'order.manage' } },
    { key: 'notes', label: 'یادداشت', type: 'textarea',
      validation: { maxLength: 2000, message: 'یادداشت نباید بیش از ۲,۰۰۰ نویسه باشد' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'payments', label: 'پرداخت‌ها', type: 'relations' },
    { key: 'disputes', label: 'اختلافات', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'confirm', label: 'تأیید', icon: 'CheckCircle', permission: 'order.update', type: 'confirm', apiPath: '/api/admin/resources/orders', apiMethod: 'PATCH' },
    { key: 'cancel', label: 'لغو', icon: 'X', permission: 'order.manage', type: 'confirm', variant: 'destructive', apiPath: '/api/admin/resources/orders', apiMethod: 'PATCH' },
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
  database: 'main',  // P4: explicit main-schema ownership (marketplace domain)
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
    // STEP 11.11 (Causal Export Policy): `type` is the FIRST visible AdminColumn
    // in production to declare a field-level `permissions.export`. This makes
    // `permissions.export` CAUSALLY VERIFIABLE at the API level: a user with
    // `payment.read` (not `payment.manage`) sees `type` in List/Detail (READ)
    // but it is ABSENT from CSV/JSON export. Granting `payment.manage`
    // restores it in export. Same dataset, same user, only permission changes
    // → different export result. See ADR-004 §STEP 11.11.
    {
      key: 'type', label: 'نوع', type: 'badge', filterable: true,
      permissions: { export: 'payment.manage' },
    },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'gateway', label: 'درگاه', type: 'badge', filterable: true, visible: false },
    // STEP 11.6 (Phase B.1 + B.2): trackingCode has field-level READ permission
    // on the AdminField surface. STEP 11.11 adds EXPORT permission here on the
    // AdminColumn surface so that the unified permission map enforces BOTH
    // READ (filterReadableFieldsAsync) and EXPORT (filterExportableFieldsAsync)
    // — closing the silent-bypass hole found in the STEP 11.5 audit.
    {
      key: 'trackingCode', label: 'کد پیگیری', type: 'text', visible: false,
      permissions: { export: 'payment.manage' },
    },
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
    { key: 'amount', label: 'مبلغ', type: 'currency', required: true,
      validation: { min: 1000, message: 'مبلغ پرداخت باید حداقل ۱,۰۰۰ ریال باشد' } },
    { key: 'currency', label: 'ارز', type: 'text', defaultValue: 'IRR',
      validation: { pattern: '^(IRR|USD|EUR)$', message: 'ارز باید یکی از IRR، USD یا EUR باشد' } },
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
    { key: 'trackingCode', label: 'کد پیگیری', type: 'text',
      validation: { maxLength: 100, message: 'کد پیگیری نباید بیش از ۱۰۰ نویسه باشد' },
      permissions: { read: 'payment.read', write: 'payment.manage', export: 'payment.manage' } },
    { key: 'idempotencyKey', label: 'کلید Idempotency', type: 'text', visible: false,
      validation: { maxLength: 64, message: 'کلید Idempotency نباید بیش از ۶۴ نویسه باشد' },
      permissions: { read: 'payment.manage', write: 'payment.manage', export: 'payment.manage' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'audit', label: 'ممیزی مالی', type: 'audit' },
  ],

  actions: [
    // STEP 11.6 (Phase C.1) + STEP 11.8 (Audit Transactionality):
    // refund requires status ∈ {PAID, AUTHORIZED} (precondition) AND
    // runs inside `db.$transaction` (transactional: true) so the audit
    // entry commits atomically with the status mutation. This closes the
    // "audit gap" risk for financial mutations (see ADR-003).
    {
      key: 'refund', label: 'بازگشت وجه', icon: 'RotateCcw', permission: 'payment.refund',
      type: 'confirm', variant: 'destructive',
      confirmMessage: 'بازگشت وجه انجام شود؟ این عملیات حساس است.',
      apiPath: '/api/admin/resources/payments', apiMethod: 'PATCH',
      transactional: true,
      precondition: (item) => {
        const status = String(item.status ?? '');
        if (!['PAID', 'AUTHORIZED'].includes(status)) {
          return {
            ok: false,
            message: `بازگشت وجه فقط برای پرداخت‌های پرداخت‌شده/تأییدشده امکان‌پذیر است (فعلی: ${status})`,
          };
        }
        return { ok: true };
      },
    },
    // verify requires status === PENDING (precondition) AND runs in a
    // transaction (transactional: true) — audit is critical for
    // financial trust reconciliation.
    {
      key: 'verify', label: 'تأیید پرداخت', icon: 'CheckCircle', permission: 'payment.manage',
      type: 'confirm', apiPath: '/api/admin/resources/payments', apiMethod: 'PATCH',
      transactional: true,
      precondition: (item) => {
        const status = String(item.status ?? '');
        if (status !== 'PENDING') {
          return {
            ok: false,
            message: `تأیید فقط برای پرداخت‌های در انتظار امکان‌پذیر است (فعلی: ${status})`,
          };
        }
        return { ok: true };
      },
    },
  ],

  bulkActions: [
    { key: 'bulk-verify', label: 'تأیید گروهی', icon: 'CheckCircle', permission: 'payment.manage', type: 'confirm', confirmMessage: 'پرداخت‌های انتخاب‌شده تأیید شوند؟' },
    { key: 'bulk-refund', label: 'بازگشت وجه گروهی', icon: 'RotateCcw', permission: 'payment.refund', type: 'confirm', variant: 'destructive', confirmMessage: 'بازگشت وجه گروهی انجام شود؟ عملیات حساس.' },
  ],

  relations: [
    { label: 'سفارش مرتبط', resource: 'orders', filterField: 'paymentId' },
  ],

  audit: { enabled: true, entityType: 'Payment', actions: ['payment.manage', 'payment.refund'] },
};

export const companyConfig: AdminResourceConfig = {
  key: 'companies',
  titleFa: 'شرکت‌ها',
  titleEn: 'Companies',
  icon: 'Building2',
  model: 'company',
  database: 'main',  // P4: explicit main-schema ownership (marketplace domain)
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
    { key: 'name', label: 'نام شرکت', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 200, message: 'نام شرکت باید بین ۲ تا ۲۰۰ نویسه باشد' } },
    { key: 'slug', label: 'اسلاگ', type: 'slug', slugFrom: 'name', visible: false,
      validation: { maxLength: 220, message: 'اسلاگ نباید بیش از ۲۲۰ نویسه باشد' } },
    { key: 'description', label: 'توضیحات', type: 'textarea',
      validation: { maxLength: 5000, message: 'توضیحات نباید بیش از ۵,۰۰۰ نویسه باشد' } },
    { key: 'logoUrl', label: 'لوگو', type: 'media' },
    { key: 'website', label: 'وب‌سایت', type: 'text',
      validation: { pattern: '^https?://.+', message: 'وب‌سایت باید با http:// یا https:// شروع شود' } },
    { key: 'phone', label: 'تلفن', type: 'text',
      validation: { pattern: '^0\\d{10}$', message: 'تلفن باید ۱۱ رقم و با ۰ شروع شود (مثال: 02112345678)' },
      permissions: { read: 'company.read', write: 'company.update' } },
    { key: 'email', label: 'ایمیل', type: 'text',
      validation: { pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', message: 'فرمت ایمیل نامعتبر است (مثال: info@company.ir)' },
      permissions: { read: 'company.read', write: 'company.update' } },
    { key: 'address', label: 'آدرس', type: 'textarea',
      validation: { maxLength: 500, message: 'آدرس نباید بیش از ۵۰۰ نویسه باشد' },
      permissions: { read: 'company.read', write: 'company.update' } },
    { key: 'city', label: 'شهر', type: 'text',
      validation: { maxLength: 100, message: 'شهر نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'province', label: 'استان', type: 'text',
      validation: { maxLength: 100, message: 'استان نباید بیش از ۱۰۰ نویسه باشد' } },
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
    { key: 'verify', label: 'تأیید شرکت', icon: 'ShieldCheck', permission: 'company.verify', type: 'confirm', apiPath: '/api/admin/resources/companies', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'company.delete', type: 'confirm', variant: 'destructive', apiPath: '/api/admin/resources/companies', apiMethod: 'DELETE' },
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
  database: 'main',  // P4: explicit main-schema ownership (marketplace domain)
  apiBase: '/api/admin/machines',
  adminPath: '/admin/resources/machines',

  permissions: {
    read: 'machine.read', create: 'machine.update',
    update: 'machine.update', delete: 'machine.update',
    export: 'machine.read',
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
    { key: 'condition', label: 'وضعیت دستگاه', type: 'select', options: [
      { value: 'NEW', label: 'نو' },
      { value: 'EXCELLENT', label: 'عالی' },
      { value: 'GOOD', label: 'خوب' },
      { value: 'FAIR', label: 'متوسط' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['serialNumber'],

  fields: [
    { key: 'serialNumber', label: 'شماره سریال', type: 'text',
      validation: { minLength: 3, maxLength: 100, message: 'شماره سریال باید بین ۳ تا ۱۰۰ نویسه باشد' } },
    { key: 'manufactureYear', label: 'سال ساخت', type: 'number',
      validation: { min: 1950, max: 2100, message: 'سال ساخت باید بین ۱۹۵۰ تا ۲۱۰۰ باشد' } },
    { key: 'hours', label: 'ساعت کارکرد', type: 'number',
      validation: { min: 0, max: 100000, message: 'ساعت کارکرد باید بین ۰ تا ۱۰۰,۰۰۰ باشد' } },
    { key: 'condition', label: 'وضعیت دستگاه', type: 'select', options: [
      { value: 'NEW', label: 'نو' }, { value: 'EXCELLENT', label: 'عالی' },
      { value: 'GOOD', label: 'خوب' }, { value: 'FAIR', label: 'متوسط' },
    ]},
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' }, { value: 'SOLD', label: 'فروخته' },
    ],
      permissions: { read: 'machine.read', write: 'machine.update' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'passport', label: 'پاسپورت دستگاه', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  relations: [
    { label: 'پاسپورت دستگاه', resource: 'machine-passports', filterField: 'machineId' },
  ],

  actions: [
    { key: 'activate', label: 'فعال‌سازی', icon: 'CheckCircle', permission: 'machine.update', type: 'confirm', apiPath: '/api/admin/resources/machines', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'machine.update', type: 'confirm', variant: 'destructive', apiPath: '/api/admin/resources/machines', apiMethod: 'DELETE' },
  ],

  bulkActions: [
    { key: 'bulk-activate', label: 'فعال‌سازی گروهی', icon: 'CheckCircle', permission: 'machine.update', type: 'confirm' },
    { key: 'bulk-archive', label: 'بایگانی گروهی', icon: 'Archive', permission: 'machine.update', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'Machine', actions: ['machine.update'] },
};

export const reviewConfig: AdminResourceConfig = {
  key: 'reviews',
  titleFa: 'نظرات',
  titleEn: 'Reviews',
  icon: 'Star',
  model: 'review',
  database: 'main',  // P4: explicit main-schema ownership (marketplace domain)
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
    { key: 'rating', label: 'امتیاز (۱-۵)', type: 'number', required: true,
      validation: { min: 1, max: 5, message: 'امتیاز باید عدد صحیح بین ۱ تا ۵ باشد' } },
    { key: 'title', label: 'عنوان', type: 'text',
      validation: { maxLength: 200, message: 'عنوان نظر نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'body', label: 'متن نظر', type: 'textarea', required: true,
      validation: { minLength: 10, maxLength: 5000, message: 'متن نظر باید بین ۱۰ تا ۵,۰۰۰ نویسه باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'PUBLISHED', label: 'منتشرشده' },
      { value: 'REJECTED', label: 'ردشده' },
    ],
      permissions: { read: 'review.read', write: 'review.moderate' } },
    { key: 'verifiedDeal', label: 'معامله تأییدشده', type: 'boolean',
      permissions: { read: 'review.read', write: 'review.moderate' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'publish', label: 'انتشار', icon: 'CheckCircle', permission: 'review.moderate', type: 'confirm', apiPath: '/api/admin/resources/reviews', apiMethod: 'PATCH' },
    { key: 'reject', label: 'رد', icon: 'X', permission: 'review.moderate', type: 'confirm', variant: 'destructive', apiPath: '/api/admin/resources/reviews', apiMethod: 'PATCH' },
    { key: 'hide', label: 'مخفی', icon: 'EyeOff', permission: 'review.moderate', type: 'confirm', apiPath: '/api/admin/resources/reviews', apiMethod: 'PATCH' },
  ],

  bulkActions: [
    { key: 'bulk-publish', label: 'انتشار گروهی', icon: 'CheckCircle', permission: 'review.moderate', type: 'confirm' },
    { key: 'bulk-reject', label: 'رد گروهی', icon: 'X', permission: 'review.moderate', type: 'confirm', variant: 'destructive' },
  ],

  relations: [
    { label: 'آگهی مرتبط', resource: 'listings', filterField: 'reviewId' },
  ],

  audit: { enabled: true, entityType: 'Review', actions: ['review.moderate'] },
};
