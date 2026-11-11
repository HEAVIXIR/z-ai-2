# Mandatory Agent Instructions — Heavix

Before any Cloudflare build, preview deployment, or build-triggering Git push, every agent/session MUST read:

1. [Cloudflare Build Gate & Proven Build Playbook](docs/ops/cloudflare-build-playbook.md)
2. The current build/deployment state recorded in that playbook and the latest Cloudflare build history.

These are mandatory operational gates, not optional suggestions. If the playbook cannot be read, do not start a build.

## Non-negotiable rules

- Do not start a Cloudflare build merely to "see if it works". Inspect the last successful and failed build logs first.
- Use the proven low-resource build profile documented in the playbook. In particular, do not silently switch to Turbopack; the proven successful recovery build used Webpack. If the active runtime branch depends on Turbopack-specific aliases or Workerd/OpenNext behavior, first port and verify equivalent Webpack configuration. Never remove runtime compatibility safeguards just to force Webpack.
- Preserve the proven NFT file-I/O concurrency patch and resource limits; verify the patch is present and active in the exact commit being built.
- Confirm the exact branch, commit, Next.js version, bundler, build command, cache state, and expected deploy command before triggering anything.
- Run the cheapest available local/static checks first. Inspect output-tracing scope, file-descriptor diagnostics, and OpenNext output expectations.
- Treat Cloudflare's standard build timeout and the project's monthly build quota as hard constraints. Prefer cached builds only when their cache provenance is trustworthy; do not mislabel a cache restore as a fresh compile.
- Never claim a successful deployment from a successful build alone. Verify the actual Worker version, traffic allocation, runtime health, and Preview database isolation separately.
- Never touch Production, DNS, or production databases as part of Preview work.
- If any gate is uncertain or fails, STOP and report the evidence. Do not retry with a different bundler or repeated builds without an explicit, evidence-based plan and user authorization.

The detailed playbook is the source of truth and must be updated whenever a new successful build method is verified.
