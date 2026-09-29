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
  database: 'store',  // P1: Store-schema model (storeDb)
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
  database: 'store',  // P1: Store-schema model (storeDb)
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
  database: 'store',  // P1: Store-schema model (storeDb)
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
  database: 'store',  // P1: Store-schema model (storeDb)
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

// ── 5. Customers (Store customer directory — READ-ONLY) ───────
// Note: customers are auto-created via the order flow (Store schema
// Order.customerId backref). The admin route exposes GET only — no
// POST/PATCH/DELETE handlers — so this resource is read-only in the
// Universal UI. Editing happens implicitly via order management.
export const customersConfig: AdminResourceConfig = {
  key: 'customers',
  titleFa: 'مشتریان فروشگاه',
  titleEn: 'Store Customers',
  icon: 'Users',
  model: 'customer',
  database: 'store',  // P1: Store-schema model (storeDb)
  apiBase: '/api/admin/store/customers',
  adminPath: '/admin/resources/customers',

  // READ-ONLY: only read + export. No create/update/delete — the
  // /api/admin/store/customers/route.ts only exposes GET.
  permissions: {
    read: 'store.read',
    export: 'store.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'phone', label: 'تلفن', type: 'text', sortable: true, filterable: true },
    { key: 'name', label: 'نام', type: 'text', sortable: true, filterable: true },
    { key: 'family', label: 'نام خانوادگی', type: 'text', sortable: true, filterable: true },
    { key: 'nationalCode', label: 'کد ملی', type: 'text', visible: false },
    { key: 'address', label: 'نشانی', type: 'text', visible: false },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'totalOrders', label: 'تعداد سفارش', type: 'number', sortable: true },
    { key: 'totalSpentIrr', label: 'مجموع خرید (ریال)', type: 'currency', sortable: true },
    { key: 'walletBalanceIrr', label: 'موجودی کیف پول (ریال)', type: 'currency' },
    { key: 'notes', label: 'یادداشت', type: 'text', visible: false },
    { key: 'createdAt', label: 'تاریخ ثبت', type: 'date', sortable: true },
    { key: 'updatedAt', label: 'به‌روزرسانی', type: 'date', sortable: true, visible: false },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' },
      { value: 'BLOCKED', label: 'مسدود' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['phone', 'name', 'family', 'nationalCode'],

  // Fields are listed for the detail view (read-only display).
  // No write paths because the API has no POST/PATCH/DELETE.
  fields: [
    { key: 'phone', label: 'تلفن', type: 'text', required: true,
      validation: { minLength: 10, maxLength: 15,
        message: 'تلفن باید بین ۱۰ تا ۱۵ رقم باشد' } },
    { key: 'name', label: 'نام', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 50,
        message: 'نام باید بین ۲ تا ۵۰ نویسه باشد' } },
    { key: 'family', label: 'نام خانوادگی', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 50,
        message: 'نام خانوادگی باید بین ۲ تا ۵۰ نویسه باشد' } },
    { key: 'nationalCode', label: 'کد ملی', type: 'text',
      validation: { minLength: 10, maxLength: 10,
        message: 'کد ملی باید ۱۰ رقم باشد' } },
    { key: 'address', label: 'نشانی', type: 'textarea',
      validation: { maxLength: 500,
        message: 'نشانی نباید بیش از ۵۰۰ نویسه باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' },
      { value: 'BLOCKED', label: 'مسدود' },
    ], permissions: { read: 'store.read' } },
    { key: 'notes', label: 'یادداشت مدیریت', type: 'textarea',
      validation: { maxLength: 2000,
        message: 'یادداشت نباید بیش از ۲۰۰۰ نویسه باشد' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'orders', label: 'سفارش‌ها', type: 'relations' },
    { key: 'payments', label: 'پرداخت‌ها', type: 'relations' },
    { key: 'wallet', label: 'تراکنش‌های کیف پول', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  // No create/update/delete actions — API has no POST/PATCH/DELETE handlers.
  // Only bulk-export is exposed (read-only operations).
  bulkActions: [
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'store.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'Customer',
    actions: ['store.manage'] },
};

// ── 6. Mechanics (Store mechanic directory — FULL CRUD) ───────
export const mechanicsConfig: AdminResourceConfig = {
  key: 'mechanics',
  titleFa: 'مکانیک‌ها',
  titleEn: 'Mechanics',
  icon: 'Wrench',
  model: 'mechanic',
  database: 'store',  // P1: Store-schema model (storeDb)
  apiBase: '/api/admin/store/mechanics',
  adminPath: '/admin/resources/mechanics',

  permissions: {
    read: 'store.read',
    create: 'store.manage',
    update: 'store.manage',
    delete: 'store.manage',
    export: 'store.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'phone', label: 'تلفن', type: 'text', sortable: true, filterable: true },
    { key: 'name', label: 'نام', type: 'text', sortable: true, filterable: true },
    { key: 'family', label: 'نام خانوادگی', type: 'text', sortable: true, filterable: true },
    { key: 'shopName', label: 'نام مغازه', type: 'text', filterable: true },
    { key: 'specialty', label: 'تخصص', type: 'text', filterable: true },
    { key: 'city', label: 'شهر', type: 'text', filterable: true },
    { key: 'rating', label: 'امتیاز', type: 'number', sortable: true },
    { key: 'verified', label: 'تأییدشده', type: 'boolean', sortable: true, filterable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'totalOrders', label: 'تعداد سفارش', type: 'number', sortable: true },
    { key: 'createdAt', label: 'تاریخ ثبت', type: 'date', sortable: true },
    { key: 'updatedAt', label: 'به‌روزرسانی', type: 'date', sortable: true, visible: false },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' },
      { value: 'INACTIVE', label: 'غیرفعال' },
    ]},
    { key: 'verified', label: 'تأیید', type: 'select', options: [
      { value: 'true', label: 'تأییدشده' },
      { value: 'false', label: 'تأییدنشده' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['phone', 'name', 'family', 'shopName', 'specialty', 'city'],

  fields: [
    { key: 'phone', label: 'تلفن', type: 'text', required: true,
      validation: { minLength: 10, maxLength: 15,
        message: 'تلفن باید بین ۱۰ تا ۱۵ رقم باشد' } },
    { key: 'name', label: 'نام', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 50,
        message: 'نام باید بین ۲ تا ۵۰ نویسه باشد' } },
    { key: 'family', label: 'نام خانوادگی', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 50,
        message: 'نام خانوادگی باید بین ۲ تا ۵۰ نویسه باشد' } },
    { key: 'shopName', label: 'نام مغازه', type: 'text',
      validation: { maxLength: 200,
        message: 'نام مغازه نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'specialty', label: 'تخصص', type: 'text',
      validation: { maxLength: 200,
        message: 'تخصص نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'city', label: 'شهر', type: 'text',
      validation: { maxLength: 100,
        message: 'نام شهر نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'address', label: 'نشانی', type: 'textarea',
      validation: { maxLength: 500,
        message: 'نشانی نباید بیش از ۵۰۰ نویسه باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' },
      { value: 'INACTIVE', label: 'غیرفعال' },
    ], permissions: { read: 'store.read', write: 'store.manage' } },
    { key: 'verified', label: 'تأییدشده', type: 'boolean', defaultValue: false,
      permissions: { read: 'store.read', write: 'store.manage' } },
    { key: 'notes', label: 'یادداشت مدیریت', type: 'textarea',
      validation: { maxLength: 2000,
        message: 'یادداشت نباید بیش از ۲۰۰۰ نویسه باشد' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'orders', label: 'سفارش‌ها', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'verify', label: 'تأیید مکانیک', icon: 'BadgeCheck',
      permission: 'store.manage', type: 'confirm',
      apiPath: '/api/admin/store/mechanics', apiMethod: 'PATCH' },
    { key: 'edit', label: 'ویرایش', icon: 'Pencil',
      permission: 'store.manage', type: 'modal',
      apiPath: '/api/admin/store/mechanics', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2',
      permission: 'store.manage', type: 'confirm', variant: 'destructive',
      apiPath: '/api/admin/store/mechanics', apiMethod: 'DELETE' },
  ],

  bulkActions: [
    { key: 'bulk-verify', label: 'تأیید گروهی', icon: 'BadgeCheck',
      permission: 'store.manage', type: 'confirm' },
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'store.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'Mechanic',
    actions: ['store.manage'] },
};

// ── 7. Suppliers (B2B supplier directory — FULL CRUD) ────────
export const suppliersConfig: AdminResourceConfig = {
  key: 'suppliers',
  titleFa: 'تأمین‌کنندگان',
  titleEn: 'Suppliers',
  icon: 'Truck',
  model: 'supplier',
  database: 'store',  // P1: Store-schema model (storeDb)
  apiBase: '/api/admin/store/suppliers',
  adminPath: '/admin/resources/suppliers',

  permissions: {
    read: 'store.read',
    create: 'store.manage',
    update: 'store.manage',
    delete: 'store.manage',
    export: 'store.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'name', label: 'نام', type: 'text', sortable: true, filterable: true },
    { key: 'nameFa', label: 'نام فارسی', type: 'text', sortable: true, filterable: true },
    { key: 'phone', label: 'تلفن', type: 'text', filterable: true },
    { key: 'email', label: 'ایمیل', type: 'text', filterable: true, visible: false },
    { key: 'address', label: 'نشانی', type: 'text', visible: false },
    { key: 'active', label: 'فعال', type: 'boolean', sortable: true, filterable: true },
    { key: 'createdAt', label: 'تاریخ ثبت', type: 'date', sortable: true },
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
  searchFields: ['name', 'nameFa', 'phone', 'email', 'address'],

  fields: [
    { key: 'name', label: 'نام', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 200,
        message: 'نام باید بین ۲ تا ۲۰۰ نویسه باشد' } },
    { key: 'nameFa', label: 'نام فارسی', type: 'text',
      validation: { maxLength: 200,
        message: 'نام فارسی نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'phone', label: 'تلفن', type: 'text',
      validation: { maxLength: 20,
        message: 'تلفن نباید بیش از ۲۰ نویسه باشد' } },
    { key: 'email', label: 'ایمیل', type: 'text',
      validation: { maxLength: 100, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        message: 'فرمت ایمیل نامعتبر است' } },
    { key: 'address', label: 'نشانی', type: 'textarea',
      validation: { maxLength: 500,
        message: 'نشانی نباید بیش از ۵۰۰ نویسه باشد' } },
    { key: 'active', label: 'فعال', type: 'boolean', defaultValue: true,
      permissions: { read: 'store.read', write: 'store.manage' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'procurements', label: 'درخواست‌های تأمین', type: 'relations' },
    { key: 'purchaseOrders', label: 'سفارشات خرید', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'activate', label: 'فعال‌سازی', icon: 'ToggleRight',
      permission: 'store.manage', type: 'confirm',
      apiPath: '/api/admin/store/suppliers', apiMethod: 'PATCH' },
    { key: 'deactivate', label: 'غیرفعال‌سازی', icon: 'ToggleLeft',
      permission: 'store.manage', type: 'confirm',
      apiPath: '/api/admin/store/suppliers', apiMethod: 'PATCH' },
    { key: 'edit', label: 'ویرایش', icon: 'Pencil',
      permission: 'store.manage', type: 'modal',
      apiPath: '/api/admin/store/suppliers', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2',
      permission: 'store.manage', type: 'confirm', variant: 'destructive',
      apiPath: '/api/admin/store/suppliers', apiMethod: 'DELETE' },
  ],

  bulkActions: [
    { key: 'bulk-activate', label: 'فعال‌سازی گروهی', icon: 'ToggleRight',
      permission: 'store.manage', type: 'confirm' },
    { key: 'bulk-deactivate', label: 'غیرفعال‌سازی گروهی', icon: 'ToggleLeft',
      permission: 'store.manage', type: 'confirm' },
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'store.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'Supplier',
    actions: ['store.manage'] },

  relations: [
    { label: 'درخواست‌های تأمین', resource: 'procurement', filterField: 'supplierId' },
  ],
};

// ── 8. Car Models (Vehicle selector for parts compatibility) ────
// Used by the parts catalog to filter compatible vehicles. The admin
// route at /api/admin/store/car-models exposes full CRUD (GET list +
// POST create + PATCH [id] + DELETE [id]).
export const carModelsConfig: AdminResourceConfig = {
  key: 'car-models',
  titleFa: 'مدل‌های خودرو',
  titleEn: 'Car Models',
  icon: 'Car',
  model: 'carModel',
  database: 'store',  // P1: Store-schema model (storeDb)
  apiBase: '/api/admin/store/car-models',
  adminPath: '/admin/resources/car-models',

  permissions: {
    read: 'store.read',
    create: 'store.manage',
    update: 'store.manage',
    delete: 'store.manage',
    export: 'store.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'brand', label: 'برند', type: 'text', sortable: true, filterable: true },
    { key: 'model', label: 'مدل', type: 'text', sortable: true, filterable: true },
    { key: 'yearFrom', label: 'سال شروع', type: 'number', sortable: true },
    { key: 'yearTo', label: 'سال پایان', type: 'number', sortable: true },
    { key: 'type', label: 'نوع', type: 'badge', sortable: true, filterable: true },
    { key: 'createdAt', label: 'تاریخ ثبت', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'type', label: 'نوع', type: 'select', options: [
      { value: 'PASSENGER', label: 'سواری' },
      { value: 'HEAVY', label: 'ماشین‌آلات سنگین' },
    ]},
    { key: 'brand', label: 'برند', type: 'text', placeholder: 'مثلاً Toyota' },
  ],

  defaultSort: { field: 'brand', order: 'asc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['brand', 'model'],

  fields: [
    { key: 'brand', label: 'برند', type: 'text', required: true,
      helpText: 'Toyota, Hyundai, Peugeot, Volvo, Scania...',
      validation: { minLength: 2, maxLength: 100,
        message: 'برند باید بین ۲ تا ۱۰۰ نویسه باشد' } },
    { key: 'model', label: 'مدل', type: 'text', required: true,
      helpText: 'Corolla, Elantra, FH16...',
      validation: { minLength: 1, maxLength: 100,
        message: 'مدل باید بین ۱ تا ۱۰۰ نویسه باشد' } },
    { key: 'yearFrom', label: 'سال شروع تولید', type: 'number', required: true,
      validation: { min: 1900, max: 2100,
        message: 'سال شروع باید بین ۱۹۰۰ تا ۲۱۰۰ باشد' } },
    { key: 'yearTo', label: 'سال پایان تولید', type: 'number', required: true,
      helpText: 'اگر هنوز تولید می‌شود، سال جاری را وارد کنید',
      validation: { min: 1900, max: 2100,
        message: 'سال پایان باید بین ۱۹۰۰ تا ۲۱۰۰ باشد' } },
    { key: 'type', label: 'نوع خودرو', type: 'select', required: true, options: [
      { value: 'PASSENGER', label: 'سواری' },
      { value: 'HEAVY', label: 'ماشین‌آلات سنگین' },
    ], permissions: { read: 'store.read', write: 'store.manage' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'parts', label: 'قطعات سازگار', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'edit', label: 'ویرایش', icon: 'Pencil',
      permission: 'store.manage', type: 'modal',
      apiPath: '/api/admin/store/car-models', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2',
      permission: 'store.manage', type: 'confirm', variant: 'destructive',
      apiPath: '/api/admin/store/car-models', apiMethod: 'DELETE' },
  ],

  bulkActions: [
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'store.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'CarModel',
    actions: ['store.manage'] },

  relations: [
    { label: 'قطعات سازگار', resource: 'parts', filterField: 'carModelId' },
  ],
};

// ── 9. Currency (USD→IRR rate history — APPEND-ONLY) ───────────
// CurrencyRate is an append-only ledger: one row per date (unique
// constraint on `date`). The admin route exposes GET (list) + POST
// (create new date rate) only — no PATCH/DELETE because rate history
// is immutable. CurrencySetting (singleton row) holds the auto-fetch
// config but is managed through a separate config endpoint, not the
// universal resource CRUD.
export const currencyConfig: AdminResourceConfig = {
  key: 'currency',
  titleFa: 'نرخ ارز (USD→ریال)',
  titleEn: 'Currency Rates',
  icon: 'DollarSign',
  model: 'currencyRate',
  database: 'store',  // P1: Store-schema model (storeDb)
  apiBase: '/api/admin/store/currency',
  adminPath: '/admin/resources/currency',

  // APPEND-ONLY: read + create only. No update/delete — rate history
  // is immutable (one row per date via @unique on `date`).
  permissions: {
    read: 'store.read',
    create: 'store.manage',
    export: 'store.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'date', label: 'تاریخ', type: 'text', sortable: true, filterable: true },
    { key: 'rate', label: 'نرخ (ریال)', type: 'currency', sortable: true },
    { key: 'marginPercent', label: 'حاشیه (%)', type: 'number', sortable: true },
    { key: 'source', label: 'منبع', type: 'badge', sortable: true, filterable: true },
    { key: 'note', label: 'یادداشت', type: 'text', visible: false },
    { key: 'setById', label: 'تنظیم‌کننده', type: 'relation',
      relation: { model: 'adminUser', labelField: 'name' } },
    { key: 'createdAt', label: 'تاریخ ثبت', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'source', label: 'منبع', type: 'select', options: [
      { value: 'MANUAL', label: 'دستی' },
      { value: 'TELEGRAM', label: 'تلگرام (خودکار)' },
    ]},
  ],

  defaultSort: { field: 'date', order: 'desc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['date', 'note'],

  fields: [
    { key: 'date', label: 'تاریخ', type: 'text', required: true,
      helpText: 'فرمت YYYY-MM-DD (مثلاً 2026-09-28)',
      validation: { pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        message: 'فرمت تاریخ باید YYYY-MM-DD باشد' } },
    { key: 'rate', label: 'نرخ (ریال)', type: 'currency', required: true,
      helpText: 'نرخ USD→IRR خام (قبل از حاشیه)',
      validation: { min: 0, message: 'نرخ باید عدد نامنفی باشد' } },
    { key: 'marginPercent', label: 'حاشیه سود (%)', type: 'number', defaultValue: 0,
      validation: { min: 0, max: 100,
        message: 'حاشیه باید بین ۰ تا ۱۰۰ باشد' } },
    { key: 'source', label: 'منبع', type: 'select', defaultValue: 'MANUAL', options: [
      { value: 'MANUAL', label: 'دستی' },
      { value: 'TELEGRAM', label: 'تلگرام (خودکار)' },
    ], permissions: { read: 'store.read', write: 'store.manage' } },
    { key: 'note', label: 'یادداشت', type: 'textarea',
      validation: { maxLength: 500,
        message: 'یادداشت نباید بیش از ۵۰۰ نویسه باشد' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'setBy', label: 'تنظیم‌کننده', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  // APPEND-ONLY: only create action (no edit/delete — history is immutable).
  actions: [
    { key: 'add-rate', label: 'افزودن نرخ جدید', icon: 'Plus',
      permission: 'store.manage', type: 'modal',
      apiPath: '/api/admin/store/currency', apiMethod: 'POST' },
  ],

  bulkActions: [
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'store.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'CurrencyRate',
    actions: ['store.manage'] },
};

// ── 10. Services (ServiceProvider directory + service requests) ─
// The Store "services" domain has two related models:
//   - ServiceProvider (the company/technician offering the service)
//   - ServiceRequest (customer-initiated request for a service)
// This resource config focuses on ServiceProvider as the primary
// entity (admin manages providers). ServiceRequest is exposed as a
// detail-tab relation (a provider's incoming requests). The admin
// route at /api/admin/store/services/providers exposes full CRUD on
// ServiceProvider; /api/admin/store/services/requests exposes the
// request flow separately (managed via custom UI, not universal CRUD
// for now — could be split into its own resource in a future phase).
export const servicesConfig: AdminResourceConfig = {
  key: 'services',
  titleFa: 'خدمات (ارائه‌دهندگان)',
  titleEn: 'Service Providers',
  icon: 'Wrench',
  model: 'serviceProvider',
  database: 'store',  // P1: Store-schema model (storeDb)
  apiBase: '/api/admin/store/services/providers',
  adminPath: '/admin/resources/services',

  permissions: {
    read: 'store.read',
    create: 'store.manage',
    update: 'store.manage',
    delete: 'store.manage',
    export: 'store.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'name', label: 'نام', type: 'text', sortable: true, filterable: true },
    { key: 'nameFa', label: 'نام فارسی', type: 'text', sortable: true, filterable: true },
    { key: 'type', label: 'نوع خدمت', type: 'badge', sortable: true, filterable: true },
    { key: 'phone', label: 'تلفن', type: 'text', filterable: true },
    { key: 'email', label: 'ایمیل', type: 'text', visible: false },
    { key: 'address', label: 'نشانی', type: 'text', visible: false },
    { key: 'active', label: 'فعال', type: 'boolean', sortable: true, filterable: true },
    { key: 'verified', label: 'تأییدشده', type: 'boolean', sortable: true, filterable: true },
    { key: 'rating', label: 'امتیاز', type: 'number', sortable: true },
    { key: 'createdAt', label: 'تاریخ ثبت', type: 'date', sortable: true },
    { key: 'updatedAt', label: 'به‌روزرسانی', type: 'date', sortable: true, visible: false },
  ],

  filters: [
    { key: 'type', label: 'نوع خدمت', type: 'select', options: [
      { value: 'TRANSPORT', label: 'حمل‌ونقل' },
      { value: 'INSPECTION', label: 'بازرسی' },
      { value: 'MAINTENANCE', label: 'نگهداری' },
      { value: 'REPAIR', label: 'تعمیر' },
      { value: 'INSTALLATION', label: 'نصب' },
      { value: 'DELIVERY', label: 'تحویل' },
    ]},
    { key: 'active', label: 'وضعیت', type: 'select', options: [
      { value: 'true', label: 'فعال' },
      { value: 'false', label: 'غیرفعال' },
    ]},
    { key: 'verified', label: 'تأیید', type: 'select', options: [
      { value: 'true', label: 'تأییدشده' },
      { value: 'false', label: 'تأییدنشده' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['name', 'nameFa', 'phone', 'email', 'address'],

  fields: [
    { key: 'name', label: 'نام', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 200,
        message: 'نام باید بین ۲ تا ۲۰۰ نویسه باشد' } },
    { key: 'nameFa', label: 'نام فارسی', type: 'text',
      validation: { maxLength: 200,
        message: 'نام فارسی نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'type', label: 'نوع خدمت', type: 'select', required: true, options: [
      { value: 'TRANSPORT', label: 'حمل‌ونقل' },
      { value: 'INSPECTION', label: 'بازرسی' },
      { value: 'MAINTENANCE', label: 'نگهداری' },
      { value: 'REPAIR', label: 'تعمیر' },
      { value: 'INSTALLATION', label: 'نصب' },
      { value: 'DELIVERY', label: 'تحویل' },
    ], permissions: { read: 'store.read', write: 'store.manage' } },
    { key: 'phone', label: 'تلفن', type: 'text',
      validation: { maxLength: 20,
        message: 'تلفن نباید بیش از ۲۰ نویسه باشد' } },
    { key: 'email', label: 'ایمیل', type: 'text',
      validation: { maxLength: 100, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        message: 'فرمت ایمیل نامعتبر است' } },
    { key: 'address', label: 'نشانی', type: 'textarea',
      validation: { maxLength: 500,
        message: 'نشانی نباید بیش از ۵۰۰ نویسه باشد' } },
    { key: 'active', label: 'فعال', type: 'boolean', defaultValue: true,
      permissions: { read: 'store.read', write: 'store.manage' } },
    { key: 'verified', label: 'تأییدشده', type: 'boolean', defaultValue: false,
      permissions: { read: 'store.read', write: 'store.manage' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'serviceRequests', label: 'درخواست‌های خدمت', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'verify', label: 'تأیید ارائه‌دهنده', icon: 'BadgeCheck',
      permission: 'store.manage', type: 'confirm',
      apiPath: '/api/admin/store/services/providers', apiMethod: 'PATCH' },
    { key: 'activate', label: 'فعال‌سازی', icon: 'ToggleRight',
      permission: 'store.manage', type: 'confirm',
      apiPath: '/api/admin/store/services/providers', apiMethod: 'PATCH' },
    { key: 'deactivate', label: 'غیرفعال‌سازی', icon: 'ToggleLeft',
      permission: 'store.manage', type: 'confirm',
      apiPath: '/api/admin/store/services/providers', apiMethod: 'PATCH' },
    { key: 'edit', label: 'ویرایش', icon: 'Pencil',
      permission: 'store.manage', type: 'modal',
      apiPath: '/api/admin/store/services/providers', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2',
      permission: 'store.manage', type: 'confirm', variant: 'destructive',
      apiPath: '/api/admin/store/services/providers', apiMethod: 'DELETE' },
  ],

  bulkActions: [
    { key: 'bulk-verify', label: 'تأیید گروهی', icon: 'BadgeCheck',
      permission: 'store.manage', type: 'confirm' },
    { key: 'bulk-activate', label: 'فعال‌سازی گروهی', icon: 'ToggleRight',
      permission: 'store.manage', type: 'confirm' },
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'store.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'ServiceProvider',
    actions: ['store.manage'] },
};

// ── 11. Store Categories (Auto-parts catalog taxonomy) ─────────
// Keyed as `store-categories` (NOT `categories`) to preserve domain
// separation from the marketplace Category resource. The marketplace
// has its own Category model in the main schema; the Store has its
// own self-referential Category tree in store-schema.prisma. Both
// use the existing `store.read`/`store.manage` permission keys.
export const storeCategoriesConfig: AdminResourceConfig = {
  key: 'store-categories',
  titleFa: 'دسته‌بندی‌های فروشگاه',
  titleEn: 'Store Categories',
  icon: 'FolderTree',
  model: 'category',
  database: 'store',  // P1: Store-schema model (storeDb)
  apiBase: '/api/admin/store/categories',
  adminPath: '/admin/resources/store-categories',

  permissions: {
    read: 'store.read',
    create: 'store.manage',
    update: 'store.manage',
    delete: 'store.manage',
    export: 'store.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'name', label: 'نام', type: 'text', sortable: true, filterable: true },
    { key: 'nameFa', label: 'نام فارسی', type: 'text', sortable: true, filterable: true },
    { key: 'slug', label: 'اسلاگ', type: 'text', sortable: true, filterable: true },
    { key: 'icon', label: 'آیکون', type: 'text', visible: false },
    { key: 'description', label: 'توضیحات', type: 'text', visible: false },
    { key: 'parentId', label: 'والد', type: 'relation',
      relation: { model: 'category', labelField: 'name' } },
    { key: 'createdAt', label: 'تاریخ ثبت', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'parentId', label: 'دسته والد', type: 'text', placeholder: 'شناسه والد (خالی = ریشه)' },
  ],

  defaultSort: { field: 'name', order: 'asc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['name', 'nameFa', 'slug', 'description'],

  fields: [
    { key: 'name', label: 'نام (انگلیسی)', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 100,
        message: 'نام باید بین ۲ تا ۱۰۰ نویسه باشد' } },
    { key: 'nameFa', label: 'نام فارسی', type: 'text',
      validation: { maxLength: 100,
        message: 'نام فارسی نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'slug', label: 'اسلاگ', type: 'slug', slugFrom: 'name', required: true,
      validation: { maxLength: 120, pattern: '^[a-z0-9-]+$',
        message: 'اسلاگ باید با حروف کوچک انگلیسی، اعداد و خط‌فاصله باشد' } },
    { key: 'icon', label: 'آیکون', type: 'text',
      helpText: 'نام آیکون از lucide-react (اختیاری)',
      validation: { maxLength: 100,
        message: 'نام آیکون نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'description', label: 'توضیحات', type: 'textarea',
      validation: { maxLength: 2000,
        message: 'توضیحات نباید بیش از ۲۰۰۰ نویسه باشد' } },
    { key: 'parentId', label: 'دسته والد', type: 'relation',
      relation: { model: 'category', labelField: 'name' },
      helpText: 'خالی = دسته ریشه (top-level)' },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'children', label: 'زیردسته‌ها', type: 'relations' },
    { key: 'parts', label: 'قطعات', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'edit', label: 'ویرایش', icon: 'Pencil',
      permission: 'store.manage', type: 'modal',
      apiPath: '/api/admin/store/categories', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2',
      permission: 'store.manage', type: 'confirm', variant: 'destructive',
      apiPath: '/api/admin/store/categories', apiMethod: 'DELETE' },
  ],

  bulkActions: [
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'store.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'Category',
    actions: ['store.manage'] },

  relations: [
    { label: 'زیردسته‌ها', resource: 'store-categories', filterField: 'parentId' },
  ],
};

// ── 12. Store Brands (Auto-parts brand directory) ───────────────
// Keyed as `store-brands` (NOT `brands`) to avoid collision with the
// marketplace `brands` resource (registered in brand.ts with
// brand.read/create/update/delete/publish). Store Brand is a separate
// model in store-schema.prisma, accessed via /api/admin/store/brands.
// Both the marketplace and Store use distinct permission keys.
export const storeBrandsConfig: AdminResourceConfig = {
  key: 'store-brands',
  titleFa: 'برندهای فروشگاه',
  titleEn: 'Store Brands',
  icon: 'Tag',
  model: 'brand',
  database: 'store',  // P1: Store-schema model (storeDb)
  apiBase: '/api/admin/store/brands',
  adminPath: '/admin/resources/store-brands',

  permissions: {
    read: 'store.read',
    create: 'store.manage',
    update: 'store.manage',
    delete: 'store.manage',
    export: 'store.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'name', label: 'نام', type: 'text', sortable: true, filterable: true },
    { key: 'nameFa', label: 'نام فارسی', type: 'text', sortable: true, filterable: true },
    { key: 'slug', label: 'اسلاگ', type: 'text', sortable: true, filterable: true },
    { key: 'logoUrl', label: 'لوگو', type: 'image', visible: false },
    { key: 'country', label: 'کشور', type: 'text', filterable: true },
    { key: 'active', label: 'فعال', type: 'boolean', sortable: true, filterable: true },
    { key: 'createdAt', label: 'تاریخ ثبت', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'active', label: 'وضعیت', type: 'select', options: [
      { value: 'true', label: 'فعال' },
      { value: 'false', label: 'غیرفعال' },
    ]},
    { key: 'country', label: 'کشور', type: 'text', placeholder: 'مثلاً Japan' },
  ],

  defaultSort: { field: 'name', order: 'asc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['name', 'nameFa', 'slug', 'country'],

  fields: [
    { key: 'name', label: 'نام (انگلیسی)', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 100,
        message: 'نام باید بین ۲ تا ۱۰۰ نویسه باشد' } },
    { key: 'nameFa', label: 'نام فارسی', type: 'text',
      validation: { maxLength: 100,
        message: 'نام فارسی نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'slug', label: 'اسلاگ', type: 'slug', slugFrom: 'name', required: true,
      validation: { maxLength: 120, pattern: '^[a-z0-9-]+$',
        message: 'اسلاگ باید با حروف کوچک انگلیسی، اعداد و خط‌فاصله باشد' } },
    { key: 'logoUrl', label: 'URL لوگو', type: 'media',
      helpText: 'تصویر لوگو برند' },
    { key: 'country', label: 'کشور سازنده', type: 'text',
      validation: { maxLength: 100,
        message: 'نام کشور نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'active', label: 'فعال', type: 'boolean', defaultValue: true,
      permissions: { read: 'store.read', write: 'store.manage' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'parts', label: 'قطعات', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'activate', label: 'فعال‌سازی', icon: 'ToggleRight',
      permission: 'store.manage', type: 'confirm',
      apiPath: '/api/admin/store/brands', apiMethod: 'PATCH' },
    { key: 'deactivate', label: 'غیرفعال‌سازی', icon: 'ToggleLeft',
      permission: 'store.manage', type: 'confirm',
      apiPath: '/api/admin/store/brands', apiMethod: 'PATCH' },
    { key: 'edit', label: 'ویرایش', icon: 'Pencil',
      permission: 'store.manage', type: 'modal',
      apiPath: '/api/admin/store/brands', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2',
      permission: 'store.manage', type: 'confirm', variant: 'destructive',
      apiPath: '/api/admin/store/brands', apiMethod: 'DELETE' },
  ],

  bulkActions: [
    { key: 'bulk-activate', label: 'فعال‌سازی گروهی', icon: 'ToggleRight',
      permission: 'store.manage', type: 'confirm' },
    { key: 'bulk-deactivate', label: 'غیرفعال‌سازی گروهی', icon: 'ToggleLeft',
      permission: 'store.manage', type: 'confirm' },
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'store.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'Brand',
    actions: ['store.manage'] },

  relations: [
    { label: 'قطعات', resource: 'parts', filterField: 'brandId' },
  ],
};

// ── 13. Shipments (B2C order-attached shipping ledger) ──────────
// Distinct from the marketplace `transports` resource (B2B transport
// request to move cargo between locations). Shipments are B2C: a
// carrier delivers a customer's order. The Shipment model is in
// store-schema.prisma (1:1 with Order via orderId @unique). The
// admin route at /api/admin/store/shipments exposes GET (list) + POST
// (create) + GET [id] (detail) + PATCH [id] (update). No DELETE —
// shipments are immutable once created (audit trail).
//
// Permission: uses `shipping.read`/`shipping.manage` (existing
// catalog keys at lines 130-131). These are NOT new permissions —
// they pre-date this patch and are the keys the actual API enforces.
// Using them keeps the resource config consistent with the API's
// runtime enforcement.
export const shipmentsConfig: AdminResourceConfig = {
  key: 'shipments',
  titleFa: 'سفارش‌های ارسالی',
  titleEn: 'Shipments',
  icon: 'PackageCheck',
  model: 'shipment',
  database: 'store',  // P1: Store-schema model (storeDb)
  apiBase: '/api/admin/store/shipments',
  adminPath: '/admin/resources/shipments',

  permissions: {
    read: 'shipping.read',
    create: 'shipping.manage',
    update: 'shipping.manage',
    delete: 'shipping.manage',
    export: 'shipping.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'orderId', label: 'سفارش', type: 'relation', sortable: true, filterable: true,
      relation: { model: 'order', labelField: 'orderNumber' } },
    { key: 'carrier', label: 'حامل', type: 'badge', sortable: true, filterable: true },
    { key: 'trackingCode', label: 'کد ردیابی', type: 'text', filterable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'shippedAt', label: 'تاریخ ارسال', type: 'date', sortable: true },
    { key: 'deliveredAt', label: 'تاریخ تحویل', type: 'date', sortable: true },
    { key: 'pickupDate', label: 'تاریخ بارگیری', type: 'date', visible: false },
    { key: 'proofUrl', label: 'مدرک تحویل', type: 'image', visible: false },
    { key: 'note', label: 'یادداشت', type: 'text', visible: false },
    { key: 'createdAt', label: 'تاریخ ثبت', type: 'date', sortable: true },
    { key: 'updatedAt', label: 'به‌روزرسانی', type: 'date', sortable: true, visible: false },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'DISPATCHED', label: 'ارسال‌شده' },
      { value: 'IN_TRANSIT', label: 'در حال حمل' },
      { value: 'DELIVERED', label: 'تحویل‌شده' },
      { value: 'EXCEPTION', label: 'استثنا' },
      { value: 'FAILED', label: 'ناموفق' },
    ]},
    { key: 'carrier', label: 'حامل', type: 'select', options: [
      { value: 'POST', label: 'پست' },
      { value: 'TIPAX', label: 'تیپاکس' },
      { value: 'CHAPAR', label: 'چاپار' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['trackingCode', 'note', 'orderId'],

  fields: [
    { key: 'orderId', label: 'سفارش', type: 'relation', required: true,
      relation: { model: 'order', labelField: 'orderNumber' },
      validation: { message: 'انتخاب سفارش الزامی است' } },
    { key: 'carrier', label: 'حامل', type: 'select', required: true, options: [
      { value: 'POST', label: 'پست' },
      { value: 'TIPAX', label: 'تیپاکس' },
      { value: 'CHAPAR', label: 'چاپار' },
    ], permissions: { read: 'shipping.read', write: 'shipping.manage' } },
    { key: 'trackingCode', label: 'کد ردیابی', type: 'text',
      validation: { maxLength: 100,
        message: 'کد ردیابی نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'DISPATCHED', label: 'ارسال‌شده' },
      { value: 'IN_TRANSIT', label: 'در حال حمل' },
      { value: 'DELIVERED', label: 'تحویل‌شده' },
      { value: 'EXCEPTION', label: 'استثنا' },
      { value: 'FAILED', label: 'ناموفق' },
    ], permissions: { read: 'shipping.read', write: 'shipping.manage' } },
    { key: 'shippedAt', label: 'تاریخ ارسال', type: 'datetime',
      permissions: { read: 'shipping.read', write: 'shipping.manage' } },
    { key: 'deliveredAt', label: 'تاریخ تحویل', type: 'datetime',
      permissions: { read: 'shipping.read', write: 'shipping.manage' } },
    { key: 'pickupDate', label: 'تاریخ بارگیری', type: 'datetime',
      permissions: { read: 'shipping.read', write: 'shipping.manage' } },
    { key: 'proofUrl', label: 'مدرک تحویل (تصویر)', type: 'media',
      permissions: { read: 'shipping.read', write: 'shipping.manage' } },
    { key: 'note', label: 'یادداشت', type: 'textarea',
      validation: { maxLength: 1000,
        message: 'یادداشت نباید بیش از ۱۰۰۰ نویسه باشد' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'tracking', label: 'تاریخچه ردیابی', type: 'relations' },
    { key: 'order', label: 'سفارش', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'dispatch', label: 'ارسال', icon: 'Send',
      permission: 'shipping.manage', type: 'confirm',
      apiPath: '/api/admin/store/shipments', apiMethod: 'PATCH' },
    { key: 'mark-delivered', label: 'علامت‌گذاری تحویل', icon: 'CheckCircle2',
      permission: 'shipping.manage', type: 'confirm',
      apiPath: '/api/admin/store/shipments', apiMethod: 'PATCH' },
    { key: 'mark-exception', label: 'ثبت استثنا', icon: 'AlertCircle',
      permission: 'shipping.manage', type: 'modal',
      apiPath: '/api/admin/store/shipments', apiMethod: 'PATCH' },
    { key: 'edit', label: 'ویرایش', icon: 'Pencil',
      permission: 'shipping.manage', type: 'modal',
      apiPath: '/api/admin/store/shipments', apiMethod: 'PATCH' },
  ],

  bulkActions: [
    { key: 'bulk-dispatch', label: 'ارسال گروهی', icon: 'Send',
      permission: 'shipping.manage', type: 'confirm' },
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'shipping.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'Shipment',
    actions: ['shipping.manage'] },
};

// ── 14. Settings (Site-wide configuration) ───────────────────
// Phase 3 Batch 1: Registers the existing SiteSettings model
// (main schema) as a Universal Resource. Uses admin.settings.manage
// permission (already in catalog). API at /api/admin/site-settings.
export const settingsConfig: AdminResourceConfig = {
  key: 'settings',
  titleFa: 'تنظیمات سایت',
  titleEn: 'Site Settings',
  icon: 'Settings',
  model: 'siteSettings',
  apiBase: '/api/admin/site-settings',
  adminPath: '/admin/resources/settings',

  permissions: {
    read: 'admin.settings.manage',
    update: 'admin.settings.manage',
    export: 'admin.settings.manage',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'phone', label: 'تلفن', type: 'text' },
    { key: 'email', label: 'ایمیل', type: 'text' },
    { key: 'address', label: 'نشانی', type: 'text', visible: false },
    { key: 'workingHours', label: 'ساعات کاری', type: 'text' },
    { key: 'logoUrl', label: 'لوگو', type: 'image', visible: false },
    { key: 'newsletterEnabled', label: 'خبرنامه', type: 'boolean', sortable: true },
  ],

  defaultSort: { field: 'id', order: 'asc' },
  pageSize: 1,
  searchable: false,

  fields: [
    { key: 'phone', label: 'تلفن', type: 'text',
      validation: { maxLength: 50, message: 'تلفن نباید بیش از ۵۰ نویسه باشد' } },
    { key: 'email', label: 'ایمیل', type: 'text',
      validation: { maxLength: 100, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        message: 'فرمت ایمیل نامعتبر است' } },
    { key: 'address', label: 'نشانی', type: 'textarea',
      validation: { maxLength: 500, message: 'نشانی نباید بیش از ۵۰۰ نویسه باشد' } },
    { key: 'workingHours', label: 'ساعات کاری', type: 'text',
      validation: { maxLength: 200, message: 'ساعات کاری نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'about', label: 'درباره ما', type: 'textarea',
      validation: { maxLength: 5000, message: 'متن نباید بیش از ۵۰۰۰ نویسه باشد' } },
    { key: 'logoUrl', label: 'URL لوگو', type: 'media' },
    { key: 'newsletterEnabled', label: 'خبرنامه فعال', type: 'boolean', defaultValue: true },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'edit', label: 'ویرایش', icon: 'Pencil',
      permission: 'admin.settings.manage', type: 'modal',
      apiPath: '/api/admin/site-settings', apiMethod: 'PATCH' },
  ],

  audit: { enabled: true, entityType: 'SiteSettings',
    actions: ['admin.settings.manage'] },
};

// ── 15. Analytics (Site statistics + event tracking) ──────────
// Phase 3 Batch 1: Registers SiteStat model as a Universal Resource.
// Read-only for admin (stats are computed). Uses analytics.read/manage.
export const analyticsConfig: AdminResourceConfig = {
  key: 'analytics',
  titleFa: 'آمار و تحلیل',
  titleEn: 'Analytics',
  icon: 'BarChart3',
  model: 'siteStat',
  apiBase: '/api/admin/site-stats',
  adminPath: '/admin/resources/analytics',

  permissions: {
    read: 'analytics.read',
    create: 'analytics.manage',
    update: 'analytics.manage',
    delete: 'analytics.manage',
    export: 'analytics.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'key', label: 'کلید', type: 'text', sortable: true, filterable: true },
    { key: 'labelFa', label: 'برچسب', type: 'text', sortable: true, filterable: true },
    { key: 'metric', label: 'معیار', type: 'badge', filterable: true },
    { key: 'customValue', label: 'مقدار دل‌نویس', type: 'text', visible: false },
    { key: 'sortOrder', label: 'ترتیب', type: 'number', sortable: true },
    { key: 'active', label: 'فعال', type: 'boolean', sortable: true, filterable: true },
  ],

  filters: [
    { key: 'active', label: 'وضعیت', type: 'select', options: [
      { value: 'true', label: 'فعال' },
      { value: 'false', label: 'غیرفعال' },
    ]},
  ],

  defaultSort: { field: 'sortOrder', order: 'asc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['key', 'labelFa', 'metric'],

  fields: [
    { key: 'key', label: 'کلید', type: 'text', required: true,
      validation: { maxLength: 50, message: 'کلید نباید بیش از ۵۰ نویسه باشد' } },
    { key: 'labelFa', label: 'برچسب فارسی', type: 'text', required: true,
      validation: { maxLength: 100, message: 'برچسب نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'metric', label: 'معیار', type: 'select', required: true, options: [
      { value: 'categories', label: 'دسته‌بندی‌ها' },
      { value: 'brands', label: 'برندها' },
      { value: 'listings', label: 'آگهی‌ها' },
      { value: 'users', label: 'کاربران' },
      { value: 'custom_value', label: 'مقدار دل‌نویس' },
    ] },
    { key: 'customValue', label: 'مقدار دل‌نویس', type: 'text',
      validation: { maxLength: 200 } },
    { key: 'sortOrder', label: 'ترتیب نمایش', type: 'number', defaultValue: 0,
      validation: { min: 0 } },
    { key: 'active', label: 'فعال', type: 'boolean', defaultValue: true },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'edit', label: 'ویرایش', icon: 'Pencil',
      permission: 'analytics.manage', type: 'modal',
      apiPath: '/api/admin/site-stats', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2',
      permission: 'analytics.manage', type: 'confirm', variant: 'destructive',
      apiPath: '/api/admin/site-stats', apiMethod: 'DELETE' },
  ],

  bulkActions: [
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'analytics.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'SiteStat',
    actions: ['analytics.manage'] },
};

// ── 16. SEO (Search Engine Optimization metadata) ─────────────
// Phase 3 Batch 1: Registers SEOMetadata model as a Universal Resource.
// Uses seo.read/manage permissions (already in catalog).
export const seoConfig: AdminResourceConfig = {
  key: 'seo',
  titleFa: 'بهینه‌سازی موتور جستجو',
  titleEn: 'SEO Metadata',
  icon: 'Search',
  model: 'sEOMetadata',
  apiBase: '/api/admin/seo',
  adminPath: '/admin/resources/seo',

  permissions: {
    read: 'seo.read',
    create: 'seo.manage',
    update: 'seo.manage',
    delete: 'seo.manage',
    export: 'seo.read',
  },

  columns: [
    { key: 'id', label: 'شناسه', type: 'text', visible: false },
    { key: 'entityType', label: 'نوع محتوا', type: 'badge', sortable: true, filterable: true },
    { key: 'entityId', label: 'شناسه محتوا', type: 'text', filterable: true },
    { key: 'metaTitle', label: 'عنوان متا', type: 'text', visible: false },
    { key: 'metaDescription', label: 'توضیحات متا', type: 'text', visible: false },
    { key: 'keywords', label: 'کلمات کلیدی', type: 'text', filterable: true },
    { key: 'canonicalUrl', label: 'URL کانونیکال', type: 'text', visible: false },
    { key: 'robotsIndex', label: 'ایندکس', type: 'boolean', sortable: true },
    { key: 'robotsFollow', label: 'فالو', type: 'boolean', sortable: true },
  ],

  filters: [
    { key: 'entityType', label: 'نوع محتوا', type: 'select', options: [
      { value: 'Category', label: 'دسته‌بندی' },
      { value: 'Brand', label: 'برند' },
      { value: 'Product', label: 'محصول' },
      { value: 'Listing', label: 'آگهی' },
      { value: 'Article', label: 'مقاله' },
      { value: 'Page', label: 'صفحه' },
    ]},
  ],

  defaultSort: { field: 'entityType', order: 'asc' },
  pageSize: 25,
  searchable: true,
  searchFields: ['entityType', 'entityId', 'metaTitle', 'keywords'],

  fields: [
    { key: 'entityType', label: 'نوع محتوا', type: 'select', required: true, options: [
      { value: 'Category', label: 'دسته‌بندی' },
      { value: 'Brand', label: 'برند' },
      { value: 'Product', label: 'محصول' },
      { value: 'Listing', label: 'آگهی' },
      { value: 'Article', label: 'مقاله' },
      { value: 'Page', label: 'صفحه' },
    ] },
    { key: 'entityId', label: 'شناسه محتوا', type: 'text', required: true,
      validation: { maxLength: 100 } },
    { key: 'metaTitle', label: 'عنوان متا', type: 'text',
      validation: { maxLength: 200 } },
    { key: 'metaDescription', label: 'توضیحات متا', type: 'textarea',
      validation: { maxLength: 500 } },
    { key: 'keywords', label: 'کلمات کلیدی', type: 'text',
      helpText: 'با کاما جدا کنید',
      validation: { maxLength: 500 } },
    { key: 'canonicalUrl', label: 'URL کانونیکال', type: 'text',
      validation: { maxLength: 500 } },
    { key: 'ogImage', label: 'تصویر OG', type: 'media' },
    { key: 'ogTitle', label: 'عنوان OG', type: 'text',
      validation: { maxLength: 200 } },
    { key: 'ogDescription', label: 'توضیحات OG', type: 'textarea',
      validation: { maxLength: 500 } },
    { key: 'structuredData', label: 'داده‌های ساختاریافته (JSON-LD)', type: 'textarea',
      validation: { maxLength: 5000 } },
    { key: 'robotsIndex', label: 'ایندکس شود', type: 'boolean', defaultValue: true },
    { key: 'robotsFollow', label: 'فالو شود', type: 'boolean', defaultValue: true },
    { key: 'sitemapPriority', label: 'اولویت نقشه سایت', type: 'number',
      validation: { min: 0, max: 1, message: 'اولویت باید بین ۰ تا ۱ باشد' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'edit', label: 'ویرایش', icon: 'Pencil',
      permission: 'seo.manage', type: 'modal',
      apiPath: '/api/admin/seo', apiMethod: 'PATCH' },
    { key: 'delete', label: 'حذف', icon: 'Trash2',
      permission: 'seo.manage', type: 'confirm', variant: 'destructive',
      apiPath: '/api/admin/seo', apiMethod: 'DELETE' },
  ],

  bulkActions: [
    { key: 'bulk-export', label: 'خروجی گروهی', icon: 'Download',
      permission: 'seo.read', type: 'confirm' },
  ],

  audit: { enabled: true, entityType: 'SEOMetadata',
    actions: ['seo.manage'] },
};
