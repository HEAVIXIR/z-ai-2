import type { AdminResourceConfig } from '../types';

// ════════════════════════════════════════════════════════════
// STEP 13 — MARKETPLACE CONTROL PLANE RESOURCES
// ════════════════════════════════════════════════════════════

export const dealConfig: AdminResourceConfig = {
  key: 'deals',
  titleFa: 'معاملات',
  titleEn: 'Deals',
  icon: 'Handshake',
  model: 'deal',
  apiBase: '/api/admin/resources/deals',
  adminPath: '/admin/resources/deals',

  permissions: { read: 'deal.read', create: 'deal.manage', update: 'deal.manage', delete: 'deal.manage', export: 'deal.read' },

  columns: [
    { key: 'dealNumber', label: 'شماره معامله', type: 'text', sortable: true, filterable: true },
    { key: 'sourceType', label: 'منبع', type: 'badge', filterable: true },
    { key: 'agreedAmount', label: 'مبلغ توافق', type: 'currency', sortable: true },
    { key: 'currency', label: 'ارز', type: 'badge' },
    { key: 'transactionType', label: 'نوع', type: 'badge', filterable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'agreedAt', label: 'توافق', type: 'date', sortable: true, visible: false },
    { key: 'confirmedAt', label: 'تأیید', type: 'date', sortable: true, visible: false },
    { key: 'completedAt', label: 'تکمیل', type: 'date', sortable: true },
    { key: 'createdAt', label: 'ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'DRAFT', label: 'پیش‌نویس' },
      { value: 'PENDING_CONFIRMATION', label: 'در انتظار تأیید' },
      { value: 'CONFIRMED', label: 'تأییدشده' },
      { value: 'IN_PROGRESS', label: 'در حال انجام' },
      { value: 'COMPLETED', label: 'تکمیل‌شده' },
      { value: 'CANCELLED', label: 'لغوشده' },
      { value: 'DISPUTED', label: 'مختلص' },
    ]},
    { key: 'sourceType', label: 'منبع', type: 'select', options: [
      { value: 'LISTING_OFFER', label: 'پیشنهاد آگهی' },
      { value: 'RFQ_QUOTE', label: 'پیشنهاد RFQ' },
      { value: 'DEAL_ROOM', label: 'اتاق معامله' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['dealNumber'],

  fields: [
    { key: 'dealNumber', label: 'شماره معامله', type: 'text', required: true,
      validation: { minLength: 3, maxLength: 50, pattern: '^DEAL-\\d{4,}$', message: 'شماره معامله باید با DEAL- شروع و حداقل ۴ رقم داشته باشد (مثال: DEAL-1234)' } },
    { key: 'sourceType', label: 'منبع', type: 'select', options: [
      { value: 'LISTING_OFFER', label: 'پیشنهاد آگهی' },
      { value: 'RFQ_QUOTE', label: 'پیشنهاد RFQ' },
      { value: 'DEAL_ROOM', label: 'اتاق معامله' },
    ]},
    { key: 'agreedAmount', label: 'مبلغ توافق', type: 'currency',
      validation: { min: 1000, message: 'مبلغ توافق باید حداقل ۱,۰۰۰ ریال باشد' } },
    { key: 'currency', label: 'ارز', type: 'text', defaultValue: 'IRR',
      validation: { pattern: '^(IRR|USD|EUR)$', message: 'ارز باید یکی از IRR، USD یا EUR باشد' } },
    { key: 'transactionType', label: 'نوع معامله', type: 'select', options: [
      { value: 'SALE', label: 'فروش' }, { value: 'RENT', label: 'اجاره' },
    ]},
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'DRAFT', label: 'پیش‌نویس' },
      { value: 'CONFIRMED', label: 'تأییدشده' },
      { value: 'COMPLETED', label: 'تکمیل‌شده' },
      { value: 'CANCELLED', label: 'لغوشده' },
    ]},
    { key: 'notes', label: 'یادداشت', type: 'textarea',
      validation: { maxLength: 2000, message: 'یادداشت نباید بیش از ۲,۰۰۰ نویسه باشد' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'order', label: 'سفارش', type: 'relations' },
    { key: 'disputes', label: 'اختلافات', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'confirm', label: 'تأیید معامله', icon: 'CheckCircle', permission: 'deal.manage', type: 'confirm' },
    { key: 'cancel', label: 'لغو معامله', icon: 'X', permission: 'deal.manage', type: 'confirm', variant: 'destructive' },
  ],

  bulkActions: [
    { key: 'bulk-cancel', label: 'لغو گروهی', icon: 'X', permission: 'deal.manage', type: 'confirm', variant: 'destructive' },
  ],

  audit: { enabled: true, entityType: 'Deal', actions: ['deal.manage', 'deal.read'] },
  relations: [
    { label: 'سفارش', resource: 'orders', filterField: 'dealId' },
    { label: 'اختلافات', resource: 'disputes', filterField: 'dealId' },
  ],
};

export const rfqConfig: AdminResourceConfig = {
  key: 'rfqs',
  titleFa: 'درخواست‌های خرید (RFQ)',
  titleEn: 'RFQ',
  icon: 'FileText',
  model: 'rFQ',
  apiBase: '/api/admin/resources/rfqs',
  adminPath: '/admin/resources/rfqs',

  permissions: { read: 'rfq.read', create: 'rfq.manage', update: 'rfq.manage', delete: 'rfq.manage', export: 'rfq.read' },

  columns: [
    { key: 'title', label: 'عنوان', type: 'text', sortable: true, filterable: true },
    { key: 'machineType', label: 'نوع دستگاه', type: 'text', filterable: true },
    { key: 'quantity', label: 'تعداد', type: 'number', sortable: true },
    { key: 'budgetMin', label: 'حداقل بودجه', type: 'currency', visible: false },
    { key: 'budgetMax', label: 'حداکثر بودجه', type: 'currency', visible: false },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'buyerName', label: 'خریدار', type: 'text' },
    { key: 'buyerPhone', label: 'تماس', type: 'text', visible: false },
    { key: 'deadline', label: 'مهلت', type: 'date', sortable: true },
    { key: 'createdAt', label: 'ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'OPEN', label: 'باز' }, { value: 'QUOTING', label: 'در حال پیشنهاد' },
      { value: 'AWARDED', label: 'تخصیص‌یافته' }, { value: 'CLOSED', label: 'بسته' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['title', 'machineType', 'buyerName', 'buyerPhone'],

  fields: [
    { key: 'title', label: 'عنوان درخواست', type: 'text', required: true,
      validation: { minLength: 3, maxLength: 200, message: 'عنوان درخواست باید بین ۳ تا ۲۰۰ نویسه باشد' } },
    { key: 'description', label: 'توضیحات', type: 'textarea',
      validation: { maxLength: 5000, message: 'توضیحات نباید بیش از ۵,۰۰۰ نویسه باشد' } },
    { key: 'machineType', label: 'نوع دستگاه', type: 'text',
      validation: { maxLength: 200, message: 'نوع دستگاه نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'brandPref', label: 'ترجیح برند', type: 'text',
      validation: { maxLength: 200, message: 'ترجیح برند نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'quantity', label: 'تعداد', type: 'number', defaultValue: 1,
      validation: { min: 1, max: 10000, message: 'تعداد باید بین ۱ تا ۱۰,۰۰۰ باشد' } },
    { key: 'budgetMin', label: 'حداقل بودجه', type: 'currency',
      validation: { min: 0, message: 'حداقل بودجه باید عدد نامنفی باشد' } },
    { key: 'budgetMax', label: 'حداکثر بودجه', type: 'currency',
      validation: { min: 0, message: 'حداکثر بودجه باید عدد نامنفی باشد' } },
    { key: 'location', label: 'موقعیت', type: 'text',
      validation: { maxLength: 200, message: 'موقعیت نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'deadline', label: 'مهلت', type: 'datetime' },
    { key: 'terms', label: 'شرایط', type: 'textarea',
      validation: { maxLength: 5000, message: 'شرایط نباید بیش از ۵,۰۰۰ نویسه باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'OPEN', label: 'باز' }, { value: 'CLOSED', label: 'بسته' },
    ]},
    { key: 'buyerName', label: 'نام خریدار', type: 'text',
      validation: { maxLength: 200, message: 'نام خریدار نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'buyerPhone', label: 'تماس', type: 'text', required: true,
      validation: { pattern: '^0\\d{10}$', message: 'تماس باید ۱۱ رقم و با ۰ شروع شود (مثال: 09123456789)' },
      permissions: { read: 'rfq.read', write: 'rfq.manage' } },
    { key: 'buyerEmail', label: 'ایمیل', type: 'text',
      validation: { pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', message: 'فرمت ایمیل نامعتبر است' },
      permissions: { read: 'rfq.read', write: 'rfq.manage' } },
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'quotes', label: 'پیشنهادها', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'close', label: 'بستن درخواست', icon: 'Lock', permission: 'rfq.manage', type: 'confirm' },
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'rfq.manage', type: 'confirm', variant: 'destructive' },
  ],

  audit: { enabled: true, entityType: 'RFQ', actions: ['rfq.manage'] },
  relations: [
    { label: 'پیشنهادها', resource: 'rfq-quotes', filterField: 'rfqId' },
  ],
};

export const offerConfig: AdminResourceConfig = {
  key: 'offers',
  titleFa: 'پیشنهادها',
  titleEn: 'Offers',
  icon: 'Tag',
  model: 'listingOffer',
  apiBase: '/api/admin/resources/offers',
  adminPath: '/admin/resources/offers',

  permissions: { read: 'listing.read', create: 'listing.read', update: 'listing.update', delete: 'listing.update', export: 'listing.read' },

  columns: [
    { key: 'offerAmount', label: 'مبلغ پیشنهاد', type: 'currency', sortable: true, filterable: true },
    { key: 'message', label: 'پیام', type: 'text', visible: false },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'counterAmount', label: 'مبلغ ضدپیشنهاد', type: 'currency', visible: false },
    { key: 'buyerName', label: 'خریدار', type: 'text' },
    { key: 'buyerPhone', label: 'تماس', type: 'text', visible: false },
    { key: 'sellerNote', label: 'یادداشت فروشنده', type: 'text', visible: false },
    { key: 'respondedAt', label: 'پاسخ', type: 'date', sortable: true, visible: false },
    { key: 'createdAt', label: 'ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'ACCEPTED', label: 'پذیرفته‌شده' },
      { value: 'REJECTED', label: 'ردشده' },
      { value: 'COUNTERED', label: 'ضدپیشنهاد' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['buyerName', 'buyerPhone', 'message'],

  fields: [
    { key: 'offerAmount', label: 'مبلغ پیشنهاد', type: 'currency', required: true,
      validation: { min: 0, message: 'مبلغ پیشنهاد باید عدد نامنفی باشد' } },
    { key: 'message', label: 'پیام', type: 'textarea',
      validation: { maxLength: 2000, message: 'پیام نباید بیش از ۲,۰۰۰ نویسه باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'PENDING', label: 'در انتظار' },
      { value: 'ACCEPTED', label: 'پذیرفته‌شده' },
      { value: 'REJECTED', label: 'ردشده' },
    ]},
    { key: 'counterAmount', label: 'مبلغ ضدپیشنهاد', type: 'currency',
      validation: { min: 0, message: 'مبلغ ضدپیشنهاد باید عدد نامنفی باشد' } },
    { key: 'buyerName', label: 'نام خریدار', type: 'text',
      validation: { maxLength: 200, message: 'نام خریدار نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'buyerPhone', label: 'تماس خریدار', type: 'text', required: true,
      validation: { pattern: '^0\\d{10}$', message: 'تماس باید ۱۱ رقم و با ۰ شروع شود (مثال: 09123456789)' },
      permissions: { read: 'offer.read', write: 'offer.update' } },
    { key: 'buyerEmail', label: 'ایمیل', type: 'text',
      validation: { pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', message: 'فرمت ایمیل نامعتبر است' },
      permissions: { read: 'offer.read', write: 'offer.update' } },
    { key: 'sellerNote', label: 'یادداشت فروشنده', type: 'textarea',
      validation: { maxLength: 2000, message: 'یادداشت نباید بیش از ۲,۰۰۰ نویسه باشد' } },
  ],

  actions: [
    { key: 'accept', label: 'پذیرش', icon: 'CheckCircle', permission: 'listing.update', type: 'confirm' },
    { key: 'reject', label: 'رد', icon: 'X', permission: 'listing.update', type: 'confirm', variant: 'destructive' },
  ],

  audit: { enabled: true, entityType: 'ListingOffer', actions: ['listing.update'] },
};

export const auctionConfig: AdminResourceConfig = {
  key: 'auctions',
  titleFa: 'مزایده‌ها',
  titleEn: 'Auctions',
  icon: 'Gavel',
  model: 'auction',
  apiBase: '/api/admin/auctions',
  adminPath: '/admin/resources/auctions',

  permissions: { read: 'auction.manage', create: 'auction.manage', update: 'auction.manage', delete: 'auction.manage', export: 'auction.manage' },

  columns: [
    { key: 'title', label: 'عنوان', type: 'text', sortable: true, filterable: true },
    { key: 'startPrice', label: 'قیمت شروع', type: 'currency', sortable: true },
    { key: 'reservePrice', label: 'قیمت رزرو', type: 'currency', visible: false },
    { key: 'minIncrement', label: 'حداقل افزایش', type: 'currency', visible: false },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'winnerName', label: 'برنده', type: 'text', visible: false },
    { key: 'winningBid', label: 'پیشنهاد برنده', type: 'currency', visible: false },
    { key: 'startDate', label: 'شروع', type: 'date', sortable: true },
    { key: 'endDate', label: 'پایان', type: 'date', sortable: true },
    { key: 'createdAt', label: 'ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'SCHEDULED', label: 'زمان‌بندی‌شده' },
      { value: 'LIVE', label: 'در جریان' },
      { value: 'ENDED', label: 'پایان‌یافته' },
      { value: 'CANCELLED', label: 'لغوشده' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['title', 'winnerName'],

  fields: [
    { key: 'title', label: 'عنوان مزایده', type: 'text', required: true,
      validation: { minLength: 3, maxLength: 200, message: 'عنوان مزایده باید بین ۳ تا ۲۰۰ نویسه باشد' } },
    { key: 'description', label: 'توضیحات', type: 'textarea',
      validation: { maxLength: 5000, message: 'توضیحات نباید بیش از ۵,۰۰۰ نویسه باشد' } },
    { key: 'startPrice', label: 'قیمت شروع', type: 'currency', required: true,
      validation: { min: 1000, message: 'قیمت شروع باید حداقل ۱,۰۰۰ ریال باشد' } },
    { key: 'reservePrice', label: 'قیمت رزرو', type: 'currency',
      validation: { min: 1000, message: 'قیمت رزرو باید حداقل ۱,۰۰۰ ریال باشد' } },
    { key: 'minIncrement', label: 'حداقل افزایش', type: 'currency',
      validation: { min: 100, message: 'حداقل افزایش باید حداقل ۱۰۰ ریال باشد' } },
    { key: 'startDate', label: 'تاریخ شروع', type: 'datetime', required: true },
    { key: 'endDate', label: 'تاریخ پایان', type: 'datetime', required: true },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'SCHEDULED', label: 'زمان‌بندی‌شده' },
      { value: 'LIVE', label: 'در جریان' },
      { value: 'ENDED', label: 'پایان‌یافته' },
    ]},
  ],

  detailTabs: [
    { key: 'overview', label: 'مشاهده کلی', type: 'overview' },
    { key: 'bids', label: 'پیشنهادها', type: 'relations' },
    { key: 'audit', label: 'ممیزی', type: 'audit' },
  ],

  actions: [
    { key: 'start', label: 'شروع مزایده', icon: 'Play', permission: 'auction.manage', type: 'confirm' },
    { key: 'end', label: 'پایان مزایده', icon: 'Square', permission: 'auction.manage', type: 'confirm' },
    { key: 'cancel', label: 'لغو', icon: 'X', permission: 'auction.manage', type: 'confirm', variant: 'destructive' },
  ],

  audit: { enabled: true, entityType: 'Auction', actions: ['auction.manage'] },
  relations: [
    { label: 'پیشنهادها', resource: 'auction-bids', filterField: 'auctionId' },
  ],
};

export const inspectionConfig: AdminResourceConfig = {
  key: 'inspections',
  titleFa: 'کارشناسی',
  titleEn: 'Inspections',
  icon: 'Search',
  model: 'inspection',
  apiBase: '/api/admin/inspections',
  adminPath: '/admin/resources/inspections',

  permissions: { read: 'inspection.read', create: 'inspection.read', update: 'inspection.read', delete: 'inspection.read', export: 'inspection.read' },

  columns: [
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'requestedBy', label: 'درخواست‌کننده', type: 'text' },
    { key: 'inspectorId', label: 'کارشناس', type: 'text', visible: false },
    { key: 'scheduledDate', label: 'تاریخ برنامه', type: 'date', sortable: true },
    { key: 'completedAt', label: 'تکمیل', type: 'date', sortable: true },
    { key: 'score', label: 'امتیاز', type: 'number', sortable: true },
    { key: 'price', label: 'مبلغ', type: 'currency', visible: false },
    { key: 'createdAt', label: 'ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'REQUESTED', label: 'درخواست‌شده' },
      { value: 'SCHEDULED', label: 'برنامه‌ریزی‌شده' },
      { value: 'IN_PROGRESS', label: 'در حال انجام' },
      { value: 'COMPLETED', label: 'تکمیل‌شده' },
      { value: 'CANCELLED', label: 'لغوشده' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['requestedBy', 'inspectorId'],

  fields: [
    { key: 'requestedBy', label: 'درخواست‌کننده', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 100, message: 'نام درخواست‌کننده باید بین ۲ تا ۱۰۰ نویسه باشد' } },
    { key: 'inspectorId', label: 'کارشناس', type: 'text',
      validation: { maxLength: 100, message: 'شناسه کارشناس نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'REQUESTED', label: 'درخواست‌شده' },
      { value: 'SCHEDULED', label: 'برنامه‌ریزی‌شده' },
      { value: 'COMPLETED', label: 'تکمیل‌شده' },
    ]},
    { key: 'scheduledDate', label: 'تاریخ برنامه', type: 'datetime' },
    { key: 'score', label: 'امتیاز (۰-۱۰۰)', type: 'number',
      validation: { min: 0, max: 100, message: 'امتیاز باید بین ۰ تا ۱۰۰ باشد' } },
    { key: 'reportUrl', label: 'گزارش', type: 'media' },
    { key: 'price', label: 'مبلغ', type: 'currency',
      validation: { min: 0, message: 'مبلغ باید عدد نامنفی باشد' } },
    { key: 'notes', label: 'یادداشت', type: 'textarea',
      validation: { maxLength: 5000, message: 'یادداشت نباید بیش از ۵,۰۰۰ نویسه باشد' } },
  ],

  actions: [
    { key: 'schedule', label: 'برنامه‌ریزی', icon: 'Calendar', permission: 'inspection.read', type: 'confirm' },
    { key: 'complete', label: 'تکمیل', icon: 'CheckCircle', permission: 'inspection.read', type: 'confirm' },
    { key: 'cancel', label: 'لغو', icon: 'X', permission: 'inspection.read', type: 'confirm', variant: 'destructive' },
  ],

  audit: { enabled: true, entityType: 'Inspection', actions: ['inspection.read'] },
};

export const transportConfig: AdminResourceConfig = {
  key: 'transports',
  titleFa: 'حمل‌ونقل',
  titleEn: 'Transport',
  icon: 'Truck',
  model: 'transportRequest',
  apiBase: '/api/admin/transport',
  adminPath: '/admin/resources/transports',

  permissions: { read: 'transport.read', create: 'transport.read', update: 'transport.read', delete: 'transport.read', export: 'transport.read' },

  columns: [
    { key: 'origin', label: 'مبدا', type: 'text', filterable: true },
    { key: 'destination', label: 'مقصد', type: 'text', filterable: true },
    { key: 'cargoType', label: 'نوع بار', type: 'text', visible: false },
    { key: 'cargoWeight', label: 'وزن', type: 'number', visible: false },
    { key: 'vehicleType', label: 'نوع وسیله', type: 'badge', filterable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'quotedPrice', label: 'مبلغ', type: 'currency', sortable: true },
    { key: 'carrierName', label: 'حامل', type: 'text' },
    { key: 'trackingCode', label: 'کد ردیابی', type: 'text' },
    { key: 'loadingDate', label: 'بارگیری', type: 'date', sortable: true },
    { key: 'deliveryDate', label: 'تحویل', type: 'date', sortable: true },
    { key: 'createdAt', label: 'ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'REQUESTED', label: 'درخواست‌شده' },
      { value: 'QUOTING', label: 'در حال پیشنهاد' },
      { value: 'ACCEPTED', label: 'پذیرفته‌شده' },
      { value: 'IN_TRANSIT', label: 'در حال حمل' },
      { value: 'DELIVERED', label: 'تحویل‌شده' },
      { value: 'CANCELLED', label: 'لغوشده' },
    ]},
    { key: 'vehicleType', label: 'نوع وسیله', type: 'select', options: [
      { value: 'FLATBED', label: 'تخت‌دار' },
      { value: 'LOWBOY', label: 'لوبوی' },
      { value: 'CONTAINER', label: 'کانتینر' },
      { value: 'SPECIAL', label: 'ویژه' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['origin', 'destination', 'carrierName', 'trackingCode'],

  fields: [
    { key: 'origin', label: 'مبدا', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 200, message: 'مبدا باید بین ۲ تا ۲۰۰ نویسه باشد' } },
    { key: 'destination', label: 'مقصد', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 200, message: 'مقصد باید بین ۲ تا ۲۰۰ نویسه باشد' } },
    { key: 'cargoType', label: 'نوع بار', type: 'text',
      validation: { maxLength: 100, message: 'نوع بار نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'cargoWeight', label: 'وزن (kg)', type: 'number',
      validation: { min: 0, message: 'وزن بار باید عدد نامنفی باشد' } },
    { key: 'cargoLength', label: 'طول', type: 'number', visible: false,
      validation: { min: 0, message: 'طول باید عدد نامنفی باشد' } },
    { key: 'cargoWidth', label: 'عرض', type: 'number', visible: false,
      validation: { min: 0, message: 'عرض باید عدد نامنفی باشد' } },
    { key: 'cargoHeight', label: 'ارتفاع', type: 'number', visible: false,
      validation: { min: 0, message: 'ارتفاع باید عدد نامنفی باشد' } },
    { key: 'vehicleType', label: 'نوع وسیله', type: 'select', options: [
      { value: 'FLATBED', label: 'تخت‌دار' },
      { value: 'LOWBOY', label: 'لوبوی' },
      { value: 'CONTAINER', label: 'کانتینر' },
    ]},
    { key: 'loadingDate', label: 'تاریخ بارگیری', type: 'datetime' },
    { key: 'deliveryDate', label: 'تاریخ تحویل', type: 'datetime' },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'REQUESTED', label: 'درخواست‌شده' },
      { value: 'ACCEPTED', label: 'پذیرفته‌شده' },
      { value: 'IN_TRANSIT', label: 'در حال حمل' },
      { value: 'DELIVERED', label: 'تحویل‌شده' },
    ]},
    { key: 'quotedPrice', label: 'مبلغ', type: 'currency',
      validation: { min: 0, message: 'مبلغ حمل باید عدد نامنفی باشد' } },
    { key: 'carrierName', label: 'نام حامل', type: 'text',
      validation: { maxLength: 200, message: 'نام حامل نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'carrierPhone', label: 'تماس حامل', type: 'text',
      validation: { pattern: '^0\\d{10}$', message: 'تماس حامل باید ۱۱ رقم و با ۰ شروع شود (مثال: 02112345678)' } },
    { key: 'trackingCode', label: 'کد ردیابی', type: 'text',
      validation: { maxLength: 100, message: 'کد ردیابی نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'requestedBy', label: 'درخواست‌کننده', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 100, message: 'نام درخواست‌کننده باید بین ۲ تا ۱۰۰ نویسه باشد' } },
    { key: 'notes', label: 'یادداشت', type: 'textarea',
      validation: { maxLength: 2000, message: 'یادداشت نباید بیش از ۲,۰۰۰ نویسه باشد' } },
  ],

  actions: [
    { key: 'accept', label: 'پذیرش', icon: 'CheckCircle', permission: 'transport.read', type: 'confirm' },
    { key: 'deliver', label: 'تحویل', icon: 'Package', permission: 'transport.read', type: 'confirm' },
    { key: 'cancel', label: 'لغو', icon: 'X', permission: 'transport.read', type: 'confirm', variant: 'destructive' },
  ],

  audit: { enabled: true, entityType: 'TransportRequest', actions: ['transport.read'] },
};

export const disputeConfig: AdminResourceConfig = {
  key: 'disputes',
  titleFa: 'اختلافات',
  titleEn: 'Disputes',
  icon: 'AlertTriangle',
  model: 'dispute',
  apiBase: '/api/admin/resources/disputes',
  adminPath: '/admin/resources/disputes',

  permissions: { read: 'deal.read', create: 'deal.manage', update: 'deal.manage', delete: 'deal.manage', export: 'deal.read' },

  columns: [
    { key: 'reason', label: 'دلیل', type: 'text', filterable: true },
    { key: 'description', label: 'توضیحات', type: 'text', visible: false },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'openedBy', label: 'باز‌کننده', type: 'text' },
    { key: 'resolution', label: 'راه‌حل', type: 'text', visible: false },
    { key: 'resolvedBy', label: 'حل‌کننده', type: 'text', visible: false },
    { key: 'openedAt', label: 'باز‌شدن', type: 'date', sortable: true },
    { key: 'resolvedAt', label: 'حل‌شدن', type: 'date', sortable: true },
    { key: 'createdAt', label: 'ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'OPEN', label: 'باز' },
      { value: 'UNDER_REVIEW', label: 'در حال بررسی' },
      { value: 'RESOLVED', label: 'حل‌شده' },
      { value: 'CANCELLED', label: 'لغوشده' },
    ]},
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['reason', 'description', 'openedBy'],

  fields: [
    { key: 'reason', label: 'دلیل اختلاف', type: 'text', required: true,
      validation: { minLength: 5, maxLength: 200, message: 'دلیل اختلاف باید بین ۵ تا ۲۰۰ نویسه باشد' } },
    { key: 'description', label: 'توضیحات', type: 'textarea',
      validation: { maxLength: 5000, message: 'توضیحات نباید بیش از ۵,۰۰۰ نویسه باشد' } },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'OPEN', label: 'باز' },
      { value: 'UNDER_REVIEW', label: 'در حال بررسی' },
      { value: 'RESOLVED', label: 'حل‌شده' },
    ]},
    { key: 'resolution', label: 'راه‌حل', type: 'textarea',
      validation: { maxLength: 5000, message: 'راه‌حل نباید بیش از ۵,۰۰۰ نویسه باشد' } },
    { key: 'evidence', label: 'مدارک', type: 'json' },
    { key: 'openedBy', label: 'باز‌کننده', type: 'text', required: true,
      validation: { minLength: 2, maxLength: 100, message: 'نام باز‌کننده باید بین ۲ تا ۱۰۰ نویسه باشد' } },
  ],

  actions: [
    { key: 'review', label: 'شروع بررسی', icon: 'Search', permission: 'deal.manage', type: 'confirm' },
    { key: 'resolve', label: 'حل اختلاف', icon: 'CheckCircle', permission: 'deal.manage', type: 'confirm' },
    { key: 'cancel', label: 'لغو', icon: 'X', permission: 'deal.manage', type: 'confirm', variant: 'destructive' },
  ],

  audit: { enabled: true, entityType: 'Dispute', actions: ['deal.manage'] },
};

export const buyRequestConfig: AdminResourceConfig = {
  key: 'buy-requests',
  titleFa: 'درخواست‌های خرید',
  titleEn: 'Buy Requests',
  icon: 'ShoppingBag',
  model: 'buyRequest',
  apiBase: '/api/admin/requests',
  adminPath: '/admin/resources/buy-requests',

  permissions: { read: 'request.read', create: 'request.read', update: 'request.read', delete: 'request.read', export: 'request.read' },

  columns: [
    { key: 'title', label: 'عنوان', type: 'text', sortable: true, filterable: true },
    { key: 'category', label: 'دسته', type: 'text', filterable: true },
    { key: 'brandPref', label: 'ترجیح برند', type: 'text', visible: false },
    { key: 'budgetMin', label: 'حداقل بودجه', type: 'currency', visible: false },
    { key: 'budgetMax', label: 'حداکثر بودجه', type: 'currency', visible: false },
    { key: 'city', label: 'شهر', type: 'text', filterable: true },
    { key: 'status', label: 'وضعیت', type: 'badge', sortable: true, filterable: true },
    { key: 'verified', label: 'تأییدشده', type: 'boolean', filterable: true },
    { key: 'viewCount', label: 'بازدید', type: 'number', sortable: true, visible: false },
    { key: 'createdAt', label: 'ایجاد', type: 'date', sortable: true },
  ],

  filters: [
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' }, { value: 'CLOSED', label: 'بسته' },
    ]},
    { key: 'verified', label: 'فقط تأییدشده', type: 'boolean' },
  ],

  defaultSort: { field: 'createdAt', order: 'desc' },
  pageSize: 25, searchable: true, searchFields: ['title', 'category', 'city', 'requesterName', 'requesterPhone'],

  fields: [
    { key: 'title', label: 'عنوان درخواست', type: 'text', required: true,
      validation: { minLength: 3, maxLength: 200, message: 'عنوان درخواست باید بین ۳ تا ۲۰۰ نویسه باشد' } },
    { key: 'description', label: 'توضیحات', type: 'textarea',
      validation: { maxLength: 5000, message: 'توضیحات نباید بیش از ۵,۰۰۰ نویسه باشد' } },
    { key: 'category', label: 'دسته', type: 'text',
      validation: { maxLength: 100, message: 'دسته نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'brandPref', label: 'ترجیح برند', type: 'text',
      validation: { maxLength: 200, message: 'ترجیح برند نباید بیش از ۲۰۰ نویسه باشد' } },
    { key: 'budgetMin', label: 'حداقل بودجه', type: 'currency',
      validation: { min: 0, message: 'حداقل بودجه باید عدد نامنفی باشد' } },
    { key: 'budgetMax', label: 'حداکثر بودجه', type: 'currency',
      validation: { min: 0, message: 'حداکثر بودجه باید عدد نامنفی باشد' } },
    { key: 'city', label: 'شهر', type: 'text',
      validation: { maxLength: 100, message: 'شهر نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'province', label: 'استان', type: 'text',
      validation: { maxLength: 100, message: 'استان نباید بیش از ۱۰۰ نویسه باشد' } },
    { key: 'deadline', label: 'مهلت', type: 'text' },
    { key: 'status', label: 'وضعیت', type: 'select', options: [
      { value: 'ACTIVE', label: 'فعال' }, { value: 'CLOSED', label: 'بسته' },
    ]},
    { key: 'verified', label: 'تأییدشده', type: 'boolean' },
    { key: 'requesterName', label: 'نام درخواست‌کننده', type: 'text',
      validation: { minLength: 2, maxLength: 100, message: 'نام درخواست‌کننده باید بین ۲ تا ۱۰۰ نویسه باشد' } },
    { key: 'requesterPhone', label: 'تماس', type: 'text',
      validation: { pattern: '^0\\d{10}$', message: 'تماس باید ۱۱ رقم و با ۰ شروع شود (مثال: 09123456789)' } },
  ],

  actions: [
    { key: 'verify', label: 'تأیید', icon: 'ShieldCheck', permission: 'request.read', type: 'confirm' },
    { key: 'close', label: 'بستن', icon: 'Lock', permission: 'request.read', type: 'confirm' },
    { key: 'delete', label: 'حذف', icon: 'Trash2', permission: 'request.read', type: 'confirm', variant: 'destructive' },
  ],

  audit: { enabled: true, entityType: 'BuyRequest', actions: ['request.read'] },
};
