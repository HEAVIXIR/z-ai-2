# Instructions for AI agents and contributors

Before making any HEAVIX changes, read and follow these documents in order:

1. `docs/operations/HEAVIX-AGENT-CONTINUATION.md`
2. `docs/operations/HEAVIX-CURRENT-STATE.json`
3. `docs/operations/HEAVIX-WORKLOG.md`
4. `docs/superpowers/plans/2026-11-11-heavix-full-product-integration.md`
5. `docs/audits/HEAVIX-LEGACY-TO-CURRENT-INVENTORY-2026-11-11.md`
6. Project principles, architecture overview, and homepage visual-parity specification.

Do not restart completed discovery. Resume from the exact `next_action` in the current-state JSON, verify the active branch/head, and append evidence to the worklog after each meaningful session. Distinguish verified facts from hypotheses and unverified work.

HEAVIX recovery must stay isolated on `recovery/heavix-full-product-integration-2026-11-11` unless the owner explicitly approves a different branch. Do not modify `main`, Production, DNS, or the existing Preview Worker configuration. Do not deploy or touch databases until the documented code, CI, artifact, and database-identity gates pass. Never grant blanket permissions or claim tests/deployments succeeded without evidence.

The current objective is restoration of the full existing HEAVIX product—not a simplified replacement. Preserve PageRenderer/PageBuilder and current domain contracts while restoring all required homepage sections and auditing every product capability.
