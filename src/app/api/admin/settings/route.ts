/**
 * HEAVIX Admin - System settings
 * GET  /api/admin/settings  - list all settings (secrets masked)
 * POST /api/admin/settings  - upsert a setting (by key)
 */

import { db } from '@/lib/db';
import { ok, fail, serverError, parseJsonBody, getAdminContext } from '@/lib/admin/response';
import { audit } from '@/lib/admin/audit';
import { Prisma, SettingType } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_TYPES: SettingType[] = ['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'URL', 'EMAIL'];

function maskValue(value: string, isSecret: boolean): string {
  if (!isSecret) return value;
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '*'.repeat(Math.min(20, value.length - 4)) + value.slice(-2);
}

export async function GET() {
  try {
    const settings = await db.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
    // Mask secrets in list view
    const masked = settings.map((s) => ({
      ...s,
      value: maskValue(s.value, s.isSecret),
    }));
    return ok({ items: masked });
  } catch (err) {
    console.error('[api/admin/settings GET] error:', err);
    return serverError('Failed to list settings', String(err));
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBody<{
      key?: string;
      value?: string;
      type?: SettingType;
      description?: string | null;
      isSecret?: boolean;
    }>(req);

    if (!body?.key || body.value === undefined) return fail('key and value are required', 400);
    const key = body.key.trim();
    if (!/^[a-z][a-z0-9_.-]*$/i.test(key)) {
      return fail('key must start with a letter and contain only [a-zA-Z0-9_.-]', 400);
    }

    const type: SettingType = body.type && VALID_TYPES.includes(body.type) ? body.type : 'STRING';
    const value = String(body.value);

    // Validate by type
    if (type === 'NUMBER' && Number.isNaN(Number(value))) return fail('value is not a valid number', 400);
    if (type === 'BOOLEAN' && !['true', 'false'].includes(value.toLowerCase())) return fail('value must be "true" or "false"', 400);
    if (type === 'URL') {
      try { new URL(value); } catch { return fail('value is not a valid URL', 400); }
    }
    if (type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return fail('value is not a valid email', 400);
    if (type === 'JSON') {
      try { JSON.parse(value); } catch { return fail('value is not valid JSON', 400); }
    }

    const data: Prisma.SystemSettingUpdateInput | Prisma.SystemSettingCreateInput = {
      key,
      value,
      type,
      description: body.description?.trim() || null,
      isSecret: body.isSecret ?? false,
    };

    // Upsert by key
    const setting = await db.systemSetting.upsert({
      where: { key },
      create: data as Prisma.SystemSettingCreateInput,
      update: {
        value,
        type,
        description: body.description?.trim() || null,
        isSecret: body.isSecret ?? false,
      },
    });

    const ctx = await getAdminContext();
    await audit({
      actorId: ctx.actorId,
      actorEmail: ctx.actorEmail,
      action: 'setting.upsert',
      resource: 'SystemSetting',
      resourceId: setting.id,
      metadata: { key, type, isSecret: setting.isSecret },
    });

    // Mask secret in response too
    const masked = { ...setting, value: maskValue(setting.value, setting.isSecret) };
    return ok(masked);
  } catch (err) {
    console.error('[api/admin/settings POST] error:', err);
    return serverError('Failed to upsert setting', String(err));
  }
}
