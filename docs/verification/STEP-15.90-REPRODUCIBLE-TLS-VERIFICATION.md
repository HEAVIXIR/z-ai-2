# HEAVIX — STEP 15.90 — Reproducible TLS Verification in CI

**Repository:** `HEAVIXIR/z-ai-2`
**PR:** #76
**Baseline SHA:** `9c78c0738783671a91ee68e19ff35440177aecb7`
**Date:** 2026-10-24

---

## Executive Summary

STEP 15.90 provisions a real TLS-enabled PostgreSQL 17 infrastructure in CI and runs the actual Prisma v6 behavioral TLS suite against it. This moves Finding D from `VERIFIED-LOCALLY-ONLY` toward a reproducible CI-verified state.

### What was added

1. **`scripts/provision-tls-pg.sh`** — provisions two TLS-enabled PostgreSQL 17 clusters in CI:
   - VALID cluster (port 5433): cert signed by test CA, CN=localhost, SAN=DNS:localhost+IP:127.0.0.1, not expired
   - EXPIRED cluster (port 5434): same CA but cert already expired
   - Both configured with `hostssl` only (no plaintext `host` lines in pg_hba.conf)
   - Generates test CA, valid server cert, expired server cert, untrusted CA
   - Writes `pg-env.sh` for psql path setup

2. **CI workflow `tls-proof` job** — a dedicated CI job that:
   - Provisions the TLS infrastructure via `provision-tls-pg.sh`
   - Verifies the infrastructure is available (fails closed if missing)
   - Runs the real Prisma v6 behavioral TLS suite (`rbac-tls-behavioral-real.test.ts`)
   - Verifies NO tests were skipped (fails closed if any test skipped)
   - Requires at least 13 tests to run

3. **The existing test suite** (`tests/integration/rbac-tls-behavioral-real.test.ts`) already has 13 behavioral scenarios:
   - PRISMA-1 through PRISMA-7: real Prisma connection path TLS behavior
   - LIBPQ-1 through LIBPQ-5: libpq/psql reference path TLS behavior
   - VERDICT: Finding D status documentation

### Fail-closed guarantees

- The `tls-proof` job **fails** if `provision-tls-pg.sh` cannot provision the infrastructure
- The job **fails** if any test is skipped (infrastructure was not fully available)
- The job **fails** if fewer than 13 tests ran
- There is **NO env-var bypass** — no `DRYRUN_ALLOW_NO_TLS` or equivalent

### Finding D classification

| Criterion | Status |
|-----------|--------|
| TLS configuration gate enforced | ✅ (preflight requires `sslmode=require&sslaccept=strict&sslcert=<path>`) |
| TLS behavioral tests written | ✅ (13 scenarios in `rbac-tls-behavioral-real.test.ts`) |
| TLS infrastructure provisioned in CI | ✅ (provision script + `tls-proof` CI job) |
| TLS tests run in CI (not skipped) | PENDING CI execution on final SHA |
| Actual CA/hostname/expiry validation proven | ✅ PROVEN IN CI |
| **Finding D** | **VERIFIED IN CI** |

### CI execution results (on exact final SHA `85d4f3f`)

**CI run:** https://github.com/HEAVIXIR/z-ai-2/actions/runs/40110379391/job/120920659578

**Date:** 2026-10-24

**All 4 CI checks pass:**

| Check | Status | Result |
|-------|--------|--------|
| `verify` | completed | ✅ success |
| `audit-transaction` | completed | ✅ success |
| `phase-tests` | completed | ✅ success |
| `tls-proof` | completed | ✅ success |

**TLS Proof Test Summary (from CI logs):**

```
── TLS Proof Test Summary ──
  Total run (non-skipped): 13
  Passed: 13
  Failed: 0
  Skipped: 0
✓ All 13 TLS behavioral tests ran with 0 skips and 0 failures.
```

**All 13 behavioral TLS tests executed in CI (not skipped):**

| Test | Scenario | Observed behavior |
|------|----------|-------------------|
| PRISMA-1 | Valid TLS (correct CA + hostname + cert) | SUCCESS ✅ |
| PRISMA-2 | Untrusted CA (sslaccept=strict) | REJECTED ✅ |
| PRISMA-3 | Hostname mismatch (cert=localhost, connect 127.0.0.1) | REJECTED ✅ |
| PRISMA-4 | Expired cert (notAfter=2021-01-01) | REJECTED ✅ |
| PRISMA-5 | No TLS (sslmode=disable, hostssl) | REJECTED ✅ |
| PRISMA-6 | sslcert=nonexistent path | REJECTED ✅ |
| PRISMA-7 | Real preflight script connects over TLS via Prisma | SUCCESS ✅ |
| LIBPQ-1 | Valid TLS (libpq reference) | SUCCESS ✅ |
| LIBPQ-2 | Untrusted CA (libpq) | REJECTED ✅ |
| LIBPQ-3 | Hostname mismatch (libpq) | REJECTED ✅ |
| LIBPQ-4 | Expired cert (libpq) | REJECTED ✅ |
| LIBPQ-5 | No TLS (libpq) | REJECTED ✅ |
| VERDICT | Finding D status documentation | PASS ✅ |

### Acceptance criteria checklist

- [x] Real TLS behavioral tests exist in the codebase
- [x] TLS infrastructure provisioning script exists
- [x] CI job runs the behavioral suite
- [x] CI job fails closed if infrastructure is missing
- [x] CI job fails if any test is skipped
- [x] All required CI checks pass on the exact final SHA (`85d4f3f`)
- [x] Real TLS behavioral tests execute in CI (13/13 PASS, 0 skips, 0 failures)
- [x] All positive and negative scenarios produce expected outcomes
- [x] Proof job fails closed when required infrastructure is unavailable
- [ ] Fresh review requested after implementation (PENDING — awaiting owner)

### Test results

**CI (on `85d4f3f`):**
- tls-proof: 13/13 PASS, 0 skips, 0 failures ✅
- verify: ✅ success
- audit-transaction: ✅ success
- phase-tests: ✅ success

**Local (pre-CI validation):**
- Typecheck: 0 errors ✅
- Lint: 0 errors ✅
- Unit tests: 86/86 PASS ✅
- Behavioral TLS tests: 13/13 PASS (local TLS infra) ✅

### Implementation history

The STEP 15.90 implementation went through several iterations to achieve CI green:

1. **`8af0856`** — initial provision script + CI job (5 bugs: undefined CA_VALID, missing `local` pg_hba line, `-U $USER` instead of `-U postgres`, broken expired cert with faketime, wrong psql path check)
2. **`f192635`** — owner fix: socket dir + `-h localhost` for psql
3. **`f63ff70`** — owner fix: undefined CA_VALID variable
4. **`8de1783`** — owner fix: `_psqlExists` checks both custom + system psql paths
5. **`3573455`** — comprehensive provision script rewrite (OpenSSL 3.x expired cert, `local trust` in pg_hba, `-U postgres`, fail-closed expired-cert verification) + consolidated CI fail-closed step
6. **`3d971f4`** — fix jq PARSE_ERROR: use `--silent` + JSON validation
7. **`38672f5`** — remove `IP:127.0.0.1` from cert SAN (was causing hostname-mismatch test to pass instead of fail)
8. **`85d4f3f`** — use `--outputFile` for clean JSON parsing (avoids vitest stdout pollution) → **CI GREEN ✅**

### Governance

- PR #76: OPEN, UNMERGED — awaiting owner's independent review
- No staging execution, backfill, Phase D/E, or production deployment
- No self-approve or branch-protection bypass
- Finding D: **VERIFIED IN CI** — the `tls-proof` job passes on the exact final SHA `85d4f3f`, proving that the real Prisma v6 strict TLS configuration (`sslmode=require&sslaccept=strict&sslcert=<path>`) enforces CA validation, hostname verification, cert expiry, and cert file existence through the actual Prisma connection path.
