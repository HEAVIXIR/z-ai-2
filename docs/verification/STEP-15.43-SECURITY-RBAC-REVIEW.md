# STEP-15.43-C — Independent Security & RBAC Authorization Review

**Task ID:** `STEP-15.43-C`
**Agent:** HEAVIX Agent C — Security/RBAC Reviewer (read-only)
**Date:** 2026-10-22
**Repository:** `/home/z/heavix-15-42/z-ai-2`
**Branch / HEAD:** `phase-b/rbac-dual-read` @ `1b0d9e8e576b4ef55cec96ff0a50f03e20e09394`
**Base for diff:** `18536ac` (per STEP-15.42-C2 instructions)

---

## 1. Mission

Independent, read-only audit of the Phase B RBAC dual-write diff. Verify the
10 security invariants by reading the actual source code — prior agent reports
are consulted only as cross-reference, **not trusted**. Read-only mandate: no
code modifications; the only file authored is this report.

## 2. Method

- Read 11 source files + 2 test files + 1 Prisma schema slice.
- Used `Read` tool, scoped `Grep` tool, and `git diff` for invariant-by-invariant
  verification.
- Re-ran the exact grep commands from the task instructions to verify the
  critical REVISION-7 invariant independently of prior reports.
- Verified each `db.$transaction` body line-by-line against the contract:
  legacy `User.role` update + canonical `UserRole` write, wrapped atomically.
- Verified the `deleteMany` filter keys against the `replaceableKeys` constant
  to confirm MODERATOR / SUPPORT are untouched.

### Files read in full
| # | Path | Purpose |
|---|------|---------|
| 1 | `src/lib/authorization/role-shim.ts` | NEW display-only shim |
| 2 | `src/lib/authorization/user-roles.ts` | MODIFIED — `getUserPrimaryRoleWithStatus` |
| 3 | `src/lib/authorization/index.ts` | `can` / `isAdmin` / `requirePermission` |
| 4 | `src/lib/rbac-legacy.ts` | `getUserPermissions` (canonical RBAC chain) |
| 5 | `src/lib/rbac.ts` | Re-export shim for legacy imports |
| 6 | `src/lib/admin-guard.ts` | `adminGuard` / `requireAdmin` / `requireOwnership` |
| 7 | `src/app/api/admin/users/[id]/route.ts` | W1 PATCH (BLOCKER-1 dual-write) |
| 8 | `src/app/api/admin/users/route.ts` | W3 admin POST dual-write |
| 9 | `src/app/api/auth/register/route.ts` | W2 register POST dual-write |
| 10 | `src/app/dashboard/page.tsx` | Display-only shim consumer |
| 11 | `src/app/admin/sellers/[id]/page.tsx` | Display-only shim consumer |
| 12 | `src/components/admin/sections/users-section.tsx` | Client-side legacy read |
| 13 | `src/components/admin/user-detail-drawer.tsx` | Client-side legacy read |
| 14 | `tests/security/rbac-phase-b.test.ts` | Automated invariant guards |
| 15 | `tests/integration/rbac-phase-b-real.test.ts` | Real PostgreSQL C-1 / C-2 |
| 16 | `prisma/schema.prisma` (UserRole model only) | `@@unique([userId, roleId])` |

## 3. 10-Invariant Matrix

| # | Invariant | Verdict | Evidence (file:line) |
|---|---|---|---|
| 1 | Authorization decisions resolve through canonical RBAC chain `UserRole → Role → RolePermission → Permission` | **PASS** | `src/lib/rbac-legacy.ts:20-46` — `getUserPermissions()` queries `db.userRole.findMany → role → permissions → permission` graph. NO `User.role` consultation (verified: 0 matches in file). `src/lib/authorization/index.ts:41-52` `can()` delegates to `getUserPermissions` and returns `false` on error; `requirePermission` (L89-97) wraps `can`. `isAdmin` (L144-158) queries `db.userRole.findFirst({ where: { userId, role: { key: 'ADMIN' } } })` — pure RBAC, no legacy column. `src/lib/rbac.ts:17-30` re-exports `can`/`requirePermission`/`isAdmin` from the new authorization module; `src/lib/admin-guard.ts:50-65` uses `isAdmin` + `can` only. |
| 2 | The compatibility shim is NOT used as an authorization source (REVISION-7 critical) | **PASS (CRITICAL)** | Ran: `grep -n 'role-shim' src/lib/authorization/index.ts src/lib/rbac.ts src/lib/rbac-legacy.ts src/lib/admin-guard.ts` → **0 matches (exit 1)**. Confirmed independently via Grep tool: the only two `import ... from '@/lib/authorization/role-shim'` matches in `src/` are `src/app/dashboard/page.tsx:7` (server component, display only) and `src/app/admin/sellers/[id]/page.tsx:6` (server component, display only). Both call `getUserRoleWithFallback()` exclusively for display labels (dashboard L65-66 → `roleLabel`; sellers L132 → `displayRole`). Neither feeds the shim result to `can()` / `requirePermission()` / `isAdmin()`. The matches in `src/lib/authorization/user-roles.ts:13,90` and `src/lib/authorization/role-shim.ts:90` are textual mentions inside comments / log strings — not imports. Automated guard: `tests/security/rbac-phase-b.test.ts:164-188` enforces this at test time. |
| 3 | Dual-write operations are atomic | **PASS** | **W1 PATCH** `src/app/api/admin/users/[id]/route.ts:225-254` — `db.$transaction(async (tx) => { tx.user.update + tx.userRole.findMany+deleteMany + tx.userRole.upsert })` wraps legacy update + replaceable-deleteMany + canonical upsert in a single tx. **W2 register** `src/app/api/auth/register/route.ts:126-154` — `db.$transaction(async (tx) => { tx.user.create + tx.userRole.upsert })`. **W3 admin POST** `src/app/api/admin/users/route.ts:195-226` — `db.$transaction(async (tx) => { tx.user.create + tx.userRole.upsert })`. All three Role rows are resolved BEFORE the transaction (PATCH L177-184; register L114-123; admin POST L184-193) so a missing catalog row fails fast without entering the tx. |
| 4 | DB errors fail safely | **PASS** | `src/lib/authorization/index.ts:41-52` `can()` `catch { return false; }`. `canAny` (L55-66) and `canAll` (L69-80) — both `catch { return false; }`. `isAdmin` (L144-158) `catch (err) { ... return false; }`. Underlying `getUserPermissions` (`rbac-legacy.ts:42-45`) `catch (err) { ... return []; }` → `perms.includes(permission)` returns false → `can()` returns false. `getUserPrimaryRoleWithStatus` (`user-roles.ts:106-132`) `catch (err) { ... return { role: "BUYER", status: "DB_ERROR" }; }` — distinct `DB_ERROR` status, role is `BUYER` (safest default — cannot be mistaken for a real ADMIN/SELLER role). Shim treats DB_ERROR specially (Rule 4, `role-shim.ts:69`) — returns BUYER WITHOUT consulting legacy (DB is down — legacy lookup would also fail). Verified by test 5 (`tests/security/rbac-phase-b.test.ts:195-208`). |
| 5 | `deleteMany` only targets `replaceableKeys = ["ADMIN", "SELLER", "BUYER"]` — NOT MODERATOR or SUPPORT; `upsert` pattern correct | **PASS** | `src/app/api/admin/users/[id]/route.ts:224` — `const replaceableKeys = ["ADMIN", "SELLER", "BUYER"];`. L236-239: `tx.userRole.findMany({ where: { userId: id, role: { key: { in: replaceableKeys } } }, select: { id: true } })` — only returns IDs of rows whose role.key is in the replaceable set. L240-244: `if (existingUserRoles.length > 0) { await tx.userRole.deleteMany({ where: { id: { in: existingUserRoles.map((e) => e.id) } } }); }` — deletes by PK `id` from the filtered list only. MODERATOR / SUPPORT UserRole rows are NEVER touched (their key is not in `replaceableKeys` → their IDs are not in `existingUserRoles.map(e => e.id)` → not in `deleteMany` `where.id.in`). L247-251: `upsert({ where: { userId_roleId: { userId: id, roleId: roleChange.roleId } }, create: { userId: id, roleId: roleChange.roleId }, update: {} })` — idempotent via `@@unique([userId, roleId])` (`prisma/schema.prisma:1781`); `update: {}` is a no-op if the row already exists, preventing accidental permission set changes. |
| 6 | W2 register creates `UserRole(BUYER)` atomically; W3 admin POST creates `UserRole(body.role)` atomically | **PASS** | **W2 register:** `src/app/api/auth/register/route.ts:70-73` comment confirms `role` is NOT read from body — public registration can ONLY create BUYERs. L114-117 resolves the BUYER Role row (fail-fast on missing catalog). L126-154 `db.$transaction` wraps `tx.user.create({ data: { ..., role: "BUYER" } })` (L136) + `tx.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: buyerRole.id } }, create: { userId: u.id, roleId: buyerRole.id } })` (L147-151). **W3 admin POST:** `src/app/api/admin/users/route.ts:174-177` validates `body.role` against `["ADMIN", "SELLER", "BUYER"]` (defaults to BUYER if invalid). L184-187 resolves Role row. L195-226 `db.$transaction` wraps `tx.user.create({ data: { ..., role } })` (L205) + `tx.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: roleRow.id } }, create: { userId: u.id, roleId: roleRow.id } })` (L219-223). Both use the `@@unique([userId, roleId])` constraint for idempotency. |
| 7 | `logAudit()` is OUTSIDE the transaction with `.catch()` — best-effort audit | **PASS** | **W1 PATCH** `src/app/api/admin/users/[id]/route.ts:225-254` transaction; `logAudit(...)` at L273-284 with `.catch(() => { /* audit failure does not roll back the mutation */ })`. **W3 admin POST** `src/app/api/admin/users/route.ts:195-226` transaction; `logAudit(...)` at L228-238 with `.catch(() => { /* audit failure does not roll back the mutation */ })`. **W2 register** — no `logAudit()` call (public endpoint; CSRF + rate-limit are the only public-facing controls; audit is reserved for admin mutations). **Documented behavior:** if `logAudit` fails AFTER the transaction commits, the mutation is NOT rolled back — best-effort audit by design (per REVISION-6). This is acceptable because audit-log failure is an observability issue, not a data-integrity issue; the transaction already atomically committed both legacy + canonical writes. |
| 8 | No accidental privilege escalation (BUYER with no UserRole cannot access admin) | **PASS** | Traced the access path end-to-end: A user with `User.role="BUYER"` and zero `UserRole` rows attempts to call an admin route. `adminGuard(permissionKey)` (`admin-guard.ts:47-86`): ① `getCurrentUser()` returns user (authenticated); ② `isAdmin(user.id)` (L55) calls `db.userRole.findFirst({ where: { userId, role: { key: 'ADMIN' } } })` (`authorization/index.ts:149-152`) — zero UserRole rows → `findFirst` returns null → `Boolean(null)` = false → `isAdmin` returns false; ③ `adminGuard` falls to `if (permissionKey)` branch (L58-63) and calls `can(user.id, permissionKey)`; ④ `can()` calls `getUserPermissions(userId)` (`authorization/index.ts:47`) which queries `db.userRole.findMany({ where: { userId } })` (`rbac-legacy.ts:22-33`) → returns `[]` → `perms.includes(permission)` = false → `can()` returns false; ⑤ `adminGuard` returns `false` (Forbidden → 403). The shim returns `"BUYER"` for this user for DISPLAY, but `can()` / `isAdmin()` do NOT consult the shim — so the display result has zero influence on authorization. No escalation path exists. |
| 9 | No unintended schema migration / destructive operation | **PASS** | `git diff 18536ac..HEAD -- prisma/schema.prisma` → **EMPTY (0 bytes)**. `git diff --stat 18536ac..HEAD -- prisma/` → **EMPTY** (entire `prisma/` directory untouched). `git diff --name-status 18536ac..HEAD | grep -iE 'migration|backfill|seed|sql'` → 0 matches. `prisma/seed-user-roles.ts` referenced in code is a pre-existing file from commit `73d84d0` ("security: harden login and RBAC seed credentials") — NOT added by this PR. PR contains 13 changed files: 2 docs + 5 src modifications (admin PATCH route, admin POST route, register POST route, dashboard page, sellers page) + 2 component modifications (users-section, user-detail-drawer) + 1 new lib (role-shim) + 1 modified lib (user-roles) + 2 new tests. Zero migration SQL, zero backfill scripts, zero production ops. |
| 10 | Client components still read `user.role` directly (intentional Phase B dual-read window) | **PASS** | `src/components/admin/sections/users-section.tsx:190` `React.useState(user.role)`; L197 `setRole(user.role)`; L477 `<RoleBadge role={user.role} />`. Each call site has an explicit Phase B comment: L185-189 (states "this is a CLIENT component — cannot await getUserRoleWithFallback(). During Phase B, the dual-write at /api/admin/users/[id] keeps User.role in sync with the canonical UserRole, so seeding local state from user.role is correct. After Phase D cutover, the parent must pass the shim-resolved role in."); L472-476 (restates the same contract for the RoleBadge call). `src/components/admin/user-detail-drawer.tsx:100` `<RoleBadge role={user.role} />` with comment L92-99 ("cannot await getUserRoleWithFallback(). During Phase B, the dual-write ... keeps User.role in sync ... After Phase D cutover (User.role column dropped), this MUST be migrated to receive `role` from a parent server component via props"). Both call sites document the Phase D cutover requirement. Acceptable during Phase B — dual-write keeps `User.role` in sync with the canonical UserRole row. |

## 4. Authorization Separation Verdict

✅ **CLEAN.**

### Evidence

1. **No authz-path module imports the shim.** Direct grep against the four
   canonical authorization-path modules returns 0 matches:
   ```
   $ grep -n 'role-shim' src/lib/authorization/index.ts \
                    src/lib/rbac.ts \
                    src/lib/rbac-legacy.ts \
                    src/lib/admin-guard.ts
   (no output, exit 1)
   ```

2. **Shim is imported only by display/UI server components.** The full-repo
   grep `from '@/lib/authorization/role-shim'` returns exactly two matches,
   both in server components:
   - `src/app/dashboard/page.tsx:7` — `getUserRoleWithFallback` called at L65
     only to compute `roleLabel` for the welcome banner (L66, L175, L217).
   - `src/app/admin/sellers/[id]/page.tsx:6` — `getUserRoleWithFallback`
     called at L132 only to compute `displayRole`. Authorization for the page
     itself uses `requirePermission(actor.id, "user.read")` at L75 — pure RBAC.

3. **The canonical authorization chain does not consult `User.role`.**
   `src/lib/rbac-legacy.ts:20-46` queries only `userRole → role → permissions
   → permission`. Zero textual occurrences of `User.role` or `user.role`
   in this file (verified).

4. **No direct `user.role === 'ADMIN'|'SELLER'` authorization usage in
   `src/app/api/`.** Grep:
   ```
   user\.role.*===.*ADMIN|user\.role.*===.*SELLER  →  0 matches
   ```
   The only `user.role === 'ADMIN'` textual reference in `src/lib` is the
   module header comment at `src/lib/authorization/index.ts:5` describing
   what the permission-based system replaces (not an authorization check).

5. **Automated test guard.** `tests/security/rbac-phase-b.test.ts:164-188`
   (test 7, REVISION-7) iterates over the four authz-path files and asserts
   `content.not.toMatch(/from ['"]@\/lib\/authorization\/role-shim['"]/)` for
   each, plus runs the exact `rg -l` command and asserts `out.trim() === ""`.

## 5. Security Findings

### Critical findings
**None.** All 10 invariants PASS. The REVISION-7 authorization-separation
invariant is verified by three independent methods: file-by-file inspection,
scoped grep, and full-repo grep. The automated test guard at
`tests/security/rbac-phase-b.test.ts:164-188` enforces it at CI time.

### Informational findings (not defects — intentional Phase B behavior)

| # | Severity | Finding | File:Line | Impact | Remediation |
|---|----------|---------|-----------|--------|-------------|
| F-1 | INFO | Phase B intentional dual-read window: `User.role` (legacy) and `UserRole` (canonical) coexist; dual-write keeps them consistent. Shim's `EMPTY` case consults legacy `User.role` for un-backfilled users — DISPLAY only, never authorization. | `role-shim.ts:76-98` | No authz impact. Display may briefly disagree with canonical during backfill. | Phase D cutover: drop `User.role` column after backfill completes. |
| F-2 | INFO | Client components (`users-section.tsx`, `user-detail-drawer.tsx`) read `user.role` directly because they cannot await the async shim. | `users-section.tsx:190,197,477`; `user-detail-drawer.tsx:100` | No authz impact. Display only. Dual-write keeps `User.role` in sync during Phase B. | Phase D cutover: parent server component resolves role via shim and passes via props. Both files have explicit comments documenting this contract. |
| F-3 | INFO | Audit-log payload records legacy `role` field (per REVISION-6 comment). | `admin/users/[id]/route.ts:268-272`; `admin/users/route.ts:228` | Audit log content is the legacy column value during Phase B (dual-write keeps it in sync, so the value matches the canonical UserRole key). | Phase D cutover: switch audit payload to canonical UserRole key. |
| F-4 | INFO | `hasRole` legacy shim in `src/lib/authorization/index.ts:356-367` translates role keys to permission keys and delegates to `can()` — does NOT consult `User.role`; routes through RBAC chain. | `authorization/index.ts:348-367` | No authz impact. Migration shim for callers still importing `hasRole`. | Migration target: replace `hasRole(userId, 'ADMIN')` with `can(userId, 'admin.access')` and remove the shim. |
| F-5 | INFO | `requireOwnership` (admin-guard.ts:113-121) uses `isAdmin(userId)` (RBAC, not legacy) for admin override of object-level authorization. | `admin-guard.ts:113-121` | Correct — admin override requires ADMIN UserRole, not `User.role === 'ADMIN'`. | None. |
| F-6 | INFO | `getUserPrimaryRole` (user-roles.ts:63-84) returns "BUYER" on DB error without distinguishing DB_ERROR — only `getUserPrimaryRoleWithStatus` returns the tri-state. | `user-roles.ts:80-83` | The display shim uses `getUserPrimaryRoleWithStatus` (tri-state), so this is fine. If any future caller uses `getUserPrimaryRole` directly and treats the returned "BUYER" as canonical-truth, they would not know whether it was a real BUYER or a DB-error fallback. | Document that `getUserPrimaryRole` is fail-closed and should not be used to differentiate "real BUYER" from "DB error". The shim already handles this correctly via the tri-state variant. |

### Not a finding (verified-safe)
- The PATCH route's `deleteMany` could in principle delete MODERATOR/SUPPORT
  UserRole rows if the `where` clause were not scoped — but it IS scoped by
  `replaceableKeys = ["ADMIN", "SELLER", "BUYER"]` (L224). Verified: the
  `findMany` filter at L236-239 restricts to `role.key ∈ replaceableKeys`, and
  the `deleteMany` at L241-243 only deletes by the IDs returned from that
  filtered `findMany`. MODERATOR and SUPPORT rows are safe.

## 6. Cross-Reference with Prior Audit (STEP-15.42-C2)

The prior audit (`STEP-15.42-C2`, worklog L6515-6560) reported 10/10 PASS with
the same authorization-separation verdict (CLEAN). My independent verification
confirms every claim in that report against the actual source code. No
discrepancies found. Specific cross-checks I performed:

- **Prior claim:** "`rg role-shim src/lib --glob '{index,rbac,rbac-legacy,admin-guard}.ts'` → 0 matches"
  **My verification:** ran the equivalent Grep against the four files → 0
  matches. ✓ Confirmed.

- **Prior claim:** `replaceableKeys = ["ADMIN","SELLER","BUYER"]` filter on
  `findMany` → deleteMany by PK IDs in filtered set
  **My verification:** re-read PATCH route L224, L236-244 — exactly as
  described. ✓ Confirmed.

- **Prior claim:** `getUserPermissions()` returns `[]` on error → `can()`
  returns `false`.
  **My verification:** re-read `rbac-legacy.ts:42-45` and
  `authorization/index.ts:41-52` — exactly as described. ✓ Confirmed.

- **Prior claim:** `git diff 18536ac..HEAD -- prisma/schema.prisma` → EMPTY.
  **My verification:** re-ran the same command → EMPTY (0 bytes). ✓ Confirmed.

- **Prior claim:** Automated guard at `tests/security/rbac-phase-b.test.ts:164-188`.
  **My verification:** re-read the test file — guard asserts
  `content.not.toMatch(/from ['"]@\/lib\/authorization\/role-shim['"]/)` for
  each of the four authz files, plus runs the `rg -l` command and asserts
  empty output. ✓ Confirmed.

## 7. Method Note — Independence

This audit was conducted independently of the prior STEP-15.42-C2 report.
The prior report was read only AFTER my own verification was complete, to
cross-reference findings. All file:line citations in this report are based
on my own reads of the actual source code at HEAD `1b0d9e8`.

## 8. Final Verdict

**10 / 10 invariants PASS.** Authorization separation: **CLEAN.**
**No critical security findings.** No code modifications made (read-only
mandate honored). The Phase B diff is security-safe and ready for merge from
a security & authorization standpoint, subject to the owner's separate merge
decision and the residual informational findings (F-1 through F-6) being
tracked for Phase D cutover.

---

*End of report.*
