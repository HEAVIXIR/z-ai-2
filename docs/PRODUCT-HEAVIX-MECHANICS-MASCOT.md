# HEAVIX — Product: HEAVIX & MEKANIX Mascot Identity

> **Status:** PROPOSED — Product Architecture Specification (not implemented).
> **Branch:** `docs/product-architecture-initiative`
> **Task ID:** STEP 11.24
> **Scope:** Product design only. No source code changes. No final illustration
> assets commissioned by this document.
> **Related:** `docs/PRODUCT-ADMIN-STORE-CENTER.md` (§9 Heavix Business
> Assistant), `docs/ROADMAP-INDUSTRIAL-MARKETPLACE-ECOSYSTEM.md`

---

## 1. Purpose

Define the shared mascot identity for the HEAVIX platform — a single rhinoceros
character that appears in two contextual roles: **HEAVIX** (brand representative
and platform guide) and **MEKANIX** (technical specialist and machinery expert).
This document specifies the identity, roles, design direction, asset system,
usage guidelines, boundaries, tone, accessibility, and implementation phasing.

> 🎨 **Design direction is conceptual.** This document does not commission final
> illustration assets; it specifies the product behavior the assets must support.

---

## 2. Core Concept — One Character, Two Roles

HEAVIX and MEKANIX are **not two different characters**. They are two contextual
manifestations of **one rhinoceros character**. The character's identity stays
constant; the role, attire, and context change.

| Aspect | HEAVIX role | MEKANIX role |
|--------|-------------|--------------|
| Function | Brand representative, platform guide | Technical specialist, machinery expert |
| Domain | Platform features, onboarding, coordination | Inspection, maintenance, machinery knowledge |
| Typical location | Admin panels, dashboards, marketing | Inspection guides, service pages, education |
| Attire cue | Industrial black/orange, coordinator badge | Industrial black/orange, technician tools |

This shared identity keeps the brand coherent while letting the character serve
two clearly differentiated functions.

---

## 3. The HEAVIX Role

The HEAVIX role is the brand representative and platform guide.

### 3.1 Responsibilities

- Welcome new sellers and buyers to the platform.
- Introduce platform features (Store Center sections, showroom, financing
  referrals).
- Guide onboarding flows (see Store Center §9 Heavix Business Assistant).
- Coordinate between sections ("now go to Inventory to add your first machine").
- Explain error states in friendly language.
- Surface in marketing and campaign materials as the brand face.

### 3.2 Typical Surfaces

- Seller onboarding checklist.
- Empty-state illustrations across Store Center sections.
- Error and validation messages (with appropriate alt text).
- Marketing landing pages and email headers.
- Platform-level announcements.

---

## 4. The MEKANIX Role

The MEKANIX role is the technical specialist and machinery expert.

### 4.1 Responsibilities

- Guide inspection workflows (alongside, never replacing, the `Inspection` model
  output).
- Explain machine specifications and condition concepts.
- Walk through maintenance guides and service schedules.
- Provide educational content on machinery categories.
- Surface in service-request flows and rental operations.

### 4.2 Typical Surfaces

- Inspection booking and report pages.
- Machine Passport educational tooltips.
- Service and maintenance guides.
- Rental listing and booking flows (used-equipment context).
- Educational articles in the knowledge base.

---

## 5. Design Direction (Conceptual)

The direction below is product intent for the illustration team, not a final
specification.

### 5.1 Character

- **Species:** Rhinoceros — chosen for power, steadiness, and a prominent horn
  that maps naturally to the HEAVIX brand orange.
- **Build:** Powerful, grounded, friendly-but-not-childish.
- **Horn:** Prominent, rendered in HEAVIX orange — the brand anchor.
- **Expression range:** Confident, focused, approachable, curious, helpful.

### 5.2 Attire

- **Palette:** Industrial black and HEAVIX orange (brand-consistent).
- **HEAVIX role:** Coordinator-style attire — clean, badge-accented.
- **MEKANIX role:** Technician-style attire — tool-accented, inspection clipboard
  or handheld scanner as a prop where appropriate.

### 5.3 Pose Library (Conceptual)

| Pose | Use |
|------|-----|
| Welcome (open gesture) | Onboarding, landing |
| Pointing (to UI element) | Inline guides |
| Thinking (chin on hand) | Suggestions, tips |
| Reading (clipboard) | Inspection, dossier contexts |
| Thumbs-up (confirmation) | Success states |
| Caution (hand raised) | Warnings, boundary reminders |

---

## 6. Character Asset System

The mascot is delivered as a structured asset system so it can be reused across
surfaces without bespoke illustration per use.

### 6.1 Asset Dimensions

| Dimension | Values | Notes |
|-----------|--------|-------|
| Role | HEAVIX | MEKANIX | Drives attire and prop |
| Expression | welcome, focused, approachable, curious, helpful, cautious | Conceptual set |
| Pose | welcome, pointing, thinking, reading, thumbs-up, caution | Conceptual set |
| Equipment variant | none, clipboard, scanner, tablet | Per surface need |
| Format | SVG (primary), PNG (fallback), Lottie (motion, later phase) | SVG preferred for crispness |
| Size tokens | sm (24px), md (40px), lg (72px), xl (160px) | Tailwind-friendly |

### 6.2 Asset Naming (conceptual)

```
mascot/{role}/{pose}-{expression}-{equipment?}-{size}.svg
```

Example: `mascot/heavix/welcome-helpful-md.svg`,
`mascot/mekanix/reading-focused-clipboard-lg.svg`.

The exact naming is finalized by the design system; this document requires only
that assets be **systematically named and tokenizable**, not one-off files.

---

## 7. Usage Guidelines

### 7.1 Where the Mascot Appears

| Surface | Role | Purpose |
|---------|------|---------|
| Seller onboarding | HEAVIX | Step-by-step guidance |
| Form guides | HEAVIX | Inline help |
| Error explanations | HEAVIX | Friendly framing |
| Empty states | HEAVIX | "Nothing here yet" |
| Inspection pages | MEKANIX | Workflow guide |
| Maintenance guides | MEKANIX | Educational |
| Campaigns | HEAVIX | Brand face |
| Service guides | MEKANIX | Procedural help |

### 7.2 Where the Mascot Does NOT Appear

- ❌ Legal disclaimers and risk disclosures (must be plain text, authoritative).
- ❌ Financing/credit decision screens (no mascot near credit outcomes).
- ❌ Investment opportunity disclosures (no mascot near fund decisions).
- ❌ Any screen where a friendly character could trivialize a serious risk.

---

## 8. Boundaries (Critical)

The mascot **guides; humans decide.** Specifically:

1. **Mascot ≠ inspection report.** The MEKANIX role may walk a seller through an
   inspection workflow, but the inspection record comes from the
   `Inspection` model and a real inspector. The mascot never replaces it.
2. **Mascot ≠ credit decision.** The HEAVIX role may guide a buyer to the
   financing application, but the decision comes from the financing partner
   (see `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md`). The mascot never
   represents an approval.
3. **Mascot ≠ definitive technical diagnosis.** The MEKANIX role may explain
   condition concepts, but a specific machine's condition comes from the
   `MachinePassport` and `Inspection` records, not from the mascot.
4. **Mascot ≠ investment advice.** The mascot never recommends participating in
   an investment opportunity or implies a yield outcome (see
   `docs/PRODUCT-MACHINERY-INVESTMENT.md`).
5. **Mascot copy is reviewed.** Any string spoken by the mascot is subject to
   the same prohibited-claims review as all platform copy.

---

## 9. Tone

The mascot's voice is:

- **Professional** — competent, not goofy.
- **Trustworthy** — direct, no over-promising.
- **Approachable** — warm, never cold or bureaucratic.
- **Concise** — short, scannable guidance, not paragraphs.

The mascot is **not**:

- Cartoonish or childish.
- Sarcastic or overly casual.
- Salesy or pushy.
- Apologetic to the point of undermining trust.

---

## 10. Accessibility

### 10.1 Alt Text

Every mascot image carries descriptive alt text that includes the role. Example:
*"HEAVIX mascot welcoming illustration: a rhinoceros in industrial orange and
black attire, open welcoming gesture."*

### 10.2 Screen Readers

- Decorative mascot appearances use `aria-hidden="true"` so screen readers skip
  them.
- Informational mascot appearances (where the mascot introduces a tip) carry
  alt text and an adjacent text equivalent.
- Mascot-only instructions are prohibited — every mascot tip has a text
  equivalent visible to assistive tech.

### 10.3 Cultural Sensitivity

- The rhinoceros is reviewed for cultural fit in HEAVIX's primary markets.
- Attire and props avoid regionally sensitive symbols.
- The character design review includes a cultural-sensitivity pass before final
  assets ship.

### 10.4 Motion

- Any animated mascot (Lottie, later phase) honors `prefers-reduced-motion`.
- Looping motion is gentle and brief; no flashing.

---

## 11. Implementation Phases

| Phase | Scope | Gate |
|-------|-------|------|
| P1 — Static guides | Static mascot illustrations in onboarding, empty states, error messages | Alt text + text equivalents verified |
| P2 — Interactive onboarding | Mascot-guided onboarding checklist with contextual tips (deterministic) | No LLM calls; tips are authored |
| P3 — AI-powered assistant | Mascot as the visual identity of the Heavix Business Assistant (Store Center §9), powered by AI Gateway `SELLER_ASSISTANT` task type | AI budget + moderation enforced |

### 11.1 Phase Notes

- **P1** is safe to ship with the design system's existing illustration slot.
- **P2** uses authored tip strings; no LLM cost; deterministic behavior.
- **P3** requires the AI Gateway `SELLER_ASSISTANT` policy and budget (already
  EXISTING in `AITaskPolicy`) and must respect the boundaries in §8 — the
  assistant never makes decisions, only guides.

---

## 12. Reuse from Existing Infrastructure

| Existing Asset | Reused For |
|----------------|------------|
| AI Gateway `SELLER_ASSISTANT` task type | P3 conversational assistant backbone |
| `AITaskPolicy` + `AIBudget` | P3 cost & rate governance |
| Action Engine audit | P3 assistant interaction logging |
| Existing illustration slots in shadcn/ui empty states | P1 static placement |
| HEAVIX brand orange / black palette | Mascot color direction |

---

## 13. Acceptance Criteria (Definition of Done — Design)

- [ ] Shared-identity concept documented (one character, two roles).
- [ ] HEAVIX role responsibilities and surfaces listed.
- [ ] MEKANIX role responsibilities and surfaces listed.
- [ ] Design direction is conceptual and explicitly non-final.
- [ ] Character asset system dimensions enumerated.
- [ ] Usage guidelines specify where mascot appears and does not appear.
- [ ] Boundaries explicitly separate mascot from inspection, credit,
  diagnosis, and investment advice.
- [ ] Tone defined; anti-patterns listed.
- [ ] Accessibility covers alt text, screen readers, cultural sensitivity,
  motion.
- [ ] Three implementation phases with gates.
- [ ] Reuse of existing AI Gateway infrastructure documented.

---

## 14. Prohibitions

- ❌ The mascot must never replace a real inspection report or technical
  diagnosis.
- ❌ The mascot must never represent or imply a credit decision.
- ❌ The mascot must never recommend investment participation or imply yield.
- ❌ The mascot must never appear on legal disclaimers or risk disclosures.
- ❌ The mascot must never use cartoonish or childish tone.
- ❌ The mascot must never appear without alt text or a text equivalent when
  conveying information.

---

## 15. Out of Scope

- Final illustration assets (owned by the illustration team).
- Brand-color hex values (owned by the design system).
- Marketing campaign creative (owned by marketing).
- Localization of mascot copy beyond English in this phase (owned by
  localization when added).
- Voice/audio for the mascot (not in scope for any current phase).

---

**End of document.**
