'use client';

import * as React from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  ScrollText,
  Flag,
  Settings as SettingsIcon,
  Activity,
  Search,
  Plus,
  ToggleLeft,
  Database,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type CommandAction = {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  keywords?: string[];
  run: () => void;
};

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (section: string) => void;
  actions?: CommandAction[];
};

const SECTIONS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, desc: 'System dashboard & live metrics' },
  { key: 'users', label: 'Users', icon: Users, desc: 'Manage user accounts & access' },
  { key: 'roles', label: 'Roles', icon: ShieldCheck, desc: 'RBAC: roles & permissions' },
  { key: 'audit-logs', label: 'Audit Logs', icon: ScrollText, desc: 'Append-only admin activity' },
  { key: 'feature-flags', label: 'Feature Flags', icon: Flag, desc: 'Runtime feature toggles' },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, desc: 'System configuration' },
];

export function CommandPalette({ open, onOpenChange, onNavigate, actions = [] }: CommandPaletteProps) {
  // Build navigation items + actions into a single command list
  const navItems = SECTIONS.map((s) => ({
    key: `nav-${s.key}`,
    label: `Go to ${s.label}`,
    desc: s.desc,
    icon: s.icon,
    shortcut: undefined as string | undefined,
    keywords: ['navigate', 'go', 'open', s.key, s.label.toLowerCase()],
    run: () => { onNavigate(s.key); onOpenChange(false); },
  }));

  const allItems = [...navItems, ...actions.map(a => ({ ...a, desc: a.description }))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-border/60 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-popover/80" showCloseButton={false}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command className="bg-transparent" loop>
          <div className="flex items-center gap-2 border-b border-border/40 px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <CommandInput
              placeholder="Type a command or search…"
              className="h-12 border-0 bg-transparent px-0 text-sm placeholder:text-muted-foreground/70 focus-visible:ring-0"
            />
            <kbd className="pointer-events-none select-none rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          </div>
          <CommandList className="max-h-[400px] overflow-y-auto">
            <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">
              <Search className="mx-auto mb-2 size-5 opacity-40" />
              No results found
            </CommandEmpty>

            <CommandGroup heading="Navigation" className="text-muted-foreground">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.key}
                    value={item.key + ' ' + item.label + ' ' + (item.keywords?.join(' ') ?? '')}
                    onSelect={() => item.run()}
                    className="group cursor-pointer"
                  >
                    <Icon className="mr-2 size-4 shrink-0 text-muted-foreground group-aria-selected:text-foreground" />
                    <span className="flex-1 text-sm">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.desc}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {actions.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Actions" className="text-muted-foreground">
                  {actions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <CommandItem
                        key={action.id}
                        value={action.id + ' ' + action.label + ' ' + (action.keywords?.join(' ') ?? '')}
                        onSelect={() => { action.run(); onOpenChange(false); }}
                        className="group cursor-pointer"
                      >
                        <Icon className="mr-2 size-4 shrink-0 text-muted-foreground group-aria-selected:text-foreground" />
                        <span className="flex-1 text-sm">{action.label}</span>
                        {action.shortcut && (
                          <CommandShortcut className="font-mono text-[10px]">{action.shortcut}</CommandShortcut>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}

            <CommandSeparator />
            <CommandGroup heading="Shortcuts" className="text-muted-foreground">
              <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ArrowRight className="size-3" /> Navigate
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="size-3" /> Action
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-border/60 bg-muted/50 px-1 py-0 font-mono text-[9px]">↑↓</kbd>
                  Move
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-border/60 bg-muted/50 px-1 py-0 font-mono text-[9px]">↵</kbd>
                  Select
                </span>
              </div>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
