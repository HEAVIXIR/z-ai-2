/**
 * HEAVIX — STEP 14.6: Page Builder Scheduler
 * GET  /api/admin/pages/check-scheduled
 * POST /api/admin/pages/check-scheduled
 *
 * V2.3 (T4): Scheduled publish + unpublish lifecycle.
 *
 * What it does:
 *   1. Finds AdminPage WHERE scheduledPublishAt <= now() AND status != 'PUBLISHED'
 *      For each found page:
 *        - Archive the current published version (if exists)
 *        - Publish the latest DRAFT version (the "scheduled version")
 *        - Update page status to PUBLISHED + publishedVersionId
 *        - Clear scheduledPublishAt
 *        - logAudit('page.scheduled.publish')
 *        - revalidatePath()
 *      If no draft exists to publish, the schedule is cleared with a
 *      'page.scheduled.publish.skipped' audit entry (no version to publish).
 *
 *   2. Finds AdminPage WHERE scheduledUnpublishAt <= now() AND status = 'PUBLISHED'
 *      For each found page:
 *        - Set page status to UNPUBLISHED (publishedVersionId is retained
 *          so the page can be re-published later without losing the version)
 *        - Clear scheduledUnpublishAt
 *        - logAudit('page.scheduled.unpublish')
 *        - revalidatePath()
 *
 * Auth:
 *   - Admin via cookie session (getCurrentUser + isAdmin) — used by the
 *     admin UI's "Run scheduler now" button.
 *   - Cron via x-cron-key header matching process.env.CRON_SECRET — used
 *     by external cron / Vercel Cron / systemd timers.
 *   - In non-production, when CRON_SECRET is unset, the route is open
 *     (actorType='SYSTEM') for developer convenience.
 *   - In production, when CRON_SECRET is set, requests without a valid
 *     cookie OR a valid x-cron-key are rejected with 401.
 *
 * Idempotency:
 *   - Clearing scheduledPublishAt / scheduledUnpublishAt on every processed
 *     page guarantees a second scheduler tick within the same minute won't
 *     double-publish / double-unpublish.
 *
 * Cache invalidation mirrors the publish/rollback routes (V2.3).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Auth gate ──────────────────────────────────────────────
interface AuthResult {
  ok: boolean;
  actorId: string | null;
  actorType: 'ADMIN' | 'SYSTEM';
  reason?: string;
}

async function authorize(req: Request): Promise<AuthResult> {
  // 1. Cron / internal call — x-cron-key header
  const cronKey = req.headers.get('x-cron-key');
  const expected = process.env.CRON_SECRET;
  if (expected && cronKey) {
    if (cronKey === expected) {
      return { ok: true, actorId: null, actorType: 'SYSTEM' };
    }
    return { ok: false, actorId: null, actorType: 'SYSTEM', reason: 'invalid cron key' };
  }

  // 2. Admin via cookie session
  const user = await getCurrentUser();
  if (user) {
    const admin = await isAdmin(user.id);
    if (admin) {
      return { ok: true, actorId: user.id, actorType: 'ADMIN' };
    }
    return { ok: false, actorId: user.id, actorType: 'ADMIN', reason: 'not admin' };
  }

  // 3. Dev convenience: when CRON_SECRET is unset AND not in production,
  //    allow the call as SYSTEM (so a developer can hit the endpoint
  //    during local testing without setting up auth).
  if (!expected && process.env.NODE_ENV !== 'production') {
    return { ok: true, actorId: null, actorType: 'SYSTEM' };
  }

  return { ok: false, actorId: null, actorType: 'SYSTEM', reason: 'no auth' };
}

// ── Core scheduled-checks runner ───────────────────────────
export interface ScheduledCheckResult {
  published: Array<{ pageId: string; versionId: string; version: number }>;
  publishSkipped: Array<{ pageId: string; reason: string }>;
  unpublished: Array<{ pageId: string }>;
  errors: Array<{ pageId: string; error: string }>;
}

async function runScheduledChecks(actor: {
  actorId: string | null;
  actorType: 'ADMIN' | 'SYSTEM';
}): Promise<ScheduledCheckResult> {
  const now = new Date();
  const h = await headers();
  const ip = h.get('x-forwarded-for') || null;
  const userAgent = h.get('user-agent') || null;

  const result: ScheduledCheckResult = {
    published: [],
    publishSkipped: [],
    unpublished: [],
    errors: [],
  };

  // ── 1. Scheduled PUBLISH ─────────────────────────────────
  // Pages where the scheduled publish time has arrived AND the page
  // isn't already PUBLISHED (covers DRAFT, SCHEDULED, UNPUBLISHED).
  const toPublish = await db.adminPage.findMany({
    where: {
      scheduledPublishAt: { lte: now },
      status: { not: 'PUBLISHED' },
    },
    include: {
      versions: { orderBy: { version: 'desc' } },
    },
  });

  for (const page of toPublish) {
    try {
      // Pick the latest DRAFT version as the "scheduled version".
      // If no DRAFT exists, fall back to the latest version overall
      // (covers the case where an admin scheduled-publish a page whose
      // only version is already published but the page status is
      // UNPUBLISHED — i.e. re-publish).
      const draft = page.versions.find((v) => v.status === 'DRAFT');
      const target = draft ?? page.versions[0];

      const previousVersionId = page.publishedVersionId;

      if (!target) {
        // Nothing to publish — clear the schedule and log a skip.
        await db.adminPage.update({
          where: { id: page.id },
          data: { scheduledPublishAt: null, updatedBy: actor.actorId },
        });
        await logAudit({
          actorId: actor.actorId,
          actorType: actor.actorType,
          action: 'page.scheduled.publish.skipped',
          entityType: 'AdminPage',
          entityId: page.id,
          before: { status: page.status, scheduledPublishAt: page.scheduledPublishAt },
          after: { scheduledPublishAt: null, reason: 'no version to publish' },
          reason: `Scheduled publish skipped for "${page.key}" — no version available`,
          ip, userAgent,
        });
        result.publishSkipped.push({ pageId: page.id, reason: 'no version to publish' });
        continue;
      }

      // Archive the current published version (if any, and different).
      if (previousVersionId && previousVersionId !== target.id) {
        await db.adminPageVersion.update({
          where: { id: previousVersionId },
          data: { status: 'ARCHIVED' },
        });
      }

      // Publish the target version.
      await db.adminPageVersion.update({
        where: { id: target.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: now,
          publishedBy: actor.actorId,
        },
      });

      // Update the page pointer + clear the schedule.
      await db.adminPage.update({
        where: { id: page.id },
        data: {
          status: 'PUBLISHED',
          publishedVersionId: target.id,
          scheduledPublishAt: null,
          updatedBy: actor.actorId,
        },
      });

      await logAudit({
        actorId: actor.actorId,
        actorType: actor.actorType,
        action: 'page.scheduled.publish',
        entityType: 'AdminPage',
        entityId: page.id,
        before: {
          status: page.status,
          publishedVersionId: previousVersionId,
          scheduledPublishAt: page.scheduledPublishAt,
        },
        after: {
          status: 'PUBLISHED',
          publishedVersionId: target.id,
          version: target.version,
          scheduledPublishAt: null,
        },
        reason: `Scheduled publish of "${page.key}" — version ${target.version}`,
        ip, userAgent,
      });

      // Cache invalidation (mirror publish/rollback routes).
      if (page.slug) revalidatePath(`/${page.slug}`);
      revalidatePath('/');
      revalidatePath(`/admin/pages/${page.id}`);

      result.published.push({
        pageId: page.id,
        versionId: target.id,
        version: target.version,
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? 'unknown error';
      result.errors.push({ pageId: page.id, error: msg });
      // Best-effort: log the failure so it shows up in the audit trail.
      await logAudit({
        actorId: actor.actorId,
        actorType: actor.actorType,
        action: 'page.scheduled.publish.error',
        entityType: 'AdminPage',
        entityId: page.id,
        after: { error: msg },
        reason: `Scheduled publish FAILED for "${page.key}" — ${msg}`,
        ip, userAgent,
      });
    }
  }

  // ── 2. Scheduled UNPUBLISH ──────────────────────────────
  const toUnpublish = await db.adminPage.findMany({
    where: {
      scheduledUnpublishAt: { lte: now },
      status: 'PUBLISHED',
    },
  });

  for (const page of toUnpublish) {
    try {
      const before = {
        status: page.status,
        publishedVersionId: page.publishedVersionId,
        scheduledUnpublishAt: page.scheduledUnpublishAt,
      };

      await db.adminPage.update({
        where: { id: page.id },
        data: {
          status: 'UNPUBLISHED',
          scheduledUnpublishAt: null,
          updatedBy: actor.actorId,
        },
      });

      await logAudit({
        actorId: actor.actorId,
        actorType: actor.actorType,
        action: 'page.scheduled.unpublish',
        entityType: 'AdminPage',
        entityId: page.id,
        before,
        after: {
          status: 'UNPUBLISHED',
          publishedVersionId: page.publishedVersionId, // retained for re-publish
          scheduledUnpublishAt: null,
        },
        reason: `Scheduled unpublish of "${page.key}"`,
        ip, userAgent,
      });

      // Cache invalidation.
      if (page.slug) revalidatePath(`/${page.slug}`);
      revalidatePath('/');
      revalidatePath(`/admin/pages/${page.id}`);

      result.unpublished.push({ pageId: page.id });
    } catch (err) {
      const msg = (err as Error)?.message ?? 'unknown error';
      result.errors.push({ pageId: page.id, error: msg });
      await logAudit({
        actorId: actor.actorId,
        actorType: actor.actorType,
        action: 'page.scheduled.unpublish.error',
        entityType: 'AdminPage',
        entityId: page.id,
        after: { error: msg },
        reason: `Scheduled unpublish FAILED for "${page.key}" — ${msg}`,
        ip, userAgent,
      });
    }
  }

  return result;
}

// ── GET — cron-friendly ────────────────────────────────────
// Many cron services (Vercel Cron, GitHub Actions, systemd timers)
// can only issue GET requests. The same logic runs as POST.
export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized', reason: auth.reason },
      { status: 401 },
    );
  }

  try {
    const result = await runScheduledChecks({
      actorId: auth.actorId,
      actorType: auth.actorType,
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}

// ── POST — admin UI "Run scheduler now" ────────────────────
export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized', reason: auth.reason },
      { status: 401 },
    );
  }

  try {
    const result = await runScheduledChecks({
      actorId: auth.actorId,
      actorType: auth.actorType,
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Server error' },
      { status: 500 },
    );
  }
}
