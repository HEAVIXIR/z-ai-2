import { describe, expect, it } from "vitest";
import { isAllowedPreviewProofRequest } from "../../src/lib/preview-version-worker-gate";

const TOKEN = "a".repeat(64);

function request(path: string, options: { method?: string; token?: string } = {}) {
  const headers = new Headers();
  if (options.token !== undefined) headers.set("authorization", `Bearer ${options.token}`);
  return new Request(`https://version-preview.invalid${path}`, {
    method: options.method ?? "GET",
    headers,
  });
}

describe("version-only OpenNext proof outer gate", () => {
  it("allows only the exact GET proof route with the configured bearer token", () => {
    expect(isAllowedPreviewProofRequest(request("/api/opennext-runtime-proof", { token: TOKEN }), TOKEN)).toBe(true);
  });

  it.each([
    ["/", "GET", TOKEN],
    ["/dashboard", "GET", TOKEN],
    ["/api/admin/users", "GET", TOKEN],
    ["/api/opennext-runtime-proof/", "GET", TOKEN],
    ["/api/opennext-runtime-proof?debug=1", "GET", TOKEN],
    ["/api/opennext-runtime-proof", "POST", TOKEN],
    ["/api/opennext-runtime-proof", "GET", undefined],
    ["/api/opennext-runtime-proof", "GET", "wrong"],
  ] as const)("denies %s (%s)", (path, method, token) => {
    expect(isAllowedPreviewProofRequest(request(path, { method, token }), TOKEN)).toBe(false);
  });

  it("fails closed when the configured token is absent or empty", () => {
    expect(isAllowedPreviewProofRequest(request("/api/opennext-runtime-proof", { token: TOKEN }), undefined)).toBe(false);
    expect(isAllowedPreviewProofRequest(request("/api/opennext-runtime-proof", { token: TOKEN }), "")).toBe(false);
  });
});
