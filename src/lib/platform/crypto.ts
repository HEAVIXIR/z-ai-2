/**
 * HEAVIX — Platform Crypto Abstraction (R16 GATE 04)
 *
 * Replaces node:crypto with Web Crypto API for Cloudflare Workers compatibility.
 * Provides the same operations used by auth.ts, analytics.ts, media-service.ts, etc.
 *
 * Usage:
 *   import { randomBytes, sha256, timingSafeEqual, randomHex } from '@/lib/platform/crypto';
 */

/**
 * Generate cryptographically secure random bytes.
 * Uses Web Crypto API getRandomValues (available in Node.js 19+ and Cloudflare Workers).
 */
export function randomBytes(length: number): Uint8Array {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return arr;
}

/**
 * Generate a random hex string of the given byte length (2x hex chars).
 */
export function randomHex(byteLength: number): string {
  return bytesToHex(randomBytes(byteLength));
}

/**
 * Generate a random base64url string of the given byte length.
 */
export function randomBase64Url(byteLength: number): string {
  return bytesToBase64Url(randomBytes(byteLength));
}

/**
 * Compute SHA-256 hash of input data, return hex string.
 * Uses Web Crypto API subtle.digest (async).
 */
export async function sha256(data: string | Uint8Array): Promise<string> {
  const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  // Create a clean ArrayBuffer copy (TS5 strict mode requires ArrayBuffer, not Uint8Array<ArrayBufferLike>)
  const ab = new ArrayBuffer(input.byteLength);
  new Uint8Array(ab).set(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', ab);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Constant-time comparison of two Uint8Array/Buffer values.
 * Prevents timing attacks on token comparisons.
 */
export function timingSafeEqual(a: Uint8Array | string, b: Uint8Array | string): boolean {
  const bufA = typeof a === 'string' ? new TextEncoder().encode(a) : a;
  const bufB = typeof b === 'string' ? new TextEncoder().encode(b) : b;

  if (bufA.length !== bufB.length) return false;

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

// ─── Helpers ─────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// crypto is a Web Crypto global available in both Node.js 19+ and Cloudflare Workers
// No need to re-export — it's available as a global
