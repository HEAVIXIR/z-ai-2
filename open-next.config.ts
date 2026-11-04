import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * HEAVIX OpenNext adapter configuration.
 *
 * The Cloudflare-only build path uses Webpack for the generated Prisma Worker
 * clients, whose query compiler is imported as an async WebAssembly module.
 * This does not alter the Node/Vercel build path. No cache, queue, or storage
 * override is enabled until its runtime contract is separately verified.
 */
export default {
  ...defineCloudflareConfig(),
  buildCommand: 'ulimit -n 4096 2>/dev/null || true; echo "HEAVIX_NOFILE_SOFT=$(ulimit -Sn) HARD=$(ulimit -Hn)"; bunx next build --webpack',
};
