import { describe, expect, it } from "vitest";
import "@/lib/admin/resource-index";
import { registry } from "@/lib/admin/resource-registry";

const cfg = registry.get("payments");

describe("Payment Resource Contract — immutable financial ledger", () => {
  it("registers the payment resource with canonical identity and read/export permissions", () => {
    expect(cfg).toBeDefined();
    expect(cfg?.key).toBe("payments");
    expect(cfg?.model).toBe("payment");
    expect(cfg?.database).toBe("main");
    expect(cfg?.permissions.read).toBe("payment.read");
    expect(cfg?.permissions.update).toBe("payment.manage");
    expect(cfg?.permissions.export).toBe("payment.read");
  });

  it("disables generic create and delete permissions for ledger records", () => {
    expect(cfg?.permissions.create).toBeUndefined();
    expect(cfg?.permissions.delete).toBeUndefined();
  });

  it("exposes only trackingCode as a generic editable field", () => {
    expect(cfg?.fields.map((field) => field.key)).toEqual(["trackingCode"]);
    const trackingCode = cfg?.fields.find((field) => field.key === "trackingCode");
    expect(trackingCode?.validation?.maxLength).toBe(100);
    expect(trackingCode?.permissions?.read).toBe("payment.read");
    expect(trackingCode?.permissions?.write).toBe("payment.manage");
    expect(trackingCode?.permissions?.export).toBe("payment.manage");
  });

  it("keeps financial facts visible as read-only columns, not editable form fields", () => {
    const columnKeys = new Set((cfg?.columns ?? []).map((column) => column.key));
    for (const key of ["amount", "currency", "type", "status", "gateway", "paidAt"]) {
      expect(columnKeys.has(key)).toBe(true);
    }
    for (const key of ["amount", "currency", "type", "status", "gateway", "paidAt"]) {
      expect((cfg?.fields ?? []).some((field) => field.key === key)).toBe(false);
    }
  });

  it("defines transactional, preconditioned verify and refund actions", () => {
    const actions = new Map((cfg?.actions ?? []).map((action) => [action.key, action]));
    const verify = actions.get("verify");
    const refund = actions.get("refund");

    expect(verify?.permission).toBe("payment.manage");
    expect(verify?.transactional).toBe(true);
    expect(verify?.precondition).toBeTypeOf("function");

    expect(refund?.permission).toBe("payment.refund");
    expect(refund?.transactional).toBe(true);
    expect(refund?.precondition).toBeTypeOf("function");
  });

  it("does not advertise unsupported bulk financial actions", () => {
    expect(cfg?.bulkActions ?? []).toEqual([]);
  });

  it("retains overview and audit detail tabs and an enabled Payment audit contract", () => {
    expect((cfg?.detailTabs ?? []).map((tab) => tab.key)).toEqual(["overview", "audit"]);
    expect(cfg?.audit?.enabled).toBe(true);
    expect(cfg?.audit?.entityType).toBe("Payment");
    expect(cfg?.audit?.actions).toContain("payment.manage");
    expect(cfg?.audit?.actions).toContain("payment.refund");
  });
});
