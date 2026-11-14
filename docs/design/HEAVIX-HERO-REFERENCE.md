# HEAVIX Hero — Visual Reference & Implementation Brief

> Status: approved visual direction / reference-only. Scope is the homepage HERO section only. Do not redesign the global header, navigation, footer, or the rest of the website from this reference.

## Reference image
Original user-provided reference: `1000572653.jpg` (uploaded in the HEAVIX project conversation, 1536×512).
The reference image must be kept alongside this document in the repository as:
`docs/design/references/heavix-hero-reference.jpg`
If that binary asset is not present yet, do not substitute a generated approximation and do not claim it has been archived.

## Design intent
Recreate the composition and visual language with high fidelity, not a generic dark dashboard. The hero should feel like one continuous cinematic industrial scene, with layered image composition, premium dark glass/metal surfaces, restrained gold accents, fine borders, and realistic depth.

## Composition (desktop)
1. Full-width, dark cinematic industrial background with a large excavator / backhoe scene concentrated on the left and lower-left. Use realistic heavy-equipment photography/rendering, atmospheric depth, warm work lights, subtle haze, and dark charcoal/black grading.
2. Three prominent feature cards across the central area:
   - **Exclusive**: excavator / backhoe imagery. This card is visually integrated with the large background excavator scene.
   - **Featured Listings**: large mining dump truck in a rugged quarry / mountain environment.
   - **Professional Services**: industrial facility with a worker wearing appropriate PPE and heavy machinery.
3. **Critical image-continuity detail:** the excavator image must visually cross the boundary between the large hero background and the first Exclusive card. It should read as one continuous scene, not as a background image plus an unrelated card thumbnail. Use coordinated image crops, layered media, controlled overlap/masking, and carefully aligned focal points. Preserve believable machine geometry; do not crop the excavator into disconnected fragments.
4. A tall, narrow **live market statistics panel** on the far right: four compact metric rows, each with a small icon, label, large value, miniature sparkline, and restrained gold/green change indicator. Keep it visually subordinate to the three feature cards.
5. A wide, low **search/filter bar** anchored along the bottom of the hero, with a dark translucent glass surface, fine border, subtle shadow, and warm gold search CTA. Include compact controls for keyword, machine type, brand, model, province/location, price, year, and condition, plus intent choices such as Rent / Buy / Service where supported by the existing product.
6. Maintain a balanced horizontal rhythm and generous but controlled spacing. The feature cards should feel tall and premium, with subtle corner radii, fine metallic borders, internal gradients for text legibility, and restrained hover/focus states.

## Visual language
- Palette: near-black / charcoal, cool steel-blue shadows, warm amber work lights, muted champagne-gold accents, and restrained neutral typography.
- Materials: smoked glass, brushed/dark metal, delicate edge highlights; avoid thick borders, loud gradients, excessive glow, or bright SaaS-style colors.
- Lighting: cinematic practical lights, subtle volumetric atmosphere, strong focal contrast, realistic reflections.
- Typography: elegant, high-contrast headings; compact readable metadata; consistent alignment.
- Cards: image-led, edge-to-edge photography, layered dark gradient overlays only where needed for legibility.

## Responsive behavior
- Preserve the same visual hierarchy on tablet and mobile. Reflow cards and stats without horizontal overflow; move stats below/above cards as appropriate; make search filters horizontally scrollable or stack them accessibly. Do not shrink desktop composition until text becomes unreadable.
- Respect reduced-motion preferences. Use subtle transitions only; no distracting parallax or perpetual animation.

## Functional constraints
- This is a visual and UX treatment of the HERO only. Preserve existing HEAVIX routes, search behavior, filter semantics, authentication, localization, and data contracts. Do not invent live metrics: bind statistics to real available data or clearly label demo values.
- Reuse existing project components, tokens, and assets where suitable. Do not modify global navigation or unrelated page sections.
- Ensure accessible labels, keyboard focus, contrast, and responsive image loading.

## Implementation prompt
Build a high-fidelity HEAVIX homepage hero inspired by the reference image archived at `docs/design/references/heavix-hero-reference.jpg`. Match its cinematic industrial art direction and exact composition: a continuous full-width excavator scene on the left/lower background; three tall image-led glass/metal cards (Exclusive with excavator, Featured Listings with mining dump truck, Professional Services with PPE-wearing worker and industrial equipment); a compact live-market statistics panel on the right with four metric rows and sparklines; and a wide bottom search/filter bar with a gold CTA. The most important detail is the seamless visual bridge between the large background excavator and the first Exclusive card: align the same scene/crop and layer/mask it so the machine appears to continue from the background into the card. Use premium charcoal, smoked-glass, steel, and restrained champagne-gold styling, realistic imagery, fine borders, subtle highlights, and carefully controlled spacing. Implement only the hero section; do not copy or redesign the header/navigation or any other site section. Preserve all existing HEAVIX functionality, routes, data contracts, and responsive/accessibility behavior. Before coding, inspect the current hero and existing design system; then implement the smallest focused change and verify desktop/tablet/mobile layouts.
