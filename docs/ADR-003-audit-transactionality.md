# ADR-003 — Audit Transactionality

- **Status:** Accepted — STEP 11.8 implemented; STEP 11.9 verified via real DB integration
- **Date:** 2026-10-08
- **Decision owners:** HEAVIX core team
- **Supersedes:** none
- **Superseded by:** —
- **Related:** ADR-002 (Resource Architecture), ADR-004 (STEP 11.6 Hardening)

## Context

The HEAVIX admin control plane logs every mutation via `auditMutation` from
`src/lib/audit-foundation.ts`. Until STEP 11.8, this function was
**fire-and-forget**:

1. The mutation was committed.
2. `logAudit` was called AFTER the commit.
3. `logAudit` is best-effort — it catches + `console.error`s any DB error
   (see `src/lib/audit.ts:67-74`).
4. If `logAudit` fails, the audit row is never written — the mutation
   stays committed, with NO audit trail.

This is a CRITICAL security/compliance gap for high-risk operations
where audit completeness is non-negotiable:

- **Financial mutations** (`payment.refund`, `payment.verify`): missing
  audit rows break financial reconciliation and trust signals.
- **Identity changes** (`user.suspend`, `user.role-manage`): missing
  audit rows break incident post-mortems and access reviews.
- **Irreversible state transitions** (`listing.delete`): missing audit
  rows make it impossible to determine who/when deleted a record.

The STEP 11.5 audit identified this as one of 7 critical gaps. STEP 11.6
Phase C.2 wrote the FIRST version of this ADR (event classification +
transactional policy), but the STEP 11.7-SEC verification found that
ADR-003 made FALSE claims about "dedicated transactional routes" for
CRITICAL operations — the code did NOT actually wrap any operation in
`db.$transaction`. STEP 11.8 corrected both the code AND the ADR.

## Decision

### 1. Event Classification

Audit events are classified into three tiers, each with its own
transactional policy:

| Tier | Examples | Policy | Implementation |
|------|----------|--------|----------------|
| CRITICAL | `payment.refund`, `payment.verify` | Atomic (mutation + audit in same `db.$transaction`) | `auditMutationTransactional` |
| STANDARD | `listing.update`, `user.update`, `brand.publish` | Best-effort (mutation commits first, audit logged after) | `auditMutation` |
| STORE-DOMAIN | `inventory.adjust`, `warehouse.delete`, `returns.approve` | Best-effort (cross-DB limitation — see below) | `auditMutation` |

### 2. CRITICAL Operations Use `auditMutationTransactional`

The new function `auditMutationTransactional` (in `src/lib/audit-foundation.ts`)
wraps the mutation AND the audit insert in a single `db.$transaction`:

```typescript
const result = await db.$transaction(async (tx) => {
  // 1. Run mutation THROUGH the transaction client.
  const opResult = await operation(tx);

  // 2. Insert audit row THROUGH THE SAME transaction.
  await tx.auditLog.create({ data: { ... } });

  return { result: opResult, before, after };
});
```

Behavior guarantees:
- **Both succeed → both commit** (atomic).
- **Mutation fails → transaction rolls back** → no audit row written
  (correct: the mutation didn't happen, so no audit needed).
- **Audit insert fails → transaction rolls back** → mutation undone
  (CORRECT: this is the ATOMICITY guarantee — no mutation without audit).

### 3. Action Engine Integration

`executeAction()` in `src/lib/admin/action-engine.ts` uses
`auditMutationTransactional` when:
- `action.transactional === true` (declared in resource config), AND
- `config.database !== 'store'` (main DB only — see store limitation below).

Otherwise it falls back to the existing `auditMutation` (best-effort path).

The action handler receives the transaction client (`tx`) so its
writes go through the SAME transaction as the audit insert. The
`__prismaModel` tag is updated to point at `tx[config.model]` (the
transaction-scoped model accessor) so existing handlers (which read
`item.__prismaModel`) automatically write through `tx`.

### 4. Resource Config Declaration

Resources declare per-action transactionality via
`AdminAction.transactional: boolean` (added to `types.ts`).

Current declarations (STEP 11.8):

| Resource | Action | Precondition | Transactional |
|----------|--------|--------------|---------------|
| `payments` | `refund` | status ∈ {PAID, AUTHORIZED} | ✅ |
| `payments` | `verify` | status === PENDING | ✅ |

(Future CRITICAL operations — `user.suspend`, `user.role-manage`,
`listing.delete` — should declare `transactional: true` as they are
identified; STEP 11.8 ships the framework, not an exhaustive list.)

### 5. Store-Schema Limitation (KNOWN ARCHITECTURAL LIMITATION)

Prisma does NOT support cross-database transactions. The HEAVIX project
uses TWO separate Prisma clients (`db` for main, `storeDb` for store
schema), each pointing at a separate PostgreSQL database
(`heavix` and `heavix_store`).

Consequences:
- `auditMutationTransactional` uses `db.$transaction` (main client only).
- The `AuditLog` table lives in the MAIN database (`heavix`).
- A store-schema mutation (e.g., `inventory.adjust`) cannot be wrapped
  in the same transaction as a main-schema audit insert — they live
  in different databases.
- Store-domain mutations continue to use `auditMutation` (best-effort).

**Mitigation (FOLLOW-UP, not in STEP 11.8 scope):**
- Implement an audit OUTBOX in the store database
  (`StoreAuditLog` table) so store-domain mutations can be transactional
  with their own audit trail.
- A periodic sync job copies `StoreAuditLog` rows to the main `AuditLog`
  table for unified querying.
- This is documented as a FOLLOW-UP in ADR-004 §E.2.

### 6. Failure Semantics

| Scenario | CRITICAL (transactional) | STANDARD (best-effort) |
|----------|---------------------------|------------------------|
| Mutation succeeds, audit succeeds | Both commit | Both commit |
| Mutation fails | Both roll back | Mutation rolled back, `.failed` audit logged |
| Audit fails | Both roll back (mutation undone) | Mutation committed, audit gap (logged to console.error) |

The CRITICAL path's "audit fails → mutation undone" is the key safety
guarantee: it is IMPOSSIBLE for a CRITICAL operation to commit without
a corresponding audit row.

## STEP 11.8 CORRECTION (vs. the original ADR-003)

The original ADR-003 (written in STEP 11.6 Phase C.2) claimed:
> CRITICAL operations use dedicated transactional routes — separate API
> endpoints that wrap the mutation in `db.$transaction`.

This was FALSE. The `payment.refund` action's `apiPath` pointed at the
Universal Resource API (`/api/admin/resources/payments`), which used
`auditMutation` (non-transactional). The "dedicated route" did not exist.

STEP 11.8 corrected both:
1. **Code:** added `auditMutationTransactional` + wired it into
   `executeAction` via `action.transactional` flag.
2. **ADR:** removed the false claim; this section documents the
   correction.

## Verification

- **Source trace:** `executeAction` → `useTransactional` check →
  `auditMutationTransactional` → `db.$transaction` →
  `operation(tx)` + `tx.auditLog.create`. Confirmed at:
  - `src/lib/admin/action-engine.ts:343-379`
  - `src/lib/audit-foundation.ts:243-297`
- **Behavioral tests:** `tests/security/audit-transactionality.test.ts`
  (4 tests, mocked deps, real function under test):
  1. mutation+audit succeed → both commit
  2. audit fails → mutation rolled back (atomicity)
  3. mutation fails → .failed audit logged (best-effort path)
  4. afterJson captures operation result
- **Real DB integration tests:** `tests/integration/audit-transaction-real.ts`
  (4 scenarios, real PostgreSQL):
  1. Scenario 1: mutation+audit succeed → BOTH committed
  2. Scenario 2: mutation fails → status unchanged (rolled back)
  3. Scenario 3: audit fails inside tx → mutation rolled back (ATOMICITY PROVEN)
  4. Scenario 4: precondition fails → status unchanged (no mutation, no audit)
- **Production configs:** `payment.refund` and `payment.verify` declare
  `transactional: true` + preconditions
  (`src/lib/admin/resources/store-resources.ts:351-392`).

## Consequences

- CRITICAL admin operations are now PROVABLY atomic with their audit trail.
- The "audit gap" risk (mutation commits, audit silently fails) is
  ELIMINATED for transactional operations.
- STANDARD operations remain best-effort (KNOWN GAP — documented).
- STORE-DOMAIN operations remain best-effort (KNOWN ARCHITECTURAL
  LIMITATION — store audit outbox is a follow-up).
- Future CRITICAL operations can opt in by declaring
  `transactional: true` on the action — no code change needed.
