# ADR-005 — Store Center Architecture Decisions

- **Status:** Accepted — STEP 11.28
- **Date:** 2026-10-09
- **Decision owners:** HEAVIX core team
- **Supersedes:** none
- **Related:** ADR-002 (Resource Architecture), PRODUCT-ADMIN-STORE-CENTER-SPEC.md

## Context

The Store Management Center requires architectural decisions before implementation.
This ADR records the owner's directives from STEP 11.28 and validates them
against the existing schema and codebase.

## Decisions

### 1. Store Identity — Extend Company Model

**Decision:** Extend the existing `Company` model with branding fields, NOT create a parallel `StoreProfile` model.

**Rationale:** Company already has: name, description, phone, email, address, verification status, documents. Adding `logoUrl`, `bannerUrl`, `brandColor`, `storeDescription` is additive and avoids model duplication.

**Schema change:**
```prisma
model Company {
  // ... existing fields ...
  logoUrl          String?  // NEW: store logo
  bannerUrl        String?  // NEW: showroom banner
  brandColor       String?  // NEW: hex color for branding
  storeDescription String?  // NEW: store-specific description (longer than company description)
  storeSlug        String?  @unique  // NEW: URL slug for /showroom/[slug]
}
```

**Migration:** Additive — `null` defaults, no data loss. Existing companies unaffected.

**Alternatives considered:**
- StoreProfile model (rejected: unnecessary duplication, relationship complexity)
- User-level store (rejected: store belongs to Company, not individual user)

### 2. VIP Showroom — Independent Showroom Model

**Decision:** Create a new `Showroom` model linked to `Company`, with server-side VIP enforcement.

**Rationale:** Showroom has its own lifecycle (active/inactive, featured items, layout config) separate from Company. PremiumSubscription already exists to track VIP status.

**Schema change:**
```prisma
model Showroom {
  id           String   @id @default(cuid())
  companyId    String   @unique
  company      Company  @relation(fields: [companyId], references: [id])
  isActive     Boolean  @default(false)
  template     String   @default("dealer")  // dealer | manufacturer | used_equipment
  layout       Json?    // configurable layout sections
  featuredListingIds String[] // curated machine IDs
  viewCount    Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

**Server-side enforcement:**
- Public route `/showroom/[slug]`: Check Showroom.isActive + Company.PremiumSubscription validity
- Management route `/seller/showroom`: Check user's Company has active PremiumSubscription
- Non-VIP → 404 (public) or 403 (management)

**Migration:** New table, no existing data affected. Created on-demand when VIP seller sets up showroom.

### 3. Lead Status — Structured Enum

**Decision:** Add `status` enum field to Lead model with migration + backfill.

**Rationale:** Current Lead model has `leadType` (SALE, RENT, etc.) but no workflow status. CRM pipeline requires NEW → CONTACTED → QUALIFIED → CLOSED/LOST.

**Schema change:**
```prisma
model Lead {
  // ... existing fields ...
  status  String  @default("NEW")  // NEW | CONTACTED | QUALIFIED | CLOSED | LOST
}
```

**Migration:** Additive — default "NEW" for all existing leads. No data loss.

**Alternatives considered:**
- Free-text status (rejected: no validation, inconsistent values)
- Separate LeadStatus model (rejected: over-engineering for 5 values)

### 4. Sales Team — Independent SalesTeamMember Model

**Decision:** Create new `SalesTeamMember` model linked to Company. Do NOT reuse Mechanic model.

**Rationale:** Mechanic is a technical role (repair, maintenance) in the store schema. Sales team is a commercial role in the main schema. Different domains, different permissions.

**Schema change:**
```prisma
model SalesTeamMember {
  id          String   @id @default(cuid())
  companyId   String
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  userId      String?  // optional link to User account
  name        String
  role        String   // MANAGER | SALES | TECHNICAL_SALES
  phone       String?
  email       String?
  photoUrl    String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([companyId])
}
```

**Migration:** New table, no existing data affected.

### 5. Smart Inventory Score — Deterministic, Versioned

**Decision:** Calculate score deterministically from existing fields. Cache result but allow recalculation.

**Rationale:** Score must be explainable (not AI-generated). Factors come from existing Part/Listing fields. Caching avoids recalculating on every view.

**Algorithm (v1):**
```
Score = has_partNumber(15) + has_oemNumber(10) + has_images(20)
      + has_documents(15) + has_specifications(15)
      + stock_accuracy(10) + recent_movement(15)
```
- Max: 100, Min: 0
- Stored as `inventoryScore Int?` on Part model
- Recalculated on: Part update, StockMovement creation, image upload
- Versioned: `inventoryScoreVersion String?` (e.g., "v1") for future algorithm changes

**Schema change:**
```prisma
model Part {
  // ... existing fields ...
  inventoryScore        Int?     // NEW: cached score 0-100
  inventoryScoreVersion String?  // NEW: algorithm version
}
```

**Migration:** Additive — null until first calculation. Backfill job calculates for all existing parts.

### 6. Machine Passport — Per-Section Verification

**Decision:** MachinePassport already exists with `source` and `verification` fields. Extend with per-section verification status.

**Rationale:** Current model has a single `verification` field. Machine Passport needs section-level tracking (specs verified, ownership verified, inspection current, service history).

**Schema change (extend existing MachinePassport):**
```prisma
model MachinePassport {
  // ... existing fields ...
  specsVerifiedAt      DateTime?  // NEW
  specsVerifiedBy      String?    // NEW: user ID
  ownershipVerifiedAt  DateTime?  // NEW
  ownershipVerifiedBy  String?    // NEW
  inspectionVerifiedAt DateTime?  // NEW
  inspectionVerifiedBy String?    // NEW
  serviceHistoryVerifiedAt DateTime? // NEW
  serviceHistoryVerifiedBy String?   // NEW
}
```

**Passport Score (deterministic):**
```
Score = specs_verified(25) + ownership_verified(20)
      + inspection_current(25) + service_history(15) + photos(15)
```

**Migration:** Additive — null fields mean "not verified". No data loss.

### 7. Permission Keys — Unified Matrix

**Decision:** All new permissions must be added to the canonical permission list in `src/lib/authorization/permissions.ts` and seeded via `prisma/seed-rbac.ts`. No ad-hoc permission strings.

**New permissions needed:**
- `store.profile.read` — view store identity
- `store.profile.manage` — edit store identity
- `showroom.read` — public showroom view (anyone)
- `showroom.manage` — VIP showroom management
- `showroom.admin` — admin showroom oversight
- `passport.read` — view machine passport
- `passport.manage` — edit/verify passport sections
- `store.crm.read` — view leads/CRM
- `store.crm.manage` — manage leads
- `store.reports.read` — view reports
- `store.analytics.read` — view analytics

**Migration:** Add to PERMISSIONS array, add to ADMIN role in seed, assign to SELLER role as appropriate.

### 8. AI Assistant — Advisory Only

**Decision:** AI Gateway SELLER_ASSISTANT task type is used for analysis and suggestions only. NO mutation capability.

**Enforcement:**
- AI Gateway returns text suggestions (not function calls)
- Each suggestion includes a link to the relevant page
- User must manually navigate and perform the action
- All actions go through normal authenticated, authorized, audited paths
- No "AI executes action" pattern — even with user approval

**Rationale:** Prevents AI from bypassing permission checks, field policies, or audit requirements.

## Consequences

- 3 new models: Showroom, SalesTeamMember (additive, no data loss)
- 2 extended models: Company (branding), Lead (status), Part (score), MachinePassport (verification)
- 11 new permission keys
- All migrations are additive (no destructive changes)
- Store-DB limitation remains: cross-DB transactions not supported (ADR-003)
- VIP enforcement is server-side, not UI-hidden

## Rollback

All changes are additive. Rollback = remove new fields/tables. No existing data is modified or deleted.
