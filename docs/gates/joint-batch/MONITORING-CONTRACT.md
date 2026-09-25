# HEAVIX — Store + Marketplace Monitoring Contract

## Purpose

این سند Monitoring را از Runtime Smoke جدا می‌کند. Smoke ثابت می‌کند مسیر اجرا می‌شود؛ Monitoring ثابت می‌کند وضعیت عملیاتی قابل مشاهده و قابل تشخیص است.

---

## Minimum monitoring contract

### Health
- Store health endpoint exists.
- Marketplace health endpoint exists.
- Health response must be deterministic and machine-readable.
- Health checks must not mutate business data.

---

## Operational signals

At minimum, monitoring should expose or record:

```text
API availability
Error rate
Latency
Database connectivity
Failed mutations
Audit failures
Authentication/authorization failures
```

### Store-specific signals
- Store API failures
- Order mutation failures
- Payment mutation failures
- Inventory mutation failures
- Audit write failures

### Marketplace-specific signals
- Listing mutation failures
- Offer/deal failures
- Moderation/rejection failures
- Audit write failures

---

## Monitoring evidence

A monitoring item is not COMPLETE because an endpoint exists.

Evidence must show:
- endpoint responds;
- response shape is valid;
- failure condition is observable;
- signal is attributable to Store or Marketplace;
- no business mutation is required to test health.

---

## Current status

- Health endpoints: PRESENT
- Monitoring contract: DOCUMENTED
- Operational dashboards/alerts: NOT YET VERIFIED

Therefore Monitoring remains PARTIAL until runtime/operational evidence is collected.
