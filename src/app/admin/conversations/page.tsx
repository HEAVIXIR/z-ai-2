/**
 * HEAVIX — Conversations Admin List
 * /admin/conversations — minimal admin oversight of user conversations
 * T3-W3: Conversations admin page (uses main schema Conversation model)
 */

import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export default async function AdminConversationsPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  try { await requirePermission(user.id, 'conversation.read'); } catch {
    return <div className="p-8 text-center text-zinc-500">Forbidden: requires conversation.read</div>;
  }

  const conversations = await db.conversation.findMany({
    take: 100,
    orderBy: { updatedAt: 'desc' },
    include: {
      participant1: { select: { id: true, firstName: true, lastName: true, mobile: true } },
      participant2: { select: { id: true, firstName: true, lastName: true, mobile: true } },
      listing: { select: { id: true, title: true, slug: true } },
      _count: { select: { messages: true } },
    },
  });

  await logAudit({ actorId: user.id, actorType: 'ADMIN', action: 'marketplace.conversation.list_view', entityType: 'Conversation' });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">مکالمات</h1>
        <p className="mt-1 text-sm text-zinc-500">مشاهده مکالمات بین کاربران</p>
      </div>
      {conversations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center text-zinc-500">هیچ مکالمه‌ای یافت نشد</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr><th className="px-4 py-3 text-right">کاربر ۱</th><th className="px-4 py-3 text-right">کاربر ۲</th><th className="px-4 py-3 text-right">آگهی</th><th className="px-4 py-3 text-right">پیام‌ها</th><th className="px-4 py-3 text-right">تاریخ</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {conversations.map(c => (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">{c.participant1?.firstName || '—'} {c.participant1?.lastName || ''}</td>
                  <td className="px-4 py-3">{c.participant2?.firstName || '—'} {c.participant2?.lastName || ''}</td>
                  <td className="px-4 py-3 text-zinc-600">{c.listing?.title || '—'}</td>
                  <td className="px-4 py-3 text-zinc-600">{c._count?.messages || 0}</td>
                  <td className="px-4 py-3 text-zinc-400">{c.updatedAt?.toLocaleDateString('fa-IR') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
