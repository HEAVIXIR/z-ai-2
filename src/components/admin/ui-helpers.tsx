// @ts-nocheck — HEAVIX Legacy: Owner=Migration, Scope=OldAdmin, Ticket=STEP-14.6-LEGACY
/**
 * HEAVIX Admin - shared UI helpers (formatters, badges, etc.)
 */

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';


export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'border-rose-500/40 bg-rose-500/10 text-rose-500',
  ADMIN: 'border-orange-500/40 bg-orange-500/10 text-orange-500',
  MODERATOR: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-500',
  MEMBER: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
  GUEST: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-400',
};

export function RoleBadge({ role }: { role: string | string }) {
  const r = (role as string) ?? 'MEMBER';
  return (
    <Badge variant="outline" className={cn('px-1.5 py-0 font-mono text-[10px] font-medium', ROLE_COLORS[r])}>
      {String(role).toUpperCase()}
    </Badge>
  );
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
  SUSPENDED: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
  PENDING: 'border-blue-500/40 bg-blue-500/10 text-blue-500',
  INVITED: 'border-purple-500/40 bg-purple-500/10 text-purple-500',
  DELETED: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-500',
};

export function StatusBadge({ status }: { status: string | string }) {
  const s = (status as string) ?? 'ACTIVE';
  return (
    <Badge variant="outline" className={cn('px-1.5 py-0 font-mono text-[10px] font-medium', STATUS_COLORS[s])}>
      {String(status).toUpperCase()}
    </Badge>
  );
}

export function initials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const AVATAR_GRADIENTS = [
  'from-emerald-500 to-cyan-500',
  'from-orange-500 to-rose-500',
  'from-purple-500 to-pink-500',
  'from-blue-500 to-indigo-500',
  'from-amber-500 to-yellow-500',
  'from-teal-500 to-green-500',
];

export function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
