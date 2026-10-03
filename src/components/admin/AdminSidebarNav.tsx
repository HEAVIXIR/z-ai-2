"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Loader2,
  LayoutDashboard, Wrench, Megaphone, Building2, FolderTree, Users, Settings,
  MonitorSmartphone, Activity, Wallet, BookOpen, Brain, ShieldCheck, ShieldAlert,
  Crown, Image as ImageIcon, Images, Menu as MenuIcon, Target, Sparkles,
  FileText, Pin, EyeOff, PanelLeftClose, PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { usePreferences } from "@/hooks/admin/use-preferences";

/* ============================================================
   AdminSidebarNav — Phase 12 DB-driven + permission-aware.
   Fetches navigation from /api/admin/navigation (which filters
   by the current user's RBAC permissions).
   Falls back to a hard-coded minimal menu if the API fails.
   ============================================================ */

// Icon name → component mapper (DB stores icon as string)
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, MonitorSmartphone, Megaphone, Building2, FolderTree,
  Activity, Wallet, BookOpen, ShieldAlert, Brain, Crown, Users,
  ShieldCheck, Settings, ImageIcon, Images, MenuIcon, Wrench, Target, Sparkles,
  FileText,
};

function getIcon(name?: string | null): LucideIcon {
  if (!name) return LayoutDashboard;
  return ICON_MAP[name] ?? LayoutDashboard;
}

type NavItem = {
  key: string;
  titleFa: string;
  titleEn?: string | null;
  href: string;
  icon?: string | null;
  permissionKey?: string | null;
};

type NavGroup = {
  key: string;
  titleFa: string;
  titleEn?: string | null;
  icon?: string | null;
  sortOrder: number;
  items: NavItem[];
};

type NavResponse = {
  groups: NavGroup[];
  standalone: NavItem[];
  mode: string;
};

export default function AdminSidebarNav() {
  const pathname = usePathname();
  const [nav, setNav] = useState<NavResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track which groups are open (by key)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Personalization — wired to existing usePreferences() hook.
  // Server enforces auth+permission via /api/admin/preferences (requirePermission).
  // Client is UI affordance only; server is authoritative security boundary.
  const { prefs, update: updatePrefs } = usePreferences();

  const hiddenSet = new Set(prefs.hiddenItems ?? []);
  const pinnedSet = new Set(prefs.pinnedItems ?? []);
  const isCollapsed = prefs.sidebarCollapsed;

  function togglePin(itemKey: string) {
    const current = new Set(prefs.pinnedItems ?? []);
    if (current.has(itemKey)) current.delete(itemKey);
    else current.add(itemKey);
    updatePrefs({ pinnedItems: Array.from(current) });
  }

  function toggleHide(itemKey: string) {
    const current = new Set(prefs.hiddenItems ?? []);
    if (current.has(itemKey)) current.delete(itemKey);
    else current.add(itemKey);
    updatePrefs({ hiddenItems: Array.from(current) });
  }

  function toggleSidebar() {
    updatePrefs({ sidebarCollapsed: !prefs.sidebarCollapsed });
  }

  useEffect(() => {
    fetch("/api/admin/navigation", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.ok) {
          setNav(d.data);
          // Auto-open groups that contain the active route
          const activeGroups = new Set<string>();
          for (const g of d.data.groups) {
            if (g.items.some((i: NavItem) => pathname === i.href || pathname.startsWith(i.href + "/"))) {
              activeGroups.add(g.key);
            }
          }
          setOpenGroups(activeGroups);
        } else {
          throw new Error(d.error || "Failed to load navigation");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open group when pathname changes (navigating to a child route)
  useEffect(() => {
    if (!nav) return;
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const g of nav.groups) {
        if (g.items.some((i) => pathname === i.href || pathname.startsWith(i.href + "/"))) {
          next.add(g.key);
        }
      }
      return next;
    });
  }, [pathname, nav]);

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        <Loader2 className="mx-auto size-5 animate-spin text-zinc-500" />
        <p className="text-center text-xs text-zinc-500">در حال بارگذاری منو…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-xs text-rose-400">
        خطا در بارگذاری منو: {error}
      </div>
    );
  }

  if (!nav) return null;

  return (
    <div className="space-y-1">
      {/* Sidebar collapse toggle — wired to AdminPreference.sidebarCollapsed */}
      <button
        onClick={toggleSidebar}
        className="flex w-full items-center justify-end rounded-lg px-3 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-800 hover:text-white"
        title={isCollapsed ? "بازکردن منو" : "جمع کردن منو"}
      >
        {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>

      {/* Standalone items first (dashboard, listings, etc.) — filtered + sorted by prefs */}
      {nav.standalone
        .filter((item) => !hiddenSet.has(item.key))
        .sort((a, b) => {
          const aPinned = pinnedSet.has(a.key);
          const bPinned = pinnedSet.has(b.key);
          return aPinned === bPinned ? 0 : aPinned ? -1 : 1;
        })
        .map((item) => {
        const Icon = getIcon(item.icon);
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <div key={item.key} className="group relative">
            <Link
              href={item.href}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-[#F58220]/15 text-[#F58220]"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              } ${isCollapsed ? "justify-center" : ""}`}
            >
              <Icon size={19} className="shrink-0" />
              {!isCollapsed && <span className="truncate">{item.titleFa}</span>}
              {pinnedSet.has(item.key) && !isCollapsed && (
                <Pin size={11} className="mr-auto shrink-0 text-amber-500" />
              )}
            </Link>
            {/* Pin/Hide actions (visible on hover, not in collapsed mode) */}
            {!isCollapsed && (
              <div className="absolute left-full top-1/2 z-50 ml-1 hidden -translate-y-1/2 flex-row gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1 group-hover:flex">
                <button
                  onClick={(e) => { e.preventDefault(); togglePin(item.key); }}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-amber-500"
                  title={pinnedSet.has(item.key) ? "برداشتن سنجاق" : "سنجاق کردن"}
                >
                  <Pin size={12} />
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); toggleHide(item.key); }}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-rose-400"
                  title="پنهان کردن"
                >
                  <EyeOff size={12} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Groups (collapsible) */}
      {nav.groups.map((group) => {
        const Icon = getIcon(group.icon);
        const isOpen = openGroups.has(group.key);
        const groupActive = group.items.some(
          (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
        );

        return (
          <div key={group.key}>
            <button
              onClick={() => toggleGroup(group.key)}
              className={`flex w-full min-h-11 items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                groupActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <Icon size={19} className="shrink-0" />
              <span className="flex-1 truncate text-right">{group.titleFa}</span>
              <ChevronDown
                size={16}
                className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <div className="mr-6 mt-1 space-y-1 border-r border-zinc-800 pr-3">
                {group.items.filter((item) => !hiddenSet.has(item.key)).map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`block rounded-lg px-3 py-2 text-[13px] transition ${
                        active
                          ? "bg-[#F58220]/15 font-bold text-[#F58220]"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      }`}
                    >
                      {item.titleFa}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Permission mode indicator (dev only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-4 px-4 text-[10px] text-zinc-600">
          Mode: {nav.mode} · {nav.groups.length} groups · {nav.standalone.length} standalone
        </div>
      )}
    </div>
  );
}
