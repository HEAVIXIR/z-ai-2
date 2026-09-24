'use client';

import * as React from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Clock, Globe, Mail, Pencil, Loader2, Ban, Trash2, Activity as ActivityIcon,
  CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react';
import { useUserActivity, useUpdateUser } from '@/hooks/admin/use-admin-api';
import { RoleBadge, StatusBadge, initials, avatarGradient, formatRelativeTime, formatDateTime } from './ui-helpers';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  updatedAt: string;
};

export function UserDetailDrawer({
  user,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit?: (user: User) => void;
  onDelete?: (user: User) => void;
}) {
  const { data, isLoading } = useUserActivity(user?.id ?? null, 20);
  const updateUser = useUpdateUser();
  const [suspending, setSuspending] = React.useState(false);

  async function handleSuspend() {
    if (!user) return;
    setSuspending(true);
    try {
      await updateUser.mutateAsync({ id: user.id, status: 'SUSPENDED' });
      toast.success('User suspended', { description: user.email });
    } catch (err) {
      toast.error('Failed to suspend user', { description: (err as Error).message });
    } finally {
      setSuspending(false);
    }
  }

  if (!user) return null;

  const logs = data?.logs ?? [];
  const summary = data?.summary;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle className="sr-only">User details</SheetTitle>
          <SheetDescription className="sr-only">View user details and activity timeline.</SheetDescription>

          {/* User header */}
          <div className="flex items-start gap-3">
            <div className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-base font-bold text-white',
              avatarGradient(user.email),
            )}>
              {initials(user.name, user.email)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold leading-tight">
                {user.name ?? '(no name)'}
              </h2>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Mail className="size-3" />
                <span className="truncate font-mono">{user.email}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <RoleBadge role={user.role} />
                <StatusBadge status={user.status} />
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Quick info grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border/60 bg-card/30 p-2.5">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Clock className="size-2.5" /> Last login
              </div>
              <div className="mt-0.5 font-medium">
                {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : 'never'}
              </div>
              {user.lastLoginAt && (
                <div className="mt-0.5 text-[10px] text-muted-foreground" title={formatDateTime(user.lastLoginAt)}>
                  {formatDateTime(user.lastLoginAt)}
                </div>
              )}
            </div>
            <div className="rounded-md border border-border/60 bg-card/30 p-2.5">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Globe className="size-2.5" /> Last IP
              </div>
              <div className="mt-0.5 font-mono text-xs">{user.lastLoginIp ?? '—'}</div>
            </div>
            <div className="rounded-md border border-border/60 bg-card/30 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Created</div>
              <div className="mt-0.5 font-medium">{formatRelativeTime(user.createdAt)}</div>
            </div>
            <div className="rounded-md border border-border/60 bg-card/30 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">User ID</div>
              <div className="mt-0.5 truncate font-mono text-[10px]" title={user.id}>{user.id}</div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {onEdit && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => onEdit(user)}>
                <Pencil className="size-3" /> Edit
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs text-amber-600 hover:text-amber-700"
              onClick={handleSuspend}
              disabled={suspending || user.status === 'SUSPENDED'}
            >
              {suspending ? <Loader2 className="size-3 animate-spin" /> : <Ban className="size-3" />}
              {user.status === 'SUSPENDED' ? 'Suspended' : 'Suspend'}
            </Button>
            {onDelete && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs text-rose-600 hover:text-rose-700"
                onClick={() => onDelete(user)}
              >
                <Trash2 className="size-3" /> Delete
              </Button>
            )}
          </div>

          <Separator className="my-4" />

          {/* Activity timeline */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ActivityIcon className="size-3" /> Activity timeline
              </h3>
              {summary && (
                <div className="flex items-center gap-1.5 text-[10px]">
                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 px-1 py-0 font-mono text-[9px] text-emerald-500">
                    <CheckCircle2 className="mr-0.5 size-2.5" />{summary.successes}
                  </Badge>
                  {summary.failures > 0 && (
                    <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 px-1 py-0 font-mono text-[9px] text-rose-500">
                      <XCircle className="mr-0.5 size-2.5" />{summary.failures}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                <ActivityIcon className="size-5 opacity-40" />
                <p className="text-xs">No activity recorded for this user.</p>
              </div>
            ) : (
              <ol className="relative space-y-2 border-l border-border/60 pl-4">
                {logs.map((log: {
                  id: string; action: string; status: string; createdAt: string;
                  resource: string | null; resourceId: string | null; ip: string | null;
                }, idx: number) => (
                  <li key={log.id} className="relative">
                    {/* Timeline dot */}
                    <span className={cn(
                      'absolute -left-[1.30rem] flex size-3 items-center justify-center rounded-full ring-2 ring-background',
                      log.status === 'success' ? 'bg-emerald-500' :
                      log.status === 'failure' ? 'bg-rose-500' : 'bg-amber-500',
                    )}>
                      <span className="size-1 rounded-full bg-white" />
                    </span>
                    <div className="rounded-md border border-border/40 bg-card/30 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-medium">{log.action}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground" title={formatDateTime(log.createdAt)}>
                          {formatRelativeTime(log.createdAt)}
                        </span>
                      </div>
                      {(log.resource || log.ip) && (
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          {log.resource && <span className="font-mono">{log.resource}{log.resourceId ? ` · ${log.resourceId.slice(0, 8)}` : ''}</span>}
                          {log.ip && <span className="font-mono">· {log.ip}</span>}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
