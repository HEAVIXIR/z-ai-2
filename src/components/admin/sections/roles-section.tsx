'use client';

import * as React from 'react';
import { Plus, ShieldCheck, Loader2, Users as UsersIcon, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useRoles, useCreateRole } from '@/hooks/admin/use-admin-api';
import { cn } from '@/lib/utils';

type Role = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  color: string | null;
  memberCount: number;
  createdAt: string;
};

function CreateRoleDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [perms, setPerms] = React.useState('users.read\nusers.write');
  const [color, setColor] = React.useState('#10b981');
  const createRole = useCreateRole();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    const permissions = perms.split('\n').map((p) => p.trim()).filter(Boolean);
    try {
      await createRole.mutateAsync({ name: name.trim(), description: description.trim() || undefined, permissions, color });
      toast.success('Role created', { description: `${name} with ${permissions.length} permission(s)` });
      setOpen(false);
      setName(''); setDescription(''); setPerms('users.read\nusers.write'); setColor('#10b981');
    } catch (err) {
      toast.error('Failed to create role', { description: (err as Error).message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create custom role</DialogTitle>
          <DialogDescription>Define a new RBAC role with specific permissions.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cr-name">Name *</Label>
            <Input id="cr-name" placeholder="e.g. content_editor" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-desc">Description</Label>
            <Input id="cr-desc" placeholder="What can this role do?" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-perms">Permissions (one per line)</Label>
            <Textarea
              id="cr-perms"
              rows={5}
              placeholder={'users.read\nusers.write\nsettings.read'}
              value={perms}
              onChange={(e) => setPerms(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-color">Color</Label>
            <div className="flex items-center gap-2">
              <Input id="cr-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-16 p-1" />
              <span className="font-mono text-xs text-muted-foreground">{color}</span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createRole.isPending}>
              {createRole.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              Create role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RolesSection() {
  const { data, isLoading, error } = useRoles();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="size-4" /> Roles & permissions
              </CardTitle>
              <CardDescription className="text-xs">
                {data?.items?.length ?? 0} role(s) · system roles cannot be deleted
              </CardDescription>
            </div>
            <CreateRoleDialog trigger={
              <Button size="sm" className="gap-1.5">
                <Plus className="size-3.5" /> New role
              </Button>
            } />
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="py-8 text-center text-sm text-rose-500">Failed to load: {(error as Error).message}</p>
          ) : isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {data?.items?.map((role: Role) => (
                <div
                  key={role.id}
                  className="group relative flex flex-col gap-2 rounded-lg border border-border/60 bg-card/50 p-4 transition-colors hover:border-border"
                >
                  <div className="absolute inset-x-0 top-0 h-1 rounded-t-lg" style={{ backgroundColor: role.color ?? '#71717a' }} />
                  <div className="flex items-start justify-between gap-2 pt-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-medium">{role.name}</span>
                        {role.isSystem && (
                          <Badge variant="outline" className="px-1 py-0 text-[9px] font-mono">
                            <Lock className="mr-0.5 size-2.5" /> SYSTEM
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{role.description ?? '—'}</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-[10px]">
                      <UsersIcon className="size-2.5 text-muted-foreground" />
                      <span className="font-mono tabular-nums">{role.memberCount}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.length === 0 ? (
                      <span className="text-[10px] text-muted-foreground">no permissions</span>
                    ) : role.permissions[0] === '*' ? (
                      <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] text-rose-500 border-rose-500/40 bg-rose-500/10">
                        * (all)
                      </Badge>
                    ) : (
                      role.permissions.slice(0, 6).map((p) => (
                        <Badge key={p} variant="outline" className="px-1.5 py-0 font-mono text-[9px] font-normal">
                          {p}
                        </Badge>
                      ))
                    )}
                    {role.permissions.length > 6 && (
                      <span className="text-[10px] text-muted-foreground">+{role.permissions.length - 6}</span>
                    )}
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
