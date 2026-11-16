import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("owner bootstrap deployment guard", () => {
  it("requires the explicit Preview environment before granting owner ADMIN", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/app/api/auth/login/route.ts"),
      "utf8",
    );
    expect(source).toContain('process.env.HEAVIX_ENV === "preview"');
    expect(source).toContain("isPreviewDeployment &&");
    expect(source).toContain("ownerEmail &&");
    expect(source).toContain("user.email.toLowerCase() === ownerEmail");
  });
});
