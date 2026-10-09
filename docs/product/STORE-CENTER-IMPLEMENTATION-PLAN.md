# HEAVIX Store Center — Implementation Plan

**Status:** PROPOSED — for owner review
**Date:** 2026-10-09
**Baseline:** main `710df93`
**ADR:** ADR-005

## Principles

1. Each PR is small, testable, and independently reviewable
2. No direct changes to `main`
3. Every PR includes: scope, files, migration, tests, acceptance criteria, rollback
4. Universal Resource Engine is reused unless technical justification for exception
5. All permissions go through canonical RBAC (admin-guard.ts + authorization/index.ts)
6. All mutations are audited via auditMutationTransactional or auditMutation
7. Security tests required for each feature

---

## PR Sequence

### PR-SC-01: Schema Migration — Company Branding + Lead Status

**Scope:** Add branding fields to Company, add status to Lead
**Files:**
- `prisma/schema.prisma` (Company: +logoUrl, +bannerUrl, +brandColor, +storeDescription, +storeSlug; Lead: +status)
- `prisma/seed-rbac.ts` (no changes — no new permissions yet)
- Migration SQL (additive ALTER TABLE)

**Migration:** Additive, null defaults, no data loss
**Tests:** typecheck, schema validation
**Acceptance:**
- Company has logoUrl, bannerUrl, brandColor, storeDescription, storeSlug fields
- Lead has status field with default "NEW"
- All existing records unaffected
**Rollback:** DROP COLUMN (additive only)

---

### PR-SC-02: Schema Migration — Showroom + SalesTeamMember

**Scope:** New Showroom and SalesTeamMember models
**Files:**
- `prisma/schema.prisma` (+Showroom model, +SalesTeamMember model, +Company.relation)
- `prisma/seed-rbac.ts` (+showroom.read, +showroom.manage, +showroom.admin)

**Migration:** New tables, no existing data affected
**Tests:** typecheck, schema validation
**Acceptance:**
- Showroom model exists with companyId, isActive, template, layout, featuredListingIds
- SalesTeamMember model exists with companyId, name, role, phone, email
- New permissions in RBAC seed
**Rollback:** DROP TABLE (no existing data)

---

### PR-SC-03: Schema Migration — Part Score + MachinePassport Verification

**Scope:** Extend Part with inventoryScore, extend MachinePassport with per-section verification
**Files:**
- `prisma/schema.prisma` (Part: +inventoryScore, +inventoryScoreVersion; MachinePassport: +specsVerifiedAt/By, +ownershipVerifiedAt/By, etc.)
- `scripts/calculate-inventory-score.ts` (backfill script)

**Migration:** Additive, null defaults
**Tests:** typecheck, schema validation, backfill script
**Acceptance:**
- Part has inventoryScore (nullable int)
- MachinePassport has per-section verification fields
- Backfill script runs without error
**Rollback:** DROP COLUMN

---

### PR-SC-04: Store Identity API + UI

**Scope:** API for reading/updating Company branding fields
**Files:**
- `src/app/api/seller/identity/route.ts` (GET, PATCH)
- `src/app/seller/identity/page.tsx` (form UI)
- `src/lib/admin/resources/` (no new resource — uses Company directly)

**Permissions:** store.profile.read, store.profile.manage
**Authorization:** Seller can only edit own Company; Admin can edit any
**Audit:** auditMutation on PATCH
**Tests:**
- Unit: validation (logoUrl format, brandColor hex)
- Integration: PATCH updates Company, audit created
- Security: Seller A cannot edit Seller B's company
**Acceptance:**
- GET /api/seller/identity returns Company branding fields
- PATCH updates fields, creates audit log
- Non-seller users get 403
**Rollback:** Revert PR (no schema change needed)

---

### PR-SC-05: Store Dashboard Enhancement

**Scope:** Enhance /seller/dashboard with real KPIs
**Files:**
- `src/app/seller/dashboard/page.tsx` (enhance existing)
- `src/app/api/seller/dashboard/route.ts` (NEW — aggregate KPIs)

**Data sources:**
- Listing.count(sellerId, status=PUBLISHED) → active listings
- Lead.count(sellerId, status=NEW) → new leads
- Order.count(status=PENDING) → open orders (store schema, if seller has store)
- StockMovement (latest, store schema) → inventory alerts

**KPIs (all from real data):**
- Active Listings: `db.listing.count({ where: { sellerId, status: 'PUBLISHED' } })`
- New Leads: `db.lead.count({ where: { sellerId, status: 'NEW' } })`
- Open Orders: `storeDb.order.count({ where: { status: 'PENDING' } })` (if store linked)
- Low Stock: `storeDb.inventoryBalance.count({ where: { quantity: { lte: lowStockThreshold } } })`

**Tests:**
- Integration: dashboard loads with real data
- Empty: new seller sees zeros and onboarding CTA
**Acceptance:**
- Dashboard shows 4 KPI cards with real counts
- Loading state shows skeleton
- Empty state shows onboarding message
**Rollback:** Revert PR

---

### PR-SC-06: Lead Status Migration + CRM Enhancement

**Scope:** Add status workflow to Lead, enhance /seller/leads
**Files:**
- `prisma/schema.prisma` (Lead: +status — already in PR-SC-01, this PR adds UI)
- `src/app/seller/leads/page.tsx` (enhance with pipeline view)
- `src/app/api/seller/leads/route.ts` (PATCH to update status)
- `src/lib/authorization/permissions.ts` (+store.crm.read, +store.crm.manage)

**Lead Intelligence (deterministic):**
- Hot: ≥3 inquiries OR status=QUALIFIED
- Warm: 1-2 inquiries, last contact ≤7 days
- Cold: No contact ≥14 days

**Tests:**
- Integration: PATCH lead status, verify audit
- Security: Seller A cannot see Seller B's leads
- Unit: Lead Intelligence scoring
**Acceptance:**
- Leads displayed in pipeline columns (NEW, CONTACTED, QUALIFIED, CLOSED)
- Status change creates audit log
- Lead Intelligence labels shown
**Rollback:** Revert PR (status field remains, UI reverts)

---

### PR-SC-07: Machine Passport UI

**Scope:** Passport detail page with per-section verification display
**Files:**
- `src/app/admin/store/passport/[listingId]/page.tsx` (NEW)
- `src/app/api/seller/passport/[listingId]/route.ts` (GET)
- `src/lib/admin/resources/` (no new resource — reads MachinePassport directly)

**Permissions:** passport.read, passport.manage
**Tests:**
- Integration: GET passport returns all sections
- Security: Seller A cannot view Seller B's passport
- Unit: Passport score calculation
**Acceptance:**
- Passport page shows 5 sections with verification status
- Score displayed (0-100)
- "Request Inspection" CTA visible
**Rollback:** Revert PR

---

### PR-SC-08: VIP Showroom — Server-Side + Management UI

**Scope:** Showroom model API + management UI + public page
**Files:**
- `src/app/api/seller/showroom/route.ts` (GET, PATCH)
- `src/app/seller/showroom/page.tsx` (management UI)
- `src/app/showroom/[slug]/page.tsx` (public showroom)
- `src/app/api/showroom/[slug]/route.ts` (public GET)
- `src/lib/showroom-auth.ts` (server-side VIP check)

**Permissions:** showroom.read (public), showroom.manage (VIP), showroom.admin (admin)
**Server-side enforcement:**
- Public: isActive + PremiumSubscription valid → render; else 404
- Management: user's Company has active PremiumSubscription → 403 if not

**Tests:**
- Security: Non-VIP seller cannot access management (403)
- Security: Inactive showroom returns 404 (not 403 — don't leak existence)
- Integration: VIP seller can update showroom layout
- E2E: Public can view active showroom
**Acceptance:**
- VIP seller can set up showroom (template, featured machines)
- Public URL /showroom/[slug] renders active showroom
- Non-VIP gets 403 on management, 404 on public (if inactive)
**Rollback:** Revert PR (Showroom table remains, pages revert)

---

### PR-SC-09: Reports + Business Assistant

**Scope:** Reports page with real KPIs + AI-assisted suggestions
**Files:**
- `src/app/seller/reports/page.tsx` (NEW)
- `src/app/api/seller/reports/route.ts` (NEW — aggregate data)
- `src/app/api/seller/assistant/route.ts` (NEW — AI Gateway SELLER_ASSISTANT)

**AI rules:**
- Returns text suggestions only (no mutations)
- Each suggestion has CTA link to relevant page
- User dismiss stored in AdminPreference

**Tests:**
- Integration: Reports page loads with real aggregated data
- Security: Seller A cannot see Seller B's reports
- Unit: AI suggestion parsing
**Acceptance:**
- Reports show 30-day performance (views, leads, conversion, revenue)
- Business Assistant shows 3+ real suggestions based on data
- All suggestions are advisory (no auto-action)
**Rollback:** Revert PR

---

## Dependency Graph

```
PR-SC-01 (Company branding + Lead status)
    ↓
PR-SC-02 (Showroom + SalesTeamMember models)
    ↓
PR-SC-03 (Part score + Passport verification)
    ↓
PR-SC-04 (Store Identity UI) ← depends on PR-SC-01
    ↓
PR-SC-05 (Dashboard) ← depends on PR-SC-01
    ↓
PR-SC-06 (CRM) ← depends on PR-SC-01
    ↓
PR-SC-07 (Machine Passport UI) ← depends on PR-SC-03
    ↓
PR-SC-08 (VIP Showroom) ← depends on PR-SC-02
    ↓
PR-SC-09 (Reports + Assistant) ← depends on PR-SC-05, PR-SC-06
```

## Rollout Order

1. **Phase 1 (Schema):** PR-SC-01, PR-SC-02, PR-SC-03 (all additive, no UI)
2. **Phase 2 (Core UI):** PR-SC-04, PR-SC-05, PR-SC-06 (identity, dashboard, CRM)
3. **Phase 3 (Trust):** PR-SC-07 (machine passport)
4. **Phase 4 (Revenue):** PR-SC-08 (VIP showroom)
5. **Phase 5 (Intelligence):** PR-SC-09 (reports + assistant)

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Schema migration on production | MEDIUM | All migrations are additive (no data loss) |
| VIP enforcement bypass | HIGH | Server-side check on every route (showroom-auth.ts) |
| Lead data inconsistency | MEDIUM | Backfill status=NEW for all existing leads |
| AI suggestion quality | LOW | Advisory only — no autonomous action |
| Performance (aggregated KPIs) | MEDIUM | Cache KPI counts, refresh every 5 minutes |
| Cross-DB limitation | KNOWN | Store-DB queries use non-transactional path (ADR-003) |
