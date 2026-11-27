import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveUploadPath } from "@/lib/media-service";

const temporaryRoots: string[] = [];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "heavix-media-path-"));
  temporaryRoots.push(root);
  const uploadRoot = path.join(root, "uploads");
  const outsideRoot = path.join(root, "outside");
  await fs.mkdir(path.join(uploadRoot, "nested"), { recursive: true });
  await fs.mkdir(outsideRoot, { recursive: true });
  return { root, uploadRoot, outsideRoot };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true }),
  ));
});

describe("media upload path filesystem behavior", () => {
  it("accepts a contained path and rejects traversal and absolute paths", async () => {
    const { uploadRoot } = await fixture();

    await expect(resolveUploadPath("nested/image.webp", uploadRoot))
      .resolves.toBe(path.join(uploadRoot, "nested", "image.webp"));
    await expect(resolveUploadPath("../../outside/escape.webp", uploadRoot))
      .resolves.toBeNull();
    await expect(resolveUploadPath(path.resolve(uploadRoot, "absolute.webp"), uploadRoot))
      .resolves.toBeNull();
  });

  it("rejects a parent directory symlink that escapes the upload root", async () => {
    const { uploadRoot, outsideRoot } = await fixture();
    await fs.symlink(outsideRoot, path.join(uploadRoot, "linked"), "dir");

    await expect(resolveUploadPath("linked/escape.webp", uploadRoot))
      .resolves.toBeNull();
  });

  it("rejects a symlinked binary and a symlinked sidecar", async () => {
    const { uploadRoot, outsideRoot } = await fixture();
    const outsideFile = path.join(outsideRoot, "outside.webp");
    await fs.writeFile(outsideFile, "outside");

    await fs.symlink(outsideFile, path.join(uploadRoot, "nested", "binary.webp"));
    await expect(resolveUploadPath("nested/binary.webp", uploadRoot))
      .resolves.toBeNull();

    await fs.writeFile(path.join(uploadRoot, "nested", "sidecar.webp"), "binary");
    await fs.symlink(
      outsideFile,
      path.join(uploadRoot, "nested", "sidecar.webp.meta.json"),
    );
    await expect(resolveUploadPath("nested/sidecar.webp", uploadRoot))
      .resolves.toBeNull();
  });
});
