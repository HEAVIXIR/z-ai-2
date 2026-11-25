import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

/* PATCH /api/locations/[id]?level=country|province|city — admin update. */
export async function PATCH(req: Request, { params }: Args) {
  const __auth = await requireAdminPermission("taxonomy.write"); if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const level = (searchParams.get("level") ?? "country").toLowerCase();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    if (level === "country") {
      const data: any = {};
      if ("name" in body) data.name = String(body.name);
      if ("nameEn" in body) data.nameEn = body.nameEn ?? null;
      if ("code" in body) data.code = body.code ? String(body.code).toUpperCase() : null;
      if ("phoneCode" in body) data.phoneCode = body.phoneCode ?? null;
      if ("sortOrder" in body) data.sortOrder = Number(body.sortOrder) || 0;
      const country = await db.country.update({ where: { id }, data });
      return NextResponse.json({ ok: true, country });
    }

    if (level === "province") {
      const data: any = {};
      if ("name" in body) data.name = String(body.name);
      if ("nameEn" in body) data.nameEn = body.nameEn ?? null;
      if ("code" in body) data.code = body.code ?? null;
      if ("sortOrder" in body) data.sortOrder = Number(body.sortOrder) || 0;
      const province = await db.province.update({ where: { id }, data });
      return NextResponse.json({ ok: true, province });
    }

    if (level === "city") {
      const data: any = {};
      if ("name" in body) data.name = String(body.name);
      if ("nameEn" in body) data.nameEn = body.nameEn ?? null;
      const hasLatitude = "latitude" in body;
      const hasLongitude = "longitude" in body;
      if (hasLatitude !== hasLongitude) {
        return NextResponse.json({ error: "latitude and longitude must be updated together" }, { status: 400 });
      }
      if (hasLatitude && hasLongitude) {
        const latitude = body.latitude == null || body.latitude === "" ? null : Number(body.latitude);
        const longitude = body.longitude == null || body.longitude === "" ? null : Number(body.longitude);
        if ((latitude === null) !== (longitude === null)) {
          return NextResponse.json({ error: "latitude and longitude must be provided together" }, { status: 400 });
        }
        if (
          (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
          (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
        ) {
          return NextResponse.json({ error: "coordinates are outside valid WGS84 bounds" }, { status: 400 });
        }
        data.latitude = latitude;
        data.longitude = longitude;
      }
      if ("sortOrder" in body) data.sortOrder = Number(body.sortOrder) || 0;
      const city = await db.city.update({ where: { id }, data });
      return NextResponse.json({ ok: true, city });
    }

    return NextResponse.json(
      { error: "level must be country | province | city" },
      { status: 400 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* DELETE /api/locations/[id]?level=country|province|city — admin delete. */
export async function DELETE(req: Request, { params }: Args) {
  const __auth = await requireAdminPermission("taxonomy.write"); if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const level = (searchParams.get("level") ?? "country").toLowerCase();

    if (level === "country") {
      await db.country.delete({ where: { id } });
    } else if (level === "province") {
      await db.province.delete({ where: { id } });
    } else if (level === "city") {
      await db.city.delete({ where: { id } });
    } else {
      return NextResponse.json(
        { error: "level must be country | province | city" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
