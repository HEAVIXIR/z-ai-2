# HEAVIX — Store + Marketplace Monitoring Contract

## Purpose

Monitoring is an independent Gate dimension. A successful runtime smoke test does not automatically satisfy Monitoring. Likewise, a health endpoint alone does not constitute complete observability.

---

## 1. Health

Both Control Planes must expose a health signal:

```text
Store
Marketplace
```

The health endpoint must be:
- reachable;
- deterministic;
- suitable for monitoring;
- independent from privileged Admin UI authentication where required by the monitoring environment.

---

## 2. Minimum Health Contract

A health response should communicate at least:
- status
- service
- timestamp

Where practical:
- database
- version
- environment

Sensitive secrets must never be returned.

---

## 3. Application Monitoring

The following classes should be observable:
- HTTP errors
- API failures
- authorization failures
- mutation failures
- validation failures
- database failures
- slow requests
- unexpected exceptions

---

## 4. Store Monitoring

At minimum:
- Store API availability
- Store public route availability
- Store mutation failures
- Order failures
- Payment failures
- Audit failures

---

## 5. Marketplace Monitoring

At minimum:
- Marketplace API availability
- Listing failures
- Offer failures
- Moderation failures
- Matching failures
- Audit failures

---

## 6. Security Events

Monitoring should distinguish:
- 401
- 403
- validation failure
- rate-limit rejection
- suspicious mutation
- sensitive action failure

---

## 7. Audit vs Monitoring

These are separate concerns.

**Audit** answers:
- Who changed what?

**Monitoring** answers:
- Is the system behaving correctly and reliably?

An AuditLog record does not replace operational monitoring.

A health endpoint does not replace audit logging.

---

## 8. Alerting

Future production alerting should cover:
- service unavailable
- database unavailable
- error-rate spike
- latency spike
- repeated authorization failures
- payment failures
- audit failures

Thresholds should be defined separately from this structural contract.

---

## 9. Gate Rule

Monitoring is:
- GREEN
- PARTIAL
- BLOCKED

and must be reported independently of runtime smoke.

A successful smoke test cannot silently promote:
```
Monitoring = PARTIAL
```
to:
```
Monitoring = GREEN
```

---

## 10. Implementation Freeze Rule

Monitoring gaps discovered during the Joint Batch Gate may reopen implementation only when a concrete missing capability is demonstrated.

Do not add speculative telemetry merely to increase the number of monitoring signals.
