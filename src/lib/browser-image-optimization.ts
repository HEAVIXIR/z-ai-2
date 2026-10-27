export const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DECODED_PIXELS = 16_000_000;
const MAX_IMAGE_DIMENSION = 6_000;
const MAX_OUTPUT_DIMENSION = 2_560;
const MAX_OUTPUT_PIXELS = 8_000_000;
const HEADER_SCAN_BYTES = 2 * 1024 * 1024;

type ImageDimensions = { width: number; height: number; animated: boolean };

export interface PreparedImageUpload {
  file: File;
  originalBytes: number;
  uploadBytes: number;
  compressed: boolean;
}

function readU24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined) break;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if (sof.has(marker)) {
      if (length < 7) return null;
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        animated: false,
      };
    }
    offset += length;
  }
  return null;
}

function parseDimensions(bytes: Uint8Array): ImageDimensions | null {
  // PNG / APNG
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const animated = bytes.subarray(8).some((_, i) => {
      const j = i + 8;
      return j + 4 <= bytes.length &&
        bytes[j] === 0x61 && bytes[j + 1] === 0x63 && bytes[j + 2] === 0x54 && bytes[j + 3] === 0x4c;
    });
    return { width: view.getUint32(16), height: view.getUint32(20), animated };
  }

  // GIF is deliberately never canvas-compressed because doing so would flatten animation.
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return {
      width: bytes[6] | (bytes[7] << 8),
      height: bytes[8] | (bytes[9] << 8),
      animated: true,
    };
  }

  // BMP
  if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: Math.abs(view.getInt32(18, true)),
      height: Math.abs(view.getInt32(22, true)),
      animated: false,
    };
  }

  // WebP (VP8X, VP8L, or VP8). Detect animated WebP chunks before decode.
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    const animated = bytes.subarray(12).some((_, i) => {
      const j = i + 12;
      return j + 4 <= bytes.length &&
        ((bytes[j] === 0x41 && bytes[j + 1] === 0x4e && bytes[j + 2] === 0x49 && bytes[j + 3] === 0x4d) ||
         (bytes[j] === 0x41 && bytes[j + 1] === 0x4e && bytes[j + 2] === 0x4d && bytes[j + 3] === 0x46));
    });
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === "VP8X") {
      return { width: 1 + readU24LE(bytes, 24), height: 1 + readU24LE(bytes, 27), animated };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
      const height = 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10));
      return { width, height, animated };
    }
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, animated };
    }
    return null;
  }

  return readJpegDimensions(bytes);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== "image/webp") {
          reject(new Error("مرورگر نتوانست تصویر WebP بسازد."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`
    : `${Math.max(1, Math.round(bytes / 1024))} کیلوبایت`;
}

/**
 * Compress only oversized static raster images before upload. Header dimensions
 * are checked before decoding; animated formats are rejected rather than
 * flattened. The server still performs independent magic-byte/decode checks.
 */
export async function prepareImageForUpload(
  file: File,
  maxBytes = MAX_IMAGE_UPLOAD_BYTES,
): Promise<PreparedImageUpload> {
  const limit = Math.min(maxBytes, MAX_IMAGE_UPLOAD_BYTES);
  if (file.size <= limit) {
    return { file, originalBytes: file.size, uploadBytes: file.size, compressed: false };
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("حجم تصویر اصلی بیش از ۲۰ مگابایت است؛ تصویر کوچک‌تری انتخاب کنید.");
  }

  const header = new Uint8Array(await file.slice(0, Math.min(file.size, HEADER_SCAN_BYTES)).arrayBuffer());
  const dimensions = parseDimensions(header);
  if (!dimensions) {
    throw new Error("این فرمت تصویر برای فشرده‌سازی مرورگری پشتیبانی نمی‌شود.");
  }
  if (dimensions.animated) {
    throw new Error("برای حفظ پویانمایی، فایل متحرک بزرگ‌تر از ۴ مگابایت را باید کوچک‌تر کنید.");
  }
  if (
    !dimensions.width ||
    !dimensions.height ||
    dimensions.width > MAX_IMAGE_DIMENSION ||
    dimensions.height > MAX_IMAGE_DIMENSION ||
    dimensions.width * dimensions.height > MAX_DECODED_PIXELS
  ) {
    throw new Error("ابعاد تصویر بیش از حد مجاز است.");
  }

  if (typeof createImageBitmap !== "function") {
    throw new Error("فشرده‌سازی تصویر در این مرورگر پشتیبانی نمی‌شود.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width > MAX_IMAGE_DIMENSION ||
      bitmap.height > MAX_IMAGE_DIMENSION ||
      bitmap.width * bitmap.height > MAX_DECODED_PIXELS
    ) {
      throw new Error("ابعاد تصویر بیش از حد مجاز است.");
    }

    let scale = Math.min(
      1,
      MAX_OUTPUT_DIMENSION / bitmap.width,
      MAX_OUTPUT_DIMENSION / bitmap.height,
      Math.sqrt(MAX_OUTPUT_PIXELS / (bitmap.width * bitmap.height)),
    );

    for (let resizeAttempt = 0; resizeAttempt < 4; resizeAttempt++) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("فشرده‌سازی تصویر در این مرورگر در دسترس نیست.");
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.86, 0.8, 0.74, 0.68]) {
        const blob = await canvasToBlob(canvas, quality);
        if (blob.size <= limit) {
          const name = file.name.replace(/\.[^.]+$/, "") || "image";
          const optimized = new File([blob], `${name}.webp`, {
            type: "image/webp",
            lastModified: Date.now(),
          });
          return {
            file: optimized,
            originalBytes: file.size,
            uploadBytes: optimized.size,
            compressed: true,
          };
        }
      }
      scale *= 0.8;
    }
  } finally {
    bitmap.close();
  }

  throw new Error("تصویر پس از فشرده‌سازی همچنان بزرگ‌تر از حد مجاز است؛ تصویر کوچک‌تری انتخاب کنید.");
}

export function describeCompression(result: PreparedImageUpload): string | null {
  if (!result.compressed) return null;
  return `حجم تصویر از ${formatBytes(result.originalBytes)} به ${formatBytes(result.uploadBytes)} کاهش یافت.`;
}
