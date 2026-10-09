# HEAVIX — Product: VIP Virtual Showroom

> **Status:** PROPOSED — Product Architecture Specification (not implemented).
> **Branch:** `docs/product-architecture-initiative`
> **Task ID:** STEP 11.24
> **Scope:** Product design only. No source code changes.
> **Related:** `docs/PRODUCT-ADMIN-STORE-CENTER.md` (§4),
> `docs/ROADMAP-INDUSTRIAL-MARKETPLACE-ECOSYSTEM.md`

---

## 1. Purpose

Define the VIP Virtual Showroom — a configurable, shareable, public-facing
dealer page that VIP-subscribed sellers use to showcase their brand and
inventory. The showroom is the public storefront layer of the Store Management
Center (see `docs/PRODUCT-ADMIN-STORE-CENTER.md` §4). This document specifies
the access model, components, templates, builder, permissions, quotas,
campaigns, analytics, and expiry flow.

> 🔐 **VIP subscription is required.** Access is enforced server-side. UI hiding
> alone is prohibited — every showroom endpoint must verify the seller's active
> VIP subscription before returning non-public data.

---

## 2. Design Principles

1. **Subscription-gated.** A non-VIP seller cannot publish a showroom.
2. **Server-side enforcement.** Every public showroom endpoint verifies the
   seller's VIP status on each request.
3. **Config-driven, not code-driven.** Showroom layout is data (Page Builder
   config), not bespoke pages per dealer.
4. **Quota-bound.** Each VIP tier has explicit machine showcase and featured
   collection limits, enforced server-side.
5. **Transparent analytics.** Dealers see their own views, contacts, and lead
   conversion; buyers see only the public showroom.
6. **Graceful expiry.** VIP expiry deactivates the showroom with a clear path to
   renewal — no surprise takedowns mid-conversation.

---

## 3. Access Model

### 3.1 VIP Subscription Requirement

- A seller must hold an active `PremiumSubscription` (EXISTING main-schema
  model) of a VIP-eligible plan.
- The subscription `status` and `currentPeriodEnd` are checked on every
  showroom request.
- If the subscription is expired, cancelled, or below the required tier, the
  public showroom returns a "showroom inactive" page with a renewal CTA —
  never a 404, never a half-rendered page.

### 3.2 Server-side Enforcement

- The public showroom route `/showroom/[dealer-slug]` calls a server-side
  guard that loads the dealer's subscription state from the database.
- The dealer's showroom-builder route `/seller/showroom` and its API endpoints
  verify the same subscription before any write.
- VIP tier benefits (quotas, templates) are resolved server-side from the
  subscription plan; the client never asserts its own tier.

---

## 4. Showroom Components

A showroom is composed of the following components, each optional per template
but all governed by the same configuration object.

| Component | Content | Source |
|-----------|---------|--------|
| Branding | Logo, banner, brand colors, tagline | Seller identity (Store Center §2) |
| Inventory showcase | Paginated machine cards | `Listing` filtered by seller |
| Featured machines | Curated highlight collection | Seller-curated subset |
| Sales team profiles | Name, role, photo, contact | PROPOSED: sales-staff records |
| Contact info | Phone, email, address, map | `Company` + `CompanyBranch` |
| Verification badges | Identity, inspection, documents | `CompanyVerification` + `MachinePassport` |
| Visit analytics | Views, contacts, lead conversion | PROPOSED: `ShowroomAnalytics` aggregation |
| Campaigns | Time-limited featured collections | PROPOSED: `ShowroomCampaign` |

---

## 5. Public URL

- Format: `/showroom/[dealer-slug]`.
- The `dealer-slug` is derived from the seller's company name and is unique
  per seller. Slugs are reserved at VIP subscription activation.
- The showroom is **public** (no login required to view), but only VIP dealers
  have an active showroom. Non-VIP `/showroom/[slug]` returns the inactive
  page (§3.1).
- Shareable: the URL is stable across subscription renewals; it only goes
  inactive on expiry or cancellation.

---

## 6. Template System

Three starter templates. Each is a Page Builder configuration preset; dealers
may customize within their tier's allowed component set.

### 6.1 Dealer Template

- Focus: multi-brand inventory breadth.
- Default sections: branding, large inventory showcase, sales team, contact.
- Best for: independent dealers with diverse stock.

### 6.2 Manufacturer Template

- Focus: brand storytelling + product family navigation.
- Default sections: branding, brand story, product family grid, featured
  new models, service network, contact.
- Best for: OEMs and authorized distributors.

### 6.3 Used Equipment Dealer Template

- Focus: condition transparency + inspection badges.
- Default sections: branding, certified-pre-owned grid, inspection badges,
  financing-partner CTA (links to
  `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md` flow), contact.
- Best for: used machinery specialists.

---

## 7. Showroom Builder

The showroom builder is the dealer-facing configuration surface. It is built on
the EXISTING Page Builder architecture (STEP 14, referenced in
`docs/STORE-MARKETPLACE-CONTROL-PLANE.md`).

### 7.1 Builder Capabilities

- Select a starter template.
- Toggle and reorder sections within tier limits.
- Upload branding assets (logo, banner).
- Choose brand colors from an approved palette (no off-brand neon; aligns with
  HEAVIX design system).
- Curate featured machines from own inventory (within quota).
- Configure sales team profiles.
- Preview showroom before publishing.
- Publish / unpublish (publish requires active VIP).

### 7.2 Config Schema (conceptual)

The showroom is persisted as a Page Builder configuration object containing:

```
{
  template: "dealer" | "manufacturer" | "used-equipment",
  sections: [ { type, enabled, order, props } ],
  branding: { logoRef, bannerRef, primaryColor, tagline },
  featuredListingIds: [ ... ],   // bounded by tier quota
  salesTeamIds: [ ... ],
  published: boolean,
  publishedAt, updatedAt
}
```

The configuration is validated server-side on save; the public route renders
from the saved configuration, not from a client-side interpretation.

### 7.3 Prohibited Builder Behaviors

- ❌ Dealers may not inject custom HTML/JS into the showroom.
- ❌ Dealers may not bypass tier quotas via the config.
- ❌ Dealers may not display unverified badges by editing config — badges are
  derived from `CompanyVerification` / `MachinePassport` status, not config.

---

## 8. Permissions

All permissions are enforced server-side. UI hiding alone is prohibited.

| Permission Key | Scope | Typical Role |
|----------------|-------|--------------|
| `showroom.read` | View any public showroom | Anonymous public |
| `showroom.read.analytics` | View own showroom analytics | VIP dealer |
| `showroom.manage` | Configure own showroom | VIP dealer |
| `showroom.admin` | Platform-level showroom oversight | Platform admin |
| `showroom.campaign.manage` | Create platform-level campaigns | Platform admin |

### 8.1 Enforcement Requirements

- Public route verifies VIP subscription per request (§3.2).
- Builder write endpoints verify `showroom.manage` AND active VIP.
- Analytics endpoints verify ownership — a dealer may not query another
  dealer's analytics.
- Admin endpoints verify `showroom.admin` server-side.

---

## 9. Quotas

Quotas are tier-dependent and enforced server-side on every save.

| Quota | Typical VIP Tier 1 | Typical VIP Tier 2 | Typical VIP Tier 3 |
|-------|--------------------|--------------------|--------------------|
| Machines in showcase | 50 | 200 | unlimited |
| Featured machines | 6 | 20 | 50 |
| Sales team profiles | 3 | 10 | 25 |
| Active campaigns | 1 | 3 | 10 |
| Branding asset size | 2 MB | 5 MB | 10 MB |

Exact numbers are configured per `SubscriptionPlan` (EXISTING) and resolved at
runtime; the table above is illustrative. Quota-exceeding saves are rejected
with a clear error and an upgrade CTA.

---

## 10. VIP Campaigns

Time-limited featured collections that surface within a dealer's showroom (and,
optionally, in platform-level discovery).

### 10.1 Campaign Lifecycle

```
[draft] → [scheduled] → [active] → [ended] → [archived]
```

- A campaign has a start and end timestamp; activation is server-side.
- During the active window, the campaign collection appears prominently in the
  showroom.
- After end, the collection reverts to ordinary inventory; the campaign record
  is retained for analytics.
- Campaigns are bounded by the dealer's tier quota (§9).

### 10.2 Platform vs Dealer Campaigns

- **Dealer campaigns** are created by the VIP dealer (`showroom.manage`).
- **Platform campaigns** are created by HEAVIX admins
  (`showroom.campaign.manage`) and may feature multiple dealers' machines —
  for example, a "Q1 Excavator Spotlight".

---

## 11. Analytics

### 11.1 Tracked Metrics

| Metric | Definition |
|--------|------------|
| Showroom views | Unique page views of `/showroom/[slug]` |
| Machine card clicks | Clicks from showroom to listing detail |
| Contact actions | Clicks on phone/email/contact form |
| Lead conversions | Contacts that became `Lead` records |
| Featured CTR | Click-through on featured machines vs. grid |
| Campaign lift | Views/contacts during campaign vs. baseline |

### 11.2 Privacy & Retention

- Analytics are aggregated; no individual buyer PII is exposed to the dealer.
- Raw event retention: 90 days. Aggregates: 24 months.
- A dealer may export their own analytics (subject to EXPORT field policy).

---

## 12. Cancellation & Expiry

### 12.1 VIP Expiry Flow

1. Subscription `currentPeriodEnd` passes without renewal.
2. Showroom enters `grace` state for 7 days (configurable) — still publicly
   visible, dealer sees a renewal banner.
3. After grace, showroom enters `inactive` state — public URL shows the
   inactive page with renewal CTA.
4. Configuration is retained for 90 days; renewal within that window restores
   the showroom without reconfiguration.
5. After 90 days, configuration is archived; dealer must reconfigure on
   re-subscription.

### 12.2 Cancellation Flow

- Dealer may cancel at any time; the showroom remains active until
  `currentPeriodEnd`, then follows the expiry flow.
- Platform admin may suspend a showroom for policy violations
  (`showroom.admin`) — this is immediate and bypasses grace.

### 12.3 No Fund Movement

- VIP subscription billing is handled by the existing subscription system;
  this document does not introduce new payment flows.
- The showroom itself never collects funds from buyers.

---

## 13. Reuse from Existing Infrastructure

| Existing Asset | Reused For |
|----------------|------------|
| `PremiumSubscription` / `SubscriptionPlan` | VIP tier & quota resolution |
| `Listing` + `ListingImage` | Inventory showcase & machine cards |
| `Company` + `CompanyBranch` | Contact info & locations |
| `CompanyVerification` | Verification badges |
| `MachinePassport` | Per-machine verification badge |
| Page Builder (STEP 14) | Showroom layout configuration |
| Universal Resource Engine | Showroom admin oversight table |
| Action Engine audit | Publish / unpublish / campaign transitions |
| Field Policy | Analytics export enforcement |

---

## 14. Acceptance Criteria (Definition of Done — Design)

- [ ] Access model documents VIP requirement and server-side enforcement.
- [ ] All 8 showroom components enumerated with source models.
- [ ] Public URL pattern specified; inactive-page behavior defined.
- [ ] Three templates documented with use cases.
- [ ] Builder capabilities and prohibited behaviors listed.
- [ ] Config schema is conceptual but unambiguous.
- [ ] Permissions documented with enforcement requirements.
- [ ] Quota table is illustrative and tied to `SubscriptionPlan`.
- [ ] Campaign lifecycle and platform/dealer distinction clear.
- [ ] Analytics metrics, privacy, and retention specified.
- [ ] Expiry/cancellation flow covers grace, inactive, archive.
- [ ] No showroom component collects buyer funds.

---

## 15. Phased Delivery

| Phase | Scope | Gate |
|-------|-------|------|
| P1 — Public route + inactive page | `/showroom/[slug]` resolves; inactive page works | VIP check enforced server-side |
| P2 — Dealer template + branding | Builder saves config; dealer template renders | Quota enforcement on save |
| P3 — Manufacturer + used-equipment templates | Two more templates ship | Template registry extensible |
| P4 — Analytics dashboard | Dealer sees own views/contacts/leads | Privacy aggregation verified |
| P5 — Campaigns | Dealer + platform campaigns; lifecycle audit | Campaign quota enforced |

Each phase is independently shippable. No phase introduces buyer fund
collection or credit decisions.

---

## 16. Prohibitions

- ❌ No showroom may be published without an active VIP subscription.
- ❌ No showroom endpoint may rely on UI hiding for access control.
- ❌ No dealer may inject custom code into the showroom.
- ❌ No dealer may exceed tier quotas via configuration.
- ❌ No verification badge may be displayed without backing model status.
- ❌ No showroom component may collect buyer funds or render credit decisions.

---

## 17. Out of Scope

- Source code changes (this is a product design document).
- Page Builder implementation details (owned by STEP 14 design).
- Subscription billing flows (owned by existing subscription system).
- Marketing copy for templates (owned by marketing).
- Specific brand-color palette values (owned by design system).

---

**End of document.**
