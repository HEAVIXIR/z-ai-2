import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * HEAVIX OpenNext adapter configuration.
 *
 * The Cloudflare-only build path uses Turbopack so OpenNext can rewrite
 * Next.js WebAssembly chunk loading to the workerd-compatible static loader
 * for the generated Prisma Worker clients. This does not alter the Node build
 * path. No cache, queue, or storage
 * override is enabled until its runtime contract is separately verified.
 */
export default {
  ...defineCloudflareConfig(),
  buildCommand: 'ulimit -n 4096 2>/dev/null || true; echo "HEAVIX_NOFILE_SOFT=$(ulimit -Sn) HARD=$(ulimit -Hn)"; node scripts/patch-next-nft-concurrency.cjs && UV_THREADPOOL_SIZE=4 node scripts/cloudflare-next-build-diagnostics.mjs',
};
