// @ts-nocheck — HEAVIX Legacy: Owner=Migration, Scope=OldAdmin, Ticket=STEP-14.6-LEGACY
'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowRight, Pencil, Trash2, Activity, History, Shield, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import type { AdminResourceConfig, AdminColumn } from '@/lib/admin/types';
import { formatRelativeTime } from '@/components/admin/ui-helpers';

/* ============================================================
   HEAVIX — STEP 08: Universal Detail Engine
   V2.2 compliant:
     Overview | Relations | Activity | Audit | Media | Actions

   Features:
   - Tabbed detail view (config.detailTabs)
   - Overview tab: all fields rendered as key-value pairs
   - Relations tab: related resources from config.relations
   - Activity tab: recent audit trail for this entity
   - Audit tab: full audit log (before/after/reason)
   - Media tab: images/documents
   - Header: title, status badge, action buttons
   - Uses Universal API for data fetching
   ============================================================ */

interface UniversalDetailProps {
  config: AdminResourceConfig;
  resourceId: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function UniversalDetail({ config, resourceId, onEdit, onDelete }: UniversalDetailProps) {
  // ── Fetch resource ───────────────────────────────────────
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-resource-detail', config.key, resourceId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/resources/${config.key}/${resourceId}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  // ── Fetch audit trail ────────────────────────────────────
  const { data: auditData } = useQuery({
    queryKey: ['admin-resource-audit', config.key, resourceId],
    queryFn: async () => {
      if (!config.audit?.enabled) return null;
      const entityType = config.audit.entityType;
      const res = await fetch(`/api/admin/audit-log?resource=${entityType}&search=${resourceId}&pageSize=20`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!config.audit?.enabled,
  });

  const item = data?.data;
  const auditLogs = auditData?.data?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <p className="text-sm">مورد یافت نشد</p>
        <Link href={config.adminPath}>
          <Button variant="ghost" size="sm" className="gap-1 text-xs">
            <ArrowRight className="size-3" /> بازگشت
          </Button>
        </Link>
      </div>
    );
  }

  // Determine which tab is default
  const tabs = config.detailTabs ?? [{ key: 'overview', label: 'مشاهده کلی', type: 'overview' as const }];
  const defaultTab = tabs[0]?.key ?? 'overview';

  // Find a title field
  const titleField = config.columns.find(c => c.type === 'text')?.key ?? 'id';
  const title = String(item[titleField] ?? item.id);

  // Find a status field
  const statusColumn = config.columns.find(c => c.type === 'badge');
  const status = statusColumn ? item[statusColumn.key] : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href={config.adminPath} className="text-xs text-muted-foreground hover:text-foreground">
              {config.titleFa}
            </Link>
            <span className="text-xs text-muted-foreground">/</span>
            <h1 className="text-lg font-bold">{title}</h1>
          </div>
          {status && (
            <Badge variant="outline" className="text-[10px]">
              {String(status).toUpperCase()}
            </Badge>
          )}
          <p className="font-mono text-[10px] text-muted-foreground">ID: {item.id}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {config.actions?.map(action => (
            <Button
              key={action.key}
              variant={action.variant === 'destructive' ? 'destructive' : 'outline'}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                if (action.type === 'confirm') {
                  if (confirm(action.confirmMessage ?? `انجام عملیات: ${action.label}?`)) {
                    // TODO: call action API
                    console.log(`Action: ${action.key}`, resourceId);
                  }
                }
                if (action.key === 'delete' && onDelete) onDelete();
              }}
            >
              <Pencil className="size-3" /> {action.label}
            </Button>
          ))}
          {onEdit && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onEdit}>
              <Pencil className="size-3" /> ویرایش
            </Button>
          )}
          {onDelete && (
            <Button variant="destructive" size="sm" className="h-8 gap-1.5 text-xs" onClick={onDelete}>
              <Trash2 className="size-3" /> حذف
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="flex flex-wrap gap-1 h-auto bg-muted/30 p-1">
          {tabs.map(tab => (
            <TabsTrigger key={tab.key} value={tab.key} className="text-xs">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview tab */}
        {tabs.find(t => t.type === 'overview') && (
          <TabsContent value={tabs.find(t => t.type === 'overview')!.key}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {config.columns.map(col => (
                <div key={col.key} className="rounded-lg border bg-card/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{col.label}</div>
                  <div className="mt-1 text-sm font-medium">
                    {renderDetailCell(col, item[col.key])}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        )}

        {/* Relations tab */}
        {tabs.find(t => t.type === 'relations') && (
          <TabsContent value={tabs.find(t => t.type === 'relations')!.key}>
            <div className="space-y-3">
              {config.relations?.map(rel => (
                <div key={rel.label} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{rel.label}</h3>
                    <Link href={`${config.adminPath}?rel=${rel.resource}&field=${rel.filterField}&value=${resourceId}`}>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                        مشاهده همه <ArrowRight className="size-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
              {(!config.relations || config.relations.length === 0) && (
                <p className="py-8 text-center text-sm text-muted-foreground">رابطه‌ای تعریف نشده</p>
              )}
            </div>
          </TabsContent>
        )}

        {/* Activity tab */}
        {tabs.find(t => t.type === 'activity') && (
          <TabsContent value={tabs.find(t => t.type === 'activity')!.key}>
            <div className="max-h-[400px] space-y-2 overflow-y-auto">
              {auditLogs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">فعالیتی ثبت نشده</p>
              ) : (
                auditLogs.map((log: Record<string, any>) => (
                  <div key={log.id as string} className="flex items-start gap-2 rounded-md border p-2 text-xs">
                    <Activity className="size-3 mt-0.5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-mono">{log.action as string}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {String(log.actorType ?? 'USER')} · {formatRelativeTime(log.createdAt as string)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        )}

        {/* Audit tab */}
        {tabs.find(t => t.type === 'audit') && (
          <TabsContent value={tabs.find(t => t.type === 'audit')!.key}>
            <div className="max-h-[500px] space-y-2 overflow-y-auto">
              {auditLogs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">ممیزی ثبت نشده</p>
              ) : (
                auditLogs.map((log: Record<string, any>) => (
                  <div key={log.id as string} className="rounded-md border p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium">{log.action as string}</span>
                      <span className="text-[10px] text-muted-foreground" title={String(log.createdAt)}>
                        {formatRelativeTime(log.createdAt as string)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Shield className="size-2.5" />
                      <span>{String(log.actorType ?? 'USER')}: {String(log.actorId ?? 'system')}</span>
                      {log.ip && <span className="font-mono">· {log.ip}</span>}
                    </div>
                    {log.reason && (
                      <p className="mt-1 text-[11px] text-foreground/70">{String(log.reason)}</p>
                    )}
                    {(log.beforeJson || log.afterJson) && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {log.beforeJson && (
                          <div className="rounded bg-rose-500/5 p-1.5 text-[10px]">
                            <span className="font-medium text-rose-500">قبل:</span>
                            <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap text-[9px] text-muted-foreground">
                              {formatJson(log.beforeJson)}
                            </pre>
                          </div>
                        )}
                        {log.afterJson && (
                          <div className="rounded bg-emerald-500/5 p-1.5 text-[10px]">
                            <span className="font-medium text-emerald-500">بعد:</span>
                            <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap text-[9px] text-muted-foreground">
                              {formatJson(log.afterJson)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        )}

        {/* Media tab */}
        {tabs.find(t => t.type === 'media') && (
          <TabsContent value={tabs.find(t => t.type === 'media')!.key}>
            <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-6">
              {config.columns.filter(c => c.type === 'image').map(col => {
                const val = item[col.key];
                return val ? (
                  <div key={col.key} className="aspect-square overflow-hidden rounded-lg border">
                    <img src={String(val)} alt="" className="size-full object-cover" />
                  </div>
                ) : null;
              })}
            </div>
            {config.columns.filter(c => c.type === 'image').every(c => !item[c.key]) && (
              <p className="py-8 text-center text-sm text-muted-foreground">رسانه‌ای موجود نیست</p>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────
function renderDetailCell(col: AdminColumn, value: unknown): React.ReactNode {
  if (value === null || value === undefined) return '—';
  switch (col.type) {
    case 'boolean': return value ? 'بله' : 'خیر';
    case 'badge': return <Badge variant="outline" className="text-[9px]">{String(value).toUpperCase()}</Badge>;
    case 'date': return new Date(value as string).toLocaleDateString('fa-IR');
    case 'currency': return <span className="font-mono">{Number(value).toLocaleString('fa-IR')} ت</span>;
    case 'number': return <span className="font-mono tabular-nums">{Number(value).toLocaleString('fa-IR')}</span>;
    default: return String(value).substring(0, 100);
  }
}

function formatJson(value: unknown): string {
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value), null, 1); } catch { return value; }
  }
  return String(value);
}
