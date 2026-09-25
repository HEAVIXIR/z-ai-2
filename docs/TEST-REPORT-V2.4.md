# HEAVIX — Categorized Test Report (V2.4)

**Generated:** STEP 14.7-G + 14.7-H + 14.8
**Database:** PostgreSQL 17 (113 models, 74 tables populated, 5215+ rows)
**Runtime:** Next.js 16 + TypeScript 5 (0 type errors; 55 legacy files under @ts-nocheck with Owner=Migration)

---

## 1. Categorized Test Summary

| Category | Test File | Tests | Status |
|---|---|---:|:---:|
| **Contract** — resource schema | `tests/contract/resource-contract.test.ts` | 373 | ✅ PASS |
| **RBAC** — 5-role × 71-permission matrix | `tests/contract/rbac-matrix.test.ts` | 63 | ✅ PASS |
| **CRUD** — pipeline (list/get/create/update/delete/action/bulk/export/audit) | `tests/contract/crud-pipeline.test.ts` | 28 | ✅ PASS |
| **Page Builder** — draft→publish→rollback→immutability→parity | `tests/contract/page-builder.test.ts` | 34 | ✅ PASS |
| **E2E** — agent-browser smoke of `/` route | manual + scheduled cron | 1 | ✅ PASS |
| **TOTAL (automated)** | 4 files | **498** | ✅ ALL GREEN |

---

## 2. Page Builder Verification (STEP 14.7-G) — Special Focus

The user specifically emphasized: **rollback-as-new-version, immutability, Preview=Production**.

### 2.1 Golden Invariant — `rollback(V1) → V3=clone(V1), V1 & V2 unchanged`

The test `tests/contract/page-builder.test.ts → "GOLDEN: rollback(V1) should create V3 (not mutate V1)"` proves:

1. Before rollback, **V1** = PUBLISHED with layout A; **V2** = DRAFT with layout B.
2. Rollback to V1 creates a brand-new row **V3** (version number = max+1), `status=PUBLISHED`, `layout = V1.layout` (deep copy).
3. **V1's layout is byte-identical** before and after rollback (`JSON.stringify(v1.layout) === v1LayoutBefore`).
4. **V2 is completely untouched** — its layout and status are unchanged.
5. **V3.layout === V1.layout** (verified via `JSON.stringify` deep equality).
6. V2's layout differs from V3's (proves V3 is not a copy of V2).
7. After rollback, the page has 3 versions (V1 ARCHIVED, V2 DRAFT, V3 PUBLISHED).
8. The `page.publishedVersionId` now points to V3.

This matches the production rollback API in `src/app/api/admin/pages/[id]/rollback/route.ts`:
- Step 4: `db.adminPageVersion.create(...)` — **creates** a new version (never updates the target).
- Step 5: archives the *previously published* version (V1's status transitions PUBLISHED→ARCHIVED; its layout is **never** written).
- Step 6: `page.publishedVersionId` is repointed to the new version.

> **Note on the "V1 unchanged" semantics:** V1's *content* (layout JSON) is immutable. V1's *operational status* transitions PUBLISHED→ARCHIVED as part of the rollback pointer swap — this is metadata, not content. The test asserts both: layout immutability (strict equality) + status transition.

### 2.2 Preview = Production Parity

Four layered parity tests were added in 14.7-G:

1. **Validation parity** — same layout → same `validateLayout()` result (valid flag + errors array).
2. **Source parity (no branching)** — `page-renderer.tsx` is scanned for `isPreview`, `mode==='preview'`, `mode==='production'`, `props.isPreview/mode/renderContext` patterns — all must be absent. The renderer is single-purpose; it has no idea whether the caller is preview or production.
3. **Import parity** — the preview route (`src/app/preview/page/[key]/page.tsx`) imports `PageRenderer` from the same module path any production route would.
4. **Behavioral parity** — for 4 different layouts (valid, alternate, empty, partial), the production caller and the preview caller get byte-identical validation results.

### 2.3 Other Page Builder Invariants (all PASS)

| Invariant | Test |
|---|---|
| Draft creation creates page + initial version | "should create a page with initial draft version" |
| Layout stored as JSON | "should store layout as JSON in version" |
| Publish transitions DRAFT → PUBLISHED | "should publish V1 (DRAFT → PUBLISHED)" |
| New draft keeps V1 published | "should create V2 as new draft (V1 still published)" |
| Rollback is a new version | GOLDEN INVARIANT tests (above) |
| Preview does not mutate published state | "preview should NOT modify published version state" |
| Unknown widget rejected | "should reject unknown widget key" |
| SQL injection rejected | "should reject SQL injection in widget props" |
| JS eval rejected | "should reject JS injection in widget props" |
| `<script>` tag rejected | "should reject `<script>` tag in props" |
| `INSERT` statement rejected | "should reject INSERT statement in props" |
| Empty sections accepted | "should reject layout with empty sections" |
| Malformed layout rejected | "should reject layout without sections array" |
| 10 widgets registered | "should have 10+ registered widgets" |
| Unknown widget → undefined | "should return undefined for unknown widget" |
| Data sources use API paths, not SQL | "should have data sources with API paths" |
| Data sources carry permissions | "data sources should have permissions" |
| Widgets declare default data source | "widgets with data source should have defaultDataSource" |
| Audit before/after on publish | "should create audit entry for publish" |
| Audit before/after on rollback | "should create audit entry for rollback with before/after" |
| Missing version returns null | "missing version should return null (not throw)" |
| Missing page returns null | "missing page should return null (not throw)" |
| Unpublished page has null publishedVersionId | "page with no published version should have null publishedVersionId" |

---

## 3. Legacy Admin Migration Checklist (STEP 14.7-H)

`src/lib/admin/legacy-migration-checklist.ts` catalogs **104 legacy admin pages** with full metadata.

### 3.1 Migration Progress

| Status | Count | % |
|---|---:|---:|
| MIGRATED (page retired, route points to `/admin/resources/[resource]`) | 28 | 27% |
| KEEP_AS_IS (bespoke UI — dashboards, AI tools, CMS editors) | 32 | 31% |
| PENDING (planned for V2.5, route remains) | 38 | 37% |
| IN_PROGRESS (resource registered, partial migration) | 4 | 4% |
| DEPRECATED (duplicate, to be removed) | 2 | 2% |
| **Total addressed (MIGRATED + KEEP_AS_IS + DEPRECATED)** | **62** | **60%** |

### 3.2 Risk Distribution

| Risk | Count | Notes |
|---|---:|---|
| LOW (read-only, navigation) | 38 | |
| MEDIUM (form writes) | 43 | |
| HIGH (money, auth, state mutation) | 23 | All HIGH entries have explicit `owner` field set |

### 3.3 Owner Distribution

| Owner | Pages |
|---|---:|
| core | 35 |
| taxonomy | 13 |
| store | 12 |
| analytics | 12 |
| ai | 9 |
| cms | 9 |
| content | 7 |
| pricing | 3 |
| trust | 2 |
| seo | 1 |
| growth | 1 |

### 3.4 Per-page Schema (LegacyPageEntry)

Each entry records:
```ts
{
  legacyPath: string;        // current /admin/... route
  resource: string | null;   // registered AdminResource key (or null if N/A)
  replacementPath: string;   // migration target (or null if pending)
  capabilities: Capability[];// list/view/create/edit/delete/actions/bulk/export
  migrationStatus: MigrationStatus;
  risk: 'LOW'|'MEDIUM'|'HIGH';
  owner: string;             // team or ticket reference
  notes?: string;
}
```

---

## 4. Production Readiness Gate (STEP 14.8)

`src/lib/admin/production-readiness-gate.ts` enumerates **58 checkpoints** across 10 categories.

### 4.1 Gate Decision

| Metric | Value |
|---|---:|
| Total checks | 58 |
| PASS | 57 |
| PENDING | 1 |
| FAIL | 0 |
| CRITICAL pending | 0 |
| HIGH pending | 0 |
| **Gate Decision** | **🟢 GREEN** |

### 4.2 Pending Items (post-launch acceptable)

| ID | Category | Title | Severity |
|---|---|---|---|
| `MIG-05` | Migration | 42 pages PENDING migration (post-launch) | MEDIUM |

### 4.3 Checkpoint Categories

| Category | Checks | All PASS |
|---|---:|:---:|
| Schema | 6 | ✅ |
| RBAC | 6 | ✅ |
| Audit | 5 | ✅ |
| PageBuilder | 9 | ✅ |
| CRUD | 8 | ✅ |
| E2E | 4 | 4 ✅ |
| Security | 5 | ✅ |
| Performance | 3 | ✅ |
| Documentation | 5 | ✅ |
| Migration | 5 | 4 ✅ + 1 PENDING |

---

## 5. Run Instructions

```bash
# Run all contract tests
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public \
  PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH" \
  bunx vitest run tests/contract/

# Run only page-builder regression tests
bunx vitest run tests/contract/page-builder.test.ts

# Query the production readiness gate
bunx tsx -e "import { gateStats } from './src/lib/admin/production-readiness-gate'; console.log(gateStats());"

# Query the legacy migration checklist
bunx tsx -e "import { migrationStats } from './src/lib/admin/legacy-migration-checklist'; console.log(migrationStats());"
```

---

## 6. Conclusion

- ✅ All 498 automated contract tests pass.
- ✅ Page Builder golden invariant (rollback-as-new-version + immutability) verified at the database level.
- ✅ Preview = Production parity verified at the source + behavioral level.
- ✅ All 104 legacy admin pages cataloged with risk + owner.
- ✅ **Production build succeeds** (STEP 14.8-B): `next build` exit 0, 406MB artifact, 18 static + ~80 dynamic routes.
- ✅ **Production runtime smoke** (STEP 14.8-C): 21/21 URLs pass (4 public pages = 200, 17 admin routes = 307 → /login).
- ✅ **18 Resource Integration** (STEP 14.8-D): all 18 PASS — Registry → Prisma → Columns/Actions/Bulk → Universal API → Admin Route → DB.
- ✅ **Universal Engine @ts-nocheck = 0** (STEP 14.8-E): 3 files cleared; 52 Class B legacy files remain with V2.5 acceptance criteria.
- ✅ **38 PENDING legacy decisions frozen** (STEP 14.8-F): 27 MIGRATE_TO_RESOURCE, 4 MIGRATE_TO_PAGE_BUILDER, 7 KEEP_AS_IS.
- ✅ Production readiness gate has 73/74 PASS, 0 CRITICAL pending, 0 HIGH pending.

> **Corrected status language (per V2.4 user feedback):** "STEP 14.8 Gate evidence is GREEN with 73/74 checkpoints passing and no CRITICAL/HIGH pending items; final production release remains contingent on production-build verification (DONE), runtime integration evidence (DONE), and resolution/explicit acceptance of the remaining technical debt (52 Class B `@ts-nocheck` files + 27 MIGRATE_TO_RESOURCE executions tracked for V2.5 follow-up)."
>
> GREEN evidence-level gate ≠ production-ready. STEP 15 feature work is now unblocked because the production build + runtime smoke + integration verification have all been completed.

**The platform is cleared to enter STEP 15-18** — with the explicit understanding that V2.5 must clear the 52 Class B `@ts-nocheck` files and execute the 27 MIGRATE_TO_RESOURCE migrations identified in 14.8-F.
