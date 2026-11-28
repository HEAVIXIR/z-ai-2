/**
 * HEAVIX — persisted media sidecar validation contract
 *
 * Ensures filesystem metadata is bounded, schema-checked and tied to the
 * binary path represented by its actual sidecar filename.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/lib/media-service.ts"),
  "utf8",
);

describe("persisted media sidecar validation contract", () => {
  it("bounds sidecar reads before parsing JSON", () => {
    expect(source).toContain("const MAX_SIDECAR_BYTES = 4096;");
    expect(source).toContain("await fs.lstat(sidecarFullPath)");
    expect(source).toContain('await fs.open(sidecarFullPath, "r")');
    expect(source).toContain("opened.dev !== stat.dev");
    expect(source).toContain("opened.ino !== stat.ino");
    expect(source).toContain("stat.size > MAX_SIDECAR_BYTES");
    expect(source).toContain("Buffer.alloc(MAX_SIDECAR_BYTES + 1)");
    expect(source).toContain("bytesRead > MAX_SIDECAR_BYTES");
    expect(source).toContain("await handle?.close().catch(() => {})");
  });

  it("validates the complete persisted sidecar shape", () => {
    expect(source).toContain("function isValidAssetSidecar(");
    expect(source).toContain("candidate.filename === expectedFilename");
    expect(source).toContain("candidate.relativePath === expectedRelativePath");
    expect(source).toContain("candidate.mimeType === expectedMime");
    expect(source).toContain("Number.isSafeInteger(candidate.size)");
    expect(source).toContain("Number.isFinite(Date.parse(candidate.uploadedAt))");
  });

  it("does not trust metadata URL or extension independently of the disk path", () => {
    expect(source).toContain('candidate.url === `/uploads/${expectedRelativePath}`');
    expect(source).toContain("candidate.ext === extension");
    expect(source).toContain("const MIME_BY_EXTENSION");
  });

  it("omits stale sidecars whose binary is missing or outside the upload root", () => {
    expect(source).toContain('const binaryRelativePath = rel.slice(0, -".meta.json".length)');
    expect(source).toContain("await resolveStoredAssetPath(binaryRelativePath, sc.size)");
    expect(source).toContain("expectedSize !== undefined && stat.size !== expectedSize");
    expect(source).toContain("resolveStoredAssetPath(asset.relativePath, asset.size)");
  });

  it("returns only whitelisted metadata fields after parsing", () => {
    expect(source).toContain("const parsed: unknown = JSON.parse(raw)");
    expect(source).toContain("if (!isValidAssetSidecar(parsed, expectedRelativePath)) return null");
    expect(source).toContain("id: parsed.id");
  });
});
