/**
 * HEAVIX — Storage Service Interface (R16 GATE 05)
 *
 * Abstraction over filesystem (local dev) and R2 (Cloudflare Workers).
 * All filesystem-dependent routes should use this interface, not process.cwd()/fs directly.
 */

export interface StoragePutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  public?: boolean;
}

export interface StorageItem {
  key: string;
  size: number;
  contentType?: string;
  metadata?: Record<string, string>;
  lastModified?: Date;
}

export interface StorageService {
  /** Write data to storage at the given key. */
  put(key: string, data: Uint8Array | Buffer | string, options?: StoragePutOptions): Promise<void>;

  /** Read data from storage by key. Returns null if not found. */
  get(key: string): Promise<Uint8Array | null>;

  /** Delete an item from storage. */
  delete(key: string): Promise<void>;

  /** Check if an item exists. */
  exists(key: string): Promise<boolean>;

  /** List items with the given prefix. */
  list(prefix: string): Promise<StorageItem[]>;

  /** Get a public URL for the item (if public) or null. */
  getPublicUrl(key: string): Promise<string | null>;
}

// ─── Key Structure ──────────────────────────────────────
// articles/{id}/{filename}
// ai-generated/{id}/{filename}
// categories/{id}/{filename}
// reels/{id}/{filename}
// media/{id}/{filename}
// backups/{id}/{filename}

export const STORAGE_KEYS = {
  article: (id: string, filename: string) => `articles/${id}/${filename}`,
  aiGenerated: (id: string, filename: string) => `ai-generated/${id}/${filename}`,
  category: (id: string, filename: string) => `categories/${id}/${filename}`,
  reel: (id: string, filename: string) => `reels/${id}/${filename}`,
  media: (id: string, filename: string) => `media/${id}/${filename}`,
  backup: (id: string, filename: string) => `backups/${id}/${filename}`,
} as const;
