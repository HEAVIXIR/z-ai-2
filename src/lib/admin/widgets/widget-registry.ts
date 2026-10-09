/**
 * HEAVIX — STEP 11: Widget Registry
 *
 * STEP 11.6 STATUS: ASPIRATIONAL / NOT YET WIRED.
 *
 * This file declares `WIDGET_TYPES` (a design contract for the future
 * Dashboard Builder) but is NOT imported by any runtime code. The actual
 * dashboard at src/app/admin/dashboard/page.tsx is HARDCODED with inline
 * `db.*` calls (19 of them) and does NOT consume this registry.
 *
 * Verified via grep: `widgets/widget-registry` returns 0 matches in src/
 * outside this file. `dashboardLayout` (AdminPreference field that would
 * store the user's widget grid) is WRITTEN via the preferences API but
 * NEVER READ by any renderer.
 *
 * This file is KEPT (not deleted) because:
 *   1. It documents the intended widget taxonomy (9 widgets, permissions,
 *      data sources, refresh intervals) — useful design contract for
 *      the future Dashboard Builder implementation.
 *   2. Removing it would lose the design intent; the codebase would
 *      have to re-derive the widget list when the Dashboard Builder
 *      is implemented (STEP 11+ follow-up, see ADR-004 §F.1).
 *
 * WHEN THE DASHBOARD BUILDER IS IMPLEMENTED:
 *   - The dashboard page should import `listWidgetTypes()` to render
 *     the widget picker.
 *   - The dashboard page should read `usePreferences().dashboardLayout`
 *     to render the user's saved grid.
 *   - The widget grid component should call each widget's
 *     `dataSource.apiPath` to fetch data + apply `permission` filtering.
 *
 * Defines dashboard widget types. Each widget has:
 *   - key: unique identifier
 *   - label: display name
 *   - icon: lucide-react name
 *   - dataSource: where the data comes from (NOT arbitrary SQL — registry-defined)
 *   - defaultSize: { w, h } in grid units
 *   - permission: required permission to see this widget
 *
 * The dashboard layout is stored in AdminPreference.dashboardLayout (JSON).
 * Layout format: [{ widgetKey, x, y, w, h, visible }]
 */

import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, TrendingUp, Activity, AlertTriangle,
  Package, ShoppingCart, Users, DollarSign,
  Activity as ActivityIcon, ShieldCheck, Cpu, BarChart3,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────
export interface WidgetType {
  key: string;
  labelFa: string;
  labelEn: string;
  icon: LucideIcon;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  maxSize?: { w: number; h: number };
  permission?: string;
  dataSource: WidgetDataSource;
  description?: string;
}

export interface WidgetDataSource {
  /** API path to fetch widget data (relative) */
  apiPath: string;
  /** Refresh interval in milliseconds (0 = no auto-refresh) */
  refreshInterval?: number;
  /** Whether this widget needs real-time updates */
  realtime?: boolean;
}

// ── Widget types ───────────────────────────────────────────
export const WIDGET_TYPES: WidgetType[] = [
  {
    key: 'kpi-listings',
    labelFa: 'آمار آگهی‌ها',
    labelEn: 'Listings KPI',
    icon: Package,
    defaultSize: { w: 3, h: 1 },
    minSize: { w: 2, h: 1 },
    maxSize: { w: 6, h: 2 },
    permission: 'listing.read',
    dataSource: { apiPath: '/api/admin/resources/listings?pageSize=1', refreshInterval: 30000 },
    description: 'تعداد کل آگهی‌ها، منتشرشده، در انتظار',
  },
  {
    key: 'kpi-users',
    labelFa: 'آمار کاربران',
    labelEn: 'Users KPI',
    icon: Users,
    defaultSize: { w: 3, h: 1 },
    minSize: { w: 2, h: 1 },
    maxSize: { w: 6, h: 2 },
    permission: 'user.read',
    dataSource: { apiPath: '/api/admin/resources/users?pageSize=1', refreshInterval: 60000 },
    description: 'تعداد کل کاربران، فعال، معلق',
  },
  {
    key: 'kpi-revenue',
    labelFa: 'درآمد',
    labelEn: 'Revenue',
    icon: DollarSign,
    defaultSize: { w: 3, h: 1 },
    minSize: { w: 2, h: 1 },
    permission: 'payment.read',
    dataSource: { apiPath: '/api/admin/resources/payments?pageSize=1', refreshInterval: 60000 },
    description: 'مجموع پرداخت‌ها و تراکنش‌ها',
  },
  {
    key: 'kpi-orders',
    labelFa: 'سفارش‌ها',
    labelEn: 'Orders',
    icon: ShoppingCart,
    defaultSize: { w: 3, h: 1 },
    minSize: { w: 2, h: 1 },
    permission: 'order.read',
    dataSource: { apiPath: '/api/admin/resources/orders?pageSize=1', refreshInterval: 30000 },
    description: 'تعداد سفارش‌های فعال و تکمیل‌شده',
  },
  {
    key: 'recent-activity',
    labelFa: 'فعالیت اخیر',
    labelEn: 'Recent Activity',
    icon: ActivityIcon,
    defaultSize: { w: 6, h: 2 },
    minSize: { w: 4, h: 1 },
    permission: 'audit.read',
    dataSource: { apiPath: '/api/admin/audit-log?pageSize=10', refreshInterval: 15000 },
    description: 'آخرین فعالیت‌های ادمین و سیستم',
  },
  {
    key: 'alerts',
    labelFa: 'هشدارها',
    labelEn: 'Alerts',
    icon: AlertTriangle,
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
    permission: 'admin.dashboard.read',
    dataSource: { apiPath: '/api/admin/navigation', refreshInterval: 0 },
    description: 'هشدارهای سیستم و مدیریتی',
  },
  {
    key: 'system-health',
    labelFa: 'سلامت سیستم',
    labelEn: 'System Health',
    icon: Cpu,
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 1 },
    permission: 'system.read',
    dataSource: { apiPath: '/api', refreshInterval: 5000 },
    description: 'وضعیت دیتابیس، حافظه، و API',
  },
  {
    key: 'pending-reviews',
    labelFa: 'در انتظار بررسی',
    labelEn: 'Pending Reviews',
    icon: BarChart3,
    defaultSize: { w: 6, h: 2 },
    minSize: { w: 4, h: 1 },
    permission: 'listing.moderate',
    dataSource: { apiPath: '/api/admin/resources/listings?filter.status=DRAFT&pageSize=5', refreshInterval: 30000 },
    description: 'آگهی‌های در انتظار بررسی و انتشار',
  },
  {
    key: 'trust-score',
    labelFa: 'امتیاز اعتماد',
    labelEn: 'Trust Score',
    icon: ShieldCheck,
    defaultSize: { w: 3, h: 1 },
    minSize: { w: 2, h: 1 },
    permission: 'admin.dashboard.read',
    dataSource: { apiPath: '/api/admin/navigation', refreshInterval: 0 },
    description: 'میانگین امتیاز اعتماد آگهی‌ها',
  },
];

// ── Registry helpers ───────────────────────────────────────
const widgetMap = new Map<string, WidgetType>();
for (const w of WIDGET_TYPES) widgetMap.set(w.key, w);

export function getWidgetType(key: string): WidgetType | undefined {
  return widgetMap.get(key);
}

export function listWidgetTypes(): WidgetType[] {
  return WIDGET_TYPES;
}
