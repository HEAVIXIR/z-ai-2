# HEAVIX — Known Gaps and Exceptions

## Purpose

این فهرست از تبدیل debt یا limitation به وضعیت مبهم «non-blocking» جلوگیری می‌کند.

---

## G-001 — Runtime verification pending
- Scope: Store + Marketplace
- Status: OPEN
- Evidence needed: Joint Batch Gate runtime matrix
- Impact: Gate cannot be GREEN yet

---

## G-002 — PGlite environment limitation
- Scope: runtime DB verification
- Status: ENVIRONMENT-BLOCKER if reproduced
- Rule: no workaround
- Required evidence: exact command + exact error + affected operation
- Historical reference: EVD-6D-01/02

---

## G-003 — Monitoring operational evidence
- Scope: Store + Marketplace
- Status: PARTIAL
- Existing: health endpoints and monitoring contract
- Missing: runtime/operational verification

---

## G-004 — Production verification
- Scope: Store + Marketplace batch
- Status: PENDING
- Required: production-equivalent build/runtime evidence according to project gate

---

## G-005 — 13 out-of-scope admin routes with `@ts-nocheck`
- Scope: unrelated admin routes
- Status: OUT-OF-SCOPE FOR THIS BATCH
- Rule: do not reopen during Joint Batch Gate unless independently blocking a Gate criterion
- Tracking requirement: future batch must give each cleanup scope an owner, severity, ticket, and deadline

---

## G-006 — 6D remains frozen
- Scope: 6D
- Status: FROZEN / CONDITIONAL
- Rule: Joint Batch Gate must not reopen or modify 6D.

---

## Exception rule

An exception is valid only when it has:

```text
ID
Scope
Evidence
Reason
Impact
Owner
Next action
Closure criterion
```
