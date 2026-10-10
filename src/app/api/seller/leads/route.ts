import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authorization";
import { validateTransition, isLeadStatus, LEAD_STATUSES } from "@/lib/crm/lead-status";

/* ============================================================
   /api/seller/leads — CRM for sellers
   GET  — list leads for current user's listings (scoped by sellerId)
   PATCH — update lead status/note { id, status?, note? }

   STEP 11.39 PR-SC-06:
   - Added store.crm.read permission check on GET
   - Added store.crm.manage permission check on PATCH
   - Fixed status filter (Lead.status exists from PR #9)
   - Added PATCH handler with ownership + transition validation
   - Ownership: lead.listing.sellerId === user.id (server-side)
   - No cross-seller data: sellerId derived from session, never from request body
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allowed fields for PATCH (mass-assignment prevention)
const PATCHABLE_FIELDS = ["status", "note"] as const;

export async function GET(req: NextRequest) {
  // 1. Authentication
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Authorization — store.crm.read
  const hasCRMRead = await can(user.id, "store.crm.read");
  if (!hasCRMRead) {
    return NextResponse.json(
      { error: "Forbidden: requires 'store.crm.read'" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") || "";

  // 3. Seller scope — get user's listing IDs (server-side identity)
  const userListings = await db.listing.findMany({
    where: { sellerId: user.id },
    select: { id: true, title: true, slug: true },
  });
  const listingIds = userListings.map((l) => l.id);
  const listingMap: Record<string, any> = {};
  userListings.forEach((l) => { listingMap[l.id] = l; });

  // 4. Build query — scoped by seller's listings + optional status filter
  const where: Record<string, unknown> = { listingId: { in: listingIds } };
  // STEP 11.39 FIX: Lead.status exists (PR #9) — use it for filtering
  if (statusFilter && isLeadStatus(statusFilter)) {
    where.status = statusFilter;
  }

  const leads = await db.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // 5. Stats — by status AND by type
  const stats = {
    total: leads.length,
    byType: {
      CALL: leads.filter((l) => l.leadType === "CALL").length,
      MESSAGE: leads.filter((l) => l.leadType === "MESSAGE").length,
      FAVORITE: leads.filter((l) => l.leadType === "FAVORITE").length,
      CONTACT: leads.filter((l) => l.leadType === "CONTACT").length,
      VIEW: leads.filter((l) => l.leadType === "VIEW").length,
      OFFER: leads.filter((l) => l.leadType === "OFFER").length,
    },
    byStatus: {
      NEW: leads.filter((l) => l.status === "NEW").length,
      CONTACTED: leads.filter((l) => l.status === "CONTACTED").length,
      QUALIFIED: leads.filter((l) => l.status === "QUALIFIED").length,
      CLOSED: leads.filter((l) => l.status === "CLOSED").length,
      LOST: leads.filter((l) => l.status === "LOST").length,
    },
    listingCount: new Set(leads.map((l) => l.listingId)).size,
  };

  return NextResponse.json({
    success: true,
    stats,
    data: leads.map((l) => ({
      ...l,
      listing: listingMap[l.listingId] || null,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}

/* PATCH /api/seller/leads — update lead status/note
   Body: { id: string, status?: string, note?: string }

   Authorization:
   - getCurrentUser() → 401 if anonymous
   - can(user.id, "store.crm.manage") → 403 if lacking
   - Ownership: lead.listing.sellerId === user.id (server-side, atomic)
   - Status transition: validated via validateTransition()
   - Mass-assignment prevention: only status + note are patchable
*/
export async function PATCH(req: NextRequest) {
  // 1. Authentication
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Authorization — store.crm.manage (write permission)
  const hasCRMManage = await can(user.id, "store.crm.manage");
  if (!hasCRMManage) {
    return NextResponse.json(
      { error: "Forbidden: requires 'store.crm.manage'" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const leadId = String(body.id);

  // 3. Ownership check — load lead + listing, verify sellerId === user.id
  //    This is an ATOMIC ownership check: the lead is loaded with its listing
  //    and the sellerId is checked BEFORE any update. A non-owner gets 404
  //    (not 403 — don't leak existence of other sellers' leads).
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: {
      listing: {
        select: { id: true, sellerId: true, title: true, slug: true },
      },
    },
  });

  if (!lead || !lead.listing || lead.listing.sellerId !== user.id) {
    // 404 — don't leak existence of leads owned by other sellers
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // 4. Build update data — only allow patchable fields
  const updateData: Record<string, unknown> = {};

  // 4a. Status transition (if requested)
  if (body.status !== undefined) {
    const newStatus = String(body.status);
    if (!isLeadStatus(newStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Allowed: ${LEAD_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    // Validate transition
    const transition = validateTransition(lead.status || "NEW", newStatus);
    if (!transition.ok) {
      return NextResponse.json(
        { error: transition.error },
        { status: 409 }, // Conflict — illegal transition
      );
    }
    updateData.status = newStatus;
  }

  // 4b. Note update (if requested)
  if (body.note !== undefined) {
    updateData.note = body.note === null ? null : String(body.note).slice(0, 5000);
  }

  // 5. Reject if no patchable fields provided
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: `No patchable fields provided. Allowed: ${PATCHABLE_FIELDS.join(", ")}` },
      { status: 400 },
    );
  }

  // 6. Perform the update — ownership already verified above
  try {
    const updated = await db.lead.update({
      where: { id: leadId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        listing: lead.listing,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    console.error("[seller/leads] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 },
    );
  }
}
