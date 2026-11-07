import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Cloudflare private media sidecar routing", () => {
  it("runs the Worker before static assets for nested media sidecar paths only", () => {
    const config = readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8");
    const assets = config.match(/"assets"\\s*:\\s*\\{([\\s\\S]*?)\\n  \\}/)?.[1] ?? "";
    expect(assets).toContain('"run_worker_first"');
    expect(assets).toContain('"/uploads/*.meta.json"');
    expect(assets).not.toContain('"run_worker_first": true');
    expect(assets).toContain('"directory": ".open-next/assets"');
    expect(assets).toContain('"binding": "ASSETS"');
  });
});
