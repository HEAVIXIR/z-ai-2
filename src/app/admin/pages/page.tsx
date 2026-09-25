/**
 * HEAVIX — Page Builder Admin List
 * /admin/pages — list all AdminPage records with status + actions
 *
 * Track D: Minimal admin UI for the Page Builder.
 * Shows page list with links to preview/publish/rollback.
 * Full editor UI is a future enhancement.
 */

import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin } from '@/lib/authorization';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminPagesList() {
  const user = await getCurrentUser();
  if (!user) {
    return <div className="p-8 text-center text-zinc-500">Unauthorized. Please log in.</div>;
  }
  const admin = await isAdmin(user.id);
  if (!admin) {
    return <div className="p-8 text-center text-zinc-500">Forbidden: admin access required.</div>;
  }

  const pages = await db.adminPage.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 1 },
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Page Builder</h1>
          <p className="mt-1 text-sm text-zinc-500">
            مدیریت صفحات قابل‌ساخت (Declarative JSON + Validated Renderer)
          </p>
        </div>
        <Link
          href="/api/admin/pages"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          API Docs
        </Link>
      </div>

      {pages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center">
          <p className="text-zinc-500">هیچ صفحه‌ای ایجاد نشده است.</p>
          <p className="mt-2 text-sm text-zinc-400">
            برای ایجاد صفحه، از API استفاده کنید: <code className="rounded bg-zinc-100 px-1">POST /api/admin/pages</code>
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-4 py-3 text-right">عنوان</th>
                <th className="px-4 py-3 text-right">نوع</th>
                <th className="px-4 py-3 text-right">وضعیت</th>
                <th className="px-4 py-3 text-right">نسخه</th>
                <th className="px-4 py-3 text-right">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {pages.map((page) => {
                const latestVersion = page.versions[0];
                const statusCls =
                  page.status === 'PUBLISHED'
                    ? 'bg-emerald-100 text-emerald-700'
                    : page.status === 'DRAFT'
                      ? 'bg-amber-100 text-amber-700'
                      : page.status === 'ARCHIVED'
                        ? 'bg-zinc-100 text-zinc-500'
                        : 'bg-blue-100 text-blue-700';
                return (
                  <tr key={page.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{page.title || page.key}</div>
                      <div className="text-xs text-zinc-400">/{page.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{page.pageType}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusCls}`}>
                        {page.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {latestVersion ? `v${latestVersion.version}` : '—'}
                    </td>
                    <td className="px-4 py-3 space-x-2 space-x-reverse">
                      {page.status !== 'ARCHIVED' && (
                        <>
                          <Link
                            href={`/preview/page/${page.key}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            پیش‌نمایش
                          </Link>
                          <span className="text-zinc-300">|</span>
                          <Link
                            href={`/api/admin/pages/${page.id}`}
                            className="text-xs text-zinc-600 hover:underline"
                          >
                            جزئیات
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Track D note: homepage wiring gap */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        ℹ️ Backend کامل است (schema + API + renderer + audit + ۳۴ tests).
        اتصال به homepage اصلی (<code className="rounded bg-blue-100 px-1">/</code>) در فاز بعدی انجام می‌شود.
      </div>
    </div>
  );
}
