/**
 * HEAVIX — Conversations Service Layer (Wave 2C / Phase Marketplace-Deep)
 * ------------------------------------------------------------
 * Extracted conversation lifecycle logic for the marketplace domain.
 *
 * Conversations are MAIN-DB entities (Conversation + Message models
 * in prisma/schema.prisma — see model definitions below).
 *
 * Schema reality (do NOT change the schema per Wave 2C constraints):
 *   model Conversation {
 *     id               String    @id @default(cuid())
 *     listingId        String?
 *     participant1Id   String
 *     participant2Id   String
 *     lastMessageAt    DateTime?
 *     lastMessagePreview String?
 *     status           String    @default("ACTIVE")
 *     createdAt        DateTime  @default(now())
 *     updatedAt       DateTime  @updatedAt
 *     messages         Message[]
 *     @@unique([participant1Id, participant2Id, listingId])
 *   }
 *
 *   model Message {
 *     id             String       @id @default(cuid())
 *     conversationId String
 *     senderId       String
 *     body           String       // ← task brief names this `content`;
 *                                 //   the schema column is `body`.
 *     attachmentUrl  String?
 *     read           Boolean      @default(false)
 *     readAt         DateTime?
 *     createdAt      DateTime     @default(now())
 *   }
 *
 *   Task brief mentions `status=CLOSED` and `status=BLOCKED`. The
 *   existing /api/admin/conversations/[id]/route.ts PATCH already
 *   accepts ACTIVE | CLOSED | BLOCKED (the schema comment says
 *   ACTIVE | ARCHIVED but the column is a free-text String and
 *   the admin route enforces the CLOSED/BLOCKED vocabulary).
 *
 * Responsibilities:
 *   - createConversation({ participant1Id, participant2Id, listingId,
 *       userId })
 *       Normalise participant order (smaller userId first — keeps
 *       the @@unique key stable per the schema note), then upsert
 *       by (p1, p2, listingId). Audit: marketplace.conversation.create.
 *
 *   - sendMessage(conversationId, senderId, content, userId?)
 *       Append a Message (body=content) + bump Conversation.
 *       lastMessageAt + lastMessagePreview. Rejects send on
 *       CLOSED/BLOCKED conversations (admin can re-activate first).
 *       Audit (admin only — actorType=ADMIN):
 *         marketplace.conversation.message.send.
 *
 *   - closeConversation(conversationId, userId)
 *       Flip status → CLOSED. Audit: marketplace.conversation.close.
 *
 *   - blockConversation(conversationId, reason, userId)
 *       Flip status → BLOCKED. The reason is captured in the
 *       audit `after.reason` (no dedicated schema column).
 *       Audit: marketplace.conversation.block.
 *
 *   - getConversationDetail(conversationId)
 *       Return the conversation with both participants, listing,
 *       _count.messages, and the latest messages (capped at 50 by
 *       default — the admin messages route handles pagination).
 *
 * Audit convention:
 *   - Action keys: marketplace.conversation.{create, message.send,
 *     close, block}.
 *   - entityType: Conversation (primary) | Message (for sendMessage).
 *   - actorType: ADMIN (admin actions; USER-actor send is left
 *     to the existing /api/conversations/[id]/messages POST route).
 *   - All audits are best-effort: logAudit never throws.
 *
 * Pattern mirrors src/lib/disputes-service.ts + the store-*-service
 * files. The existing /api/admin/conversations/[id]/route.ts (PATCH
 * for status moderation) is left untouched — it already handles the
 * ACTIVE/CLOSED/BLOCKED moderation via the route layer. This
 * service is the deeper layer used by the new admin messages route
 * and the new admin detail page.
 */

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// ── Service error (maps to HTTP status in route handler) ──
export class ConversationsServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ConversationsServiceError";
  }
}

// ── Conversation statuses ───────────────────────────────────
const STATUS_ACTIVE = "ACTIVE";
const STATUS_CLOSED = "CLOSED";
const STATUS_BLOCKED = "BLOCKED";

// ── Message body size limits ────────────────────────────────
const MAX_MESSAGE_BODY = 5000;
const MAX_BLOCK_REASON = 2000;

// ── createConversation ──────────────────────────────────────
/**
 * Create a conversation between two participants, optionally
 * tied to a Listing. The participant order is normalised so the
 * lexicographically smaller userId becomes participant1 (this
 * keeps the @@unique([p1, p2, listingId]) key stable, per the
 * schema note). Idempotent: returns the existing row if one
 * already exists for the same (p1, p2, listingId) triple.
 *
 * @throws ConversationsServiceError(400) on validation failure.
 */
export async function createConversation(params: {
  participant1Id: string;
  participant2Id: string;
  listingId?: string | null;
  userId?: string | null;
}): Promise<{
  id: string;
  status: string;
  participant1Id: string;
  participant2Id: string;
  listingId: string | null;
  existing: boolean;
}> {
  const {
    participant1Id,
    participant2Id,
    listingId = null,
    userId = null,
  } = params;

  if (!participant1Id || !participant2Id) {
    throw new ConversationsServiceError(
      400,
      "participant1Id و participant2Id الزامی هستند",
    );
  }
  if (participant1Id === participant2Id) {
    throw new ConversationsServiceError(
      400,
      "نمی‌توان مکالمه با خود کاربر ایجاد کرد",
    );
  }

  // Normalise: smaller userId becomes participant1
  const [p1, p2] =
    participant1Id < participant2Id
      ? [participant1Id, participant2Id]
      : [participant2Id, participant1Id];

  // Look up an existing conversation for this triple first
  // (the @@unique key is (p1, p2, listingId) — but on PostgreSQL,
  // NULL listingId is treated as distinct, so we explicitly look
  // up the (p1, p2, listingId-or-null) triple).
  const whereClause: any = {
    participant1Id: p1,
    participant2Id: p2,
    ...(listingId ? { listingId } : { listingId: null }),
  };
  const existing = await db.conversation.findFirst({
    where: whereClause,
    select: {
      id: true,
      status: true,
      participant1Id: true,
      participant2Id: true,
      listingId: true,
    },
  });

  if (existing) {
    return { ...existing, existing: true };
  }

  const conversation = await db.conversation.create({
    data: {
      participant1Id: p1,
      participant2Id: p2,
      listingId: listingId ?? null,
      status: STATUS_ACTIVE,
    },
    select: {
      id: true,
      status: true,
      participant1Id: true,
      participant2Id: true,
      listingId: true,
    },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: "ADMIN",
    action: "marketplace.conversation.create",
    entityType: "Conversation",
    entityId: conversation.id,
    after: {
      participant1Id: p1,
      participant2Id: p2,
      listingId: listingId ?? null,
    },
    reason: `ایجاد مکالمه جدید بین ${p1} و ${p2}`,
  });

  return { ...conversation, existing: false };
}

// ── sendMessage ─────────────────────────────────────────────
/**
 * Append a Message to a conversation. The Message.body field is
 * populated from the `content` parameter (the schema column is
 * `body`, but the Wave 2C task brief uses the more conventional
 * name `content` — the route layer maps content→body).
 *
 * Rejects sends on CLOSED/BLOCKED conversations (admin must
 * re-activate via /api/admin/conversations/[id] PATCH first).
 *
 * The audit is recorded only when the caller is an admin
 * (userId is provided AND is treated as ADMIN by the route
 * layer). USER-actor send audits are handled by the existing
 * /api/conversations/[id]/messages POST route
 * (action=message.send, actorType=USER). This service is the
 * admin-only path for moderator-initiated messages.
 *
 * @throws ConversationsServiceError(400) on validation failure.
 * @throws ConversationsServiceError(404) when the conversation
 *   does not exist.
 * @throws ConversationsServiceError(409) when the conversation
 *   is CLOSED or BLOCKED (terminal — no new messages).
 */
export async function sendMessage(params: {
  conversationId: string;
  senderId: string;
  content: string;
  attachmentUrl?: string | null;
  userId?: string | null;
  isAdmin?: boolean;
}): Promise<{
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: Date;
}> {
  const {
    conversationId,
    senderId,
    content,
    attachmentUrl = null,
    userId = null,
    isAdmin = true,
  } = params;

  if (!conversationId || !senderId) {
    throw new ConversationsServiceError(
      400,
      "conversationId و senderId الزامی هستند",
    );
  }
  const text = String(content ?? "").trim().slice(0, MAX_MESSAGE_BODY);
  if (!text && !attachmentUrl) {
    throw new ConversationsServiceError(
      400,
      "متن پیام یا پیوست الزامی است",
    );
  }

  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, status: true },
  });
  if (!conv) {
    throw new ConversationsServiceError(404, "مکالمه یافت نشد");
  }
  if (conv.status !== STATUS_ACTIVE) {
    throw new ConversationsServiceError(
      409,
      `مکالمه در وضعیت ${conv.status} است — امکان ارسال پیام وجود ندارد`,
    );
  }

  const message = await db.message.create({
    data: {
      conversationId,
      senderId,
      body: text || "(فایل پیوست)",
      attachmentUrl: attachmentUrl ?? null,
      read: false,
    },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      body: true,
      createdAt: true,
    },
  });

  // Bump Conversation lastMessageAt + lastMessagePreview
  await db.conversation
    .update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: text.slice(0, 100) || "(فایل)",
      },
    })
    .catch(() => {
      /* non-fatal */
    });

  // Admin-only audit (USER-actor send is audited by the existing
  // /api/conversations/[id]/messages POST route as message.send).
  if (isAdmin) {
    await logAudit({
      actorId: userId ?? senderId,
      actorType: "ADMIN",
      action: "marketplace.conversation.message.send",
      entityType: "Message",
      entityId: message.id,
      after: {
        conversationId,
        senderId,
        bodyPreview: text.slice(0, 100),
      },
      reason: `ارسال پیام در مکالمه ${conversationId}`,
    });
  }

  return message;
}

// ── closeConversation ──────────────────────────────────────
/**
 * Flip a conversation's status → CLOSED. The status is the only
 * mutated field (per the existing /api/admin/conversations/[id]
 * PATCH contract — moderation actions only). Idempotent: a
 * no-op if the conversation is already CLOSED.
 *
 * @throws ConversationsServiceError(404) when the conversation
 *   does not exist.
 */
export async function closeConversation(
  conversationId: string,
  userId?: string | null,
): Promise<{
  id: string;
  status: string;
}> {
  if (!conversationId) {
    throw new ConversationsServiceError(
      400,
      "conversationId الزامی است",
    );
  }
  const before = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, status: true },
  });
  if (!before) {
    throw new ConversationsServiceError(404, "مکالمه یافت نشد");
  }
  // No-op if already closed
  if (before.status === STATUS_CLOSED) {
    return { id: before.id, status: before.status };
  }

  const after = await db.conversation.update({
    where: { id: conversationId },
    data: { status: STATUS_CLOSED },
    select: { id: true, status: true },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: "ADMIN",
    action: "marketplace.conversation.close",
    entityType: "Conversation",
    entityId: conversationId,
    before: { status: before.status },
    after: { status: after.status },
    reason: `بستن مکالمه ${conversationId}`,
  });

  return after;
}

// ── blockConversation ───────────────────────────────────────
/**
 * Flip a conversation's status → BLOCKED. The reason is captured
 * in the audit `after.reason` field (no dedicated schema column).
 *
 * @throws ConversationsServiceError(400) when conversationId or
 *   reason is empty.
 * @throws ConversationsServiceError(404) when the conversation
 *   does not exist.
 */
export async function blockConversation(
  conversationId: string,
  reason: string,
  userId?: string | null,
): Promise<{
  id: string;
  status: string;
}> {
  if (!conversationId) {
    throw new ConversationsServiceError(
      400,
      "conversationId الزامی است",
    );
  }
  if (!reason || !reason.trim()) {
    throw new ConversationsServiceError(
      400,
      "دلیل مسدودسازی الزامی است",
    );
  }

  const before = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, status: true },
  });
  if (!before) {
    throw new ConversationsServiceError(404, "مکالمه یافت نشد");
  }
  // No-op if already blocked
  if (before.status === STATUS_BLOCKED) {
    return { id: before.id, status: before.status };
  }

  const trimmedReason = reason.trim().slice(0, MAX_BLOCK_REASON);
  const after = await db.conversation.update({
    where: { id: conversationId },
    data: { status: STATUS_BLOCKED },
    select: { id: true, status: true },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: "ADMIN",
    action: "marketplace.conversation.block",
    entityType: "Conversation",
    entityId: conversationId,
    before: { status: before.status },
    after: {
      status: after.status,
      reason: trimmedReason,
    },
    reason: `مسدودسازی مکالمه ${conversationId} — ${trimmedReason}`,
  });

  return after;
}

// ── getConversationDetail ───────────────────────────────────
/**
 * Return the conversation with both participants, the listing
 * (if any), _count.messages, and the latest N messages (default
 * 50) for the admin detail view. The admin messages route
 * handles full pagination via ?before=<iso>&limit=<n>.
 *
 * @throws ConversationsServiceError(404) when the conversation
 *   does not exist.
 */
export async function getConversationDetail(
  conversationId: string,
  messageLimit = 50,
): Promise<{
  id: string;
  status: string;
  listingId: string | null;
  participant1Id: string;
  participant2Id: string;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  createdAt: Date;
  updatedAt: Date;
  listing: {
    id: string;
    title: string;
    slug: string;
  } | null;
  participant1: {
    id: string;
    firstName: string;
    lastName: string;
    mobile: string;
    email: string;
  } | null;
  participant2: {
    id: string;
    firstName: string;
    lastName: string;
    mobile: string;
    email: string;
  } | null;
  messages: Array<{
    id: string;
    senderId: string;
    body: string;
    attachmentUrl: string | null;
    read: boolean;
    readAt: Date | null;
    createdAt: Date;
  }>;
  messagesCount: number;
}> {
  if (!conversationId) {
    throw new ConversationsServiceError(
      400,
      "conversationId الزامی است",
    );
  }

  // Cap the message preview window to avoid unbounded queries.
  const limit = Math.max(1, Math.min(200, messageLimit));

  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      listing: {
        select: { id: true, title: true, slug: true },
      },
      participant1: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          mobile: true,
          email: true,
        },
      },
      participant2: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          mobile: true,
          email: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: limit,
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

  if (!conv) {
    throw new ConversationsServiceError(404, "مکالمه یافت نشد");
  }

  return {
    id: conv.id,
    status: conv.status,
    listingId: conv.listingId,
    participant1Id: conv.participant1Id,
    participant2Id: conv.participant2Id,
    lastMessageAt: conv.lastMessageAt,
    lastMessagePreview: conv.lastMessagePreview,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    listing: conv.listing,
    participant1: conv.participant1,
    participant2: conv.participant2,
    messages: conv.messages,
    messagesCount: conv._count.messages,
  };
}

// ── listMessages ────────────────────────────────────────────
/**
 * Paginated message list for a conversation. Used by the admin
 * messages route GET /api/admin/conversations/[id]/messages.
 *
 * Pagination: ?before=<iso> returns the page of messages older
 * than the given timestamp. The default limit is 50, capped at
 * 100. Messages are returned newest-first (the same ordering
 * used by the existing public route).
 *
 * @throws ConversationsServiceError(404) when the conversation
 *   does not exist.
 */
export async function listMessages(
  conversationId: string,
  options: { before?: Date | null; limit?: number } = {},
): Promise<{
  messages: Array<{
    id: string;
    senderId: string;
    body: string;
    attachmentUrl: string | null;
    read: boolean;
    readAt: Date | null;
    createdAt: Date;
  }>;
  hasMore: boolean;
}> {
  if (!conversationId) {
    throw new ConversationsServiceError(
      400,
      "conversationId الزامی است",
    );
  }

  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });
  if (!conv) {
    throw new ConversationsServiceError(404, "مکالمه یافت نشد");
  }

  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  const where: any = { conversationId };
  if (options.before) where.createdAt = { lt: options.before };

  // Fetch limit+1 to detect "hasMore" without a separate count.
  const rows = await db.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: {
      id: true,
      senderId: true,
      body: true,
      attachmentUrl: true,
      read: true,
      readAt: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const messages = hasMore ? rows.slice(0, limit) : rows;

  return { messages, hasMore };
}
