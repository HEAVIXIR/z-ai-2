# HEAVIX — STEP 16-B: Completion Matrix (18 Resources × 20 Dimensions)

> **Status:** Evidence Freeze — NO code changes. Per-cell verdicts traced from actual source.
>
> **Per user principle:** "Generic infrastructure exists ≠ Resource-specific completion is proven"
> "498 contract tests ≠ 18 × complete resource runtime verification"
>
> **Frozen at:** git commit `bc732fc`
> **Built from:** STEP-16-B-A (R1-R5) + STEP-16-B-B (R6-R10) + STEP-16-B-C (R11-R14) + STEP-16-B-D (R15-R18)

---

## 1. The Matrix

Legend: `✅` Evidence found (resource-specific implementation/wiring in source) | `⚠️` Gap (partial OR generic-infra-only without resource-specific config) | `❌` Missing (capability does not exist for this resource)

| # | Resource | 1 Reg | 2 Cfg | 3 RBAC | 4 FldPol | 5 API | 6 Svc | 7 Tbl | 8 Flt | 9 Srt | 10 Pg | 11 Fm | 12 Val | 13 Det | 14 Rel | 15 Act | 16 Bulk | 17 Exp | 18 Aud | 19 Tst | 20 Rt | Total |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | listings | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | **16/3/1** |
| 2 | brands | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | **16/3/1** |
| 3 | users | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | **16/3/1** |
| 4 | products | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | **16/3/1** |
| 5 | parts | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ✅ | **10/4/6** |
| 6 | orders | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | **15/4/1** |
| 7 | payments | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ⚠️ | ❌ | ⚠️ | ✅ | ⚠️ | ✅ | **13/4/3** |
| 8 | companies | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | **14/5/1** |
| 9 | machines | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ✅ | **11/3/6** |
| 10 | reviews | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ | ✅ | **13/4/3** |
| 11 | deals | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ | ⚠️ | ✅ | **15/3/2** |
| 12 | rfqs | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ✅ | **14/3/3** |
| 13 | offers | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ✅ | **11/4/5** |
| 14 | auctions | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ✅ | **13/4/3** |
| 15 | inspections | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ✅ | **11/4/5** |
| 16 | transports | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ✅ | **11/4/5** |
| 17 | disputes | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ✅ | **12/3/5** |
| 18 | buy-requests | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | ✅ | **11/4/5** |

**Grand Total: 238 ✅ / 65 ⚠️ / 57 ❌ (out of 360 cells)**

---

## 2. Per-resource totals (sorted by completeness)

| # | Resource | ✅ | ⚠️ | ❌ | Score | Tier |
|---:|---|---:|---:|---:|---:|---|
| 1 | listings | 16 | 3 | 1 | 80% | 🥇 Best |
| 2 | brands | 16 | 3 | 1 | 80% | 🥇 Best |
| 3 | users | 16 | 3 | 1 | 80% | 🥇 Best |
| 4 | products | 16 | 3 | 1 | 80% | 🥇 Best |
| 6 | orders | 15 | 4 | 1 | 75% | 🥈 Good |
| 11 | deals | 15 | 3 | 2 | 75% | 🥈 Good |
| 8 | companies | 14 | 5 | 1 | 70% | 🥈 Good |
| 12 | rfqs | 14 | 3 | 3 | 70% | 🥈 Good |
| 7 | payments | 13 | 4 | 3 | 65% | 🥉 Fair |
| 10 | reviews | 13 | 4 | 3 | 65% | 🥉 Fair |
| 14 | auctions | 13 | 4 | 3 | 65% | 🥉 Fair |
| 17 | disputes | 12 | 3 | 5 | 60% | 🥉 Fair |
| 9 | machines | 11 | 3 | 6 | 55% | ⚠️ Gap-heavy |
| 13 | offers | 11 | 4 | 5 | 55% | ⚠️ Gap-heavy |
| 15 | inspections | 11 | 4 | 5 | 55% | ⚠️ Gap-heavy |
| 16 | transports | 11 | 4 | 5 | 55% | ⚠️ Gap-heavy |
| 18 | buy-requests | 11 | 4 | 5 | 55% | ⚠️ Gap-heavy |
| 5 | parts | 10 | 4 | 6 | 50% | ⚠️ Gap-heavy |

---

## 3. Per-dimension totals (sorted by gap severity)

| Dim | Dimension | ✅ | ⚠️ | ❌ | Systemic pattern |
|---:|---|---:|---:|---:|---|
| 1 | Registry | 18 | 0 | 0 | ✅ All 18 registered in `resource-index.ts` |
| 2 | Config | 18 | 0 | 0 | ✅ All 18 configs fully populated |
| 5 | API | 18 | 0 | 0 | ✅ All 18 served by universal `/api/admin/resources/[resource]` route |
| 6 | Service | 18 | 0 | 0 | ✅ All 18 model names map to real Prisma models in `schema.prisma` |
| 7 | Table | 18 | 0 | 0 | ✅ All 18 column.key arrays match real Prisma model fields |
| 9 | Sorting | 18 | 0 | 0 | ✅ All 18 have `defaultSort` OR sortable columns |
| 10 | Pagination | 18 | 0 | 0 | ✅ All 18 have `pageSize` set |
| 11 | Form | 18 | 0 | 0 | ✅ All 18 have `fields[]` populated |
| 18 | Audit | 18 | 0 | 0 | ✅ All 18 have `audit.enabled=true` + entityType + actions (BUT 4/18 action labels point to non-existent permissions) |
| 8 | Filters | 17 | 0 | 1 | ❌ parts has NO `filters` field |
| 3 | Permission/RBAC | 10 | 8 | 0 | ⚠️ 8/18 resources reference permission constants NOT in `PERMISSIONS` array NOR seeded in DB → universal API GET returns 403 Forbidden for ALL users including ADMIN at runtime (inspections, transports, buy-requests, parts, machines, reviews, offers, auctions) |
| 20 | Runtime | 17 | 1 | 0 | ⚠️ Only auth-redirect smoke (307→/login or 401); NO admin-authenticated CRUD runtime smoke for ANY of 18 |
| 14 | Relations | 9 | 0 | 9 | ❌ 9/18 have NO `relations` field (parts, payments, reviews, offers, inspections, transports, disputes, buy-requests — plus 1 more). 16-A's "16 of 18 have Relations" was WRONG by 7. |
| 13 | Detail | 11 | 0 | 7 | ❌ 7/18 have NO `detailTabs` field (parts, machines, offers, inspections, transports, disputes, buy-requests) |
| 16 | Bulk | 8 | 0 | 10 | ❌ 10/18 have NO `bulkActions` field |
| 4 | Field Policy | 0 | 18 | 0 | ⚠️ ZERO resources set `fields[].permissions`. Generic infra exists but unused. Critical for: `user.passwordHash`, `payment.trackingCode`, `company.email`, `transport.carrierPhone`, `buy-request.requesterPhone` |
| 15 | Actions | 0 | 17 | 1 | ⚠️ ZERO resources set `actions[].apiPath`. All rely on action-engine's 8 generic handlers. Marketplace transaction-lifecycle action keys (confirm/cancel/refund/close/accept/reject/start/end/schedule/complete/deliver/review/resolve/hide/verify-email) have NO handlers → throw at runtime |
| 19 | Tests | 0 | 18 | 0 | ⚠️ ZERO resources have a dedicated contract test file. All 18 share generic `resource-contract.test.ts` (373 tests = 27 invariants × 18). User's warning "498 contract tests ≠ 18 × complete resource runtime verification" — confirmed |
| 17 | Export | 4 | 3 | 11 | ❌ SYSTEMIC BUG: `canExport(userId, resourceKey)` is called with PLURAL resource keys but `EXPORT_PERMISSIONS` map uses SINGULAR keys → 14/18 resources' exports throw `Forbidden: export permission required for "{resource}"` at runtime |
| 12 | Validation | 0 | 0 | 18 | ❌ SYSTEMIC GAP: ZERO resources set `fields[].validation`. Critical: `review.rating` (schema Int 1..5) has no min/max → user could submit rating=999; `payment.amount` (BigInt) has no min → negative amounts accepted; `user.email` has no pattern |

---

## 4. Top 7 Systemic Findings (cross-cutting)

### 🚨 4.1 CRITICAL: Field Validation (Dim 12) = ❌ for ALL 18/18

`FieldValidation` interface (`types.ts:95-110`) supports `minLength/maxLength/min/max/pattern/validator/message` but ZERO of 18 configs use it.

**User-critical impact:**
- `review.rating` (schema `Int // 1..5`) has no `validation: { min: 1, max: 5 }` → user could submit `rating=999`
- `payment.amount` (BigInt currency) has no min → user could submit negative amounts
- `user.email` has no pattern → invalid emails accepted
- `user.mobile` has no pattern → any string accepted
- `deal.agreedAmount` (BigInt) has no min
- `auction.startingBid` has no min
- `transport.cargoWeight` (Float) has no min
- `buy-request.budgetMin/budgetMax` (BigInt) have no min/max relationship check

### 🚨 4.2 CRITICAL: Permission Constants Not Seeded (Dim 3) = ⚠️ for 8/18

Resources affected: **parts, machines, reviews, offers, auctions, inspections, transports, buy-requests**

Their `permissions.read/create/...` values (`part.*`, `machine.*`, `review.*`, `inspection.read`, `transport.read`, `request.read`, `auction.manage`, etc.) are NOT in the canonical `PERMISSIONS` array (`authorization/permissions.ts:34-155`) AND NOT seeded into the DB Permission table by `seed-rbac.ts` / `seed-permission-matrix.ts`.

**Runtime impact:** `can()` returns false at runtime → universal API GET returns **403 Forbidden for ALL users including ADMIN**.

Only **disputes** works at runtime among marketplace CP resources (reuses `deal.read`/`deal.manage` which ARE seeded).

### 🚨 4.3 CRITICAL: Export Singular/Plural Mismatch (Dim 17) = ❌ for 11/18

`canExport(userId, resourceKey)` at `authorization/index.ts:215-231` receives PLURAL resource keys (`'orders'`, `'payments'`, `'companies'`, etc.) from `bulk-export-engine.ts:199`.

The `EXPORT_PERMISSIONS` map at `authorization/index.ts:219-227` has only 7 entries with SINGULAR keys: `listing`, `user`, `order`, `payment`, `audit`, `product`, `brand`.

**Result:** 11/18 resources fall through to `${resource}.read` fallback → produces strings like `'orders.read'`, `'payments.read'`, `'companies.read'`, `'machines.read'`, `'reviews.read'`, `'deals.read'`, `'rfqs.read'`, `'offers.read'`, `'auctions.read'`, `'inspections.read'`, `'transports.read'`, `'disputes.read'`, `'buy-requests.read'` → NONE in PERMISSIONS array → canExport returns false even for ADMIN → executeExport throws `Forbidden: export permission required for "{resource}"` at runtime.

Only **listings, brands, users, products** exports work (singular keys mapped). **Class A systemic runtime bug.**

### ⚠️ 4.4 HIGH: Action Handlers Missing (Dim 15) = ⚠️ for 17/18

Action engine (`action-engine.ts:97-165`) registers only 8 generic handlers tuned for content/catalog moderation: `publish`, `unpublish`, `feature`, `unfeature`, `verify`, `suspend`, `activate`, `delete`.

Marketplace transaction-lifecycle action keys used by marketplace resources have NO registered handlers:
- `confirm`, `cancel` (orders, deals)
- `refund` (payments)
- `close` (rfqs, buy-requests)
- `accept`, `reject` (offers, transports)
- `start`, `end` (auctions)
- `schedule`, `complete` (inspections)
- `deliver` (transports)
- `review`, `resolve` (disputes)
- `hide` (reviews)
- `verify-email` (users)

At runtime, `action-engine.ts:233` throws `Error: No handler for action "..."`.

**Additional bug:** existing `verify` handler writes `{ verified: true, verification: 'VERIFIED' }` but `Payment`, `Company`, `BuyRequest` models have NO `verification` field → Prisma throws `PrismaClientValidationError: Unknown arg 'verification' in data`.

Of ~30 action invocations across 18 resources, ~12 throw "No handler" at runtime, ~4 throw Prisma validation errors. Only ~10 actions work at runtime.

### ⚠️ 4.5 HIGH: Field-Level Permissions Absent (Dim 4) = ⚠️ for ALL 18/18

`AdminField.permissions` (`types.ts:62-66`) supports per-field `read`/`write` gating. NONE of 18 configs set it.

Generic infra `field-policy.ts` (3 functions: `applyFieldPolicy`, `applyFieldWritePolicy`, `filterReadableFieldsAsync`) exists but is fed `null` for `field.permissions` on every field → effectively a no-op for PII protection.

**Critical exposures (no field-level protection):**
- `user.passwordHash` (user.ts:61) — exposed
- `payment.trackingCode`, `payment.idempotencyKey`, `payment.providerReference` — financial reconciliation fields exposed
- `company.email`, `company.phone`, `company.address` (PII) exposed
- `transport.carrierPhone` (PII) exposed
- `buy-request.requesterName`, `buy-request.requesterPhone` (PII) exposed

### ⚠️ 4.6 HIGH: Per-Resource Test Coverage Absent (Dim 19) = ⚠️ for ALL 18/18

User warning "498 contract tests ≠ 18 × complete resource runtime verification" — **confirmed**.

All 18 resources share generic `resource-contract.test.ts` (373 tests = 27 invariants × 18 resources). Zero per-resource test files exist.

Existing phase files test SCHEMA strings or PUBLIC marketplace API routes, NOT admin-resource contract:
- `tests/phase9-orders-deals.test.ts` — schema + public `/api/orders/[id]/disputes`
- `tests/phase10-reviews-reputation.test.ts` — schema only
- `tests/phase7-rfq-matching.test.ts` — schema + matching logic
- `tests/phase5-trust.test.ts` — schema only (`db.inspection.count()`)

### ⚠️ 4.7 HIGH: Audit Action Labels Point to Non-Existent Permissions (Dim 18)

Audit is configured ✅ for all 18 (audit.enabled=true), BUT for 4 of 18 resources (inspections, transports, buy-requests, parts/machines), the `audit.actions[]` values use permission constants NOT in the canonical PERMISSIONS array:
- `inspection.read` (R15)
- `transport.read` (R16)
- `request.read` (R18)
- `part.update` (R5)
- `machine.update` (R9)

Audit log writes happen, but the `entityType/actions` config is partially fictional — audit records would be created but no permission check would ever resolve them.

---

## 5. 16-A Inventory Errors Confirmed

> **User warning "do NOT trust 16-A summary" — confirmed necessary across 12+ rows.**

| 16-A Row | Claim | Actual | Severity |
|---|---|---|---|
| 4 products | Columns=153 | 9 columns | Medium — file line count confusion |
| 5 parts | Columns=134 | 5 columns | Medium |
| 5 parts | Relations=✓ | NO `relations` field | **High** — used as evidence in 16-A §1 |
| 7 payments | Relations=✓ | NO `relations` field | High |
| 8 companies | Columns=69 | 11 columns | Medium |
| 9 machines | Columns=135 | 6 columns | Medium |
| 10 reviews | Columns=38 | 7 columns | Medium |
| 10 reviews | Relations=✓ | NO `relations` field | High |
| 11 deals | Columns=202 | 10 columns | Medium |
| 12 rfqs | Columns=176 | 10 columns | Medium |
| 13 offers | Columns=146 | 10 columns | Medium |
| 13 offers | Relations=✓ | NO `relations` field | High |
| 14 auctions | Columns=126 | 10 columns | Medium |
| 15 inspections | Columns=101 | 8 columns | Medium |
| 16 transports | Columns=81 | 12 columns (81 ≈ line range of transportConfig, not column count) | Medium |
| 17 disputes | Columns=181 | 9 columns | Medium |
| 17 disputes | Relations=✓ | NO `relations` field | High — count was off by 7 |
| 18 buy-requests | Columns=28 | 10 columns | Medium |

**Pattern:** 16-A §1 "Columns" numbers appear to be file line counts or model field counts, NOT actual `columns[]` array lengths.

**16-A §1 "Relations ✓" was wrong for 5 of 18** (parts, payments, reviews, offers, disputes). Actual missing count is **9 of 18**, not 2.

---

## 6. Resource Completeness Verdict (per user's 3-principle completion policy)

| Tier | Resources | Verdict |
|---|---|---|
| 🥇 Best (80% = 16/20) | listings, brands, users, products | **NOT COMPLETE** — 1 ❌ each (Dim 12 field validation), 3 ⚠️ each (Dim 4 field policy, Dim 15 actions, Dim 19 tests) |
| 🥈 Good (70-75%) | orders, deals, companies, rfqs | **NOT COMPLETE** — 1-2 ❌ each, 3-5 ⚠️ each |
| 🥉 Fair (60-65%) | payments, reviews, auctions, disputes | **NOT COMPLETE** — 3-5 ❌ each |
| ⚠️ Gap-heavy (50-55%) | parts, machines, offers, inspections, transports, buy-requests | **SIGNIFICANTLY INCOMPLETE** — 5-6 ❌ each (missing detailTabs/relations/bulkActions/exportPermission entirely) |

### Per user completion policy:
> "هیچ‌وقت صرفاً به خاطر وجود Schema/API یک Domain را Complete اعلام نکنیم"
> (Never declare a domain complete merely because Schema/API exists)

**Completion verdict: 0 of 18 resources are COMPLETE.**

Even top-tier listings/brands/users/products still have 1 ❌ (Dim 12 validation) + 3 ⚠️ each.

---

## 7. What This Step Did NOT Do

- ✅ No code changes
- ✅ No feature implementation
- ✅ No schema changes
- ✅ No index additions
- ✅ Baseline preserved
- ✅ Only `worklog.md` and this document were created/modified

---

## 8. Next Steps

```
✅ 16-A Repository Inventory ← COMPLETE
✅ 16-B Completion Matrix ← COMPLETE (this document, 18×20 cells)
🔵 16-C Gap + Debt Audit (NEXT) — using systemic findings from 16-B:
   - Fix Class A: singular/plural mismatch in canExport (Dim 17) — 11/18 affected
   - Fix Class A: add 8 missing permission constants to PERMISSIONS array + DB seed (Dim 3) — 8/18 affected
   - Fix Class A: add FieldValidation to all 18 resources (Dim 12) — 18/18 affected
   - Fix Class B: register 8 marketplace transaction-lifecycle action handlers in action-engine.ts (Dim 15) — 17/18 affected
   - Fix Class B: fix verify handler to not write `verification` field (Payment/Company/BuyRequest Prisma mismatch)
   - Fix Class C: per-resource contract test files (Dim 19) — 18/18 affected
   - Fix Class C: 9 resources missing relations, 7 missing detailTabs, 10 missing bulkActions
🔵 16-D Runtime Verification (post-16-C) — actual CRUD smoke per resource with admin auth
🔵 16-E GREEN/YELLOW/RED (final verdict)
```

**Important note for 16-C:** This matrix has 65 ⚠️ + 57 ❌ = 122 cells that need remediation. The 7 systemic findings alone, if fixed, would close ~84 cells:
- Dim 3 × 8 = 8 cells
- Dim 4 × 18 = 18 cells
- Dim 12 × 18 = 18 cells
- Dim 15 × 17 = 17 cells
- Dim 17 × 14 = 14 cells (11 ❌ + 3 ⚠️ that would resolve)
- Dim 19 × 18 = 18 cells

16-C should prioritize systemic fixes (high-leverage) over per-resource config additions (low-leverage).

---

## 9. Source Files Audited

### Resource config files (5 files)
- `src/lib/admin/resources/listing.ts` (120 lines)
- `src/lib/admin/resources/brand.ts` (102 lines)
- `src/lib/admin/resources/user.ts` (110 lines)
- `src/lib/admin/resources/store-resources.ts` (487 lines — 7 configs)
- `src/lib/admin/resources/marketplace-resources.ts` (551 lines — 8 configs)

### Engine service files (9 files)
- `src/lib/admin/resource-registry.ts` (59 lines)
- `src/lib/admin/resource-index.ts` (33 lines — registers all 18)
- `src/lib/admin/types.ts` (209 lines — AdminResourceConfig + FieldValidation + AdminField.permissions schema)
- `src/lib/admin/data-adapter.ts` (140 lines)
- `src/lib/admin/action-engine.ts` (273 lines — 8 generic handlers)
- `src/lib/admin/bulk-export-engine.ts` (281 lines)
- `src/lib/admin/field-policy.ts` (107 lines)
- `src/lib/admin/audit.ts` (86 lines)
- `src/lib/admin/query/{filter,sort,pagination-search,query-builder}.ts` (4 files)

### Authorization files (2 files)
- `src/lib/authorization/permissions.ts` (226 lines — 71 permission constants + ROLE_PERMISSIONS map)
- `src/lib/authorization/index.ts` (264 lines — canExport + EXPORT_PERMISSIONS + BULK_PERMISSION_MAP)

### Universal API routes (2 files)
- `src/app/api/admin/resources/[resource]/route.ts` (164 lines — GET list + POST create)
- `src/app/api/admin/resources/[resource]/[id]/route.ts` (133 lines — GET/PATCH/DELETE single)

### Universal UI components (3 files)
- `src/components/admin/universal-table.tsx` (408 lines)
- `src/components/admin/universal-form.tsx` (552 lines)
- `src/components/admin/universal-detail.tsx` (328 lines)

### Schema
- `prisma/schema.prisma` (2400+ lines — 18 model definitions verified against `config.model`)

### Tests
- `tests/contract/resource-contract.test.ts` (373 tests)
- `tests/contract/rbac-matrix.test.ts` (63 tests)
- `tests/contract/crud-pipeline.test.ts` (28 tests)
- `tests/contract/page-builder.test.ts` (34 tests)
- Phase test files (verified NOT to test admin-resource contract)

### Verification docs referenced
- `docs/verification/STEP-14.8-EVIDENCE.md` (§10.2 smoke matrix — 21 URLs, only 17 admin resource URLs covered; companies missing)
- `docs/verification/STEP-15-PERFORMANCE-BASELINE.md` (§83-86 — API 401 auth-redirect smoke)
- `docs/verification/STEP-16-A-REPOSITORY-INVENTORY.md` (§1 — Resource Registry table, used as input but verified from source)
