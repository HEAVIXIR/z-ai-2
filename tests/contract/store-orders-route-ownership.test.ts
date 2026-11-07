import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("src/app/api/store/orders/route.ts", "utf8");

describe("store order list ownership boundary", () => {
  it("requires a real session before accepting customer-supplied selectors", () => {
    expect(route).toContain('if (!sessionUser)');
    expect(route).toContain('{ status: 401 }');
    expect(route).toContain('if (sessionUser.id !== userIdParam)');
    expect(route).not.toContain('if (sessionUser && sessionUser.id !== userIdParam)');
  });

  it("does not treat a phone number as an authentication credential", () => {
    expect(route).toContain('phone !== sessionUser.mobile');
    expect(route).toContain('{ status: 403 }');
    expect(route).not.toContain(': { customerId: customer.id };');
    expect(route).toContain('where: { customerId: customer.id }');
  });

  it("keeps the admin all-orders path behind the canonical session role", () => {
    expect(route).toContain('if (sessionUser?.isAdmin)');
    expect(route.indexOf('if (sessionUser?.isAdmin)')).toBeLessThan(route.indexOf('if (!sessionUser)'));
  });
});
