import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("Cloudflare modern glob dependency overrides", () => {
  it("keeps legacy and modern minimatch APIs on compatible major versions", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.overrides.minimatch).toBeUndefined();
    expect(pkg.overrides["minimatch@^3.1.2"]).toBe("3.1.5");
    expect(pkg.overrides["minimatch@^3.1.5"]).toBe("3.1.5");
    expect(pkg.overrides["minimatch@^9.0.1"]).toBe("11.0.4");
    expect(pkg.overrides["minimatch@^10.2.2"]).toBe("11.0.4");
    expect(pkg.overrides["minimatch@^11.0.2"]).toBe("11.0.4");
  });

  it("keeps brace-expansion v1 and v5 APIs isolated by declared range", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.overrides["brace-expansion"]).toBeUndefined();
    expect(pkg.overrides["brace-expansion@^1.1.7"]).toBe("1.1.21");
    expect(pkg.overrides["brace-expansion@^5.0.12"]).toBe("5.0.12");
    expect(pkg.overrides.glob).toBeUndefined();
  });
});
