// @ts-nocheck — HEAVIX Legacy: Owner=Migration, Scope=OldAdmin, Ticket=STEP-14.6-LEGACY
'use client';

import * as React from 'react';
import { useQueryState } from '@/hooks/admin/use-query-state';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Area, AreaChart, defs,
} from 'recharts';
import {
  Activity, ArrowDown, ArrowUp, Gauge, Loader2, TrendingDown, TrendingUp, Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMetrics, type MetricsRange } from '@/hooks/admin/use-admin-api';
import { cn } from '@/lib/utils';

const METRICS = [
  { key: 'requests.per_min', label: 'Requests / min', color: '#10b981', unit: 'req/min', desc: 'Incoming HTTP requests per minute' },
  { key: 'users.active', label: 'Active users', color: '#06b6d4', unit: 'users', desc: 'Concurrent active user sessions' },
  { key: 'db.connections', label: 'DB connections', color: '#f59e0b', unit: 'conns', desc: 'PostgreSQL connection pool usage' },
  { key: 'response.time_ms', label: 'Response time', color: '#ec4899', unit: 'ms', desc: 'Average HTTP response latency' },
];

const RANGES: { key: MetricsRange; label: string }[] = [
  { key: '1h', label: '1H' },
  { key: '6h', label: '6H' },
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
];

function StatCard({
  icon: Icon, label, value, delta, accent, isLoading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  delta?: string;
  accent: string;
  isLoading?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border/60 bg-card/50 p-3">
      <div className={cn('absolute inset-x-0 top-0 h-0.5', accent)} />
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      {isLoading ? (
        <Skeleton className="mt-1 h-6 w-20" />
      ) : (
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-lg font-bold tabular-nums tracking-tight">{value}</span>
          {delta && <span className="text-[10px] text-muted-foreground">{delta}</span>}
        </div>
      )}
    </div>
  );
}

export function MetricsSection() {
  const [metricKey, setMetricKey] = useQueryState('metric', 'requests.per_min');
  const [range, setRange] = useQueryState('mrange', '24h');

  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const { data, isLoading, error } = useMetrics(metric.key, range as MetricsRange);

  const points = data?.points ?? [];
  const stats = data?.stats;
  const chartData = points.map((p: { t: string; v: number }) => ({
    ...p,
    label: new Date(p.t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: '2-digit' }),
  }));

  const changePositive = (stats?.change ?? 0) >= 0;
  // For response.time_ms, lower is better → "positive" change is actually negative
  const isInverseMetric = metric.key === 'response.time_ms';
  const trendGood = isInverseMetric ? !changePositive : changePositive;

  return (
    <div className="space-y-4">
      {/* Header card with controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="size-4" /> System metrics explorer
              </CardTitle>
              <CardDescription className="text-xs">
                {metric.desc} · {stats?.count ?? 0} data points · auto-refreshes every 30s
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Metric selector */}
              <div className="flex flex-wrap gap-1 rounded-md border border-border/60 bg-muted/30 p-0.5">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetricKey(m.key)}
                    className={cn(
                      'rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
                      metric.key === m.key
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {/* Range selector */}
              <div className="flex gap-0.5 rounded-md border border-border/60 bg-muted/30 p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    className={cn(
                      'rounded px-2 py-1 font-mono text-[10px] font-medium transition-colors',
                      range === r.key
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={Gauge}
          label="Current"
          value={stats ? `${stats.current}${metric.unit ? ' ' + metric.unit : ''}` : '—'}
          accent="bg-cyan-500"
          isLoading={isLoading}
        />
        <StatCard
          icon={TrendingUp}
          label="Average"
          value={stats ? `${stats.avg}${metric.unit ? ' ' + metric.unit : ''}` : '—'}
          accent="bg-emerald-500"
          isLoading={isLoading}
        />
        <StatCard
          icon={ArrowUp}
          label="Max"
          value={stats ? `${stats.max}${metric.unit ? ' ' + metric.unit : ''}` : '—'}
          accent="bg-rose-500"
          isLoading={isLoading}
        />
        <StatCard
          icon={ArrowDown}
          label="Min"
          value={stats ? `${stats.min}${metric.unit ? ' ' + metric.unit : ''}` : '—'}
          accent="bg-amber-500"
          isLoading={isLoading}
        />
      </div>

      {/* Main chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">{metric.label} · last {range}</CardTitle>
              <CardDescription className="text-xs">
                {stats?.count ?? 0} samples · {points.length > 0 ? `${points.length} rendered` : 'no data'}
              </CardDescription>
            </div>
            {stats && (
              <Badge
                variant="outline"
                className={cn(
                  'gap-1 px-2 py-0.5 text-[10px] font-mono',
                  trendGood
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-500',
                )}
              >
                {trendGood ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {stats.changePct > 0 ? '+' : ''}{stats.changePct}% ({stats.change > 0 ? '+' : ''}{stats.change})
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {error ? (
            <div className="flex h-64 items-center justify-center text-sm text-rose-500">
              <Gauge className="mr-2 size-4" /> Failed to load: {(error as Error).message}
            </div>
          ) : isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : points.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Zap className="size-6 opacity-40" />
              <p className="text-sm">No data points for this metric in the selected range</p>
              <p className="text-xs">Try a different time range or metric.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={metric.color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={metric.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                <XAxis
                  dataKey="label"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.max(1, Math.floor(chartData.length / 8))}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  formatter={(v: number) => [`${v}${metric.unit ? ' ' + metric.unit : ''}`, metric.label]}
                />
                <ReferenceLine y={stats?.avg} stroke={metric.color} strokeDasharray="4 4" strokeOpacity={0.4} />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={metric.color}
                  strokeWidth={2}
                  fill="url(#metricGradient)"
                  dot={false}
                  isAnimationActive
                  animationDuration={400}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Sparkline grid (all metrics at a glance) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">All metrics at a glance</CardTitle>
          <CardDescription className="text-xs">Click any to expand in the chart above</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetricKey(m.key)}
                className={cn(
                  'group rounded-lg border p-3 text-left transition-all hover:shadow-sm',
                  metric.key === m.key
                    ? 'border-border bg-card'
                    : 'border-border/40 bg-card/30 hover:border-border/80',
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium">{m.label}</span>
                  {metric.key === m.key && <span className="size-1.5 rounded-full bg-primary" />}
                </div>
                {/* Tiny sparkline */}
                {isLoading && metric.key === m.key ? (
                  <Skeleton className="h-16" />
                ) : (
                  <ResponsiveContainer width="100%" height={60}>
                    <AreaChart
                      data={metric.key === m.key ? chartData : []}
                      margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
                    >
                      <defs>
                        <linearGradient id={`spark-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={m.color} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={m.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke={m.color}
                        strokeWidth={1.5}
                        fill={`url(#spark-${m.key})`}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
                {metric.key !== m.key && (
                  <p className="mt-1 text-[10px] text-muted-foreground">Click to load</p>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Loading live metrics from PostgreSQL…
        </div>
      )}
    </div>
  );
}
