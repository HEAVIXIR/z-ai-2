import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  checkCsrf: vi.fn(),
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  getAsset: vi.fn(),
  attachAsset: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { listing: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/csrf", () => ({ checkCsrf: mocks.checkCsrf }));
vi.mock("@/lib/media-service", () => ({
  getAsset: mocks.getAsset,
  attachAsset: mocks.attachAsset,
}));

import { POST } from "@/app/api/listings/[id]/media/route";

const listingId = "listing-123";
const user = { id: "seller-1" };
const stagedAsset = {
  id: "0123456789abcdef01234567",
  uploadedBy: user.id,
  entityType: "Listing",
  status: "STAGED",
  visibility: "PRIVATE",
  entityId: null,
};

function request() {
  return new Request("https://heavix.example/api/listings/listing-123/media", {
    method: "POST",
  });
}

function context(id = listingId) {
  return { params: Promise.resolve({ id }) };
}

function listing(images: Array<{ url: string }> = [
  { url: `/api/media/${stagedAsset.id}` },
]) {
  return { id: listingId, sellerId: user.id, images };
}

async function responseBody(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkCsrf.mockReturnValue(true);
  mocks.getCurrentUser.mockResolvedValue(user);
  mocks.findUnique.mockResolvedValue(listing());
  mocks.getAsset.mockResolvedValue(stagedAsset);
  mocks.attachAsset.mockResolvedValue({ ok: true });
});

describe("POST /api/listings/[id]/media behavioral recovery contract", () => {
  it("rejects failed CSRF before authentication or database access", async () => {
    mocks.checkCsrf.mockReturnValue(false);

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    expect(await responseBody(response)).toEqual({ error: "CSRF check failed" });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rejects anonymous callers before reading listing data", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await POST(request(), context());

    expect(response.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.getAsset).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing listing", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await POST(request(), context());

    expect(response.status).toBe(404);
    expect(mocks.getAsset).not.toHaveBeenCalled();
  });

  it("prevents a different seller from triggering attachment", async () => {
    mocks.findUnique.mockResolvedValue({ ...listing(), sellerId: "seller-2" });

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(mocks.attachAsset).not.toHaveBeenCalled();
  });

  it("attaches only the seller's private staged asset to the same listing", async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      ok: true,
      attachedCount: 1,
      pendingCount: 0,
      mediaStatus: "ATTACHED",
    });
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: listingId },
      select: {
        id: true,
        sellerId: true,
        images: { select: { url: true }, orderBy: { sortOrder: "asc" } },
      },
    });
    expect(mocks.getAsset).toHaveBeenCalledWith(stagedAsset.id);
    expect(mocks.attachAsset).toHaveBeenCalledWith(
      stagedAsset.id,
      "Listing",
      listingId,
      user.id,
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("treats an already attached asset on this listing as idempotent success", async () => {
    mocks.getAsset.mockResolvedValue({
      ...stagedAsset,
      status: "ATTACHED",
      visibility: "PUBLIC",
      entityId: listingId,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toMatchObject({
      attachedCount: 1,
      pendingCount: 0,
      mediaStatus: "ATTACHED",
    });
    expect(mocks.attachAsset).not.toHaveBeenCalled();
  });

  it.each([
    ["another seller's asset", { ...stagedAsset, uploadedBy: "seller-2" }],
    ["another entity type", { ...stagedAsset, entityType: "Avatar" }],
    ["a non-private staged asset", { ...stagedAsset, visibility: "PUBLIC" }],
    ["an asset already bound elsewhere", { ...stagedAsset, entityId: "listing-other" }],
    ["an asset in an invalid lifecycle state", { ...stagedAsset, status: "DELETED" }],
    ["an asset attached to another listing", {
      ...stagedAsset,
      status: "ATTACHED",
      visibility: "PUBLIC",
      entityId: "listing-other",
    }],
  ])("leaves %s pending without attaching it", async (_label, asset) => {
    mocks.getAsset.mockResolvedValue(asset);

    const response = await POST(request(), context());

    expect(response.status).toBe(202);
    expect(await responseBody(response)).toMatchObject({
      ok: false,
      attachedCount: 0,
      pendingCount: 1,
      mediaStatus: "PENDING",
    });
    expect(mocks.attachAsset).not.toHaveBeenCalled();
  });

  it("keeps unsupported manifest URLs pending and never calls the media service", async () => {
    mocks.findUnique.mockResolvedValue(
      listing([{ url: "https://external.example/image.webp" }]),
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(202);
    expect(await responseBody(response)).toMatchObject({
      pendingCount: 1,
      mediaStatus: "PENDING",
    });
    expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(mocks.attachAsset).not.toHaveBeenCalled();
  });

  it("continues safely when an asset lookup fails", async () => {
    mocks.getAsset.mockRejectedValue(new Error("storage unavailable"));

    const response = await POST(request(), context());

    expect(response.status).toBe(202);
    expect(await responseBody(response)).toMatchObject({
      attachedCount: 0,
      pendingCount: 1,
      mediaStatus: "PENDING",
    });
  });

  it("reports a failed attach as pending and does not claim success", async () => {
    mocks.attachAsset.mockResolvedValue({ ok: false });

    const response = await POST(request(), context());

    expect(response.status).toBe(202);
    expect(await responseBody(response)).toMatchObject({
      ok: false,
      attachedCount: 0,
      pendingCount: 1,
      mediaStatus: "PENDING",
    });
  });

  it("continues safely when attachment throws", async () => {
    mocks.attachAsset.mockRejectedValue(new Error("storage write failed"));

    const response = await POST(request(), context());

    expect(response.status).toBe(202);
    expect(await responseBody(response)).toMatchObject({
      attachedCount: 0,
      pendingCount: 1,
      mediaStatus: "PENDING",
    });
  });

  it("preserves manifest order and independently counts attached and pending images", async () => {
    const secondId = "abcdef0123456789abcdef01";
    mocks.findUnique.mockResolvedValue(
      listing([
        { url: `/api/media/${stagedAsset.id}` },
        { url: `/api/media/${secondId}` },
      ]),
    );
    mocks.getAsset
      .mockResolvedValueOnce(stagedAsset)
      .mockResolvedValueOnce(null);

    const response = await POST(request(), context());

    expect(response.status).toBe(202);
    expect(mocks.getAsset.mock.calls).toEqual([[stagedAsset.id], [secondId]]);
    expect(await responseBody(response)).toMatchObject({
      attachedCount: 1,
      pendingCount: 1,
      mediaStatus: "PENDING",
    });
  });

  it("returns a generic 500 response when the manifest query fails", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database detail"));

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    expect(await responseBody(response)).toEqual({
      error: "بازیابی تصاویر در حال حاضر کامل نشد.",
    });
  });
});

describe("listing creation wizard media recovery wiring", () => {
  const wizard = readFileSync("src/app/listings/new/page.tsx", "utf8");

  it("calls the canonical listing media retry endpoint and displays pending state", () => {
    expect(wizard).toContain('`/api/listings/${encodeURIComponent(mediaRepairListingId)}/media`');
    expect(wizard).toContain("result.pendingCount");
    expect(wizard).toContain("retryMediaAttachment");
  });
});



describe("canonical listing submission gates", () => {
  const wizard = readFileSync("src/app/listings/new/page.tsx", "utf8");
  const listingApi = readFileSync("src/app/api/listings/route.ts", "utf8");
  const wantedApi = readFileSync("src/app/api/wanted/route.ts", "utf8");

  it("persists the seller-scoped idempotency receipt in the listing transaction", () => {
    expect(listingApi).toContain('createHash("sha256").update(`${user.id}:${idempotencyKey}`).digest("hex")');
    expect(listingApi).toContain("await logAuditStrict({");
    expect(listingApi).toContain("}, tx);");
    expect(listingApi).toContain("if (!durableIdempotencyKey)");
    expect(listingApi).not.toContain("idempotencyKey: idempotencyKey ?? null");
  });

  it("allows a successfully loaded category with no configured technical attributes", () => {
    expect(wizard).toContain("return attributesLoaded && Object.keys(errs).length === 0;");
    expect(wizard).not.toContain("attributesLoaded && attributeDefs.length > 0");
  });

  it("enforces canonical province selection for supply listing creation", () => {
    expect(listingApi).toContain('if (!selectedProvince)');
    expect(listingApi).toContain("انتخاب کشور و استان برای ثبت آگهی الزامی است.");
  });

  it("enforces canonical province selection for wanted request creation", () => {
    expect(wantedApi).toContain('if (!resolvedProvince)');
    expect(wantedApi).toContain("انتخاب کشور و استان برای ثبت درخواست الزامی است.");
  });
});

describe("listing edit media recovery wiring", () => {
  const editRoute = readFileSync("src/app/api/listings/[id]/route.ts", "utf8");
  const editForm = readFileSync("src/app/admin/listings/[id]/edit/ListingEditForm.tsx", "utf8");

  it("preserves failed staged-image manifest rows for the canonical retry endpoint", () => {
    expect(editRoute).toContain("let mediaPendingCount = 0");
    expect(editRoute).toContain('mediaStatus: mediaPendingCount > 0 ? "PENDING" : "ATTACHED"');
    expect(editRoute).toContain("mediaPendingCount += 1");
    expect(editRoute).not.toContain('await db.listingImage.deleteMany({ where: { listingId: id, url: asset.url } })');
  });

  it("exposes seller-side retry from the shared listing editor", () => {
    expect(editForm).toContain("retryMediaRecovery");
    expect(editForm).toContain('`/api/listings/${encodeURIComponent(initial.id)}/media`');
    expect(editForm).toContain("بررسی و بازیابی تصاویر");
    expect(editForm).toContain("setMediaPendingCount");
    expect(editForm).toContain('endpoint={isAdmin ? "/api/admin/upload" : "/api/media/staging"}');
  });
});
