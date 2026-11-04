import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * HEAVIX OpenNext adapter configuration.
 * This is an isolated Cloudflare build experiment, not deployment approval.
 */
export default {
  ...defineCloudflareConfig(),
  buildCommand: 'ulimit -n 4096 2>/dev/null || true; echo "HEAVIX_NOFILE_SOFT=$(ulimit -Sn) HARD=$(ulimit -Hn)"; node scripts/patch-next-nft-concurrency.cjs && UV_THREADPOOL_SIZE=4 node scripts/cloudflare-next-build-diagnostics.mjs',
};
