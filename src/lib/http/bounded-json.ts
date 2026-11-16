export type BoundedJsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: 400 | 413 | 415; error: string };

/** Read a JSON object without buffering more than maxBytes into memory. */
export async function readBoundedJsonObject(
  request: Request,
  maxBytes: number,
): Promise<BoundedJsonObjectResult> {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return { ok: false, status: 415, error: "Content-Type must be application/json" };
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      return { ok: false, status: 400, error: "Invalid Content-Length" };
    }
    if (length > maxBytes) return { ok: false, status: 413, error: "Request body too large" };
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400, error: "Request body is required" };
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      try { await reader.cancel(); } catch { /* stream already closed */ }
      return { ok: false, status: 413, error: "Request body too large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, status: 400, error: "Request body must be valid UTF-8" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: "Request body must be an object" };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}
