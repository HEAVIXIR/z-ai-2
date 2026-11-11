# HEAVIX — Cloudflare Build Continuity & Quota Policy
Date: 2026-11-11
Applies to: `HEAVIXIR/z-ai-2`, recovery branch `recovery/heavix-full-product-integration-2026-11-11`, Worker `heavix-preview`.

## Owner instruction — binding default for every future agent/chat

The owner reports that the Cloudflare free monthly build allowance is 3,000 build units and more than 2,000 had already been consumed by 2026-11-11 (one third into the month). This is a hard project constraint. Protecting the owner's time is equally important.

**Do not use Cloudflare Builds as a debugging loop.** Never trigger one build per commit, one build per fix, or repeated exploratory builds. Consolidate work so that many fixes are validated before a single Cloudflare build. The target is one carefully preflighted candidate build, not a sequence of speculative retries.

This policy is not optional and must be read before any build/deploy decision by every new chat or agent.

## Known-good Preview baseline — independently verified

- Worker: `heavix-preview`
- Active deployment: `9c079e5b-e3df-4295-80e0-e930d2d25552`
- Active version: #17, `063ce438-ca3a-4482-b416-9260b780bccf`
- Deployment created: 2026-11-10 21:08:35 UTC
- Version uploaded: 2026-11-10 21:04:22 UTC
- Traffic: 100% to version #17
- Preview metadata includes `HEAVIX_ENV=preview`, Preview database bindings, Node compatibility, and the existing assets binding.
- Preserve this version/deployment as the known-good rollback baseline. Do not replace it during proof work.

Important distinction: the verified version #17 upload is recorded as a Wrangler upload. Do not mislabel it as a successful Cloudflare Build pipeline. Several Cloudflare Build records that reported success were no-op skips whose logs said `HEAVIX_SKIP: branch has no OpenNext configuration`; they are not evidence that OpenNext built successfully.

## Prior long-running Next.js / Cloudflare build issue

The owner explicitly reports that the prolonged Cloudflare Next.js build stall/failure seen again in this work was already solved in the prior work session around 10–12 hours earlier, and that the solution had led to a successful Preview. This is an owner-confirmed historical fact and must be treated as a **do-not-repeat** constraint.

Do not start over, re-run old experiments, or infer that the solution is absent because the current branch's OpenNext artifact proof is incomplete. First recover the exact successful remediation from the prior session's transcript, commit history, workflow revisions, Cloudflare build logs, and the known-good Preview version metadata. Compare the current configuration against that successful state. Reapply the already-proven solution; do not substitute a new build strategy without evidence.

The exact technical root-cause/remediation details have not yet been reconstructed in this document. Until reconstructed, label them `OWNER-CONFIRMED / FORENSIC DETAIL PENDING`; do not invent specifics such as a Next.js flag, memory setting, cache tweak, bundler switch, or timeout adjustment.

## Current evidence snapshot (2026-11-11)

- Exact branch code head: `d5f034178918d0b44f83aca7986d82cbada10915`.
- GitHub CI run `42994869687` passed on that exact head.
- OpenNext real-route workflow run `42994869961` passed prerequisites and Next.js compilation/route enumeration, then the runner shut down the OpenNext server build with SIGKILL during Worker bundling. This is an incomplete proof/runner interruption, not proof that the previously solved Next.js issue has returned.
- Cloudflare Build `69a49f21-67dc-4df2-bbc5-911ca7d1be9f` was running on exact head at last inspection, paused in/after optimized Next.js build logs with a non-fatal CSS selector warning. No deployment was made.
- Production and Preview deploy commands remain no-op guards. Do not deploy from this branch.
- Preview DB identity/OID proof has not been run against the actual Preview databases on this head.

## Mandatory preflight before any future Cloudflare build

A Cloudflare build is allowed only after all items below are true:

1. Recover and document the exact previous successful Next.js/Cloudflare remediation and compare it to current config.
2. Establish a single consolidated candidate commit; no further speculative code churn.
3. Exact-head GitHub CI is green.
4. Local/CI Next.js build and OpenNext artifact proof complete without runner shutdown.
5. Worker bundle audit passes and expected routes/assets are present.
6. Non-fatal warnings are classified; no unresolved build/runtime blocker remains.
7. Build trigger, build command, deploy no-op guard, branch/path filters, and target Worker are inspected before execution.
8. Known-good Preview #17 is preserved and rollback path is clear.
9. Confirm no other Cloudflare build is running; do not create concurrent builds.
10. Owner has explicitly authorized the final quota-consuming build if the planned action is not already within a clearly authorized run.

If any preflight item is false or unknown: **NO CLOUDFLARE BUILD**. Continue with repository inspection, local tests, CI, artifact analysis, and history reconstruction.

## Retry rule

A failed or stalled Cloudflare build does not automatically authorize another build. Inspect the existing build and logs, identify a specific root cause, repair in one batch, prove the repair outside Cloudflare, and obtain explicit owner approval before another quota-consuming build. Never retry just to see whether it works.

## Change batching and trigger awareness

- Batch related code fixes into one commit.
- Markdown-only documentation updates are excluded by the currently inspected Cloudflare trigger path filter (`*.md`), so use docs for continuity without consuming a Cloudflare build where the trigger rules continue to match this configuration.
- Do not assume JSON/config changes are excluded; they may trigger Cloudflare Builds.
- Do not edit trigger filters by guessing API schemas. Inspect the supported schema, apply a validated change, then read back and verify it.
- GitHub Actions CI usage and Cloudflare Build quota are separate budgets; still avoid unnecessary per-commit CI churn, but never conflate the two.

## Required handoff behavior

Every new agent/chat must:
1. Read this runbook and the latest PR #307 checkpoint before acting.
2. Preserve the exact known-good Preview version/deployment above.
3. Recover the prior successful build fix rather than rediscovering it.
4. State verified / owner-reported / inferred / unknown separately.
5. Never ask the owner to repeat known constraints or provide secret values in chat.
6. Never trigger Cloudflare Builds, upload a Worker version, deploy, merge, contact Preview databases, or mutate B2 objects without the specific approval gates already established for that action.
7. Optimize for the owner's time and the fastest safe path to a complete real HEAVIX site, not for number of commits, builds, or reports.
