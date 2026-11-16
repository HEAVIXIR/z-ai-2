import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("private-page indexing policy", () => {
  it("allows crawlers to observe page-level noindex while disallowing API endpoints", () => {
    const robots = read("src/app/robots.ts");
    expect(robots).toContain('disallow: ["/api/"]');
    expect(robots).not.toContain('"/admin/"');
    expect(robots).not.toContain('"/dashboard/"');
    expect(robots).not.toContain('"/seller/"');
    expect(robots).not.toContain('"/login"');
    expect(robots).not.toContain('"/register"');
  });

  it("marks private, transactional, utility, and time-sensitive route groups noindex", () => {
    const layouts = [
      "src/app/admin/layout.tsx",
      "src/app/account/security/layout.tsx",
      "src/app/company/register/layout.tsx",
      "src/app/forgot-password/layout.tsx",
      "src/app/verify-email/layout.tsx",
      "src/app/transport/request/layout.tsx",
      "src/app/sell-in-7-days/register/layout.tsx",
      "src/app/auctions/layout.tsx",
      "src/app/compare/layout.tsx",
      "src/app/dashboard/layout.tsx",
      "src/app/find-my-need/layout.tsx",
      "src/app/listings/new/layout.tsx",
      "src/app/login/layout.tsx",
      "src/app/register/layout.tsx",
      "src/app/requests/new/layout.tsx",
      "src/app/rfq/[id]/layout.tsx",
      "src/app/rfq/new/layout.tsx",
      "src/app/seller/layout.tsx",
      "src/app/sellers/[id]/layout.tsx",
    ];
    for (const file of layouts) {
      expect(read(file), file).toContain("index: false");
    }
  });
});
