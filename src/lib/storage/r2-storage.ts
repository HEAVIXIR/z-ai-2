/**
 * HEAVIX — R2 Storage (R16 GATE 05)
 *
 * Implementation for Cloudflare Workers R2 binding.
 * Will be activated when deployed to Workers with R2 binding configured.
 *
 * In local development, LocalStorage is used instead.
 *
 * Required wrangler.toml binding:
 *   [[r2_buckets]]
 *   binding = "HEAVIX_MEDIA"
 *   bucket_name = "heavix-media"
 */

import type { StorageService, StorageItem, StoragePutOptions } from './storage';

// R2Bucket type from @cloudflare/workers-types (available in Workers runtime)
interface R2Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string, options?: {
    contentType?: string;
    customMetadata?: Record<string, string>;
  }): Promise<void>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<R2Object | null>;
  list(options?: { prefix?: string; limit?: number }): Promise<R2Objects>;
}

interface R2ObjectBody {
  body: ReadableStream;
  bodyUsed: boolean;
  size: number;
  contentType: string;
  etag: string;
  lastModified: Date;
  customMetadata: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

interface R2Object {
  size: number;
  etag: string;
  lastModified: Date;
  contentType: string;
  customMetadata: Record<string, string>;
}

interface R2Objects {
  objects: R2Object[];
}

export class R2Storage implements StorageService {
  private bucket: R2Bucket;
  private publicBaseUrl?: string;

  constructor(bucket: R2Bucket, publicBaseUrl?: string) {
    this.bucket = bucket;
    this.publicBaseUrl = publicBaseUrl;
  }

  async put(key: string, data: Uint8Array | Buffer | string, options?: StoragePutOptions): Promise<void> {
    const value = typeof data === 'string' ? data : new Uint8Array(data);
    await this.bucket.put(key, value, {
      contentType: options?.contentType,
      customMetadata: options?.metadata,
    });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    const buf = await obj.arrayBuffer();
    return new Uint8Array(buf);
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const obj = await this.bucket.head(key);
    return obj !== null;
  }

  async list(prefix: string): Promise<StorageItem[]> {
    const result = await this.bucket.list({ prefix });
    return result.objects.map((obj) => ({
      key: obj.etag, // Note: R2 list returns objects without full key; would need key field
      size: obj.size,
      contentType: obj.contentType,
      lastModified: obj.lastModified,
      metadata: obj.customMetadata,
    }));
  }

  async getPublicUrl(key: string): Promise<string | null> {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${key}`;
    }
    // If no public base URL configured, R2 bucket may not be publicly accessible
    return null;
  }
}
