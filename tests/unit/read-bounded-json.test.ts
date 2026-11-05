import { describe, expect, it, vi } from "vitest";
import {
  AI_GATEWAY_MAX_REQUEST_BODY_BYTES,
  readBoundedJson,
} from "@/lib/read-bounded-json";

function requestFromChunks(chunks: Uint8Array[], headers?: HeadersInit) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    request: new Request("https://heavix.ir/api/ai-gateway", {
      method: "POST",
      headers,
      body,
      // Node's Request implementation requires duplex for streamed bodies.
      // @ts-expect-error Node/Undici extension used by the test runtime.
      duplex: "half",
    }),
    wasCancelled: () => cancelled,
  };
}

describe("readBoundedJson", () => {
  it("parses a valid JSON body within the byte ceiling", async () => {
    const request = new Request("https://heavix.ir/api/ai-gateway", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "17" },
      body: JSON.stringify({ task: "SEARCH" }),
    });
    await expect(readBoundedJson(request)).resolves.toEqual({
      ok: true,
      value: { task: "SEARCH" },
    });
  });

  it("rejects an oversized declared Content-Length before reading", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const request = new Request("https://heavix.ir/api/ai-gateway", {
      method: "POST",
      headers: { "content-length": String(AI_GATEWAY_MAX_REQUEST_BODY_BYTES + 1) },
      body,
      // @ts-expect-error Node/Undici extension used by the test runtime.
      duplex: "half",
    });
    await expect(readBoundedJson(request)).resolves.toEqual({
      ok: false,
      status: 413,
      error: "request body too large",
    });
    expect(cancel).toHaveBeenCalled();
  });

  it("rejects chunked/unknown-length payloads once the streamed byte cap is crossed", async () => {
    const payload = new TextEncoder().encode(JSON.stringify({ input: "x".repeat(70_000) }));
    const { request, wasCancelled } = requestFromChunks([
      payload.slice(0, 32_000),
      payload.slice(32_000),
    ]);
    const result = await readBoundedJson(request);
    expect(result).toEqual({
      ok: false,
      status: 413,
      error: "request body too large",
    });
    expect(wasCancelled()).toBe(true);
  });

  it("rejects invalid UTF-8 rather than silently replacing invalid bytes", async () => {
    const { request } = requestFromChunks([new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d])]);
    await expect(readBoundedJson(request)).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid JSON body",
    });
  });

  it("rejects malformed JSON", async () => {
    const { request } = requestFromChunks([new TextEncoder().encode('{"task":')]);
    await expect(readBoundedJson(request)).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid JSON body",
    });
  });

  it("enforces the streamed limit even when Content-Length is absent or understated", async () => {
    const bytes = new TextEncoder().encode("x".repeat(128));
    const { request } = requestFromChunks([bytes], { "content-length": "1" });
    await expect(readBoundedJson(request, 64)).resolves.toEqual({
      ok: false,
      status: 413,
      error: "request body too large",
    });
  });

  it("rejects malformed Content-Length", async () => {
    const { request } = requestFromChunks([new TextEncoder().encode("{}")], {
      "content-length": "not-a-number",
    });
    await expect(readBoundedJson(request)).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid JSON body",
    });
  });

  it("rejects an empty request body", async () => {
    const request = new Request("https://heavix.ir/api/ai-gateway", {
      method: "POST",
    });
    await expect(readBoundedJson(request)).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid JSON body",
    });
  });
});
