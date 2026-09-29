import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseBool, parseNumber } from "@/lib/api-helpers";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/feature-flags
   GET  — list all flags (auto-seed defaults if empty)
   POST — create or update a flag
   ============================================================ */

const DEFAULT_FLAGS: Array<{
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  rolloutPct: number;
}> = [
  {
    key: "ENABLE_AI_SEARCH",
    label: "جستجوی هوشمند AI",
    description: "فعال‌سازی جستجوی مبتنی بر LLM برای کاربران",
    enabled: true,
    rolloutPct: 100,
  },
  {
    key: "ENABLE_RFQ",
    label: "سیستم درخواست خرید (RFQ)",
    description: "امکان ثبت و مدیریت درخواست‌های خرید B2B",
    enabled: true,
    rolloutPct: 100,
  },
  {
    key: "ENABLE_AUCTION",
    label: "مزایده ماشین‌آلات",
    description: "موتور مزایده برای آگهی‌های انتخاب‌شده",
    enabled: false,
    rolloutPct: 0,
  },
  {
    key: "ENABLE_RENTAL",
    label: "اجاره ماشین‌آلات",
    description: "امکان ثبت آگهی اجاره به‌علاوه فیلتر اجاره",
    enabled: true,
    rolloutPct: 100,
  },
  {
    key: "ENABLE_MARKET_INDEX",
    label: "شاخص بازار",
    description: "نمایش شاخص قیمت بازار و روندها",
    enabled: true,
    rolloutPct: 100,
  },
  {
    key: "ENABLE_VOICE_SEARCH",
    label: "جستجوی صوتی",
    description: "جستجوی صوتی فارسی برای کاربران موبایل",
    enabled: false,
    rolloutPct: 0,
  },
];

async function ensureSeeded() {
  const count = await db.featureFlag.count();
  if (count === 0) {
    await db.featureFlag.createMany({
      data: DEFAULT_FLAGS.map((f) => ({
        key: f.key,
        label: f.label,
        description: f.description,
        enabled: f.enabled,
        rolloutPct: f.rolloutPct,
      })),
    });
  }
}

export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "admin.settings.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires admin.settings.manage" },
      { status: 403 },
    );
  }
  try {
    await ensureSeeded();
    const flags = await db.featureFlag.findMany({
      orderBy: { createdAt: "asc" },
    });
    const stats = {
      total: flags.length,
      enabled: flags.filter((f) => f.enabled).length,
      disabled: flags.filter((f) => !f.enabled).length,
      partialRollout: flags.filter((f) => f.enabled && f.rolloutPct < 100).length,
    };
    return NextResponse.json({ success: true, data: flags, stats });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "admin.settings.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires admin.settings.manage" },
      { status: 403 },
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const key = String(body.key ?? "").trim();
    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }
    const label = String(body.label ?? key).trim();
    const description = body.description ? String(body.description) : null;
    const enabled = parseBool(body.enabled);
    const rolloutPct = parseNumber(body.rolloutPct);
    const data = {
      label,
      description,
      enabled,
      rolloutPct: rolloutPct === null ? 100 : Math.max(0, Math.min(100, rolloutPct)),
    };
    const flag = await db.featureFlag.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.featureFlags.upsert",
      entityType: "FeatureFlag",
      entityId: flag.key,
      after: { key: flag.key, label: flag.label, enabled: flag.enabled, rolloutPct: flag.rolloutPct },
      reason: "via admin API",
    });
    return NextResponse.json({ success: true, data: flag });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
