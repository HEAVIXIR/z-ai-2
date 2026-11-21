import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock, httpsRequestMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
  httpsRequestMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));
vi.mock("node:https", () => ({ request: httpsRequestMock }));

import { fetchAllowedSourcePage } from "@/lib/server/safe-source-fetch";

type FakeResponse = EventEmitter & {
  statusCode: number;
  headers: Record<string, string>;
  resume: () => void;
  destroy: (error?: Error) => void;
};

type FakeRequest = EventEmitter & {
  setTimeout: (milliseconds: number, callback: () => void) => void;
  end: () => void;
  destroy: (error?: Error) => void;
};

function response(): FakeResponse {
  const value = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headers: { "content-type": "text/html" },
    resume: vi.fn(),
    destroy: vi.fn(),
  });
  return value as FakeResponse;
}

function request(): FakeRequest {
  const value = Object.assign(new EventEmitter(), {
    setTimeout: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn((error?: Error) => {
      if (error) queueMicrotask(() => value.emit("error", error));
      queueMicrotask(() => value.emit("close"));
    }),
  });
  return value as FakeRequest;
}

describe("native Node HTTPS source transport", () => {
  let currentResponse: FakeResponse;
  let currentRequest: FakeRequest;

  beforeEach(() => {
    vi.clearAllMocks();
    currentResponse = response();
    currentRequest = request();
    lookupMock.mockResolvedValue([{ address: "1.1.1.1", family: 4 }]);
    httpsRequestMock.mockImplementation((_options, onResponse) => {
      queueMicrotask(() => onResponse(currentResponse));
      return currentRequest;
    });
  });

  it("pins Node HTTPS lookup to the DNS address already validated by the fetcher", async () => {
    const pending = fetchAllowedSourcePage("https://divar.ir/ad");
    await vi.waitFor(() => expect(httpsRequestMock).toHaveBeenCalledOnce());

    const options = httpsRequestMock.mock.calls[0]![0] as {
      hostname: string;
      servername: string;
      lookup: (_hostname: string, _options: unknown, callback: (error: Error | null, address: string, family: number) => void) => void;
    };
    expect(options.hostname).toBe("divar.ir");
    expect(options.servername).toBe("divar.ir");
    const pinned = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      options.lookup("divar.ir", {}, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address, family });
      });
    });
    expect(pinned).toEqual({ address: "1.1.1.1", family: 4 });

    currentResponse.emit("data", "<title>HEAVIX test</title>");
    currentResponse.emit("end");
    await expect(pending).resolves.toEqual({
      html: "<title>HEAVIX test</title>",
      title: "HEAVIX test",
    });
  });

  it("rejects a response stream error immediately after response headers", async () => {
    const pending = fetchAllowedSourcePage("https://divar.ir/ad");
    await vi.waitFor(() => expect(httpsRequestMock).toHaveBeenCalledOnce());

    currentResponse.emit("error", new Error("response stream failed"));
    await expect(pending).rejects.toThrow("response stream failed");
  });

  it("rejects a response aborted before its body completes", async () => {
    const pending = fetchAllowedSourcePage("https://divar.ir/ad");
    await vi.waitFor(() => expect(httpsRequestMock).toHaveBeenCalledOnce());

    currentResponse.emit("aborted");
    await expect(pending).rejects.toThrow("پاسخ منبع پیش از تکمیل قطع شد");
  });

  it("destroys the native request when the caller aborts", async () => {
    const controller = new AbortController();
    const pending = fetchAllowedSourcePage("https://divar.ir/ad", controller.signal);
    await vi.waitFor(() => expect(httpsRequestMock).toHaveBeenCalledOnce());

    controller.abort();
    await expect(pending).rejects.toThrow("درخواست دریافت صفحه لغو شد");
    expect(currentRequest.destroy).toHaveBeenCalled();
  });
});
