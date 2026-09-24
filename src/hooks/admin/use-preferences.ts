'use client';

/**
 * HEAVIX — STEP 10: Admin Preferences Hook
 *
 * Client-side hook for managing user preferences:
 * - Theme, density, locale, timezone
 * - Sidebar collapsed state
 * - Pinned/hidden navigation items
 * - Dashboard layout
 * - Default page size
 *
 * Uses TanStack Query for caching + auto-sync with the API.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface AdminPreferences {
  id: string;
  userId: string;
  theme: string;
  density: string;
  locale: string;
  timezone: string;
  sidebarCollapsed: boolean;
  pinnedItems: string[] | null;
  hiddenItems: string[] | null;
  dashboardLayout: DashboardLayoutItem[] | null;
  defaultPageSize: number;
}

export interface DashboardLayoutItem {
  widgetKey: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

const DEFAULTS: Partial<AdminPreferences> = {
  theme: 'dark',
  density: 'comfortable',
  locale: 'fa',
  timezone: 'Asia/Tehran',
  sidebarCollapsed: false,
  defaultPageSize: 25,
};

export function usePreferences() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-preferences'],
    queryFn: async () => {
      const res = await fetch('/api/admin/preferences', { credentials: 'include' });
      if (!res.ok) return DEFAULTS;
      const json = await res.json();
      return json.data as AdminPreferences;
    },
  });

  const update = useMutation({
    mutationFn: async (updates: Partial<AdminPreferences>) => {
      const res = await fetch('/api/admin/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to update preferences');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-preferences'] });
    },
  });

  const prefs = { ...DEFAULTS, ...data } as AdminPreferences;

  return {
    prefs,
    isLoading,
    update: (updates: Partial<AdminPreferences>) => update.mutate(updates),
    isUpdating: update.isPending,
  };
}
