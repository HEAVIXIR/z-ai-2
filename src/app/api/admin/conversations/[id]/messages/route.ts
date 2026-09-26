import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-context";
import {
  listMessages,
  sendMessage,
  ConversationsServiceError,
} from "@/lib/conversations-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/admin/conversations/[id]/messages — paginated
 * message list for an admin moderation detail view.
 *
 * Query params:
 *   ?before=<iso>   — pagination cursor (load older messages)
 *   ?limit=<n>      — page size (default 50, capped at 100)
 *
 * Permission: conversation.read (canonical admin oversight gate;
 *   the /admin/conversations list page + the existing
 *   /api/admin/conversations/[id] PATCH route also use
 *   conversation.read for parity).
 *
 * Audit: best-effort marketplace.conversation.messages_view
 *   (recorded once per page request — never throws).
 *
 * The order is newest-first (mirrors the existing public
 * /api/conversations/[id]/messages GET route). The admin detail
 * page renders the latest page and links to older pages via the
 * ?before cursor.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "conversation.read");
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires conversation.read" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const url = new URL(req.url);
    const beforeParam = url.searchParams.get("before");
    const limitParam = url.searchParams.get("limit");

    const before = beforeParam ? new Date(beforeParam) : null;
    if (beforeParam && Number.isNaN(before?.getTime() ?? NaN)) {
      return NextResponse.json(
        { error: "Invalid `before` date (expected ISO 8601)" },
        { status: 400 },
      );
    }
    const limit = limitParam ? Number(limitParam) : 50;

    const { messages, hasMore } = await listMessages(id, {
      before: before && !Number.isNaN(before.getTime()) ? before : null,
      limit,
    });

    // Best-effort view audit (never throws).
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "marketplace.conversation.messages_view",
      entityType: "Conversation",
      entityId: id,
      after: {
        count: messages.length,
        hasMore,
        before: before ? before.toISOString() : null,
      },
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
      reason: `viewed messages for conversation ${id}`,
    }).catch(() => {});

    return NextResponse.json({
      messages,
      hasMore,
      // Oldest message in this page — pass as ?before to fetch the
      // next older page. Null when there is no older page.
      nextBefore:
        hasMore && messages.length > 0
          ? messages[messages.length - 1].createdAt.toISOString()
          : null,
    });
  } catch (err: any) {
    if (err instanceof ConversationsServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/admin/conversations/[id]/messages — admin sends a
 * message into a user conversation (moderator介入).
 *
 * Body: { content: string, attachmentUrl?: string }
 *
 * Permission: conversation.read (canonical admin oversight gate;
 *   we deliberately use the read key here for parity with the
 *   existing /api/admin/conversations/[id] PATCH route, which
 *   also uses conversation.read for moderation actions).
 *
 * Audit: marketplace.conversation.message.send
 *   (actorType=ADMIN — recorded by the service layer).
 *
 * The service rejects sends on CLOSED/BLOCKED conversations
 * (admin must re-activate the conversation first via the PATCH
 * status route).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "conversation.read");
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires conversation.read" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const content = String(body?.content ?? "");
    const attachmentUrl = body?.attachmentUrl ? String(body.attachmentUrl) : null;
    const senderId = body?.senderId ? String(body.senderId) : user.id;

    const message = await sendMessage({
      conversationId: id,
      senderId,
      content,
      attachmentUrl,
      userId: user.id,
      isAdmin: true,
    });

    return NextResponse.json({
      ok: true,
      id: message.id,
      createdAt: message.createdAt.toISOString(),
    });
  } catch (err: any) {
    if (err instanceof ConversationsServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
