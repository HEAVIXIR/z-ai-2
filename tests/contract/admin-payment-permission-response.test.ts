import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("src/app/api/admin/payments/[id]/route.ts", "utf8");

describe("admin payment route permission responses", () => {
  it("maps read permission denial to an explicit 403 response", () => {
    expect(route).toContain('await requirePermission(user.id, "payment.read")');
    expect(route).toContain('return NextResponse.json({ error: "Forbidden" }, { status: 403 });');
  });

  it("maps every payment.manage denial to an explicit 403 response", () => {
    const manageChecks = route.match(/await requirePermission\(user\.id, "payment\.manage"\)/g) ?? [];
    const forbiddenResponses = route.match(/return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\);/g) ?? [];
    expect(manageChecks).toHaveLength(2);
    expect(forbiddenResponses).toHaveLength(3);
  });
});
