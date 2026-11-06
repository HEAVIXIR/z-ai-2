import openNextWorker from "../.open-next/worker.js";
import { handlePreviewGate } from "../src/lib/preview-gate.ts";

export default {
  async fetch(request, env, ctx) {
    return handlePreviewGate(request, env, () => openNextWorker.fetch(request, env, ctx));
  },
};
