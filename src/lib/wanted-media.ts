import { db } from "@/lib/db";
import { getAsset, attachAsset } from "@/lib/media-service";

export interface WantedMediaRetryResult {
  requestFound: boolean;
  ownerAuthorized: boolean;
  attachedCount: number;
  pendingCount: number;
}

/**
 * Reconcile the durable BuyRequestImage manifest with private B2 sidecars.
 * Only the owning buyer can trigger this operation. Existing attachments are
 * accepted only when they already point to this exact BuyRequest.
 */
export async function retryBuyRequestMediaAttachments(
  buyRequestId: string,
  userId: string,
): Promise<WantedMediaRetryResult> {
  const request = await db.buyRequest.findUnique({
    where: { id: buyRequestId },
    select: {
      id: true,
      userId: true,
      images: {
        select: { assetId: true, url: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!request) {
    return { requestFound: false, ownerAuthorized: false, attachedCount: 0, pendingCount: 1 };
  }
  if (!userId || request.userId !== userId) {
    return { requestFound: true, ownerAuthorized: false, attachedCount: 0, pendingCount: request.images.length || 1 };
  }

  let attachedCount = 0;
  let pendingCount = 0;

  for (const image of request.images) {
    // The persisted relational manifest is canonical. Do not accept an
    // arbitrary URL or a different asset identifier from a caller.
    const urlMatch = /^\/api\/media\/([a-f0-9]{24})$/.exec(image.url);
    if (!urlMatch || urlMatch[1] !== image.assetId) {
      pendingCount++;
      continue;
    }

    let asset;
    try {
      asset = await getAsset(image.assetId);
    } catch {
      pendingCount++;
      continue;
    }

    if (
      !asset ||
      asset.id !== image.assetId ||
      asset.url !== image.url ||
      asset.uploadedBy !== userId ||
      asset.entityType !== "BuyRequest"
    ) {
      pendingCount++;
      continue;
    }

    // Idempotent success is allowed only for this exact request.
    if (asset.status === "ATTACHED") {
      if (asset.entityId === request.id) attachedCount++;
      else pendingCount++;
      continue;
    }

    if (
      asset.status !== "STAGED" ||
      asset.visibility !== "PRIVATE" ||
      asset.entityId !== null ||
      !asset.relativePath.includes("/staging/")
    ) {
      pendingCount++;
      continue;
    }

    try {
      const result = await attachAsset(asset.id, "BuyRequest", request.id, userId);
      if (result.ok) attachedCount++;
      else pendingCount++;
    } catch {
      pendingCount++;
    }
  }

  return { requestFound: true, ownerAuthorized: true, attachedCount, pendingCount };
}
