# HEAVIX — STEP 15-B.5.4-C.2-P4: Bulk Action Engine Evidence Freeze

> **Status:** Evidence Freeze Only — NO code changes made.
>
> **Per user policy:** "فعلاً هیچ تغییر کدی در این مرحله"
>
> **Frozen at:** git commit `b2f9a9a` (STEP 15-B.5.4-C.2-P3-Fix head)

---

## 1. File Analyzed

`src/lib/admin/bulk-export-engine.ts` (282 lines)

Two functions:
- `executeBulkAction` (lines 56-165) — **MUTATION** (bulk operations)
- `executeExport` (lines 189-281) — **READ-ONLY** (data export, no mutation)

---

## 2. executeBulkAction — Full Analysis

### 2.1 Signature

```typescript
export async function executeBulkAction(
  params: BulkActionParams,
): Promise<BulkActionResult>
```

Where `BulkActionParams` includes:
```typescript
interface BulkActionParams {
  resourceKey: string;  // ← YES, resourceKey is available!
  actionKey: string;
  ids: string[];
  ctx: ActionContext;
}
```

### 2.2 What mutations does executeBulkAction perform?

**CRITICAL FINDING: `executeBulkAction` does NOT perform direct Prisma mutations.**

It delegates each item to `executeAction` (line 110):
```typescript
const result = await executeAction(resourceKey, id, actionKey, ctx);
```

`executeAction` is the Action Engine function that:
1. Looks up the resource config from registry
2. Checks permissions
3. Finds the action handler
4. Executes the handler (which does `db.X.update/delete`)
5. Wraps in `auditMutation`
6. **P2 ALREADY adds `revalidateTag` after `auditMutation` succeeds** (from STEP 15-B.5.4-C.2-P2)

### 2.3 Does Bulk Action go through the Action Engine?

**YES — `executeBulkAction` calls `executeAction` for EVERY item (line 110).**

This means:
- P2's `revalidateTag` insertion in `executeAction` **already covers bulk operations**
- For each successful item in a bulk batch, `revalidateTag(tag, 'default')` fires via P2
- For a batch of 50 listings with action "publish", P2 fires `revalidateTag('home:listings', 'default')` up to 50 times (once per successful item)

### 2.4 Is executeBulkAction fully independent from the Action Engine?

**NO — it is NOT independent.** It depends on `executeAction` from `action-engine.ts`:
```typescript
import { executeAction, type ActionResult, type ActionContext } from './action-engine';
```

Every item in a bulk operation goes through the same `executeAction` → `auditMutation` → handler → `revalidateTag` path as individual actions.

### 2.5 Resource identity

`resourceKey` is available directly in `executeBulkAction` (line 59: `const { resourceKey, actionKey, ids, ctx } = params;`).

This means `getHomepageCacheTags(resourceKey)` can be called to get the cache tags.

### 2.6 Partial success handling

```typescript
// Lines 100-134: process in batches of 50
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE);
  const batchResults = await Promise.allSettled(
    batch.map(async (id) => {
      const result = await executeAction(resourceKey, id, actionKey, ctx);
      return { id, success: result.success, ... };
    }),
  );
  // Track succeeded/failed
}
```

- Items are processed in batches of 50
- Each item's success/failure is tracked independently
- `succeeded` and `failed` counts are returned in `BulkActionResult`
- If 480/500 succeed and 20 fail, the result reflects this accurately

### 2.7 What resources can be bulk-acted upon?

Since `executeBulkAction` calls `executeAction(resourceKey, ...)` and `executeAction` looks up `registry.get(resourceKey)`, it can bulk-act on ANY registered resource.

For Homepage-affecting resources:
- `listings` → `home:listings` (P2 covers each item)
- `brands` → `home:brands` (P2 covers each item)
- `buy-requests` → `home:requests` (P2 covers each item)
- `categories` → NOT registered in Universal API → bulk action NOT available for categories

For non-Homepage resources (users, products, orders, etc.): P2's `getHomepageCacheTags` returns `[]` → no revalidation fires. Correct behavior.

### 2.8 executeExport — READ-ONLY

```typescript
export async function executeExport(params: ExportParams): Promise<ExportResult>
```

- Queries data with `model.findMany` (line 211)
- No mutations (no create/update/delete)
- Returns formatted CSV/JSON
- **NO revalidation needed** — this is a read-only operation

---

## 3. Coverage Analysis

### 3.1 Is P2 sufficient for Bulk Action?

**YES — P2 already covers `executeBulkAction` because it delegates to `executeAction`.**

Each successful item mutation triggers `revalidateTag` via P2's insertion in `executeAction` (line 237-249 of action-engine.ts).

### 3.2 Redundancy

For a bulk operation of 50 items where all succeed:
- P2 fires `revalidateTag('home:listings', 'default')` **50 times** (once per item)
- This is **redundant but correct** — `revalidateTag` is idempotent
- Multiple calls for the same tag are harmless (the cache is invalidated, subsequent calls are no-ops if already invalidated)

### 3.3 Optimization opportunity

Adding a single `revalidateTag` call at the `executeBulkAction` level (after all batches complete, after summary audit at line 150) would:
- Eliminate redundant per-item `revalidateTag` calls during bulk operations
- Fire only ONCE per bulk operation
- Still maintain correctness

But this requires:
1. Adding `revalidateTag` + `getHomepageCacheTags` imports to `bulk-export-engine.ts`
2. Inserting after line 150 (summary audit), with condition `if (succeeded > 0)`
3. Optionally modifying `executeAction` to skip `revalidateTag` when called from `executeBulkAction` (to avoid double invalidation) — but this adds complexity

**Per user's scope lock: "هدف فقط این است: Action Engine → Homepage Cache Tag invalidation."**

The optimization is OPTIONAL — P2 already covers the correctness. The question is whether to add a single bulk-level call for efficiency.

---

## 4. Exact Insertion Point (if implementation proceeds)

After line 150 (summary audit log), before line 152 (completedAt):

```typescript
// Line 150: end of logAudit
  });

  // ← INSERT HERE: after all batches complete, only if any succeeded
  if (succeeded > 0) {
    const tags = getHomepageCacheTags(resourceKey);
    for (const tag of tags) {
      try { revalidateTag(tag, 'default'); } catch (e) {
        console.error(`[bulk-action] revalidateTag('${tag}') failed:`, e);
      }
    }
  }

  const completedAt = new Date();  // Line 152 (original)
```

Condition: `if (succeeded > 0)` — only invalidate if at least one item was successfully mutated. If all items failed, no cache invalidation is needed (no data changed).

---

## 5. Decision

### 5.1 P4 is NOT a gap — P2 already covers it

The Evidence Freeze reveals that `executeBulkAction` is NOT an independent mutation path. It delegates to `executeAction`, which P2 already covers with `revalidateTag`.

### 5.2 P4 is an optimization opportunity

Adding a single bulk-level `revalidateTag` would:
- ✅ Reduce redundant `revalidateTag` calls from N (per-item) to 1 (per-bulk-operation)
- ✅ Be cleaner and more efficient
- ❌ Require modifying `bulk-export-engine.ts` (but this is a small, targeted change)
- ❌ Potentially require modifying `executeAction` to skip per-item `revalidateTag` when called from bulk context (adds complexity)

**Recommendation:** Add a SINGLE `revalidateTag` call at line 150 with `if (succeeded > 0)` condition. Do NOT modify `executeAction` — the redundant per-item calls are harmless (idempotent). The single bulk-level call ensures the cache is invalidated even if the per-item calls somehow fail.

### 5.3 P4 status: **NOT-A-GAP (optimization candidate)**

| Status | Count | Description |
|---|---|---|
| GAP | 0 | No gap — P2 covers bulk actions via `executeAction` |
| OPTIMIZATION | 1 | Single `revalidateTag` at bulk level reduces redundant calls |
| NOT-HOMEPAGE-AFFECTING | 0 | — |

---

## 6. Cumulative Coverage Final Audit

| Priority | What | Independent mutation paths? | Covered by? | Status |
|---|---|---|---|---|
| P1 | Universal Resource API | YES (create/update/delete via data-adapter) | P1 `revalidateTag` | ✅ COVERED |
| P2 | Action Engine | YES (publish/unpublish/feature/etc. via action handlers) | P2 `revalidateTag` in `executeAction` | ✅ COVERED |
| P3 | Direct API routes | YES (direct Prisma mutations in route files) | P3 `revalidateTag` in 25 route files | ✅ COVERED |
| P3-Fix | 4 unresolved routes | YES (multi-line return patterns) | P3-Fix `revalidateTag` in 4 routes | ✅ COVERED |
| P4 | Bulk Action Engine | **NO** — delegates to `executeAction` (P2) | P2 covers each item | ✅ COVERED (by P2) |
| P5 | Store routes | NO — uses `storeDb` not `db` | N/A | ✅ NOT-HOMEPAGE |

### 6.1 Final coverage statement

**All identified Homepage-affecting mutation paths are covered by P1 + P2 + P3 + P3-Fix.**

P4 (Bulk Action Engine) is NOT a gap — it delegates to `executeAction` which P2 already covers.

P5 (Store routes) is NOT Homepage-affecting — uses `storeDb` (store database), not `db` (main database).

### 6.2 Remaining after P4

| What | Status |
|---|---|
| P1-P3+P3-Fix | ✅ All mutation paths covered |
| P4 | ✅ NOT-A-GAP (P2 covers via `executeAction`) |
| P5 | ✅ NOT-HOMEPAGE-AFFECTING |
| `executeExport` | ✅ READ-ONLY (no mutation, no revalidation needed) |

**No remaining mutation gaps identified.** The C.2 invalidation implementation is complete.

---

## 7. What This Step Did NOT Do

- ✅ No code changes made
- ✅ No `revalidateTag` added to `bulk-export-engine.ts`
- ✅ No `homepage-cache-tags.ts` modified
- ✅ No commit, no push
- ✅ Baseline preserved

---

## 8. Next Steps

```
✅ P1 Universal Resource API (3 insertion points)
✅ P2 Action Engine (1 insertion point — also covers P4 via executeAction)
✅ P3 Direct API routes (39 insertion points in 25 files)
✅ P3-Fix 4 unresolved routes (8 insertion points)
✅ P4 Bulk Action Engine — NOT-A-GAP (P2 covers via executeAction) ← COMPLETE
✅ P5 Store routes — NOT-HOMEPAGE-AFFECTING
🔵 C.2 Re-audit (final coverage count — this document)
🔵 D Freshness/Invalidation Tests
🔵 E TTFB Performance Gate
🔵 F GREEN/YELLOW/RED
```

**C.2 is complete.** All identified Homepage-affecting mutation paths have `revalidateTag` coverage:
- P1: Universal API (3 ops × 3 resources = 9 paths)
- P2: Action Engine (8 handlers × 3 resources = 24 paths) — **also covers P4 bulk actions**
- P3 + P3-Fix: Direct routes (47 insertion points in 29 files)
- P4: NOT-A-GAP (delegates to P2)
- P5: NOT-HOMEPAGE-AFFECTING

**Next: STEP D (Freshness/Invalidation Tests)** — verify that mutations actually trigger cache invalidation and the next request sees fresh data.
