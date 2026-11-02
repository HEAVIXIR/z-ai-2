import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("robots metadata runtime boundary", () => {
  it("uses pure site configuration and does not import the database-backed SEO service", () => {
    const source = readFileSync("src/app/robots.ts", "utf8");
    const ast = ts.createSourceFile(
      "src/app/robots.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    const imports = ast.statements
      .filter(ts.isImportDeclaration)
      .map((statement) =>
        ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : "",
      );

    expect(imports).toContain("@/lib/site-config");
    expect(imports).not.toContain("@/lib/seo");
    expect(imports).not.toContain("@/lib/db");
  });
});
