# HEAVIX Hero Reference — Cinematic Industrial Cards

Status: Design reference / implementation brief  
Scope: Homepage hero only. Do not redesign the global navigation or the rest of the site.

## Reference image
The original visual reference was supplied in the ChatGPT project conversation on 2026-11-12. This document preserves its visual specification. The source image itself is not embedded by this text-file operation.

## Non-negotiable product requirement
The existing homepage hero remains available as a selectable template. Add this concept as a second hero template (working name: `cinematic-industrial`). Never replace or delete the existing template. The owner/admin must be able to switch the active template in the administration/control panel. Switching templates must preserve each template's own saved configuration and content.

## Visual composition
- Wide, cinematic, dark industrial hero canvas with a full-bleed background image.
- The excavator in the background is a deliberate compositional anchor on the left. Its boom/bucket and machine silhouette visually overlap and continue into/behind the first feature card. This is a layered composition, not three unrelated image tiles.
- Three tall feature cards across the center: Exclusive, Featured Listings, Professional Services (labels are editable). Use carefully tuned glass/dark translucent surfaces, subtle metallic borders, restrained warm highlights, realistic reflections, layered depth, and premium spacing.
- Card imagery must harmonize with the shared background and may visually blend across card boundaries. Support independent image, focal point, overlay, title, subtitle, CTA label and CTA destination per card.
- Right-side live market/metrics panel: editable metric rows with icon, label, value, trend/delta, optional mini sparkline, visibility and ordering. Data should come from real platform metrics where available; never fabricate live values. Admin may configure source/label/visibility.
- Bottom search/filter dock integrated into the hero: search field, configurable filters (e.g. machine type, brand, model, province, price, year, condition), Rent/Buy/Service mode choices and CTA. Use existing marketplace search/filter logic; do not create a disconnected mock search.
- Palette: near-black/charcoal, graphite, restrained antique gold/champagne accents, cool industrial highlights. Typography crisp and legible.
- Match the reference's wide, premium, cinematic proportions while adapting responsively.

## Admin/owner controls
Provide a template selector with at least:
1. Current / existing hero
2. Cinematic Industrial (this reference)

For the Cinematic Industrial template, expose:
- enable/disable and active-template selection;
- background image and focal position, overlay strength, background scale/position;
- each card's image, image focal point, title, eyebrow, description, CTA, link, order and visibility;
- cross-card/background layering controls or safe presets so the excavator can extend behind/into card one without clipping;
- metrics panel visibility, title, rows, values/data source, trend, icon and order;
- search dock visibility, fields, labels, ordering, mode options and CTA;
- desktop/tablet/mobile visibility and layout behavior;
- preview/draft and publish workflow with validation.

All settings must be persisted through the existing HEAVIX settings/content architecture and protected by existing owner/admin authorization. Do not introduce a parallel settings store if the current one can be extended. Provide sensible defaults and graceful fallbacks for missing images/data.

## Responsive and accessibility requirements
- Desktop: preserve the complete composition and overlapping excavator/card relationship.
- Tablet: reflow cards and metrics without collisions; keep search usable.
- Mobile: stack/reorder cards, metrics and filters into a readable, touch-friendly layout; no horizontal overflow.
- Respect reduced-motion preferences. Maintain text contrast, keyboard access, labels and focus states.

## Engineering constraints
- Homepage hero only; leave navigation and unrelated page sections unchanged.
- Preserve existing hero implementation and its current configuration.
- Reuse existing upload/media storage, image optimization, marketplace search, metrics and admin authorization facilities.
- Do not hard-code sample metrics as live data.
- Avoid schema migrations unless required; if needed, make them additive and backward-compatible.
- Add tests for template selection, persistence, permissions, rendering/fallbacks and responsive behavior.
- Do not deploy to Production or change DNS as part of this task. Validate in Preview first.

## Acceptance criteria
1. Admin can switch between existing and Cinematic Industrial templates without data loss.
2. The new template closely matches the reference composition, especially the excavator/background continuing behind and into the first card.
3. Admin can edit all imagery, card content, metrics and search/filter configuration.
4. Search uses the real marketplace flow.
5. Existing hero remains selectable and visually unchanged when selected.
6. No fake live statistics; missing data has an explicit fallback.
7. Desktop/tablet/mobile layouts are usable and accessible.
8. Preview validation passes before any production release.
