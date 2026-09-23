'use client';

import * as React from 'react';
import {
  Users as UsersIcon,
  Activity as ActivityIcon,
  ShieldOff,
  UserPlus,
  Flag as FlagIcon,
  ScrollText,
  TrendingUp,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useOverview } from '@/hooks/admin/use-admin-api';
import { formatRelativeTime, RoleBadge } from '../ui-helpers';

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  deltaPositive,
  accent,
  isLoading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  delta?: string;
  deltaPositive?: boolean;
  accent: string;
  isLoading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden border-border/60">
      <div className={cn('absolute inset-x-0 top-0 h-0.5', accent)} />
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        {isLoading ? (
          <Skeleton className="mt-2 h-8 w-20" />
        ) : (
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums tracking-tight">{value}</span>
            {delta && (
              <span className={cn('text-[11px] font-medium', deltaPositive ? 'text-emerald-500' : 'text-rose-500')}>
                {deltaPositive ? '▲' : '▼'} {delta}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniSparkline({
  data,
  color,
  unit,
  type = 'area',
}: {
  data: { t: string; v: number }[];
  color: string;
  unit?: string | null;
  type?: 'area' | 'line' | 'bar';
}) {
  const chartData = data.map((p) => ({ ...p, label: new Date(p.t).toLocaleTimeString(undefined, { hour: '2-digit' }) }));
  const gradientId = `grad-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <ResponsiveContainer width="100%" height={120}>
      {type === 'area' ? (
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 6)} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
            formatter={(v: number) => [`${v}${unit ? ' ' + unit : ''}`, 'value']}
          />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
        </AreaChart>
      ) : type === 'bar' ? (
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 6)} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
            formatter={(v: number) => [`${v}${unit ? ' ' + unit : ''}`, 'value']}
          />
          <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      ) : (
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 6)} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
            formatter={(v: number) => [`${v}${unit ? ' ' + unit : ''}`, 'value']}
          />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

const METRIC_META: Record<string, { color: string; label: string; type?: 'area' | 'line' | 'bar' }> = {
  'requests.per_min': { color: '#10b981', label: 'Requests / min', type: 'area' },
  'users.active': { color: '#06b6d4', label: 'Active users', type: 'line' },
  'db.connections': { color: '#f59e0b', label: 'DB connections', type: 'bar' },
  'response.time_ms': { color: '#ec4899', label: 'Response time (ms)', type: 'line' },
};

export function OverviewSection() {
  const { data, isLoading, error } = useOverview();

  if (error) {
    return (
      <Card className="border-rose-500/40 bg-rose-500/5">
        <CardContent className="flex items-center gap-3 p-6">
          <AlertCircle className="size-5 text-rose-500" />
          <div>
            <p className="text-sm font-medium text-rose-500">Failed to load overview</p>
            <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const users = data?.users;
  const flags = data?.featureFlags;
  const audit = data?.audit;
  const metrics = data?.metrics ?? [];

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={UsersIcon}
          label="Total users"
          value={users?.total ?? 0}
          accent="bg-emerald-500"
          delta={`+${users?.new30d ?? 0} / 30d`}
          deltaPositive
          isLoading={isLoading}
        />
        <KpiCard
          icon={ActivityIcon}
          label="Active 24h"
          value={users?.active24h ?? 0}
          accent="bg-cyan-500"
          delta={`${Math.round(((users?.active24h ?? 0) / Math.max(1, users?.total ?? 1)) * 100)}%`}
          deltaPositive
          isLoading={isLoading}
        />
        <KpiCard
          icon={ShieldOff}
          label="Suspended"
          value={users?.suspended ?? 0}
          accent="bg-amber-500"
          isLoading={isLoading}
        />
        <KpiCard
          icon={UserPlus}
          label="Pending"
          value={users?.pending ?? 0}
          accent="bg-blue-500"
          isLoading={isLoading}
        />
      </div>

      {/* Charts + Activity row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Time series charts (2/3 width) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">System metrics · last 24h</CardTitle>
                <CardDescription className="text-xs">Hourly snapshots from SystemMetric table</CardDescription>
              </div>
              <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[10px] font-mono">
                <TrendingUp className="size-3" /> live
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {metrics.map((m) => {
                  const meta = METRIC_META[m.metric] ?? { color: '#94a3b8', label: m.metric, type: 'area' as const };
                  return (
                    <div key={m.metric} className="rounded-lg border border-border/60 bg-card/50 p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-muted-foreground">{meta.label}</span>
                        {m.unit && <span className="font-mono text-[10px] text-muted-foreground/70">{m.unit}</span>}
                      </div>
                      <MiniSparkline data={m.points} color={meta.color} unit={m.unit} type={meta.type} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity (1/3 width) */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Recent activity</CardTitle>
                <CardDescription className="text-xs">Last 10 admin actions</CardDescription>
              </div>
              <ScrollTextIcon className="size-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
                {audit?.recent?.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">No recent activity</p>
                )}
                {audit?.recent?.map((log: { id: string; action: string; status: string; createdAt: string; actorEmail: string | null; actor?: { email?: string; name?: string | null } | null }) => (
                  <div key={log.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                    <div className={cn('mt-1 size-1.5 shrink-0 rounded-full',
                      log.status === 'success' ? 'bg-emerald-500' : log.status === 'failure' ? 'bg-rose-500' : 'bg-amber-500')} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11px] font-medium">{log.action}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {log.actor?.email ?? log.actorEmail ?? 'system'} · {formatRelativeTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Role breakdown + Feature flags summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Users by role</CardTitle>
            <CardDescription className="text-xs">Distribution across RBAC roles</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(users?.byRole ?? {}).map(([role, count]) => {
                  const total = users?.total || 1;
                  const pct = Math.round(((count as number) / total) * 100);
                  return (
                    <div key={role} className="flex items-center gap-2">
                      <RoleBadge role={role} />
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 text-right font-mono text-[11px] tabular-nums">{count as number}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Users by status</CardTitle>
            <CardDescription className="text-xs">Lifecycle state distribution</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(users?.byStatus ?? {}).map(([status, count]) => {
                  const total = users?.total || 1;
                  const pct = Math.round(((count as number) / total) * 100);
                  return (
                    <div key={status} className="flex items-center gap-2 text-xs">
                      <span className="w-20 font-mono text-[10px] uppercase text-muted-foreground">{status}</span>
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-cyan-500/70" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 text-right font-mono tabular-nums">{count as number}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Feature flags</CardTitle>
            <CardDescription className="text-xs">
              {flags?.enabled ?? 0} of {flags?.total ?? 0} enabled
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {isLoading ? (
              <Skeleton className="h-20" />
            ) : (
              <div className="flex items-center gap-4">
                <div className="relative flex size-20 items-center justify-center">
                  <svg className="size-20 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
                    <circle
                      cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
                      className="text-emerald-500"
                      strokeDasharray={`${((flags?.enabled ?? 0) / Math.max(1, flags?.total ?? 1)) * 97.4} 97.4`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-lg font-bold tabular-nums">{flags?.enabled ?? 0}</span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">on</span>
                  </div>
                </div>
                <div className="flex-1 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Enabled</span>
                    <span className="font-mono text-emerald-500">{flags?.enabled ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Disabled</span>
                    <span className="font-mono text-amber-500">{(flags?.total ?? 0) - (flags?.enabled ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-1">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-mono font-medium">{flags?.total ?? 0}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Audit by status (last 7d) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Audit log activity · last 7 days</CardTitle>
          <CardDescription className="text-xs">Outcome distribution by status</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {isLoading ? (
            <Skeleton className="h-12" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(audit?.byStatus7d ?? {}).map(([status, count]) => (
                <Badge key={status} variant="outline" className={cn(
                  'px-2 py-0.5 text-[11px] font-mono',
                  status === 'success' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' :
                  status === 'failure' ? 'border-rose-500/40 bg-rose-500/10 text-rose-500' :
                  'border-amber-500/40 bg-amber-500/10 text-amber-500',
                )}>
                  {status.toUpperCase()} · {count as number}
                </Badge>
              ))}
              {Object.keys(audit?.byStatus7d ?? {}).length === 0 && (
                <p className="text-xs text-muted-foreground">No audit events in last 7 days</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Loading live data from PostgreSQL…
        </div>
      )}
    </div>
  );
}

// small inline icon to avoid extra imports
function ScrollTextIcon({ className }: { className?: string }) {
  return <ScrollText className={className} />;
}
