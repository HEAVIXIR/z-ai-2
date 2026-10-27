import sharp from "sharp";
import type { ImageType } from "@/lib/upload-security";

const MAX_INPUT_PIXELS = 16_000_000;
const MAX_DIMENSION = 6_000;

export interface OptimizedImage {
  buffer: Buffer;
  type: ImageType;
  ext: string;
  mime: string;
  /** False only when an animated/multi-page image is intentionally preserved. */
  reencoded: boolean;
}

const OUTPUT_FORMATS: Record<ImageType, { ext: string; mime: string }> = {
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  png: { ext: "png", mime: "image/png" },
  gif: { ext: "gif", mime: "image/gif" },
  webp: { ext: "webp", mime: "image/webp" },
  bmp: { ext: "bmp", mime: "image/bmp" },
};

function result(buffer: Buffer, type: ImageType, reencoded: boolean): OptimizedImage {
  const format = OUTPUT_FORMATS[type];
  return { buffer, type, ext: format.ext, mime: format.mime, reencoded };
}

/**
 * Validate decoded dimensions and re-encode static images to strip embedded
 * metadata (including EXIF) and reduce storage. Input byte limits are enforced
 * by validateImageBuffer before this helper is called.
 *
 * Animated/multi-page images are preserved byte-for-byte to avoid silently
 * flattening animation. This is a bounded, Node-only operation; callers must
 * never invoke it before authentication and upload-size checks.
 */
export async function optimizeImageBuffer(
  buffer: Buffer,
  detectedType: ImageType,
): Promise<OptimizedImage> {
  const options = {
    limitInputPixels: MAX_INPUT_PIXELS,
    failOn: "error" as const,
    animated: true,
  };

  const metadata = await sharp(buffer, options).metadata();
  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_INPUT_PIXELS) {
    throw new Error("Image dimensions exceed the supported limit");
  }

  // Do not flatten GIF/APNG or any other multi-page image.
  if ((metadata.pages ?? 1) > 1) {
    return result(buffer, detectedType, false);
  }

  if (detectedType === "png") {
    const webp = await sharp(buffer, options)
      .rotate()
      .webp({ lossless: true, effort: 4 })
      .toBuffer();

    if (webp.length < buffer.length) {
      return result(webp, "webp", true);
    }

    // Preserve lossless PNG pixels when lossless WebP is not smaller.
    const png = await sharp(buffer, options)
      .rotate()
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    return result(png, "png", true);
  }

  if (detectedType === "jpeg") {
    const webp = await sharp(buffer, options)
      .rotate()
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    const jpeg = await sharp(buffer, options)
      .rotate()
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    return webp.length < jpeg.length
      ? result(webp, "webp", true)
      : result(jpeg, "jpeg", true);
  }

  // Static WebP, BMP and GIF are normalized to WebP. Metadata is not copied.
  const webp = await sharp(buffer, options)
    .rotate()
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
  return result(webp, "webp", true);
}
