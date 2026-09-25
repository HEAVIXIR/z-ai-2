# HEAVIX — Store + Marketplace Control Plane Summary

> **Status:** Layer A implementation COMPLETE. Batch Gate PENDING (deferred to joint runtime verification).
> **Date:** 2026-09-25
> **Baseline:** commit `562e5f7` (frozen)

---

## Architecture Position

The Store and Marketplace Control Planes are **independent, configurable admin layers** — NOT part of the Universal Resource Engine. Per project documents, each Control Plane is a separate layer with its own Schema, Service, API, Permission, UI, Audit, and Tests.

```
✅ Infrastructure — COMPLETE
✅ Control Plane (Phase 16, tag control-plane-baseline-16E) — FROZEN
🟡 Phase 6 / Price Intelligence — PAUSED at 6D (EVD-6D-01/02)
✅ Store Control Plane 1A-2D — Layer A COMPLETE
⏸️ Store 2E — Batch Gate PENDING
✅ Marketplace Control Plane 2A-2C — Layer A COMPLETE
⏸️ Marketplace 2E — Batch Gate PENDING
🔵 Page/Widget Builder — not started
🔵 SEO/Media/Content — not started
🔵 AI Control Plane — not started
🔵 Analytics/Observability — not started
🔵 Production Gate — not started
```

---

## Store Control Plane

### Domains (per project docs)
Catalog · Inventory · Orders · Payments · Customers · Pricing · Media · SEO · AI Import · Analytics · Settings · Audit

### Layer A Implementation (COMPLETE)

| Phase | Status | Evidence |
|---|---|---|
| 1A — Evidence Inventory | 🟢 | 20 models, 33 routes, 11 admin pages |
| 2A — Permission Wiring | 🟢 | 18/18 routes, 32 `requirePermission` calls (13 `store.read` + 19 `store.manage`) |
| 2B — Audit Hooks | 🟢 | 27 `logAudit` calls, 0 mutations without audit, 20 action keys |
| 2C — Contract Tests | 🟢 | 44 tests pass (no DB dependency) |
| 2D — Public UI | 🟢 | `@ts-nocheck` removed, tsc 0 errors, 34 UI tests |
| 2E — Batch Gate | ⏸️ | PENDING (runtime verification deferred) |

### Monitoring Stub
- `GET /api/admin/store/health` — DB connectivity + basic stats (parts, brands, categories, orders count)

---

## Marketplace Control Plane

### Domains (per project docs)
Listings · Products · Offers · Bids · Deals · Sellers · Deal Rooms · Messages · Documents

### Layer A Implementation (COMPLETE)

| Phase | Status | Evidence |
|---|---|---|
| 2A — Permission Wiring | 🟢 | 5 simple-auth routes, 10 `requirePermission` calls (product.read/create/update/delete + listing.read/update/delete/moderate) |
| 2B — Audit Hooks | 🟢 | 21 `logAudit` calls, 21 mutations, 0 gap |
| 2C — Type Safety | 🟢 | `@ts-nocheck` removed from 2 files, tsc 0 errors |
| Contract Tests | 🟢 | 12 tests pass |
| Batch Gate | ⏸️ | PENDING |

### Notes
- Dual-auth routes (`listings/route.ts`, `listings/[id]/route.ts`) already have RBAC for session users via `hasPermission` — untouched (no big refactor).
- 2 legacy `@ts-nocheck` files now type-safe (Prisma include casts applied).

### Monitoring Stub
- `GET /api/admin/marketplace/health` — DB connectivity + basic stats (listings, products, offers, bids count)

---

## Joint Batch Gate (Store + Marketplace) — PENDING

Per the Two-Layer Batch model, the Batch Gate runs ONCE for the whole batch, not per-phase. It covers:

| Gate Item | Status | Note |
|---|---|---|
| Runtime DB evidence | ⏸️ | Blocked by PGlite (EVD-6D-01/02 environment blocker) + tool outage |
| Monitoring | 🟡 | Health endpoints added (Layer A); runtime verification pending |
| Documentation | 🟢 | This doc + worklog entries (1A/2A/2B/2C/2D for Store; 2A/2B/2C for Marketplace) |
| Production Verification | ⏸️ | Deferred |

### Gate Verdict: ⏸️ OPEN

Implementation + structural evidence (tests, lint, tsc) are green. Runtime evidence is blocked by environment. Gate will be determined when:
1. A real PostgreSQL is available (resolves EVD-6D-01/02), OR
2. The PGlite bridge stabilizes enough for runtime smoke, OR
3. The user explicitly requests a different verification approach.

**78/90 contract tests passing does NOT auto-GREEN the Gate.** Per project principle: "Existence of API/tests is NOT Completion." The full DoD chain (Schema → Service → API → Permission → UI → Validation → Audit → Tests → Monitoring → Documentation → DONE) must have evidence.

---

## Frozen Baseline

- **Git commit:** `562e5f7`
- **.env:** `DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres?schema=public&connection_limit=1&pool_timeout=10` (frozen, do NOT change)
- **6D path:** untouched (price-engine.ts, pricing routes)
- **Control Plane config:** untouched (resources, authorization, action-engine)

---

## Operating Model

Per the **Two-Layer Batch model** (adopted 2026-09-25):
- **Layer A (Implementation):** code + lint + typecheck + contract tests + commit — done per-phase, fast
- **Layer B (Batch Gate):** runtime + monitoring + documentation + production verification — done ONCE per batch

This doc is part of the Documentation link in the DoD chain.
