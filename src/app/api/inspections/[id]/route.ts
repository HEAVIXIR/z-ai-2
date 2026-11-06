import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin as rbacIsAdmin } from "@/lib/authorization";
import { parseBig, parseNumber } from "@/lib/api-helpers";
import { scoreChecklist } from "@/lib/inspection-checklists";

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
    checklist: i.checklist ? JSON.parse(i.checklist) : null,
    photos: i.photos ? JSON.parse(i.photos) : null,
  };
}

/* GET /api/inspections/[id] — get inspection detail. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  // STEP 11.35 FIX: use RBAC isAdmin (not isAuthenticated which is true for ANY logged-in user).
  const user = await getCurrentUser();
  const admin = user ? await rbacIsAdmin(user.id) : false;
  if (!user && !admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const inspection = await db.inspection.findUnique({
      where: { id },
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            title: true,
            price: true,
            province: true,
            city: true,
            sellerId: true,
            images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 },
          },
        },
      },
    });
    if (!inspection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Non-admins may only see their own inspections.
    if (!admin && user) {
      const isOwner = inspection.requestedBy === user.id || inspection.listing?.sellerId === user.id;
      if (!isOwner) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    return NextResponse.json({ inspection: serialize(inspection) });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* PATCH /api/inspections/[id] — admin/inspector updates the inspection. */
const MAX_PATCH_BYTES = 64 * 1024;
const INSPECTION_STATUSES = new Set([
  "REQUESTED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

async function readBoundedPatchJson(req: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PATCH_BYTES) return null;

  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PATCH_BYTES) {
      try { await reader.cancel(); } catch { /* request already closed */ }
      return null;
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
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const admin = user ? await rbacIsAdmin(user.id) : false;
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id || id.length > 128) {
    return NextResponse.json({ error: "Invalid inspection ID" }, { status: 400 });
  }

  try {
    const body = await readBoundedPatchJson(req);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid or oversized request body" },
        { status: 400 },
      );
    }

    const data: any = {};
    const allowedKeys = new Set([
      "status", "scheduledDate", "completedAt", "inspectorId",
      "notes", "reportUrl", "photos", "checklist", "price",
    ]);
    if (Object.keys(body).length === 0 || Object.keys(body).some((key) => !allowedKeys.has(key))) {
      return NextResponse.json({ error: "Invalid inspection update fields" }, { status: 400 });
    }

    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !INSPECTION_STATUSES.has(body.status)) {
        return NextResponse.json({ error: "Invalid inspection status" }, { status: 400 });
      }
      data.status = body.status;
    }

    for (const field of ["scheduledDate", "completedAt"] as const) {
      if (body[field] !== undefined) {
        if (body[field] === null || body[field] === "") {
          data[field] = null;
        } else if (typeof body[field] === "string") {
          const date = new Date(body[field]);
          if (!Number.isFinite(date.getTime())) {
            return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
          }
          data[field] = date;
        } else {
          return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
        }
      }
    }

    if (body.inspectorId !== undefined) {
      if (body.inspectorId !== null && typeof body.inspectorId !== "string") {
        return NextResponse.json({ error: "Invalid inspector ID" }, { status: 400 });
      }
      const inspectorId = typeof body.inspectorId === "string" ? body.inspectorId.trim() : null;
      if (inspectorId && inspectorId.length > 128) {
        return NextResponse.json({ error: "Invalid inspector ID" }, { status: 400 });
      }
      if (inspectorId) {
        const eligibleInspector = await db.user.findFirst({
          where: {
            id: inspectorId,
            status: "ACTIVE",
            userRoles: { some: { role: { key: "ADMIN" } } },
          },
          select: { id: true },
        });
        if (!eligibleInspector) {
          return NextResponse.json(
            { error: "Inspector must be an active admin" },
            { status: 400 },
          );
        }
      }
      data.inspectorId = inspectorId;
    }

    if (body.notes !== undefined) {
      if (body.notes !== null && typeof body.notes !== "string") {
        return NextResponse.json({ error: "Invalid notes" }, { status: 400 });
      }
      const notes = typeof body.notes === "string" ? body.notes.trim() : null;
      if (notes && notes.length > 1000) {
        return NextResponse.json({ error: "Notes are too long" }, { status: 400 });
      }
      data.notes = notes || null;
    }

    if (body.reportUrl !== undefined) {
      if (body.reportUrl !== null && typeof body.reportUrl !== "string") {
        return NextResponse.json({ error: "Invalid report URL" }, { status: 400 });
      }
      const reportUrl = typeof body.reportUrl === "string" ? body.reportUrl.trim() : "";
      if (reportUrl && (reportUrl.length > 2048 || !isHttpUrl(reportUrl))) {
        return NextResponse.json({ error: "Invalid report URL" }, { status: 400 });
      }
      data.reportUrl = reportUrl || null;
    }

    if (body.photos !== undefined) {
      if (body.photos !== null && !Array.isArray(body.photos)) {
        return NextResponse.json({ error: "Invalid photos" }, { status: 400 });
      }
      const photos = Array.isArray(body.photos) ? body.photos : [];
      if (
        photos.length > 20 ||
        photos.some((photo) => typeof photo !== "string" || photo.length > 2048 || !isHttpUrl(photo))
      ) {
        return NextResponse.json({ error: "Invalid photos" }, { status: 400 });
      }
      data.photos = photos.length ? JSON.stringify(photos) : null;
    }

    if (body.checklist !== undefined) {
      if (!Array.isArray(body.checklist) || body.checklist.length > 200) {
        return NextResponse.json({ error: "Invalid checklist" }, { status: 400 });
      }
      const checklist = body.checklist;
      const validChecklist = checklist.every((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return false;
        const entry = item as Record<string, unknown>;
        return (
          typeof entry.item === "string" && entry.item.length <= 128 &&
          typeof entry.label === "string" && entry.label.length <= 300 &&
          (entry.passed === null || typeof entry.passed === "boolean") &&
          (entry.notes === undefined || (typeof entry.notes === "string" && entry.notes.length <= 500))
        );
      });
      if (!validChecklist) {
        return NextResponse.json({ error: "Invalid checklist" }, { status: 400 });
      }
      data.checklist = JSON.stringify(checklist);
      data.score = scoreChecklist(checklist as { passed: boolean | null }[]);
    }

    if (body.price !== undefined) {
      if (body.price !== null && body.price !== "" && typeof body.price !== "string" && typeof body.price !== "number") {
        return NextResponse.json({ error: "Invalid inspection price" }, { status: 400 });
      }
      try {
        const parsedPrice = body.price === null || body.price === "" ? null : parseBig(body.price);
        if (
          (body.price !== null && body.price !== "" && parsedPrice === null) ||
          (typeof parsedPrice === "bigint" && parsedPrice < 0n)
        ) {
          return NextResponse.json({ error: "Invalid inspection price" }, { status: 400 });
        }
        data.price = parsedPrice;
      } catch {
        return NextResponse.json({ error: "Invalid inspection price" }, { status: 400 });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid update fields" }, { status: 400 });
    }
    if (body.status === "COMPLETED" && !data.completedAt) {
      data.completedAt = new Date();
    }

    const updated = await db.inspection.update({
      where: { id },
      data,
      include: { listing: true },
    });
    return NextResponse.json({ inspection: serialize(updated) });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to update inspection" }, { status: 500 });
  }
}
