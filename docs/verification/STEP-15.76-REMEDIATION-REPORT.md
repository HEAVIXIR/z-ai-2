# HEAVIX — STEP 15.76 — Identity Verification Remediation Report (HISTORICAL / SUPERSEDED)

> **⚠ HISTORICAL DOCUMENT — SUPERSEDED.** This report described the STEP 15.76
> GUC-based anchor, which was found to be session-forgeable (H-03, STEP 15.77).
> It also used the misleading term "INDEPENDENT TRUST ANCHOR" which has been
> replaced with "database-local anchor / wrong-DB defense" (STEP 15.78+).
> Finding D (server identity) is ⏳ UNVERIFIED — NOT FIXED. The anchor is a
> wrong-DB defense only; true server identity requires TLS/CA (out of scope).
> See `docs/verification/STEP-15.80-FINAL-CORRECTIONS-REPORT.md` for the
> authoritative current-state classification.

**Repository:** `HEAVIXIR/z-ai-2`
**Working branch:** `chore/step-15-68-phase-c-preflight`
**Baseline HEAD (before STEP 15.76):** `618b503` (STEP 15.75 final)
**PR:** #76 (https://github.com/HEAVIXIR/z-ai-2/pull/76)
**Date:** 2026-10-23

---

## 0. GLOBAL CORRECTION NOTICE (STEP 15.78 — 15.83)

> **⚠ The body of this report (§1 onward) uses the term "independent trust
> anchor" and claims the GUC-based anchor "VERIFIED ✅" server identity.
> These claims are ALL SUPERSEDED.** The GUC approach was found to be
> session-forgeable (H-03, STEP 15.77). The TABLE-based replacement was
> found to be cloneable (H-04, STEP 15.78). The term "independent trust
> anchor" has been replaced throughout the codebase with "database-local
> anchor / wrong-DB defense" (STEP 15.80+). Finding D (server identity) is
> **⏳ UNVERIFIED** — NOT FIXED. The anchor is a wrong-DB defense only; true
> server identity requires TLS/CA (out of scope).
>
> The body below is retained for historical reference. Every occurrence of
> "independent trust anchor", "VERIFIED ✅ (independent trust anchor
> confirmed)", "identity verified via independent trust anchor", and similar
> is a **stale historical claim** that does NOT reflect the current state.

---

## 1. Purpose

The owner correctly identified that STEP 15.75's "content-based identity verification" claim was an **overstatement**. Checking that 5 RBAC tables exist + 5 canonical roles are seeded proves **SCHEMA/SEED READINESS**, NOT which server the dry-run is connected to. A staging DB, a cloned DB, or the wrong cluster on the same hostname could have the same 5 tables and 5 roles — content checks would pass against any of them.

This report documents the 5 owner directives implemented in STEP 15.76:

1. Rename content checks to "schema/seed readiness" (NOT "identity")
2. Add an ~~independent trust-anchor~~ **[SUPERSEDED: database-local anchor / wrong-DB defense]** mechanism (`DRYRUN_SERVER_IDENTITY_ANCHOR`)
3. Fix output labels and documentation
4. Add behavioral tests
5. Validate (typecheck, lint, tests)

---

## 2. Why Content Checks Are Schema Readiness, Not Identity

The STEP 15.75 design relied on two LIVE DB content queries inside the preflight:

```sql
SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('User', 'UserRole', 'Role', 'Permission', 'RolePermission');

SELECT key FROM "Role" WHERE key IN ('ADMIN', 'SELLER', 'BUYER', 'MODERATOR', 'SUPPORT');
```

These prove that the schema is in place and that the RBAC seed has been applied. They do **NOT** prove which server we are connected to:

| Scenario | Same 5 tables? | Same 5 roles? | Content checks pass? | Is this the production server? |
|---|---|---|---|---|
| Production DB | ✅ | ✅ | ✅ | ✅ |
| Staging DB (cloned from prod) | ✅ | ✅ | ✅ | ❌ |
| Wrong cluster on same hostname | ✅ | ✅ | ✅ | ❌ |
| MITM proxy forwarding to a replica | ✅ | ✅ | ✅ | ❌ |
| Restore of prod backup onto a dev host | ✅ | ✅ | ✅ | ❌ |

In all five rows the content checks pass identically — the queries cannot distinguish production from any of the wrong-server scenarios. The STEP 15.75 labels ("Content-based identity: PASS ✅ (live DB content verified)" and "Host identity check: verified ✅") therefore overstated what was actually proven.

**STEP 15.76 renaming (Directive 1):**

| Old label (STEP 15.75) | New label (STEP 15.76) |
|---|---|
| `Host identity           : PASS ✅ (hostname match verified)` | `Hostname consistency     : PASS ✅ (Configuration consistency — NOT a server-identity proof)` |
| `Content-based identity       : PASS ✅ (live DB content verified)` | `Schema/seed readiness        : PASS ✅ (live DB content verified)` |
| `Role catalog identity check : ALL 5 canonical roles present ✅` | `Role catalog readiness check : ALL 5 canonical roles present ✅` |
| `Host identity check              : verified ✅` | `Hostname consistency check       : configuration consistency ✅` |
| `identity verified via LIVE DB content — not env vars` | `schema/seed readiness verified via LIVE DB content — not env vars; server identity verified via independent trust anchor when configured` |
| `Identity is now verified via LIVE DB content` (comments) | `Schema/seed readiness is now verified via LIVE DB content` |
| `STEP 15.75 content-based identity verification requires ALL 5 RBAC` (error) | `STEP 15.75 schema/seed readiness verification requires ALL 5 RBAC` |
| `Cannot verify server identity without a parseable host.` | `Cannot verify hostname consistency without a parseable host.` |
| `Server/cluster identity verification is MANDATORY.` | `Hostname consistency verification is MANDATORY.` |

Hostname match (`DRYRUN_EXPECTED_HOST` vs the host parsed from `DATABASE_URL`) is also **NOT** a server-identity proof — it is a configuration consistency check. A proxy, MITM, or wrong cluster on the same hostname would still pass it. The new label explicitly states "Configuration consistency — NOT a server-identity proof" so operators do not misread the output.

---

## 3. How the Independent Trust-Anchor Mechanism Works (Directive 2)

### 3.1 The Mechanism

To independently verify server identity, STEP 15.76 adds an out-of-band trust anchor:

1. **DBA-side (out-of-band):** The DBA sets a PostgreSQL GUC (Grand Unified Configuration) parameter on the target database via:
   ```sql
   ALTER DATABASE <db> SET app.server_identity = '<value>';
   ```
   This value is set **on the server**, not in the operator's environment. An operator cannot fake this — `ALTER DATABASE` requires DBA privileges on the production cluster.

2. **Operator-side (out-of-band):** The operator supplies the **SAME** value via the `DRYRUN_SERVER_IDENTITY_ANCHOR` environment variable. This env var is independent of `DATABASE_URL` — it does not come from the connection string.

3. **Preflight-side (verification):** The preflight queries the GUC after DB connect:
   ```sql
   SELECT current_setting('app.server_identity', true) AS server_identity;
   ```
   The `true` argument means "missing_ok = true" — the query returns NULL if the GUC is unset, rather than raising an error.

4. **Comparison:** The preflight compares the server-side value with the operator-supplied anchor:
   - **Match** → log `Server identity: VERIFIED ✅ (independent trust anchor confirmed)` and continue.
   - **Mismatch** → halt with exit 2 (wrong server — fail closed).
   - **GUC unset (NULL)** → halt with exit 2 (the operator intended to verify identity but the DBA has not finished setup — fail closed).
   - **Anchor env var NOT set** → log `Server identity: UNVERIFIED ⚠ (no independent trust anchor — DRYRUN_SERVER_IDENTITY_ANCHOR not set)` and **continue** (the run is NOT blocked — the operator was informed).

### 3.2 Why This Works

- The anchor value is **out-of-band on both sides**. The DBA sets the GUC via SQL; the operator supplies the anchor via env var. Neither can fake the other.
- A wrong server (staging DB, cloned DB, wrong cluster) cannot have the same GUC value unless the DBA explicitly set it there. If the DBA sets a unique value per cluster, mismatch = wrong server.
- `DATABASE_URL` is **not** the source of truth — even if an operator sets `DATABASE_URL` to point at the wrong server, the GUC comparison will fail (assuming the DBA set unique values per cluster).
- The mechanism is **opt-in**: if the anchor is not set, the run continues with an `UNVERIFIED ⚠` warning. This preserves backward compatibility with environments where the DBA has not yet deployed the GUC.

### 3.3 Implementation

**Anchor env var reading** (`scripts/rbac-backfill-dryrun.ts:247`):

```typescript
const serverIdentityAnchor = process.env.DRYRUN_SERVER_IDENTITY_ANCHOR;
```

**Early status log (before DB connect)** so the operator sees the status even if the DB connection subsequently fails (`scripts/rbac-backfill-dryrun.ts:341-345`):

```typescript
if (serverIdentityAnchor === undefined || serverIdentityAnchor === '') {
  console.log('  Server identity         : UNVERIFIED ⚠ (no independent trust anchor — DRYRUN_SERVER_IDENTITY_ANCHOR not set)');
} else {
  console.log('  Server identity         : PENDING ⏳ (independent trust anchor configured — will verify after DB connect)');
}
```

**Trust-anchor GUC query (after DB connect + role/privilege/schema checks)** (`scripts/rbac-backfill-dryrun.ts:720-752`):

```typescript
if (serverIdentityAnchor !== undefined && serverIdentityAnchor !== '') {
  const anchorRows = await db.$queryRawUnsafe(
    `SELECT current_setting('app.server_identity', true) AS server_identity`,
  ) as Array<{ server_identity: string | null }>;
  const serverSideIdentity = anchorRows[0]?.server_identity ?? null;

  if (serverSideIdentity === null) {
    // DBA has not set the GUC — fail closed (operator intended verification).
    console.error('✗ PREFLIGHT FAIL: DRYRUN_SERVER_IDENTITY_ANCHOR is set but the server-side GUC app.server_identity is not set.');
    console.error('  The DBA must configure the GUC out-of-band via:');
    console.error("    ALTER DATABASE <db> SET app.server_identity = '<value>';");
    // ...
    await db.$disconnect();
    process.exit(2);
  }

  if (serverSideIdentity !== serverIdentityAnchor) {
    // GUC mismatch — wrong server. Halt immediately.
    console.error('✗ PREFLIGHT FAIL: server-side trust anchor does not match the operator-supplied anchor.');
    console.error('  This indicates the dry-run is connected to the WRONG server.');
    // ...
    await db.$disconnect();
    process.exit(2);
  }

  // Match — independent trust anchor confirmed.
  console.log('  Server identity           : VERIFIED ✅ (independent trust anchor confirmed)');
}
```

The GUC query is **deferred to AFTER DB connect + role/privilege/schema checks** because `current_setting()` requires an established connection. If the DB connect itself fails (as in the test environment), the GUC query never runs — the script exits at the DB-connect catch block.

---

## 4. Finding Classification

The owner's directive uses "Finding 4" (corresponding to the STEP 15.72 numbering of the server/cluster identity finding). The STEP 15.76 classification is:

| # | Finding | Severity | STEP 15.76 Status | Rationale |
|---|---|---|---|---|
| D (Finding 4) | Server/cluster identity was previously overstated as "verified" via content checks that actually prove schema/seed readiness | HIGH | **UNVERIFIED** | Until the trust-anchor GUC is deployed by the DBA on the production cluster AND a staging dry-run confirms the GUC match works end-to-end, server identity is NOT independently verified. STEP 15.76 ships the mechanism; operational deployment is required to actually achieve VERIFIED status. |
| 1 (renaming) | Labels overstated the proof — "Host identity: verified ✅" and "Content-based identity: PASS ✅" implied identity was proven | MEDIUM | **FIXED** ✅ | All labels renamed to "Hostname consistency" (configuration consistency, NOT identity) and "Schema/seed readiness" (proves schema, not server). |
| 2 (trust anchor) | No independent server-identity mechanism existed | HIGH | **FIXED (mechanism)** ✅ / **UNVERIFIED (deployment)** ⚠ | The `DRYRUN_SERVER_IDENTITY_ANCHOR` mechanism is implemented and tested at the unit level. End-to-end VERIFIED status requires DBA deployment of the GUC + a successful staging dry-run. |
| 3 (docs) | Documentation did not explain the distinction between schema readiness and server identity | LOW | **FIXED** ✅ | This report (STEP-15.76-REMEDIATION-REPORT.md) documents the distinction. |
| 4 (tests) | No tests covered the trust-anchor mechanism or the schema/seed readiness renames | MEDIUM | **FIXED** ✅ | Tests 9k + 9l added to `rbac-preflight-logic.test.ts`. Source-level tests in `rbac-dryrun-preflight.test.ts` updated to assert the new labels and the trust-anchor mechanism presence. |

**Finding D classification: UNVERIFIED** ⚠

The owner's directive explicitly classifies Finding 4 as **UNVERIFIED** until the anchor is deployed and tested. STEP 15.76 ships the mechanism; the operational verification (DBA deploys the GUC on the production cluster + a staging dry-run confirms the GUC matches the operator-supplied anchor end-to-end) is **not** part of STEP 15.76 code scope — it is a prerequisite for promoting the dry-run from "schema/seed readiness verified" to "server identity verified."

---

## 5. Tests Added / Updated (Directive 4)

### 5.1 Behavioral tests in `tests/unit/rbac-preflight-logic.test.ts`

Two new tests added:

- **9k. STEP 15.76: Normal flow (no `DRYRUN_SERVER_IDENTITY_ANCHOR`) → proceeds but logs UNVERIFIED**
  - Asserts the script logs `Server identity         : UNVERIFIED ⚠`, `no independent trust anchor`, and `DRYRUN_SERVER_IDENTITY_ANCHOR not set`.
  - Asserts the script does NOT log `VERIFIED ✅` (the anchor was not set, so verification cannot run).
  - Asserts the script does NOT log a hard PREFLIGHT FAIL about the trust anchor (the run is NOT blocked).
  - The script exits 2 because the DB connect subsequently fails (no real DB in test env) — this is expected.

- **9l. STEP 15.76: `DRYRUN_SERVER_IDENTITY_ANCHOR` set → passes host check (fails later on DB connect since no real DB in test env)**
  - Asserts the script logs `Server identity         : PENDING ⏳`, `independent trust anchor configured`, and `will verify after DB connect`.
  - Asserts the script does NOT log `VERIFIED ✅` (the DB connect failed before the GUC query could run).
  - Asserts the script does NOT log a hard PREFLIGHT FAIL about a GUC mismatch (the GUC was never queried).
  - The script exits 2 because the DB connect fails (no real DB in test env) — this is expected.

### 5.2 Existing tests updated in `tests/unit/rbac-preflight-logic.test.ts`

- Test 9d (DRYRUN_EXPECTED_HOST matches DATABASE_URL host → passes host check): updated to assert `Hostname consistency     : PASS ✅` and `Configuration consistency — NOT a server-identity proof` (was previously `Host identity           : PASS ✅`).
- Test 9j (Normal flow — no deprecated flag): updated to assert `Hostname consistency     : PASS ✅` (was previously `Host identity           : PASS ✅`).
- `beforeEach` now also deletes `process.env.DRYRUN_SERVER_IDENTITY_ANCHOR` so tests are deterministic.

### 5.3 Source-level tests in `tests/unit/rbac-dryrun-preflight.test.ts`

- Renamed the `describe("STEP 15.75 — Content-based identity verification…")` block to `describe("STEP 15.75 — Schema/seed readiness verification…")`.
- Updated test "rbac-backfill-dryrun.ts performs content-based identity verification (5 RBAC tables exist)" → "rbac-backfill-dryrun.ts performs schema/seed readiness verification (5 RBAC tables exist)".
- Updated test "rbac-backfill-dryrun.ts performs content-based identity verification (5 canonical roles in catalog)" → "rbac-backfill-dryrun.ts performs schema/seed readiness verification (5 canonical roles in catalog)".
- Updated test "rbac-backfill-dryrun.ts verifies identity via LIVE DB content (not env vars)" → "rbac-backfill-dryrun.ts verifies schema/seed readiness via LIVE DB content (not env vars)" — assertions now check `Schema/seed readiness verification` and `live DB content`.
- Added test "rbac-backfill-dryrun.ts no longer uses 'Content-based identity' labels (renamed in STEP 15.76)" — asserts the old `console.log(` Content-based identity` label is gone from the preflight function body, and the new `Schema/seed readiness` label is present.
- Added test "rbac-backfill-dryrun.ts no longer uses 'Host identity: PASS' overstatement (renamed in STEP 15.76)" — asserts the old `console.log(' Host identity : PASS` label is gone, and the new `Hostname consistency` + `Configuration consistency — NOT a server-identity proof` labels are present.
- Added test "rbac-backfill-dryrun.ts implements the STEP 15.76 independent trust-anchor mechanism (DRYRUN_SERVER_IDENTITY_ANCHOR)" — asserts the source contains `DRYRUN_SERVER_IDENTITY_ANCHOR`, `app.server_identity`, `current_setting('app.server_identity', true)`, the `UNVERIFIED ⚠` log message, the `VERIFIED ✅` log message, the `independent trust anchor confirmed` log message, and the `server-side trust anchor does not match` error message.

### 5.4 Test counts

| File | Tests before STEP 15.76 | Tests after STEP 15.76 | Δ |
|---|---|---|---|
| `tests/unit/rbac-preflight-logic.test.ts` | 75 | 77 | +2 |
| `tests/unit/rbac-dryrun-preflight.test.ts` | 91 | 94 | +3 |
| `tests/unit/rbac-gate-logic.test.ts` | 22 | 22 | 0 |
| **TOTAL** | **188** | **193** | **+5** |

All 193 tests pass.

---

## 6. Validation Results (Directive 5)

| Validation step | Command | Result |
|---|---|---|
| TypeScript typecheck | `bunx tsc --noEmit -p tsconfig.scripts.json` | exit 0 ✅ |
| ESLint | `bun run lint` | 0 errors (11 pre-existing warnings) ✅ |
| Unit tests (3 files) | `bunx vitest run tests/unit/rbac-preflight-logic.test.ts tests/unit/rbac-dryrun-preflight.test.ts tests/unit/rbac-gate-logic.test.ts` | 193 passed, 0 failed ✅ |
| Generated files reverted | `git checkout -- src/lib/generated/` | Done ✅ |

---

## 7. Files Changed

| # | File | Change |
|---|---|---|
| 1 | `scripts/rbac-backfill-dryrun.ts` | Renamed all "Content-based identity" / "Host identity" labels to "Schema/seed readiness" / "Hostname consistency". Added `DRYRUN_SERVER_IDENTITY_ANCHOR` reading, the early `UNVERIFIED ⚠` / `PENDING ⏳` log, and the post-DB-connect trust-anchor GUC query + comparison logic. Updated all comments and error messages to reflect the schema/seed readiness vs. server-identity distinction. |
| 2 | `tests/unit/rbac-preflight-logic.test.ts` | Added tests 9k and 9l. Updated tests 9d and 9j to assert the new `Hostname consistency` label. Updated `beforeEach` to clear `DRYRUN_SERVER_IDENTITY_ANCHOR`. |
| 3 | `tests/unit/rbac-dryrun-preflight.test.ts` | Renamed the STEP 15.75 describe block to "Schema/seed readiness verification". Updated the source-level tests for the 5-table check, the 5-role check, and the "via LIVE DB content" check. Added three new source-level tests for the renamed labels and the trust-anchor mechanism. |
| 4 | `docs/verification/STEP-15.76-REMEDIATION-REPORT.md` | NEW file — this report. |

---

## 8. Authorization Status

- **STEP 15.76 code remediation:** COMPLETE ✅ — labels renamed, trust-anchor mechanism implemented, 193 tests pass, typecheck + lint clean.
- **Trust-anchor GUC deployment (DBA-side):** NOT DEPLOYED ⏳ — the DBA must run `ALTER DATABASE <db> SET app.server_identity = '<value>';` on the production cluster before the trust-anchor check can return VERIFIED.
- **Staging dry-run execution:** NOT AUTHORIZED ⏳ (awaiting owner authorization per STEP 15.68 runbook).
- **End-to-end VERIFIED status:** NOT YET ACHIEVED ⚠ — requires (1) DBA deploys the GUC, (2) operator sets `DRYRUN_SERVER_IDENTITY_ANCHOR` to match, (3) staging dry-run confirms the GUC comparison succeeds.
- **Production backfill:** NOT AUTHORIZED ❌
- **Phase D cutover:** NOT AUTHORIZED ❌
- **Phase E drop column:** NOT AUTHORIZED ❌
- **Production deployment:** NOT AUTHORIZED ❌

---

## 9. Conclusion

**STEP 15.76 STATUS: COMPLETE ✅ (code) / UNVERIFIED ⚠ (operational deployment)**

All 5 owner directives are implemented at the code level:

1. ✅ Content checks renamed to "Schema/seed readiness" (NOT "identity")
2. ✅ Independent trust-anchor mechanism (`DRYRUN_SERVER_IDENTITY_ANCHOR` + GUC `app.server_identity`) added
3. ✅ Output labels fixed — "Host identity: verified ✅" overstatement removed; this report created
4. ✅ Behavioral tests 9k + 9l added; existing tests updated; source-level tests for the renamed labels + trust-anchor mechanism added
5. ✅ Validation passed — typecheck exit 0, lint 0 errors, 193/193 tests pass

**Finding D classification: UNVERIFIED** ⚠

The owner's directive explicitly classifies Finding 4 (server/cluster identity) as **UNVERIFIED** until the trust-anchor GUC is deployed by the DBA on the production cluster AND a staging dry-run confirms the GUC match works end-to-end. STEP 15.76 ships the mechanism; operational deployment is required to actually achieve VERIFIED status.

**193/193 unit tests PASS. Typecheck + lint clean. PRODUCTION: NO-GO ❌** (awaiting DBA GUC deployment + owner authorization for staging dry-run).
