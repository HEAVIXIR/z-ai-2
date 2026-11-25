import { describe, expect, it, vi } from "vitest";
import {
  fetchAllowedSourcePage,
  isAllowedSourceUrl,
  isPublicIpv4,
  type SourceFetchResult,
} from "@/lib/server/safe-source-fetch";

function dependencies(
  addresses: string[][] = [["1.1.1.1"]],
  responses: SourceFetchResult[] = [{ html: "<title>ok</title>", title: "ok" }],
) {
  let lookupIndex = 0;
  let requestIndex = 0;
  const lookup = vi.fn(async () => {
    const current = addresses[Math.min(lookupIndex++, addresses.length - 1)]!;
    return current.map((address) => ({ address, family: 4 }));
  });
  const request = vi.fn(async (_url: URL, _address: string, _signal?: AbortSignal) =>
    responses[Math.min(requestIndex++, responses.length - 1)]!
  );
  return { lookup, request };
}

describe("SSRF-safe source fetch", () => {
  it("allows only HTTPS URLs on exact approved marketplace hosts or their subdomains", () => {
    expect(isAllowedSourceUrl("https://divar.ir/v/123")).toBe(true);
    expect(isAllowedSourceUrl("https://www.sheypoor.com/v/123")).toBe(true);
    expect(isAllowedSourceUrl("http://divar.ir/v/123")).toBe(false);
    expect(isAllowedSourceUrl("https://divar.ir.attacker.test/v/123")).toBe(false);
    expect(isAllowedSourceUrl("https://user:pass@divar.ir/v/123")).toBe(false);
    expect(isAllowedSourceUrl("https://127.0.0.1/")).toBe(false);
  });

  it("supports a separate reviewed allowlist without widening marketplace defaults", () => {
    const storeHosts = ["parts.example.ir", "vendor.example.com"];
    expect(isAllowedSourceUrl("https://parts.example.ir/item/1", storeHosts)).toBe(true);
    expect(isAllowedSourceUrl("https://cdn.parts.example.ir/item/1", storeHosts)).toBe(true);
    expect(isAllowedSourceUrl("https://parts.example.ir.attacker.test/item/1", storeHosts)).toBe(false);
    expect(isAllowedSourceUrl("https://parts.example.ir/item/1")).toBe(false);
    expect(isAllowedSourceUrl("https://attacker.test/", ["*.example.ir"])).toBe(false);
  });

  it("revalidates redirects against the same provider-specific allowlist", async () => {
    const storeHosts = ["parts.example.ir", "vendor.example.com"];
    const deps = dependencies(
      [["1.1.1.1"]],
      [{ html: "", title: "", redirect: "https://attacker.test/steal" }],
    );
    await expect(fetchAllowedSourcePage("https://parts.example.ir/item/1", undefined, deps, storeHosts))
      .rejects.toThrow("دامنه یا درگاه غیرمجاز");
    expect(deps.lookup).toHaveBeenCalledTimes(1);
  });

  it.each([
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1",
    "169.254.1.1", "172.16.0.1", "172.31.255.254", "192.0.0.1",
    "192.0.2.1", "192.31.196.1", "192.52.193.1", "192.168.1.1", "192.88.99.1", "192.175.48.1", "198.18.0.1",
    "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1",
    "255.255.255.255", "01.2.3.4", "1.2.3.999", "not-an-ip",
  ])("rejects non-public or malformed IPv4 address %s", (address) => {
    expect(isPublicIpv4(address)).toBe(false);
  });

  it.each(["1.1.1.1", "8.8.8.8", "93.184.216.34", "192.1.1.1"])(
    "accepts globally routable IPv4 address %s",
    (address) => expect(isPublicIpv4(address)).toBe(true),
  );

  it("rejects a private DNS answer before making an HTTPS request", async () => {
    const deps = dependencies([["127.0.0.1"]]);
    await expect(fetchAllowedSourcePage("https://divar.ir/ad", undefined, deps))
      .rejects.toThrow("نشانی شبکه مقصد عمومی و امن نیست");
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("rejects mixed public and private DNS answers (DNS rebinding defense)", async () => {
    const deps = dependencies([["1.1.1.1", "10.0.0.5"]]);
    await expect(fetchAllowedSourcePage("https://divar.ir/ad", undefined, deps))
      .rejects.toThrow("نشانی شبکه مقصد عمومی و امن نیست");
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("pins the request to the first validated public IPv4 and preserves the abort signal", async () => {
    const deps = dependencies([["1.1.1.1", "8.8.8.8"]]);
    const controller = new AbortController();
    await expect(fetchAllowedSourcePage("https://divar.ir/ad?q=1", controller.signal, deps))
      .resolves.toEqual({ html: "<title>ok</title>", title: "ok" });
    expect(deps.request).toHaveBeenCalledWith(
      new URL("https://divar.ir/ad?q=1"),
      "1.1.1.1",
      controller.signal,
    );
  });

  it("revalidates and resolves DNS again after every redirect", async () => {
    const deps = dependencies(
      [["1.1.1.1"], ["8.8.8.8"]],
      [
        { html: "", title: "", redirect: "https://www.sheypoor.com/ad/2" },
        { html: "<title>final</title>", title: "final" },
      ],
    );
    await expect(fetchAllowedSourcePage("https://divar.ir/ad/1", undefined, deps))
      .resolves.toEqual({ html: "<title>final</title>", title: "final" });
    expect(deps.lookup).toHaveBeenCalledTimes(2);
    expect(deps.request.mock.calls.map((call) => call[1])).toEqual(["1.1.1.1", "8.8.8.8"]);
  });

  it("rejects redirects to unapproved hosts, IP literals, and non-HTTPS URLs", async () => {
    for (const redirect of [
      "https://attacker.test/steal",
      "https://127.0.0.1/admin",
      "http://divar.ir/insecure",
    ]) {
      const deps = dependencies([["1.1.1.1"]], [{ html: "", title: "", redirect }]);
      await expect(fetchAllowedSourcePage("https://divar.ir/ad", undefined, deps))
        .rejects.toThrow("دامنه یا درگاه غیرمجاز");
      expect(deps.lookup).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects an approved-host redirect if its DNS resolves to a private address", async () => {
    const deps = dependencies(
      [["1.1.1.1"], ["192.168.1.2"]],
      [{ html: "", title: "", redirect: "https://www.sheypoor.com/ad" }],
    );
    await expect(fetchAllowedSourcePage("https://divar.ir/ad", undefined, deps))
      .rejects.toThrow("نشانی شبکه مقصد عمومی و امن نیست");
    expect(deps.request).toHaveBeenCalledTimes(1);
  });

  it("rejects non-standard ports and malformed redirect locations", async () => {
    const portDeps = dependencies();
    await expect(fetchAllowedSourcePage("https://divar.ir:8443/ad", undefined, portDeps))
      .rejects.toThrow("دامنه یا درگاه غیرمجاز");
    expect(portDeps.lookup).not.toHaveBeenCalled();

    const malformedDeps = dependencies([["1.1.1.1"]], [
      { html: "", title: "", redirect: "https://[malformed" },
    ]);
    await expect(fetchAllowedSourcePage("https://divar.ir/ad", undefined, malformedDeps))
      .rejects.toThrow("نشانی انتقال منبع معتبر نیست");
  });

  it("limits redirect chains to four redirects", async () => {
    const deps = dependencies(
      Array.from({ length: 5 }, () => ["1.1.1.1"]),
      Array.from({ length: 5 }, (_, i) => ({
        html: "", title: "", redirect: `https://divar.ir/ad/${i + 1}`,
      })),
    );
    await expect(fetchAllowedSourcePage("https://divar.ir/ad/0", undefined, deps))
      .rejects.toThrow("تعداد انتقال‌های صفحه از حد مجاز بیشتر است");
    expect(deps.request).toHaveBeenCalledTimes(5);
  });

  it("does not perform DNS or network work when the request is already aborted", async () => {
    const deps = dependencies();
    const controller = new AbortController();
    controller.abort();
    await expect(fetchAllowedSourcePage("https://divar.ir/ad", controller.signal, deps))
      .rejects.toThrow("درخواست دریافت صفحه لغو شد");
    expect(deps.lookup).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("stops before opening a socket if abort occurs during DNS resolution", async () => {
    const controller = new AbortController();
    const deps = dependencies();
    deps.lookup.mockImplementationOnce(async () => {
      controller.abort();
      return [{ address: "1.1.1.1", family: 4 }];
    });
    await expect(fetchAllowedSourcePage("https://divar.ir/ad", controller.signal, deps))
      .rejects.toThrow("درخواست دریافت صفحه لغو شد");
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("returns promptly when DNS is still pending and the request is aborted", async () => {
    const controller = new AbortController();
    const deps = dependencies();
    deps.lookup.mockImplementationOnce(() => new Promise(() => {}));
    const pending = fetchAllowedSourcePage("https://divar.ir/ad", controller.signal, deps);
    const rejection = expect(pending).rejects.toThrow("درخواست دریافت صفحه لغو شد");
    controller.abort();
    await rejection;
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("times out a stalled DNS lookup without opening a socket", async () => {
    vi.useFakeTimers();
    try {
      const deps = dependencies();
      deps.lookup.mockImplementationOnce(() => new Promise(() => {}));
      const pending = fetchAllowedSourcePage("https://divar.ir/ad", undefined, deps);
      const rejection = expect(pending).rejects.toThrow("مهلت بررسی DNS منبع تمام شد");
      await vi.advanceTimersByTimeAsync(8_000);
      await rejection;
      expect(deps.request).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates timeout/abort failures from the pinned transport", async () => {
    const deps = dependencies();
    deps.request.mockRejectedValueOnce(new Error("request timed out"));
    await expect(fetchAllowedSourcePage("https://divar.ir/ad", undefined, deps))
      .rejects.toThrow("request timed out");
  });
});
