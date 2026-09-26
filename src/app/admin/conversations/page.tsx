/**
 * HEAVIX — Conversations Admin List
 * /admin/conversations — minimal admin oversight of user conversations
 * T3-W3: Conversations admin page (uses main schema Conversation model)
 */

import Link from 'next/link';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { ArrowLeft } from 'lucide-react';

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

  const STATUS_LABEL: Record<string, string> = {
    ACTIVE: 'فعال',
    CLOSED: 'بسته‌شده',
    BLOCKED: 'مسدودشده',
    ARCHIVED: 'بایگانی‌شده',
  };
  const STATUS_CLS: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    CLOSED: 'bg-zinc-100 text-zinc-600',
    BLOCKED: 'bg-red-100 text-red-700',
    ARCHIVED: 'bg-zinc-100 text-zinc-600',
  };

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
              <tr><th className="px-4 py-3 text-right">کاربر ۱</th><th className="px-4 py-3 text-right">کاربر ۲</th><th className="px-4 py-3 text-right">آگهی</th><th className="px-4 py-3 text-right">وضعیت</th><th className="px-4 py-3 text-right">پیام‌ها</th><th className="px-4 py-3 text-right">تاریخ</th><th className="px-4 py-3 text-right">اقدامات</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {conversations.map(c => (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">{c.participant1?.firstName || '—'} {c.participant1?.lastName || ''}</td>
                  <td className="px-4 py-3">{c.participant2?.firstName || '—'} {c.participant2?.lastName || ''}</td>
                  <td className="px-4 py-3 text-zinc-600">{c.listing?.title || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLS[c.status] ?? 'bg-zinc-100 text-zinc-600'}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{c._count?.messages || 0}</td>
                  <td className="px-4 py-3 text-zinc-400">{c.updatedAt?.toLocaleDateString('fa-IR') || '—'}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/conversations/${c.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-bold text-zinc-700 transition hover:border-[#F58220] hover:text-[#F58220]"
                      title="جزئیات و اقدامات نظارتی"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      جزئیات و اقدام
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
