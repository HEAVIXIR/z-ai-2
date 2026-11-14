import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/service-types — public, ordered by sortOrder. */
export async function GET() {
  try {
    const types = await db.serviceType.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { nameFa: "asc" }],
      select: {
        id: true,
        key: true,
        nameFa: true,
        nameEn: true,
        description: true,
        icon: true,
        active: true,
        sortOrder: true,
      },
    });
    return NextResponse.json({ types });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/service-types — admin create. */
export async function POST(req: Request) {
  const __auth = await requireAdminPermission("taxonomy.write"); if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.key || !body.nameFa) {
      return NextResponse.json(
        { error: "key and nameFa are required" },
        { status: 400 },
      );
    }
    const dup = await db.serviceType.findUnique({
      where: { key: String(body.key).trim().toUpperCase() },
    });
    if (dup) {
      return NextResponse.json(
        { error: "key already exists" },
        { status: 409 },
      );
    }
    const type = await db.serviceType.create({
      data: {
        key: String(body.key).trim().toUpperCase(),
        nameFa: String(body.nameFa).trim(),
        nameEn: body.nameEn == null ? null : String(body.nameEn).trim(),
        description: body.description == null ? null : String(body.description).trim(),
        icon: body.icon == null ? null : String(body.icon).trim(),
        active: body.active !== false,
        sortOrder: Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
      },
    });
    return NextResponse.json({ ok: true, type });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: err?.code === "P2002" ? 409 : 500 },
    );
  }
}
