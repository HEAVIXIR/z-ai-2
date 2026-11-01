// test_profiler_v6.c — STEP A-3.17 P0 verification harness
//
// Fixes from A-3.16 review:
//   F1: Registry now mutex-protected (no data race on `size` field)
//   F2: bootstrap_alloc returns NULL on publication failure
//   F3: Normal realloc path preserves old tracking on failure
//   F4: Test script requires exit code 0 (no more exit 134 acceptance)
//
// Test groups:
//   T1: Basic correctness (smoke)
//   T2: Bootstrap handoff (exact-match classification)
//   T3: min copy semantics
//   T4: Multithreaded normal path
//   T5: Overflow guards
//   T6: Registry exhaustion (C4 hard-fail)
//   T7: Failure injection (C2 realloc safety) — FIXED: uses real libc malloc
//   T8: Concurrency + ABA + slot reuse (C1)
//   T9: Concurrent lookup vs deregister + slot reuse (NEW for A-3.17)
//
// Build: see test_profiler_v6.sh
// ============================================================================

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <stdint.h>
#include <stdbool.h>
#include <unistd.h>
#include <stdatomic.h>
#include <dlfcn.h>

extern void*  __profiler_v6_test_bootstrap_alloc(size_t size) __attribute__((weak));
extern bool   __profiler_v6_test_is_bootstrap_ptr(void* ptr) __attribute__((weak));
extern int    __profiler_v6_test_set_initialized(int val) __attribute__((weak));
extern void   __profiler_v6_test_set_real_malloc(void* (*fn)(size_t)) __attribute__((weak));
extern int    __profiler_v6_test_registry_occupancy(void) __attribute__((weak));
extern long   __profiler_v6_test_registry_full_count(void) __attribute__((weak));
extern long   __profiler_v6_test_unknown_in_range_count(void) __attribute__((weak));
extern void   __profiler_v6_test_reset_registry(void) __attribute__((weak));
extern size_t __profiler_v6_test_bootstrap_lookup_size(void* ptr) __attribute__((weak));
extern void*  __profiler_v6_test_get_real_malloc(void) __attribute__((weak));

static atomic_int g_failures = 0;
static int g_tests = 0;

#define CHECK(cond, ...) do { \
    g_tests++; \
    if (!(cond)) { \
        atomic_fetch_add(&g_failures, 1); \
        fprintf(stderr, "FAIL [test %d] %s:%d: ", g_tests, __FILE__, __LINE__); \
        fprintf(stderr, __VA_ARGS__); \
        fprintf(stderr, "\n"); \
    } else { \
        fprintf(stderr, "PASS [test %d] %s\n", g_tests, #cond); \
    } \
} while (0)

// ============================================================================
// T1: Basic correctness
// ============================================================================
static void test_basic(void) {
    fprintf(stderr, "\n=== T1: Basic malloc/calloc/realloc/free ===\n");

    char *p = malloc(100);
    CHECK(p != NULL, "malloc(100) returned NULL");
    memset(p, 'A', 100);
    CHECK(p[0] == 'A' && p[99] == 'A', "malloc write failed");
    free(p);

    int *q = calloc(50, sizeof(int));
    CHECK(q != NULL, "calloc(50,4) returned NULL");
    int all_zero = 1;
    for (int i = 0; i < 50; i++) if (q[i] != 0) { all_zero = 0; break; }
    CHECK(all_zero, "calloc did not zero");
    free(q);

    char *r = malloc(32);
    CHECK(r != NULL, "malloc(32) returned NULL");
    for (int i = 0; i < 32; i++) r[i] = (char)(i + 1);
    char *r2 = realloc(r, 256);
    CHECK(r2 != NULL, "realloc(32->256) returned NULL");
    int preserved = 1;
    for (int i = 0; i < 32; i++) if (r2[i] != (char)(i + 1)) { preserved = 0; break; }
    CHECK(preserved, "realloc grow did not preserve");
    free(r2);

    free(NULL);
    CHECK(1, "free(NULL) ok");

    size_t zero_sz = 0;
    volatile size_t *vz = &zero_sz;
    char *z = malloc(*vz);
    free(z);
    CHECK(1, "malloc(0)+free ok");
}

// ============================================================================
// T2: Bootstrap handoff (exact-match classification)
// ============================================================================
static void test_bootstrap_handoff(void) {
    fprintf(stderr, "\n=== T2: Bootstrap handoff (exact-match classification) ===\n");

    if (!__profiler_v6_test_bootstrap_alloc) {
        g_tests++; CHECK(0, "test hooks not available");
        return;
    }

    int prev_init = __profiler_v6_test_set_initialized(1);
    CHECK(prev_init == 1, "expected g_initialized==1 (got %d)", prev_init);

    char *bs_ptr = (char *)__profiler_v6_test_bootstrap_alloc(64);
    CHECK(bs_ptr != NULL, "bootstrap_alloc(64) returned NULL");
    CHECK(__profiler_v6_test_is_bootstrap_ptr(bs_ptr), "not registered");
    for (size_t i = 0; i < 64; i++) bs_ptr[i] = (char)((i * 7 + 13) & 0xFF);

    char *grown = realloc(bs_ptr, 256);
    CHECK(grown != NULL, "realloc(bootstrap, grow) returned NULL");
    int data_ok = 1;
    for (size_t i = 0; i < 64; i++) {
        if (grown[i] != (char)((i * 7 + 13) & 0xFF)) { data_ok = 0; break; }
    }
    CHECK(data_ok, "realloc(bootstrap, grow) did not preserve old data");
    CHECK(!__profiler_v6_test_is_bootstrap_ptr(grown), "realloc returned bootstrap ptr");
    free(grown);

    char *bs_ptr2 = (char *)__profiler_v6_test_bootstrap_alloc(128);
    CHECK(bs_ptr2 != NULL, "bootstrap_alloc(128) returned NULL");
    CHECK(__profiler_v6_test_is_bootstrap_ptr(bs_ptr2), "second ptr not registered");
    free(bs_ptr2);
    CHECK(1, "free(bootstrap_ptr) did not crash");

    char *bs_ptr3 = (char *)__profiler_v6_test_bootstrap_alloc(32);
    CHECK(bs_ptr3 != NULL, "bootstrap_alloc(32) returned NULL");
    void *r3 = realloc(bs_ptr3, 0);
    if (r3) free(r3);
    CHECK(1, "realloc(bootstrap, 0) did not crash");

    char *from_null = realloc(NULL, 4096);
    CHECK(from_null != NULL, "realloc(NULL, 4096) returned NULL");
    CHECK(!__profiler_v6_test_is_bootstrap_ptr(from_null), "realloc(NULL) returned bootstrap");
    free(from_null);

    int was_init = __profiler_v6_test_set_initialized(0);
    char *bs_pre = (char *)__profiler_v6_test_bootstrap_alloc(48);
    CHECK(bs_pre != NULL, "pre-init bootstrap_alloc(48) returned NULL");
    for (size_t i = 0; i < 48; i++) bs_pre[i] = (char)(0x40 + i);
    char *bs_pre_new = realloc(bs_pre, 200);
    CHECK(bs_pre_new != NULL, "pre-init realloc(48->200) returned NULL");
    int pre_ok = 1;
    for (size_t i = 0; i < 48; i++) {
        if (bs_pre_new[i] != (char)(0x40 + i)) { pre_ok = 0; break; }
    }
    CHECK(pre_ok, "pre-init realloc did not preserve (P0-b)");
    __profiler_v6_test_set_initialized(was_init);
    free(bs_pre_new);
}

// ============================================================================
// T3: min copy semantics
// ============================================================================
static void test_min_copy(void) {
    fprintf(stderr, "\n=== T3: min(old, new) copy semantics ===\n");

    size_t old_sz = 8192;
    unsigned char *p = malloc(old_sz);
    CHECK(p != NULL, "malloc(8192) returned NULL");
    for (size_t i = 0; i < old_sz; i++) p[i] = (unsigned char)(i & 0xFF);

    size_t new_sz = old_sz * 100;
    unsigned char *q = realloc(p, new_sz);
    CHECK(q != NULL, "realloc(8192->819200) returned NULL");
    int preserved = 1;
    for (size_t i = 0; i < old_sz; i++) {
        if (q[i] != (unsigned char)(i & 0xFF)) { preserved = 0; break; }
    }
    CHECK(preserved, "realloc grow did not preserve");
    free(q);
}

// ============================================================================
// T4: Multithreaded normal path
// ============================================================================
#define T4_THREADS 8
#define T4_ITERS   2000

static void *t4_worker(void *arg) {
    unsigned int seed = (unsigned int)(uintptr_t)arg;
    for (int it = 0; it < T4_ITERS; it++) {
        size_t sz = 4096 + (seed % 100000);
        char *p = malloc(sz);
        if (!p) continue;
        memset(p, (int)(it & 0xFF), sz);
        char *p2 = realloc(p, sz * 2);
        if (!p2) { free(p); continue; }
        int ok = 1;
        for (size_t i = 0; i < sz; i++) {
            if (p2[i] != (char)(it & 0xFF)) { ok = 0; break; }
        }
        if (!ok) {
            fprintf(stderr, "FAIL [T4 thread %u iter %d] data corrupted\n", seed, it);
            atomic_fetch_add(&g_failures, 1);
        }
        char *p3 = realloc(p2, 4096);
        if (!p3) { free(p2); continue; }
        free(p3);
        seed = seed * 1103515245u + 12345u;
    }
    return NULL;
}

static void test_multithreaded(void) {
    fprintf(stderr, "\n=== T4: Multithreaded (%d threads x %d iters) ===\n",
            T4_THREADS, T4_ITERS);
    pthread_t threads[T4_THREADS];
    for (int i = 0; i < T4_THREADS; i++) {
        int rc = pthread_create(&threads[i], NULL, t4_worker, (void*)(uintptr_t)(i + 1));
        CHECK(rc == 0, "pthread_create %d failed (rc=%d)", i, rc);
    }
    for (int i = 0; i < T4_THREADS; i++) pthread_join(threads[i], NULL);
    CHECK(1, "all threads completed");
}

// ============================================================================
// T5: Overflow guards (separate from race tests)
// ============================================================================
static void test_overflow(void) {
    fprintf(stderr, "\n=== T5: Overflow guards ===\n");

    volatile size_t huge = (size_t)-1 / 2;
    void *p = calloc(huge, 3);
    CHECK(p == NULL, "calloc(huge, 3) should return NULL");

    char *q = malloc(128);
    CHECK(q != NULL, "malloc(128) returned NULL");
    void *r = realloc(q, 0);
    if (r) free(r);
    CHECK(1, "realloc(ptr, 0) did not crash");

    char *s = realloc(NULL, 100);
    CHECK(s != NULL, "realloc(NULL, 100) returned NULL");
    memset(s, 'B', 100);
    free(s);
    CHECK(1, "realloc(NULL, n) ok");
}

// ============================================================================
// T6: Registry exhaustion (C4 hard-fail)
// ============================================================================
static void test_registry_exhaustion(void) {
    fprintf(stderr, "\n=== T6: Registry exhaustion (C4 hard-fail) ===\n");
    if (!__profiler_v6_test_reset_registry) {
        g_tests++; CHECK(0, "test hooks not available");
        return;
    }

    __profiler_v6_test_reset_registry();
    int was_init = __profiler_v6_test_set_initialized(0);

    void *ptrs[64];
    int filled = 0;
    for (int i = 0; i < 64; i++) {
        ptrs[i] = __profiler_v6_test_bootstrap_alloc(16);
        if (ptrs[i]) filled++;
        else break;
    }
    CHECK(filled == 64, "expected to fill all 64 slots (got %d)", filled);

    void *p65 = __profiler_v6_test_bootstrap_alloc(16);
    CHECK(p65 == NULL, "65th bootstrap_alloc should return NULL on exhaustion");

    long full_count = __profiler_v6_test_registry_full_count();
    CHECK(full_count >= 1, "registry_full counter should be >= 1 (got %ld)", full_count);

    free(ptrs[0]);
    void *p_reuse = __profiler_v6_test_bootstrap_alloc(16);
    CHECK(p_reuse != NULL, "bootstrap_alloc should succeed after freeing a slot");
    CHECK(__profiler_v6_test_is_bootstrap_ptr(p_reuse), "reused ptr should be registered");
    free(p_reuse);

    for (int i = 1; i < 64; i++) {
        if (ptrs[i]) free(ptrs[i]);
    }

    __profiler_v6_test_set_initialized(was_init);
    __profiler_v6_test_reset_registry();
    CHECK(1, "registry exhaustion handled cleanly");
}

// ============================================================================
// T7: Failure injection (C2 realloc safety)
// [A-3.17 FIX] failing_malloc now uses REAL libc malloc (via dlsym) instead
// of mmap. This allows free() to work correctly, eliminating the exit-134
// abort that A-3.16's test had.
// ============================================================================
static int g_inject_fail = 0;
static int g_inject_call_count = 0;
// Save the real libc malloc/free so failing_malloc can delegate to them
// without going through the profiler's interposition (which would recurse).
static void* (*g_real_libc_malloc)(size_t) = NULL;

static void *failing_malloc(size_t sz) {
    g_inject_call_count++;
    if (g_inject_fail) {
        return NULL;  // simulate allocation failure
    }
    // Delegate to the REAL libc malloc (obtained via dlsym in test setup).
    // This bypasses the profiler's interposition, so the returned pointer
    // can be freed by the real libc free() (which the profiler forwards to
    // for non-bootstrap pointers).
    if (g_real_libc_malloc) return g_real_libc_malloc(sz);
    return NULL;
}

static void test_failure_injection(void) {
    fprintf(stderr, "\n=== T7: Failure injection (C2 realloc safety) ===\n");
    if (!__profiler_v6_test_set_real_malloc) {
        g_tests++; CHECK(0, "test hooks not available");
        return;
    }

    // [A-3.17 fix] Get the real libc malloc from the PROFILER (not via dlsym
    // from the test binary, which would return the profiler's own malloc
    // symbol and cause infinite recursion). The profiler saved the real
    // libc malloc in its constructor via dlsym(RTLD_NEXT, "malloc"), which
    // from within the profiler .so correctly returns libc's malloc.
    g_real_libc_malloc = (void*(*)(size_t))__profiler_v6_test_get_real_malloc();
    CHECK(g_real_libc_malloc != NULL, "get_real_malloc returned NULL");

    int was_init = __profiler_v6_test_set_initialized(1);

    char *bs = (char *)__profiler_v6_test_bootstrap_alloc(64);
    CHECK(bs != NULL, "bootstrap_alloc(64) returned NULL");
    CHECK(__profiler_v6_test_is_bootstrap_ptr(bs), "bs not registered");
    for (int i = 0; i < 64; i++) bs[i] = (char)(i);

    // Inject failure into real_malloc.
    g_inject_fail = 1;
    g_inject_call_count = 0;
    __profiler_v6_test_set_real_malloc(failing_malloc);

    // realloc(bootstrap, grow) should fail (return NULL) BUT leave bs valid.
    char * volatile bs_volatile = bs;
    void *r = realloc(bs_volatile, 256);
    CHECK(r == NULL, "realloc with injected failure should return NULL");

    // [C2] The bootstrap pointer's metadata must still be valid.
    char *bs2 = (char *)bs_volatile;
    int still_registered = __profiler_v6_test_is_bootstrap_ptr(bs2);
    CHECK(still_registered, "bootstrap ptr was deregistered on failure (C2 violation)");

    int data_intact = 1;
    for (int i = 0; i < 64; i++) {
        if (bs2[i] != (char)(i)) { data_intact = 0; break; }
    }
    CHECK(data_intact, "bootstrap data corrupted after failed realloc");

    // Restore: disable injection, retry — should succeed now.
    g_inject_fail = 0;
    void *r2 = realloc(bs2, 256);
    CHECK(r2 != NULL, "realloc should succeed after restoring allocator");
    int data_ok = 1;
    for (int i = 0; i < 64; i++) {
        if (((char*)r2)[i] != (char)(i)) { data_ok = 0; break; }
    }
    CHECK(data_ok, "data not preserved after successful realloc");

    // [A-3.17 FIX] r2 was allocated by real libc malloc (via failing_malloc
    // delegating to g_real_libc_malloc). free(r2) goes through the profiler's
    // free wrapper, which checks is_bootstrap_ptr (no), track_free (not found
    // in tracked table since it was allocated via the direct libc malloc, not
    // the profiler's malloc wrapper), then real_free (libc free). This works
    // correctly because r2 IS a libc-malloc'd pointer.
    free(r2);
    CHECK(1, "free(r2) succeeded without crash (A-3.17 fix)");

    // Restore real_malloc to the saved libc malloc for subsequent tests.
    __profiler_v6_test_set_real_malloc(g_real_libc_malloc);
    g_inject_fail = 0;

    __profiler_v6_test_set_initialized(was_init);
    __profiler_v6_test_reset_registry();
    CHECK(1, "failure injection test complete");
}

// ============================================================================
// T8: Concurrency + ABA + slot reuse (C1)
// ============================================================================
#define T8_THREADS 4
#define T8_ITERS   100

static void *t8_worker(void *arg) {
    unsigned int seed = (unsigned int)(uintptr_t)arg;
    for (int it = 0; it < T8_ITERS; it++) {
        size_t sz = 16 + (seed % 256);
        char *p = (char *)__profiler_v6_test_bootstrap_alloc(sz);
        if (!p) {
            seed = seed * 1103515245u + 12345u;
            continue;
        }
        for (size_t i = 0; i < sz; i++) {
            p[i] = (char)((seed + it + i) & 0xFF);
        }
        if (!__profiler_v6_test_is_bootstrap_ptr(p)) {
            fprintf(stderr, "FAIL [T8 thread %u iter %d] ptr not registered\n", seed, it);
            atomic_fetch_add(&g_failures, 1);
        }
        free(p);
        seed = seed * 1103515245u + 12345u;
    }
    return NULL;
}

static void test_concurrency_aba_reuse(void) {
    fprintf(stderr, "\n=== T8: Concurrency + ABA + slot reuse (%d threads x %d iters) ===\n",
            T8_THREADS, T8_ITERS);
    if (!__profiler_v6_test_reset_registry) {
        g_tests++; CHECK(0, "test hooks not available");
        return;
    }

    __profiler_v6_test_reset_registry();
    int was_init = __profiler_v6_test_set_initialized(1);

    pthread_t threads[T8_THREADS];
    for (int i = 0; i < T8_THREADS; i++) {
        int rc = pthread_create(&threads[i], NULL, t8_worker, (void*)(uintptr_t)(i + 1));
        CHECK(rc == 0, "pthread_create %d failed (rc=%d)", i, rc);
    }
    for (int i = 0; i < T8_THREADS; i++) pthread_join(threads[i], NULL);

    int occ = __profiler_v6_test_registry_occupancy();
    CHECK(occ == 0, "registry should be empty after all frees (occupancy=%d)", occ);

    __profiler_v6_test_set_initialized(was_init);
    __profiler_v6_test_reset_registry();
    CHECK(1, "concurrency/ABA/reuse test complete");
}

// ============================================================================
// T9: Concurrent lookup vs deregister + slot reuse (NEW for A-3.17)
//
// This test directly exercises the race that A-3.16 had on the `size` field:
//   - Writer threads: alloc, lookup_size, free (deregister) in a loop
//   - Reader threads: lookup_size on pointers saved from a shared array
//
// With the mutex-protected registry, readers see consistent {ptr, size} pairs.
// Without the mutex (A-3.16), a reader could observe ptr=old but size=0 or
// size=new_value after slot reuse.
//
// We verify:
//   1. No crashes
//   2. lookup_size returns either the correct size OR 0 (if ptr was freed)
//      — never a stale/wrong size from a reused slot
//   3. TSan reports zero data races
// ============================================================================
#define T9_WRITERS 2
#define T9_READERS 2
#define T9_ITERS   200

// Shared state for T9
static _Atomic(void*) g_t9_ptrs[8];  // small array of shared bootstrap ptrs
static atomic_int g_t9_stop = 0;

static void *t9_writer(void *arg) {
    unsigned int seed = (unsigned int)(uintptr_t)arg;
    for (int it = 0; it < T9_ITERS; it++) {
        // Alloc a bootstrap pointer
        size_t sz = 16 + (seed % 128);
        // Align to 16 (bootstrap_alloc does this internally)
        sz = (sz + 15) & ~15;
        char *p = (char *)__profiler_v6_test_bootstrap_alloc(sz);
        if (!p) { seed = seed * 1103515245u + 12345u; continue; }

        // Write a pattern
        for (size_t i = 0; i < sz; i++) p[i] = (char)((seed + i) & 0xFF);

        // Publish to a random slot in the shared array
        int slot = (int)(seed % 8);
        void *old = atomic_exchange(&g_t9_ptrs[slot], p);
        if (old) {
            // Free the old pointer (deregister it)
            free(old);
        }

        // Also do a lookup on our own pointer to verify consistency.
        // NOTE: In a multi-writer environment, another writer may have
        // overwritten our slot and freed our pointer between the publish
        // and this lookup. So the valid results are:
        //   sz (our pointer is still registered)
        //   0  (another writer freed our pointer via slot overwrite)
        // Any OTHER non-zero value indicates a stale/mismatched size — a bug.
        size_t looked_up = __profiler_v6_test_bootstrap_lookup_size(p);
        if (looked_up != 0 && looked_up != sz) {
            fprintf(stderr, "FAIL [T9 writer %u iter %d] lookup returned %zu, expected 0 or %zu\n",
                    seed, it, looked_up, sz);
            atomic_fetch_add(&g_failures, 1);
        }

        seed = seed * 1103515245u + 12345u;
    }
    return NULL;
}

static void *t9_reader(void *arg) {
    unsigned int seed = (unsigned int)(uintptr_t)arg;
    while (!atomic_load(&g_t9_stop)) {
        // Pick a random slot and lookup
        int slot = (int)(seed % 8);
        void *p = atomic_load(&g_t9_ptrs[slot]);
        if (p) {
            size_t sz = __profiler_v6_test_bootstrap_lookup_size(p);
            // sz must be either:
            //   0 (if the pointer was freed between our atomic_load and the
            //      lookup — the slot was deregistered)
            //   or a valid aligned size (16-byte aligned, >= 16)
            // It must NEVER be a random/stale value.
            if (sz != 0 && ((sz & 15) != 0 || sz < 16)) {
                fprintf(stderr, "FAIL [T9 reader %u] lookup returned invalid size %zu for ptr %p\n",
                        seed, sz, p);
                atomic_fetch_add(&g_failures, 1);
            }
            // NOTE: We intentionally do NOT cross-check is_bootstrap_ptr(p)
            // against the lookup result, because the two calls are not atomic
            // with respect to each other. Between lookup_size and is_bs, a
            // writer could free the pointer, making is_bs return 0 even though
            // lookup returned a non-zero size. This is expected concurrent
            // behavior, not a profiler bug. The profiler's correctness
            // guarantee is that EACH INDIVIDUAL call returns a consistent
            // result (the lookup sees a registered pointer with a valid size,
            // or sees nothing and returns 0).
        }
        seed = seed * 1103515245u + 12345u;
    }
    return NULL;
}

static void test_concurrent_lookup_deregister(void) {
    fprintf(stderr, "\n=== T9: Concurrent lookup vs deregister + slot reuse (%d writers x %d readers x %d iters) ===\n",
            T9_WRITERS, T9_READERS, T9_ITERS);
    if (!__profiler_v6_test_reset_registry || !__profiler_v6_test_bootstrap_lookup_size) {
        g_tests++; CHECK(0, "test hooks not available");
        return;
    }

    __profiler_v6_test_reset_registry();
    int was_init = __profiler_v6_test_set_initialized(1);

    // Initialize shared array
    for (int i = 0; i < 8; i++) atomic_store(&g_t9_ptrs[i], NULL);
    atomic_store(&g_t9_stop, 0);

    pthread_t writers[T9_WRITERS], readers[T9_READERS];

    // Start readers first (they'll spin until stop)
    for (int i = 0; i < T9_READERS; i++) {
        int rc = pthread_create(&readers[i], NULL, t9_reader, (void*)(uintptr_t)(i + 1));
        CHECK(rc == 0, "pthread_create reader %d failed (rc=%d)", i, rc);
    }
    // Start writers
    for (int i = 0; i < T9_WRITERS; i++) {
        int rc = pthread_create(&writers[i], NULL, t9_writer, (void*)(uintptr_t)(i + 1));
        CHECK(rc == 0, "pthread_create writer %d failed (rc=%d)", i, rc);
    }

    // Wait for writers to finish
    for (int i = 0; i < T9_WRITERS; i++) pthread_join(writers[i], NULL);
    // Signal readers to stop
    atomic_store(&g_t9_stop, 1);
    // Wait for readers
    for (int i = 0; i < T9_READERS; i++) pthread_join(readers[i], NULL);

    // Clean up any remaining pointers in the shared array
    for (int i = 0; i < 8; i++) {
        void *p = atomic_exchange(&g_t9_ptrs[i], NULL);
        if (p) free(p);
    }

    int occ = __profiler_v6_test_registry_occupancy();
    CHECK(occ == 0, "registry should be empty after cleanup (occupancy=%d)", occ);

    __profiler_v6_test_set_initialized(was_init);
    __profiler_v6_test_reset_registry();
    CHECK(1, "concurrent lookup vs deregister test complete");
}

int main(void) {
    fprintf(stderr, "========================================\n");
    fprintf(stderr, " STEP A-3.17 P0 verification tests\n");
    fprintf(stderr, " F1=mutex registry, F2=publication check,\n");
    fprintf(stderr, " F3=realloc tracking safety, T9=concurrent lookup\n");
    fprintf(stderr, "========================================\n");

    test_basic();
    test_bootstrap_handoff();
    test_min_copy();
    test_multithreaded();
    test_overflow();
    test_registry_exhaustion();
    test_failure_injection();
    test_concurrency_aba_reuse();
    test_concurrent_lookup_deregister();

    fprintf(stderr, "\n========================================\n");
    fprintf(stderr, " Results: %d tests, %d failures\n", g_tests, atomic_load(&g_failures));
    fprintf(stderr, "========================================\n");

    return atomic_load(&g_failures) == 0 ? 0 : 1;
}
