# Step 1 — Transaction types and commercial-intent compatibility

**Date:** 2026-11-23  
**Scope:** Listing wizard Step 1 and the V1.1 TransactionType seed  
**Status:** Immediate service-demand duplication corrected in PR #363; broader eight-intent rollout remains a separate compatibility phase.

## The three counts are different

| Layer | Count | Meaning |
|---|---:|---|
| Current V1.1 database seed before PR #363 | 6 | `SALE`, `RENT`, `WANTED`, `QUOTE`, `AUCTION`, `SERVICE_REQUEST` |
| V1.1 seed after PR #363 | 7 | Adds `SERVICE_OFFER` as the missing supply-side service type |
| Commercial-intent target in ADR-001 | 8 | Sale offer, purchase request, rental offer, rental request, service offer, service request, job offer, job seeker |

The seven legacy TransactionType keys are not the same thing as the eight canonical commercial intents. The first is the existing persistence/API vocabulary; the second is the intended user-facing intent model.

## Immediate Step 1 behavior

- `SERVICE_REQUEST` is a top-level service-demand flow.
- `SERVICE_OFFER` is a top-level service-supply flow.
- `WANTED` remains the legacy equipment-demand flow. Its existing buy/rent selection is preserved to avoid breaking stored BuyRequest rows.
- The duplicate `SERVICE_REQUEST` option nested inside `WANTED` is removed. A service request must not be represented as both a top-level transaction and a WANTED sub-intent.
- `QUOTE` and `AUCTION` remain supported legacy TransactionType keys during this phase.

## Compatibility mapping for the eight-intent target

| Canonical intent | Existing representation | Status |
|---|---|---|
| `SALE_OFFER` | `SALE` | Existing |
| `PURCHASE_REQUEST` | `WANTED` with legacy buy intent | Existing |
| `RENTAL_OFFER` | `RENT` | Existing |
| `RENTAL_REQUEST` | `WANTED` with legacy rent intent | Existing, still nested |
| `SERVICE_OFFER` | `SERVICE_OFFER` | Added to seed by PR #363 |
| `SERVICE_REQUEST` | `SERVICE_REQUEST` | Existing, now kept independent |
| `JOB_OFFER` | No compatible current transaction flow | Not implemented |
| `JOB_SEEKER` | No compatible current transaction flow | Not implemented |

`QUOTE` and `AUCTION` are procurement/transaction mechanisms, not additional commercial intents. They must remain available without being counted as sale/rent/service/job intents.

## Release gate

PR #363 changes code and the seed source only. It does not mutate the Preview database. The Preview will continue to expose six transaction rows until the existing taxonomy seed workflow is run against the verified Preview database after the required backup and target-identity checks. No schema migration is required for the immediate seventh key.

The later eight-intent UI rollout must preserve old `Listing.listingType`, `BuyRequest.intent`, RFQ and Auction records. It should use an explicit compatibility adapter rather than renaming or deleting legacy keys in place.
