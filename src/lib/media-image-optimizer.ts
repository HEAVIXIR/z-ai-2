import decodeJpeg, { init as initJpegDecode } from "@jsquash/jpeg/decode";
import decodePng, { init as initPngDecode } from "@jsquash/png/decode";
import encodePng, { init as initPngEncode } from "@jsquash/png/encode";
import decodeWebp, { init as initWebpDecode } from "@jsquash/webp/decode";
import encodeWebp, { init as initWebpEncode } from "@jsquash/webp/encode";
import resizeImage, { initResize } from "@jsquash/resize";
import JPEG_DEC_WASM_URL from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
import PNG_WASM_URL from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm";
import WEBP_DEC_WASM_URL from "@jsquash/webp/codec/dec/webp_dec.wasm";
import WEBP_ENC_WASM_URL from "@jsquash/webp/codec/enc/webp_enc.wasm";
import RESIZE_WASM_URL from "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm";
import type { ImageType } from "@/lib/upload-security";

const MAX_INPUT_PIXELS = 12_000_000;
const MAX_DIMENSION = 6_000;
const MAX_OUTPUT_DIMENSION = 2_560;

export interface OptimizedImage {
  buffer: Buffer;
  type: ImageType;
  ext: string;
  mime: string;
  reencoded: boolean;
}

const OUTPUT_FORMATS: Record<ImageType, { ext: string; mime: string }> = {
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  png: { ext: "png", mime: "image/png" },
  webp: { ext: "webp", mime: "image/webp" },
};

let codecsReady: Promise<void> | null = null;

function toArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy.buffer;
}

async function loadInlineWasm(dataUrl: string): Promise<ArrayBuffer> {
  if (!dataUrl.startsWith("data:")) {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error("Unable to load image codec.");
    return response.arrayBuffer();
  }
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("Invalid embedded image codec.");
  const binary = atob(dataUrl.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function initializeCodecs(): Promise<void> {
  if (!codecsReady) {
    codecsReady = Promise.all([
      loadInlineWasm(JPEG_DEC_WASM_URL),
      loadInlineWasm(PNG_WASM_URL),
      loadInlineWasm(WEBP_DEC_WASM_URL),
      loadInlineWasm(RESIZE_WASM_URL),
    ])
      .then(async ([jpegWasm, pngWasm, webpDecodeWasm, resizeWasm]) => {
        // Use the portable scalar encoder in Node/Vitest and Workerd alike.
        const webpEncodeWasm = await loadInlineWasm(WEBP_ENC_WASM_URL);
        await Promise.all([
          initJpegDecode(jpegWasm),
          initPngDecode(pngWasm),
          initPngEncode(pngWasm),
          initWebpDecode(webpDecodeWasm),
          initWebpEncode(webpEncodeWasm),
          initResize(resizeWasm),
        ]);
      })
      .catch((error) => {
        // Allow a later request to retry a transient WASM initialization error.
        codecsReady = null;
        throw error;
      });
  }
  await codecsReady;
}

function assertDimensions(image: ImageData): void {
  const { width, height, data } = image;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width * height > MAX_INPUT_PIXELS ||
    data.length !== width * height * 4
  ) {
    throw new Error("Image dimensions exceed the supported limit");
  }
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset++;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];
    if (marker === 0x00 || marker === 0x01 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (startOfFrame.has(marker) && segmentLength >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (chunkSize > buffer.length - data) return null;
    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        width: readUInt24LE(buffer, data + 4) + 1,
        height: readUInt24LE(buffer, data + 7) + 1,
      };
    }
    if (chunkType === "VP8 " && chunkSize >= 10 &&
        buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
      };
    }
    if (chunkType === "VP8L" && chunkSize >= 5 && buffer[data] === 0x2f) {
      const bits = buffer[data + 1] | (buffer[data + 2] << 8) | (buffer[data + 3] << 16) | (buffer[data + 4] << 24);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    offset = data + chunkSize + (chunkSize & 1);
  }
  return null;
}

function readImageDimensions(buffer: Buffer, type: ImageType): { width: number; height: number } | null {
  if (type === "png") {
    if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (type === "jpeg") return readJpegDimensions(buffer);
  return readWebpDimensions(buffer);
}

function assertHeaderDimensions(buffer: Buffer, type: ImageType): void {
  const dimensions = readImageDimensions(buffer, type);
  if (!dimensions) throw new Error("Image could not be decoded");
  const { width, height } = dimensions;
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width <= 0 || height <= 0 ||
      width > MAX_DIMENSION || height > MAX_DIMENSION ||
      width * height > MAX_INPUT_PIXELS) {
    throw new Error("Image dimensions exceed the supported limit");
  }
}

async function resizeIfNeeded(image: ImageData): Promise<ImageData> {
  const longestEdge = Math.max(image.width, image.height);
  if (longestEdge <= MAX_OUTPUT_DIMENSION) return image;

  const ratio = MAX_OUTPUT_DIMENSION / longestEdge;
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));
  return resizeImage(image, {
    width,
    height,
    method: "lanczos3",
    fitMethod: "contain",
    premultiply: true,
    linearRGB: true,
  });
}

/**
 * Cloudflare Workerd-compatible image normalization.
 *
 * The previous implementation depended on Sharp's native Node binding and
 * failed when the actual Worker route executed. This implementation uses
 * single-threaded WebAssembly codecs with explicit module initialization:
 * JPEG/PNG/WebP decode, Lanczos resize, PNG lossless output and WebP output.
 *
 * GIF and BMP are deliberately rejected at the upload-security boundary.
 * Animated images are not silently flattened. This module is exercised by the
 * OpenNext Workerd smoke route; it must not acquire Node-native dependencies.
 */
export async function optimizeImageBuffer(
  buffer: Buffer,
  detectedType: ImageType,
): Promise<OptimizedImage> {
  if (!buffer || buffer.length < 12) {
    throw new Error("Image could not be decoded");
  }
  if (detectedType !== "jpeg" && detectedType !== "png" && detectedType !== "webp") {
    throw new Error("Unsupported image format");
  }

  // Reject oversized headers before decoding to avoid decompression-bomb allocations.
  assertHeaderDimensions(buffer, detectedType);
  await initializeCodecs();

  const input = toArrayBuffer(buffer);
  let image: ImageData;
  if (detectedType === "jpeg") {
    image = await decodeJpeg(input, { preserveOrientation: true });
  } else if (detectedType === "png") {
    image = await decodePng(input);
  } else {
    image = await decodeWebp(input);
  }

  assertDimensions(image);
  const normalized = await resizeIfNeeded(image);
  assertDimensions(normalized);

  if (detectedType === "png") {
    const output = await encodePng(normalized, { bitDepth: 8 });
    return {
      buffer: Buffer.from(output),
      type: "png",
      ext: OUTPUT_FORMATS.png.ext,
      mime: OUTPUT_FORMATS.png.mime,
      reencoded: true,
    };
  }

  // Preserve exact decoded pixels for existing WebP inputs. JPEG sources use
  // lossy WebP at a bounded quality; the output never retains EXIF metadata.
  const webpOptions = detectedType === "webp"
    ? { quality: 100, lossless: 1, exact: 1, method: 4 }
    : { quality: 82, method: 4 };
  const output = await encodeWebp(normalized, webpOptions);
  return {
    buffer: Buffer.from(output),
    type: "webp",
    ext: OUTPUT_FORMATS.webp.ext,
    mime: OUTPUT_FORMATS.webp.mime,
    reencoded: true,
  };
}
