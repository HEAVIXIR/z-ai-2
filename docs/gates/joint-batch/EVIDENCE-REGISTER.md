# HEAVIX — Joint Batch Evidence Register

## Current State

```text
Gate: OPEN
Implementation: FROZEN
Runtime verification: PENDING
```

### Baseline

| Item | Value |
|---|---|
| Frozen baseline | `562e5f7` |
| Implementation freeze | Store + Marketplace |
| Current implementation HEAD | `eaa2f7b` |
| Store contract tests | 78 |
| Combined contract tests | 90 |

The HEAD value must be updated if the repository changes before Gate execution.

---

## Runtime Evidence Ledger

### E2E-01 — Git / Baseline Integrity

**Status:** PENDING

Required evidence:
- git status
- baseline integrity
- `.env` integrity
- 6D path integrity
- Control Plane configuration integrity

Expected:
- working tree clean
- no unauthorized changes

### E2E-02 — Database Connectivity

**Status:** PENDING

Observe:
- PostgreSQL/PGlite bridge port availability
- Prisma connectivity

No workaround permitted.

### E2E-03 — Schema / Migration

**Status:** PENDING

Required:
- prisma validate
- migration state
- schema compatibility

No destructive migration may be introduced as part of the Gate.

### E2E-04 — Store Public Route

**Status:** PENDING

Verify:
- `/store`

Expected:
- route reachable;
- no unexpected server error;
- public UI loads;
- API dependencies behave as expected.

### E2E-05 — Store Admin Authorization

**Status:** PENDING

Verify representative protected routes.

Expected:
- unauthenticated → rejected
- unauthorized → rejected
- authorized → allowed

### E2E-06 — Store Mutation

**Status:** PENDING

Verify at least one representative mutation when runtime DB permits.

Record:
- route
- actor
- action
- entity
- before
- after
- result

### E2E-07 — Store AuditLog

**Status:** PENDING

Verify the mutation produces the expected audit evidence.

Required:
- actor
- action
- entity
- timestamp
- before/after where applicable

### E2E-08 — Marketplace Runtime Paths

**Status:** PENDING

Verify representative public and admin Marketplace paths.

### E2E-09 — Marketplace Mutation

**Status:** PENDING

Verify a representative Marketplace mutation when the runtime environment permits.

### E2E-10 — Marketplace AuditLog

**Status:** PENDING

Verify the corresponding audit record.

### E2E-11 — Monitoring / Health

**Status:** PENDING

Verify:
- Store health endpoint
- Marketplace health endpoint
- HTTP response
- basic health semantics

Monitoring is independent from runtime smoke.

### E2E-12 — Regression / Production Verification

**Status:** PENDING

Verify:
- tsc
- lint
- contract tests
- build
- production-oriented smoke

Existing test results must not be represented as freshly verified unless they are actually rerun.

---

## Evidence Rules

Each completed item must record:
- Evidence ID
- Timestamp
- Commit SHA
- Command / observation
- Result
- Environment
- Notes

If an item cannot be executed:
- Status = BLOCKED
- Reason = explicit

Never convert missing evidence into PASS.

---

## Current Known Structural Evidence

### Store
- 18 routes
- 32 permission calls
- 25 mutations
- 27 audit calls
- 20 action keys
- 78 contract/UI tests

### Marketplace
- 7 relevant admin routes
- 10 permission calls
- 21 mutations
- 21 audit calls

### Combined
- 90 contract tests

These figures are structural evidence and must remain separate from runtime evidence.
