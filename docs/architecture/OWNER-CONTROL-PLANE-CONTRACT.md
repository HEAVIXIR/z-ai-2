# HEAVIX Owner Control Plane — Architecture Contract

**Date:** 2026-11-06  
**Status:** Required product architecture; implementation is staged around the first safe Preview release.  
**Scope:** The highest-privilege site owner must be able to operate and edit the complete HEAVIX digital experience from the Admin Control Plane without routine developer intervention.

## 1. Product decisions

### 1.1 Preview is a review baseline, not a design freeze

The first Preview is for visual and functional inspection. The current Hero, Header, Footer, typography, motion, spacing and page composition are provisional. Do not hard-code new visual preferences from this audit or treat the current design as final. Preserve existing working behavior while making it configurable and safely previewable.

After Preview acceptance, the owner can provide visual direction and the team can implement it through the control plane. The architecture must not require a code deployment for ordinary content, layout, theme-token, media, navigation or animation changes.

### 1.2 Owner control is broader than content CRUD

The Owner Control Plane must cover:
- Global shell: header, navigation, mega menu, mobile navigation, footer, announcement bars and shared overlays.
- Pages: home, category/landing pages, listing details, brand pages, service pages, articles, legal/help pages and future custom pages.
- Sections and widgets: order, visibility, duplication, responsive layout, spacing, alignment, widths, backgrounds, borders, radii, typography, media, CTA, data source, and widget-specific settings.
- Motion: supported animation preset, duration, delay, easing, trigger, reduced-motion behavior and mobile behavior.
- Design system: controlled theme tokens (colors, fonts, type scale, spacing, breakpoints, radii, shadows), with safe constraints and global preview.
- Content and media: text, links, images, video, alt text, crop/focal point, asset metadata and usage references.
- SEO: per-page metadata, canonical, robots, social image and structured-data settings.
- Navigation and footer links: labels, targets, hierarchy, ordering, visibility and locale.
- Publishing operations: draft, preview, approval, publish, schedule, rollback and revision history.

The owner must be able to change copy and layout without editing source code. Arbitrary executable JavaScript/CSS/HTML is not an acceptable editing mechanism.

## 2. Current code evidence and gaps observed on main

This is a code inspection of the current main baseline `d86e3fa715d27b95477ed09eda60b2bfba8daaa6`, not a claim that every runtime path has been exercised.

### Existing foundation

- Dedicated Admin screens exist for homepage hub, Hero, Header, Footer, homepage layout, pages, site settings, media and menu.
- Hero editor already exposes copy, CTA, slide images, card images/listing overrides, animation type, alignment and multiple layout/typography custom dimensions.
- Header editor currently manages logo asset/text/height/position and Persian name visibility.
- Footer editor manages about/contact/copyright and logo assets.
- Public Header consumes only a subset of settings; public Footer still contains hard-coded link columns, phone numbers, mobile numbers, emails, address and working hours in module constants.
- Page Builder widget registry and PageRenderer exist; widget renderers include hero, image, text, listing/category/article/statistics/trust widgets and data-source contracts.
- AdminPage and AdminPageVersion APIs provide a basis for versioned pages, publishing and rollback.
- Sidebar navigation is database-driven and permission-aware, while the admin layout verifies authenticated admin access.

### Material gaps / risks

1. `/admin/pages` explicitly describes itself as a minimal list and says the full editor UI is a future enhancement; creation currently points operators to the API. This is not a usable visual page builder.
2. Existing Hero/Header/Footer editors are separate purpose-built screens, not one reusable global design/page editing system. Their coverage is uneven.
3. Footer link columns and contact defaults remain hard-coded in `src/components/layout/Footer.tsx`; owner edits to the current Footer settings do not provide full link/column/layout control.
4. Header editor covers a limited set of logo settings, while the public Header has substantial hard-coded composition, navigation structure and responsive behavior.
5. Hero editor file carries a legacy migration annotation and `@ts-nocheck`; it requires type-safe modernization before it becomes the model for a universal editor.
6. `PUT /api/admin/site-settings` uses `hasPermission(user.id, "settings.manage")`, while GET checks `admin.settings.manage`. This permission-key mismatch must be reconciled with the canonical permission registry and tests before relying on the editor.
7. AdminPage collection and publish APIs currently use broad `isAdmin(user.id)` checks rather than a clearly separated Owner-only publish authority. A highest-privilege Owner role/permission boundary must be explicit and server-enforced; UI hiding is not security.
8. Publishing currently performs multiple database updates in sequence. Verify transactionality/atomicity and concurrency handling before treating it as a safe global publishing pipeline.
9. Layout validation must be allowlist-based: only registered widget types, known data sources, validated props and safe design tokens. Never evaluate arbitrary markup, CSS, JS, URLs or SQL from editor JSON.
10. Page versioning, audit, cache invalidation and rollback need consistent coverage across global shell/theme/media/navigation as well as custom pages. A versioned page API alone does not version the whole site experience.

## 3. Target architecture

```text
OWNER CONTROL PLANE
  ├── Experience Studio
  │    ├── Site shell (Header / Nav / Footer / overlays)
  │    ├── Page tree + page editor
  │    ├── Section / Widget builder
  │    ├── Responsive layout controls
  │    ├── Theme / design tokens
  │    └── Motion / interaction presets
  ├── Content & Media
  │    ├── Pages / Articles / Landing pages
  │    ├── Asset library / focal point / alt text
  │    └── SEO / redirects / structured data
  ├── Publishing
  │    ├── Draft → Preview → Review → Publish
  │    ├── Scheduling / rollback / revision history
  │    └── Cache invalidation / preview isolation
  ├── Governance
  │    ├── Owner-only critical permissions
  │    ├── RBAC for delegated admins/editors
  │    ├── Audit trail / reason / before-after
  │    └── Two-person approval option for risky changes
  └── Operations
       ├── Feature flags
       ├── Safe defaults / validation
       └── health / publish history
```

### 3.1 Configuration layers

Keep three scopes separate:
- **System configuration:** registered widgets, schemas, permission policy, supported animation presets, design-token bounds and feature flags.
- **Site/team configuration:** published pages, shell, navigation, theme, default layouts and shared content.
- **User preferences:** personal admin sidebar, saved views, dashboard layout and editor workspace preferences.

Personal preferences must never mutate the public site. Site-wide edits require explicit site-level permissions.

### 3.2 Data and rendering contract

- Persist editable experience as validated structured data (JSON/typed models), not executable code.
- Reuse the existing Page Builder, widget registry and PageRenderer; do not introduce a competing builder.
- Keep content records separate from layout configuration and from catalog/marketplace data.
- Use immutable revisions or append-only version records for publishable configuration.
- Public rendering reads only the currently published revision; drafts are accessible only through authenticated, non-indexable Preview routes.
- Every widget declares a stable key, schema/version, defaults, responsive behavior, data-source contract, permission requirements and safe renderer.
- Data sources are registered server-side and public data sources must enforce public filtering independently of the editor.
- Theme and motion controls use bounded tokens/presets. No arbitrary CSS injection or untrusted HTML execution.
- Validate links and media URLs; reject unsafe schemes and external destinations that violate policy.
- Use cache tags/revalidation only after a successful atomic publish.

## 4. Owner security model

- Define a dedicated `platform.owner` (or equivalent canonical permission) distinct from generic `admin`.
- Owner assignment must be protected by a bootstrap/recovery process and cannot be self-granted by ordinary admins.
- Server APIs enforce permissions for read, draft edit, preview, publish, schedule, rollback, theme, navigation, media deletion and system configuration separately.
- Generic admins/editors may receive scoped permissions; they must not inherit Owner powers implicitly.
- All high-impact changes write audit events with actor, action, entity, before/after, timestamp, request context and reason.
- Publish and rollback endpoints verify version belongs to the page/site and reject stale concurrent updates.
- Prevent CSRF on cookie-authenticated mutation endpoints; validate origin/CSRF strategy consistently.
- Apply rate limits and payload/asset size limits to mutation and upload endpoints.
- Never expose draft or unpublished content to public endpoints or search engines.

## 5. Phased implementation — compatible with early Preview

### Phase A — first Preview foundation (must not wait for a complete visual builder)

1. Keep current homepage and working editors intact; do not redesign Hero/Header/Footer without owner direction.
2. Fix and test the site-settings permission mismatch.
3. Verify all public settings are read-only and expose only an explicit safe allowlist.
4. Confirm all editor mutation APIs use canonical RBAC and audit; remove broad `isAdmin` checks where a specific permission is required.
5. Confirm Preview draft editing is private and Preview is globally `noindex`.
6. Ensure existing homepage content/layout controls function, and document exactly which controls are currently supported.
7. Provide a clear Preview path without requiring unfinished universal builder features to block the first visual inspection.

### Phase B — Owner Experience Studio foundation

1. Add Owner-only Experience Studio entry point and page tree.
2. Complete usable visual page editor for existing Page Builder schema (create/edit/reorder/duplicate/disable sections; edit registered widget props; desktop/tablet/mobile preview).
3. Build shared shell editors for Header, navigation and Footer using the same schema and renderer contracts.
4. Add design-token editor and approved motion presets.
5. Add unsaved-change protection, preview link, revision diff and safe rollback.

### Phase C — universal site control

1. Extend the editor to all eligible public page templates and landing pages.
2. Complete media usage tracking, focal point/crop and asset replacement.
3. Add schedule/publish workflow, approvals, cache observability and full audit.
4. Add per-locale content and responsive behavior.
5. Provide end-to-end tests proving owner changes are reflected on Preview without source-code deployment and that unauthorized users cannot draft/publish.

## 6. Definition of Done

The Owner Control Plane is not complete merely because a Prisma model, API or isolated settings page exists.

For every editable resource, verify:

```text
Schema
→ Service
→ API
→ Permission
→ Admin UI
→ Public Renderer
→ Validation
→ Audit
→ Versioning
→ Preview
→ Publish / Rollback
→ Cache
→ Tests
→ Monitoring
→ Documentation
→ DONE
```

Acceptance scenarios:
- Owner changes Hero title, media, CTA, alignment, layout and supported motion in draft; preview reflects it; public published version remains unchanged until publish.
- Owner changes Header and Footer composition, navigation labels/targets, link groups and responsive settings; preview accurately reflects them.
- Owner changes section order, visibility, grid, spacing, typography and per-device settings without code changes.
- Owner can compare revisions and roll back safely.
- Editor cannot inject script, unsafe HTML, arbitrary CSS, SQL or external unsafe URLs.
- Non-owner admin/editor cannot access Owner-only controls or publish without explicit permission.
- Every publish/rollback is audited and cache invalidation occurs only after commit.
- Public routes never leak drafts; Preview is noindex and isolated from Production data.

## 7. Scope boundary

This contract does not authorize:
- a new paid CMS, hosting product, plugin or infrastructure;
- a Production schema migration or database write;
- deployment or DNS changes;
- changing the present design before the owner reviews Preview;
- giving every admin unrestricted site-owner powers.

Use existing GitHub, Cloudflare, Prisma and current application architecture within the zero-cost constraint.
