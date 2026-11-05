export const AI_GATEWAY_MAX_REQUEST_BODY_BYTES = 64 * 1024;

export type BoundedJsonResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 413; error: "invalid JSON body" | "request body too large" };

/**
 * Read and parse JSON only after enforcing a hard byte ceiling.
 * Content-Length is an early-rejection optimization, never the sole limit:
 * streamed/chunked requests are counted as bytes while being consumed.
 */
export async function readBoundedJson<T = unknown>(
  request: Request,
  maxBytes = AI_GATEWAY_MAX_REQUEST_BODY_BYTES,
): Promise<BoundedJsonResult<T>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      try {
        await request.body?.cancel("invalid Content-Length header");
      } catch {
        // Preserve the deterministic 400 response if the stream is already closed.
      }
      return { ok: false, status: 400, error: "invalid JSON body" };
    }
    if (Number(contentLength) > maxBytes) {
      try {
        await request.body?.cancel("request body exceeds configured limit");
      } catch {
        // The rejection remains authoritative even if the stream is already closed.
      }
      return { ok: false, status: 413, error: "request body too large" };
    }
  }

  if (!request.body) {
    return { ok: false, status: 400, error: "invalid JSON body" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel("request body exceeds configured limit");
        } catch {
          // Do not mask the 413 response if cancellation races with stream closure.
        }
        return { ok: false, status: 413, error: "request body too large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "invalid JSON body" };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A cancelled or errored reader may already have released its lock.
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, status: 400, error: "invalid JSON body" };
  }
}
