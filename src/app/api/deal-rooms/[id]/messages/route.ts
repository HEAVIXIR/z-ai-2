import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit-check";
import { MESSAGING } from "@/lib/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/deal-rooms/[id]/messages — send a chat message in the deal room. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    // ── Rate limit (MESSAGING preset, 30/h/user) ──
    const rl = enforceRateLimit(user.id, MESSAGING);
    if (!rl.ok) return rl.response;

    const room = await db.dealRoom.findUnique({
      where: { id },
      select: { id: true, buyerId: true, sellerId: true },
    });
    if (!room) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const isBuyer = room.buyerId === user.id;
    const isSeller = room.sellerId === user.id;
    if (!isBuyer && !isSeller) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const message = String(body.message ?? "").trim();
    const attachmentUrl = body.attachmentUrl ? String(body.attachmentUrl) : null;
    if (!message && !attachmentUrl) {
      return NextResponse.json(
        { error: "message یا attachmentUrl الزامی است" },
        { status: 400 },
      );
    }
    const msg = await db.dealMessage.create({
      data: {
        dealRoomId: id,
        senderRole: isBuyer ? "BUYER" : "SELLER",
        senderName: `${user.firstName} ${user.lastName}`.trim(),
        message: message || "",
        attachmentUrl,
      },
    });
    await db.dealRoom.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    });
    return NextResponse.json({ message: msg }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
