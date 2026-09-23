'use client';

import * as React from 'react';
import { useQueryState } from '@/hooks/admin/use-query-state';
import {
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, type UserFilters } from '@/hooks/admin/use-admin-api';
import { RoleBadge, StatusBadge, initials, avatarGradient, EmptyState } from '../ui-helpers';
import { cn } from '@/lib/utils';

type User = {
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

const ROLE_OPTIONS = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'MEMBER', 'GUEST'];
const STATUS_OPTIONS = ['ACTIVE', 'SUSPENDED', 'PENDING', 'INVITED', 'DELETED'];

function UserAvatar({ name, email }: { name: string | null; email: string }) {
  return (
    <div className={cn(
      'flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white',
      avatarGradient(email),
    )}>
      {initials(name, email)}
    </div>
  );
}

function CreateUserDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState('MEMBER');
  const [status, setStatus] = React.useState('ACTIVE');
  const createUser = useCreateUser();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }
    try {
      await createUser.mutateAsync({ email: email.trim(), name: name.trim() || undefined, role, status });
      toast.success('User created', { description: `${email} created as ${role}` });
      setOpen(false);
      setEmail(''); setName(''); setRole('MEMBER'); setStatus('ACTIVE');
    } catch (err) {
      toast.error('Failed to create user', { description: (err as Error).message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create new user</DialogTitle>
          <DialogDescription>Add a new user to the HEAVIX control plane.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cu-email">Email *</Label>
            <Input id="cu-email" type="email" placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-name">Display name</Label>
            <Input id="cu-name" placeholder="(optional)" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, trigger }: { user: User; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(user.name ?? '');
  const [role, setRole] = React.useState(user.role);
  const [status, setStatus] = React.useState(user.status);
  const updateUser = useUpdateUser();

  React.useEffect(() => {
    if (open) {
      setName(user.name ?? '');
      setRole(user.role);
      setStatus(user.status);
    }
  }, [open, user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateUser.mutateAsync({ id: user.id, name: name.trim() || null, role, status });
      toast.success('User updated', { description: user.email });
      setOpen(false);
    } catch (err) {
      toast.error('Failed to update user', { description: (err as Error).message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription className="font-mono">{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="eu-name">Display name</Label>
            <Input id="eu-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={updateUser.isPending}>
              {updateUser.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({ user, trigger }: { user: User; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const deleteUser = useDeleteUser();

  async function handleDelete() {
    try {
      await deleteUser.mutateAsync(user.id);
      toast.success('User deleted (soft)', { description: user.email });
      setOpen(false);
    } catch (err) {
      toast.error('Failed to delete user', { description: (err as Error).message });
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user?</AlertDialogTitle>
          <AlertDialogDescription>
            This will soft-delete <span className="font-mono font-medium">{user.email}</span>.
            The record stays in the database (with <code>deletedAt</code>) and can be restored later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteUser.isPending}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            {deleteUser.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Delete user
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function UsersSection() {
  const [search, setSearch] = useQueryState('search', '');
  const [role, setRole] = useQueryState('role', '');
  const [status, setStatus] = useQueryState('status', '');
  const [page, setPage] = useQueryState('page', '1');
  const [sort, setSort] = useQueryState('sort', 'createdAt');
  const [order, setOrder] = useQueryState('order', 'desc');

  const filters: UserFilters = {
    page: parseInt(page, 10),
    pageSize: 10,
    search,
    role: role || undefined,
    status: status || undefined,
    sort,
    order: (order as 'asc' | 'desc') || 'desc',
  };

  const { data, isLoading, isFetching, error } = useUsers(filters);

  function toggleSort(field: string) {
    if (sort === field) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(field);
      setOrder('desc');
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm">User accounts</CardTitle>
              <CardDescription className="text-xs">
                {data?.pagination.total ?? 0} total · page {data?.pagination.page ?? 1} of {data?.pagination.totalPages ?? 1}
              </CardDescription>
            </div>
            <CreateUserDialog trigger={
              <Button size="sm" className="gap-1.5">
                <Plus className="size-3.5" /> New user
              </Button>
            } />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search email or name…"
                value={search}
                onChange={(e) => { setPage('1'); setSearch(e.target.value); }}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Select value={role || 'ALL'} onValueChange={(v) => { setPage('1'); setRole(v === 'ALL' ? '' : v); }}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All roles</SelectItem>
                {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status || 'ALL'} onValueChange={(v) => { setPage('1'); setStatus(v === 'ALL' ? '' : v); }}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {(search || role || status) && (
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => { setSearch(''); setRole(''); setStatus(''); setPage('1'); }}>
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
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">User</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('email')}>
                      Email <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">Role</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider">
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('lastLoginAt')}>
                      Last login <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                  <TableHead className="h-8 w-12 text-[11px] uppercase tracking-wider text-right">Actions</TableHead>
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
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-2"><Skeleton className="h-8 w-32" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="py-2"><Skeleton className="h-4 w-12" /></TableCell>
                    </TableRow>
                  ))
                ) : data?.items?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8">
                      <EmptyState icon={Search} title="No users found" description="Try adjusting your filters." />
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.items?.map((user: User) => (
                    <TableRow key={user.id} className="group">
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <UserAvatar name={user.name} email={user.email} />
                          <span className="text-xs font-medium">{user.name ?? '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 font-mono text-xs">{user.email}</TableCell>
                      <TableCell className="py-2"><RoleBadge role={user.role} /></TableCell>
                      <TableCell className="py-2"><StatusBadge status={user.status} /></TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'never'}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7 opacity-60 group-hover:opacity-100">
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40 text-xs">
                            <EditUserDialog user={user} trigger={
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <Pencil className="size-3.5" /> Edit
                              </DropdownMenuItem>
                            } />
                            <DropdownMenuSeparator />
                            <DeleteUserDialog user={user} trigger={
                              <DropdownMenuItem className="text-rose-500 focus:text-rose-500" onSelect={(e) => e.preventDefault()}>
                                <Trash2 className="size-3.5" /> Delete
                              </DropdownMenuItem>
                            } />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
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
                <Button
                  size="icon" variant="outline" className="size-7"
                  disabled={data.pagination.page <= 1}
                  onClick={() => setPage(String(data.pagination.page - 1))}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="px-2 font-mono text-xs">
                  {data.pagination.page} / {data.pagination.totalPages}
                </span>
                <Button
                  size="icon" variant="outline" className="size-7"
                  disabled={data.pagination.page >= data.pagination.totalPages}
                  onClick={() => setPage(String(data.pagination.page + 1))}
                >
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
