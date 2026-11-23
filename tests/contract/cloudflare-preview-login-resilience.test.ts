import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("Cloudflare Integration Preview login resilience", () => {
  it("sets a bounded CPU budget for the preview Worker", () => {
    const config = read("wrangler.jsonc");
    expect(config).toContain('"limits": { "cpu_ms": 500 }');
    expect(config).toContain('"HEAVIX_PREVIEW_ORIGIN": "https://integration-preview-readiness-workerd-2026-11-15-heavix-preview.heavixir.workers.dev"');
  });

  it("distinguishes a Worker 503 from invalid credentials", () => {
    const login = read("src/app/login/LoginForm.tsx");
    expect(login).toContain("res.status === 503");
    expect(login).toContain("این خطا به معنی اشتباه بودن رمز عبور نیست");
    expect(login).toContain("ارتباط با سرور پیش‌نمایش قطع شد");
  });
});
