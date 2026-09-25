# HEAVIX — Joint Batch Gate

## Status

**FROZEN / VERIFICATION-PENDING**

This directory is the single documentation package for the Joint Batch Gate covering:
- Store Control Plane
- Marketplace Control Plane

Implementation is frozen. No production-code changes are permitted unless the Joint Batch Gate produces a concrete, evidence-backed implementation gap.

---

## Scope

### Store

Completed implementation layers:
- Store 2A — Permission
- Store 2B — Audit
- Store 2C — Contract Tests
- Store 2D — Public UI

### Marketplace

Completed implementation layers:
- Marketplace 2A — Permission
- Marketplace 2B — Audit
- Marketplace 2C — Type Safety

---

## Current Evidence

### Store
- 18 admin routes
- 32 `requirePermission` calls
- 25 mutations
- 27 `logAudit` calls
- 20 unique action keys
- 78 Store contract/UI tests

### Marketplace
- 7 relevant admin routes
- 10 `requirePermission` calls
- 21 mutations
- 21 `logAudit` calls
- 90 combined Store + Marketplace contract tests
- `@ts-nocheck` removed from the two Marketplace files in scope

### Tooling
- TypeScript: 0 errors
- Lint: 0 errors
- Lint warnings may remain and must not be silently represented as errors
- Contract tests: 90/90 PASS

These figures describe implementation evidence only. They do not by themselves produce a GREEN Gate.

---

## Gate Principle

The Gate evaluates the complete feature chain:

```
Schema → Service → API → Permission → Admin UI → Public/Seller UI → Validation → Audit → Tests → Monitoring → Documentation → Runtime Evidence → Production Verification
```

A green test suite alone is insufficient.

---

## Runtime Rule

Runtime DB verification is performed only during the Joint Batch Gate.

PGlite must not be modified or worked around to manufacture a green result.

If the known PGlite limitation prevents required runtime evidence:
- do not change production code;
- do not introduce a workaround;
- record the limitation as an environment blocker;
- keep the Gate OPEN or CONDITIONAL according to the evidence actually obtained.

---

## Two-Layer Batch Model

### Layer A — Implementation

```text
Evidence-only inventory → Implementation → Local structural verification → Commit → Freeze
```

### Layer B — Batch Gate

```text
Runtime evidence → Monitoring evidence → Documentation evidence → Production verification → Gate decision
```

Verification is intentionally batched.

Repeated inventory and repeated Gate execution between implementation changes is prohibited unless a concrete gap requires reopening.

---

## Gap Reopening Rule

Implementation may only be reopened when:
- a concrete gap is found;
- the gap is supported by evidence;
- the affected scope is identified;
- the smallest required change is defined.

No speculative refactor is permitted.

---

## Architecture Freeze

The following remain frozen:
- Store Control Plane architecture
- Marketplace Control Plane architecture
- Universal Resource Engine
- Control Plane configuration
- `.env` baseline
- 6D decisions
- PGlite workaround prohibition

The Store Control Plane remains an independent configurable control plane.

---

## Gate Documents

| Document | Purpose |
|---|---|
| `JOINT-BATCH-GATE.md` | Gate criteria and verdict rules |
| `EVIDENCE-REGISTER.md` | Evidence ledger |
| `MONITORING-CONTRACT.md` | Monitoring requirements |
| `KNOWN-GAPS.md` | Known exceptions and unresolved gaps |

`EVIDENCE-REGISTER.md` is the only document that should be updated during runtime verification unless a new gap is discovered.

---

## Current Verdict

```
Store Gate:          OPEN
Marketplace Gate:   OPEN
Joint Batch Gate:    DEFERRED
Implementation:     FROZEN
Runtime Evidence:   PENDING
Monitoring:         PARTIAL
Documentation:      BASELINE READY
```
