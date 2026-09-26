# HEAVIX — Production Readiness Checklist

> **Status:** T5-W1 — Observability Inventory + Production Checklist
> **Baseline:** 0dd5b0a (299 tests, tsc 0, lint 0)
> **Date:** 2026-09-25

---

## 1. Observability Inventory

### What exists

| Component | Status | Evidence |
|---|---|---|
| Health endpoints | ✅ | `/api/health`, `/api/admin/store/health`, `/api/admin/marketplace/health`, `/api/pricing/health` |
| Error tracking | 🟡 | `src/lib/error-tracking.ts` — `trackError()` writes to console + AuditLog. Only 4 routes call it. |
| Logging | 🟡 | `console.error`/`console.warn` structured payloads. No structured logger (pino/winston). |
| Metrics / APM | ❌ | No `/api/metrics`, no Prometheus, no OpenTelemetry, no Sentry. |
| Request context | 🟡 | `src/lib/request-context.ts` — IP + UA extraction. `requestId` captured by audit-foundation only. |

### What's missing

- **Metrics endpoint** — no `/api/metrics` for Prometheus scraping
- **APM/Sentry** — no error monitoring SaaS integration
- **Structured logger** — no pino/winston, no log levels, no request ID propagation
- **`trackError` coverage** — only 4 of ~250 routes call it
- **Latency tracking** — no request duration metrics
- **Dashboard** — no Grafana/dashboard for operational metrics

---

## 2. Production Readiness Checklist

### Infrastructure

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | PostgreSQL runtime | ✅ | pgsrc/*.deb extracted, running on 5432 |
| 2 | Schema pushed | ✅ | 119 tables (main) + 21 tables (store) |
| 3 | Seeds run | ✅ | 238 categories, 197 brands |
| 4 | .env frozen | ✅ | Baseline 562e5f7, matches |
| 5 | Git clean | ✅ | HEAD synced to GitHub |

### Security

| # | Item | Status | Notes |
|---|---|---|---|
| 6 | middleware.ts | ✅ | Edge auth boundary (Track E) |
| 7 | CSRF defense | ✅ | `src/lib/csrf.ts` (permissive, documented) |
| 8 | XSS sanitizer | ✅ | `src/lib/sanitize.ts` |
| 9 | Rate limiting | 🟡 | In-memory, 5/7 presets wired |
| 10 | RBAC | ✅ | 71+ permission keys, 5 roles, enforced |
| 11 | @ts-nocheck | ✅ | 0 in admin routes (12 removed), 1 in page.tsx (legacy) |

### Application

| # | Item | Status | Notes |
|---|---|---|---|
| 12 | Store CP | ✅ | 2A-2D complete, AuditLog single-source |
| 13 | Marketplace CP | ✅ | 2A-2C complete, permissions wired |
| 14 | Page Builder | ✅ | Backend + admin UI + POST_version fixed |
| 15 | Homepage | 🟡 | Legacy fallback, PageRenderer ready (not fully wired) |
| 16 | Page Builder admin | ✅ | /admin/pages list page |

### Testing

| # | Item | Status | Notes |
|---|---|---|---|
| 17 | Contract tests | ✅ | 99/99 PASS |
| 18 | E2E tests | ✅ | 16/16 PASS (vitest.e2e.config.ts) |
| 19 | Security tests | ✅ | 184/184 PASS (vitest.security.config.ts) |
| 20 | Total tests | ✅ | 299 |
| 21 | Runtime smoke | ✅ | Root 200, Listings 200, Store 200, Health 200 |

### Observability

| # | Item | Status | Notes |
|---|---|---|---|
| 22 | Health endpoints | ✅ | Store + Marketplace + general |
| 23 | Error tracking | 🟡 | trackError in 4 routes — needs broader coverage |
| 24 | Metrics | ❌ | No Prometheus/APM |
| 25 | Structured logging | ❌ | No pino/winston |
| 26 | Dashboard | ❌ | No operational dashboard |

### Documentation

| # | Item | Status | Notes |
|---|---|---|---|
| 27 | Project docs | ✅ | 50+ files in docs/ |
| 28 | Gate docs | ✅ | 6 files in docs/gates/joint-batch/ |
| 29 | Worklog | ✅ | 8000+ lines |
| 30 | Gap registry | ✅ | docs/STORE-GAP-DOMAIN-REGISTRY.md |

---

## 3. Final Production Gate Criteria

For the project to be considered **Production Ready**:

### Must Pass (🔴 blocking)
- [x] PostgreSQL runtime operational
- [x] Schema pushed + seeds run
- [x] tsc 0 errors
- [x] lint 0 errors
- [x] 299 tests PASS
- [x] Runtime smoke (root, store, listings, health)
- [x] Auth boundary (middleware + per-route)
- [x] RBAC enforced (71+ permissions)
- [x] AuditLog single-source (Store + Marketplace)
- [x] Store/Marketplace CP Layer A complete

### Should Pass (🟡 recommended)
- [ ] Homepage wired to PageRenderer (currently legacy fallback)
- [ ] `trackError` coverage > 50% of routes (currently 4/~250)
- [ ] Structured logger (pino/winston)
- [ ] Metrics endpoint (`/api/metrics`)

### Nice to Have (🟢 future)
- [ ] Prometheus/Grafana dashboard
- [ ] Sentry/APM integration
- [ ] Real browser E2E (Playwright/Cypress)
- [ ] Performance benchmarks
- [ ] Load testing
- [ ] Store gap domains (Inventory, Returns, Procurement, Shipping)
- [ ] Marketplace partial domains (Conversations, Verification, Moderation, Matching)

---

## 4. Wave Plan

| Wave | T2 Store | T3 Marketplace | T5 Production |
|---|---|---|---|
| **W1 (current)** | ✅ Suppliers + Media/SEO delegation | ✅ Sellers + Disputes | ✅ This checklist |
| **W2** | Inventory + Returns + Procurement | Verification + Moderation | Metrics + Error tracking + E2E |
| **W3** | Shipping integration | Conversations + Matching | Performance + Security hardening |
| **W4** | T2 Gate | T3 Gate | T5 Gate → Joint Regression → Production Gate → DONE |
