# HEAVIX — Store Gap Domain Registry

> **Status:** Deferred (P2 — not started)
> **Date:** 2026-09-25
> **Track:** A1 — Store Gap Domains

## Purpose

This document registers the 7 Store Control Plane domains that have NO backend implementation. Each domain needs Schema → Service → API → Permission → UI → Audit → Tests to be considered Complete per the project DoD.

## Gap Domains

| # | Domain | Schema? | Service? | API? | Permission? | Admin UI? | Audit? | Tests? | Next Step |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Inventory** | ❌ (only `Part.stock` field) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Design: StockMovement model or accept stock-on-Part |
| 2 | **Returns** | ❌ (only `Payment.status=REFUNDED`) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Design: Return/RMA model or formalize inline refund path |
| 3 | **Suppliers** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Design: Supplier model + procurement flow |
| 4 | **Procurement** | ❌ | ❌ | ❌ (stub UI only) | ❌ | ⚠️ stub (587 LOC, no API) | ❌ | ❌ | Delete stub or implement backend |
| 5 | **Shipping** | ✅ `Shipment` (read-only) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Add write route + carrier integration |
| 6 | **Media** | ❌ (only `Part.images` JSON) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Design: Store-specific media or delegate to general admin |
| 7 | **SEO** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Design: Store-specific SEO or delegate to general admin |

## Priority

| Priority | Domain | Rationale |
|---|---|---|
| P1 | Procurement | Stub UI is misleading — must delete or implement |
| P1 | Shipping | Schema exists but unused — either wire or remove |
| P2 | Inventory | Stock management is core to store operations |
| P2 | Returns | Customer-facing — needed for complete order lifecycle |
| P3 | Suppliers | Depends on Procurement design |
| P3 | Media | May delegate to general admin media |
| P3 | SEO | May delegate to general admin SEO |

## Note

These domains are registered here to prevent them from being silently treated as "non-blocking". Each domain must have its own Scope Freeze → Implementation → Evidence → Regression → Track Gate when work begins.
