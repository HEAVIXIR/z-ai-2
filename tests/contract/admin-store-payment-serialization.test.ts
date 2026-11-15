import { describe, expect, it } from "vitest";
import fs from "node:fs";

const collection = fs.readFileSync("src/app/api/admin/store/payments/route.ts", "utf8");
const detail = fs.readFileSync("src/app/api/admin/store/payments/[id]/route.ts", "utf8");
const partsCollection = fs.readFileSync("src/app/api/admin/store/parts/route.ts", "utf8");
const partsDetail = fs.readFileSync("src/app/api/admin/store/parts/[id]/route.ts", "utf8");

describe("admin store payment response privacy", () => {
  it.each([
    ["collection", collection],
    ["detail", detail],
  ])("%s serializer uses an explicit field allowlist", (_name, source) => {
    const start = source.indexOf("function serialize(p: any)");
    const end = source.indexOf("\n}\n", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const serializer = source.slice(start, end);
    expect(serializer).not.toMatch(/\.\.\.p\s*,?/);
    expect(serializer).toContain("payerCard: maskPayerCard(p.payerCard)");
    expect(serializer).not.toContain("reviewedById:");
    expect(serializer).not.toContain("payerCard: p.payerCard");
    expect(serializer).toContain("statusLabel:");
    expect(serializer).toContain("methodLabel:");
  });

  it.each([
    ["collection", collection],
    ["detail", detail],
  ])("%s masks payer card to the final four digits", (_name, source) => {
    expect(source).toContain(String.raw`const digits = value.replace(/\D/g, "")`);
    expect(source).toContain('return `•••• ${digits.slice(-4)}`');
  });
});

describe("admin store payment refund boundary", () => {
  it("rejects status-only refund transitions before any payment mutation", () => {
    expect(detail).toContain('if (body.status === "REFUNDED")');
    expect(detail).toContain('code: "STORE_PAYMENT_STATE_CONFLICT"');
    expect(detail).toContain("بازپرداخت نیز به گردش مستند مستقل نیاز دارد");
    expect(detail).toContain("{ status: 409 }");
    expect(detail).not.toContain('"PENDING", "APPROVED", "REJECTED", "REFUNDED"');
  });

  it("does not render a status-only refund action in the admin UI", () => {
    const page = fs.readFileSync("src/app/admin/store/payments/page.tsx", "utf8");
    expect(page).not.toContain('updateStatus(p, "REFUNDED")');
    expect(page).toContain("بازپرداخت غیرفعال");
  });
});

  it("redacts raw payer card data from audit snapshots", () => {
    expect(detail).toContain("payerCard: maskPayerCard(existing.payerCard)");
    expect(detail).toContain("payerCard: maskPayerCard(payment.payerCard)");
    expect(detail).not.toContain("before: existing");
    expect(detail).not.toContain("after: payment");
  });

describe("admin store parts response privacy", () => {
  it.each([
    ["collection", partsCollection],
    ["detail", partsDetail],
  ])("%s serializer uses an explicit allowlist", (_name, source) => {
    const start = source.indexOf("function serialize(p: any)");
    const end = source.indexOf("\n}\n", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const serializer = source.slice(start, end);
    expect(serializer).not.toMatch(/\.\.\.p\s*,?/);
    for (const field of ["id", "name", "sku", "priceUsd", "stock", "images", "compatibleCars", "category", "brand"]) {
      expect(serializer).toContain(field + ":");
    }
  });
});

describe("admin store payment state and audit atomicity", () => {
  it("commits payment decision, order balance state, and audit outbox in one transaction", () => {
    expect(detail).toContain("storeDb.$transaction(async (tx)");
    expect(detail).toContain("await enqueueAuditOutbox(tx");
    expect(detail).toContain("{ isolationLevel: 'Serializable' }");
    expect(detail).not.toContain("await logAudit(");
  });

  it("allows decisions only from PENDING and prevents replay double-counting", () => {
    expect(detail).toContain('existing.status !== "PENDING"');
    expect(detail).toContain('body.status === "APPROVED" && existing.orderId');
    expect(detail).toContain('where: { orderId: order.id, status: "APPROVED" }');
    expect(detail).not.toContain("Number(approvedSum._sum.amountIrr ?? 0) + Number(existing.amountIrr ?? 0)");
  });

  it("rejects status-only refunds", () => {
    expect(detail).toContain('body.status === "REFUNDED"');
    expect(detail).toContain("STORE_PAYMENT_STATE_CONFLICT");
  });
});

  it("does not query raw payer card data through the admin search parameter", () => {
    expect(collection).not.toContain("payerCard: { contains: q }");
    expect(collection).toContain("referenceCode: { contains: q }");
    expect(collection).toContain("payerName: { contains: q }");
  });

  it("rejects empty PATCH payloads without writing a payment or audit event", () => {
    expect(detail).toContain("if (Object.keys(data).length === 0) return { noChanges: true as const }");
    expect(detail).toContain('if ("noChanges" in result)');
    expect(detail).toContain("{ status: 400 }");
  });


describe("admin store payment mutation CSRF protection", () => {
  it("requires CSRF validation before payment decisions", () => {
    const patchStart = detail.indexOf("export async function PATCH(");
    const getStart = detail.indexOf("export async function GET(", patchStart);
    const patchHandler = detail.slice(patchStart, getStart);
    expect(detail).toContain('import { checkCsrf } from "@/lib/csrf"');
    expect(patchHandler).toContain("checkCsrf(req)");
    expect(patchHandler.indexOf("checkCsrf(req)")).toBeLessThan(patchHandler.indexOf("const body = await req.json()"));
  });
});
