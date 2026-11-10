# HEAVIX — Agent Continuity & Execution Protocol

> This is the mandatory entry point for every ChatGPT conversation, coding agent, human contributor, or replacement agent working on HEAVIX recovery. Read this file first, then the linked live-state and plan documents. Do not restart discovery from zero.

## 1. Objective

Deliver the **real, complete HEAVIX product** by restoring the original full product experience and integrating verified current runtime/security work. The goal is not a new shell, mockup, or simplified replacement. Existing screens, modules, assets, admin surfaces, APIs, and business capabilities in the current repository and legacy snapshot must be found, understood, and integrated.

The primary acceptance destination is the existing Preview Worker URL:

- `https://heavix-preview.heavixir.workers.dev`

Do not change Production, DNS, or the stable Preview URL as a shortcut.

## 2. Read these documents in this order

1. `docs/operations/HEAVIX-AGENT-CONTINUATION.md` — this protocol.
2. `docs/operations/HEAVIX-CURRENT-STATE.json` — machine-readable checkpoint, repository/branch/commit and next action.
3. `docs/superpowers/plans/2026-11-11-heavix-full-product-integration.md` — full implementation plan and acceptance gates.
4. `docs/audits/HEAVIX-LEGACY-TO-CURRENT-INVENTORY-2026-11-11.md` — verified repository findings and regression evidence.
5. `docs/HEAVIX-PROJECT-PRINCIPLES.md`, `docs/HEAVIX-ARCHITECTURE-OVERVIEW.md`, `docs/design/HEAVIX-HOMEPAGE-VISUAL-PARITY.md`.
6. Read relevant source files, tests, CI workflows, and latest worklog entries before editing.

If any file is missing on the active branch, locate it in Git history/other known branches; do not silently recreate a conflicting version.

## 3. Source-of-truth hierarchy

- Current implementation source: `HEAVIXIR/z-ai-2`.
- Active isolated implementation branch: `recovery/heavix-full-product-integration-2026-11-11`.
- Protected baseline at branch creation: `main` SHA `b4b6b4624ebed2ae3bdad023eb1532dbedad7001`.
- Legacy reference only: `dellk00k/z`, branch `legacy/extracted-archives`, commit `bbb1f4947e4b1a05e39f7b510c5c7801d52389e7`.
- `HEAVIXIR/z` is an archive/source reference, not the current app repo.
- Existing comparison branches: `feat/homepage-visual-parity-20261027`, `infra/prisma6-cloudflare-runtime`.

Never assume a legacy file is safe/current. Compare it with current code, schema, auth, data contracts and tests. Do not bulk-copy the legacy tree.

## 4. Verified findings — do not rediscover or contradict without new evidence

- Current app is `HEAVIXIR/z-ai-2`; recovery branch is listed above.
- Current homepage route uses PageRenderer. Its fallback currently has only five widgets: `hero`, `search-box`, `listing-grid`, `category-grid`, `trust-badges`.
- The legacy route rendered a 17-key section registry: `hero`, `categories`, `hot-searches`, `stats`, `recommendations`, `verified-machines`, `featured-machines`, `active-requests`, `exclusive-sale`, `services`, `latest-ads`, `sell7`, `why-us`, `brands`, `trusted-brands`, `knowledge`, `cta`.
- Current route also loads a published HOME AdminPage; its saved layout can override the code fallback. A stale DB layout is a separate, not-yet-verified Preview hypothesis.
- All 26 matching homepage component files remain in current source. 18 are byte-identical to legacy; 8 differ: `ActiveRequestsSection.tsx`, `BrandsSection.tsx`, `CtaSection.tsx`, `Hero.tsx`, `RecommendationsSection.tsx`, `StatsSection.tsx`, `VerifiedMachinesCarousel.tsx`, `VerifiedMachinesGallery.tsx`. No reason to wholesale copy.
- Existing current tree contains major features/routes for Sell in 7 Days, Companies, Store, Services, Knowledge, Taxonomy, Header/Footer and admin. Presence in tree does not prove complete or working end-to-end.
- Public `GET /api/homepage-sections` was flagged for a possible write/seed side effect when empty; inspect exact current implementation and make public GET read-only.
- The legacy extracted snapshot reports 10 archives / 845 files and quarantines `db.zip`, `upload.zip`, `bun.zip`. Treat as read-only reference.
- Project principles require Zero Trust, least-privilege RBAC, audit, no AI self-granting privileges, no autonomous financial/destructive actions, and full feature contracts/tests/admin surfaces.
- Cloudflare monthly quota is constrained (user reported roughly 1,900/3,000 used at last checkpoint). Avoid unnecessary builds/deploys.

## 5. Non-negotiable safety and release constraints

- Work on the recovery branch; do not commit to `main` directly.
- No Production deploy, Production DB use, DNS edits, or stable Worker replacement.
- Do not run migrations, seeds, destructive scripts, or DB writes against Preview until the exact DB binding/identity and operation are reviewed and explicitly gated.
- First perform read-only inspections. Prove Preview App DB and Store DB identities independently. Prove Production DB is not bound to Preview.
- No hard delete of business records. Prefer archive/soft-delete lifecycle.
- No blanket permissions. Map routes and mutations to least-privilege RBAC, ownership/tenant checks and audit.
- Never expose secrets, tokens, credentials, customer PII or private environment values in logs/docs.
- No fake stats, fake listings, mock success, or claiming deployment/tests passed without actual evidence.
- Preserve PageRenderer/PageBuilder for custom pages and preview flows. The root homepage is restored through the current HomePageSection-driven 17-section composition using existing current-tree components; do not reintroduce the five-widget fallback as the root default or let an incomplete generic HOME layout suppress the canonical product homepage.
- No Cloudflare deployment until code-level checks, CI, artifact provenance, and DB identity gates pass. Use the existing Preview Worker only.

## 6. Required execution sequence

### Phase 0 — Resume correctly
- Read all documents listed in §2.
- Fetch the current branch HEAD and compare it with the last checkpoint in `HEAVIX-CURRENT-STATE.json`.
- Read the latest worklog entry and inspect uncommitted/changed files if tool access allows.
- Continue from the recorded **NEXT ACTION**. Do not repeat completed inventory.

### Phase 1 — Homepage restoration (first implementation priority)
- Inspect complete current PageRenderer registry, widget implementations, `src/components/home/**`, Admin HomePageSection APIs/editor, Prisma model fields and tests.
- Compare the eight changed components with the legacy snapshot individually.
- Implement a current-contract adapter/orchestrator that restores all 17 legacy sections, visibility and order, while preserving PageRenderer and admin custom layouts.
- Incomplete/stale saved HOME layouts must not silently suppress essential product sections. Design explicit completeness/override behavior and rollback.
- Make public GET endpoints read-only; no seeding on public reads.
- Use real data and honest empty states; no fabricated statistics.
- Add tests for all required section keys, order, visibility, widget mapping, read-only GET and fallback behavior.
- Verify desktop/mobile layout against owner references.

### Phase 2 — Full product audit and integration
- Build and maintain a route → UI → API → domain/schema → permission → admin surface → test matrix.
- Audit Featured/Selected Ads, listings, Companies, Store, Sell in 7 Days, Services, Knowledge, taxonomy, media, SEO, search, AI and Admin.
- Repair missing links/contracts and end-to-end flows; avoid duplicate models or parallel architectures.
- Verify customer/seller/admin journeys with Preview fixtures and payment test mode only.

### Phase 3 — Admin and security
- Map every admin page and mutation to permission identifiers.
- Separate navigation visibility from server-side authorization.
- Enforce AuthN → AuthZ → Policy → Validation → Service → DB → Audit.
- Test deny-by-default, ownership, tenant boundaries, role boundaries and audit records.
- Provide owner/admin access only through secure, auditable bootstrap—not global grants.

### Phase 4 — Runtime, Preview and acceptance
- Inspect workflow triggers and run GitHub/local checks first.
- Verify Worker artifact and exact commit provenance.
- Read-only prove App DB and Store DB identities on the exact Preview binding; ensure no Production identity.
- Only then deploy to existing Preview URL.
- Smoke-test public homepage, admin login, ads, companies, Store, services, knowledge, taxonomy, media, search, health and key APIs.
- Capture screenshots and HTTP evidence; compare with owner reference.
- If critical checks fail, rollback Preview to last known-good version and document exact evidence.

## 7. Every agent must maintain the checkpoint

After each meaningful work session, update these files in the same recovery branch:

- `docs/operations/HEAVIX-CURRENT-STATE.json` — current branch/head, status, completed items, blockers, next exact action, tests/deploy evidence, last updated UTC.
- `docs/operations/HEAVIX-WORKLOG.md` — append-only chronological log: what was inspected/changed, paths, commit SHA, commands/tests and exact outcomes, what was not done.
- Relevant plan/audit docs — update only when facts or decisions change.

Before ending a session or handing off:
1. Commit documentation and code together where appropriate.
2. Update current-state JSON to the new resulting commit SHA.
3. Record unverified items explicitly as `NOT VERIFIED`, not as completed.
4. State the one next executable action, including exact paths/files and branch.
5. Do not leave an agent with a vague instruction such as “continue the project”.

If tool access is lost, the next agent should use GitHub repository/branch/docs as the durable memory. Chat history is supplementary, never the source of truth.

## 8. Definition of done

Only mark HEAVIX complete when all plan gates A–F pass, critical CI is green, a reviewed PR is merged through the repository's approved process, the existing Preview URL displays the full reference-aligned product, core user/admin flows pass, database isolation is proven, visual/HTTP evidence is saved, and Production/DNS remain untouched.

**Current rule:** This is an execution protocol, not a claim that the product has already been restored. Check the live state document before acting.

## Latest operational checkpoint — 2026-11-11

- Active branch: `recovery/heavix-full-product-integration-2026-11-11`.
- Draft PR: `https://github.com/HEAVIXIR/z-ai-2/pull/307`; do not merge until owner review and all required checks are green.
- Root homepage has been restored to the canonical 17-section HomePageSection composition. Admin GET exposes the same virtual defaults and PUT persists them by stable key. Public GET is read-only; no request-time DB writes. PageRenderer/PageBuilder remain for custom pages and preview flows.
- Store order authorization has been hardened: no unauthenticated `userId` enumeration; guest lookup requires phone + exact high-entropy order number; order API responses are private/no-store.
- Store and Marketplace detailed health endpoints now enforce route-level RBAC even though middleware intentionally bypasses `/health` paths for infrastructure probes.
- Public `/services` directory and SEO metadata additions are present in the recovery branch.
- GitHub Actions run `42910792713` passed Typecheck, Lint, Security Tests, phase/tls/audit/Cloudflare report-only and full Docker proof including Caddy→app connectivity. Its only failure was an obsolete five-widget homepage contract test, which has been rewritten. Exact latest-head CI after all later changes is still pending; fetch PR #307 head and poll Actions before claiming green.

### Cloudflare Preview safety — do not infer DB identity

- Read-only Cloudflare inspection found existing Worker `heavix-preview`, active deployment `9c079e5b-e3df-4295-80e0-e930d2d25552`, active version `063ce438-ca3a-4482-b416-9260b780bccf`, with 100% traffic.
- Non-secret vars are `HEAVIX_ENV=preview` and `NODE_ENV=production`. Secret binding names include `DATABASE_URL` and `STORE_DATABASE_URL`; their values were not retrieved.
- The Worker settings/secret names do not prove which PostgreSQL instances those URLs target. Do not call App/Store DB identity verified from names or `HEAVIX_ENV` alone.
- `.github/workflows/prisma-preview-workerd-proof.yml` is a pinned, read-only Workerd proof using distinct GitHub secrets `HEAVIX_APP_PREVIEW_PPG_URL` and `HEAVIX_STORE_PREVIEW_PPG_URL`, with expected PostgreSQL system identifiers and read-only session checks. It requires manual `workflow_dispatch` input `PREVIEW_ONLY`. It was inspected but not dispatched. Also note it proves the GitHub Action connection inputs, not automatically that the Cloudflare Worker secret values are identical.
- Before any Preview release, obtain evidence that the exact App and Store databases used by the active Worker correspond to dedicated Preview system identifiers. Preserve the existing Worker and URL; no Production or DNS changes.

### Immediate next action

1. Fetch the current head SHA of PR #307 and inspect the latest queued/running GitHub Actions run. Fix all failures on the latest code head.
2. Verify the Admin health RBAC, Store order security, homepage admin editor, public Services page and SEO additions in CI.
3. Verify App/Store Preview database identities with a controlled read-only proof tied to the actual Worker bindings; do not expose or print secret values.
4. Only after CI, Docker proof, artifact provenance and DB identity gates pass, consider deploying to the existing Preview Worker. Never touch Production or DNS.
### Additional Admin RBAC checkpoint — 2026-11-11

- Removed the unrestricted legacy fallback from `GET /api/admin/navigation`. It now requires `getCurrentUser` + `admin.navigation.read` and filters every grouped/standalone item by the user's exact permission set.
- Normalized all navigation seed permission aliases. Static scan confirms 44 unique permission keys and zero missing from the canonical `PERMISSIONS` catalog.
- Added Store menu entries for Procurement, Rentals and Service Providers. Rentals resource permission keys now match the dedicated Store API (`store.read/store.manage`).
- Added security and contract tests for navigation RBAC, canonical permission coverage, Store route navigation and rental permission alignment.
- Code head: `e16ed41a5c123d5f2c8700816303771fbfdf3e9d`; exact-head CI run #42914300824 was queued at inspection. Latest PR head may include documentation-only commits; always fetch PR #307 head.
- Do not run the Admin navigation seed on any database until App/Store Preview PostgreSQL identities have been independently verified.

### CI queue checkpoint — 2026-11-11

- Latest code commit is `c8e95911e98143c1f9aa0ef07ace952e56df856f` (CI concurrency guard); run #42915046750 is queued.
- The new concurrency group did not retroactively cancel pre-existing queued runs in the observed Actions queue. Do not claim that it did.
- TinyFish browser profile `prof_ae1391636a204a5a` has no GitHub sign-in. The read-only Workerd proof dispatch was stopped before submission. User authorization is needed to start secure browser-profile sign-in; never request a password in chat.
