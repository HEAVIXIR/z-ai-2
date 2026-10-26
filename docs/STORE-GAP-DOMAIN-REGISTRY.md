# HEAVIX — Store Gap Domain Registry

> **Status:** Reconciled against the Store Resource Completion Matrix and Store Prisma schema
> **Last updated:** 2026-10-25
> **Track:** A1 — Store Gap Domains
> **Primary evidence:** `docs/STORE-RESOURCE-MATRIX.md` (Batch C; 13 resources)
> **Schema evidence:** `prisma/store/schema.prisma`

## Purpose

This registry originally tracked seven Store Control Plane domains that lacked backend implementation. That snapshot became stale: the Store Resource Completion Matrix records implementation evidence for Inventory, Returns, Suppliers, Procurement, and Shipments, plus the shared Media and SEO delegation decisions.

This file is a **gap register**, not a historical snapshot. “Implemented” means repository-level implementation evidence exists; it does not mean real-PostgreSQL behavior, monitoring, or production readiness has been proven.

## Current Gap Domains

| # | Domain | Repository evidence | Status | Remaining work / gate |
|---|---|---|---|---|
| 1 | **Inventory** | `StockMovement`, `InventoryBalance`, and `Warehouse` models; `src/lib/store-inventory-service.ts`; `/api/admin/store/inventory`; `inventory.read/manage`; resource registry/admin UI; audit hooks, contract tests, and monitoring registry. See Resource Matrix §1–2. | **Implemented at Layer A; runtime gate open** | Prove stock-adjustment atomicity, movement/balance invariants, and consistency between warehouse balances and the public `Part.stock` snapshot against real PostgreSQL; capture monitoring evidence. |
| 2 | **Returns** | `Return` and `ReturnItem` models; `src/lib/store-returns-service.ts`; return and item API routes; `returns.read/manage`; registry/UI, audit hooks, contract tests, and monitoring. See Resource Matrix §3. | **Implemented at Layer A; runtime gate open** | Prove allowed lifecycle transitions, item-quantity rules, and refund/payment consistency against real PostgreSQL. Schema and code presence alone do not prove these invariants. |
| 3 | **Suppliers** | `Supplier` model and `src/lib/store-suppliers-service.ts`; list/create/update/delete routes; permission checks, registry/UI, audit, contract tests, and monitoring. The schema also has optional `supplierId` relations on `ProcurementRequest` and `PurchaseOrder`. See Resource Matrix §7 and the Store schema. | **CRUD implemented; linkage behavior unverified** | Verify runtime behavior and tests for supplier selection on procurement requests and purchase orders. Do not claim a direct Supplier–Part join: no `SupplierPart` model is evidenced in the reviewed schema. |
| 4 | **Procurement** | `ProcurementRequest`, `PurchaseOrder`, and `PurchaseOrderItem` models; `src/lib/store-procurement-service.ts`; admin procurement API; `procurement.read/manage`; registry/UI, validation, audit, contract tests, and monitoring. See Resource Matrix §4. | **Implemented at Layer A; runtime gate open** | Prove procurement and purchase-order transitions, partial receiving, and any stock side effects against real PostgreSQL. |
| 5 | **Shipping / Shipments** | `Shipment` and `ShipmentTracking` models; `src/lib/store-shipments-service.ts`; admin shipment routes; `shipping.read/manage`; registry/UI, audit/contract coverage, and monitoring. See Resource Matrix §13. | **Internal implementation present; carrier integration not evidenced** | Verify shipment state transitions and append-only tracking history in a real DB. Scope and prove any external carrier integration separately before claiming it exists. |
| 6 | **Media** | Shared admin Media uses `Part.images`, `/admin/media`, and `/api/admin/upload`; no duplicate Store Media model is proposed. | **Delegated** | Preserve the shared upload permission/audit boundary. Add a Store-specific media subsystem only if a new explicit decision supersedes this delegation. |
| 7 | **SEO** | Shared admin SEO at `/admin/seo` and `/api/admin/seo/*`; no duplicate Store SEO model is proposed. | **Delegated** | Verify shared SEO metadata consumption by public Store routes during the broader runtime gate. |

## Priority After Reconciliation

| Priority | Work item | Rationale |
|---|---|---|
| P1 | **Store + Marketplace joint runtime/monitoring gate** | Repository and CI evidence does not close the documented real-PostgreSQL verification gate. |
| P1 | **Inventory / Returns / Procurement invariants** | Stock, refund, purchasing, and receiving behavior must be tested transactionally, not inferred from static contract tests. |
| P2 | **Shipment lifecycle and carrier boundary** | Verify internal transitions and tracking; treat carrier integration as unproven until concrete code and tests establish it. |
| P2 | **Supplier linkage behavior** | Schema relations exist for procurement requests and purchase orders, but runtime behavior and test coverage still need verification. |
| P3 | **Shared Media / SEO regression checks** | Preserve delegated ownership and avoid duplicate models or pipelines. |

## Evidence and Gate Rules

- The Store Resource Completion Matrix is the repository implementation inventory for the 13 registered resources. Keep this registry consistent with the matrix and `prisma/store/schema.prisma`.
- The matrix itself records a `DATABASE_URL` environment blocker and describes contract tests as static/code-inspection based. Therefore, do not label these domains runtime-verified on the strength of schema, code, contract tests, or green CI alone.
- CI provisioning PostgreSQL 17 and running configured suites is useful automated evidence, but it does not by itself prove all domain invariants, live monitoring, or production readiness.
- Re-run CI on the updated PR head and review the result before treating this documentation reconciliation as validated.
- Keep Issue #81 open until its required real-PostgreSQL behavioral results, safe redacted evidence, monitoring observations, and recovery/rollback evidence are captured and reviewed.
- Do not connect to staging or production, run a backfill, execute Phase D/E, or perform a production deployment as part of this documentation change.
- Do not create duplicate Store Media or Store SEO domains; the delegation decisions below remain in force.

## Media — Delegation Decision (T2-W1-B)

**Decision:** Store media is delegated to the general admin Media layer. No Store-specific Media model is created.

**Rationale:**
- `Part.images` stores part image URLs.
- The general `/admin/media` page and `/api/admin/upload` endpoint cover shared upload and URL-copy workflows.
- A duplicate Store Media model would conflict with the existing upload pipeline and Universal Resource Engine.

**Operational note:** When adding or editing a `Part`, use image URLs from `/admin/media`. There is no separate Store media library.

## SEO — Delegation Decision (T2-W1-C)

**Decision:** Store SEO is delegated to the general admin SEO layer. No Store-specific SEO model is created.

**Rationale:**
- The general `/admin/seo` page provides shared metadata, OpenGraph, sitemap, robots, structured-data, and related SEO workflows.
- A duplicate Store SEO domain would re-implement infrastructure owned by the shared layer.
- Public Store routes are intended to consume shared SEO helpers; the public-route integration still needs runtime verification.

**Operational note:** Manage Store metadata through `/admin/seo`; verify public-route integration as part of the joint runtime gate.

## Change Control

Every newly discovered gap must follow: Scope Freeze → Implementation → Evidence → Regression → Track Gate. Update this registry and the resource matrix together when implementation status changes. Preserve the distinction between **implemented**, **runtime-verified**, and **production-approved**.
