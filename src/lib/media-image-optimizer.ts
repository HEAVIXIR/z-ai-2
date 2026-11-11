import decodeJpeg, { init as initJpegDecode } from "@jsquash/jpeg/decode";
import decodePng, { init as initPngDecode } from "@jsquash/png/decode";
import encodePng, { init as initPngEncode } from "@jsquash/png/encode";
import decodeWebp, { init as initWebpDecode } from "@jsquash/webp/decode";
import encodeWebp, { init as initWebpEncode } from "@jsquash/webp/encode";
import resizeImage, { initResize } from "@jsquash/resize";
import { simd } from "wasm-feature-detect";
import JPEG_DEC_WASM_URL from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
import PNG_WASM_URL from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm";
import WEBP_DEC_WASM_URL from "@jsquash/webp/codec/dec/webp_dec.wasm";
import WEBP_ENC_SIMD_WASM_URL from "@jsquash/webp/codec/enc/webp_enc_simd.wasm";
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
      simd(),
    ])
      .then(async ([jpegWasm, pngWasm, webpDecodeWasm, resizeWasm, supportsSimd]) => {
        const webpEncodeWasm = await loadInlineWasm(
          supportsSimd ? WEBP_ENC_SIMD_WASM_URL : WEBP_ENC_WASM_URL,
        );
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
