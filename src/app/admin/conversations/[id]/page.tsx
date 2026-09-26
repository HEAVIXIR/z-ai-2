import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { toFa, faDate, timeAgo } from "@/lib/format";
import {
  ArrowRight,
  MessageCircle,
  ShieldCheck,
  ShieldX,
  Ban,
  Lock,
  Building2,
  Megaphone,
  User as UserIcon,
} from "lucide-react";
import ConversationDetailClient from "./ConversationDetailClient";

export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "فعال",
  CLOSED: "بسته‌شده",
  BLOCKED: "مسدودشده",
  ARCHIVED: "بایگانی‌شده",
};

const STATUS_CLS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-zinc-100 text-zinc-600",
  BLOCKED: "bg-red-100 text-red-700",
  ARCHIVED: "bg-zinc-100 text-zinc-600",
};

/* /admin/conversations/[id] — conversation detail / moderation page.
 *
 * Server component: fetches the conversation with participants +
 * listing + latest messages + counts and hands them to the
 * client component for the moderation action buttons (close /
 * block / send admin message).
 *
 * Permission: conversation.read (canonical admin oversight gate;
 * matches the /admin/conversations list page + the PATCH route).
 *
 * Audit: best-effort marketplace.conversation.detail_view.
 *
 * Moderation actions: close (→CLOSED), block (→BLOCKED),
 * re-activate (→ACTIVE) via the existing
 * /api/admin/conversations/[id] PATCH route. Sending an admin
 * message uses the new /api/admin/conversations/[id]/messages
 * POST route.
 */
export default async function AdminConversationDetailPage({
  params,
}: Args) {
  const { id } = await params;

  // ── 1. Auth + RBAC ──
  const actor = await getCurrentUser();
  if (!actor) {
    return <div className="p-8 text-center text-zinc-500">Unauthorized</div>;
  }
  try {
    await requirePermission(actor.id, "conversation.read");
  } catch {
    return (
      <div className="p-8 text-center text-zinc-500">
        Forbidden: requires conversation.read
      </div>
    );
  }

  // ── 2. Load conversation detail ──
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          slug: true,
          price: true,
          status: true,
        },
      },
      participant1: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          mobile: true,
          email: true,
          role: true,
          status: true,
        },
      },
      participant2: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          mobile: true,
          email: true,
          role: true,
          status: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          senderId: true,
          body: true,
          attachmentUrl: true,
          read: true,
          readAt: true,
          createdAt: true,
        },
      },
      _count: { select: { messages: true } },
    },
  });

  if (!conversation) notFound();

  // Best-effort detail_view audit
  await logAudit({
    actorId: actor.id,
    actorType: "ADMIN",
    action: "marketplace.conversation.detail_view",
    entityType: "Conversation",
    entityId: conversation.id,
    reason: `viewed conversation ${conversation.id}`,
  }).catch(() => {});

  const sectionCard = "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm";

  // Serialise for the client component (Date → ISO strings).
  const initial = {
    id: conversation.id,
    status: conversation.status,
    listingId: conversation.listingId,
    participant1Id: conversation.participant1Id,
    participant2Id: conversation.participant2Id,
    lastMessageAt: conversation.lastMessageAt
      ? conversation.lastMessageAt.toISOString()
      : null,
    lastMessagePreview: conversation.lastMessagePreview,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    listing: conversation.listing
      ? {
          ...conversation.listing,
          price: conversation.listing.price
            ? conversation.listing.price.toString()
            : null,
        }
      : null,
    participant1: conversation.participant1
      ? {
          ...conversation.participant1,
        }
      : null,
    participant2: conversation.participant2
      ? {
          ...conversation.participant2,
        }
      : null,
    messages: conversation.messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
    })),
    messagesCount: conversation._count.messages,
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/conversations"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition hover:border-[#F58220] hover:text-[#F58220]"
            title="بازگشت"
          >
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-900">
              <MessageCircle className="h-6 w-6 text-[#F58220]" />
              مکالمه
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  STATUS_CLS[conversation.status] ?? "bg-zinc-100 text-zinc-600"
                }`}
              >
                {STATUS_LABEL[conversation.status] ?? conversation.status}
              </span>
            </h1>
            <p className="text-xs text-zinc-500">
              {faDate(conversation.createdAt)} · آخرین به‌روزرسانی:{" "}
              {timeAgo(conversation.updatedAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="کل پیام‌ها"
          value={conversation._count.messages}
          icon={<MessageCircle className="h-4 w-4" />}
          color="text-amber-700 bg-amber-100"
        />
        <StatCard
          label="آخرین پیام"
          value={conversation.lastMessageAt ? 1 : 0}
          displayValue={
            conversation.lastMessageAt ? timeAgo(conversation.lastMessageAt) : "—"
          }
          icon={<MessageCircle className="h-4 w-4" />}
          color="text-blue-700 bg-blue-100"
        />
        <StatCard
          label="آگهی مرتبط"
          value={conversation.listing ? 1 : 0}
          displayValue={conversation.listing ? "دارد" : "ندارد"}
          icon={<Megaphone className="h-4 w-4" />}
          color="text-purple-700 bg-purple-100"
        />
        <StatCard
          label="وضعیت"
          value={1}
          displayValue={STATUS_LABEL[conversation.status] ?? conversation.status}
          icon={
            conversation.status === "ACTIVE" ? (
              <ShieldCheck className="h-4 w-4" />
            ) : conversation.status === "BLOCKED" ? (
              <Ban className="h-4 w-4" />
            ) : (
              <Lock className="h-4 w-4" />
            )
          }
          color={
            conversation.status === "ACTIVE"
              ? "text-emerald-700 bg-emerald-100"
              : conversation.status === "BLOCKED"
                ? "text-red-700 bg-red-100"
                : "text-zinc-700 bg-zinc-100"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: participants + listing */}
        <div className="space-y-6 lg:col-span-1">
          {/* Participants */}
          <section className={sectionCard}>
            <h2 className="mb-4 text-sm font-black text-zinc-900">
              شرکت‌کنندگان
            </h2>
            {[conversation.participant1, conversation.participant2].map(
              (p, idx) => (
                <div
                  key={p?.id ?? idx}
                  className="mb-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                >
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-zinc-500" />
                    <Link
                      href={`/admin/users/${p?.id}`}
                      className="truncate font-bold text-zinc-800 hover:text-[#F58220]"
                    >
                      {p ? `${p.firstName} ${p.lastName}` : "—"}
                    </Link>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500" dir="ltr">
                    {p?.email ?? "—"} · {p?.mobile ?? "—"}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                    <span>نقش: {p?.role ?? "—"}</span>
                    <span>·</span>
                    <span>وضعیت: {p?.status ?? "—"}</span>
                  </div>
                </div>
              ),
            )}
          </section>

          {/* Listing */}
          <section className={sectionCard}>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-black text-zinc-900">
              <Megaphone className="h-4 w-4 text-[#F58220]" />
              آگهی مرتبط
            </h2>
            {conversation.listing ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">عنوان</span>
                  <Link
                    href={`/listings/${conversation.listing.slug}`}
                    target="_blank"
                    className="truncate font-bold text-zinc-800 hover:text-[#F58220]"
                  >
                    {conversation.listing.title}
                  </Link>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">وضعیت</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-700">
                    {conversation.listing.status}
                  </span>
                </div>
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-zinc-400">
                این مکالمه به آگهی خاصی متصل نیست.
              </p>
            )}
          </section>

          {/* Moderation actions (client component) */}
          <ConversationDetailClient
            conversationId={conversation.id}
            initialStatus={conversation.status}
            actorId={actor.id}
          />
        </div>

        {/* Right: messages */}
        <div className="lg:col-span-2">
          <section className={sectionCard}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-black text-zinc-900">
                <MessageCircle className="h-4 w-4 text-[#F58220]" />
                پیام‌ها (۵۰ اخیر از {toFa(conversation._count.messages)})
              </h2>
              {conversation._count.messages > 50 && (
                <span className="text-[10px] text-zinc-400">
                  برای دیدن پیام‌های قدیمی‌تر از /api/admin/conversations/[id]/messages
                  با پارامتر ?before استفاده کنید
                </span>
              )}
            </div>

            {conversation.messages.length === 0 ? (
              <p className="py-8 text-center text-xs text-zinc-400">
                هنوز هیچ پیامی در این مکالمه ثبت نشده است.
              </p>
            ) : (
              <ul className="max-h-[600px] space-y-2 overflow-y-auto">
                {/* Reverse the messages so oldest is at the top of the
                    rendered list (the DB returns newest-first; we flip
                    for display). */}
                {[...conversation.messages].reverse().map((m) => {
                  const isP1 = m.senderId === conversation.participant1Id;
                  const sender = isP1
                    ? conversation.participant1
                    : conversation.participant2;
                  return (
                    <li
                      key={m.id}
                      className={`flex flex-col ${
                        isP1 ? "items-start" : "items-end"
                      }`}
                    >
                      <div className="mb-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                        <span className="font-bold text-zinc-700">
                          {sender
                            ? `${sender.firstName} ${sender.lastName}`
                            : "—"}
                        </span>
                        <span>·</span>
                        <span>{timeAgo(m.createdAt)}</span>
                        {!m.read && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                            خوانده‌نشده
                          </span>
                        )}
                      </div>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${
                          isP1
                            ? "bg-zinc-100 text-zinc-800"
                            : "bg-[#F58220]/10 text-zinc-800"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {m.body}
                        </p>
                        {m.attachmentUrl && (
                          <a
                            href={m.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#F58220] hover:underline"
                          >
                            <Building2 className="h-3 w-3" />
                            پیوست
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  displayValue,
  icon,
  color,
}: {
  label: string;
  value: number;
  displayValue?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div
        className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${color}`}
      >
        {icon}
      </div>
      <p className="text-xl font-black text-zinc-900">
        {displayValue ?? value.toLocaleString("fa-IR")}
      </p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}
