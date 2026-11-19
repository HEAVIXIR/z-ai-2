import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

/**
 * H.1: WANTED success link must point to the owner's dashboard (not the
 * public API which 404s PENDING requests). The owner dashboard page
 * must exist and enforce ownership (where: { userId }).
 */
describe("H.1: WANTED success link + owner dashboard (P0 audit)", () => {
  it("success link points to /dashboard/wanted (not /api/wanted/{id})", () => {
    const page = read("src/app/listings/new/page.tsx");
    const successBlock = page.split("submitted ?")[1]?.split(") : (")[0] ?? "";
    // Must link to the dashboard, NOT the public API.
    expect(successBlock).toContain("/dashboard/wanted");
    expect(successBlock).not.toContain("/api/wanted/${createdId}");
  });

  it("success screen shows the created id + PENDING status", () => {
    const page = read("src/app/listings/new/page.tsx");
    const successBlock = page.split("submitted ?")[1]?.split(") : (")[0] ?? "";
    expect(successBlock).toContain("createdId");
    expect(successBlock).toContain("در انتظار بررسی");
    expect(successBlock).toContain("شناسه");
  });

  it("dashboard/wanted page exists + enforces ownership", () => {
    const dashboardPage = read("src/app/dashboard/wanted/page.tsx");
    // Must check auth + redirect unauthenticated users.
    expect(dashboardPage).toContain("getCurrentUser");
    expect(dashboardPage).toContain("redirect");
    // Must filter by userId (owner only — no PENDING leak to other users).
    expect(dashboardPage).toContain("where: { userId: user.id }");
    // Must show PENDING requests (the owner's own pending requests).
    expect(dashboardPage).toContain("PENDING");
    expect(dashboardPage).toContain("در انتظار بررسی");
  });

  it("dashboard/wanted page does NOT expose PENDING to public API", () => {
    // The public /api/wanted route must still filter on ACTIVE only.
    const route = read("src/app/api/wanted/route.ts");
    expect(route).toContain('const status = "ACTIVE"');
    // The ?mine=true path is auth-scoped (returns all statuses for the owner).
    expect(route).toContain("mine");
    expect(route).toContain("where: { userId }");
  });
});
