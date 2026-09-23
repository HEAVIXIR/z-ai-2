'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  ScrollText,
  Flag,
  Settings as SettingsIcon,
  Activity,
  Moon,
  Sun,
  Menu,
  X,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useHealth } from '@/hooks/admin/use-admin-api';
import { OverviewSection } from './sections/overview-section';
import { UsersSection } from './sections/users-section';
import { RolesSection } from './sections/roles-section';
import { AuditLogsSection } from './sections/audit-logs-section';
import { FeatureFlagsSection } from './sections/feature-flags-section';
import { SettingsSection } from './sections/settings-section';

type SectionKey =
  | 'overview'
  | 'users'
  | 'roles'
  | 'audit-logs'
  | 'feature-flags'
  | 'settings';

const NAV: { key: SectionKey; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, desc: 'System dashboard & live metrics' },
  { key: 'users', label: 'Users', icon: Users, desc: 'Manage user accounts & access' },
  { key: 'roles', label: 'Roles', icon: ShieldCheck, desc: 'RBAC: roles & permissions' },
  { key: 'audit-logs', label: 'Audit Logs', icon: ScrollText, desc: 'Append-only admin activity' },
  { key: 'feature-flags', label: 'Feature Flags', icon: Flag, desc: 'Runtime feature toggles' },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, desc: 'System configuration' },
];

function HealthIndicator() {
  const { data, isLoading } = useHealth();
  const ok = data?.health?.db === 'connected';
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 px-2.5 py-1 font-mono text-[11px] font-medium',
        isLoading
          ? 'border-muted-foreground/30 text-muted-foreground'
          : ok
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
            : 'border-rose-500/40 bg-rose-500/10 text-rose-500',
      )}
    >
      <span className={cn('size-1.5 rounded-full', isLoading ? 'bg-muted-foreground' : ok ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500')} />
      {isLoading ? 'CHECKING' : ok ? `DB UP · ${data.health.dbLatencyMs ?? '?'}ms` : 'DB DOWN'}
    </Badge>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="size-8"
      aria-label="Toggle theme"
    >
      {mounted ? (
        theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  );
}

function NavList({
  active,
  onSelect,
}: {
  active: SectionKey;
  onSelect: (s: SectionKey) => void;
}) {
  return (
    <nav className="flex flex-col gap-1 px-3 py-3">
      {NAV.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={cn(
              'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
            )}
          >
            <Icon className={cn('size-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
            <span className="flex-1 truncate">{item.label}</span>
            {isActive && <span className="size-1 rounded-full bg-primary" />}
          </button>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 text-sm font-black text-white shadow-lg shadow-emerald-500/20">
        H
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-sm font-bold tracking-tight">HEAVIX</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin Control Plane</span>
      </div>
    </div>
  );
}

export function AdminShell() {
  const [section, setSection] = React.useState<SectionKey>('overview');
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const active = NAV.find((n) => n.key === section)!;

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <Brand />
        <Separator />
        <NavList active={section} onSelect={setSection} />
        <div className="mt-auto px-3 py-3">
          <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-3 py-2.5 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Activity className="size-3" />
              Phase 12 · Foundation
            </div>
            <p className="mt-1 leading-snug">
              Admin Control Plane v0.12.0 — initial foundation build.
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar (Sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-3 top-3 z-30 size-9 md:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Brand />
          <Separator />
          <NavList
            active={section}
            onSelect={(s) => {
              setSection(s);
              setMobileOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* Top header */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {active.label}
            </span>
            <h1 className="text-sm font-semibold leading-none">{active.desc}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <HealthIndicator />
            <ThemeToggle />
            <Separator orientation="vertical" className="hidden h-6 md:block" />
            <div className="hidden items-center gap-2 md:flex">
              <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 text-[11px] font-bold text-white">
                SA
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-xs font-semibold">Super Admin</span>
                <span className="text-[10px] text-muted-foreground">admin@heavix.local</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main content (scrollable) */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              {section === 'overview' && <OverviewSection />}
              {section === 'users' && <UsersSection />}
              {section === 'roles' && <RolesSection />}
              {section === 'audit-logs' && <AuditLogsSection />}
              {section === 'feature-flags' && <FeatureFlagsSection />}
              {section === 'settings' && <SettingsSection />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Footer (sticky) */}
        <footer className="mt-auto flex h-9 items-center justify-between border-t bg-background px-4 text-[11px] text-muted-foreground md:px-6">
          <span>
            HEAVIX · Phase 12 Foundation ·{' '}
            <span className="text-foreground/70">{active.label}</span>
          </span>
          <span className="font-mono">v0.12.0</span>
        </footer>
      </div>
    </div>
  );
}
