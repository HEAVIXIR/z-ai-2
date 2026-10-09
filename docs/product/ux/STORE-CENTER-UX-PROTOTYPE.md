# HEAVIX Store Center — UX Prototype Discovery

**Status:** PROPOSED — for owner review before implementation
**Date:** 2026-10-09
**Baseline:** main `710df93`

## Design Principles

1. **Data-first**: Every component maps to a real data source. Placeholders are explicitly labeled.
2. **Mobile-first**: All layouts work on 375px width, then enhance for desktop.
3. **Role-aware**: Seller sees their store; Admin sees all stores; Buyer sees public showroom.
4. **Loading/Empty/Error**: Every page defines all three states.
5. **No fabricated data**: KPIs show "—" when no data exists, not fake numbers.

---

## Page 1: Store Center Dashboard

**Route:** `/seller/dashboard` (existing — enhance)
**Roles:** Seller (own store), Admin (any store)
**Data sources:** Listing.viewCount, Lead (count by status), Order (count by status), StockMovement (recent)

### Desktop Layout (≥1024px)
```
┌─────────────────────────────────────────────────┐
│ Store Center                          [Admin]   │
├──────────┬──────────────────────────────────────┤
│          │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│
│ Sidebar  │  │Active│ │New   │ │Open  │ │Low   ││
│          │  │Listings│ │Leads│ │Orders│ │Stock ││
│ - Dashboard │  │  12  │ │  5  │ │  3  │ │  7  ││
│ - Identity│  └──────┘ └──────┘ └──────┘ └──────┘│
│ - Inventory│                                     │
│ - Orders  │  ┌─────────────┐  ┌─────────────┐   │
│ - Leads   │  │ Recent Leads│  │ Inventory   │   │
│ - Passport│  │             │  │ Alerts      │   │
│ - Showroom│  │ A: Buyer X  │  │             │   │
│ - Reports │  │ B: Buyer Y  │  │ Part A: 2   │   │
│          │  │ C: Buyer Z  │  │ Part B: 0 ⚠ │   │
│          │  └─────────────┘  └─────────────┘   │
└──────────┴──────────────────────────────────────┘
```

### Mobile Layout (375px)
```
┌─────────────┐
│ Store Center│
│ ≡ Menu      │
├─────────────┤
│ ┌────┐┌────┐│
│ │ 12 ││ 5  ││
│ │List││Lead││
│ └────┘└────┘│
│ ┌────┐┌────┐│
│ │ 3  ││ 7  ││
│ │Ord ││Stk ││
│ └────┘└────┘│
├─────────────┤
│ Recent Leads│
│ A: Buyer X  │
│ B: Buyer Y  │
├─────────────┤
│ Stock Alerts│
│ Part B: 0 ⚠│
└─────────────┘
```

### States
- **Loading:** Skeleton cards with spinner
- **Empty:** "No data yet. Start by adding inventory or listings."
- **Error:** "Failed to load dashboard. [Retry]"

### CTAs
- "View All Leads" → `/seller/leads`
- "Manage Inventory" → `/admin/store/inventory`
- "Complete Store Profile" → `/seller/identity`

---

## Page 2: Store Identity & Branding

**Route:** `/seller/identity` (NEW)
**Roles:** Seller (own), Admin (any)
**Data source:** Company model (existing — extend with branding fields)

### Layout
```
┌─────────────────────────────────────────────────┐
│ Store Identity & Branding                       │
├─────────────────────────────────────────────────┤
│ ┌─────────────┐  Store Name: [__________]      │
│ │             │  Logo: [Upload]                 │
│ │   LOGO      │  Banner: [Upload]              │
│ │  PREVIEW    │  Brand Color: [#______]        │
│ │             │  Description: [textarea]        │
│ └─────────────┘  Phone: [__________]            │
│                   Email: [__________]           │
│                   Address: [__________]         │
│                                                 │
│                   [Save Changes]                │
└─────────────────────────────────────────────────┘
```

### States
- **Loading:** Form skeleton
- **Empty (new seller):** "Complete your store profile to build trust with buyers."
- **Error:** "Failed to save. Check required fields."

### Data Decision
- **Option A (preferred):** Extend Company model with `logoUrl`, `bannerUrl`, `brandColor`, `storeDescription` fields
- **Option B:** New StoreProfile model linked to Company
- **Owner decision:** Use Company (avoid model duplication)

---

## Page 3: Inventory & Catalog

**Route:** `/admin/store/inventory` (EXISTING — enhance)
**Roles:** Seller (own inventory), Admin (all)
**Data source:** Part, StockMovement, Warehouse, InventoryBalance (store schema)

### Layout
```
┌─────────────────────────────────────────────────┐
│ Inventory & Catalog              [Export] [Add]│
├──────────────┬──────────────────────────────────┤
│ Filters:     │  ┌────────────────────────────┐  │
│ □ Low stock  │  │ Part A  | Stock: 12 | ✅  │  │
│ □ Out of     │  │ Part B  | Stock: 0  | ⚠️  │  │
│   stock      │  │ Part C  | Stock: 5  | ✅  │  │
│ Warehouse:   │  │ Part D  | Stock: 1  | ⚠️  │  │
│ [All ▼]      │  └────────────────────────────┘  │
│              │                                  │
│ Smart Score: │  [Pagination: 1 2 3 ... 10]     │
│ □ < 50%      │                                  │
└──────────────┴──────────────────────────────────┘
```

### Smart Inventory Score (deterministic)
```
Score = (
  has_partNumber * 15 +
  has_oemNumber * 10 +
  has_images * 20 +
  has_documents * 15 +
  has_specifications * 15 +
  stock_accuracy * 10 +
  recent_movement * 15
)
```
- Score 0-100, stored as cached value, recalculated on update
- Display: "Inventory Score: 75/100 — Missing: OEM number, documents"

### States
- **Empty:** "No parts in inventory. [Add Part]"
- **Error:** "Failed to load inventory. [Retry]"

---

## Page 4: Leads & CRM

**Route:** `/seller/leads` (EXISTING — enhance)
**Roles:** Seller (own leads), Admin (all)
**Data source:** Lead model (main schema — needs `status` field addition)

### Layout
```
┌─────────────────────────────────────────────────┐
│ Leads & CRM                      [Export] [Add]│
├──────────────┬──────────────────────────────────┤
│ Pipeline:    │  ┌────────────────────────────┐  │
│ NEW (5)      │  │ Buyer A | NEW | 2d ago     │  │
│ CONTACTED (3)│  │ Buyer B | CONTACTED | 5d   │  │
│ QUALIFIED (1)│  │ Buyer C | QUALIFIED | 1d   │  │
│ CLOSED (2)   │  └────────────────────────────┘  │
│              │                                  │
│ Assignee:    │  Lead Intelligence:              │
│ [All ▼]      │  ⚡ Hot: Buyer C (3 inquiries)  │
│              │  🔄 Warm: Buyer A (2 days)      │
│              │  ❄️ Cold: Buyer D (30 days)     │
└──────────────┴──────────────────────────────────┘
```

### Lead Intelligence (deterministic)
- **Hot:** ≥3 inquiries OR status=QUALIFIED
- **Warm:** 1-2 inquiries, last contact ≤7 days
- **Cold:** No contact ≥14 days

### Data Gap
- Lead model currently has `leadType` but NO `status` field
- **Migration needed:** Add `status` enum (NEW, CONTACTED, QUALIFIED, CLOSED, LOST)
- Backfill: All existing leads → status=NEW

---

## Page 5: Machine Passport

**Route:** `/admin/store/passport/[listingId]` (NEW)
**Roles:** Seller (own listings), Admin (all)
**Data source:** MachinePassport (main schema), Inspection, Listing

### Layout
```
┌─────────────────────────────────────────────────┐
│ Machine Passport — Listing #12345               │
├──────────────────────┬──────────────────────────┤
│ ┌──────────────────┐ │  Verification Status:    │
│ │                  │ │  ┌────────────────────┐  │
│ │  MACHINE PHOTO   │ │  │ ✅ Specifications  │  │
│ │                  │ │  │    Source: MANUFACTURER│
│ │                  │ │  │    Verified: 2026-10-01│
│ └──────────────────┘ │  ├────────────────────┤  │
│                      │  │ ✅ Ownership Docs   │  │
│ Specs:               │  │    Source: SELLER    │
│ Brand: Caterpillar   │  │    Verified: 2026-10-02│
│ Model: 320 Excavator │  ├────────────────────┤  │
│ Year: 2021           │  │ ⚠️ Inspection       │  │
│ Hours: 3,200         │  │    Source: PENDING    │
│                      │  │    Last: 2026-09-15   │
│ Documents:           │  ├────────────────────┤  │
│ [Manual.pdf]         │  │ ❌ Service History  │  │
│ [Inspection.pdf]     │  │    Not provided      │  │
│                      │  └────────────────────┘  │
│                      │                          │
│                      │  Passport Score: 60/100  │
│                      │  [Request Inspection]    │
└──────────────────────┴──────────────────────────┘
```

### Passport Score (deterministic)
- Specs verified: 25 pts
- Ownership verified: 20 pts
- Inspection current: 25 pts
- Service history: 15 pts
- Photos ≥3: 15 pts

### States
- **Empty (no passport):** "No passport data. Start by verifying specifications."
- **Partial:** Shows verified sections with ✅, pending with ⚠️, missing with ❌

---

## Page 6: VIP Virtual Showroom

**Route:** `/showroom/[dealerSlug]` (NEW — public)
**Admin route:** `/seller/showroom` (NEW — management)
**Roles:** Public (view), VIP Seller (manage), Admin (all)
**Data source:** Showroom model (NEW), Company, Listing, PremiumSubscription
**Enforcement:** Server-side — non-VIP sellers CANNOT access showroom management

### Public Showroom Layout
```
┌─────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────┐ │
│ │           DEALER BANNER IMAGE               │ │
│ │     [Dealer Name] | VIP Dealer              │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ About: "Leading heavy equipment dealer..."      │
│ Trust: ✅ Verified Company | ⭐ 4.5 (23 reviews)│
│                                                 │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│ │Machine│ │Machine│ │Machine│ │Machine│          │
│ │  A    │ │  B    │ │  C    │ │  D    │          │
│ │$50K   │ │$75K   │ │$30K   │ │$100K  │          │
│ │Passport│ │Passport│ │Passport│ │Passport│        │
│ │ 80/100│ │ 95/100│ │ 60/100│ │ 100/100│         │
│ └──────┘ └──────┘ └──────┘ └──────┘           │
│                                                 │
│ Sales Team:                                     │
│ ┌────────┐ ┌────────┐ ┌────────┐               │
│ │ John D.│ │ Sarah K│ │ Mike R.│               │
│ │ Sales  │ │ Manager│ │ Tech   │               │
│ └────────┘ └────────┘ └────────┘               │
│                                                 │
│ [Contact Dealer] [Request Price]               │
└─────────────────────────────────────────────────┘
```

### VIP Enforcement (server-side)
```
GET /showroom/[slug]:
  1. Fetch Showroom by slug
  2. Check Showroom.isActive === true
  3. Check Company.PremiumSubscription is valid (not expired)
  4. If any check fails → 404 (not "access denied" — don't leak existence)
  5. If pass → render public showroom

GET /seller/showroom (management):
  1. Authenticate user
  2. Check user's Company has active PremiumSubscription
  3. If NOT VIP → 403 Forbidden
  4. If VIP → render management interface
```

### States
- **Loading:** Skeleton showroom
- **404 (non-VIP/inactive):** Standard 404 page
- **Empty (VIP but no setup):** "Your showroom is active but empty. [Add Featured Machines]"

---

## Page 7: Reports & Business Assistant

**Route:** `/seller/reports` (NEW)
**Roles:** Seller (own), Admin (all)
**Data source:** Aggregated from Listing, Lead, Order, Payment, AIGatewayLog

### Layout
```
┌─────────────────────────────────────────────────┐
│ Reports & Business Assistant                    │
├──────────────────────┬──────────────────────────┤
│ Date Range:          │  ┌────────────────────┐  │
│ [Last 30 days ▼]     │  │ Business Assistant │  │
│                      │  │                    │  │
│ ┌──────────────────┐ │  │ ⚠️ 3 listings have  │  │
│ │ Performance      │ │  │    incomplete specs │  │
│ │ Views:     1,234 │ │  │    [Review →]      │  │
│ │ Leads:        45 │ │  │                    │  │
│ │ Conversion: 3.6% │ │  │ ⚠️ Part B is out   │  │
│ │ Revenue:  2.5M IRR│ │  │    of stock        │  │
│ └──────────────────┘ │  │    [Restock →]     │  │
│                      │  │                    │  │
│ ┌──────────────────┐ │  │ 💡 Buyer C showed   │  │
│ │ Inventory Health │ │  │    interest in 3    │  │
│ │ Avg Score: 72/100│ │  │    machines         │  │
│ │ Low Stock:    7  │ │  │    [Follow up →]    │  │
│ │ Stale (>90d): 3  │ │  │                    │  │
│ └──────────────────┘ │  │ All suggestions are │  │
│                      │  │ advisory only. You  │  │
│ [Export Report]      │  │ decide what to do.  │  │
│                      │  └────────────────────┘  │
└──────────────────────┴──────────────────────────┘
```

### Business Assistant Rules
- Data source: Real queries (Listing.viewCount, Lead.status, StockMovement, etc.)
- AI Gateway: SELLER_ASSISTANT task type for natural language summaries
- **NO autonomous mutations**: All suggestions are advisory
- Each suggestion has a link to the relevant page for manual action
- "Dismiss" button to hide suggestion (stored in user preferences)

### States
- **Loading:** "Analyzing your store data..."
- **Empty:** "No reports yet. Reports generate after 7 days of activity."
- **Error:** "Failed to generate report. [Retry]"
