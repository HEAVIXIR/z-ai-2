# ADR-013: Homepage Section Spacing Architecture

- **Status:** Accepted — design decision only; implementation remains gated
- **Date:** 2026-11-24
- **Decision authority:** Delegated owner representative, recorded in Issue #348 comment `7127163835`
- **Related epic:** [Issue #348 — HEAVIX Dynamic Homepage & Content Builder](https://github.com/HEAVIXIR/z-ai-2/issues/348)
- **Numbering namespace:** Root `docs/ADR-*.md` series. The separate `docs/architecture/ADR-*` path is not treated as the same numbering namespace. The root series currently contains two ADR-005 files; ADR-013 was verified unused in Main and Integration, but the ADR index/duplicate-number cleanup remains technical debt.

## 1. Context

HEAVIX already renders the homepage from the existing `HomePageSection` records and their JSON `config`; this decision extends that architecture rather than creating a parallel Page Builder.

Current implementation evidence at Integration SHA `bb9f522a963ad70116a389fc316b5453e0e213b2`:

- `src/components/home/HomepageSectionFrame.tsx` defines legacy `paddingTop` and `paddingBottom` as strings and applies them through `safeLength` to the section frame.
- `src/app/admin/homepage-layout/page.tsx` loads each present design entry using `String(v ?? "")`. This converts explicit `null` values to empty strings and stringifies nested objects (for example, to `[object Object]`); keys absent from the JSON remain absent. The conversion therefore loses explicit-null versus empty-string information and cannot safely round-trip the proposed nested responsive spacing structure.
- `src/app/api/admin/homepage-sections/route.ts` already uses `admin.homepage.manage`, writes immediately, records audit events and invalidates the homepage sections cache tag.
- `src/app/page.tsx` renders the existing sections inside the current `<main className="flex-1">`; a `.homepage-root` class does not currently exist and must be deliberately introduced if this design is implemented.
- The current section API does not provide a draft/publish/schedule/rollback lifecycle.

The objective of this ADR is limited to the architecture and semantics of global and per-section responsive vertical spacing. It does not authorize implementation or expand the full Homepage Builder scope.

## 2. Decision

The owner-approved decisions are:

1. **Storage/API architecture: Option C.** Use a dedicated singleton `HomepageLayoutSettings` model and a dedicated admin endpoint, protected by `admin.homepage.manage`.
2. **Numeric storage type: `Float?`.** Store nullable numeric spacing values in rem units.
3. **Responsive inheritance: Option B.** Desktop, tablet and mobile are independent. A value from a larger breakpoint never vertically inherits into a smaller breakpoint.

### 2.1 Global settings model

Introduce a dedicated `HomepageLayoutSettings` model with six nullable fields:

| Field | Type | Meaning |
|---|---|---|
| `homepageSectionPaddingTopDesktop` | `Float?` | Global desktop top spacing |
| `homepageSectionPaddingBottomDesktop` | `Float?` | Global desktop bottom spacing |
| `homepageSectionPaddingTopTablet` | `Float?` | Global tablet top spacing |
| `homepageSectionPaddingBottomTablet` | `Float?` | Global tablet bottom spacing |
| `homepageSectionPaddingTopMobile` | `Float?` | Global mobile top spacing |
| `homepageSectionPaddingBottomMobile` | `Float?` | Global mobile bottom spacing |

Use the stable key `id = "main"`. The future migration must add a database check constraint equivalent to `CHECK (id = 'main')` in addition to the primary key. This guarantees **at most one row**, not exactly one row. If the row does not exist, runtime behavior must use the documented literal fallback and must not fail.

The model is separate from `SiteSettings`; it must not introduce a second write path for the same setting in `SiteSettings`.

### 2.2 Endpoint and authorization

Create a dedicated endpoint:

- `GET /api/admin/homepage-layout-settings`
- `PUT /api/admin/homepage-layout-settings`

Both methods require an authenticated user with `admin.homepage.manage`. The write path must:
- validate all six fields before persistence;
- write only the singleton `id = "main"`;
- record an actor-attributed audit event using a stable action name such as `admin.homepageLayoutSettings.upsert`;
- invalidate the dedicated homepage layout-settings cache tag (proposed tag: `home:layout-settings`);
- return a typed response and a safe error status; invalid input must not partially write.

No new permission is introduced by this ADR.

### 2.3 Numeric validation

Every new numeric spacing value must satisfy all conditions:

- JavaScript number, finite;
- inclusive range `0 <= value <= 16`;
- exact quarter-rem step: `Number.isInteger(value * 4)`.

Examples:
- valid: `0`, `0.25`, `1.5`, `16`;
- invalid: `-0.25`, `1.3`, `16.25`, `NaN`, `Infinity`, strings and empty strings.

The API rejects invalid submitted values with HTTP 400. The renderer independently fails closed: corrupted or unexpected invalid values are omitted rather than emitted as CSS. API and renderer must share one validation contract.

### 2.4 Section-level JSON shape and backward compatibility

Keep the existing `HomePageSection.config` JSON storage. New numeric overrides live under `design.spacing`:

```json
{
  "design": {
    "paddingTop": "96px",
    "paddingBottom": "2rem",
    "spacing": {
      "desktop": { "paddingTop": 3, "paddingBottom": null },
      "tablet": { "paddingTop": 1.5 },
      "mobile": { "paddingBottom": 0.5 }
    }
  }
}
```

The exact JSON shape must be validated before implementation, but the semantics are fixed:

- A section numeric value applies only to that side and that breakpoint.
- A nested `spacing[bp][side]` value of `null` or an absent value means “no numeric override”. If a valid legacy flat string exists for that side, that legacy section override remains the compatibility fallback; otherwise the value inherits the global setting for the same breakpoint.
- An empty legacy string `""` is normalized to “no section override” and therefore inherits the global setting when no numeric override exists. It is not a numeric zero.
- Valid legacy `design.paddingTop` and `design.paddingBottom` strings remain supported as breakpoint-agnostic section overrides. When a nested numeric value and a legacy flat string coexist for the same side/breakpoint, the nested numeric value wins; the legacy string is used only where no valid nested numeric override exists.
- Invalid legacy strings are ignored by the renderer; they must never be interpolated into unsafe CSS.
- Global relational fields have `NULL` or numeric values; “absent column” is not a distinct persisted value. An absent singleton row means no global defaults.
- Global empty strings are rejected at the API boundary and are never stored in the numeric columns.
- Unknown keys at both the root `config` object and `design` object must survive a read/edit/save round-trip. The editor must not stringify nested objects or silently discard unknown data.

The editor must use typed state that keeps legacy flat design strings, nested spacing values and unknown keys separate. A serializer may intentionally normalize an empty legacy string to an absent override, but that normalization must be explicit and tested; do not claim byte-for-byte round-trip preservation when normalization occurs.

Create, full replacement and PATCH/partial-update behavior must be specified separately before implementation. In particular, omission in a PATCH must mean “leave unchanged”, while explicit `null` must mean “clear this override / inherit” according to the section/global rules above.

### 2.5 Resolution precedence — independent breakpoints (Option B)

Resolve each side independently at each target breakpoint. For example, desktop top, tablet top and mobile top are three separate resolutions; bottom is resolved independently from top.

For a given side and breakpoint, use this order:

1. Valid numeric section override for that exact breakpoint.
2. Valid legacy section string override (breakpoint-agnostic).
3. Valid global numeric value for that exact breakpoint.
4. The existing literal/layout fallback for that section.

Do not inherit numeric section values vertically from desktop to tablet or tablet to mobile. Do not inherit a global value vertically between breakpoints. A section's desktop value must not override a tablet or mobile resolution.

If a persisted numeric section value is invalid, omit it and continue to the next precedence source. If the global value is invalid, omit it and use the existing literal/layout fallback.

The exact fallback values must be taken from the actual homepage layout baseline during implementation; this ADR does not invent a new universal spacing value.

### 2.6 DOM and CSS strategy

- Global custom properties belong on a single `.homepage-root` ancestor around the existing homepage `<main>`.
- Section override custom properties belong on the existing `.hp-section-frame`.
- Static CSS media queries select the desktop/tablet/mobile variable set.
- Use CSS variable fallbacks so an unset or invalid section variable falls through to the global variable and then the existing layout fallback.
- Do not add resize listeners or JavaScript-driven breakpoint state.
- The `.homepage-root` wrapper is not present in the current Integration page and must be introduced intentionally if implementation is later authorized.
- Breakpoint cutoffs must be reconciled with the existing HEAVIX responsive system before implementation. The earlier 1024px/640px values are proposals, not a separately approved design-system change.

## 3. Alternatives considered

| Option | Description | Disposition |
|---|---|---|
| A | Put global fields in `SiteSettings` and use `admin.settings.manage` | Rejected: mixes homepage-layout ownership with general site settings |
| B | Keep fields in `SiteSettings` but add a second homepage endpoint/permission | Rejected: creates two ownership/write paths for the same settings |
| C | Dedicated `HomepageLayoutSettings` model and endpoint with `admin.homepage.manage` | **Accepted** |
| Breakpoint A | Section values vertically inherit desktop → tablet → mobile | Not selected |
| Breakpoint B | Each breakpoint resolves independently | **Accepted** |

The owner also selected `Float?` over `Decimal?` and scaled `Int?`. The quarter-rem step is exactly representable in binary floating point; the shared validator remains mandatory.

## 4. Consequences

### Positive
- Homepage spacing has a clear data owner and permission boundary.
- Global settings and per-section overrides remain distinct.
- Existing legacy strings remain supported during migration.
- Responsive behavior is deterministic and does not depend on client-side resize logic.
- The design reuses the existing homepage section renderer rather than introducing a parallel page system.

### Costs and risks
- A new database model and migration are required.
- A new endpoint, typed editor state, CSS variables and cache invalidation are required.
- Legacy editor serialization must be corrected before nested values can be safely edited.
- The singleton constraint guarantees at most one row; runtime must handle no row.
- The current homepage API saves immediately and has no draft/publish/rollback lifecycle. This ADR does not solve that larger epic requirement.
- CSS custom-property behavior through React inline styles and target browsers must be tested during implementation.

## 5. Audit, cache and preview requirements

- Every global setting update must record actor, timestamp, before/after values and reason in the existing audit system.
- The dedicated layout-settings cache tag must be invalidated on successful update.
- Section cache invalidation must continue to work independently.
- A preview must be in-memory and must not write to the database or invalidate production/Preview cache.
- If a preview renders only spacing frames or placeholders rather than the actual homepage components and data, it must be labelled as a spacing-only preview; it must not claim full production parity.
- Publish, schedule, version history and rollback remain separate scope and require their own design/acceptance.

## 6. Validation plan and unresolved evidence

The following are mandatory before implementation acceptance:

1. A complete unique test inventory for global validation, section/global precedence, all six breakpoint/side combinations, legacy compatibility, null/absent/empty semantics, serialization, singleton enforcement, permissions and cache invalidation.
2. Separate tests for API upsert restriction to `id = "main"` and the database check constraint.
3. Full explicit inputs for every breakpoint-independence case (both section and global values for desktop/tablet/mobile).
4. Tests for root-level and design-level unknown-key preservation, create/full replacement/PATCH behavior, and intentional empty-string normalization.
5. React style behavior for omitted/undefined custom properties and browser tests for CSS `var()` fallbacks at the target breakpoints.
6. E2E proof that updating settings changes the homepage after cache invalidation and does not affect unrelated routes or users.
7. Re-audit of wrapper usage, legacy orphan status, CMS pageType route coverage and the actual responsive breakpoint tokens.

The Phase 0.4.3.6 report claimed 50 designed cases (48 inventoried plus two singleton cases), with zero executed. The two singleton cases still require explicit unique IDs and expected outcomes, and the complete 50-case inventory must be reconciled in the next read-only review. **All reported cases remain NOT RUN; no test pass is implied by this ADR.**

## 7. Implementation gate

This ADR records the owner-approved design choices; it does not authorize implementation.

Issue #348 remains blocked until the separate P0 Listing Creation journey is fully completed and explicitly accepted. After that gate opens, implementation still requires a reviewed implementation plan and the normal migration, backup, RBAC, CI, Preview runtime, audit and rollback controls.

Until then, do not:
- modify homepage code or styles;
- add schema or migrations;
- create or change endpoints or permissions;
- seed or mutate databases;
- merge an executable PR or deploy;
- delete or archive legacy components.

## 8. Decision record

The delegated owner representative approved the following on 2026-11-24 (Issue #348 comment `7127163835`):

- **Option C:** dedicated `HomepageLayoutSettings` model and endpoint using `admin.homepage.manage`.
- **Type:** `Float?`.
- **Responsive resolution:** Option B, independent breakpoints.

This ADR is therefore **Accepted for design only**. The Listing Creation acceptance gate remains independent and open.
