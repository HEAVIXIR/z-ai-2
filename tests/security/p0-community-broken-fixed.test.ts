import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

/* ============================================================
   STEP 13.01 — P0-1 FIX VERIFICATION (community broken)
   ------------------------------------------------------------
   This test verifies that the P0-1 vulnerability (community page
   calling non-existent API routes) has been FIXED.

   Vulnerability that was fixed:
     - src/app/community/page.tsx was a client component that
       fetched /api/questions and /api/questions/[qid]/answers
     - NO such API routes exist anywhere in src/app/api/
     - Every interaction on the page returned 404

   Fix:
     - The broken client component is replaced with a server
       component showing a "coming soon" message
     - No fetch calls to non-existent APIs
     - The original page is preserved as page.tsx.bak

   These tests use static analysis (source-code assertions).
   ============================================================ */

const PAGE_PATH = "src/app/community/page.tsx";
const BAK_PATH = "src/app/community/page.tsx.bak";

describe("P0-1 FIX — community broken page is replaced", () => {
  const source = readFileSync(PAGE_PATH, "utf-8");

  it("is no longer a client component (no use client directive)", () => {
    expect(source).not.toMatch(/^["']use client["']/m);
  });

  it("does NOT fetch /api/questions (in executable code)", () => {
    // Comments may reference the old pattern for documentation;
    // only executable lines must not contain fetch calls to it.
    const executableLines = source
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    const joined = executableLines.join("\n");
    expect(joined).not.toMatch(/fetch\(.*\/api\/questions/);
  });

  it("does NOT fetch /api/questions/[qid]/answers (in executable code)", () => {
    const executableLines = source
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    const joined = executableLines.join("\n");
    expect(joined).not.toMatch(
      /fetch\(.*\/api\/questions\/.*\/answers/,
    );
  });

  it("does NOT use useState/useEffect (no client-side data fetching)", () => {
    expect(source).not.toMatch(/useState/);
    expect(source).not.toMatch(/useEffect/);
  });

  it("contains the P0-1 FIX comment marker", () => {
    expect(source).toContain("P0-1 FIX");
  });

  it("renders a coming soon message", () => {
    expect(source).toMatch(/coming soon|به‌زودی/i);
  });

  it("includes a link back to homepage", () => {
    expect(source).toMatch(/href=["']\/["']/);
  });

  it("is a server component (no 'use client' at top)", () => {
    const firstLine = source.split("\n")[0];
    expect(firstLine).not.toMatch(/use client/);
  });

  it("original broken page is preserved as .bak for reference", () => {
    expect(existsSync(BAK_PATH)).toBe(true);
  });
});
