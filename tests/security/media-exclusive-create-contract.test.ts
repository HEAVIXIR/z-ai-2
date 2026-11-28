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

  it("creates the sidecar exclusively (no overwrite on collision)", () => {
    expect(source).toContain('await fs.writeFile(sidecarDiskPath, JSON.stringify(sidecar, null, 2), { encoding: "utf8", flag: "wx" });');
  });

  it("cleans up the newly-created binary if metadata persistence fails", () => {
    const sidecarWriteStart = source.indexOf("await fs.writeFile(sidecarDiskPath");
    const cleanupStart = source.indexOf("await fs.unlink(fullDiskPath).catch(() => {});", sidecarWriteStart);
    expect(sidecarWriteStart).toBeGreaterThan(-1);
    expect(cleanupStart).toBeGreaterThan(sidecarWriteStart);
  });
});
