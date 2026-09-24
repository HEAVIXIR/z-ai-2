# HEAVIX — STEP 16-A: Repository / Control Plane Inventory

> **Status:** Evidence Freeze from actual source code — NO code changes.
>
> **Per user policy:** "قبل از تغییر کد شروع شود... بدون اینکه قبل از استخراج شواهد، هیچ Resource یا STEP را Complete اعلام کنیم"
>
> **Frozen at:** git commit `bc732fc`

---

## 1. Resource Registry (18 resources)

All 18 resources registered in `src/lib/admin/resource-index.ts`:

| # | Key | Model | Config file | Columns | Permissions | Audit | Relations |
|---:|---|---|---|---:|---:|---:|---:|
| 1 | listings | listing | listing.ts | 42 | ✓ | ✓ | ✓ |
| 2 | brands | brand | brand.ts | 37 | ✓ | ✓ | ✓ |
| 3 | users | user | user.ts | 35 | ✓ | ✓ | ✓ |
| 4 | products | product | store-resources.ts | 153 | ✓ | ✓ | ✓ |
| 5 | parts | part | store-resources.ts | 134 | ✓ | ✓ | ✓ |
| 6 | orders | order | store-resources.ts | 119 | ✓ | ✓ | ✓ |
| 7 | payments | payment | store-resources.ts | 97 | ✓ | ✓ | ✓ |
| 8 | companies | company | store-resources.ts | 69 | ✓ | ✓ | ✓ |
| 9 | machines | machine | store-resources.ts | 135 | ✓ | ✓ | ✓ |
| 10 | reviews | review | store-resources.ts | 38 | ✓ | ✓ | ✓ |
| 11 | deals | deal | marketplace-resources.ts | 202 | ✓ | ✓ | ✓ |
| 12 | rfqs | rFQ | marketplace-resources.ts | 176 | ✓ | ✓ | ✓ |
| 13 | offers | listingOffer | marketplace-resources.ts | 146 | ✓ | ✓ | ✓ |
| 14 | auctions | auction | marketplace-resources.ts | 126 | ✓ | ✓ | ✓ |
| 15 | inspections | inspection | marketplace-resources.ts | 101 | ✓ | ✓ | — |
| 16 | transports | transportRequest | marketplace-resources.ts | 81 | ✓ | ✓ | — |
| 17 | disputes | dispute | marketplace-resources.ts | 181 | ✓ | ✓ | ✓ |
| 18 | buy-requests | buyRequest | marketplace-resources.ts | 28 | ✓ | ✓ | — |

**All 18 resources have:** Registry ✓, Columns ✓, Permissions ✓, Audit ✓
**16 of 18 have Relations** (inspections, transports, buy-requests do not)

---

## 2. Universal API Routes

| Route | File | Handlers | @ts-nocheck |
|---|---|---|---:|
| `POST /api/admin/resources/[resource]` | route.ts | 1 (create) | 0 (cleared in 14.8-E) |
| `GET /api/admin/resources/[resource]` | route.ts | 1 (list) | 0 |
| `GET /api/admin/resources/[resource]/[id]` | [id]/route.ts | 1 (detail) | 0 |
| `PATCH /api/admin/resources/[resource]/[id]` | [id]/route.ts | 1 (update) | 0 |
| `DELETE /api/admin/resources/[resource]/[id]` | [id]/route.ts | 1 (delete) | 0 |

**All 5 CRUD handlers present.** No @ts-nocheck on Universal API routes.

---

## 3. Universal Engine Components

| Component | File | Lines | @ts-nocheck | Status |
|---|---|---:|---:|---|
| Universal Table | `universal-table.tsx` | 408 | 0 | ✅ Type-safe |
| Universal Form | `universal-form.tsx` | 552 | 0 (cleared 14.8-E) | ✅ Type-safe |
| Universal Detail | `universal-detail.tsx` | 328 | 0 (cleared 14.8-E) | ✅ Type-safe |

**All 3 components type-safe.** @ts-nocheck removed in STEP 14.8-E.

---

## 4. Engine Services

| Service | File | Lines | @ts-nocheck | Functions |
|---|---|---:|---:|---:|
| Resource Registry | resource-registry.ts | 59 | 0 | 3 (register, get, has) |
| Data Adapter | data-adapter.ts | 140 | 0 | 5 (list, get, create, update, delete) |
| Action Engine | action-engine.ts | 273 | 0 | 1 (executeAction) + 8 handlers |
| Bulk/Export Engine | bulk-export-engine.ts | 281 | 0 | 2 (executeBulkAction, executeExport) |
| Field Policy | field-policy.ts | 107 | 0 | 3 (applyFieldPolicy, applyFieldWritePolicy, filterReadableFieldsAsync) |
| Query Builder | query-builder.ts | 93 | 0 | 1 (parseQueryParams) |
| Filter Engine | filter-engine.ts | 128 | 0 | 14 operators |
| Sort Engine | sort-engine.ts | 63 | 0 | 1 (applySorting) |
| Pagination+Search | pagination-search.ts | 76 | 0 | 1 (applyPaginationSearch) |

**All 9 engine services type-safe.** 0 @ts-nocheck.

---

## 5. RBAC / Permissions

| File | Lines | Content |
|---|---:|---|
| permissions.ts | 226 | 71 permission constants + ROLE_PERMISSIONS map |
| authorization/index.ts | 264 | 11 functions (can, canAny, canAll, requirePermission, isAdmin, canAccessResource, canBulkAction, canExport, etc.) |

---

## 6. Audit

| File | Lines | Functions |
|---|---:|---:|
| audit-foundation.ts | 308 | 6 (auditMutation, requirePermissionAndAudit, auditCreate, auditDelete, etc.) |
| admin/audit.ts | 86 | 1 (logAudit) |

---

## 7. Tests

| Test file | Tests | Status |
|---|---:|---|
| resource-contract.test.ts | 373 | ✅ PASS |
| rbac-matrix.test.ts | 63 | ✅ PASS |
| crud-pipeline.test.ts | 28 | ✅ PASS |
| page-builder.test.ts | 34 | ✅ PASS |
| **Total** | **498** | ✅ ALL PASS |

---

## 8. Admin Routes (Universal Resource Manager)

| Route | Exists |
|---|---|
| `/admin/resources/[resource]` (list) | ✅ |
| `/admin/resources/[resource]/[id]` (detail) | ✅ |
| `/admin/resources/[resource]/new` (create form) | ✅ |

---

## 9. @ts-nocheck Inventory (52 files)

### 9.1 Universal Engine files — CLEARED (0 @ts-nocheck)

| File | @ts-nocheck directive | Note |
|---|---|---|
| `src/app/api/admin/resources/[resource]/route.ts` | **0** | Cleared in 14.8-E. First line mentions "@ts-nocheck removed" in comment. |
| `src/components/admin/universal-form.tsx` | **0** | Cleared in 14.8-E. |
| `src/components/admin/universal-detail.tsx` | **0** | Cleared in 14.8-E. |

### 9.2 Legacy files — 52 with actual @ts-nocheck directive

| Directory | Count |
|---|---:|
| src/app/api/ | 26 |
| src/app/admin/ | 11 |
| src/app/dashboard/ | 4 |
| src/app/ (other) | 3 |
| src/components/ | 6 |
| src/lib/ | 2 |
| **Total** | **52** |

### 9.3 False positive note

Earlier counts of "55 files with @ts-nocheck" were inflated by 3 false positives: the Universal Engine files mention `@ts-nocheck` in their first-line comment ("@ts-nocheck removed") but don't have the actual TypeScript directive. Proper check confirms **52 actual @ts-nocheck directives**.

---

## 10. Legacy Migration Status (from 14.7-H, verified)

| Status | Count |
|---|---:|
| MIGRATED (redirected to Universal Resource Manager) | 28 |
| KEEP_AS_IS (bespoke UI — dashboards, AI tools, CMS editors) | 32 |
| PENDING (not yet redirected) | 38 |
| IN_PROGRESS | 4 |
| DEPRECATED | 2 |
| **Total** | **104** |

---

## 11. Engineering Gates (current)

| Gate | Status |
|---|---|
| tsc --noEmit | ✅ 0 errors |
| eslint src/ | ✅ 0 errors (5 warnings) |
| vitest tests/contract/ | ✅ 498/498 PASS |
| next build | ✅ exit 0 |
| Gate (production-readiness-gate.ts) | 🟢 GREEN 73/74 |
| DB | 120 tables, 286 indexes |
| @ts-nocheck | ⚠️ 52 files (Class B, legacy) |
| Legacy migrations | ⚠️ 38 PENDING |

---

## 12. What's Verified vs What's Reported

### 12.1 Verified from source code (this Evidence Freeze)

| Layer | Evidence | All 18 resources? |
|---|---|---|
| Registry | ✅ resource-index.ts imports + registers all 18 | Yes |
| Config (columns/permissions/audit/relations) | ✅ Read from config files | Yes (16/18 have relations) |
| API routes | ✅ 5 handlers in Universal API | Yes (generic, works for all) |
| Services | ✅ 9 engine service files, 0 @ts-nocheck | Yes (generic) |
| Components | ✅ 3 components (Table/Form/Detail), 0 @ts-nocheck | Yes (generic) |
| RBAC | ✅ permissions.ts + authorization/index.ts | Yes (71 permissions, 5 roles) |
| Field Policy | ✅ field-policy.ts, 3 functions | Yes (generic) |
| Audit | ✅ audit-foundation.ts + admin/audit.ts | Yes (generic) |
| Tests | ✅ 498 contract tests | Yes (373 resource contract + 63 RBAC + 28 CRUD + 34 page-builder) |
| Admin routes | ✅ 3 routes (list/detail/new) | Yes (generic, works for all) |

### 12.2 NOT yet verified from source (needs 16-B/16-D)

| Layer | Gap | What's needed |
|---|---|---|
| Server validation | Not verified per-resource | Check if each resource config has field validations |
| Runtime CRUD per resource | Not individually tested | Smoke test each of 18 resources via API |
| Permission enforcement | Not runtime-tested | Test deny path for each resource |
| Field policy enforcement | Not runtime-tested | Test read/write policy per resource |
| Actions per resource | Not verified which actions exist | Check config.actions for each resource |
| Bulk per resource | Not verified which resources have bulk | Check config.bulkActions |
| Export per resource | Not verified | Check if export works for each resource |
| Form rendering | Not verified | Check if universal-form renders for each resource config |
| Detail rendering | Not verified | Check if universal-detail renders for each resource config |

---

## 13. What This Step Did NOT Do

- ✅ No code changes
- ✅ No feature implementation
- ✅ No schema changes
- ✅ No index additions
- ✅ Baseline preserved

---

## 14. Next Steps

```
✅ 16-A Repository Inventory ← COMPLETE (this document)
🔵 16-B Completion Matrix (per-resource layer-by-layer audit)
🔵 16-C Gap + Debt Audit (52 @ts-nocheck + 38 PENDING migrations)
🔵 16-D Runtime Verification (permission deny/allow, CRUD, validation per resource)
🔵 16-E GREEN/YELLOW/RED
```

**16-B should:**
- For each of the 18 resources, verify EVERY layer from the actual source code
- Not trust previous "COMPLETE" reports — verify from code
- Mark each cell as ✅ (evidence found) or ⚠️ (gap) or ❌ (missing)

**16-C should:**
- Audit each of the 52 @ts-nocheck files: owner, scope, severity, remediation
- Audit each of the 38 PENDING migrations: resource, owner, risk, blocking dependency
- Not dismiss them just because Gate is GREEN
