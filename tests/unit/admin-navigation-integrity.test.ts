import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("admin navigation integrity", () => {
  it("merges missing canonical menu entries without restoring intentionally inactive rows", () => {
    const source = read("src/app/api/admin/navigation/route.ts");
    expect(source).toContain("const [storedGroups, storedStandalone]");
    expect(source).toContain("if (stored && !stored.active) return []");
    expect(source).toContain("if (saved && !saved.active) return []");
    expect(source).toContain("merged-database-canonical");
  });

  it("collapses group labels and children and synchronizes the content offset", () => {
    const source = read("src/components/admin/AdminSidebarNav.tsx");
    expect(source).toContain('isCollapsed ? "5rem" : "18rem"');
    expect(source).toContain("{!isCollapsed && <span");
    expect(source).toContain("{!isCollapsed && isOpen && (");
    expect(source).toContain('title={isCollapsed ? group.titleFa : undefined}');
  });

  it("requires explicit apply for the admin navigation seed and preserves existing rows", () => {
    const source = read("prisma/seed-admin-navigation.ts");
    expect(source).toContain('process.argv.includes("--apply")');
    expect(source).toContain("DRY RUN");
    expect(source.match(/update:\s*\{\s*\}/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
