import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

/* PATCH /api/service-types/[id] — admin update. */
export async function PATCH(req: Request, { params }: Args) {
  const __auth = await requireAdminPermission("taxonomy.write"); if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.serviceType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const data: any = {};
    const allowed = ["nameFa", "nameEn", "description", "icon", "active", "sortOrder"];
    for (const k of allowed) {
      if (k in body) {
        if (k === "active") {
          data[k] = Boolean(body[k]);
        } else if (k === "sortOrder") {
          const value = Number(body[k]);
          if (!Number.isInteger(value)) {
            return NextResponse.json({ error: "sortOrder must be an integer" }, { status: 400 });
          }
          data[k] = value;
        } else {
          data[k] = body[k] == null ? null : String(body[k]).trim();
        }
      }
    }
    if (body.key && body.key !== existing.key) {
      const dup = await db.serviceType.findUnique({
        where: { key: String(body.key).trim().toUpperCase() },
      });
      if (dup && dup.id !== id) {
        return NextResponse.json(
          { error: "key already exists" },
          { status: 409 },
        );
      }
      data.key = String(body.key).trim().toUpperCase();
    }
    const type = await db.serviceType.update({ where: { id }, data });
    return NextResponse.json({ ok: true, type });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: err?.code === "P2002" ? 409 : 500 },
    );
  }
}

/* DELETE /api/service-types/[id] — admin delete. */
export async function DELETE(req: Request, { params }: Args) {
  const __auth = await requireAdminPermission("taxonomy.write"); if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  try {
    const { id } = await params;
    await db.serviceType.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
