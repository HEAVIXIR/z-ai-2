# HEAVIX — Store Gap Domain Registry

> **Status:** Reconciled against the current Store Resource Completion Matrix
> **Last updated:** 2026-10-25
> **Track:** A1 — Store Gap Domains
> **Primary evidence:** `docs/STORE-RESOURCE-MATRIX.md` (Batch C; 13 resources)

## Purpose

This registry originally tracked seven Store Control Plane domains that lacked backend implementation. The original table became stale: the later Store Resource Completion Matrix documents schema, service, API, permission, admin UI, validation, audit, tests, monitoring, and documentation for Inventory, Returns, Procurement, and Shipments as well as Suppliers.

This file is now a **gap register**, not a historical snapshot. Statuses below distinguish implementation evidence from the still-open runtime/batch gate. A row is not production-complete merely because code or contract tests exist.

## Current Gap Domains

| # | Domain | Current implementation evidence | Status | Remaining work / gate |
|---|---|---|---|---|
| 1 | **Inventory** | `StockMovement` / `InventoryBalance` schema; `src/lib/store-inventory-service.ts`; `/api/admin/store/inventory`; `inventory.read/manage`; Store resource registry and admin UI; audit hooks; contract coverage; monitoring registry. See Resource Matrix §1. | **Implemented at Layer A; runtime gate open** | Verify real PostgreSQL behavior for stock adjustment, movement atomicity, and balance invariants; capture monitoring evidence. |
| 2 | **Returns** | `Return` / `ReturnItem` schema; `src/lib/store-returns-service.ts`; GET/POST and item GET/PATCH routes; `returns.read/manage`; resource registry/UI, audit, contract coverage, and monitoring. See Resource Matrix §3. | **Implemented at Layer A; runtime gate open** | Verify return lifecycle transitions, item quantities, and refund/payment consistency against real PostgreSQL. |
| 3 | **Suppliers** | `Supplier` schema and `src/lib/store-suppliers-service.ts`; list/create/update/delete routes; permission checks, resource registry/UI, audit, contract coverage, and monitoring. See Resource Matrix §7. | **CRUD implemented; relationship scope needs confirmation** | Separately verify whether supplier-to-part/procurement linkage is implemented and tested; do not infer this from Supplier CRUD alone. |
| 4 | **Procurement** | `ProcurementRequest` schema; `src/lib/store-procurement-service.ts`; admin API, `procurement.read/manage`, resource registry/UI, validation, audit, contract coverage, and monitoring. See Resource Matrix §4. | **Implemented at Layer A; runtime gate open** | Verify procurement state transitions and purchase-order/stock side effects with real PostgreSQL. |
| 5 | **Shipping / Shipments** | `Shipment` schema; `src/lib/store-shipments-service.ts`; admin shipment routes, permissions, registry/UI, audit/contract coverage, and monitoring as recorded in Resource Matrix §13. | **Implementation present; external carrier integration not evidenced here** | Verify shipment state transitions and tracking history in a real DB; separately scope any carrier integration before claiming it exists. |
| 6 | **Media** | Delegated to shared admin Media: `Part.images`, `/admin/media`, and `/api/admin/upload`; no duplicate Store Media model. | **Delegated** | Maintain the shared upload permission/audit boundary; no Store-specific media subsystem unless a new decision supersedes this one. |
| 7 | **SEO** | Delegated to shared admin SEO at `/admin/seo` and `/api/admin/seo/*`; no duplicate Store SEO model. | **Delegated** | Verify shared SEO metadata consumption for public Store routes during the broader runtime gate. |

## Priority After Reconciliation

| Priority | Work item | Rationale |
|---|---|---|
| P1 | **Store + Marketplace joint Batch Gate** | The resource matrix records Layer A evidence, but the documented joint runtime/monitoring/production-verification gate remains open. |
| P1 | **Inventory / Returns / Procurement runtime invariants** | These domains affect stock, refunds, and purchasing state; static contract tests are not enough to establish transaction behavior. |
| P2 | **Shipment lifecycle and carrier boundary** | Verify the internal shipment workflow; treat carrier integration as unimplemented unless concrete code and tests prove otherwise. |
| P2 | **Supplier-to-part/procurement relationship** | Supplier CRUD does not by itself prove procurement linkage. Verify before closing this sub-scope. |
| P3 | **Shared Media / SEO regression checks** | Keep delegated ownership and avoid parallel models or duplicate pipelines. |

## Evidence and Gate Rules

- The current Store Resource Completion Matrix is the implementation inventory for the 13 registered Store resources. This registry must not contradict it without newer code evidence.
- Contract tests are structural/contract evidence; they do not independently prove transaction semantics, live monitoring, or production readiness.
- The repository CI workflow provisions PostgreSQL 17, pushes both main and Store schemas, and runs the configured test suites. A green CI run is useful evidence, but it does not automatically close the documented joint Store/Marketplace runtime and production-verification gate.
- Do not connect to staging or production, run a backfill, or perform a production deployment as part of this documentation reconciliation.
- Do not create a duplicate Store Media or Store SEO domain; the accepted delegation decisions below remain in force.

## Media — Delegation Decision (T2-W1-B)

**Decision:** Store media is delegated to the general admin Media layer. No store-specific Media model is created.

**Rationale:**
- `Part.images` (JSON string, default `"[]"`) already stores part image URLs.
- The general `/admin/media` page and `/api/admin/upload` endpoint cover upload and URL-copy workflows for every admin domain, including the Store.
- A duplicate Store-specific Media model would conflict with the existing upload pipeline and Universal Resource Engine.

**Operational note:** When adding/editing a `Part`, use image URLs from `/admin/media`. There is no separate Store media library.

## SEO — Delegation Decision (T2-W1-C)

**Decision:** Store SEO is delegated to the general admin SEO layer. No store-specific SEO model is created.

**Rationale:**
- The general `/admin/seo` page provides shared page metadata, OpenGraph, sitemap, robots, structured-data, and related SEO workflows.
- A duplicate Store SEO domain would re-implement infrastructure already owned by the general layer.
- Public Store pages consume shared SEO helpers; no separate Store sitemap or robots subsystem is claimed here.

**Operational note:** Manage Store metadata through `/admin/seo`; verify the public-route integration as part of the joint runtime gate.

## Change Control

Every newly discovered gap must follow: Scope Freeze → Implementation → Evidence → Regression → Track Gate. Update this registry and the resource matrix together when implementation status changes. Preserve the distinction between **implemented**, **runtime-verified**, and **production-approved**.
