import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (file: string) => fs.readFileSync(file, "utf8");

describe("Store payment audit and request boundary", () => {
  it("bounds manual receipt JSON and writes an outbox event with the payment", () => {
    const route = read("src/app/api/store/payments/manual/route.ts");
    expect(route).toContain("readBoundedJsonObject(req, 16 * 1024)");
    expect(route).toContain("await enqueueAuditOutbox(tx");
    expect(route).toContain("store.payment.submit_manual");
    expect(route).toContain("Unknown payment field");
    expect(route).toContain("method must be CARD or CASH");
    expect(route).toContain('isolationLevel: "Serializable"');
  });
  it("bounds gateway request JSON and records pending payment creation", () => {
    const route = read("src/app/api/store/payments/gateway/request/route.ts");
    expect(route).toContain("readBoundedJsonObject(req, 8 * 1024)");
    expect(route).toContain("store.payment.gateway.request");
    expect(route).toContain("await enqueueAuditOutbox(tx");
  });
  it("records gateway approval/rejection and order payment state in the outbox", () => {
    const route = read("src/app/api/store/payments/gateway/callback/route.ts");
    expect(route).toContain("store.payment.gateway.approve");
    expect(route).toContain("store.payment.gateway.reject");
    expect(route).toContain("store.order.payment_status.sync");
    expect(route).toContain("await enqueueAuditOutbox(tx");
  });
});
