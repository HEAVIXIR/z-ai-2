// test_profiler_v6.c — P0 verification harness for malloc_profiler_v6.c
//
// This test program MUST be run with a profiler .so compiled with
// -DPROFILER_V6_TEST_HOOKS so that the __profiler_v6_test_* symbols are
// available. The production profiler .so (without the flag) will NOT export
// these symbols and this test will fail to link.
//
// Test groups:
//
//   T1: Basic malloc/calloc/realloc/free correctness (normal path).
//   T2: Bootstrap pointer handoff (constructor → runtime) — THE P0-c TEST.
//       Uses __profiler_v6_test_bootstrap_alloc() to obtain a REAL bootstrap
//       pointer, then realloc/free it after init. Verifies:
//         - realloc(bootstrap, grow) preserves data + does not crash
//         - free(bootstrap) does not crash and does not corrupt the heap
//         - is_bootstrap_ptr() confirms the pointer is in the static buffer
//   T3: min(old, new) copy semantics (P0-b).
//   T4: Multithreaded malloc → realloc → free.
//   T5: Overflow guards (P0-d + calloc overflow ordering fix).
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

// ---- Test-only hooks exported by the profiler when built with
//      -DPROFILER_V6_TEST_HOOKS. Declared weak so the test still compiles
//      (and fails at link time) if the production .so is used by mistake.
extern void*  __profiler_v6_test_bootstrap_alloc(size_t size) __attribute__((weak));
extern bool   __profiler_v6_test_is_bootstrap_ptr(void* ptr) __attribute__((weak));
extern int    __profiler_v6_test_set_initialized(int val) __attribute__((weak));
extern void   __profiler_v6_test_set_real_malloc(void* (*fn)(size_t)) __attribute__((weak));

static int g_failures = 0;
static int g_tests = 0;

#define CHECK(cond, ...) do { \
    g_tests++; \
    if (!(cond)) { \
        g_failures++; \
        fprintf(stderr, "FAIL [test %d] %s:%d: ", g_tests, __FILE__, __LINE__); \
        fprintf(stderr, __VA_ARGS__); \
        fprintf(stderr, "\n"); \
    } else { \
        fprintf(stderr, "PASS [test %d] %s\n", g_tests, #cond); \
    } \
} while (0)

// ---- T1: Basic correctness (normal path) ----
static void test_basic(void) {
    fprintf(stderr, "\n=== T1: Basic malloc/calloc/realloc/free (normal path) ===\n");

    char *p = malloc(100);
    CHECK(p != NULL, "malloc(100) returned NULL");
    memset(p, 'A', 100);
    CHECK(p[0] == 'A' && p[99] == 'A', "malloc memory write failed");
    free(p);

    int *q = calloc(50, sizeof(int));
    CHECK(q != NULL, "calloc(50,4) returned NULL");
    int all_zero = 1;
    for (int i = 0; i < 50; i++) if (q[i] != 0) { all_zero = 0; break; }
    CHECK(all_zero, "calloc did not zero memory");
    free(q);

    char *r = malloc(32);
    CHECK(r != NULL, "malloc(32) returned NULL");
    for (int i = 0; i < 32; i++) r[i] = (char)(i + 1);
    char *r2 = realloc(r, 256);
    CHECK(r2 != NULL, "realloc(32->256) returned NULL");
    int preserved = 1;
    for (int i = 0; i < 32; i++) if (r2[i] != (char)(i + 1)) { preserved = 0; break; }
    CHECK(preserved, "realloc grow did not preserve data");
    free(r2);

    char *s = malloc(1000);
    CHECK(s != NULL, "malloc(1000) returned NULL");
    for (int i = 0; i < 1000; i++) s[i] = 'X';
    char *s2 = realloc(s, 10);
    CHECK(s2 != NULL, "realloc(1000->10) returned NULL");
    int still_ok = 1;
    for (int i = 0; i < 10; i++) if (s2[i] != 'X') { still_ok = 0; break; }
    CHECK(still_ok, "realloc shrink did not preserve data");
    free(s2);

    free(NULL);
    CHECK(1, "free(NULL) did not crash");

    size_t zero_sz = 0;
    volatile size_t *vz = &zero_sz;
    char *z = malloc(*vz);
    free(z);
    CHECK(1, "malloc(0)+free did not crash");
}

// ---- T2: Bootstrap pointer handoff (P0-c — THE critical test) ----
//
// This test OBTAINS A REAL BOOTSTRAP POINTER via the test hook and then
// exercises realloc/free on it AFTER initialization is complete. This is the
// exact scenario the Steward identified as P0-c: "bootstrap pointers that
// survive past initialization must not be passed to real_realloc/real_free".
static void test_bootstrap_handoff(void) {
    fprintf(stderr, "\n=== T2: Bootstrap pointer handoff (P0-c — REAL bootstrap ptrs) ===\n");

    if (!__profiler_v6_test_bootstrap_alloc) {
        g_tests++;
        CHECK(0, "test hooks not available — profiler .so was built without -DPROFILER_V6_TEST_HOOKS");
        return;
    }

    // Ensure we are in the POST-init state (g_initialized == 1) for all
    // sub-tests below. The constructor has already run by the time main()
    // starts, so this is just a sanity assertion.
    int prev_init = __profiler_v6_test_set_initialized(1);
    CHECK(prev_init == 1, "expected g_initialized==1 after constructor (got %d)", prev_init);

    // --- T2.1: Obtain a bootstrap pointer and verify it IS in the buffer ---
    size_t bs_size = 64;
    char *bs_ptr = (char *)__profiler_v6_test_bootstrap_alloc(bs_size);
    CHECK(bs_ptr != NULL, "test_bootstrap_alloc(64) returned NULL (buffer exhausted?)");
    bool is_bs = __profiler_v6_test_is_bootstrap_ptr(bs_ptr);
    CHECK(is_bs, "test_bootstrap_alloc did NOT return a bootstrap-buffer pointer (is_bootstrap_ptr=false)");
    fprintf(stderr, "  [info] bs_ptr=%p is_bootstrap=%d\n", (void*)bs_ptr, is_bs);

    // Write a known pattern into the bootstrap allocation.
    for (size_t i = 0; i < bs_size; i++) {
        bs_ptr[i] = (char)((i * 7 + 13) & 0xFF);
    }

    // --- T2.2: realloc(bootstrap_ptr, grow) — P0-c post-init path ---
    // This MUST:
    //   - detect bs_ptr is a bootstrap pointer
    //   - NOT pass bs_ptr to real_realloc (which would crash/corrupt)
    //   - allocate via real_malloc, copy min(old, new) bytes
    //   - deregister the old bootstrap entry
    size_t new_size = bs_size * 4;  // 256
    char *grown = realloc(bs_ptr, new_size);
    CHECK(grown != NULL, "realloc(bootstrap, grow 64->256) returned NULL");
    // The old bootstrap data must be preserved.
    int data_ok = 1;
    for (size_t i = 0; i < bs_size; i++) {
        if (grown[i] != (char)((i * 7 + 13) & 0xFF)) { data_ok = 0; break; }
    }
    CHECK(data_ok, "realloc(bootstrap, grow) did not preserve old data");
    // The new pointer should NOT be in the bootstrap buffer (it came from real_malloc).
    bool grown_is_bs = __profiler_v6_test_is_bootstrap_ptr(grown);
    CHECK(!grown_is_bs, "realloc(bootstrap) returned a bootstrap-buffer pointer (should be real heap)");
    // Write into grown region to confirm writability.
    memset(grown + bs_size, 'Z', new_size - bs_size);
    CHECK(grown[bs_size] == 'Z', "grown region not writable");
    free(grown);
    CHECK(1, "free(realloc'd-from-bootstrap) did not crash");

    // --- T2.3: free(bootstrap_ptr) directly — P0-c post-init free path ---
    char *bs_ptr2 = (char *)__profiler_v6_test_bootstrap_alloc(128);
    CHECK(bs_ptr2 != NULL, "test_bootstrap_alloc(128) returned NULL");
    CHECK(__profiler_v6_test_is_bootstrap_ptr(bs_ptr2), "second bootstrap ptr not in buffer");
    memset(bs_ptr2, 'Q', 128);
    // Now free it — this MUST NOT call real_free on the bootstrap pointer.
    free(bs_ptr2);
    CHECK(1, "free(bootstrap_ptr) directly did not crash (P0-c free path)");

    // --- T2.4: realloc(bootstrap_ptr, 0) — should act as free ---
    char *bs_ptr3 = (char *)__profiler_v6_test_bootstrap_alloc(32);
    CHECK(bs_ptr3 != NULL, "test_bootstrap_alloc(32) returned NULL");
    void *r3 = realloc(bs_ptr3, 0);
    // realloc(ptr, 0) may return NULL or a unique pointer; we require no crash.
    if (r3) free(r3);
    CHECK(1, "realloc(bootstrap, 0) did not crash (P0-c + edge case)");

    // --- T2.5: realloc(NULL, n) on the post-init path (bootstrap code skipped) ---
    char *from_null = realloc(NULL, 4096);
    CHECK(from_null != NULL, "realloc(NULL, 4096) returned NULL");
    CHECK(!__profiler_v6_test_is_bootstrap_ptr(from_null), "realloc(NULL,n) returned bootstrap ptr");
    memset(from_null, 'M', 4096);
    free(from_null);
    CHECK(1, "realloc(NULL, n)+free did not crash");

    // --- T2.6: PRE-init realloc bootstrap path (P0-b) ---
    // Temporarily flip g_initialized to 0 to exercise the pre-init realloc
    // code path on a bootstrap pointer. Then restore it.
    int was_init = __profiler_v6_test_set_initialized(0);
    char *bs_pre = (char *)__profiler_v6_test_bootstrap_alloc(48);
    CHECK(bs_pre != NULL, "pre-init test_bootstrap_alloc(48) returned NULL");
    CHECK(__profiler_v6_test_is_bootstrap_ptr(bs_pre), "pre-init ptr not in buffer");
    for (size_t i = 0; i < 48; i++) bs_pre[i] = (char)(0x40 + i);
    // Pre-init realloc grow: must copy min(48, 200)=48 bytes, not 200.
    char *bs_pre_new = realloc(bs_pre, 200);
    CHECK(bs_pre_new != NULL, "pre-init realloc(bootstrap, 48->200) returned NULL");
    int pre_data_ok = 1;
    for (size_t i = 0; i < 48; i++) {
        if (bs_pre_new[i] != (char)(0x40 + i)) { pre_data_ok = 0; break; }
    }
    CHECK(pre_data_ok, "pre-init realloc did not preserve old data (P0-b)");
    // Restore init state and clean up.
    __profiler_v6_test_set_initialized(was_init);
    free(bs_pre_new);
    CHECK(1, "pre-init realloc'd ptr freed after init restore did not crash");
}

// ---- T3: min(old, new) copy semantics (P0-b on normal path) ----
static void test_min_copy(void) {
    fprintf(stderr, "\n=== T3: min(old, new) copy semantics (P0-b normal path) ===\n");

    size_t old_sz = 8192;
    unsigned char *p = malloc(old_sz);
    CHECK(p != NULL, "malloc(8192) returned NULL");
    for (size_t i = 0; i < old_sz; i++) p[i] = (unsigned char)(i & 0xFF);

    size_t new_sz = old_sz * 100;  // 800 KiB
    unsigned char *q = realloc(p, new_sz);
    CHECK(q != NULL, "realloc(8192 -> 819200) returned NULL");

    int preserved = 1;
    for (size_t i = 0; i < old_sz; i++) {
        if (q[i] != (unsigned char)(i & 0xFF)) { preserved = 0; break; }
    }
    CHECK(preserved, "realloc grow did not preserve all old data");

    memset(q + old_sz, 0xCC, new_sz - old_sz);
    CHECK(q[old_sz] == 0xCC && q[new_sz - 1] == 0xCC, "new region write failed");
    free(q);

    unsigned char *a = malloc(16384);
    CHECK(a != NULL, "malloc(16384) returned NULL");
    for (size_t i = 0; i < 16384; i++) a[i] = (unsigned char)((i * 3) & 0xFF);
    unsigned char *b = realloc(a, 4096);
    CHECK(b != NULL, "realloc(16384->4096) returned NULL");
    int shr_ok = 1;
    for (size_t i = 0; i < 4096; i++) {
        if (b[i] != (unsigned char)((i * 3) & 0xFF)) { shr_ok = 0; break; }
    }
    CHECK(shr_ok, "realloc shrink data not preserved");
    free(b);
}

// ---- T4: Multithreaded malloc → realloc → free ----
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
            fprintf(stderr, "FAIL [T4 thread %u iter %d] data corrupted after realloc grow\n", seed, it);
            __sync_fetch_and_add(&g_failures, 1);
        }
        char *p3 = realloc(p2, 4096);
        if (!p3) { free(p2); continue; }
        free(p3);
        seed = seed * 1103515245u + 12345u;
    }
    return NULL;
}

static void test_multithreaded(void) {
    fprintf(stderr, "\n=== T4: Multithreaded malloc→realloc→free (%d threads x %d iters) ===\n",
            T4_THREADS, T4_ITERS);
    pthread_t threads[T4_THREADS];
    for (int i = 0; i < T4_THREADS; i++) {
        int rc = pthread_create(&threads[i], NULL, t4_worker, (void*)(uintptr_t)(i + 1));
        CHECK(rc == 0, "pthread_create failed for thread %d (rc=%d)", i, rc);
    }
    for (int i = 0; i < T4_THREADS; i++) pthread_join(threads[i], NULL);
    CHECK(1, "all %d threads completed without crash", T4_THREADS);
}

// ---- T5: Overflow guards (P0-d) ----
static void test_overflow(void) {
    fprintf(stderr, "\n=== T5: Overflow guards (P0-d) ===\n");

    volatile size_t huge = (size_t)-1 / 2;
    void *p = calloc(huge, 3);
    CHECK(p == NULL, "calloc(huge, 3) should return NULL on overflow");

    char *q = malloc(128);
    CHECK(q != NULL, "malloc(128) returned NULL");
    void *r = realloc(q, 0);
    if (r) free(r);
    CHECK(1, "realloc(ptr, 0) did not crash");

    volatile size_t sz_max = (size_t)-1;
    void *big = malloc(sz_max);
    CHECK(big == NULL, "malloc(SIZE_MAX) should return NULL");
    if (big) free(big);

    char *s = realloc(NULL, 100);
    CHECK(s != NULL, "realloc(NULL, 100) returned NULL");
    memset(s, 'B', 100);
    free(s);
    CHECK(1, "realloc(NULL, n) works as malloc");
}

int main(void) {
    fprintf(stderr, "========================================\n");
    fprintf(stderr, " malloc_profiler_v6 P0 verification tests\n");
    fprintf(stderr, " (profiler built with -DPROFILER_V6_TEST_HOOKS)\n");
    fprintf(stderr, "========================================\n");

    test_basic();
    test_bootstrap_handoff();
    test_min_copy();
    test_multithreaded();
    test_overflow();

    fprintf(stderr, "\n========================================\n");
    fprintf(stderr, " Results: %d tests, %d failures\n", g_tests, g_failures);
    fprintf(stderr, "========================================\n");

    return g_failures == 0 ? 0 : 1;
}
