'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Eye, EyeOff,
  Download, RefreshCw, CheckSquare, Square, MoreHorizontal, Loader2,
} from 'lucide-react';
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
  // URL-backed state
  const [searchParams, setSearchParams] = useSearchParams(config);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = React.useState(false);
  const [columnVisibility, setColumnVisibility] = React.useState<Set<string>>(
    () => new Set(config.columns.filter(c => c.visible !== false).map(c => c.key)),
  );

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

        {/* Refresh */}
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()}>
          <RefreshCw className="size-3.5" />
        </Button>

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
