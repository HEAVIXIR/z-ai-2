/**
 * Apply all requested listing-image changes atomically.
 * Callers must validate ownership of every referenced image before invoking.
 */
export async function mutateListingImages(db: any, listingId: string, body: any) {
  const hasAdd = Array.isArray(body.addImages);
  const hasRemove = Array.isArray(body.removeImages);
  const hasReorder = Array.isArray(body.reorderImages);
  const hasPrimary = Boolean(body.setPrimaryImage);
  if (!hasAdd && !hasRemove && !hasReorder && !hasPrimary) return null;

  return db.$transaction(async (tx: any) => {
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

    if (hasRemove && body.removeImages.length) {
      await tx.listingImage.deleteMany({
        where: { listingId, id: { in: body.removeImages.map(String) } },
      });
    }

    if (hasPrimary) {
      await tx.listingImage.updateMany({
        where: { listingId },
        data: { isPrimary: false },
      });
      await tx.listingImage.updateMany({
        where: { listingId, id: String(body.setPrimaryImage) },
        data: { isPrimary: true },
      });
    }

    if (hasReorder) {
      for (let idx = 0; idx < body.reorderImages.length; idx++) {
        await tx.listingImage.updateMany({
          where: { listingId, id: String(body.reorderImages[idx]) },
          data: { sortOrder: idx },
        });
      }
    }

    return { added: hasAdd, removed: hasRemove && body.removeImages.length > 0, primary: hasPrimary, reordered: hasReorder };
  });
}
