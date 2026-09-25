# HEAVIX — Joint Batch Known Gaps

## Purpose

This document records known limitations without silently treating them as implementation failures. A gap may only be removed when new evidence proves that it has been resolved.

---

## G-001 — Store Runtime Verification Pending

**Status:** OPEN

Store runtime DB evidence has not yet been completed.

Affected:
```text
E2E-02
E2E-03
E2E-04
E2E-05
E2E-06
E2E-07
```

No implementation change should be made solely to manufacture runtime evidence.

---

## G-002 — Marketplace Runtime Verification Pending

**Status:** OPEN

Marketplace runtime verification remains pending.

Affected:
```text
E2E-08
E2E-09
E2E-10
```

---

## G-003 — PGlite Environment Limitation

**Status:** KNOWN ENVIRONMENT LIMITATION

The previously documented PGlite single-connection limitation remains separate from implementation correctness.

If the limitation prevents required evidence:
- do not workaround
- do not modify production code
- do not claim PASS
- record exact failed observation

The limitation may justify a CONDITIONAL verdict only when all other required evidence is available and the limitation is explicitly bounded.

---

## G-004 — Monitoring Partial

**Status:** PARTIAL

Health endpoints and monitoring documentation provide the current foundation.

Complete production observability is not yet established.

This is independent from the runtime smoke result.

---

## G-005 — Documentation Baseline

**Status:** BASELINE READY

The Joint Batch Gate documentation package is established.

During Gate execution:
- update `EVIDENCE-REGISTER.md` with real evidence;
- update this file only when a concrete gap is discovered or resolved;
- do not create parallel Gate documents.

---

## G-006 — Out-of-Scope Type Safety

**Status:** KNOWN / OUT OF SCOPE

There are additional Admin routes outside the Store and Marketplace batch that still contain `@ts-nocheck`.

These are not part of this batch.

They must not be silently represented as resolved by the Store + Marketplace Type-Safety work.

Future work may address them under a separate batch.

---

## G-007 — Production Build Verification

**Status:** PENDING

A production-oriented build/verification pass has not yet been accepted as Joint Batch Gate evidence unless explicitly executed and recorded.

Existing tsc, lint, and contract-test results are not substitutes for a production verification result.

---

## Gap Reopening Rule

A known gap may reopen implementation only when:
- evidence confirms the gap is real;
- its scope is known;
- the minimal remediation is identifiable.

The following are prohibited:
- speculative refactors;
- unrelated cleanup;
- architecture reopening;
- Universal Resource Engine refactoring;
- Control Plane redesign;
- PGlite workarounds.

---

## Current Summary

```text
Store implementation:     COMPLETE
Marketplace implementation: COMPLETE
Contract tests:           90/90
Runtime evidence:         PENDING
Monitoring:               PARTIAL
Documentation:            BASELINE READY
Implementation freeze:    ACTIVE
Joint Batch Gate:         OPEN
```
