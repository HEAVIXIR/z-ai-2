'use client';

import * as React from 'react';
import {
  Plus, Flag, Loader2, MoreHorizontal, Pencil, Trash2, Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useFeatureFlags, useCreateFlag, useUpdateFlag, useDeleteFlag } from '@/hooks/admin/use-admin-api';
import { cn } from '@/lib/utils';

type FlagItem = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  value: string | null;
  audience: string;
  updatedAt: string;
  createdAt: string;
};

const AUDIENCES = ['all', 'admins', 'internal'];

function FlagToggle({ flag }: { flag: FlagItem }) {
  const updateFlag = useUpdateFlag();
  const [checked, setChecked] = React.useState(flag.enabled);
  React.useEffect(() => setChecked(flag.enabled), [flag.enabled]);

  async function onToggle(v: boolean) {
    setChecked(v); // optimistic
    try {
      await updateFlag.mutateAsync({ id: flag.id, enabled: v });
      toast.success(`Flag ${v ? 'enabled' : 'disabled'}`, { description: flag.key });
    } catch (err) {
      setChecked(!v); // revert
      toast.error('Failed to toggle flag', { description: (err as Error).message });
    }
  }

  return (
    <Switch
      checked={checked}
      onCheckedChange={onToggle}
      disabled={updateFlag.isPending}
      className={cn('data-[state=checked]:bg-emerald-500')}
    />
  );
}

function CreateFlagDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [key, setKey] = React.useState('');
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [enabled, setEnabled] = React.useState(false);
  const [audience, setAudience] = React.useState('all');
  const createFlag = useCreateFlag();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || !name.trim()) {
      toast.error('Key and name are required');
      return;
    }
    try {
      await createFlag.mutateAsync({ key: key.trim(), name: name.trim(), description: description.trim() || undefined, enabled, audience });
      toast.success('Flag created', { description: key });
      setOpen(false);
      setKey(''); setName(''); setDescription(''); setEnabled(false); setAudience('all');
    } catch (err) {
      toast.error('Failed to create flag', { description: (err as Error).message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create feature flag</DialogTitle>
          <DialogDescription>Runtime toggle for a specific feature.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cf-key">Key *</Label>
            <Input id="cf-key" placeholder="new_dashboard_v2" value={key} onChange={(e) => setKey(e.target.value)} className="font-mono text-xs" required />
            <p className="text-[10px] text-muted-foreground">lowercase, [a-z0-9_.-]</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-name">Name *</Label>
            <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-desc">Description</Label>
            <Textarea id="cf-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Default state</Label>
              <div className="flex h-9 items-center gap-2 rounded-md border px-3">
                <Switch checked={enabled} onCheckedChange={setEnabled} className="data-[state=checked]:bg-emerald-500" />
                <span className="text-xs">{enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createFlag.isPending}>
              {createFlag.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              Create flag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditFlagDialog({ flag, trigger }: { flag: FlagItem; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(flag.name);
  const [description, setDescription] = React.useState(flag.description ?? '');
  const [audience, setAudience] = React.useState(flag.audience);
  const [value, setValue] = React.useState(flag.value ?? '');
  const updateFlag = useUpdateFlag();

  React.useEffect(() => {
    if (open) {
      setName(flag.name);
      setDescription(flag.description ?? '');
      setAudience(flag.audience);
      setValue(flag.value ?? '');
    }
  }, [open, flag]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateFlag.mutateAsync({
        id: flag.id,
        name,
        description: description || null,
        audience,
        value: value || null,
      });
      toast.success('Flag updated', { description: flag.key });
      setOpen(false);
    } catch (err) {
      toast.error('Failed to update flag', { description: (err as Error).message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit flag</DialogTitle>
          <DialogDescription className="font-mono">{flag.key}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ef-name">Name</Label>
            <Input id="ef-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ef-desc">Description</Label>
            <Textarea id="ef-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ef-value">Variant value</Label>
              <Input id="ef-value" placeholder="(optional)" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={updateFlag.isPending}>
              {updateFlag.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteFlagDialog({ flag, trigger }: { flag: FlagItem; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const deleteFlag = useDeleteFlag();

  async function handleDelete() {
    try {
      await deleteFlag.mutateAsync(flag.id);
      toast.success('Flag deleted', { description: flag.key });
      setOpen(false);
    } catch (err) {
      toast.error('Failed to delete flag', { description: (err as Error).message });
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete feature flag?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes <span className="font-mono font-medium">{flag.key}</span>.
            Any code depending on this flag will see its default (off) state.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteFlag.isPending}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            {deleteFlag.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Delete flag
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function FeatureFlagsSection() {
  const { data, isLoading, error } = useFeatureFlags();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Flag className="size-4" /> Feature flags
              </CardTitle>
              <CardDescription className="text-xs">
                {data?.items?.length ?? 0} total · {data?.items?.filter((f: FlagItem) => f.enabled).length ?? 0} enabled
              </CardDescription>
            </div>
            <CreateFlagDialog trigger={
              <Button size="sm" className="gap-1.5">
                <Plus className="size-3.5" /> New flag
              </Button>
            } />
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="py-8 text-center text-sm text-rose-500">Failed to load: {(error as Error).message}</p>
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {data?.items?.map((flag: FlagItem) => (
                <div
                  key={flag.id}
                  className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 p-3 transition-colors hover:border-border"
                >
                  <div className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-md',
                    flag.enabled ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground',
                  )}>
                    {flag.enabled ? <Sparkles className="size-4" /> : <Flag className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{flag.key}</span>
                      <Badge variant="outline" className="px-1 py-0 text-[9px] font-mono">
                        {flag.audience}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {flag.name}{flag.description ? ' · ' + flag.description : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[10px] font-mono', flag.enabled ? 'text-emerald-500' : 'text-muted-foreground')}>
                      {flag.enabled ? 'ON' : 'OFF'}
                    </span>
                    <FlagToggle flag={flag} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7 opacity-60 group-hover:opacity-100">
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36 text-xs">
                        <EditFlagDialog flag={flag} trigger={
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                            <Pencil className="size-3.5" /> Edit
                          </DropdownMenuItem>
                        } />
                        <DropdownMenuSeparator />
                        <DeleteFlagDialog flag={flag} trigger={
                          <DropdownMenuItem className="text-rose-500 focus:text-rose-500" onSelect={(e) => e.preventDefault()}>
                            <Trash2 className="size-3.5" /> Delete
                          </DropdownMenuItem>
                        } />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
