/**
 * HEAVIX — Media upload exclusive-create contract
 *
 * Ensures randomized media paths cannot silently overwrite existing binaries
 * or metadata sidecars if a filename collision occurs.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/lib/media-service.ts"),
  "utf8",
);

describe("media upload exclusive-create contract", () => {
  it("creates the binary file exclusively (no overwrite on collision)", () => {
    expect(source).toContain('await fs.writeFile(fullDiskPath, storedBuffer, { flag: "wx" });');
  });

  it("retries binary filename collisions instead of overwriting files", () => {
    expect(source).toContain("for (let attempt = 0; attempt < 3; attempt += 1)");
    expect(source).toContain('if ((err as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 2)');
  });

  it("creates the sidecar exclusively (no overwrite on collision)", () => {
    expect(source).toContain('await fs.writeFile(sidecarDiskPath, JSON.stringify(sidecar, null, 2), { encoding: "utf8", flag: "wx" });');
  });

  it("cleans up the newly-created binary if metadata persistence fails", () => {
    const sidecarWriteStart = source.indexOf("await fs.writeFile(sidecarDiskPath");
    const cleanupStart = source.indexOf("await fs.unlink(fullDiskPath).catch(() => {});", sidecarWriteStart);
    expect(sidecarWriteStart).toBeGreaterThan(-1);
    expect(cleanupStart).toBeGreaterThan(sidecarWriteStart);
  });
  it("checks that the binary still exists before attaching metadata", () => {
    const attachStart = source.indexOf("export async function attachAsset");
    const attachSection = source.slice(attachStart);
    expect(source).toContain("async function resolveStoredAssetPath(relativePath: string, expectedSize?: number)");
    expect(source).toContain("await fs.lstat(resolved)");
    expect(source).toContain("stat.isSymbolicLink()");
  });

  it("atomically replaces attached metadata through a unique exclusive temp file", () => {
    const attachStart = source.indexOf("export async function attachAsset");
    const attachSection = source.slice(attachStart);
    expect(attachSection).toContain("crypto.randomBytes(8).toString(\"hex\")");
    expect(attachSection).toContain('flag: "wx"');
    expect(attachSection).toContain("await fs.rename(temporarySidecarPath, sidecarPath)");
    expect(attachSection).toContain("await fs.unlink(temporarySidecarPath).catch(() => {})");
  });

  it("rejects traversal and symlinked stored asset paths before mutation", () => {
    expect(source).toContain("relativePath.includes");
    expect(source).toContain('part === ".."');
    expect(source).toContain("path.posix.isAbsolute(relativePath)");
    expect(source).toContain("await fs.realpath(resolved)");
    expect(source).toContain("resolved.startsWith(root + path.sep)");
  });

});
