import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseBig } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit-check";
import { INSPECTION_CREATE } from "@/lib/rate-limit-presets";

const MAX_INSPECTION_REQUEST_BYTES = 16 * 1024;

async function readBoundedJson(
  req: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; tooLarge: boolean }> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INSPECTION_REQUEST_BYTES) {
    return { ok: false, tooLarge: true };
  }

  const reader = req.body?.getReader();
  if (!reader) return { ok: false, tooLarge: false };

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_INSPECTION_REQUEST_BYTES) {
      try { await reader.cancel(); } catch { /* request already closed */ }
      return { ok: false, tooLarge: true };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, tooLarge: false };
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(i: any) {
  return {
    ...i,
    price: i.price ? i.price.toString() : null,
    listing: i.listing
      ? {
          ...i.listing,
          price: i.listing.price ? i.listing.price.toString() : null,
        }
      : null,
  };
}

/* POST /api/inspections — request a new inspection. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rateLimit = enforceRateLimit(user.id, INSPECTION_CREATE);
  if (!rateLimit.ok) return rateLimit.response;
  try {
    const parsed = await readBoundedJson(req);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.tooLarge ? "Request body too large" : "Invalid JSON body" },
        { status: parsed.tooLarge ? 413 : 400 },
      );
    }
    if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const body = parsed.value as Record<string, unknown>;
    const listingId = String(body.listingId ?? "").trim();
    const dealRoomId = body.dealRoomId ? String(body.dealRoomId) : null;
    const notes = body.notes ? String(body.notes).trim() : null;
    if (listingId.length > 128 || (dealRoomId && dealRoomId.length > 128) || (notes && notes.length > 1000)) {
      return NextResponse.json({ error: "Invalid inspection request fields" }, { status: 400 });
    }
    if (!listingId) {
      return NextResponse.json(
        { error: "listingId الزامی است" },
        { status: 400 },
      );
    }
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: { id: true, title: true },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (dealRoomId) {
      const dealRoom = await db.dealRoom.findUnique({
        where: { id: dealRoomId },
        select: { listingId: true, buyerId: true, sellerId: true },
      });
      if (
        !dealRoom ||
        dealRoom.listingId !== listingId ||
        (dealRoom.buyerId !== user.id && dealRoom.sellerId !== user.id)
      ) {
        return NextResponse.json({ error: "Invalid deal room for this inspection request" }, { status: 400 });
      }
    }
    const inspection = await db.inspection.create({
      data: {
        listingId,
        dealRoomId,
        requestedBy: user.id,
        status: "REQUESTED",
        notes,
      },
      include: { listing: true },
    });
    return NextResponse.json({ inspection: serialize(inspection) }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* GET /api/inspections — list inspections requested by or relevant to the user. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Inspections requested by this user OR for listings they own.
    const userListingIds = await db.listing.findMany({
      where: { sellerId: user.id },
      select: { id: true },
    });
    const ids = userListingIds.map((l) => l.id);
    const inspections = await db.inspection.findMany({
      where: {
        OR: [{ requestedBy: user.id }, { listingId: { in: ids } }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            title: true,
            price: true,
            province: true,
            city: true,
            images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 },
          },
        },
      },
    });
    return NextResponse.json({
      inspections: inspections.map((i) => ({
        ...i,
        price: i.price ? i.price.toString() : null,
        listing: i.listing
          ? {
              ...i.listing,
              price: i.listing.price ? i.listing.price.toString() : null,
            }
          : null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
