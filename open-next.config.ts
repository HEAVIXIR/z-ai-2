import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * HEAVIX OpenNext adapter configuration.
 *
 * This enables an isolated Cloudflare build experiment only. It does not
 * authorize deployment or production traffic. Cache, queue, and storage
 * adapters remain intentionally unconfigured until their runtime contracts
 * and non-production bindings are verified.
 */
export default defineCloudflareConfig();
