# HEAVIX — Path Selection Evidence Freeze

> **Purpose:** Evidence-based assessment of repository state to determine which track should proceed next. NO code changes.
>
> **Frozen at:** git commit `2d8dbdc` (STEP 15-B.5.4-F head)

---

## 1. Repository Health

| Check | Status | Detail |
|---|---|---|
| Git HEAD | `2d8dbdc` | 100 commits total, working tree clean |
| tsc --noEmit | ✅ 0 errors | |
| eslint src/ | ✅ 0 errors | 5 pre-existing warnings |
| Contract tests | ✅ 498/498 PASS | |
| Production build | ✅ exit 0 | `.next/standalone/server.js` exists (710MB) |
| Gate | 🟢 GREEN | 73/74 PASS, 0 CRITICAL, 0 HIGH |
| DB | 120 tables, 286 indexes | 3153 rows total |
| @ts-nocheck | ⚠️ 52 files | Class B — accepted debt with V2.5 criteria |
| Legacy migrations | ⚠️ 38 PENDING | Not yet redirected to Universal Engine |
| Dev server | ⚠️ Unstable in sandbox | Kills after few requests — watchdog restarts |

---

## 2. Track A — Performance (remaining work)

| Step | Status | Value | Priority |
|---|---|---|---|
| 15-A Baseline | ✅ COMPLETE | DB = 1.75% of TTFB | — |
| 15-B DB/Query | ✅ COMPLETE | Brand.name index + count dedup + Promise.all + cache | — |
| 15-C Admin/Auth | NOT STARTED | Admin resource TTFB | LOW (admin-only, sandbox auth limitation) |
| 15-D Frontend | NOT STARTED | 98.25% of TTFB (JS render + HTML + network) | **HIGH (user-facing)** |
| 15-E Regression | NOT STARTED | Safety net for all 15-B changes | MEDIUM |

### 2.1 15-D is the biggest user-facing opportunity

Current Homepage TTFB breakdown (warm, production):
- Total: 47.70ms
- DB (T1/T2 cached + T3 fresh): ~1.2ms (2.5%)
- JS render + HTML serialization + network: ~46.5ms (97.5%)

15-D would address the 46.5ms non-DB overhead:
- Bundle size optimization (149 JS chunks, 4.1MB total)
- Dynamic imports for route-specific code
- Image optimization
- RSC payload optimization
- React component tree analysis

### 2.2 15-C has sandbox limitation

15-C (Admin/Auth Performance) requires authenticated test sessions to measure admin routes. The sandbox doesn't have admin auth available. This makes 15-C difficult to execute meaningfully — similar to D4 limitation.

### 2.3 15-E is a safety net, not a feature

15-E (Regression Gate) re-runs all baselines to verify no regression. It's valuable but doesn't add new capability. Should run before declaring 15-* complete.

---

## 3. Track B — Control Plane (STEP 16+)

| Step | Status | Value | Priority |
|---|---|---|---|
| 16 Verification | NOT STARTED | Audit all 18 resources against full chain | **HIGH (correctness)** |
| 17 Store CP | NOT STARTED | Store resource completeness | MEDIUM |
| 18 Marketplace CP | NOT STARTED | Marketplace resource completeness | MEDIUM |
| 19 Page Builder | NOT STARTED | Generalize homepage-layout | MEDIUM |

### 3.1 STEP 16 would verify

Per user's V3.1 plan, each of the 18 resources needs:
- Registry ✅ (all 18 registered)
- Permission ✅ (71 permissions, 5 roles)
- Field Policy ✅ (applyFieldPolicy implemented)
- API ✅ (Universal Resource API)
- Service ✅ (data-adapter)
- Table ✅ (Universal Table component)
- Filter ✅ (filter-engine, 14 operators)
- Sorting ✅ (sort-engine)
- Pagination ✅ (pagination-search)
- Form ⚠️ (universal-form.tsx — has @ts-nocheck)
- Validation ⚠️ (server validation — needs verification)
- Detail ⚠️ (universal-detail.tsx — has @ts-nocheck)
- Relations ⚠️ (config.relations — needs verification per resource)
- Actions ✅ (action-engine, 8 handlers)
- Bulk ✅ (bulk-export-engine)
- Export ✅ (CSV/JSON export)
- Audit ✅ (audit-foundation)
- Tests ✅ (498 contract tests)
- Runtime ⚠️ (smoke tested, but not all 18 resources individually verified)

### 3.2 Known gaps in Control Plane

1. **universal-form.tsx** — has @ts-nocheck (Class C, cleared in 14.8-E but still in 52-file count)
2. **universal-detail.tsx** — has @ts-nocheck (Class C, cleared in 14.8-E)
3. **Server validation** — needs per-resource verification
4. **Relations** — config.relations needs verification per resource
5. **38 PENDING legacy pages** — not yet redirected to Universal Engine
6. **52 @ts-nocheck files** — could mask runtime errors

---

## 4. Critical Path Analysis

### 4.1 What's most important for the project RIGHT NOW?

| Concern | Impact | Urgency | Evidence |
|---|---|---|---|
| **15-D: Frontend TTFB** | User-facing performance | HIGH | 97.5% of TTFB is non-DB — biggest opportunity |
| **STEP 16: Control Plane** | Correctness/completeness | HIGH | 18 resources need full-chain verification |
| **52 @ts-nocheck** | Technical debt risk | MEDIUM | Could mask runtime errors, but production build catches import errors |
| **38 PENDING migrations** | Completeness | MEDIUM | Bespoke routes work but aren't unified |
| **15-C: Admin perf** | Admin UX | LOW | Sandbox limitation, admin-only |
| **15-E: Regression** | Safety net | MEDIUM | Should run before declaring complete |

### 4.2 Dependencies between tracks

- 15-D (Frontend) is **independent** — can proceed without Control Plane work
- STEP 16 (Control Plane Verification) is **independent** — can proceed without 15-D
- 15-E (Regression) should run **after** whichever track modifies code
- 15-C (Admin perf) is **blocked** by sandbox auth limitation

### 4.3 Recommendation

Two viable paths:

**Option A: 15-D (Frontend Performance)**
- Addresses the biggest user-facing performance opportunity (97.5% of TTFB)
- Independent of Control Plane work
- Can produce measurable improvement
- Scope: bundle analysis, dynamic imports, image optimization, RSC payload
- Risk: frontend changes can break rendering

**Option B: STEP 16 (Control Plane Verification)**
- Addresses correctness/completeness gaps
- Independent of frontend work
- Would identify exactly which of the 18 resources have gaps
- Scope: audit matrix per resource, verify full chain
- Risk: may discover gaps that require significant work to fix

**Both are HIGH priority.** The choice depends on project goals:
- If user-facing performance is the priority → 15-D
- If correctness/completeness is the priority → STEP 16
- If both are needed → they can run in parallel (independent tracks)

### 4.4 What I recommend based on evidence

**STEP 16 (Control Plane Verification) should come first** because:
1. Per user's 3 laws: "Feature جدید بدون Completion Matrix وارد کد نشود" — before adding more features, verify existing ones are complete
2. 52 @ts-nocheck files + 38 PENDING migrations represent correctness risk
3. 15-D can be done later (frontend optimization doesn't affect correctness)
4. STEP 16 would identify which resources have gaps — this is knowledge needed before any further development
5. The Universal Engine files (universal-form.tsx, universal-detail.tsx) were cleared of @ts-nocheck in 14.8-E — STEP 16 would verify they're actually working correctly at runtime

**But:** 15-D has higher user-facing impact. If the priority is user experience over correctness verification, 15-D should come first.

---

## 5. What This Step Did NOT Do

- ✅ No code changes
- ✅ No feature implementation
- ✅ No schema changes
- ✅ No index additions
- ✅ Baseline preserved

---

## 6. Next Steps (pending user decision)

The user should choose:

```
Option A: 15-D (Frontend Performance)
  → Bundle analysis, dynamic imports, image optimization
  → Addresses 97.5% of TTFB
  → User-facing impact

Option B: STEP 16 (Control Plane Verification)
  → Audit all 18 resources against full chain
  → Identifies correctness/completeness gaps
  → Correctness impact

Option C: 15-E (Regression Gate) first
  → Re-run all baselines to verify 15-B changes haven't regressed
  → Safety net before continuing
  → Quick (mostly re-running existing measurement scripts)
```

Per user's 3 laws:
1. "Feature جدید بدون Completion Matrix وارد کد نشود" → favors STEP 16
2. "Optimization بدون Baseline + Measurement + Semantic Verification پذیرفته نشود" → favors 15-D (with proper measurement)
3. "هیچ‌وقت صرفاً به خاطر وجود Schema/API یک Domain را Complete اعلام نکنیم" → favors STEP 16
