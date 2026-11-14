# Instructions for AI agents and contributors

Before making any HEAVIX changes, read and follow these documents in order:

1. `docs/operations/HEAVIX-AGENT-CONTINUATION.md`
2. `docs/operations/HEAVIX-CURRENT-STATE.json`
3. `docs/operations/HEAVIX-WORKLOG.md`
4. `docs/superpowers/plans/2026-11-11-heavix-full-product-integration.md`
5. `docs/audits/HEAVIX-LEGACY-TO-CURRENT-INVENTORY-2026-11-11.md`
6. `docs/operations/HEAVIX-CLOUDFLARE-BUILD-CONTINUITY-AND-QUOTA-POLICY-2026-11-11.md` — mandatory before any build, Next.js/OpenNext/Cloudflare work, or infrastructure action.
7. Project principles, architecture overview, and homepage visual-parity specification.

Do not restart completed discovery. Resume from the exact `next_action` in the current-state JSON, verify the active branch/head, and append evidence to the worklog after each meaningful session. Distinguish verified facts from hypotheses and unverified work.

**Build-budget rule (mandatory):** The owner reports that more than 2,000 of the 3,000 monthly free Cloudflare build allowance had been consumed by 2026-11-11. Never use Cloudflare Builds as a debugging loop. The owner confirms that the long-running Next.js/Cloudflare build problem was already solved in the prior session and had produced a successful Preview. Recover and reuse that exact proven solution; do not rediscover it or run speculative builds. Batch fixes, prove them with local/CI/artifact checks, and reserve a single Cloudflare build for a fully preflighted candidate. No automatic retries after a stalled/failed build. The exact historical fast-build method has now been reconstructed and recorded in the mandatory runbook: successful Cloudflare builds used Next.js 16.4.3 + explicit Webpack, the NFT file-tracing concurrency/semaphore patch, `ulimit -n 4096`, `UV_THREADPOOL_SIZE=4`, one static-generation CPU, Webpack parallelism 4, and tracing exclusions. The current head defaults to Turbopack and is not yet equivalent; do not launch a Cloudflare build or merely flip an environment variable. First port equivalent Webpack aliases/settings and prove the exact head offline/CI.

Preserve the known-good Preview baseline unless explicitly authorized otherwise: Worker `heavix-preview`, active deployment `9c079e5b-e3df-4295-80e0-e930d2d25552`, version #17 `063ce438-ca3a-4482-b416-9260b780bccf` (100% traffic, created 2026-11-10 21:08:35 UTC). This was a Wrangler-uploaded Preview version; do not mislabel it as a successful Cloudflare Build pipeline.

HEAVIX recovery must stay isolated on `recovery/heavix-full-product-integration-2026-11-11` unless the owner explicitly approves a different branch. Do not modify `main`, Production, DNS, or the existing Preview Worker configuration. Do not deploy or touch databases until the documented code, CI, artifact, and database-identity gates pass. Never grant blanket permissions or claim tests/deployments succeeded without evidence.

The current objective is restoration of the full existing HEAVIX product—not a simplified replacement. Preserve PageRenderer/PageBuilder and current domain contracts while restoring all required homepage sections and auditing every product capability.


## Mandatory Cloudflare trigger protection

Before creating or pushing any branch, inspect the live non-production Cloudflare Build trigger and add the exact branch name to `branch_excludes`; read back and verify the exclusion first. Do not assume wildcard exclusion for `proof/*`. Current excluded work branches include `recovery/heavix-full-product-integration-2026-11-11`, `proof/webpack-worker-wasm-2026-11-11`, and `proof/jsquash-worker-image-2026-11-11`. The 2026-11-11 proof-branch auto-build incident is documented in the quota runbook. No Cloudflare Build may be triggered during validation.
