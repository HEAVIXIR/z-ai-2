/**
 * Apply all requested listing-image changes atomically.
 * Callers validate ownership before updating the listing; this helper repeats
 * the ownership check inside the transaction to close the validation/write race.
 */
export async function mutateListingImages(db: any, listingId: string, body: any) {
  const hasAdd = Array.isArray(body.addImages) && body.addImages.length > 0;
  const hasRemove = Array.isArray(body.removeImages) && body.removeImages.length > 0;
  const hasReorder = Array.isArray(body.reorderImages) && body.reorderImages.length > 0;
  const hasPrimary = Boolean(body.setPrimaryImage);
  if (!hasAdd && !hasRemove && !hasReorder && !hasPrimary) return null;

  const removeIds = hasRemove ? body.removeImages.map(String) : [];
  const reorderIds = hasReorder ? body.reorderImages.map(String) : [];
  if (new Set(removeIds).size !== removeIds.length) {
    throw Object.assign(new Error("Duplicate image IDs in removeImages"), { status: 400 });
  }
  if (new Set(reorderIds).size !== reorderIds.length) {
    throw Object.assign(new Error("Duplicate image IDs in reorderImages"), { status: 400 });
  }
  const removed = new Set(removeIds);
  if (hasPrimary && removed.has(String(body.setPrimaryImage))) {
    throw Object.assign(new Error("The primary image cannot also be removed"), { status: 400 });
  }
  if (reorderIds.some((imageId) => removed.has(imageId))) {
    throw Object.assign(new Error("An image cannot be removed and reordered in the same request"), { status: 400 });
  }

  return db.$transaction(async (tx: any) => {
    const referencedIds = [
      ...new Set([
        ...removeIds,
        ...(hasPrimary ? [String(body.setPrimaryImage)] : []),
        ...reorderIds,
      ]),
    ];
    if (referencedIds.length) {
      const ownedImages = await tx.listingImage.findMany({
        where: { listingId, id: { in: referencedIds } },
        select: { id: true },
      });
      const ownedIds = new Set(ownedImages.map((image: any) => String(image.id)));
      if (referencedIds.some((imageId) => !ownedIds.has(imageId))) {
        throw Object.assign(new Error("One or more images no longer belong to this listing"), { status: 400 });
      }
    }

    if (hasAdd) {
      const existingCount = await tx.listingImage.count({ where: { listingId } });
      await tx.listingImage.createMany({
        data: body.addImages.map((img: any, idx: number) => ({
          listingId,
          url: String(img.url ?? img),
          alt: img.alt ?? null,
          isPrimary: img.isPrimary ?? (existingCount === 0 && idx === 0),
          sortOrder: img.sortOrder ?? existingCount + idx,
        })),
      });
    }

    if (hasRemove && removeIds.length) {
      await tx.listingImage.deleteMany({
        where: { listingId, id: { in: removeIds } },
      });
    }

    if (hasPrimary) {
      await tx.listingImage.updateMany({
        where: { listingId },
        data: { isPrimary: false },
      });
      const selected = await tx.listingImage.updateMany({
        where: { listingId, id: String(body.setPrimaryImage) },
        data: { isPrimary: true },
      });
      if (selected.count !== 1) {
        throw Object.assign(new Error("Unable to select the primary image"), { status: 400 });
      }
    } else if (hasRemove && removeIds.length) {
      const currentPrimary = await tx.listingImage.findFirst({
        where: { listingId, isPrimary: true },
        select: { id: true },
      });
      if (!currentPrimary) {
        const fallback = await tx.listingImage.findFirst({
          where: { listingId },
          orderBy: { sortOrder: "asc" },
          select: { id: true },
        });
        if (fallback) {
          await tx.listingImage.updateMany({
            where: { listingId, id: fallback.id },
            data: { isPrimary: true },
          });
        }
      }
    }

    if (hasReorder) {
      for (let idx = 0; idx < reorderIds.length; idx++) {
        await tx.listingImage.updateMany({
          where: { listingId, id: reorderIds[idx] },
          data: { sortOrder: idx },
        });
      }
    }

    return { added: hasAdd, removed: hasRemove && removeIds.length > 0, primary: hasPrimary, reordered: hasReorder };
  });
}
