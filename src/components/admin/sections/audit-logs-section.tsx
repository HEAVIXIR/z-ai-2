'use client';

import * as React from 'react';
import { useQueryState } from '@/hooks/admin/use-query-state';
import {
  Search, ScrollText, Loader2, ChevronLeft, ChevronRight, Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuditLogs, type AuditLogFilters } from '@/hooks/admin/use-admin-api';
import { formatRelativeTime, formatDateTime, EmptyState } from '../ui-helpers';
import { cn } from '@/lib/utils';

const ACTION_PREFIXES = [
  'user.create', 'user.update', 'user.delete', 'user.suspend', 'user.invite',
  'role.create', 'role.update',
  'feature_flag.create', 'feature_flag.update', 'feature_flag.toggle', 'feature_flag.delete',
  'setting.update', 'setting.upsert',
  'login.success', 'login.failure',
  'session.revoke',
];

const STATUS_OPTS = ['success', 'failure', 'warning'];

export function AuditLogsSection() {
  const [search, setSearch] = useQueryState('search', '');
  const [action, setAction] = useQueryState('action', '');
  const [status, setStatus] = useQueryState('astatus', '');
  const [page, setPage] = useQueryState('apage', '1');

  const filters: AuditLogFilters = {
    page: parseInt(page, 10),
    pageSize: 25,
    search,
    action: action || undefined,
    status: status || undefined,
  };

  const { data, isLoading, isFetching, error } = useAuditLogs(filters);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <ScrollText className="size-4" /> Audit log
            </CardTitle>
            <CardDescription className="text-xs">
              {data?.pagination.total ?? 0} events · page {data?.pagination.page ?? 1} of {data?.pagination.totalPages ?? 1} · append-only
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search action, email, resource ID…"
                value={search}
                onChange={(e) => { setPage('1'); setSearch(e.target.value); }}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Select value={action || 'ALL'} onValueChange={(v) => { setPage('1'); setAction(v === 'ALL' ? '' : v); }}>
              <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All actions</SelectItem>
                {ACTION_PREFIXES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status || 'ALL'} onValueChange={(v) => { setPage('1'); setStatus(v === 'ALL' ? '' : v); }}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {STATUS_OPTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {(search || action || status) && (
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => { setSearch(''); setAction(''); setStatus(''); setPage('1'); }}>
                <Filter className="size-3" /> Clear
              </Button>
            )}
            {isFetching && !isLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider w-32">Time</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">Actor</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">Action</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">Resource</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {error ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-rose-500">
                      Failed to load: {(error as Error).message}
                    </TableCell>
                  </TableRow>
                ) : isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-2"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : data?.items?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8">
                      <EmptyState icon={ScrollText} title="No audit events" description="Try adjusting your filters or check back later." />
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.items?.map((log: {
                    id: string; actorEmail: string | null; action: string;
                    resource: string | null; resourceId: string | null;
                    ip: string | null; status: string; createdAt: string;
                    actor?: { email?: string; name?: string | null } | null;
                  }) => (
                    <TableRow key={log.id} className="font-mono text-xs">
                      <TableCell className="py-2 text-muted-foreground" title={formatDateTime(log.createdAt)}>
                        {formatRelativeTime(log.createdAt)}
                      </TableCell>
                      <TableCell className="py-2">{log.actor?.email ?? log.actorEmail ?? 'system'}</TableCell>
                      <TableCell className="py-2 font-medium">{log.action}</TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {log.resource ? <span>{log.resource}{log.resourceId ? <span className="text-muted-foreground/70"> · {log.resourceId.slice(0, 12)}</span> : null}</span> : '—'}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className={cn(
                          'px-1.5 py-0 text-[10px] font-mono',
                          log.status === 'success' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' :
                          log.status === 'failure' ? 'border-rose-500/40 bg-rose-500/10 text-rose-500' :
                          'border-amber-500/40 bg-amber-500/10 text-amber-500',
                        )}>
                          {log.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground/80">{log.ip ?? '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Showing {(data.pagination.page - 1) * data.pagination.pageSize + 1}–
                {Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)} of {data.pagination.total}
              </span>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="size-7" disabled={data.pagination.page <= 1} onClick={() => setPage(String(data.pagination.page - 1))}>
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="px-2 font-mono">{data.pagination.page} / {data.pagination.totalPages}</span>
                <Button size="icon" variant="outline" className="size-7" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => setPage(String(data.pagination.page + 1))}>
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
