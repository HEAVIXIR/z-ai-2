/**
 * HEAVIX — Phase S1-A: Store Domain Resources
 *
 * Registers 4 Store-schema resources that already have full
 * Model + Service + Admin API + Permission-key chains:
 *   - inventory      (StockMovement ledger)
 *   - warehouses     (Warehouse directory)
 *   - returns        (Return / ReturnItem)
 *   - procurement    (ProcurementRequest tender)
 *
 * Architecture note:
 *   The Universal Resource Engine's data-adapter currently uses only the
 *   main `db` Prisma client. Store-schema models (StockMovement, Warehouse,
 *   Return, ProcurementRequest) live in store-schema.prisma and are accessed
 *   via `storeDb`. To bridge this gap, the resources below declare an
 *   `apiBase` pointing to their existing dedicated routes under
 *   `/api/admin/store/...`. The Universal UI components
 *   (universal-table/form/detail) call `apiBase` directly, so Store
 *   resources work end-to-end through the Universal Resource Engine UI
 *   without requiring the data-adapter to be Store-aware.
 *
 *   The dedicated routes already use `requirePermission(user.id, '<key>')`
 *   (RBAC) — verified for inventory/returns/procurement in their route.ts
 *   handlers. The warehouses route uses getCurrentUser() + requirePermission
 *   (Pattern B). No legacy `isAuthenticated()` is involved here.
 *
 * Constraints honored (per Safety Protocol):
 *   - NO schema changes
 *   - NO new permission keys (uses existing inventory.read/manage,
 *     returns.read/manage, procurement.read/manage; warehouses reuses
 *     inventory.read/manage as semantic fit)
 *   - NO modification to data-adapter.ts (architectural gap is a S5 finding)
 *   - NO modification to AdminResourceConfig type
 *   - NO modification to existing registered resources
 */

import type { AdminResourceConfig } from '../types';

// ── 1. Inventory (StockMovement ledger) ─────────────────────────
export const inventoryConfig: AdminResourceConfig = {
  key: 'inventory',
  titleFa: 'موجودی و حرکات انبار',
  titleEn: 'Inventory (Stock Movements)',
  icon: 'Boxes',
  model: 'stockMovement',
  apiBase: '/api/admin/store/inventory',
  adminPath: '/admin/resources/inventory',

  permissions: {
    read: 'inventory.read',
    create: 'inventory.manage',
    update: 'inventory.manage',
    delete: 'inventory.manage',
    export: 'inventory.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'partId', label: 'قطعه', type: 'relation', sortable: true, filterable: true,
      relation: { model: 'part', labelField: 'canonicalName' } },
    { key: 'type', label: 'نوع حرکت', type: 'badge', sortable: true, filterable: true },
    { key: 'quantity', label: 'تعداد', type: 'number', sortable: true },
    { key: 'balanceAfter', label: 'موجودی پس از حرکت', type: 'number', sortable: true },
    { key: 'warehouseId', label: 'انبار', type: 'relation', filterable: true,
      relation: { model: 'warehouse', labelField: 'name' } },
    { key: 'reference', label: 'مرجع', type: 'text', visible: false },
    { key: 'reason', label: 'علت', type: 'text', visible: false },
    { key: 'createdBy', label: 'ثبت‌کننده', type: 'text', visible: false },
    { key: 'createdAt', label: 'تاریخ', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'type', label: 'نوع حرکت', type: 'select', options: [
      { value: 'RECEIVE', label: 'ورود' },
      { value: 'SALE', label: 'فروش' },
      { value: 'RETURN', label: 'مرجوعی' },
      { value: 'TRANSFER', label: 'انتقال' },
      { value: 'ADJUSTMENT', label: 'تعدیل' },
      { value: 'DAMAGE', label: 'خرابی' },
    ]},
    { key: 'partId', label: 'قطعه', type: 'text', placeholder: 'شناسه قطعه' },
    { key: 'reference', label: 'مرجع', type: 'text', placeholder: 'شناسه سفارش/PO' },
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['reference', 'reason', 'createdBy'],

  fields: [
    { key: 'partId', label: 'قطعه', type: 'relation', required: true,
      relation: { model: 'part', labelField: 'canonicalName' },
      validation: { message: 'انتخاب قطعه الزامی است' } },
    { key: 'type', label: 'نوع حرکت', type: 'select', required: true, options: [
      { value: 'RECEIVE', label: 'ورود' },
      { value: 'SALE', label: 'فروش' },
      { value: 'RETURN', label: 'مرجوعی' },
      { value: 'TRANSFER', label: 'انتقال' },
      { value: 'ADJUSTMENT', label: 'تعدیل' },
      { value: 'DAMAGE', label: 'خرابی' },
    ], validation: { message: 'نوع حرکت الزامی است' } },
    { key: 'quantity', label: 'تعداد', type: 'number', required: true,
      helpText: 'مثبت برای ورود، منفی برای خروج',
      validation: { message: 'تعداد باید عدد صحیح غیرصفر باشد' } },
    { key: 'warehouseId', label: 'انبار', type: 'relation',
      relation: { model: 'warehouse', labelField: 'name' } },
    { key: 'reason', label: 'علت', type: 'textarea',
      validation: { maxLength: 500, message: 'علت نباید بیش از ۵۰۰ نویسه باشد' } },
    { key: 'reference', label: 'مرجع', type: 'text',
      helpText: 'شناسه سفارش یا PO (در صورت وجود)',
      validation: { maxLength: 100, message: 'مرجع نباید بیش از ۱۰۰ نویسه باشد' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'part', label: 'قطعه', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'adjust', label: 'تعدیل موجودی', icon: 'SlidersHorizontal',
      permission: 'inventory.manage', type: 'confirm',
      apiPath: '/api/admin/store/inventory', apiMethod: 'POST' },
  ],

  bulkActions: [
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'inventory.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'StockMovement',
    actions: ['inventory.manage'] },
};

// ── 2. Warehouses (Warehouse directory) ─────────────────────────
export const warehouseConfig: AdminResourceConfig = {
  key: 'warehouses',
  titleFa: 'انبارها',
  titleEn: 'Warehouses',
  icon: 'Warehouse',
  model: 'warehouse',
  apiBase: '/api/admin/store/warehouses',
  adminPath: '/admin/resources/warehouses',

  // Permission: warehouses are sub-domain of inventory. We reuse the
  // inventory.read/manage keys rather than introducing new ones
  // (Catalog Expansion R2 is out-of-scope for S1-A).
  permissions: {
    read: 'inventory.read',
    create: 'inventory.manage',
    update: 'inventory.manage',
    delete: 'inventory.manage',
    export: 'inventory.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'name', label: 'نام', type: 'text', sortable: true, filterable: true },
    { key: 'code', label: 'کد', type: 'text', sortable: true, filterable: true },
    { key: 'address', label: 'نشانی', type: 'text', visible: false },
    { key: 'active', label: 'فعال', type: 'boolean', sortable: true, filterable: true },
    { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', sortable: true },
    { key: 'updatedAt', label: 'به‌روزرسانی', type: 'date', sortable: true, visible: false },
  ],

  filters: [
    { key: 'active', label: 'وضعیت', type: 'select', options: [
      { value: 'true', label: 'فعال' },
      { value: 'false', label: 'غیرفعال' },
    ]},
  ],

  defaultSort: { field: 'name', order: 'asc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['name', 'code', 'address'],

  fields: [
    { key: 'name', label: 'نام انبار', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 100, message: 'نام انبار باید بین ۲ تا ۱۰۰ نویسه باشد' } },
    { key: 'code', label: 'کد انبار', type: 'text', required: true,
      helpText: 'کد یکتای انبار (مثل WH-001)',
      validation: { minLength: 2, maxLength: 30, pattern: '^[A-Z0-9-]+$',
        message: 'کد باید با حروف بزرگ انگلیسی، اعداد و خط‌فاصله باشد' } },
    { key: 'address', label: 'نشانی', type: 'textarea',
      validation: { maxLength: 500, message: 'نشانی نباید بیش از ۵۰۰ نویسه باشد' } },
    { key: 'active', label: 'فعال', type: 'boolean', defaultValue: true },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'inventory', label: 'موجودی‌ها', type: 'relations' },
    { key: 'movements', label: 'حرکات انبار', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'activate', label: 'فعال‌سازی', icon: 'ToggleRight',
      permission: 'inventory.manage', type: 'confirm',
      apiPath: '/api/admin/store/warehouses', apiMethod: 'PATCH' },
    { key: 'deactivate', label: 'غیرفعال‌سازی', icon: 'ToggleLeft',
      permission: 'inventory.manage', type: 'confirm',
      apiPath: '/api/admin/store/warehouses', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2',
      permission: 'inventory.manage', type: 'confirm', variant: 'destructive',
      apiPath: '/api/admin/store/warehouses', apiMethod: 'DELETE' },
  ],

  bulkActions: [
    { key: 'bulk-activate', label: 'فعال‌سازی گروهی', icon: 'ToggleRight',
      permission: 'inventory.manage', type: 'confirm' },
    { key: 'bulk-deactivate', label: 'غیرفعال‌سازی گروهی', icon: 'ToggleLeft',
      permission: 'inventory.manage', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'Warehouse',
    actions: ['inventory.manage'] },

  relations: [
    { label: 'موجودی‌ها', resource: 'inventory', filterField: 'warehouseId' },
  ],
};

// ── 3. Returns (Customer return requests) ────────────────────────
export const returnsConfig: AdminResourceConfig = {
  key: 'returns',
  titleFa: 'مرجوعی‌ها',
  titleEn: 'Returns',
  icon: 'RotateCcw',
  model: 'return',
  apiBase: '/api/admin/store/returns',
  adminPath: '/admin/resources/returns',

  permissions: {
    read: 'returns.read',
    create: 'returns.manage',
    update: 'returns.manage',
    delete: 'returns.manage',
    export: 'returns.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'orderId', label: 'سفارش', type: 'relation', sortable: true, filterable: true,
      relation: { model: 'order', labelField: 'orderNumber' } },
    { key: 'reason', label: 'علت', type: 'text', filterable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'resolution', label: 'نتیجه', type: 'badge', filterable: true, visible: false },
    { key: 'inspection', label: 'بازرسی', type: 'text', visible: false },
    { key: 'createdBy', label: 'ثبت‌کننده', type: 'text', visible: false },
    { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', sortable: true },
    { key: 'updatedAt', label: 'به‌روزرسانی', type: 'date', sortable: true, visible: false },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'REQUESTED', label: 'درخواست‌شده' },
      { value: 'APPROVED', label: 'تأییدشده' },
      { value: 'INSPECTED', label: 'بازرسی‌شده' },
      { value: 'RESOLVED', label: 'حل‌شده' },
      { value: 'REJECTED', label: 'ردشده' },
    ]},
    { key: 'resolution', label: 'نتیجه', type: 'select', options: [
      { value: 'REFUND', label: 'بازپرداخت' },
      { value: 'EXCHANGE', label: 'تعویض' },
      { value: 'REJECT', label: 'رد' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['reason', 'inspection', 'orderId'],

  fields: [
    { key: 'orderId', label: 'سفارش', type: 'relation', required: true,
      relation: { model: 'order', labelField: 'orderNumber' },
      validation: { message: 'انتخاب سفارش الزامی است' } },
    { key: 'reason', label: 'علت مرجوعی', type: 'textarea', required: true,
      validation: { minLength: 5, maxLength: 1000,
        message: 'علت مرجوعی باید بین ۵ تا ۱۰۰۰ نویسه باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'REQUESTED', label: 'درخواست‌شده' },
      { value: 'APPROVED', label: 'تأییدشده' },
      { value: 'INSPECTED', label: 'بازرسی‌شده' },
      { value: 'RESOLVED', label: 'حل‌شده' },
      { value: 'REJECTED', label: 'ردشده' },
    ], permissions: { read: 'returns.read', write: 'returns.manage' } },
    { key: 'resolution', label: 'نتیجه نهایی', type: 'select', options: [
      { value: 'REFUND', label: 'بازپرداخت' },
      { value: 'EXCHANGE', label: 'تعویض' },
      { value: 'REJECT', label: 'رد' },
    ], permissions: { read: 'returns.read', write: 'returns.manage' } },
    { key: 'inspection', label: 'یادداشت بازرسی', type: 'textarea',
      validation: { maxLength: 2000,
        message: 'یادداشت بازرسی نباید بیش از ۲۰۰۰ نویسه باشد' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'items', label: 'اقلام مرجوعی', type: 'relations' },
    { key: 'order', label: 'سفارش', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'approve', label: 'تأیید', icon: 'CheckCircle2',
      permission: 'returns.manage', type: 'confirm',
      apiPath: '/api/admin/store/returns', apiMethod: 'PATCH' },
    { key: 'inspect', label: 'بازرسی', icon: 'Search',
      permission: 'returns.manage', type: 'modal',
      apiPath: '/api/admin/store/returns', apiMethod: 'PATCH' },
    { key: 'resolve', label: 'حل نهایی', icon: 'Check',
      permission: 'returns.manage', type: 'modal',
      apiPath: '/api/admin/store/returns', apiMethod: 'PATCH' },
    { key: 'reject', label: 'رد', icon: 'XCircle',
      permission: 'returns.manage', type: 'confirm', variant: 'destructive',
      apiPath: '/api/admin/store/returns', apiMethod: 'PATCH' },
  ],

  bulkActions: [
    { key: 'bulk-approve', label: 'تأیید گروهی', icon: 'CheckCircle2',
      permission: 'returns.manage', type: 'confirm' },
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'returns.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'Return',
    actions: ['returns.manage'] },
};

// ── 4. Procurement (B2B tender) ──────────────────────────────────
export const procurementConfig: AdminResourceConfig = {
  key: 'procurement',
  titleFa: 'تأمین (خرید B2B)',
  titleEn: 'Procurement',
  icon: 'ShoppingCart',
  model: 'procurementRequest',
  apiBase: '/api/admin/store/procurement',
  adminPath: '/admin/resources/procurement',

  permissions: {
    read: 'procurement.read',
    create: 'procurement.manage',
    update: 'procurement.manage',
    delete: 'procurement.manage',
    export: 'procurement.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'title', label: 'عنوان', type: 'text', sortable: true, filterable: true },
    { key: 'quantity', label: 'تعداد', type: 'number', sortable: true },
    { key: 'budgetMin', label: 'بودجه حداقل', type: 'currency', sortable: true, visible: false },
    { key: 'budgetMax', label: 'بودجه حداکثر', type: 'currency', sortable: true, visible: false },
    { key: 'deadline', label: 'مهلت', type: 'date', sortable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'supplierId', label: 'تأمین‌کننده', type: 'relation', filterable: true,
      relation: { model: 'supplier', labelField: 'name' } },
    { key: 'description', label: 'توضیحات', type: 'text', visible: false },
    { key: 'createdAt', label: 'تاریخ ایجاد', type: 'date', sortable: true },
    { key: 'updatedAt', label: 'به‌روزرسانی', type: 'date', sortable: true, visible: false },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'DRAFT', label: 'پیش‌نویس' },
      { value: 'PUBLISHED', label: 'منتشرشده' },
      { value: 'QUOTING', label: 'در حال استعلام' },
      { value: 'AWARDED', label: 'تأمیدشده' },
      { value: 'COMPLETED', label: 'تکمیل‌شده' },
      { value: 'CANCELLED', label: 'لغوشده' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['title', 'description'],

  fields: [
    { key: 'title', label: 'عنوان درخواست', type: 'text', required: true,
      validation: { minLength: 5, maxLength: 200,
        message: 'عنوان باید بین ۵ تا ۲۰۰ نویسه باشد' } },
    { key: 'description', label: 'توضیحات', type: 'textarea',
      validation: { maxLength: 5000,
        message: 'توضیحات نباید بیش از ۵۰۰۰ نویسه باشد' } },
    { key: 'quantity', label: 'تعداد', type: 'number', required: true,
      validation: { min: 1, message: 'تعداد باید حداقل ۱ باشد' } },
    { key: 'budgetMin', label: 'بودجه حداقل (USD)', type: 'currency',
      validation: { min: 0, message: 'بودجه حداقل باید عدد نامنفی باشد' } },
    { key: 'budgetMax', label: 'بودجه حداکثر (USD)', type: 'currency',
      validation: { min: 0, message: 'بودجه حداکثر باید عدد نامنفی باشد' } },
    { key: 'deadline', label: 'مهلت تحویل', type: 'date' },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'DRAFT', label: 'پیش‌نویس' },
      { value: 'PUBLISHED', label: 'منتشرشده' },
      { value: 'QUOTING', label: 'در حال استعلام' },
      { value: 'AWARDED', label: 'تأمیدشده' },
      { value: 'COMPLETED', label: 'تکمیل‌شده' },
      { value: 'CANCELLED', label: 'لغوشده' },
    ], permissions: { read: 'procurement.read', write: 'procurement.manage' } },
    { key: 'supplierId', label: 'تأمین‌کننده', type: 'relation',
      relation: { model: 'supplier', labelField: 'name' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'purchaseOrders', label: 'سفارشات خرید', type: 'relations' },
    { key: 'supplier', label: 'تأمین‌کننده', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'publish', label: 'انتشار', icon: 'Send',
      permission: 'procurement.manage', type: 'confirm',
      apiPath: '/api/admin/store/procurement', apiMethod: 'PATCH' },
    { key: 'award', label: 'تأمید به', icon: 'Award',
      permission: 'procurement.manage', type: 'modal',
      apiPath: '/api/admin/store/procurement', apiMethod: 'PATCH' },
    { key: 'complete', label: 'تکمیل', icon: 'CheckCircle2',
      permission: 'procurement.manage', type: 'confirm',
      apiPath: '/api/admin/store/procurement', apiMethod: 'PATCH' },
    { key: 'cancel', label: 'لغو', icon: 'XCircle',
      permission: 'procurement.manage', type: 'confirm', variant: 'destructive',
      apiPath: '/api/admin/store/procurement', apiMethod: 'PATCH' },
  ],

  bulkActions: [
    { key: 'bulk-publish', label: 'انتشار گروهی', icon: 'Send',
      permission: 'procurement.manage', type: 'confirm' },
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'procurement.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'ProcurementRequest',
    actions: ['procurement.manage'] },
};
