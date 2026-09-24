/**
 * HEAVIX — STEP 14.5: Preview Route
 * GET /preview/page/:key?version=:versionId
 *
 * Renders a DRAFT version using the SAME renderer as production.
 * V2.3: Preview = Production renderer (no drift).
 */

import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import { PageRenderer } from '@/components/page-renderer/page-renderer';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ key: string }> };

export default async function PreviewPage(req: NextRequest, { params }: Params) {
  const { key: pageKey } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-sm">برای پیش‌نمایش باید وارد شوید</p></div>;
  }
  const admin = await isAdmin(user.id);
  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-sm">دسترسی پیش‌نمایش فقط برای ادمین</p></div>;
  }

  const page = await db.adminPage.findUnique({ where: { key: pageKey } });
  if (!page) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-sm">صفحه یافت نشد</p></div>;
  }

  const url = new URL(req.url);
  const versionId = url.searchParams.get('version');

  let version;
  if (versionId) {
    version = await db.adminPageVersion.findUnique({ where: { id: versionId } });
  } else if (page.publishedVersionId) {
    version = await db.adminPageVersion.findUnique({ where: { id: page.publishedVersionId } });
  }

  if (!version) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-sm">نسخه‌ای وجود ندارد</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-600">
        پیش‌نمایش — نسخه {version.version} — {version.status}
      </div>
      <PageRenderer layout={version.layout} userId={user.id} />
    </div>
  );
}
