import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { checkCsrf } from '@/lib/csrf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_SETTINGS = {
  id: 'main',
  about: null, phone: null, email: null, address: null, workingHours: null, copyright: null,
  newsletterEnabled: true, logoUrl: null, footerLogoUrl: null, logoText: null,
  logoHeight: 80, footerLogoHeight: 48, showPersianName: true,
  logoPosition: 'right', footerLogoPosition: 'center',
  footerHeavixLogoUrl: null, footerMekanixLogoUrl: null, footerAriaLogoUrl: null,
  sellIn7DaysPrepaymentAmount: null, sellIn7DaysCommissionRate: null,
  verifiedSectionTitle: null, verifiedSectionSubtitle: null, verifiedSectionLimit: null,
  verifiedSectionAnimation: null, verifiedSectionVerifiedOnly: null,
  trustedBrandsTitle: null, trustedBrandsSubtitle: null, trustedBrandsDescription: null,
  trustedBrandsLimit: null, trustedBrandsTickerSpeed: null,
  logoAnimationDurationMs: 10000, compareVisibleAttributeIds: null,
};

async function readBoundedJson(req: Request, maxBytes = 32 * 1024): Promise<unknown> {
  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new Error('BODY_TOO_LARGE');
  if (!req.body) throw new Error('INVALID_BODY');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_BODY');
    return parsed;
  } catch {
    throw new Error('INVALID_BODY');
  }
}

const jsonForAudit = (value: unknown) => JSON.stringify(value, (_key, item) =>
  typeof item === 'bigint' ? item.toString() : item,
);

/* GET /api/admin/site-settings — read-only; never creates the singleton row. */
export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await hasPermission(sessionUser.id, 'admin.settings.manage'))) {
    return NextResponse.json({ error: "Forbidden: missing permission 'admin.settings.manage'" }, { status: 403 });
  }
  try {
    const settings = await db.siteSettings.findUnique({ where: { id: 'main' } });
    const value = settings ?? DEFAULT_SETTINGS;
    return NextResponse.json({
      settings: {
        ...value,
        sellIn7DaysPrepaymentAmount: value.sellIn7DaysPrepaymentAmount != null
          ? value.sellIn7DaysPrepaymentAmount.toString()
          : null,
      },
    });
  } catch (error) {
    console.error('[site-settings] GET error:', error);
    return NextResponse.json({ error: 'Unable to load site settings' }, { status: 500 });
  }
}

/* PUT /api/admin/site-settings — bounded, typed, and atomically audited. */
export async function PUT(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await hasPermission(sessionUser.id, 'admin.settings.manage'))) {
    return NextResponse.json({ error: "Forbidden: missing permission 'admin.settings.manage'" }, { status: 403 });
  }
  if (!checkCsrf(req)) return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJson(req) as Record<string, unknown>;
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'BODY_TOO_LARGE';
    return NextResponse.json({ error: tooLarge ? 'Request body too large' : 'Invalid JSON body' }, { status: tooLarge ? 413 : 400 });
  }

  const stringLimits: Record<string, number> = {
    about: 4000, phone: 80, email: 254, address: 500, workingHours: 300, copyright: 300,
    logoUrl: 2048, footerLogoUrl: 2048, logoText: 120, logoPosition: 20, footerLogoPosition: 20,
    footerHeavixLogoUrl: 2048, footerMekanixLogoUrl: 2048, footerAriaLogoUrl: 2048,
  };
  const booleanFields = ['newsletterEnabled', 'showPersianName'] as const;
  const numberLimits: Record<string, { min: number; max: number; integer: boolean }> = {
    logoHeight: { min: 16, max: 500, integer: true },
    footerLogoHeight: { min: 16, max: 300, integer: true },
    sellIn7DaysCommissionRate: { min: 0, max: 100, integer: false },
    logoAnimationDurationMs: { min: 100, max: 120000, integer: true },
  };
  const bigIntFields = ['sellIn7DaysPrepaymentAmount'] as const;
  const data: Record<string, unknown> = {};

  for (const [key, maxLength] of Object.entries(stringLimits)) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value === null || value === '') { data[key] = null; continue; }
    if (typeof value !== 'string' || value.length > maxLength) {
      return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    }
    data[key] = value.trim() || null;
  }
  for (const key of booleanFields) {
    if (!(key in body)) continue;
    if (typeof body[key] !== 'boolean') return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    data[key] = body[key];
  }
  for (const [key, limits] of Object.entries(numberLimits)) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value === null || value === '') { data[key] = null; continue; }
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
      return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < limits.min || number > limits.max || (limits.integer && !Number.isInteger(number))) {
      return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    }
    data[key] = number;
  }
  for (const key of bigIntFields) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value === null || value === '') { data[key] = null; continue; }
    if (typeof value !== 'string' || !/^\d{1,18}$/.test(value)) {
      return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    }
    data[key] = BigInt(value);
  }
  if (typeof data.email === 'string' && data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }
  if (typeof data.logoPosition === 'string' && !['right', 'center', 'left'].includes(data.logoPosition)) {
    return NextResponse.json({ error: 'Invalid logoPosition' }, { status: 400 });
  }
  if (typeof data.footerLogoPosition === 'string' && !['right', 'center', 'left'].includes(data.footerLogoPosition)) {
    return NextResponse.json({ error: 'Invalid footerLogoPosition' }, { status: 400 });
  }

  try {
    const settings = await db.$transaction(async (tx) => {
      const before = await tx.siteSettings.findUnique({ where: { id: 'main' } });
      const saved = await tx.siteSettings.upsert({
        where: { id: 'main' },
        create: { id: 'main', ...data } as any,
        update: data as any,
      });
      await tx.auditLog.create({
        data: {
          actorId: sessionUser.id,
          actorType: 'ADMIN',
          action: 'admin.siteSettings.upsert',
          entityType: 'SiteSettings',
          entityId: saved.id,
          beforeJson: jsonForAudit(before ? Object.fromEntries(Object.keys(data).map((key) => [key, (before as unknown as Record<string, unknown>)[key]])) : null),
          afterJson: jsonForAudit(data),
          reason: 'via admin API',
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
          userAgent: req.headers.get('user-agent'),
          requestId: req.headers.get('x-request-id'),
        },
      });
      return saved;
    });
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.settings, 'default'); }
    catch (error) { console.error('[site-settings] revalidateTag failed:', error); }
    return NextResponse.json({
      ok: true,
      settings: {
        ...settings,
        sellIn7DaysPrepaymentAmount: settings.sellIn7DaysPrepaymentAmount?.toString() ?? null,
      },
    });
  } catch (error) {
    console.error('[site-settings] PUT error:', error);
    return NextResponse.json({ error: 'Unable to save site settings' }, { status: 500 });
  }
}
