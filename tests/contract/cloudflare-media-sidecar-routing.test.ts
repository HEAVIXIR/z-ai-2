import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Cloudflare private media sidecar routing", () => {
  it("runs the Worker before static assets for nested media sidecar paths only", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8"));
    expect(config.assets.run_worker_first).toEqual(["/uploads/*.meta.json"]);
    expect(config.assets.directory).toBe(".open-next/assets");
    expect(config.assets.binding).toBe("ASSETS");
  });
});
