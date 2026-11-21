import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "@/lib/auth-redirect";

describe("listing creation authentication redirect", () => {
  it("keeps only same-origin relative return paths", () => {
    expect(safeInternalRedirect("/listings/new")).toBe("/listings/new");
    expect(safeInternalRedirect("/listings/new?draft=1")).toBe("/listings/new?draft=1");
    expect(safeInternalRedirect("https://evil.example/")).toBe("/");
    expect(safeInternalRedirect("//evil.example/")).toBe("/");
    expect(safeInternalRedirect("/\\\\evil.example/")).toBe("/");
    expect(safeInternalRedirect(undefined, "")).toBe("");
  });

  it("protects listing creation and carries the destination through auth", () => {
    const middleware = readFileSync("src/middleware.ts", "utf8");
    const login = readFileSync("src/app/login/LoginForm.tsx", "utf8");
    const register = readFileSync("src/app/register/page.tsx", "utf8");

    expect(middleware).toContain('"/listings/new/:path*"');
    expect(middleware).toContain('loginUrl.searchParams.set("redirect", redirectTo)');
    expect(login).toContain("safeInternalRedirect(sp.get(\"redirect\"), \"\"");
    expect(register).toContain("const loginHref = returnPath");
    expect(register).toContain("href={loginHref}");
  });
});
