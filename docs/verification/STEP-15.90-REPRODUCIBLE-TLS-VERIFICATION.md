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
| Actual CA/hostname/expiry validation proven | PENDING CI execution |
| **Finding D** | **PENDING CI verification** |

### Acceptance criteria checklist

- [x] Real TLS behavioral tests exist in the codebase
- [x] TLS infrastructure provisioning script exists
- [x] CI job runs the behavioral suite
- [x] CI job fails closed if infrastructure is missing
- [x] CI job fails if any test is skipped
- [ ] All required CI checks pass on the exact final SHA (PENDING)
- [ ] Fresh review requested after implementation (PENDING)

### Test results (local — unit tests only)

- Typecheck: 0 errors
- Lint: 0 errors
- Unit tests: 385/385 PASS
- TLS behavioral tests: SKIP locally (no TLS-enabled PostgreSQL available locally) — will run in CI

### Governance

- PR #76: OPEN, UNMERGED
- No staging execution, backfill, Phase D/E, or production deployment
- No self-approve or branch-protection bypass
- Finding D: PENDING CI verification — will be VERIFIED if the `tls-proof` job passes on the exact final SHA
