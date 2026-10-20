import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";

/* ============================================================
   STEP 13.01-R1 — P0-1 FIX v2 VERIFICATION
   ------------------------------------------------------------
   Senior manager directive: 'بررسی لینک‌های داخلی و SEO. حذف
   page.tsx.bak از مسیر اجرایی برنامه. حفظ تاریخچه از طریق Git،
   نه فایل بکاپ داخل Route.'

   This test verifies the v2 fix:
     1. No .bak file in the community route directory
     2. page.tsx is the coming soon version (not broken client component)
     3. No navigation links point to /community from other components
   ============================================================ */

const COMMUNITY_DIR = "src/app/community";
const PAGE_PATH = "src/app/community/page.tsx";

describe("P0-1 FIX v2 — no .bak file in route directory", () => {
  it("page.tsx.bak does NOT exist in the community route directory", () => {
    const bakPath = `${COMMUNITY_DIR}/page.tsx.bak`;
    expect(existsSync(bakPath)).toBe(false);
  });

  it("community directory contains ONLY page.tsx (no .bak, no other files)", () => {
    const files = readdirSync(COMMUNITY_DIR);
    // Should contain only page.tsx — no .bak files
    const nonPageFiles = files.filter((f) => f !== "page.tsx");
    expect(nonPageFiles).toEqual([]);
  });
});

describe("P0-1 FIX v2 — page.tsx is the coming soon version", () => {
  const source = readFileSync(PAGE_PATH, "utf-8");

  it("is NOT a client component (no 'use client' directive)", () => {
    const firstLine = source.split("\n")[0];
    expect(firstLine).not.toMatch(/use client/);
  });

  it("does NOT fetch /api/questions (in executable code)", () => {
    const executableLines = source
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(executableLines).not.toMatch(/fetch\(.*\/api\/questions/);
  });

  it("renders a coming soon message", () => {
    expect(source).toMatch(/coming soon|به‌زودی/i);
  });

  it("contains the P0-1 FIX comment marker", () => {
    expect(source).toContain("P0-1 FIX");
  });

  it("includes a link back to homepage", () => {
    expect(source).toMatch(/href=["']\/["']/);
  });
});

describe("P0-1 FIX v2 — no navigation links to /community", () => {
  // Audit: no Header, Footer, Sidebar, or layout component should
  // link to /community since the page is a "coming soon" placeholder.
  // The original broken page is preserved in git history (not as a
  // .bak file in the route directory).

  it("Header component does not link to /community", () => {
    const headerPath = "src/components/layout/Header.tsx";
    if (existsSync(headerPath)) {
      const source = readFileSync(headerPath, "utf-8");
      // Filter out comments
      const executable = source
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(executable).not.toMatch(/href=["']\/community["']/);
    }
  });

  it("Footer component does not link to /community", () => {
    const footerPath = "src/components/layout/Footer.tsx";
    if (existsSync(footerPath)) {
      const source = readFileSync(footerPath, "utf-8");
      const executable = source
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(executable).not.toMatch(/href=["']\/community["']/);
    }
  });
});
