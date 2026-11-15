import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("src/app/api/admin/store/parts/[id]/route.ts", "utf8");
const page = fs.readFileSync("src/app/admin/store/parts/page.tsx", "utf8");
const patchStart = route.indexOf("export async function PATCH(");
const deleteStart = route.indexOf("export async function DELETE(", patchStart);
const patch = route.slice(patchStart, deleteStart);
const deleteHandler = route.slice(deleteStart);

describe("Part catalog stock write boundary", () => {
  it("rejects direct Part.stock replacement through generic PATCH", () => {
    expect(patch).toContain('Object.prototype.hasOwnProperty.call(body, "stock")');
    expect(patch).toContain("{ status: 409 }");
    expect(patch).not.toContain("data.stock =");
  });

  it("keeps stock editable only as an initial legacy quantity on create", () => {
    expect(page).toContain('...(!editing ? { stock: Number(form.stock) || 0 } : {})');
    expect(page).toContain("موجودی فعلی (فقط خواندنی)");
    expect(page).toContain("readOnly");
    expect(page).toContain("موجودی اولیه (بدون تخصیص انبار)");
    expect(page).toContain('href="/admin/store/inventory"');
  });
});


describe("Part mutation CSRF protection", () => {
  it("requires CSRF validation for PATCH and DELETE", () => {
    expect(route).toContain('import { checkCsrf } from "@/lib/csrf"');
    expect(patch).toContain("checkCsrf(req)");
    expect(deleteHandler).toContain("checkCsrf(req)");
  });
});
