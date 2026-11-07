import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) =>
  readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("private media sidecar storage contract", () => {
  it("stores new sidecars outside the public uploads tree with restrictive permissions", () => {
    const service = read("src/lib/media-service.ts");
    expect(service).toContain('const MEDIA_METADATA_ROOT = path.join(process.cwd(), ".heavix-media-metadata")');
    expect(service).toContain('mode: 0o700');
    expect(service).toContain('mode: 0o600');
    expect(service).toContain("async function ensurePrivateMetadataDirectory");
    expect(service).toContain("stat.isSymbolicLink()");
    expect(service).toContain("await fs.chmod(directory, 0o700)");
    expect(service).toContain("await fs.chmod(sidecarPath, 0o600)");
    expect(service).toContain("async function hardenPrivateMetadataTree");
    expect(service).toContain("await hardenPrivateMetadataTree(MEDIA_METADATA_ROOT)");
    expect(service).toContain('throw new Error("Private media metadata tree contains a symlink.")');
    expect(service).toContain("const sidecarDiskPath = sidecarPathFor(relPath)");
    expect(service).not.toContain('path.join(targetDir, sidecarPathFor(safeName))');
  });

  it("validates sidecar identity and binds metadata to its discovered relative path", () => {
    const service = read("src/lib/media-service.ts");
    expect(service).toContain("parsed.relativePath !== safeExpectedPath");
    expect(service).toContain("parsed.filename !== path.posix.basename(safeExpectedPath)");
    expect(service).toContain("parsed.url !== `/uploads/${safeExpectedPath}`");
    expect(service).toContain("normalizeUploadRelativePath(asset.relativePath)");
  });

  it("keeps legacy listing read-only and privatizes metadata on attach or delete", () => {
    const service = read("src/lib/media-service.ts");
    expect(service).toContain("listing must never mutate existing media state");
    expect(service).toContain("await fs.unlink(`${binaryPath}${SIDECAR_SUFFIX}`).catch(() => {})");
    expect(service).toContain("const legacySidecarPath = `${binaryPath}${SIDECAR_SUFFIX}`");
  });

  it("keeps bulk migration dry-run by default and requires explicit confirmation for apply", () => {
    const script = read("scripts/migrate-media-sidecars-private.ts");
    expect(script).toContain('process.argv.includes("--apply")');
    expect(script).toContain('process.env.HEAVIX_CONFIRM_MEDIA_SIDECAR_MIGRATION !== "1"');
    expect(script).toContain("constants.COPYFILE_EXCL");
    expect(script).toContain("copied.equals(raw)");
    expect(script).toContain("ensurePrivateDirectory(path.dirname(target), APPLY)");
    expect(script).toContain("fs.lstat(current)");
    expect(script).not.toContain('fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })');
    expect(script).toMatch(/if \(!APPLY\)[\s\S]*?planned\+\+;/);
    expect(script).toContain('mode: APPLY ? "apply" : "dry-run"');
  });
});
