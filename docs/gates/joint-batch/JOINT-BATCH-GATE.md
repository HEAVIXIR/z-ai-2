# HEAVIX — Joint Batch Gate

## 1. Purpose

This document defines the final verification contract for the combined Store + Marketplace implementation batch.

The Gate is evidence-driven. No component may be declared GREEN merely because:
- contract tests pass;
- TypeScript passes;
- lint passes;
- implementation exists;
- API routes exist.

---

## 2. Gate Chain

The following chain must be evaluated:

```text
Schema
  ↓
Service
  ↓
API
  ↓
Permission
  ↓
Admin UI
  ↓
Public/Seller UI
  ↓
Validation
  ↓
Audit
  ↓
Tests
  ↓
Monitoring
  ↓
Documentation
  ↓
Runtime Evidence
  ↓
Production Verification
```

This follows the project's global Definition of Done.

---

## 3. Store Gate Required

### Structural
- Store routes exist
- Store permissions exist
- Store mutations are audited
- Public Store UI exists
- Store contract tests pass

### Runtime
- Database connectivity verified
- Store public route responds
- Store API routes respond
- unauthorized admin requests are rejected
- authorized requests reach the expected handler
- representative mutation can be executed when environment permits
- resulting AuditLog evidence is observable

### Operational
- monitoring contract exists
- health endpoint is reachable
- documentation reflects the verified state

---

## 4. Marketplace Gate Required

### Structural
- Marketplace routes exist
- Permission checks exist
- Mutations are audited
- TypeScript scope is clean
- contract tests pass

### Runtime
- database connectivity verified
- representative public/admin paths respond
- authorization behavior verified
- representative mutation verified where environment permits
- corresponding audit evidence verified

### Operational
- monitoring contract exists
- health endpoint is reachable
- documentation reflects actual state

---

## 5. Required Evidence

The Gate should attempt to collect evidence for:

- E2E-01 Git / baseline integrity
- E2E-02 Database connectivity
- E2E-03 Schema / migration validity
- E2E-04 Store public route
- E2E-05 Store admin authorization
- E2E-06 Store representative mutation
- E2E-07 Store AuditLog evidence
- E2E-08 Marketplace runtime paths
- E2E-09 Marketplace representative mutation
- E2E-10 Marketplace AuditLog evidence
- E2E-11 Monitoring / health
- E2E-12 Regression / production verification

Exact evidence must be recorded in `EVIDENCE-REGISTER.md`.

---

## 6. Verdicts

### GREEN

GREEN requires sufficient evidence for:
- implementation;
- authorization;
- audit;
- tests;
- monitoring;
- documentation;
- runtime verification;
- production verification.

No known blocking gap may remain.

### CONDITIONAL

CONDITIONAL may be used when:
- implementation evidence is complete;
- required runtime behavior is otherwise understood;
- a documented environment limitation prevents a specific runtime proof;
- the limitation is external to the implementation;
- no workaround was introduced.

The limitation must be explicitly recorded.

### OPEN

OPEN means the Gate cannot yet be closed.

Examples:
- runtime evidence missing;
- monitoring incomplete;
- production verification missing;
- documentation incomplete;
- evidence contradictory.

### RED

RED means concrete implementation or correctness failure has been demonstrated.

Examples:
- unauthorized mutation succeeds;
- mutation occurs without required audit;
- runtime route fails because of implementation;
- contract is violated;
- production verification exposes a real regression.

---

## 7. No Automatic Promotion

The following must NOT automatically promote the Gate:
- 90/90 tests
- tsc = 0
- lint = 0
- 27 Store audits
- 21 Marketplace audits

These are evidence inputs, not the final verdict.

---

## 8. Gap Reopening

If the Gate discovers a real implementation gap:

```text
Gate
  ↓
Evidence
  ↓
Gap
  ↓
Known Gap record
  ↓
Minimal implementation change
  ↓
Local verification
  ↓
Freeze
  ↓
Gate re-check
```

Only the affected area is reopened.

No unrelated refactor is permitted.

---

## 9. Final Gate Record

The final verdict must include:
- date/time;
- commit SHA;
- environment;
- evidence IDs;
- blockers;
- monitoring status;
- documentation status;
- final verdict;
- explicit rationale.

No undocumented verbal GREEN status is valid.
