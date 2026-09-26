# HEAVIX — Store Gap Domain Registry

> **Status:** Living document — updated as gap domains are implemented or delegated
> **Last updated:** 2026-09-26 (T2-W1)
> **Track:** A1 — Store Gap Domains

## Purpose

This document registers the 7 Store Control Plane domains that had NO backend implementation. Each domain needs Schema → Service → API → Permission → UI → Audit → Tests to be considered Complete per the project DoD.

## Gap Domains

| # | Domain | Schema? | Service? | API? | Permission? | Admin UI? | Audit? | Tests? | Status / Next Step |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Inventory** | ❌ (only `Part.stock` field) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Open — Design: StockMovement model or accept stock-on-Part |
| 2 | **Returns** | ❌ (only `Payment.status=REFUNDED`) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Open — Design: Return/RMA model or formalize inline refund path |
| 3 | **Suppliers** | ✅ `Supplier` (T2-W1-A) | n/a (thin) | ✅ (T2-W1-A) | ✅ store.read/manage | ✅ /admin/store/suppliers | ✅ store.supplier.{create,update,delete} | ✅ contract counts updated | **DONE T2-W1-A** — procurement join (SupplierPart) deferred to T2-W2 |
| 4 | **Procurement** | ❌ | ❌ | ❌ (stub UI only) | ❌ | ⚠️ stub (587 LOC, no API) | ❌ | ❌ | Open — Delete stub or implement backend |
| 5 | **Shipping** | ✅ `Shipment` (read-only) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Open — Add write route + carrier integration |
| 6 | **Media** | ✅ delegated (`Part.images` JSON) | n/a | ✅ `/api/admin/upload` | ✅ via upload perms | ✅ `/admin/media` | ✅ via upload audit | n/a | **DELEGATED T2-W1-B** — see "Media — Delegation Decision" below |
| 7 | **SEO** | ✅ delegated (general admin) | n/a | ✅ `/api/admin/seo/*` | ✅ via SEO perms | ✅ `/admin/seo` | ✅ via SEO audit | n/a | **DELEGATED T2-W1-C** — see "SEO — Delegation Decision" below |

## Priority

| Priority | Domain | Rationale |
|---|---|---|
| P1 | Procurement | Stub UI is misleading — must delete or implement |
| P1 | Shipping | Schema exists but unused — either wire or remove |
| P2 | Inventory | Stock management is core to store operations |
| P2 | Returns | Customer-facing — needed for complete order lifecycle |
| ~~P3~~ | ~~Suppliers~~ | ✅ Implemented T2-W1-A — CRUD + audit + UI + tests |
| ~~P3~~ | ~~Media~~ | ✅ Delegated T2-W1-B — uses general `/admin/media` |
| ~~P3~~ | ~~SEO~~ | ✅ Delegated T2-W1-C — uses general `/admin/seo` |

## Media — Delegation Decision (T2-W1-B)

**Decision:** Store media is delegated to the general admin Media layer. No
store-specific Media model is created.

**Rationale:**
- `Part.images` (JSON string, default `"[]"`) already stores part image URLs.
- The general `/admin/media` page (file-system browser of `/public/uploads/`)
  + the general `/api/admin/upload` endpoint already cover the upload + URL
  copy workflow for every admin domain, including the store.
- A duplicate store-specific Media model would conflict with the existing
  upload pipeline and the Universal Resource Engine (which is out of scope
  per the Wave-1 critical constraints — DO NOT touch Universal Resource
  Engine).

**Operational note for store admins:** When adding/editing a `Part`, paste
image URLs from `/admin/media` into the part's image picker. There is no
separate "store media library" — the media library is shared across all
admin domains.

## SEO — Delegation Decision (T2-W1-C)

**Decision:** Store SEO is delegated to the general admin SEO layer. No
store-specific SEO model is created.

**Rationale:**
- The general `/admin/seo` page (`SEOAdminClient`) already provides advanced
  SEO automation: page-level meta, OpenGraph, sitemap, robots, schema.org
  structured data, content decay tracking, and hot-searches integration.
- A duplicate store-specific SEO domain would re-implement meta/sitemap
  infrastructure that the general layer already owns.
- The store's public pages (`/store`, `/store/parts/[id]`, etc.) consume the
  general SEO layer — there is no store-specific sitemap or robots.txt.

**Operational note for store admins:** Store page metadata (title,
description, OG tags, structured data) is managed centrally from
`/admin/seo`. Store routes already render the shared `<head>` metadata
helpers — no store-specific SEO admin page is needed.

## Note

These domains are registered here to prevent them from being silently treated
as "non-blocking". Each domain must have its own Scope Freeze →
Implementation → Evidence → Regression → Track Gate when work begins.

