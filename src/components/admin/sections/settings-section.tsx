'use client';

import * as React from 'react';
import {
  Settings as SettingsIcon, Pencil, Loader2, Lock, Eye, Plus,
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { useSettings, useUpsertSetting } from '@/hooks/admin/use-admin-api';
import { formatRelativeTime } from '../ui-helpers';
import { cn } from '@/lib/utils';

type SettingItem = {
  id: string;
  key: string;
  value: string;
  type: string;
  description: string | null;
  isSecret: boolean;
  updatedAt: string;
};

const TYPE_OPTS = ['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'URL', 'EMAIL'];

const TYPE_COLORS: Record<string, string> = {
  STRING: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-400',
  NUMBER: 'border-blue-500/40 bg-blue-500/10 text-blue-500',
  BOOLEAN: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
  JSON: 'border-purple-500/40 bg-purple-500/10 text-purple-500',
  URL: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-500',
  EMAIL: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
};

function UpsertSettingDialog({
  setting,
  trigger,
}: {
  setting?: SettingItem;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [key, setKey] = React.useState('');
  const [value, setValue] = React.useState('');
  const [type, setType] = React.useState('STRING');
  const [description, setDescription] = React.useState('');
  const [isSecret, setIsSecret] = React.useState(false);
  const [showValue, setShowValue] = React.useState(false);
  const upsert = useUpsertSetting();

  React.useEffect(() => {
    if (open) {
      setKey(setting?.key ?? '');
      setValue(setting?.isSecret ? '' : setting?.value ?? '');
      setType(setting?.type ?? 'STRING');
      setDescription(setting?.description ?? '');
      setIsSecret(setting?.isSecret ?? false);
      setShowValue(false);
    }
  }, [open, setting]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || !value) {
      toast.error('Key and value are required');
      return;
    }
    try {
      await upsert.mutateAsync({ key: key.trim(), value, type, description: description.trim() || undefined, isSecret });
      toast.success('Setting saved', { description: key });
      setOpen(false);
    } catch (err) {
      toast.error('Failed to save setting', { description: (err as Error).message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{setting ? 'Edit setting' : 'New setting'}</DialogTitle>
          <DialogDescription>
            {setting ? <span className="font-mono">{setting.key}</span> : 'Add a new system configuration value.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="s-key">Key *</Label>
            <Input
              id="s-key"
              placeholder="site.name"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={!!setting}
              className="font-mono text-xs"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-value">
              Value {setting?.isSecret && <span className="text-[10px] text-amber-500">(enter new value to overwrite secret)</span>}
            </Label>
            <div className="flex gap-2">
              <Input
                id="s-value"
                type={isSecret && !showValue ? 'password' : 'text'}
                placeholder="…"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="font-mono text-xs"
                required
              />
              {isSecret && (
                <Button type="button" size="icon" variant="outline" onClick={() => setShowValue(!showValue)}>
                  <Eye className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Secret?</Label>
              <div className="flex h-9 items-center gap-2 rounded-md border px-3">
                <Switch checked={isSecret} onCheckedChange={setIsSecret} className="data-[state=checked]:bg-amber-500" />
                <span className="text-xs">{isSecret ? 'Yes (masked)' : 'No'}</span>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-desc">Description</Label>
            <Textarea id="s-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Save setting
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsSection() {
  const { data, isLoading, error } = useSettings();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <SettingsIcon className="size-4" /> System settings
              </CardTitle>
              <CardDescription className="text-xs">
                {data?.items?.length ?? 0} key/value pairs · secrets are masked
              </CardDescription>
            </div>
            <UpsertSettingDialog trigger={
              <Button size="sm" className="gap-1.5">
                <Plus className="size-3.5" /> New setting
              </Button>
            } />
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="py-8 text-center text-sm text-rose-500">Failed to load: {(error as Error).message}</p>
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="h-8 text-[11px] uppercase tracking-wider">Key</TableHead>
                    <TableHead className="h-8 text-[11px] uppercase tracking-wider">Value</TableHead>
                    <TableHead className="h-8 text-[11px] uppercase tracking-wider w-20">Type</TableHead>
                    <TableHead className="h-8 text-[11px] uppercase tracking-wider hidden md:table-cell">Description</TableHead>
                    <TableHead className="h-8 text-[11px] uppercase tracking-wider hidden md:table-cell w-32">Updated</TableHead>
                    <TableHead className="h-8 w-12 text-[11px] uppercase tracking-wider text-right">Edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        No settings yet. Click "New setting" to add one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.items?.map((s: SettingItem) => (
                      <TableRow key={s.id} className="font-mono text-xs">
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1.5">
                            {s.isSecret && <Lock className="size-3 text-amber-500" />}
                            <span className="font-medium">{s.key}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2 max-w-[280px] truncate" title={s.value}>
                          {s.isSecret ? (
                            <span className="text-muted-foreground/70">{s.value}</span>
                          ) : (
                            <span className="text-foreground">{s.value}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px] font-mono', TYPE_COLORS[s.type] ?? 'border-zinc-500/40 bg-zinc-500/10 text-zinc-400')}>
                            {s.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-muted-foreground hidden md:table-cell">
                          {s.description ?? '—'}
                        </TableCell>
                        <TableCell className="py-2 text-muted-foreground hidden md:table-cell" title={s.updatedAt}>
                          {formatRelativeTime(s.updatedAt)}
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          <UpsertSettingDialog setting={s} trigger={
                            <Button variant="ghost" size="icon" className="size-7">
                              <Pencil className="size-3.5" />
                            </Button>
                          } />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
