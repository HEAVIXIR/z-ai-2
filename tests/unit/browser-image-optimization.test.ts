import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  prepareImageForUpload,
} from "@/lib/browser-image-optimization";

afterEach(() => {
  vi.unstubAllGlobals();
});

function pngFile(size: number, width: number, height: number, animated = false): File {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  if (animated) bytes.set([0x61, 0x63, 0x54, 0x4c], 32); // APNG acTL chunk marker
  return new File([bytes], "large-image.png", { type: "image/png" });
}

describe("prepareImageForUpload", () => {
  it("returns files already below the cap without decoding or changing them", async () => {
    const file = new File([new Uint8Array(1024)], "small.png", { type: "image/png" });
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);

    const result = await prepareImageForUpload(file);

    expect(result.file).toBe(file);
    expect(result.compressed).toBe(false);
    expect(result.uploadBytes).toBe(file.size);
    expect(decode).not.toHaveBeenCalled();
  });

  it("compresses an oversized static PNG to bounded WebP before upload", async () => {
    const file = pngFile(MAX_IMAGE_UPLOAD_BYTES + 1, 4000, 3000);
    const bitmap = { width: 4000, height: 3000, close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    const context = { drawImage: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: BlobCallback) =>
        callback(new Blob([new Uint8Array(1024)], { type: "image/webp" })),
      ),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });

    const result = await prepareImageForUpload(file);

    expect(result.compressed).toBe(true);
    expect(result.file.type).toBe("image/webp");
    expect(result.file.name).toBe("large-image.webp");
    expect(result.uploadBytes).toBeLessThanOrEqual(MAX_IMAGE_UPLOAD_BYTES);
    expect(canvas.width).toBe(2560);
    expect(canvas.height).toBe(1920);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized dimensions before browser decoding", async () => {
    const file = pngFile(MAX_IMAGE_UPLOAD_BYTES + 1, 6001, 1);
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);

    await expect(prepareImageForUpload(file)).rejects.toThrow("ابعاد تصویر بیش از حد مجاز است.");
    expect(decode).not.toHaveBeenCalled();
  });

  it("refuses oversized animated PNGs rather than flattening animation", async () => {
    const file = pngFile(MAX_IMAGE_UPLOAD_BYTES + 1, 800, 600, true);
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);

    await expect(prepareImageForUpload(file)).rejects.toThrow("برای حفظ پویانمایی");
    expect(decode).not.toHaveBeenCalled();
  });

  it("rejects source files above the bounded 20 MiB pre-compression limit", async () => {
    const file = new File(
      [new Uint8Array(20 * 1024 * 1024 + 1)],
      "too-large.png",
      { type: "image/png" },
    );
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);

    await expect(prepareImageForUpload(file)).rejects.toThrow("بیش از ۲۰ مگابایت");
    expect(decode).not.toHaveBeenCalled();
  });
});
