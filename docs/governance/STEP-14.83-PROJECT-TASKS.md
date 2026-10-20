# HEAVIX — STEP 14.83 Project Task Breakdown

**Document:** `docs/governance/STEP-14.83-PROJECT-TASKS.md`
**Source directive:** Owner's STEP 14.83 governance directive (2026-10-20)
**Author:** HEAVIX Execution Agent (Z.ai Code, agent identity)
**Date:** 2026-10-20
**Main HEAD (baseline):** `582b41c104ebc434994044cbdbbfc952515b8f44`
**Status:** `SECURITY HOLD — MERGE HOLD — MIGRATION NO-GO — PRODUCTION NO-GO`

This document converts the owner's STEP 14.83 governance directive into a structured, trackable, auditable project task list. Every task has: ID, stage, priority, dependencies, owner role, acceptance criteria, required evidence, and stop criteria. No task may be marked complete without reproducible evidence.

---

## 0. Governing Principles (apply to ALL tasks)

| Principle | Requirement |
|---|---|
| **Evidence-first** | Every claim must cite source file:line, commit SHA, or CI run ID. Unverifiable claims tagged `UNVERIFIED`. |
| **No self-approval** | PR author cannot approve own PR (GitHub 422). Only `dellk00k` (push, non-admin) is a valid non-author reviewer. |
| **No impersonation** | Agent actions labeled `HEAVIX Execution Agent <agent@heavix.local>`. No review submitted as `dellk00k`. |
| **Separation of concerns** | Design approval ≠ implementation authorization. CI green ≠ merge-ready. Merge ≠ production-ready. |
| **Rollback-first** | Every destructive change must have a tested rollback path before execution. |
| **Critic mandatory** | Every major decision passes through `/Critic` questions (§9 of owner directive) before closure. |
| **Priority order** | Data security > Recoverability > Core function > Risk reduction > Delivery speed. |
| **No scope bloat** | Each PR addresses one concern. Separate PRs for separate fixes. |
| **Branch protection** | `required_approving_review_count=1`, `enforce_admins=True`, contexts=`[verify, audit-transaction, phase-tests]`. Verified HTTP 200 via PAT (owner's 403 was from a different integration — see T1.4). |

---

## 1. Stage Map (6 stages + E5 gate)

| Stage | Title | Priority | Blocked by | Task IDs |
|---|---|---|---|---|
| **S1** | Baseline stabilization (read-only) | P0 | — | T1.1–T1.5 |
| **S2** | PR #61 audit completion | P1 | S1 | T2.1–T2.6 |
| **S3** | PR #62 independent review | P2 | S1 | T3.1–T3.6 |
| **S4** | MIG-05 independent fix (separate PR) | P2 | S1 | T4.1–T4.4 (T4.1 DONE in PR #64) |
| **S5** | Final decision per PR | P3 | S2, S3, S4 | T5.1–T5.5 |
| **S6** | Independent migration & production release | P4 | S5, E5 | T6.1–T6.5 |
| **E5** | Backup/Restore gate (blocking S6) | P4 | — | E5.1–E5.6 |

**Cross-cutting:** role commands (`/research`, `/brainstorm`, `/detailed`, `/analyst`, `/expert`, `/ceo`, `/seo`, `/Critic`, `/strategy`) are applied as task attributes (§10), not separate tasks.

---

## 2. Stage S1 — Baseline Stabilization (read-only, P0)

**Goal:** Establish reproducible ground truth before any decision. No repo changes.

### T1.1 — Retrieve live PR state for all 4 PRs
- **Owner role:** Release manager
- **Dependencies:** none
- **Action:** For PRs #61, #62, #63, #64: retrieve HEAD SHA, base SHA, changed files, commit count, check-run results, review count via `GET /repos/.../pulls/{n}` + `/commits/{sha}/check-runs`.
- **Acceptance criteria:**
  - [ ] HEAD, base, commits, changed_files recorded for each PR
  - [ ] All 3 required checks (verify, audit-transaction, phase-tests) confirmed success on current HEAD
  - [ ] Review count = 0 for each PR (dellk00k has NOT reviewed)
- **Required evidence:** API response JSON or table with SHA + conclusion per check
- **Stop criteria:** any PR not in `mergeable=True` state → halt and investigate
- **Status:** ✅ DONE in STEP 14.83 (all 4 PRs verified: 3/3 CI success, 0 reviews)

### T1.2 — Verify main base SHA unchanged
- **Owner role:** Release manager
- **Dependencies:** T1.1
- **Action:** `git ls-remote origin main` and confirm SHA = `582b41c104ebc434994044cbdbbfc952515b8f44`.
- **Acceptance criteria:**
  - [ ] `origin/main` SHA recorded and matches baseline
  - [ ] If different → halt, re-baseline, re-audit all PRs against new base
- **Required evidence:** `git ls-remote` output
- **Stop criteria:** main has moved → all PRs need rebase/re-audit
- **Status:** ✅ DONE in STEP 14.83 (main = `582b41c`, unchanged)

### T1.3 — Verify connected account identity + permission
- **Owner role:** Security officer
- **Dependencies:** none
- **Action:** `GET /user` → confirm `login=HEAVIXIR`, `type=User`. `GET /repos/.../collaborators` → confirm HEAVIXIR (admin) + dellk00k (push, non-admin).
- **Acceptance criteria:**
  - [ ] Connected account = HEAVIXIR (not dellk00k)
  - [ ] dellk00k has push but NOT admin/maintain
  - [ ] HEAVIXIR is PR author on all 4 PRs → cannot self-approve
- **Required evidence:** `/user` + `/collaborators` JSON
- **Stop criteria:** token identity != HEAVIXIR → halt, do not push
- **Status:** ✅ DONE in STEP 14.83 (login=HEAVIXIR, id=327597280, type=User)

### T1.4 — Retrieve Branch Protection with admin-authorized connection
- **Owner role:** Security officer
- **Dependencies:** T1.3
- **Action:** `GET /repos/.../branches/main/protection`. **NOTE:** owner's STEP 14.83 report states this returned `403 Resource not accessible by integration` from their connection. The embedded PAT used by this agent returned HTTP 200 in STEP 14.81 and again just now (verified). Discrepancy must be resolved: the owner's connection is likely a GitHub App (integration) with different scopes than this PAT.
- **Acceptance criteria:**
  - [ ] Branch protection settings retrieved and recorded
  - [ ] `required_approving_review_count=1`, `dismiss_stale_reviews=true`, `enforce_admins=true`, `contexts=[verify, audit-transaction, phase-tests]`
  - [ ] Discrepancy between owner's 403 and agent's 200 documented — identify which connection (App vs PAT) the owner used
  - [ ] If owner requires App-based access, document the scope gap
- **Required evidence:** branch protection JSON + discrepancy note
- **Stop criteria:** protection settings cannot be confirmed → do NOT merge any PR
- **Status:** ✅ DONE via PAT (HTTP 200). Discrepancy with owner's 403 noted — owner likely used a GitHub App (integration) with restricted scopes. PAT used by agent has `repo` scope which grants branch-protection read access.

### T1.5 — Register UTC timestamp + full SHAs
- **Owner role:** Release manager
- **Dependencies:** T1.1–T1.4
- **Action:** Record UTC timestamp of baseline retrieval + full 40-char SHA for: main, PR #61 head, PR #62 head, PR #63 head, PR #64 head.
- **Acceptance criteria:**
  - [ ] Timestamp in ISO 8601 UTC
  - [ ] All 5 SHAs recorded (full 40 chars, not abbreviated)
  - [ ] Entry appended to `worklog.md`
- **Required evidence:** worklog entry with timestamp + SHA table
- **Stop criteria:** none (always completes)
- **Status:** ✅ DONE in STEP 14.83 (timestamp 2026-10-20T14:53:31Z, SHAs recorded in worklog §22)

---

## 3. Stage S2 — PR #61 Audit Completion (P1)

**Goal:** Resolve the 3 defects (D1, D2, D3) identified in STEP 14.83 audit before merge.

### T2.1 — Re-run RFQ test on PostgreSQL 17 in CI (fresh run on current HEAD)
- **Owner role:** Test engineer
- **Dependencies:** S1
- **Action:** Trigger a fresh CI run on PR #61 head `a124ca4` (or new HEAD if fixes pushed). Confirm the `verify` job executes `bunx vitest run tests/integration/*.test.ts` and the RFQ test file appears in the log.
- **Acceptance criteria:**
  - [ ] Fresh CI run ID recorded
  - [ ] Log line confirms: `✓ tests/integration/rfq-quote-visibility-real.test.ts (7 tests)`
  - [ ] No "skipped" keyword next to RFQ test (unlike auth.test.ts)
  - [ ] `DATABASE_URL` contains `localhost` → `RUN_TESTS=true` → `skipIf(!RUN_TESTS)` evaluates false
- **Required evidence:** CI run URL + log excerpt (grep for `rfq-quote-visibility-real`)
- **Stop criteria:** tests skipped or not found in log → REQUEST_CHANGES
- **Status:** ✅ DONE in STEP 14.83 (CI run 39419476047, 7 tests ran, not skipped)

### T2.2 — Verify 7-test count + no skip
- **Owner role:** Test engineer
- **Dependencies:** T2.1
- **Action:** Download verify job logs, grep for the RFQ test line, confirm `(7 tests)` with no `| N skipped` suffix.
- **Acceptance criteria:**
  - [ ] Log line: `✓ tests/integration/rfq-quote-visibility-real.test.ts (7 tests) <duration>ms`
  - [ ] No `skipped` keyword on that line
  - [ ] All 7 test names identifiable in log (buyer, seller-quoter, unrelated-seller, null, empty, undefined, whitespace)
- **Required evidence:** downloaded log file + grep output
- **Stop criteria:** any test skipped → REQUEST_CHANGES
- **Status:** ✅ DONE in STEP 14.83 (downloaded 170KB log, grep confirmed `(7 tests) 304ms`, no skip)

### T2.3 — Fix cleanup so errors cause visible test failure (D1)
- **Owner role:** Test engineer
- **Dependencies:** T2.2
- **Action:** In `tests/integration/rfq-quote-visibility-real.test.ts` `afterAll`: replace `try { ... } catch (e) { console.error(...) }` with a pattern that surfaces cleanup failure as a test failure. Options: (a) re-throw after logging, (b) use vitest `onTestFailed` hook, (c) collect errors and assert empty in a final test.
- **Acceptance criteria:**
  - [ ] Cleanup failure causes CI to fail (not just console log)
  - [ ] Error message includes the failed entity type + ID for debugging
  - [ ] Existing passing path still passes (no false positives)
- **Required evidence:** diff + CI run showing the fix
- **Stop criteria:** cleanup failure still silent → REQUEST_CHANGES
- **Status:** ❌ NOT DONE — defect D1 outstanding. Requires PR #61 author to push fix.

### T2.4 — Test partial setup failure + prevent unrelated record deletion (D2)
- **Owner role:** Test engineer
- **Dependencies:** T2.3
- **Action:** Refactor `beforeAll` to track successfully-created entities in an array. `afterAll` cleans up only those entities. If `beforeAll` throws mid-setup, `afterAll` must not attempt `delete({where:{id:undefined}})` (which throws) or `deleteMany({where:{id:{in:[...,undefined,...]}}})` (which silently ignores undefined).
- **Acceptance criteria:**
  - [ ] `createdEntities` array tracks each successful create
  - [ ] `afterAll` iterates `createdEntities` and deletes only those
  - [ ] Partial-failure scenario tested: inject a failure mid-`beforeAll`, confirm no orphaned data, no `undefined` ID passed to delete
  - [ ] No unrelated records deleted (testRunId scoping preserved)
- **Required evidence:** diff + a test case that simulates partial beforeAll failure
- **Stop criteria:** partial failure orphans data → REQUEST_CHANGES
- **Status:** ❌ NOT DONE — defect D2 outstanding. Requires PR #61 author to push fix.

### T2.5 — Separately evaluate PGlite helper necessity/correctness (D3)
- **Owner role:** Test engineer + architect
- **Dependencies:** T2.2
- **Action:** Assess `start-pglite-fixed.ts` (70 lines). It patches PGlite protocol for local dev. CI uses real `postgres:17` service — pglite is NOT invoked in CI. Determine: (a) is it necessary for the PR's test? (b) does it belong in a test PR? (c) should it move to a separate dev-tooling PR?
- **Acceptance criteria:**
  - [ ] Documented: pglite is NOT used in CI (real postgres:17 service is used)
  - [ ] Documented: file is not referenced by any other file in the repo
  - [ ] Decision recorded: keep (with PR body note) OR move to separate dev-tooling PR OR remove
  - [ ] If kept: PR body updated to explain it's an optional local-dev helper
- **Required evidence:** grep for references + decision note in PR body or separate PR
- **Stop criteria:** pglite file invoked in CI (would indicate test is not using real PostgreSQL) → REQUEST_CHANGES
- **Status:** ✅ ASSESSED in STEP 14.83 (pglite NOT used in CI, not referenced elsewhere). Decision: LOW risk, optional. Recommend PR #61 body note OR move to separate dev-tooling PR.

### T2.6 — Document test data isolation (testRunId, concurrent-run behavior)
- **Owner role:** Test engineer
- **Dependencies:** T2.4
- **Action:** Document that `testRunId = test-${Date.now()}-${random}` ensures uniqueness across runs. Verify concurrent CI runs (if any) do not collide. Confirm cleanup deletes only records matching `testRunId` suffix.
- **Acceptance criteria:**
  - [ ] `testRunId` uniqueness mechanism documented
  - [ ] Cleanup `where` clauses scoped to `testRunId` (no global deletes)
  - [ ] Concurrent-run safety assessed (low risk: CI runs are typically serial per PR)
- **Required evidence:** test file analysis + concurrent-run assessment note
- **Stop criteria:** cleanup could delete other runs' data → REQUEST_CHANGES
- **Status:** ✅ ASSESSED in STEP 14.83 (testRunId = `test-${Date.now()}-${random}`, cleanup scoped to created entities, low concurrent-run risk).

---

## 4. Stage S3 — Independent Review of PR #62 (P2)

**Goal:** Independently verify the RBAC migration design against current code. Design approval only — NOT implementation authorization.

### T3.1 — Rebuild 18 direct + 1 indirect inventory from current code
- **Owner role:** Security architect
- **Dependencies:** S1
- **Action:** Re-run `grep -rnE "user\.role|User\.role|\.role\b" src/ tests/` (excluding false positives). For each match, read the file:line and classify.
- **Acceptance criteria:**
  - [ ] 14 role-value reads identified (E1 #1–#10 + A.1–A.4 audit payloads)
  - [ ] 1 write identified (admin/users/[id]/route.ts:173)
  - [ ] 3 Prisma selects identified (conversations/[id]:99, :110, seller-service:117)
  - [ ] 1 indirect path identified (conversations/[id]:290 via Conversation.participant1/participant2)
  - [ ] Total: 18 direct + 1 indirect = 19 conservative Phase E paths
  - [ ] Each entry has file:line + classification
- **Required evidence:** grep output + per-entry classification table
- **Stop criteria:** count != 19 → investigate before proceeding
- **Status:** ✅ DONE in STEP 14.83 (all 19 paths verified by reading source, recorded in worklog §22)

### T3.2 — Classify each path: display / input / role-write / authorization-decision
- **Owner role:** Security architect
- **Dependencies:** T3.1
- **Action:** For each of the 19 paths, classify the consumer type.
- **Acceptance criteria:**
  - [ ] Display consumers (badge labels, API response fields, audit payloads): identified
  - [ ] Input consumers (body.role — API request input, NOT User.role read): excluded as false positive
  - [ ] Role-write consumers (data.role = r): identified, guarded by `user.role.manage` permission
  - [ ] Authorization-decision consumers: **MUST BE ZERO** — isAdmin/getUserPermissions/adminGuard are RBAC-only (verified in STEP 14.83)
  - [ ] Classification table produced
- **Required evidence:** classification table with file:line + type + guard
- **Stop criteria:** any authorization-decision consumer found using User.role → CRITICAL, halt
- **Status:** ✅ DONE in STEP 14.83 (authorization is 100% RBAC-only; 0 authorization-decision consumers of User.role)

### T3.3 — Verify fallback behavior on DB error, missing UserRole, missing User
- **Owner role:** Security architect
- **Dependencies:** T3.2
- **Action:** Read the proposed Phase A helper contract (§2 of design doc). Verify: `getUserPrimaryRole(null)` → "BUYER", `getUserPrimaryRole(undefined)` → "BUYER", zero UserRole rows → "BUYER", DB error → "BUYER" + log.
- **Acceptance criteria:**
  - [ ] All 4 fail-closed paths return "BUYER"
  - [ ] Error path logs to console.error (visible in CI)
  - [ ] Fail-closed affects DISPLAY ONLY (authorization already RBAC-only, unaffected)
  - [ ] 8 mock-based unit tests planned (no live DB required)
- **Required evidence:** design doc §2 excerpt + verification note
- **Stop criteria:** fallback could affect authorization → CRITICAL, halt
- **Status:** ✅ DONE in STEP 14.83 (all 4 fail-closed paths return "BUYER", display-only, 8 mock tests planned)

### T3.4 — Define conversation-page regression tests (valid/missing/error roles)
- **Owner role:** Test engineer
- **Dependencies:** T3.3
- **Action:** Per owner directive: regression test must cover (a) valid roles render correctly, (b) missing role (user with zero UserRole) renders fallback without error, (c) role-fetch error does not crash the page.
- **Acceptance criteria:**
  - [ ] Test file path identified (`tests/integration/conversation-page-regression-real.ts` or E2E)
  - [ ] 3 scenarios defined: valid roles, missing UserRole, DB error during role fetch
  - [ ] Test asserts `نقش:` label renders (non-`—` for valid, `—` or fallback for missing/error)
  - [ ] Test is a Phase E pre-condition (§7.1 of design doc)
- **Required evidence:** test design spec (not yet implemented — implementation is Phase B task)
- **Stop criteria:** regression test not defined before Phase B → block Phase B
- **Status:** ✅ SPECIFIED in PR #62 design doc §12 finding #9 (3 scenarios: valid/missing/error). Implementation deferred to Phase B.

### T3.5 — Document backfill/count-reconciliation/rollback/stop-gate steps
- **Owner role:** Migration engineer
- **Dependencies:** T3.3
- **Action:** Verify Phase C backfill script design (§4 of design doc): idempotent, never deletes, cursor-based, reports orphans. `orphans == 0` is hard gate before Phase D. Rollback per phase documented (§9).
- **Acceptance criteria:**
  - [ ] Backfill script design reviewed
  - [ ] Idempotency proven (findUnique before create)
  - [ ] `orphans == 0` gate documented as Phase D pre-condition
  - [ ] Rollback plan per phase (A/B/C/D/E) documented
  - [ ] Stop criteria per phase defined
- **Required evidence:** design doc §4 + §9 review notes
- **Stop criteria:** rollback plan incomplete for any phase → block that phase
- **Status:** ✅ DONE in STEP 14.83 (backfill idempotent, orphans gate documented, rollback per phase in §9)

### T3.6 — Separate design-doc approval from implementation authorization
- **Owner role:** CTO
- **Dependencies:** T3.1–T3.5
- **Action:** Explicitly record: PR #62 approval = design document review only. Does NOT authorize Phase A implementation, backfill, or column drop.
- **Acceptance criteria:**
  - [ ] Approval scope statement recorded in PR #62 review comment
  - [ ] Phase A requires separate PR + separate approval
  - [ ] Phase E (column drop) requires E5 backup/restore rehearsal + Phase D deployed + telemetry clean for 7 days
- **Required evidence:** PR #62 review comment with scope statement
- **Stop criteria:** approval construed as implementation authorization → halt
- **Status:** ⏳ PENDING — awaits dellk00k's review submission with explicit scope statement.

---

## 5. Stage S4 — MIG-05 Independent Fix (separate PR, P2)

**Goal:** Fix the stale MIG-05 string + add prevention test. PR #64 already addresses the string fix (T4.1 DONE).

### T4.1 — Fix stale 42 → valid source value ✅ DONE
- **Status:** COMPLETED in PR #64 (commit `82f652c`, head `82f652c0da4351ad5d60ee2c9a5bb98a07fe9796`).
- **Change:** `production-readiness-gate.ts:84` title "42 pages" → "38 pages", evidence "pending = 42" → "pending = 38 (verified: grep ... = 38)".
- **CI:** verify ✓ / audit-transaction ✓ / phase-tests ✓ (3/3 success).
- **Awaiting:** dellk00k independent review.

### T4.2 — Review count logic instead of relying on static text
- **Owner role:** Migration engineer
- **Dependencies:** T4.1 merged
- **Action:** Assess whether `production-readiness-gate.ts` should compute `migrationStats().pending` dynamically at module load (import from `legacy-migration-checklist.ts`) instead of hardcoding the count string.
- **Acceptance criteria:**
  - [ ] Trade-off documented: dynamic count (always accurate) vs static (simpler, but drifts)
  - [ ] Recommendation recorded
  - [ ] If dynamic: separate PR to add import + replace string with template literal
- **Required evidence:** analysis note
- **Stop criteria:** none (analysis only)
- **Status:** ⏳ PENDING — analysis note recommended in PR #64 body. Two options proposed: (a) dynamic count at module load, (b) CI assertion test (T4.3).

### T4.3 — Add sync test between checklist PENDING count and gate evidence
- **Owner role:** Test engineer
- **Dependencies:** T4.1 merged
- **Action:** Add a vitest test (e.g., `tests/contract/gate-count-sync.test.ts`) that imports `migrationStats()` from `legacy-migration-checklist.ts` and asserts the actual PENDING count matches the value embedded in the MIG-05 gate entry's evidence string. Fails if they diverge.
- **Acceptance criteria:**
  - [ ] Test file created
  - [ ] Test parses MIG-05 evidence string for the count
  - [ ] Test asserts `migrationStats().pending === parsedCount`
  - [ ] Test added to CI `verify` job
  - [ ] CI green
- **Required evidence:** test file + CI run showing test passes
- **Stop criteria:** test fails on current source → investigate (would indicate T4.1 incomplete)
- **Status:** ❌ NOT DONE — requires separate PR after T4.1 merges.

### T4.4 — Run CI + document before/after diff
- **Owner role:** Release manager
- **Dependencies:** T4.3
- **Action:** Record CI run before T4.3 (count=38, no sync test) and after (count=38, sync test passes). Document the diff.
- **Acceptance criteria:**
  - [ ] Before/after CI run IDs recorded
  - [ ] Diff shows: MIG-05 string fixed + sync test added
  - [ ] Both runs green
- **Required evidence:** CI run URLs + diff summary
- **Stop criteria:** after-run red → fix before merge
- **Status:** ⏳ PENDING — blocked on T4.3.

---

## 6. Stage S5 — Final Decision per PR (P3)

**Goal:** Issue independent APPROVE / REQUEST_CHANGES / HOLD for each PR based on final diff (not PR description).

### T5.1 — Review final diff (not just PR description) for each PR
- **Owner role:** Independent reviewer (dellk00k)
- **Dependencies:** S2, S3, S4
- **Action:** For each PR, run `git diff main...<branch>` and review the actual code/doc changes. Do NOT rely on PR body text.
- **Acceptance criteria:**
  - [ ] Full diff reviewed for PR #61, #62, #63, #64
  - [ ] Any unexpected changes flagged
  - [ ] Review notes recorded
- **Required evidence:** reviewer's diff analysis (recorded as PR review)
- **Stop criteria:** unexpected files in diff → REQUEST_CHANGES
- **Status:** ⏳ PENDING dellk00k action (agent cannot perform — agent is PR author)

### T5.2 — Confirm all required checks pass on current HEAD
- **Owner role:** Release manager
- **Dependencies:** T5.1
- **Action:** For each PR head SHA, query `GET /commits/{sha}/check-runs` and confirm verify/audit-transaction/phase-tests all `completed` + `success`.
- **Acceptance criteria:**
  - [ ] 3/3 checks success on each PR's current HEAD
  - [ ] No `in_progress` or `failure` states
- **Required evidence:** check-runs API response
- **Stop criteria:** any check not success → wait or investigate
- **Status:** ✅ DONE in STEP 14.83 (all 4 PRs: 3/3 success)

### T5.3 — Register reviewer + resolve all blocking items
- **Owner role:** Independent reviewer (dellk00k)
- **Dependencies:** T5.1, T5.2
- **Action:** dellk00k submits formal review (APPROVE / REQUEST_CHANGES / COMMENT) via `POST /pulls/{n}/reviews`. Resolve all blocking items from S2/S3/S4.
- **Acceptance criteria:**
  - [ ] Review submitted by dellk00k (not HEAVIXIR — author cannot self-approve)
  - [ ] All S2 defects (D1, D2) resolved on PR #61 before APPROVE
  - [ ] S3 inventory verified on PR #62 before APPROVE
  - [ ] S4 MIG-05 fix verified on PR #64 before APPROVE
- **Required evidence:** review API response (reviewer=dellk00k, state=APPROVE)
- **Stop criteria:** blocking items unresolved → REQUEST_CHANGES
- **Status:** ⏳ PENDING dellk00k action (0 reviews on all 4 PRs)

### T5.4 — Verify review policy + authorized identity for Approve
- **Owner role:** Security officer
- **Dependencies:** T5.3
- **Action:** Confirm reviewer identity = dellk00k (push permission, non-admin, non-author). Confirm branch protection satisfied (1 approving review).
- **Acceptance criteria:**
  - [ ] Reviewer login = dellk00k
  - [ ] Review state = APPROVE
  - [ ] Branch protection reports `mergeable_state=clean` (not `blocked`)
- **Required evidence:** PR API response showing review + mergeable_state
- **Stop criteria:** reviewer is HEAVIXIR (author) → invalid, GitHub 422
- **Status:** ⏳ PENDING T5.3

### T5.5 — Issue independent Merge decision per PR
- **Owner role:** Release manager
- **Dependencies:** T5.4
- **Action:** For each PR, decide: MERGE / HOLD / ABANDON. If MERGE: merge one at a time, verify main + CI after each. Suggested order: #64 → #61 (after D1/D2 fixes) → #62 → #63.
- **Acceptance criteria:**
  - [ ] Decision recorded per PR with rationale
  - [ ] If MERGE: `mergeable_state=clean` confirmed before merge
  - [ ] After each merge: `origin/main` SHA recorded, CI re-verified on main
  - [ ] If any PR's pre-conditions violated → halt the chain
- **Required evidence:** merge API response or HOLD decision with rationale
- **Stop criteria:** chain halted → do not merge subsequent PRs
- **Status:** ⏳ PENDING T5.4. Agent recommendation (not binding): #64 APPROVE, #61 REQUEST_CHANGES (D1/D2), #62 APPROVE, #63 APPROVE.

---

## 7. Stage S6 — Independent Migration & Production Release (P4)

**Goal:** Migration and production release are SEPARATE decisions. One does not auto-free the other.

### T6.1 — Execute Backup/Restore rehearsal (E5 gate — see §8)
- **Dependencies:** E5.1–E5.6 all PASS
- **Action:** See E5 gate below. BLOCKED until real PostgreSQL available.
- **Status:** ❌ BLOCKED (no PostgreSQL in sandbox)

### T6.2 — Verify schema/data/permission compatibility
- **Owner role:** Migration engineer
- **Dependencies:** T6.1, Phase A–D merged + deployed
- **Action:** Run migration on staging copy. Verify schema hash matches, data row counts match, permissions (UserRole rows) match User.role distribution.
- **Acceptance criteria:**
  - [ ] Schema hash identical pre/post migration (for non-target tables)
  - [ ] User.role distribution == UserRole distribution (post-backfill)
  - [ ] No permission loss (every user with User.role=X has UserRole with role.key=X)
- **Required evidence:** migration log + reconciliation report
- **Stop criteria:** any mismatch → rollback, investigate
- **Status:** ❌ NOT STARTED (blocked on T6.1)

### T6.3 — Execute migration plan in test environment
- **Owner role:** Migration engineer
- **Dependencies:** T6.2
- **Action:** Execute Phase A → B → C → D → E per design doc. Each phase merged + deployed + telemetry clean before next.
- **Acceptance criteria:**
  - [ ] Phase A: helper + 8 unit tests, CI green, deployed
  - [ ] Phase B: shim + dual-write, integration tests green, deployed
  - [ ] Phase C: backfill run, `orphans == 0`, audit logged
  - [ ] Phase D: cutover, telemetry clean for 7 days
  - [ ] Phase E: column dropped, smoke tests pass
- **Required evidence:** per-phase completion report
- **Stop criteria:** any phase fails → rollback that phase, halt chain
- **Status:** ❌ NOT STARTED (blocked on T6.2)

### T6.4 — Test rollback + register stop criteria
- **Owner role:** Migration engineer
- **Dependencies:** T6.3
- **Action:** For each phase, test the rollback procedure on staging. Record stop criteria (when to abandon migration and revert).
- **Acceptance criteria:**
  - [ ] Rollback tested per phase (A/B/C/D/E)
  - [ ] Stop criteria documented per phase
  - [ ] Reverse-backfill script (Phase E rollback) tested
- **Required evidence:** rollback test logs + stop-criteria document
- **Stop criteria:** rollback fails → do not proceed to next phase
- **Status:** ❌ NOT STARTED (blocked on T6.3)

### T6.5 — Assess release readiness with checklist + evidence
- **Owner role:** CTO
- **Dependencies:** T6.4
- **Action:** Run `gateStats()` from `production-readiness-gate.ts`. Confirm all CRITICAL + HIGH items PASS. Review the 10 exit-HOLD criteria (§9).
- **Acceptance criteria:**
  - [ ] `gateDecision=GREEN` (no CRITICAL/HIGH pending)
  - [ ] All 10 exit-HOLD criteria met (§9)
  - [ ] E5 backup/restore rehearsal PASS
  - [ ] Production build succeeds
  - [ ] Runtime smoke tests pass
- **Required evidence:** gate stats JSON + exit-HOLD checklist
- **Stop criteria:** any criterion unmet → PRODUCTION NO-GO
- **Status:** ❌ NOT STARTED (blocked on T6.4)

---

## 8. E5 — Backup/Restore Gate (blocking S6)

**Status:** `NOT EXECUTED` — no real PostgreSQL in sandbox. BLOCKED.

### E5.1 — Produce real backup of target environment
- **Owner role:** Ops engineer
- **Dependencies:** real PostgreSQL available
- **Action:** `pg_dump --clean --if-exists` per `docs/database/POSTGRES-BACKUP.md`. Target: `/home/z/my-project/db/backups/heavix-<timestamp>.sql`.
- **Acceptance criteria:**
  - [ ] Backup file created on disk
  - [ ] File size > 0
  - [ ] Timestamp in filename
- **Required evidence:** `ls -la` of backup file
- **Stop criteria:** pg_dump fails → halt
- **Status:** ❌ BLOCKED (no PostgreSQL in sandbox)

### E5.2 — Verify file integrity, size, time, accessibility, readability
- **Owner role:** Ops engineer
- **Dependencies:** E5.1
- **Action:** `file backup.sql` (should be text), `head -5 backup.sql` (should show PostgreSQL header), `wc -l backup.sql` (record line count).
- **Acceptance criteria:**
  - [ ] File is readable text
  - [ ] Contains PostgreSQL dump header
  - [ ] Line count recorded
- **Required evidence:** command outputs
- **Stop criteria:** file corrupt or empty → halt
- **Status:** ❌ BLOCKED (E5.1)

### E5.3 — Restore in separate environment
- **Owner role:** Ops engineer
- **Dependencies:** E5.2
- **Action:** Create fresh database, `psql < backup.sql` per `docs/database/POSTGRES-RESTORE.md`.
- **Acceptance criteria:**
  - [ ] Restore completes without error
  - [ ] All tables created
  - [ ] No missing-extension errors
- **Required evidence:** psql output log
- **Stop criteria:** restore fails → halt
- **Status:** ❌ BLOCKED (E5.2)

### E5.4 — Verify data integrity, tables, relations, key record counts
- **Owner role:** Ops engineer
- **Dependencies:** E5.3
- **Action:** Query `information_schema.tables` count. Query row counts for key tables (User, UserRole, Role, RFQ, RFQQuote, etc.). Compare to source.
- **Acceptance criteria:**
  - [ ] Table count matches source
  - [ ] Key table row counts match source
  - [ ] Foreign key relations intact
- **Required evidence:** SQL query results (source vs restored)
- **Stop criteria:** count mismatch → investigate data loss
- **Status:** ❌ BLOCKED (E5.3)

### E5.5 — Register restore time + any data loss
- **Owner role:** Ops engineer
- **Dependencies:** E5.4
- **Action:** Time the restore operation. Record any rows that failed to restore.
- **Acceptance criteria:**
  - [ ] Restore duration recorded
  - [ ] Data loss (if any) documented per table
- **Required evidence:** timing log + loss report
- **Stop criteria:** unacceptable data loss → halt
- **Status:** ❌ BLOCKED (E5.4)

### E5.6 — Publish final report with PASS/FAIL + evidence reference
- **Owner role:** Release manager
- **Dependencies:** E5.5
- **Action:** Publish report: `docs/verification/E5-BACKUP-RESTORE-REHEARSAL.md` with PASS/FAIL + evidence links.
- **Acceptance criteria:**
  - [ ] Report file created
  - [ ] Verdict: PASS or FAIL
  - [ ] Evidence links to E5.1–E5.5 outputs
  - [ ] Report reviewed by dellk00k
- **Required evidence:** report file path
- **Stop criteria:** FAIL → E5 gate remains BLOCKED
- **Status:** ❌ BLOCKED (E5.5)

---

## 9. Exit-HOLD Criteria (10 master gates)

All 10 must be independently verified to change the decision from `HOLD` to `GO`.

| # | Criterion | Verification task | Status |
|---|---|---|---|
| 1 | Live HEAD + status of each PR recorded | T1.1, T1.5 | ✅ DONE (STEP 14.83) |
| 2 | CI success on current commit | T5.2 | ✅ DONE (3/3 on all 4 PRs) |
| 3 | Independent authorized review per repo policy | T5.3, T5.4 | ❌ PENDING (0 reviews, awaiting dellk00k) |
| 4 | PR #61 cleanup + setup defects resolved | T2.3, T2.4 | ❌ PENDING (D1/D2 not fixed) |
| 5 | PR #62 inventory + fallbacks verified | T3.1, T3.3 | ✅ DONE (STEP 14.83) |
| 6 | MIG-05 independent fix done + validated | T4.1, T4.3 | ⏳ PARTIAL (T4.1 done in PR #64, T4.3 not done) |
| 7 | Order/Payment contract tests verified in CI | (PR #63 RN-3) | ❌ PENDING (not corroborated) |
| 8 | Backup/Restore rehearsed in separate env | E5.1–E5.6 | ❌ BLOCKED (no PostgreSQL) |
| 9 | Migration rollback documented + tested | T6.4 | ❌ NOT STARTED |
| 10 | Security + release checklist clear | T6.5 | ❌ NOT STARTED |

**Current state:** 3/10 met (criteria 1, 2, 5). 7/10 outstanding. Decision remains `HOLD`.

---

## 10. Cross-Cutting Role Commands (task attributes)

These are applied as quality gates on tasks, not as standalone tasks.

### /research — Evidence & Sources
- Every task cites source file:line, commit SHA, or CI run ID
- Claims compared to actual code + logs
- Tooling/version/dependency state checked
- Unknown items tagged `UNVERIFIED`
- No conclusive claim without sufficient evidence

### /brainstorm — Solution Options
For major decisions (T2.3 cleanup pattern, T3.4 regression test approach, T4.2 dynamic vs static count, T6.3 migration phases), document ≥3 options:
1. Lowest-risk minimal fix
2. Structural/durable solution
3. Alternative with lower cost/complexity

Each option: security impact, complexity, maintenance cost, rollback capability. Decision not based on implementation simplicity alone.

### /detailed — Precise Execution
Each task specifies: goal, scope, prerequisites, allowed files, forbidden files, test commands, success criteria, stop criteria, expected output, rollback conditions, final report format. Vague directives like "fix everything" or "make CI green" are not acceptable.

### /analyst — Technical Analysis
- Root cause separated from surface symptom
- Hypotheses confirmed/rejected with evidence
- Impact on dependent paths + user roles analyzed
- Potential errors + failure scenarios examined before merge
- "Test passed" ≠ "behavior is secure" made explicit

### /expert — Engineering Standard
- TypeScript, Prisma, DB, RBAC with clear contracts
- Error + fallback behavior explicit
- Positive, negative, boundary, partial-failure tests covered
- Unnecessary helper tools kept out of production execution path
- New code consistent with existing patterns (not just "works locally")

### /ceo — Senior Management
Priority: data security > recoverability > core function > risk reduction > delivery speed. Every management report states: status, risk, decision needed, action owner, exit-HOLD criteria. No deadline/business goal alone justifies skipping security control.

### /seo — Discoverability & SEO (separate track, not blocking current HOLD)
Plan (not yet audited):
- Metadata, titles, canonicals
- Sitemap, robots, public-page indexability
- Speed, Core Web Vitals, mobile experience
- Structured data (if applicable)
- Prevent indexing of private/admin/RFQ/auth-required pages
- 404s, redirects, internal links
- Technical SEO separate from rank/traffic/conversion
- **Security criterion:** SEO optimization must not expose private data or weaken access controls

### /Critic — Independent Critic
Every major claim questioned:
- Is there independent evidence?
- Was the result on the claimed commit?
- Did tests actually run or were they skipped?
- Do cleanup + rollback work on failure?
- Are counts computed from source or static text?
- Does design match current code?
- Can an independent reviewer reproduce the result?
- Critic reports evidence AGAINST the proposed decision, not just confirmation.

### /strategy — Project Strategy
- **Short-term:** stabilize baseline, complete 3-PR audit, fix MIG-05 (S1, S2, S3, S4)
- **Mid-term:** complete + validate RBAC migration, order/payment contract tests, prove backup/restore (S6, E5)
- **Long-term:** automate count-sync, prevent unwanted test skips, control sensitive changes, generate auditable per-release reports
- **Strategic principle:** security + readiness state derived from evidence, not manual text or individual interpretation.

---

## 11. Review & Merge Policy (binding on all tasks)

| Rule | Enforcement |
|---|---|
| No PR merged solely for author approval or CI success | Branch protection enforces 1 approving review from non-author |
| Author + independent reviewer are separate roles | HEAVIXIR authors, dellk00k reviews |
| Exact reviewed SHA recorded per approval | Review API records `commit_id` |
| New commit in PR → re-evaluate evidence + result | Fresh CI run required on new HEAD |
| Sensitive change (RBAC/data/migration) → risk-proportionate review | T3.x, T6.x have extra gates |
| GitHub requires human approval → only authorized reviewer satisfies | dellk00k only |
| Merge only after final branch-protection + checks + no blockers | T5.1–T5.4 |
| No command to delete controls, bypass branch protection, or rewrite history to hide errors | Hard rule — never execute |

---

## 12. Summary

| Metric | Value |
|---|---|
| Total tasks | 30 (T1.1–T1.5, T2.1–T2.6, T3.1–T3.6, T4.1–T4.4, T5.1–T5.5, T6.1–T6.5, E5.1–E5.6) |
| Stages | 6 (S1–S6) + E5 gate |
| Cross-cutting role commands | 9 (/research, /brainstorm, /detailed, /analyst, /expert, /ceo, /seo, /Critic, /strategy) |
| Exit-HOLD criteria | 10 (3 met, 7 outstanding) |
| Tasks completed | T1.1–T1.5 (5), T2.1, T2.2, T2.5, T2.6 (4), T3.1–T3.5 (5), T4.1 (1) = **15 done** |
| Tasks pending | T2.3, T2.4, T3.6, T4.2, T4.3, T4.4, T5.1–T5.5 (9 pending dellk00k/author) |
| Tasks blocked | E5.1–E5.6 (6), T6.1–T6.5 (5) = 11 blocked on E5 + S5 |
| Open PRs | 4 (#61, #62, #63, #64) — all awaiting dellk00k review |
| Decision | `SECURITY HOLD — MERGE HOLD — MIGRATION NO-GO — PRODUCTION NO-GO` |

**Next authorized action:** dellk00k independently reviews PR #64 (lowest risk, one-line fix) → PR #61 (after D1/D2 fixes) → PR #62 → PR #63. After all APPROVEs: merge in order, verify main + CI after each. Then Phase A implementation, then E5 rehearsal, then Phase 3 migration.

---

**END OF PROJECT TASK BREAKDOWN.**

This document is a planning artifact. It does not authorize any merge, migration, or production deployment. Every task closure requires reproducible evidence recorded in `worklog.md` and (where applicable) a PR review by dellk00k.
