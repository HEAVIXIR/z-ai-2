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
    expect(route).toContain('!sessionUser.mobileVerified');
    expect(route).toContain('{ status: 403 }');
    expect(route).not.toContain(': { customerId: customer.id };');
    expect(route).toContain('where: { customerId: customer.id }');
  });

  it("keeps the admin all-orders path behind the canonical session role", () => {
    expect(route).toContain('if (sessionUser?.isAdmin)');
    expect(route.indexOf('if (sessionUser?.isAdmin)')).toBeLessThan(route.indexOf('if (!sessionUser)'));
  });
});

const detailRoute = fs.readFileSync("src/app/api/store/orders/[id]/route.ts", "utf8");

describe("store guest order detail ownership", () => {
  it("requires verified mobile before phone-based guest ownership", () => {
    expect(detailRoute).toContain('sessionUser.mobileVerified && order.customer && order.customer.phone === sessionUser.mobile');
  });
  it("preserves direct userId ownership independently of phone verification", () => {
    expect(detailRoute).toContain('order.userId === sessionUser.id');
  });
});

describe("store order response privacy boundary", () => {
  const listRoute = fs.readFileSync("src/app/api/store/orders/route.ts", "utf8");
  const detailRoute = fs.readFileSync("src/app/api/store/orders/[id]/route.ts", "utf8");

  it("uses explicit response fields instead of spreading database order records", () => {
    for (const source of [listRoute, detailRoute]) {
      expect(source).toContain("function serializeOrder(o: any)");
      expect(source).not.toContain("...o,");
      expect(source).not.toContain("...p,");
      expect(source).not.toContain("...it,");
    }
  });

  it("does not expose payment card, reviewer identity, customer national code, or shipment proof fields", () => {
    for (const source of [listRoute, detailRoute]) {
      expect(source).not.toContain("payerCard:");
      expect(source).not.toContain("reviewedById:");
      expect(source).not.toContain("nationalCode:");
      expect(source).not.toContain("proofUrl:");
    }
  });
});
