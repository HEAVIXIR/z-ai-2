import { NextResponse } from "next/server";
import { storeDb } from "@/lib/store-db";
import { getStoreUser } from "@/lib/store-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/store/wishlist — Authenticated wishlist endpoints

   STEP 12.84 P0 SECURITY FIX:
   Previously this endpoint was PUBLIC — anyone with a phone number
   could view or mutate another customer's wishlist. Now requires
   authenticated session. The session user's mobile is used to
   resolve the customer — phone from request body is ignored for
   authorization purposes (only used to CREATE a customer record
   if none exists, and only if it matches the session user's mobile).

   GET  (authenticated)      → list partIds in session user's wishlist
   POST (authenticated)      → add/remove
     { partId, action: "add" | "remove" }
   ============================================================ */

export async function GET(req: Request) {
  try {
    // P0 FIX: Require authenticated session.
    const sessionUser = await getStoreUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "احراز هویت الزامی است" }, { status: 401 });
    }

    const phone = sessionUser.mobile;
    if (!phone || phone.length < 8) {
      return NextResponse.json({ partIds: [] });
    }

    const customer = await storeDb.customer.findUnique({ where: { phone } });
    if (!customer) {
      return NextResponse.json({ partIds: [] });
    }

    // P0 FIX: Verify ownership — customer phone must match session user's mobile.
    // (Customer model has no userId field; phone is the ownership key.)
    if (customer.phone !== sessionUser.mobile) {
      return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    const rows = await storeDb.wishlist.findMany({
      where: { customerId: customer.id },
      select: { partId: true },
    });

    return NextResponse.json({ partIds: rows.map((r) => r.partId) });
  } catch (e: any) {
    console.error("[api/store/wishlist GET] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    // P0 FIX: Require authenticated session.
    const sessionUser = await getStoreUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "احراز هویت الزامی است" }, { status: 401 });
    }

    const body = await req.json();
    const partId = String(body.partId || "");
    const action = body.action === "remove" ? "remove" : "add";

    if (!partId) {
      return NextResponse.json({ error: "partId الزامی است" }, { status: 400 });
    }

    const part = await storeDb.part.findUnique({ where: { id: partId } });
    if (!part) {
      return NextResponse.json({ error: "قطعه یافت نشد" }, { status: 404 });
    }

    // P0 FIX: Use session user's phone, NOT body phone.
    const phone = sessionUser.mobile;
    if (!phone || phone.length < 8) {
      return NextResponse.json({ error: "شماره موبایل کاربر معتبر نیست" }, { status: 400 });
    }

    const customer = await storeDb.customer.upsert({
      where: { phone },
      update: {},
      create: { phone, name: sessionUser.firstName || "مشتری", family: sessionUser.lastName || "" },
    });

    // P0 FIX: Verify ownership — customer phone must match session user's mobile.
    if (customer.phone !== sessionUser.mobile) {
      return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    if (action === "add") {
      try {
        await storeDb.wishlist.create({
          data: { customerId: customer.id, partId },
        });
      } catch {
        // already wishlisted (unique constraint) — ignore
      }
    } else {
      await storeDb.wishlist.deleteMany({
        where: { customerId: customer.id, partId },
      });
    }

    const rows = await storeDb.wishlist.findMany({
      where: { customerId: customer.id },
      select: { partId: true },
    });

    return NextResponse.json({ partIds: rows.map((r) => r.partId) });
  } catch (e: any) {
    console.error("[api/store/wishlist POST] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
