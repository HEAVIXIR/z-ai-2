/**
 * HEAVIX Admin - lightweight data-fetching hooks.
 *
 * Uses TanStack Query for caching, refetching, and loading/error state.
 * Each hook targets one admin API endpoint and returns the standard
 * { data, isLoading, error, refetch } shape.
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const BASE = '/api/admin';

async function jsonOrThrow(res: Response) {
  const text = await res.text();
  if (!text) throw new Error(`HTTP ${res.status}: empty response`);
  try {
    const data = JSON.parse(text);
    if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.data;
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error(`HTTP ${res.status}: invalid JSON`);
    throw err;
  }
}

// ---- Overview -------------------------------------------------------------
export function useOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => fetch(`${BASE}/overview`).then(jsonOrThrow),
    refetchInterval: 30_000, // refresh every 30s for "live" feel
  });
}

// ---- Users ---------------------------------------------------------------
export type UserFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  status?: string;
  includeDeleted?: boolean;
  sort?: string;
  order?: 'asc' | 'desc';
};

export function useUsers(filters: UserFilters) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '' && v !== false) qs.set(k, String(v));
  }
  return useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: () => fetch(`${BASE}/users?${qs.toString()}`).then(jsonOrThrow),
    placeholderData: (prev) => prev, // keep previous data while fetching next page
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { email: string; name?: string; role?: string; status?: string }) =>
      fetch(`${BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Partial<{ name: string | null; role: string; status: string }>) =>
      fetch(`${BASE}/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`${BASE}/users/${id}`, { method: 'DELETE' }).then(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

// ---- Roles ---------------------------------------------------------------
export function useRoles() {
  return useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => fetch(`${BASE}/roles`).then(jsonOrThrow),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; description?: string; permissions?: string[]; color?: string }) =>
      fetch(`${BASE}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'roles'] }),
  });
}

// ---- Audit logs ----------------------------------------------------------
export type AuditLogFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  action?: string;
  resource?: string;
  status?: string;
  since?: string;
  until?: string;
};

export function useAuditLogs(filters: AuditLogFilters) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  return useQuery({
    queryKey: ['admin', 'audit-logs', filters],
    queryFn: () => fetch(`${BASE}/audit-logs?${qs.toString()}`).then(jsonOrThrow),
    placeholderData: (prev) => prev,
  });
}

// ---- Feature flags -------------------------------------------------------
export function useFeatureFlags() {
  return useQuery({
    queryKey: ['admin', 'feature-flags'],
    queryFn: () => fetch(`${BASE}/feature-flags`).then(jsonOrThrow),
  });
}

export function useCreateFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { key: string; name: string; description?: string; enabled?: boolean; audience?: string }) =>
      fetch(`${BASE}/feature-flags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feature-flags'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useUpdateFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Partial<{ name: string; description: string | null; enabled: boolean; value: string | null; audience: string }>) =>
      fetch(`${BASE}/feature-flags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feature-flags'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useDeleteFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`${BASE}/feature-flags/${id}`, { method: 'DELETE' }).then(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feature-flags'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

// ---- Settings ------------------------------------------------------------
export function useSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => fetch(`${BASE}/settings`).then(jsonOrThrow),
  });
}

export function useUpsertSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { key: string; value: string; type?: string; description?: string; isSecret?: boolean }) =>
      fetch(`${BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });
}

// ---- Health check --------------------------------------------------------
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => fetch('/api').then(jsonOrThrow),
    refetchInterval: 15_000,
  });
}
