import openNextWorker from "../.open-next/worker.js";
import { isAllowedPreviewProofRequest } from "../src/lib/preview-version-worker-gate.ts";

const notFound = () => new Response(null, {
  status: 404,
  headers: {
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
  },
});

/**
 * Temporary version entrypoint for the Preview identity probe.
 *
 * This wrapper is intentionally outside the Next/OpenNext router. No request
 * reaches the application unless it is the exact GET proof route and carries
 * the one-time gate token. Do not use this as the normal deployed entrypoint.
 */
export default {
  async fetch(request, env, ctx) {
    if (!isAllowedPreviewProofRequest(request, env.HEAVIX_PREVIEW_PROOF_GATE_TOKEN)) {
      return notFound();
    }
    return openNextWorker.fetch(request, env, ctx);
  },
};
