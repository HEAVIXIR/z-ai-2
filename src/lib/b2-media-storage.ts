/**
 * HEAVIX private Backblaze B2 media storage.
 *
 * S3 Signature V4 is implemented with Web Crypto so this adapter works in
 * Node.js and Cloudflare Workerd without shipping a Node-only S3 SDK.
 * It deliberately exposes object operations only: no bucket enumeration,
 * bucket configuration, lifecycle, encryption, or key-management APIs.
 *
 * Fixed security boundary:
 *   bucket = heavix-dev-assets
 *   prefix = heavix-media/
 *   endpoint = https://s3.us-east-005.backblazeb2.com
 *
 * Credentials are read only from server runtime environment variables:
 * B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_MEDIA_PREFIX,
 * B2_REGION, B2_S3_ENDPOINT.
 */

const EXPECTED_BUCKET = "heavix-dev-assets";
const EXPECTED_PREFIX = "heavix-media/";
const EXPECTED_REGION = "us-east-005";
const EXPECTED_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const SERVICE = "s3";
const encoder = new TextEncoder();

export interface B2MediaConfig {
  keyId: string;
  applicationKey: string;
  bucket: typeof EXPECTED_BUCKET;
  prefix: typeof EXPECTED_PREFIX;
  region: typeof EXPECTED_REGION;
  endpoint: typeof EXPECTED_ENDPOINT;
}

export interface B2ListResult {
  keys: string[];
  nextContinuationToken: string | null;
  isTruncated: boolean;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("B2 media storage is not configured.");
  return value;
}

/** Validate every mutable environment field against the fixed project scope. */
export function getB2MediaConfig(): B2MediaConfig {
  const keyId = requiredEnv("B2_KEY_ID");
  const applicationKey = requiredEnv("B2_APPLICATION_KEY");
  const bucket = requiredEnv("B2_BUCKET_NAME");
  const prefix = requiredEnv("B2_MEDIA_PREFIX");
  const region = requiredEnv("B2_REGION");
  const endpoint = requiredEnv("B2_S3_ENDPOINT").replace(/\/+$/, "");

  if (
    bucket !== EXPECTED_BUCKET ||
    prefix !== EXPECTED_PREFIX ||
    region !== EXPECTED_REGION ||
    endpoint !== EXPECTED_ENDPOINT ||
    !/^[a-zA-Z0-9]{20,80}$/.test(keyId) ||
    applicationKey.length < 20
  ) {
    throw new Error("B2 media storage configuration is outside the approved scope.");
  }

  return {
    keyId,
    applicationKey,
    bucket: EXPECTED_BUCKET,
    prefix: EXPECTED_PREFIX,
    region: EXPECTED_REGION,
    endpoint: EXPECTED_ENDPOINT,
  };
}

function assertMediaKey(key: string, config: B2MediaConfig): void {
  if (
    !key.startsWith(config.prefix) ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").some((part) => part === "." || part === "..") ||
    key.includes("//")
  ) {
    throw new Error("B2 object key is outside the approved media prefix.");
  }
}

function arrayBufferOf(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return hex(await crypto.subtle.digest("SHA-256", arrayBufferOf(bytes)));
}

async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    arrayBufferOf(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, arrayBufferOf(encoder.encode(value))));
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    "%" + char.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function canonicalObjectPath(bucket: string, key: string): string {
  return "/" + [bucket, ...key.split("/")].map(encodeRfc3986).join("/");
}

function canonicalQuery(params: Array<[string, string]>): string {
  return params
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv))
    .map(([key, value]) => key + "=" + value)
    .join("&");
}

function amzTimestamp(date: Date): { full: string; day: string } {
  const full = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { full, day: full.slice(0, 8) };
}

async function signingKey(secret: string, day: string, region: string): Promise<Uint8Array> {
  const dateKey = await hmac(encoder.encode("AWS4" + secret), day);
  const regionKey = await hmac(dateKey, region);
  const serviceKey = await hmac(regionKey, SERVICE);
  return hmac(serviceKey, "aws4_request");
}

async function signature(
  config: B2MediaConfig,
  method: string,
  canonicalUri: string,
  query: string,
  canonicalHeaders: string,
  signedHeaders: string,
  payloadHash: string,
  timestamp: { full: string; day: string },
): Promise<string> {
  const canonicalRequest = [
    method,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = timestamp.day + "/" + config.region + "/" + SERVICE + "/aws4_request";
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp.full,
    scope,
    await sha256(canonicalRequest),
  ].join("\n");
  const key = await signingKey(config.applicationKey, timestamp.day, config.region);
  return hex(await crypto.subtle.sign(
    { name: "HMAC" },
    await crypto.subtle.importKey("raw", arrayBufferOf(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    arrayBufferOf(encoder.encode(stringToSign)),
  ));
}

async function signedRequest(
  method: "GET" | "PUT" | "DELETE",
  key: string,
  options: { body?: Uint8Array | string; contentType?: string; query?: Array<[string, string]>; extraHeaders?: Record<string, string> } = {},
): Promise<Response> {
  const config = getB2MediaConfig();
  if (key) assertMediaKey(key, config);
  else if (method !== "GET" || !options.query?.some(([name]) => name === "list-type")) {
    throw new Error("B2 object key is required for this operation.");
  }

  const timestamp = amzTimestamp(new Date());
  const payload = options.body === undefined
    ? new Uint8Array()
    : typeof options.body === "string"
      ? encoder.encode(options.body)
      : options.body;
  const payloadHash = await sha256(payload);
  const host = new URL(config.endpoint).host;
  const headersToSign: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": timestamp.full,
  };
  if (options.contentType) headersToSign["content-type"] = options.contentType;
  for (const [name, value] of Object.entries(options.extraHeaders ?? {})) {
    headersToSign[name.toLowerCase()] = value.trim();
  }

  const headerNames = Object.keys(headersToSign).sort();
  const canonicalHeaders = headerNames
    .map((name) => name + ":" + headersToSign[name].trim().replace(/\s+/g, " ") + "\n")
    .join("");
  const signedHeaders = headerNames.join(";");
  const canonicalUri = canonicalObjectPath(config.bucket, key);
  const query = canonicalQuery(options.query ?? []);
  const sig = await signature(
    config,
    method,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
    timestamp,
  );
  const scope = timestamp.day + "/" + config.region + "/" + SERVICE + "/aws4_request";
  const authorization =
    "AWS4-HMAC-SHA256 Credential=" + config.keyId + "/" + scope +
    ", SignedHeaders=" + signedHeaders + ", Signature=" + sig;

  const headers = new Headers();
  for (const name of headerNames) {
    if (name !== "host") headers.set(name, headersToSign[name]);
  }
  headers.set("authorization", authorization);

  const url = config.endpoint + canonicalUri + (query ? "?" + query : "");
  const response = await fetch(url, {
    method,
    headers,
    body: method === "PUT" ? arrayBufferOf(payload) : undefined,
    redirect: "error",
  });
  if (!response.ok) {
    // Do not include response bodies or request headers; they can contain
    // provider diagnostics or sensitive request context.
    throw new Error("B2 object operation failed (HTTP " + response.status + ").");
  }
  return response;
}

export async function putB2MediaObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  if (!(body instanceof Uint8Array) || body.byteLength === 0) {
    throw new Error("B2 object body is empty.");
  }
  if (!contentType || contentType.length > 128) {
    throw new Error("B2 object content type is invalid.");
  }
  await signedRequest("PUT", key, { body, contentType });
}

export async function getB2MediaObject(key: string): Promise<Uint8Array> {
  const response = await signedRequest("GET", key);
  return new Uint8Array(await response.arrayBuffer());
}

export async function deleteB2MediaObject(key: string): Promise<void> {
  await signedRequest("DELETE", key);
}

/** Copy a staged object to its final key within the same private bucket. */
export async function copyB2MediaObject(sourceKey: string, destinationKey: string): Promise<void> {
  const config = getB2MediaConfig();
  assertMediaKey(sourceKey, config);
  assertMediaKey(destinationKey, config);
  if (sourceKey === destinationKey) return;
  const encodedSource = "/" + [config.bucket, ...sourceKey.split("/")].map(encodeRfc3986).join("/");
  const response = await signedRequest("PUT", destinationKey, {
    extraHeaders: { "x-amz-copy-source": encodedSource },
  });
  const body = await response.text();
  if (/<Error[\s>]/i.test(body)) {
    throw new Error("B2 object copy failed.");
  }
}

/** List only object names beneath the approved prefix; never calls ListBuckets. */
export async function listB2MediaObjects(
  prefix: string,
  limit = 200,
): Promise<string[]> {
  const config = getB2MediaConfig();
  if (!prefix.startsWith(config.prefix) || prefix.includes("..")) {
    throw new Error("B2 list prefix is outside the approved media namespace.");
  }
  const max = Math.max(1, Math.min(1000, Math.trunc(limit)));
  const keys: string[] = [];
  let continuation: string | null = null;
  let pages = 0;

  do {
    const query: Array<[string, string]> = [
      ["encoding-type", "url"],
      ["list-type", "2"],
      ["max-keys", String(Math.min(1000, max - keys.length))],
      ["prefix", prefix],
    ];
    if (continuation) query.push(["continuation-token", continuation]);
    const response = await signedRequest("GET", "", { query });
    const xml = await response.text();
    const matches = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)];
    for (const match of matches) {
      const encoded = match[1].replace(/&amp;/g, "&");
      const decoded = decodeURIComponent(encoded);
      assertMediaKey(decoded, config);
      keys.push(decoded);
      if (keys.length >= max) break;
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    const token = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
    continuation = truncated && token ? token.replace(/&amp;/g, "&") : null;
    pages += 1;
    if (pages > 20) throw new Error("B2 media listing exceeded the safety page limit.");
  } while (continuation && keys.length < max);

  return keys;
}

/** Short-lived private read URL; credentials never leave this server function. */
export async function createB2MediaReadUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const config = getB2MediaConfig();
  assertMediaKey(key, config);
  const expires = Math.max(60, Math.min(900, Math.trunc(expiresInSeconds)));
  const timestamp = amzTimestamp(new Date());
  const host = new URL(config.endpoint).host;
  const canonicalUri = canonicalObjectPath(config.bucket, key);
  const scope = timestamp.day + "/" + config.region + "/" + SERVICE + "/aws4_request";
  const params: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", config.keyId + "/" + scope],
    ["X-Amz-Date", timestamp.full],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const query = canonicalQuery(params);
  const sig = await signature(
    config,
    "GET",
    canonicalUri,
    query,
    "host:" + host + "\n",
    "host",
    "UNSIGNED-PAYLOAD",
    timestamp,
  );
  return config.endpoint + canonicalUri + "?" + query + "&X-Amz-Signature=" + sig;
}

export const B2_MEDIA_SCOPE = Object.freeze({
  bucket: EXPECTED_BUCKET,
  prefix: EXPECTED_PREFIX,
  region: EXPECTED_REGION,
  endpoint: EXPECTED_ENDPOINT,
});
