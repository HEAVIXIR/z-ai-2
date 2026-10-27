# HEAVIX homepage — visual parity specification

## Reference

The owner-provided reference image shows the HEAVIX Persian marketplace homepage at desktop width. Treat the image as a visual target, not permission to invent product data or copy unverified assets.

## Required visual language

- Persian-first RTL layout with the HEAVIX brand in a floating, rounded, near-black navigation bar.
- Dark machinery photography behind the hero; use a strong black overlay so the headline remains readable.
- White headline with an orange-highlighted second line, rounded orange primary action, and a quiet outlined secondary action.
- Three compact machinery/service cards aligned opposite the headline.
- A dark, rounded search panel overlapping the lower edge of the hero.
- Orange is the primary accent; borders and secondary text remain low-contrast but readable.
- Keep desktop composition balanced and collapse to a usable vertical flow on mobile without horizontal overflow.
- Preserve the existing PageRenderer model: a published HOME page remains authoritative; the default layout is the fallback.

## Implementation in this change

- PageBuilder's hero widget now reuses the maintained homepage Hero component rather than a separate generic gradient-only implementation.
- The default homepage layout now provides the reference headline, action labels, slide images, and card image paths.
- The search panel is dark, rounded, responsive, and submits a real GET search to /listings using the existing q parameter. Its transaction buttons submit SALE, RENT, or featured=true.
- The hero stats column is omitted when no verified statistics are provided; fake counts must not be used to imitate the screenshot.
- PageBuilder's hero registry exposes the corresponding visual controls so saved layouts can be tuned without custom code.

## Acceptance checklist

- [ ] Compare a desktop screenshot against the owner reference at the same viewport.
- [ ] Verify the existing header and footer remain intact.
- [ ] Verify hero and search panel stack cleanly on mobile.
- [ ] Verify search submits q and each mode submits the intended existing listing filter.
- [ ] Verify missing image assets fail gracefully and do not create broken-image layout shifts.
- [ ] If a published HOME AdminPage exists, verify its saved layout is still rendered and can use the same Hero widget.
- [ ] Populate the right-side live-statistics panel only after a public, privacy-safe, read-only aggregate source and tests are approved.
- [ ] Do not claim pixel-perfect parity until screenshots and responsive checks have been reviewed.

## Migration boundary

This visual change does not import legacy ZIP contents wholesale. The legacy archive inventory contains incompatible UI/API contracts and scripts with database or asset side effects. Each remaining capability must be rewritten against current routes, canonical schemas, authorization, and tests in a separate reviewable change.
