import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("Cloudflare Integration Preview login resilience", () => {
  it("keeps the Worker on the Free-plan CPU ceiling and disables legacy bcrypt in that runtime", () => {
    const config = read("wrangler.jsonc");
    expect(config).not.toContain('"limits"');
    expect(config).toContain('"HEAVIX_AUTH_ALLOW_LEGACY_BCRYPT": "false"');
    expect(config).toContain('"HEAVIX_PREVIEW_ORIGIN": "https://integration-preview-readiness-workerd-2026-11-15-heavix-preview.heavixir.workers.dev"');
    const password = read("src/lib/password.ts");
    expect(password).toContain('crypto.subtle.deriveBits');
    expect(password).toContain('iterations: PBKDF2_ITERATIONS');
    expect(password).toContain('process.env.HEAVIX_AUTH_ALLOW_LEGACY_BCRYPT !== "false"');
  });

  it("distinguishes a Worker 503 from invalid credentials", () => {
    const login = read("src/app/login/LoginForm.tsx");
    expect(login).toContain("res.status === 503");
    expect(login).toContain("این خطا به معنی اشتباه بودن رمز عبور نیست");
    expect(login).toContain("ارتباط با سرور پیش‌نمایش قطع شد");
  });
});
