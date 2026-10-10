import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/* POST /api/rejections/[id]/messages — admin reply. Body: { message } */
export async function POST(req: Request, { params }: Params) {
  const __auth = await requireAdminPermission("moderation.moderate"); if (__auth.error) return __auth.error;
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    const rec = await db.listingRejection.findUnique({ where: { id } });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const msg = await db.rejectionMessage.create({
      data: {
        rejectionId: id,
        senderRole: "ADMIN",
        senderName: body.senderName ?? "مدیریت",
        message,
      },
    });
    return NextResponse.json({
      ok: true,
      success: true,
      id: msg.id,
      createdAt: msg.createdAt,
      message: msg,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* PATCH /api/rejections/[id]/messages — resolve/reopen. Body: { status } */
export async function PATCH(req: Request, { params }: Params) {
  const __auth = await requireAdminPermission("moderation.moderate"); if (__auth.error) return __auth.error;
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const status = String(body.status ?? "").trim();
    if (!["OPEN", "RESOLVED"].includes(status)) {
      return NextResponse.json(
        { error: "status must be OPEN or RESOLVED" },
        { status: 400 },
      );
    }
    const rec = await db.listingRejection.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json({ ok: true, rejection: rec });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
