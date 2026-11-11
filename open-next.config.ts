import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * HEAVIX OpenNext adapter configuration.
 *
 * Cloudflare release builds explicitly use Webpack + async WebAssembly for
 * the generated Prisma Worker clients. This exact Next.js 16.4.5 runtime
 * profile previously completed an OpenNext build and emitted worker.js.
 * Turbopack remains an opt-in diagnostic only; it is not the release default.
 * No cache, queue, or storage override is enabled until its runtime contract
 * is separately verified.
 */
export default {
  ...defineCloudflareConfig(),
  buildCommand: 'ulimit -n 4096 2>/dev/null || true; echo "HEAVIX_NOFILE_SOFT=$(ulimit -Sn) HARD=$(ulimit -Hn)"; node scripts/patch-next-nft-concurrency.cjs && UV_THREADPOOL_SIZE=4 HEAVIX_NEXT_BUNDLER=webpack node scripts/cloudflare-next-build-diagnostics.mjs',
};
