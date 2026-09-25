# HEAVIX — Joint Batch Gate

## 1. Scope

This Gate covers the frozen Store + Marketplace implementation batch.

### Store
- 2A Permission
- 2B Audit
- 2C Contract Tests
- 2D Public UI
- 2E Runtime Verification

### Marketplace
- 2A Permission
- 2B Audit / gap-fill
- 2C Type Safety

---

## 2. Gate rule

`90/90` contract tests, `tsc=0`, and lint success are **Layer-A evidence only**. They do not independently close the Gate.

The Gate requires evidence across:

```text
Implementation
Permission
Audit
Tests
Runtime
Monitoring
Documentation
Production verification
```

---

## 3. Required evidence

| Gate item | Required evidence | Status |
|---|---|---|
| Git integrity | clean tree, expected HEAD, baseline intact | PENDING |
| fresh Gate run | | PENDING |
| DB connectivity | observed runtime connection | PENDING |
| Schema/migrations | validation result | PENDING |
| Store public route | HTTP smoke | PENDING |
| Store admin auth | unauthenticated/authorized behavior | PENDING |
| Marketplace admin auth | unauthenticated/authorized behavior | PENDING |
| Representative mutation | runtime mutation result | PENDING |
| Audit persistence | resulting AuditLog evidence | PENDING |
| Contract tests | 90/90 | KNOWN GREEN |
| Typecheck | 0 errors | KNOWN GREEN |
| Lint | 0 errors, warnings recorded | KNOWN GREEN |
| Monitoring | endpoint + operational signal evidence | PARTIAL |
| Documentation | current evidence + known gaps | COMPLETE FOR BATCH |
| Production verification | build/deploy/runtime evidence | PENDING |

---

## 4. Runtime policy

Runtime verification is observational.

No code, schema, environment, or configuration change may be introduced merely to make smoke tests pass.

If PGlite reproduces the known single-connection limitation:

```
STATUS = ENVIRONMENT BLOCKER
```

It must be recorded with:
- command
- timestamp
- observed error
- affected check
- scope

---

## 5. Gate outcomes

### GREEN
All required evidence is present and no blocking gap remains.

### CONDITIONALLY GREEN
Implementation chain is complete, but a documented environment limitation prevents one or more runtime checks, with reproducible evidence and no code workaround.

### OPEN
Required evidence is missing, monitoring/documentation is incomplete, or a real implementation gap is found.

### BLOCKED
Verification cannot proceed because the verification environment/tooling itself is unavailable.

---

## 6. Gap reopening rule

Only a concrete Gate finding can reopen implementation.

Every reopened gap must contain:
- Gap ID
- Scope
- Evidence
- Severity
- Owner
- Minimal remediation
- Verification command/test
- Closure evidence

No speculative refactor is permitted.
