# HEAVIX — Joint Batch Gate Documentation Pack

## Purpose

این بسته مستندات، وضعیت فریز‌شده Store و Marketplace را ثبت می‌کند و اجرای بعدی را به یک **Joint Batch Gate** واحد محدود می‌کند.

### Frozen baseline

- Baseline: `562e5f7`
- Frozen implementation head: `5862d9f`
- Store 2A–2D: COMPLETE
- Marketplace 2A–2C: COMPLETE
- Store Gate: OPEN
- Marketplace Gate: OPEN
- Joint Batch Gate: DEFERRED
- Runtime verification: PENDING
- Monitoring: PARTIAL
- Documentation: BASELINE COMPLETE / runtime evidence pending

## Governing completion chain

```text
Schema → Service → API → Permission → Admin UI → Public/Seller UI → Validation → Audit → Tests → Monitoring → Documentation → DONE
```

## Operating rule

Implementation remains FROZEN.

The next batch performs evidence collection only.

A code change is permitted only when the Gate identifies a concrete, reproducible gap.

## Out of scope for this Gate

- Universal Resource Engine refactor
- Control Plane redesign
- PGlite workaround
- unrelated `@ts-nocheck` cleanup
- new Store or Marketplace features
- reopening 6D

---

## Pack contents

| File | Purpose |
|---|---|
| `README.md` | This file — freeze status, scope, operating rules |
| `JOINT-BATCH-GATE.md` | Gate criteria, required evidence, verdict definitions, gap-reopening rule |
| `EVIDENCE-REGISTER.md` | Evidence register + runtime evidence ledger (E2E-01 through E2E-12) |
| `MONITORING-CONTRACT.md` | Monitoring contract independent of runtime smoke |
| `KNOWN-GAPS.md` | Gap/exception register (G-001 through G-006) |

## Update policy

- This pack is the **authoritative Gate reference**.
- During Joint Batch Gate execution, only `EVIDENCE-REGISTER.md` is updated with real evidence.
- If a concrete gap is found, it is registered in `KNOWN-GAPS.md` with the exception rule format.
- No parallel Gate documents are produced — this pack is the single source of truth.
