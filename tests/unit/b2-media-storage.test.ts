import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  B2_MEDIA_SCOPE,
  createB2MediaReadUrl,
  deleteB2MediaObject,
  getB2MediaConfig,
  getB2MediaObject,
  listB2MediaObjects,
  putB2MediaObject,
} from "@/lib/b2-media-storage";

const ENV_KEYS = [
  "B2_KEY_ID",
  "B2_APPLICATION_KEY",
  "B2_BUCKET_NAME",
  "B2_MEDIA_PREFIX",
  "B2_REGION",
  "B2_S3_ENDPOINT",
] as const;

const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function configureB2() {
  process.env.B2_KEY_ID = "0055d132b1dcc410000000004";
  process.env.B2_APPLICATION_KEY = "test-application-key-material-never-real";
  process.env.B2_BUCKET_NAME = "heavix-dev-assets";
  process.env.B2_MEDIA_PREFIX = "heavix-media/";
  process.env.B2_REGION = "us-east-005";
  process.env.B2_S3_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
}

describe("HEAVIX scoped Backblaze B2 media adapter", () => {
  beforeEach(() => {
    configureB2();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.unstubAllGlobals();
  });

  it("pins the adapter to the dedicated media bucket and prefix", () => {
    expect(getB2MediaConfig()).toMatchObject({
      bucket: "heavix-dev-assets",
      prefix: "heavix-media/",
      region: "us-east-005",
      endpoint: "https://s3.us-east-005.backblazeb2.com",
    });
    expect(B2_MEDIA_SCOPE.bucket).toBe("heavix-dev-assets");
    expect(B2_MEDIA_SCOPE.prefix).toBe("heavix-media/");
  });

  it("fails closed when the media bucket is not the approved bucket", () => {
    process.env.B2_BUCKET_NAME = "heavix-db-backups";
    expect(() => getB2MediaConfig()).toThrow(/approved scope/i);
  });

  it("fails closed when required credentials are absent", () => {
    delete process.env.B2_APPLICATION_KEY;
    expect(() => getB2MediaConfig()).toThrow(/not configured/i);
  });

  it("signs a scoped object upload without exposing the application key", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await putB2MediaObject(
      "heavix-media/staging/user-1/asset.webp",
      new Uint8Array([1, 2, 3, 4]),
      "image/webp",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toContain("/heavix-dev-assets/heavix-media/staging/user-1/asset.webp");
    expect(headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(headers.get("x-amz-content-sha256")).toMatch(/^[a-f0-9]{64}$/);
    expect(headers.get("x-amz-date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(headers.get("content-type")).toBe("image/webp");
    expect(String(headers.get("authorization"))).not.toContain(process.env.B2_APPLICATION_KEY);
  });

  it("rejects arbitrary object keys before making a network request", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      putB2MediaObject("heavix-db-backups/backup.sql", new Uint8Array([1]), "application/octet-stream"),
    ).rejects.toThrow(/outside the approved media prefix/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists only the configured media prefix and decodes S3 object keys", async () => {
    const xml = [
      "<ListBucketResult>",
      "<IsTruncated>false</IsTruncated>",
      "<Contents><Key>heavix-media%2Fmetadata%2Fasset-1.json</Key></Contents>",
      "<Contents><Key>heavix-media%2Fmetadata%2Fasset-2.json</Key></Contents>",
      "</ListBucketResult>",
    ].join("");
    const fetchMock = vi.fn(async () => new Response(xml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const keys = await listB2MediaObjects("heavix-media/metadata/", 20);

    expect(keys).toEqual([
      "heavix-media/metadata/asset-1.json",
      "heavix-media/metadata/asset-2.json",
    ]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("list-type=2");
    expect(url).toContain("prefix=heavix-media%2Fmetadata%2F");
    expect(url).not.toContain("list-buckets");
  });

  it("downloads an object body through a signed server-side request", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([8, 9]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bytes = await getB2MediaObject("heavix-media/objects/asset.webp");

    expect(Array.from(bytes)).toEqual([8, 9]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deletes only an object under the media prefix", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteB2MediaObject("heavix-media/staging/user-1/asset.webp");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(url).toContain("/heavix-dev-assets/heavix-media/staging/user-1/asset.webp");
  });

  it("creates short-lived private read URLs without including the secret key", async () => {
    const url = await createB2MediaReadUrl("heavix-media/objects/asset.webp", 300);

    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Expires=300");
    expect(url).toContain("X-Amz-SignedHeaders=host");
    expect(url).toContain("X-Amz-Signature=");
    expect(url).not.toContain(process.env.B2_APPLICATION_KEY);
  });

  it("rejects listing outside the approved prefix", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listB2MediaObjects("heavix-db-backups/", 10)).rejects.toThrow(
      /outside the approved media namespace/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
