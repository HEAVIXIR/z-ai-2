import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { optimizeImageBuffer } from "@/lib/media-image-optimizer";

describe("optimizeImageBuffer", () => {
  it("re-encodes JPEG with orientation applied and embedded metadata removed", async () => {
    const input = await sharp({
      create: {
        width: 32,
        height: 16,
        channels: 3,
        background: { r: 200, g: 80, b: 20 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const output = await optimizeImageBuffer(input, "jpeg");
    const metadata = await sharp(output.buffer).metadata();

    expect(output.reencoded).toBe(true);
    expect(["jpeg", "webp"]).toContain(output.type);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.width).toBe(16);
    expect(metadata.height).toBe(32);
    expect(output.ext).toBe(output.type === "jpeg" ? "jpg" : "webp");
    expect(output.mime).toBe(output.type === "jpeg" ? "image/jpeg" : "image/webp");
  });

  it("keeps PNG lossless and strips metadata while selecting a safe output format", async () => {
    const input = await sharp({
      create: {
        width: 24,
        height: 24,
        channels: 4,
        background: { r: 20, g: 160, b: 220, alpha: 0.5 },
      },
    })
      .png()
      .withMetadata({ density: 144 })
      .toBuffer();

    const output = await optimizeImageBuffer(input, "png");
    const metadata = await sharp(output.buffer).metadata();

    expect(output.reencoded).toBe(true);
    expect(["png", "webp"]).toContain(output.type);
    expect(metadata.density).not.toBe(144);
    expect(output.mime).toBe(output.type === "png" ? "image/png" : "image/webp");
  });

  it("does not add another lossy generation when normalizing WebP", async () => {
    const input = await sharp({
      create: {
        width: 18,
        height: 12,
        channels: 3,
        background: { r: 12, g: 140, b: 210 },
      },
    })
      .webp({ quality: 65 })
      .toBuffer();
    const before = await sharp(input).raw().toBuffer();

    const output = await optimizeImageBuffer(input, "webp");
    const after = await sharp(output.buffer).raw().toBuffer();

    expect(output.type).toBe("webp");
    expect(output.reencoded).toBe(true);
    expect(after.equals(before)).toBe(true);
  });

  it("rejects images over the configured dimension limit", async () => {
    const oversized = await sharp({
      create: {
        width: 6001,
        height: 1,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .png()
      .toBuffer();

    await expect(optimizeImageBuffer(oversized, "png")).rejects.toThrow(
      "Image dimensions exceed the supported limit",
    );
  });

  it("rejects malformed buffers even when called directly", async () => {
    await expect(
      optimizeImageBuffer(Buffer.from("not an image"), "jpeg"),
    ).rejects.toThrow();
  });
});
