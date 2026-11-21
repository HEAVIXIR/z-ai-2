import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

/**
 * E.1.1 + E.1.2: DELETE error mapping + RequestsClient remove behavior.
 *
 * E.1.1: the DELETE route's catch block must map WantedServiceError to its
 * HTTP status (404/409/400), NOT a blanket 500. The service throws 409 for
 * terminal states (CLOSED/FULFILLED cannot be re-closed).
 *
 * E.1.2: RequestsClient.remove must check response.ok, NOT remove the row
 * on error, show the real server error, and refresh the list on success.
 */
describe("E.1 DELETE error mapping + RequestsClient remove (P0 audit)", () => {
  it("E.1.1: DELETE route maps WantedServiceError to its HTTP status", () => {
    const route = read("src/app/api/admin/requests/[id]/route.ts");
    // The catch block must check `instanceof WantedServiceError` and return
    // `err.status`, not a blanket 500.
    expect(route).toContain("instanceof WantedServiceError");
    expect(route).toContain("status: err.status");
    // The generic 500 path must still exist for unexpected errors.
    expect(route).toContain("status: 500");
  });

  it("E.1.1: DELETE delegates to closeWantedByAdmin (no physical delete)", () => {
    const route = read("src/app/api/admin/requests/[id]/route.ts");
    expect(route).toContain("closeWantedByAdmin(id, sessionUser.id)");
    expect(route).not.toContain("db.buyRequest.delete");
  });

  it("E.1.2: RequestsClient.remove checks response.ok", () => {
    const client = read("src/components/admin/RequestsClient.tsx");
    const removeSection = client.split("const remove = async")[1]?.split("const statCards")[0] ?? "";
    // Must check res.ok before removing the row.
    expect(removeSection).toContain("if (!res.ok)");
    // Must NOT filter the row out on error (the old behavior was
    // `setList(list.filter((x) => x.id !== id))` unconditionally).
    expect(removeSection).not.toContain("setList(list.filter((x) => x.id !== id))");
    // Must show the real server error message from the response body.
    expect(removeSection).toContain("err?.error");
    // On success, must update the row to CLOSED (soft-close), not remove it.
    expect(removeSection).toContain('status: "CLOSED"');
  });

  it("E.1.2: RequestsClient.remove refreshes from server on error", () => {
    const client = read("src/components/admin/RequestsClient.tsx");
    const removeSection = client.split("const remove = async")[1]?.split("const statCards")[0] ?? "";
    // On error, the list is refreshed from the server so the UI matches
    // reality (the row may have been partially transitioned or rejected).
    expect(removeSection).toContain('fetch("/api/admin/requests")');
  });

  it("E.1.2: RequestsClient.updateStatus shows real server error", () => {
    const client = read("src/components/admin/RequestsClient.tsx");
    const updateSection = client.split("const updateStatus = async")[1]?.split("const save = async")[0] ?? "";
    // Must show the real server error message, not a generic string.
    expect(updateSection).toContain("err?.error");
    expect(updateSection).not.toContain('throw new Error("عملیات ناموفق بود.")');
  });

  it("P0 #1: wizard clears category on WANTED intent change (handleWantedIntentChange)", () => {
    const page = read("src/app/listings/new/page.tsx");
    expect(page).toContain("handleWantedIntentChange");
    expect(page).toContain("onClick={() => handleWantedIntentChange(t.v)}");
    // The handler must clear categoryId + categoryPath when the intent changes.
    const handlerSection = page.split("handleWantedIntentChange")[1]?.split("handleTransactionTypeChange")[0] ?? "";
    expect(handlerSection).toContain("setCategoryId(\"\")");
    expect(handlerSection).toContain("setCategoryPath([])");
  });

  it("P0 #3: /api/wanted validates budget range server-side", () => {
    const route = read("src/app/api/wanted/route.ts");
    // Budget range validation must be present server-side.
    expect(route).toContain("حداقل بودجه نمی‌تواند منفی باشد");
    expect(route).toContain("حداکثر بودجه نمی‌تواند منفی باشد");
    expect(route).toContain("حداقل بودجه نباید بیش از حداکثر بودجه باشد");
  });

  it("P1 #4-7: wizard clears images + rental + form + flags on transaction-type change", () => {
    const page = read("src/app/listings/new/page.tsx");
    const handlerSection = page.split("handleTransactionTypeChange")[1]?.split("canProceed")[0] ?? "";
    // Images must be cleared.
    expect(handlerSection).toContain("setImages([])");
    expect(handlerSection).toContain("setImagesUploading(false)");
    // Rental fields must be cleared.
    expect(handlerSection).toContain("setRental(");
    // Form must be reset.
    expect(handlerSection).toContain("setForm(");
    // Transient UI flags must be cleared.
    expect(handlerSection).toContain("setSubmitError(null)");
    expect(handlerSection).toContain("setSubmitting(false)");
  });
});
