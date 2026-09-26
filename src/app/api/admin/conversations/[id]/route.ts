import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Allowed statuses for admin moderation ──────────────────────
// ACTIVE   — normal flow (default per schema)
// CLOSED   — admin has closed the conversation (terminal, no further
//            messages expected; participants can still read history)
// BLOCKED  — admin has blocked the conversation (frozen; new messages
//            should be rejected by the message-send route)
const ALLOWED_STATUSES = ["ACTIVE", "CLOSED", "BLOCKED"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

function isAllowedStatus(s: string): s is AllowedStatus {
  return (ALLOWED_STATUSES as readonly string[]).includes(s);
}

/* PATCH /api/admin/conversations/[id] — moderation action.
 *
 * Body: { status: 'ACTIVE' | 'CLOSED' | 'BLOCKED' }
 *
 * Only updates the `status` field on the Conversation row. The
 * message-send route (/api/conversations/[id]/messages) is
 * expected to honor CLOSED/BLOCKED by rejecting new messages.
 *
 * Permission: conversation.read (canonical admin oversight gate;
 *   the GET /admin/conversations page also uses conversation.read).
 *
 * Audit: logAudit('marketplace.conversation.update') — best-effort.
 */
export async function PATCH(
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
    const body = await req.json();
    const status = String(body?.status ?? "").toUpperCase();

    if (!isAllowedStatus(status)) {
      return NextResponse.json(
        {
          error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Fetch existing (for the audit `before` snapshot + 404 check)
    const existing = await db.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        participant1Id: true,
        participant2Id: true,
        listingId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // No-op short-circuit (avoid noisy audit + write when nothing changes)
    if (existing.status === status) {
      return NextResponse.json({
        ok: true,
        id: existing.id,
        status: existing.status,
        noop: true,
      });
    }

    // Only update the `status` field — moderation action only.
    const updated = await db.conversation.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });

    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "marketplace.conversation.update",
      entityType: "Conversation",
      entityId: id,
      before: { status: existing.status },
      after: { status },
      ip: getClientIp(req),
      reason: `admin moderation: set conversation status to ${status}`,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      id: updated.id,
      status: updated.status,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* GET /api/admin/conversations/[id] — fetch a single conversation
 * for moderation detail view (optional convenience endpoint).
 *
 * Permission: conversation.read
 */
export async function GET(
  _req: Request,
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
    const conversation = await db.conversation.findUnique({
      where: { id },
      include: {
        participant1: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mobile: true,
          },
        },
        participant2: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mobile: true,
          },
        },
        listing: { select: { id: true, title: true, slug: true } },
        _count: { select: { messages: true } },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ conversation });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
