# HEAVIX — Capability Completion & Admin Control Plan
## 2026-11-06 · Evidence-based execution baseline

### Purpose

This plan converts the owner's latest direction into an executable product-completion program. HEAVIX must not be treated as a homepage-only project or as a set of isolated admin screens. The target is a coherent industrial marketplace and intelligence platform whose eligible public experience and operational capabilities are configurable through a secure Owner/Admin control plane.

This document distinguishes verified implementation, partial implementation, unverified scope, and blocked work. A route, Prisma model, API, or passing unit test alone does not establish a complete user-facing capability.

### Product principles
1. Preserve and reconcile valuable legacy functionality; do not discard it merely because a newer route exists.
2. Maintain one source of truth for each domain. Do not create parallel taxonomy, catalog, AI, or admin registries.
3. AI output is advisory by default. Human approval remains required for canonical catalog data, publication, financial, identity, security, and other consequential mutations.
4. Admin capability completion requires the full chain: data contract → service → API → permission → admin UI → user-facing integration → validation → audit → tests → monitoring → documentation.
5. Current visual design is provisional until the owner reviews the first Preview. Build safe controls now; do not prematurely lock the visual system.
6. Zero-cost constraint remains binding. No paid services or infrastructure upgrades.

### Verified code observations on main d86e3fa715d27b95477ed09eda60b2bfba8daaa6

#### A. AI control plane — partial, not complete

Present:
- /admin/ai overview aggregates AIAgent, AIGatewayLog, AITaskPolicy, and AIBudget.
- Dedicated pages exist for /admin/ai-agents, /admin/ai-gateway, and /admin/ai-budget.
- The central /api/ai-gateway POST path applies authentication, rate limiting, task policy, quotas, budget checks, bounded request parsing, timeout handling, output validation for selected tasks, and audit logging.
- ai.read, ai.manage, ai.execute, ai.policy.manage, and ai.scraper.execute permission keys exist.

Verified gaps / limitations:
- The AI agents page displays agents and allows execution, but its UI text explicitly says adding a new agent requires editing src/lib/ai-agents/index.ts; it is not a complete no-deploy agent builder.
- The agents page did not enforce ai.read at page-render time, unlike /admin/ai. A scoped fix is proposed in PR #203; not merged and not yet CI-verified.
- Agent APIs use the broad authorizeAdmin() guard rather than a consistent fine-grained AI permission contract; review and standardize GET/list, execute, update, and delete separately.
- /admin/ai-budget edits spend caps and task policies, but a unified, versioned prompt registry, provider/model registry, tool catalog, evaluation datasets/runs, safety-policy editor, and per-feature rollout controls were not established by this audit.
- Direct provider SDK call sites across the repository still require a complete call-site inventory and enforcement review; the gateway existing does not prove every AI call uses it.
- The AI gateway log UI and endpoint contract need an end-to-end check; the admin page/client, route handlers, filters, and permissions must agree.

Required AI workstreams:
1. Provider/model inventory and safe provider configuration (no secret values in UI, logs, or audit payloads).
2. Versioned prompt templates with test fixtures, approval, rollback, and ownership.
3. Agent catalog and lifecycle: draft, validate, test, enable, disable, version, rollback; no arbitrary code execution or runtime code upload.
4. Tool registry with typed schemas, permission scopes, allowlists, human-approval policies, timeouts, and audit.
5. Task policy, rate, token, cost, tenant, and global budget controls.
6. Evaluation center: golden datasets, regression runs, quality/safety metrics, failure triage.
7. AI observability: latency, errors, usage, cost, model/provider, task, feature, and trace correlation with redaction.
8. AI-assisted taxonomy/catalog workflows: suggestions, confidence, evidence, duplicate resolution, approval queue, and immutable provenance.
9. Verify every active AI call site is routed through the approved policy boundary or explicitly documented adapter.

#### B. Taxonomy — hub exists; full control-plane completion is unproven

Present:
- /admin/taxonomy hub reads counts for Category, TransactionType, ServiceType, ApplicationIndustry, Country, and AttributeDefinition.
- The hub links to categories, transactions, services, industries, locations, brands, and attributes.
- The existing architecture identifies the category module as the canonical taxonomy source; do not introduce a parallel taxonomy-v2.

Known migration debt from repository inventory:
- Legacy checklist labels taxonomy attributes, industries, locations, services, transactions, brand families, and category CRUD as pending or in progress.
- The legacy migration decision inventory describes 38 pending pages and identifies missing resource registrations at the time of that document. This must be reconciled against the current resource index before any route is deleted or redirected.
- The current universal resource index registers the marketplace/store resource set, but the audited file does not register canonical resources for Category, AttributeDefinition, ApplicationIndustry, Country/Province/City, ServiceType, TransactionType, or BrandFamily.

Required taxonomy work:
- One canonical tree editor with safe create/update/archive/reparent/reorder and cycle detection.
- Full category fields: hierarchy, slug, multilingual labels, descriptions, icon/media, visibility, status, industry/application links, SEO, sort order, and lifecycle.
- Attribute definitions/options/category assignments: types, units, validation, requiredness, filters, localization, compatibility, and versioning.
- Brand/Manufacturer/BrandFamily/aliases/model/generation relations with canonical resolution and approval.
- Transaction, service, industry, and location management with referential integrity.
- Import/export with dry-run, validation, duplicate detection, rollback plan, and audit.
- AI-assisted suggestions must remain unverified until approved.
- Frontend, search, filters, SEO, listing forms, and API must consume the same canonical data.

#### C. Legacy Admin and universal resource manager — reconcile before migration

- src/lib/admin/legacy-migration-checklist.ts catalogs 104 legacy admin routes.
- docs/verification/legacy-migration-decisions.md describes 38 pending decisions and their acceptance criteria.
- The checklist, decision inventory, current resource-index, navigation seed, and actual filesystem routes are separate artifacts. Their status can drift; no bulk redirects/deletions until a generated reconciliation report proves agreement.
- The universal resource manager is useful infrastructure, but not every workflow is CRUD. AI tools, CMS/page builders, analytics, automation, policy editors, knowledge graph, and visual editors may require bespoke purpose-built screens.
- For each legacy route, classify KEEP / ADAPT / REBUILD / DEPRECATE with a named replacement, exact capabilities, permission map, dependencies, owner, and evidence.

#### D. Gadgets, tools, startups, and innovation portfolio — unverified inventory

The current targeted source search did not establish a complete, authoritative route/schema/API inventory for the owner's named gadgets, tools, and startup features. This is not evidence that they do not exist. They must be inventoried from:
- legacy repository and archived conversations/specifications,
- current route tree and navigation,
- Prisma models and enums,
- API route tree and service modules,
- feature flags and background jobs,
- user-facing pages and admin controls.

Each discovered capability must be mapped to: legacy source → current implementation → data model → API → admin workflow → public/user workflow → permission/audit → tests → disposition. Do not invent a new parallel module while this reconciliation is underway.

### Execution sequence

#### P0 — Preview and control-plane safety
- Preserve the first Preview path and remove only blockers with verified evidence.
- Close RBAC mismatches and ensure all Admin pages enforce authorization before reading protected data.
- Ensure private/unpublished preview content is not indexable or publicly exposed.
- Keep current design provisional; no visual redesign before owner review.
- Maintain deployment, database, backup, DNS, and secret safety gates.

#### P1 — Admin capability reconciliation
- Generate route ↔ navigation ↔ permission ↔ resource registry ↔ API ↔ Prisma model ↔ test matrix.
- Reconcile all 104 legacy routes and 38 pending decisions against current main.
- Identify missing resource configs and bespoke workflow requirements.
- Prioritize taxonomy, AI, content/page builder, media, tools/gadgets/startups, automation, analytics, and marketplace controls.

#### P2 — Complete Taxonomy and Catalog Control
- Implement missing safe admin operations and resource contracts on the existing canonical modules.
- Verify all downstream forms, filters, search, SEO, and AI use the same canonical source.
- No destructive database operation or migration without a verified backup, schema reconciliation, and explicit safety gates.

#### P3 — AI Control Plane
- Implement the workstreams in section A in dependency order.
- Do not expose provider credentials or arbitrary executable tools.
- Require policy validation, cost ceilings, audit, evaluations, and approval for consequential actions.

#### P4 — Owner Experience Studio
- Complete structured controls for global shell, navigation, header, footer, homepage, pages, sections, widgets, responsive layout, theme tokens, motion presets, media, SEO, and publication lifecycle.
- Use typed schemas and allowlisted widgets/data sources; no arbitrary HTML/CSS/JS execution.
- Provide draft, preview, publish, schedule, version history, rollback, audit, and cache invalidation.

#### P5 — Gadgets, tools, startups and wider product domains
- Only after source inventory, map and complete each module's data/API/admin/public workflow.
- Stage releases by user value and dependency, not by number of screens.

#### P6 — Verification and release
- Unit/contract/integration/E2E and responsive/accessibility checks.
- Verify exact-head CI, runtime preview, permissions, audit, cache behavior, and error/observability.
- Production remains NO-GO until all release gates pass independently.

### Definition of Done
A capability is COMPLETE only when:
- its canonical source of truth is identified;
- data model and validation are correct;
- service and API are implemented;
- least-privilege permissions are enforced server-side;
- admin workflow exposes all intended fields/actions;
- public/seller/customer workflow consumes the same data;
- AI assistance has provenance and human approval where required;
- mutations are audited and reversible where appropriate;
- tests cover success, validation, authorization-denial, concurrency, and failure paths;
- monitoring and documentation exist;
- exact-head CI and Preview behavior are verified.

### Immediate open actions
- PR #203: page-level ai.read authorization and view audit for /admin/ai-agents (Draft; CI not yet reported).
- Audit AI endpoint permission consistency, AI provider/model/prompt/tool/evaluation coverage, and direct SDK call sites.
- Reconcile current resource index with legacy migration decisions and the actual admin route tree.
- Produce the first source-backed capability matrix before broad feature implementation.