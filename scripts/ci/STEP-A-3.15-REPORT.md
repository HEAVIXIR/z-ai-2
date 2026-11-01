# STEP A-3.15 — Independent Audit Report

**Branch:** `feature/prisma7-runtime-contract-proof`
**Base commit:** `46233a6f6fe81a5b4f1a91c4f01f462639c73947`
**Date:** 2026-11-01 (Asia/Tehran)
**Scope:** P0 bootstrap lifecycle closure + P1 `@ast-grep` dependency investigation

---

## 1. Source extraction provenance

The profiler v6 C source did not exist as a standalone `.c` file in the
repository at HEAD `46233a6`. It was embedded as a Base64 blob in the GitHub
Actions workflow file:

```
.github/workflows/store-runtime-contract-proof.yml   (line 477)
```

The extraction was performed by:
1. Reading line 477 of the workflow file.
2. Extracting the Base64 payload between the single quotes.
3. Decoding with `base64 -d` into `scripts/ci/malloc_profiler_v6.c`.

The decoded output (391 lines) compiles cleanly with `gcc -shared -fPIC -ldl
-lpthread`. This confirms the extracted source is the real v6 code, not a
fabrication.

The P0 fixes below were applied to this extracted source. No claim is made
that the standalone `.c` file pre-existed; the original form was the Base64
blob in the workflow.

---

## 2. P0 fixes applied to `scripts/ci/malloc_profiler_v6.c`

### P0-a — Bootstrap allocation size tracking

**Before:** `bootstrap_alloc()` returned a pointer into a static buffer but
did not record the allocation size anywhere. `realloc`/`free` had no way to
determine the old size.

**After:** A dedicated registry (`g_bootstrap_registry`, 64 entries) maps
bootstrap pointers to their allocated sizes. Three functions manage it:
- `bootstrap_register(ptr, size)` — CAS-based slot acquisition
- `bootstrap_lookup_size(ptr)` — linear search (64 entries, fast)
- `bootstrap_deregister(ptr)` — atomic clear

Every `bootstrap_alloc()` now registers the allocation; every `free`/`realloc`
of a bootstrap pointer deregisters it.

### P0-b — `realloc` copies `min(old_size, new_size)`

**Before (pre-init path, line 356 of original):**
```c
memcpy(new_p, ptr, size);   // copies `size` (NEW) bytes — may read past old alloc
```
The comment "This is safe because bootstrap allocations are in a static buffer"
was incorrect: the static buffer is bounded (65536 bytes), and reading `size`
bytes from an allocation smaller than `size` reads into adjacent allocations
or past the buffer.

**After:** The pre-init realloc path now looks up the old size via
`bootstrap_lookup_size()` and copies exactly `min(old_size, new_size)`:
```c
size_t old_size = bootstrap_lookup_size(ptr);
size_t copy_size = (old_size < size) ? old_size : size;
if (copy_size > 0) memcpy(new_p, ptr, copy_size);
```

### P0-c — Post-init `free`/`realloc` detect bootstrap pointers

**Before:** The post-init `realloc` and `free` paths called `real_realloc(ptr,
size)` / `real_free(ptr)` without checking whether `ptr` was a bootstrap
pointer. A bootstrap pointer surviving past initialization would be passed to
the real allocator, causing a crash or heap corruption.

**After:** Both paths now check `is_bootstrap_ptr(ptr)` BEFORE delegating to
the real allocator:
- `realloc` post-init bootstrap path: allocates fresh memory via
  `real_malloc`, copies `min(old, new)`, deregisters the bootstrap entry,
  tracks the new allocation. Never calls `real_realloc` on the bootstrap ptr.
- `free` post-init bootstrap path: deregisters the entry and returns. Never
  calls `real_free` on the bootstrap ptr.

### P0-d — Overflow guards in `bootstrap_alloc`

**Before:** `size = (size + 15) & ~15;` could overflow if `size > SIZE_MAX -
15`. A single huge allocation would advance `g_bootstrap_pos` past the buffer
without early rejection.

**After:** Three guards added:
1. `if (size > (SIZE_MAX - 15)) return NULL;` — overflow guard
2. `if (size > BOOTSTRAP_SIZE) return NULL;` — early reject for oversized single allocs
3. `if (pos >= BOOTSTRAP_SIZE || pos > BOOTSTRAP_SIZE - size) return NULL;` —
   position/exhaustion guard after `atomic_fetch_add`

### Bonus — `calloc` overflow check ordering

**Before (post-init path):** `real_calloc(nmemb, size)` was called BEFORE the
`nmemb * size` overflow check. Invalid products were passed to the real
allocator.

**After:** The overflow check now precedes the `real_calloc` call.

---

## 3. Test verification (`scripts/ci/test_profiler_v6.c` + `.sh`)

A comprehensive test harness was built with two profiler variants:
- **TEST variant** (`-DPROFILER_V6_TEST_HOOKS`): exports `__profiler_v6_test_*`
  symbols so the test can obtain REAL bootstrap pointers deterministically
  (regardless of constructor ordering between LD_PRELOAD and NEEDED libraries).
- **PROD variant** (no test hooks): identical to what would be Base64-encoded
  into the workflow. Verified via `nm -D` that it exports ZERO test-hook
  symbols.

### Test groups and results (55 tests, 0 failures)

| Group | Tests | P0 covered | Key assertions |
|-------|-------|------------|----------------|
| T1: Basic correctness | 12 | — | malloc/calloc/realloc/free normal path |
| T2: Bootstrap handoff | 21 | **P0-a, P0-b, P0-c** | REAL bootstrap ptrs (via test hook), realloc grow/free/realloc(,0)/pre-init realloc |
| T3: min copy semantics | 7 | **P0-b** | realloc 8KiB→800KiB preserves all old data |
| T4: Multithreaded | 9 | — | 8 threads × 2000 iters, alloc→realloc→verify→shrink→free |
| T5: Overflow guards | 6 | **P0-d** | calloc overflow, realloc(,0), malloc(SIZE_MAX) |

### Critical T2 assertions (the P0-c proof)

- **Test 15:** `is_bootstrap_ptr(bs_ptr) == true` — confirms the test hook
  produced a REAL bootstrap-buffer pointer, not a heap pointer.
- **Test 17:** `data_ok` — `realloc(bootstrap, grow 64→256)` preserved all 64
  bytes of old data (proves min-copy works on the post-init bootstrap path).
- **Test 18:** `!grown_is_bs` — the realloc'd pointer came from `real_malloc`,
  NOT the bootstrap buffer (proves the bootstrap ptr was NOT forwarded to
  `real_realloc`).
- **Test 23:** `free(bootstrap_ptr)` did not crash — proves the post-init
  free path detected the bootstrap pointer and did NOT call `real_free` on it.
- **Test 32:** `pre_data_ok` — pre-init realloc grow preserved old data
  (proves P0-b on the pre-init path too).

### Node.js smoke test (PROD variant)

A Node.js v24.22.1 process ran under the PROD profiler (no test hooks),
allocating 50,000 buffers with `Buffer.alloc` (tracked-range sizes) and
`Buffer.concat` (realloc-like growth). Exit code 0, no crash, profiler emitted
`PROFILER6_INIT` and `PROFILER6_SUMMARY` JSON lines throughout. This confirms
the fixed profiler does not destabilize a real V8 runtime.

---

## 4. P1 — `@ast-grep/napi` dependency investigation

### Finding: NOT in manifest or lockfile at HEAD `46233a6`

| Source | `@ast-grep` present? |
|--------|---------------------|
| `package.json` dependencies (71) | NO |
| `package.json` devDependencies (12) | NO |
| `package.json` optionalDependencies | (none) |
| `bun.lock` (lockfileVersion 3) | NO (0 matches) |
| Source files (`*.ts/*.tsx/*.js/*.mjs/*.cjs/*.json`) | NO |

### Root cause: installed via `npm install --no-save` at CI time

The workflow file (`.github/workflows/store-runtime-contract-proof.yml`,
line 140) installs OpenNext and Wrangler outside the bun lockfile:

```yaml
npm install --no-save --package-lock=false --ignore-scripts \
    --legacy-peer-deps --no-audit --no-fund \
    @opennextjs/cloudflare@1.20.14 wrangler@4.156.0
```

npm registry query confirms `@ast-grep/napi@^0.45.3` is a **direct
dependency** of `@opennextjs/cloudflare@1.20.14` (one of 10 direct deps). It
is NOT a dependency of `wrangler@4.156.0`.

### What `@ast-grep/napi` is

- A native Node.js addon (napi = Node-API, ships `.node` binaries)
- Used for AST-based code search and rewriting at scale
- Has zero dependencies of its own
- Loaded when `opennextjs-cloudflare build` runs the `bundleServer` phase

### Is it actually loaded at build time?

Yes — confirmed indirectly. The profiler v6 captures `__builtin_return_address`
(a raw code address) at each malloc call-site. In CI Run #159, the symbolized
top call-sites included `@ast-grep/napi`, which means its native code was
mapped into the process and was actively calling malloc during the build. A
package that is installed but never loaded would not appear in the call-site
list.

### Can it be safely removed?

**No** — not at this step. `@ast-grep/napi` is a mandatory direct dependency of
`@opennextjs/cloudflare@1.20.14`, which is the core build tool for the
Cloudflare Workers deployment. Removing `@ast-grep/napi` would break the
OpenNext build. An A/B test would require either:
1. Patching `@opennextjs/cloudflare` to not use `@ast-grep/napi` (fork-level
   change, out of scope), OR
2. Downgrading to a version of `@opennextjs/cloudflare` that does not depend on
   `@ast-grep/napi` (requires version archaeology + compatibility testing).

The Steward's P1 guidance explicitly states A/B testing is authorized only
after P0 closure and valid evidence — which is the current state. The A/B test
itself is a separate follow-up step.

### Recommendation for the OOM investigation

`@ast-grep/napi` being a top call-site is a strong lead, but it does NOT prove
`@ast-grep/napi` has a memory leak. It may be performing legitimate large-scale
AST operations during bundling. The profiler's 92.7% untracked gap (from Run
#159) is still dominated by sub-4KiB allocations that neither v6 nor v7 (not
yet built) directly measures. The path forward is:
1. P0 closure (this step) ✓
2. Profiler v7 (sub-4KiB buckets) — P2, separate step
3. Once v7 quantifies the sub-4KiB distribution, determine whether
   `@ast-grep/napi`'s allocations are the bulk of it
4. Only then decide whether A/B removal or upstream bug report is warranted

---

## 5. Files created (all under `scripts/ci/`)

| File | Lines | Purpose |
|------|-------|---------|
| `scripts/ci/malloc_profiler_v6.c` | 646 | Standalone extracted + P0-fixed profiler source |
| `scripts/ci/test_profiler_v6.c` | ~290 | P0 verification test harness (55 tests) |
| `scripts/ci/test_profiler_v6.sh` | ~120 | Build + run orchestrator (TEST + PROD variants) |

No existing files were modified. No changes to the workflow file's Base64 blob
are made in this step — that re-encoding should happen only after the
Steward reviews and approves the standalone source.

---

## 6. Permissions status (unchanged)

| Operation | Status |
|-----------|--------|
| P0 fix on feature branch | DONE (local commit pending) |
| Local test verification | DONE (55/55 pass + Node.js smoke) |
| Push to feature branch | NOT DONE (awaiting Steward approval) |
| Re-encode Base64 in workflow | NOT DONE (awaiting approval) |
| Full CI run | SUSPENDED (until P0 closure confirmed) |
| Change `main` | FORBIDDEN |
| Merge PR #169 | FORBIDDEN |
| Deployment | FORBIDDEN |

---

## 7. Limitations and honest caveats

1. **Constructor ordering:** The original T2 design relied on constructor
   ordering between LD_PRELOAD and NEEDED libraries to produce bootstrap
   pointers naturally. Testing revealed this is unreliable (glibc loaded the
   profiler's constructor before the helper's). The test-hook approach
   (`-DPROFILER_V6_TEST_HOOKS`) was adopted instead to deterministically
   obtain real bootstrap pointers. The test hooks are compiled out of the
   PROD variant, verified via `nm -D`.

2. **No CI run:** Per the Steward's standing constraint, no full CI run was
   executed. The 55 passing tests are local-only. The profiler's behavior
   under the actual OpenNext build workload (with `@ast-grep/napi` loaded)
   remains to be verified in CI.

3. **P2 (profiler v7) not started:** This step focused on P0 and P1 only.
   Profiler v7 (sub-4KiB buckets, double-counting prevention, overhead
   measurement) is a separate step per the Steward's guidance.

4. **`@ast-grep/napi` A/B test not performed:** Removal is not possible without
   breaking the OpenNext build. The A/B test requires either a fork of
   `@opennextjs/cloudflare` or a version downgrade — both out of scope for
   this step.
