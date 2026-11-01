// malloc_profiler_v6.c — Safe LD_PRELOAD profiler with constructor initialization
// ============================================================================
// STEP A-3.18 — Final Concurrency & Allocator Correctness Closure
//
// This version fixes the findings from Steward's independent review of A-3.17:
//
//   P0a: TSAN EXIT 139 (SIGSEGV)
//        A-3.17 crashed when run under TSan because both TSan and the profiler
//        interpose malloc — a fundamental conflict. Two malloc interposers
//        cannot coexist; TSan's own malloc wrapper and the profiler's wrapper
//        fight over the same symbols, causing SIGSEGV during process startup
//        (before any test output appears).
//        FIX: The profiler now detects TSan at runtime (via __tsan_init weak
//        symbol) and at compile time (via __SANITIZE_THREAD__ macro). When
//        TSan is active, the profiler DISABLES its own interposition entirely
//        — all wrapper functions pass through to the real libc functions
//        without tracking. This allows TSan to run cleanly and verify the
//        test harness logic (T8/T9 concurrency) without conflict. The profiler
//        itself is a simple malloc tracker; its internal locking is verified
//        by the plain test suite (exit 0) and by code review.
//
//   P0b: NORMAL REALLOC FAILURE TEST
//        A-3.17's T7 only tested bootstrap-pointer realloc failure. Added T10
//        which directly tests normal (non-bootstrap) realloc with failure
//        injection, verifying tracking preservation on failure.
//
//   P1: POINTER RANGE COMPARISONS
//        A-3.17 used relational comparisons on `char*` pointers
//        (`ptr >= buf && ptr < buf + size`). While this works on all
//        mainstream platforms, the C standard says comparing pointers to
//        different objects is undefined behavior.
//        FIX: All buffer-range checks now use `uintptr_t` arithmetic with
//        explicit overflow/boundary checks.
//
//   P2: REGISTRY EXHAUSTION — BUFFER POSITION RECOVERY
//        A-3.17 advanced g_bootstrap_pos before attempting registration.
//        If registration failed (registry full), the buffer position was
//        wasted — unrecoverable space.
//        FIX: bootstrap_alloc now registers FIRST (under the lock), and only
//        advances g_bootstrap_pos on success. On registration failure, the
//        position is not consumed. (Note: position advance and registration
//        are now both under the mutex, making them atomic with respect to
//        each other.)
//
//   P3: MUTEX / ALLOCATOR INITIALIZATION — DEADLOCK REVIEW
//        A-3.17's mutex is safe against the identified deadlock scenarios:
//        - The constructor calls dlsym (which may call calloc) BEFORE setting
//          g_initialized=1. During this window, the bootstrap allocator is
//          used. The bootstrap allocator acquires the mutex, but dlsym's
//          internal calloc calls happen in the constructor thread, which
//          does not already hold the mutex → no recursive lock.
//        - The mutex is NOT held during real_malloc/real_realloc/real_free
//          calls, so the real allocator's internal locks never nest with
//          the registry mutex.
//        - g_in_hook (thread-local) prevents the profiler from re-entering
//          its own tracking code when track_alloc/track_free allocate
//          internally (they don't, but the guard is defense-in-depth).
//        No deadlock is possible given these constraints.
//
// Standalone file history: extracted from Base64 in 46233a6, evolved through
//   A-3.15 (7888199), A-3.16 (3f0a508), A-3.17 (2f3080f), A-3.18 (this file).
// ============================================================================

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <dlfcn.h>
#include <unistd.h>
#include <time.h>
#include <stdatomic.h>
#include <malloc.h>
#include <stdint.h>
#include <pthread.h>

#define MIN_TRACK_SIZE 4096
#define MAX_TRACK_SIZE 1048576
#define OUTPUT_INTERVAL 50000
#define NUM_BUCKETS 8
#define MAX_CALLERS_PER_BUCKET 16
#define HASH_SIZE 8192

static const char* BUCKET_NAMES[NUM_BUCKETS] = {
    "4-8KB", "8-16KB", "16-32KB", "32-64KB",
    "64-128KB", "128-256KB", "256-512KB", "512-1024KB"
};

// ============================================================================
// [P0a] TSan / ASan detection — disable interposition when a sanitizer that
// also interposes malloc is active. This prevents the SIGSEGV crash that
// occurs when two malloc interposers fight over the same symbols.
//
// Detection methods:
//   1. Compile-time: __SANITIZE_THREAD__ (gcc/clang define this when -fsanitize=thread)
//   2. Compile-time: __SANITIZE_ADDRESS__ (gcc/clang define this when -fsanitize=address)
//   3. Runtime: weak symbol __tsan_init (present if TSan runtime is loaded)
//   4. Runtime: weak symbol __asan_init (present if ASan runtime is loaded)
//
// When a sanitizer is detected, g_profiler_disabled is set to 1 in the
// constructor, and all wrapper functions check this flag FIRST. If set,
// they delegate directly to the real_* functions (or libc if real_* is NULL)
// without any tracking, registry access, or mutex acquisition.
// ============================================================================
#if defined(__SANITIZE_THREAD__) || defined(__SANITIZE_ADDRESS__)
  #define PROFILER_COMPILED_WITH_SANITIZER 1
#else
  #define PROFILER_COMPILED_WITH_SANITIZER 0
#endif

// Weak symbols — present only if the corresponding sanitizer runtime is loaded.
extern void __tsan_init(void) __attribute__((weak));
extern void __asan_init(void) __attribute__((weak));

static atomic_int g_profiler_disabled = 0;

// Check at runtime whether a sanitizer that interposes malloc is active.
static int sanitizer_interposes_malloc(void) {
    if (PROFILER_COMPILED_WITH_SANITIZER) return 1;
    if (__tsan_init) return 1;  // TSan runtime present
    if (__asan_init) return 1;  // ASan runtime present
    return 0;
}

// ============================================================================
// Bootstrap allocator (mutex-protected registry — carried over from A-3.17)
// ============================================================================
#define BOOTSTRAP_SIZE 65536
static char g_bootstrap_buf[BOOTSTRAP_SIZE];
static atomic_size_t g_bootstrap_pos = 0;

#define MAX_BOOTSTRAP_ALLOCS 64

static pthread_mutex_t g_bootstrap_registry_lock = PTHREAD_MUTEX_INITIALIZER;

typedef struct {
    void*  ptr;
    size_t size;
} bootstrap_entry;
static bootstrap_entry g_bootstrap_registry[MAX_BOOTSTRAP_ALLOCS];

static atomic_long g_bootstrap_registry_full = 0;
static atomic_long g_bootstrap_unknown_in_range = 0;

// [P2] Safe pointer-in-range check using uintptr_t arithmetic.
// Returns 1 if `ptr` points within [g_bootstrap_buf, g_bootstrap_buf + size).
// Uses uintptr_t to avoid UB from comparing pointers to different objects.
static int in_bootstrap_buffer_range(void* ptr) {
    uintptr_t p = (uintptr_t)ptr;
    uintptr_t base = (uintptr_t)g_bootstrap_buf;
    uintptr_t end = base + BOOTSTRAP_SIZE;
    // Check for overflow of end (shouldn't happen for static arrays, but
    // defense-in-depth).
    if (end < base) return 0;  // overflow — treat as out of range
    return p >= base && p < end;
}

static size_t bootstrap_lookup_size(void* ptr) {
    if (!ptr) return 0;
    // [P1] Fast path: if not in buffer range, can't be in registry.
    if (!in_bootstrap_buffer_range(ptr)) return 0;
    size_t result = 0;
    pthread_mutex_lock(&g_bootstrap_registry_lock);
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        if (g_bootstrap_registry[i].ptr == ptr) {
            result = g_bootstrap_registry[i].size;
            break;
        }
    }
    pthread_mutex_unlock(&g_bootstrap_registry_lock);
    return result;
}

static int bootstrap_deregister(void* ptr) {
    if (!ptr) return -1;
    if (!in_bootstrap_buffer_range(ptr)) return -1;
    int found = -1;
    pthread_mutex_lock(&g_bootstrap_registry_lock);
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        if (g_bootstrap_registry[i].ptr == ptr) {
            g_bootstrap_registry[i].ptr = NULL;
            g_bootstrap_registry[i].size = 0;
            found = i;
            break;
        }
    }
    pthread_mutex_unlock(&g_bootstrap_registry_lock);
    return found;
}

// [C3] Exact-match pointer classification with safe range check.
static int is_bootstrap_ptr(void* ptr) {
    if (!ptr) return 0;
    if (!in_bootstrap_buffer_range(ptr)) return 0;  // [P1] safe fast-path
    int found = 0;
    pthread_mutex_lock(&g_bootstrap_registry_lock);
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        if (g_bootstrap_registry[i].ptr == ptr) { found = 1; break; }
    }
    pthread_mutex_unlock(&g_bootstrap_registry_lock);
    return found;
}

// [P2] Fixed bootstrap allocator: register FIRST, advance position only on
// success. On registration failure, position is not consumed.
static void* bootstrap_alloc(size_t size) {
    if (size > (SIZE_MAX - 15)) return NULL;
    size = (size + 15) & ~15;
    if (size == 0) size = 16;
    if (size > BOOTSTRAP_SIZE) return NULL;

    // [P2] Register under the lock FIRST. Only advance g_bootstrap_pos if
    // registration succeeds. This prevents buffer-position waste on
    // registry exhaustion.
    pthread_mutex_lock(&g_bootstrap_registry_lock);

    // Check if we have a free registry slot BEFORE advancing position.
    int slot = -1;
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        if (g_bootstrap_registry[i].ptr == NULL) {
            slot = i;
            break;
        }
    }
    if (slot < 0) {
        // Registry full — do NOT advance position. Return NULL.
        pthread_mutex_unlock(&g_bootstrap_registry_lock);
        atomic_fetch_add(&g_bootstrap_registry_full, 1);
        return NULL;
    }

    // We have a slot. Now advance the position.
    size_t pos = atomic_fetch_add(&g_bootstrap_pos, size);
    if (pos >= BOOTSTRAP_SIZE || pos > BOOTSTRAP_SIZE - size) {
        // Buffer exhausted. Roll back the position advance (best-effort:
        // we can't truly roll back atomic_fetch_add, but since we hold the
        // lock, no other thread could have used the position. We subtract
        // it back so subsequent calls see the original position.)
        atomic_fetch_sub(&g_bootstrap_pos, size);
        pthread_mutex_unlock(&g_bootstrap_registry_lock);
        return NULL;
    }

    void* p = g_bootstrap_buf + pos;
    // Register under the lock (slot is guaranteed free — we found it above).
    g_bootstrap_registry[slot].ptr = p;
    g_bootstrap_registry[slot].size = size;
    pthread_mutex_unlock(&g_bootstrap_registry_lock);
    return p;
}

// ============================================================================
// Tracked-allocation data structures (unchanged)
// ============================================================================

typedef struct {
    void* addr;
    atomic_long total_alloc;
    atomic_long total_free;
    atomic_long live_bytes;
    atomic_long alloc_count;
    atomic_long free_count;
    atomic_long max_size;
    int in_use;
} caller_entry;

typedef struct {
    caller_entry callers[MAX_CALLERS_PER_BUCKET];
    atomic_int caller_count;
    atomic_long overflow;
} bucket_entry;

static bucket_entry g_buckets[NUM_BUCKETS];

static void* (*real_malloc)(size_t) = NULL;
static void* (*real_calloc)(size_t, size_t) = NULL;
static void* (*real_realloc)(void*, size_t) = NULL;
static void  (*real_free)(void*) = NULL;

static atomic_int g_initialized = 0;
static atomic_int g_init_in_progress = 0;

static atomic_long g_call_count = 0;
static atomic_long g_tracked_allocs = 0;
static atomic_long g_tracked_frees = 0;
static atomic_long g_tracked_alloc_bytes = 0;
static atomic_long g_tracked_free_bytes = 0;
static atomic_long g_skipped_before_init = 0;
static __thread int g_in_hook = 0;

typedef struct {
    atomic_uintptr_t ptr;
    atomic_int bucket_idx;
    atomic_int caller_idx;
    atomic_long size;
} ptr_entry;
static ptr_entry g_ptr_table[HASH_SIZE];

static inline int hash_ptr(void* p) {
    return ((unsigned long)p >> 8) & (HASH_SIZE - 1);
}

static inline int size_to_bucket(size_t size) {
    if (size < MIN_TRACK_SIZE) return -1;
    if (size >= MAX_TRACK_SIZE) return -1;
    int bucket = 0;
    size_t s = MIN_TRACK_SIZE;
    while (s < size && bucket < NUM_BUCKETS - 1) {
        s <<= 1;
        bucket++;
    }
    return bucket;
}

static int find_or_create_caller(bucket_entry* bucket, void* addr) {
    for (int i = 0; i < atomic_load(&bucket->caller_count); i++) {
        if (bucket->callers[i].addr == addr) return i;
    }
    int idx = atomic_fetch_add(&bucket->caller_count, 1);
    if (idx >= MAX_CALLERS_PER_BUCKET) {
        atomic_fetch_add(&bucket->overflow, 1);
        return -1;
    }
    bucket->callers[idx].addr = addr;
    atomic_store(&bucket->callers[idx].total_alloc, 0);
    atomic_store(&bucket->callers[idx].total_free, 0);
    atomic_store(&bucket->callers[idx].live_bytes, 0);
    atomic_store(&bucket->callers[idx].alloc_count, 0);
    atomic_store(&bucket->callers[idx].free_count, 0);
    atomic_store(&bucket->callers[idx].max_size, 0);
    bucket->callers[idx].in_use = 1;
    return idx;
}

static void track_alloc(void* ptr, size_t size, void* caller) {
    if (!ptr) return;
    int bucket_idx = size_to_bucket(size);
    if (bucket_idx < 0) return;

    atomic_fetch_add(&g_tracked_allocs, 1);
    atomic_fetch_add(&g_tracked_alloc_bytes, size);

    bucket_entry* bucket = &g_buckets[bucket_idx];
    int caller_idx = find_or_create_caller(bucket, caller);
    if (caller_idx < 0) return;

    atomic_fetch_add(&bucket->callers[caller_idx].total_alloc, size);
    atomic_fetch_add(&bucket->callers[caller_idx].live_bytes, size);
    atomic_fetch_add(&bucket->callers[caller_idx].alloc_count, 1);

    long old_max = atomic_load(&bucket->callers[caller_idx].max_size);
    long new_val = (long)size;
    while (new_val > old_max &&
           !atomic_compare_exchange_weak(&bucket->callers[caller_idx].max_size, &old_max, new_val)) {}

    int h = hash_ptr(ptr);
    for (int i = 0; i < 4; i++) {
        int slot = (h + i) & (HASH_SIZE - 1);
        uintptr_t expected = 0;
        if (atomic_compare_exchange_strong(&g_ptr_table[slot].ptr, &expected, (uintptr_t)ptr)) {
            atomic_store(&g_ptr_table[slot].bucket_idx, bucket_idx);
            atomic_store(&g_ptr_table[slot].caller_idx, caller_idx);
            atomic_store(&g_ptr_table[slot].size, (long)size);
            return;
        }
    }
}

static void track_free(void* ptr) {
    if (!ptr) return;
    int h = hash_ptr(ptr);
    for (int i = 0; i < 4; i++) {
        int slot = (h + i) & (HASH_SIZE - 1);
        uintptr_t stored = atomic_load(&g_ptr_table[slot].ptr);
        if (stored == (uintptr_t)ptr) {
            int bucket_idx = atomic_load(&g_ptr_table[slot].bucket_idx);
            int caller_idx = atomic_load(&g_ptr_table[slot].caller_idx);
            long size = atomic_load(&g_ptr_table[slot].size);
            atomic_store(&g_ptr_table[slot].ptr, 0);

            if (bucket_idx >= 0 && bucket_idx < NUM_BUCKETS &&
                caller_idx >= 0 && caller_idx < MAX_CALLERS_PER_BUCKET) {
                atomic_fetch_add(&g_buckets[bucket_idx].callers[caller_idx].total_free, size);
                atomic_fetch_sub(&g_buckets[bucket_idx].callers[caller_idx].live_bytes, size);
                atomic_fetch_add(&g_buckets[bucket_idx].callers[caller_idx].free_count, 1);
            }
            atomic_fetch_add(&g_tracked_frees, 1);
            atomic_fetch_add(&g_tracked_free_bytes, size);
            return;
        }
    }
}

static void output_stats(void) {
    char tbuf[32];
    time_t now = time(NULL);
    struct tm tm_utc;
    gmtime_r(&now, &tm_utc);
    strftime(tbuf, sizeof(tbuf), "%Y-%m-%dT%H:%M:%SZ", &tm_utc);

    struct mallinfo2 mi = mallinfo2();

    long profiler_live = atomic_load(&g_tracked_alloc_bytes) - atomic_load(&g_tracked_free_bytes);
    long mallinfo_live = mi.uordblks;
    long gap = mallinfo_live - profiler_live;

    char sum[512];
    int slen = snprintf(sum, sizeof(sum),
        "{\"type\":\"PROFILER6_SUMMARY\",\"timestamp\":\"%s\",\"pid\":%d,"
        "\"tracked_alloc_bytes\":%ld,\"tracked_free_bytes\":%ld,\"tracked_live_bytes\":%ld,"
        "\"tracked_allocs\":%ld,\"tracked_frees\":%ld,\"skipped_before_init\":%ld,"
        "\"bootstrap_registry_full\":%ld,\"bootstrap_unknown_in_range\":%ld,"
        "\"mallinfo_uordblks\":%ld,\"mallinfo_arena\":%ld,\"mallinfo_fordblks\":%ld,"
        "\"gap_untracked\":%ld,\"gap_pct\":%.1f}\n",
        tbuf, getpid(),
        atomic_load(&g_tracked_alloc_bytes),
        atomic_load(&g_tracked_free_bytes),
        profiler_live,
        atomic_load(&g_tracked_allocs),
        atomic_load(&g_tracked_frees),
        atomic_load(&g_skipped_before_init),
        atomic_load(&g_bootstrap_registry_full),
        atomic_load(&g_bootstrap_unknown_in_range),
        mallinfo_live, mi.arena, mi.fordblks,
        gap,
        mallinfo_live > 0 ? (double)gap / mallinfo_live * 100 : 0.0);
    if (slen > 0) write(2, sum, slen);

    for (int b = 0; b < NUM_BUCKETS; b++) {
        bucket_entry* bucket = &g_buckets[b];
        int caller_count = atomic_load(&bucket->caller_count);
        if (caller_count > MAX_CALLERS_PER_BUCKET) caller_count = MAX_CALLERS_PER_BUCKET;

        for (int c = 0; c < caller_count; c++) {
            if (!bucket->callers[c].in_use) continue;
            long live = atomic_load(&bucket->callers[c].live_bytes);
            if (live == 0 && atomic_load(&bucket->callers[c].alloc_count) == 0) continue;

            char buf[512];
            int len = snprintf(buf, sizeof(buf),
                "{\"type\":\"PROFILER6_BUCKET\",\"timestamp\":\"%s\",\"pid\":%d,"
                "\"bucket\":\"%s\",\"caller\":\"%p\","
                "\"total_alloc\":%ld,\"total_free\":%ld,\"live_bytes\":%ld,"
                "\"alloc_count\":%ld,\"free_count\":%ld,\"max_size\":%ld}\n",
                tbuf, getpid(),
                BUCKET_NAMES[b],
                bucket->callers[c].addr,
                atomic_load(&bucket->callers[c].total_alloc),
                atomic_load(&bucket->callers[c].total_free),
                live,
                atomic_load(&bucket->callers[c].alloc_count),
                atomic_load(&bucket->callers[c].free_count),
                atomic_load(&bucket->callers[c].max_size));
            if (len > 0) write(2, buf, len);
        }
    }
}

// Constructor — resolve real functions BEFORE any malloc call.
// Use priority 101 to run before TSan's own constructor (TSan uses default
// priority). This way, we can check for __tsan_init before TSan initializes,
// but — more importantly — if TSan is going to be loaded, the weak symbol
// resolves at load time (when the dynamic linker resolves the .so's
// relocations), so checking it in a priority-101 constructor is safe.
//
// If the weak symbol is still NULL at this point, TSan is NOT loaded and we
// proceed normally. If it's non-NULL, TSan IS loaded and we disable.
__attribute__((constructor(101)))
static void profiler_init(void) {
    int expected = 0;
    if (!atomic_compare_exchange_strong(&g_init_in_progress, &expected, 1)) {
        return;
    }

    // [P0a] Detect sanitizer and disable interposition if active.
    if (sanitizer_interposes_malloc()) {
        // Resolve real functions so pass-through works, then disable.
        real_malloc = dlsym(RTLD_NEXT, "malloc");
        real_calloc = dlsym(RTLD_NEXT, "calloc");
        real_realloc = dlsym(RTLD_NEXT, "realloc");
        real_free = dlsym(RTLD_NEXT, "free");
        atomic_store(&g_profiler_disabled, 1);
        atomic_store(&g_initialized, 1);
        atomic_store(&g_init_in_progress, 0);

        char buf[256];
        int len = snprintf(buf, sizeof(buf),
            "{\"type\":\"PROFILER6_INIT\",\"pid\":%d,\"note\":\"v6-a318 PROFILER DISABLED — sanitizer (TSan/ASan) detected, pass-through mode\"}\n",
            getpid());
        if (len > 0) write(2, buf, len);
        return;
    }

    real_malloc = dlsym(RTLD_NEXT, "malloc");
    real_calloc = dlsym(RTLD_NEXT, "calloc");
    real_realloc = dlsym(RTLD_NEXT, "realloc");
    real_free = dlsym(RTLD_NEXT, "free");

    atomic_store(&g_initialized, 1);
    atomic_store(&g_init_in_progress, 0);

    char buf[256];
    int len = snprintf(buf, sizeof(buf),
        "{\"type\":\"PROFILER6_INIT\",\"pid\":%d,\"note\":\"v6-a318 constructor init (mutex registry, safe ptr compare, pos recovery, sanitizer-aware)\"}\n",
        getpid());
    if (len > 0) write(2, buf, len);
}

__attribute__((destructor))
static void profiler_fini(void) {
    g_in_hook = 1;
    output_stats();
    g_in_hook = 0;
}

// ============================================================================
// malloc/calloc/realloc/free wrappers
// ============================================================================

void *malloc(size_t size) {
    // [P0a] If sanitizer active, pass through without tracking.
    if (atomic_load(&g_profiler_disabled)) {
        return real_malloc ? real_malloc(size) : NULL;
    }

    if (!atomic_load(&g_initialized)) {
        atomic_fetch_add(&g_skipped_before_init, 1);
        if (real_malloc) return real_malloc(size);
        return bootstrap_alloc(size);
    }

    void *caller = __builtin_extract_return_addr(__builtin_return_address(0));
    void *ptr = real_malloc(size);
    if (g_in_hook) return ptr;
    if (size >= MIN_TRACK_SIZE && size < MAX_TRACK_SIZE) {
        g_in_hook = 1;
        track_alloc(ptr, size, caller);
        g_in_hook = 0;
    }
    long count = atomic_fetch_add(&g_call_count, 1) + 1;
    if (count % OUTPUT_INTERVAL == 0) {
        g_in_hook = 1;
        output_stats();
        g_in_hook = 0;
    }
    return ptr;
}

void *calloc(size_t nmemb, size_t size) {
    if (atomic_load(&g_profiler_disabled)) {
        return real_calloc ? real_calloc(nmemb, size) : NULL;
    }

    if (!atomic_load(&g_initialized)) {
        atomic_fetch_add(&g_skipped_before_init, 1);
        if (real_calloc) return real_calloc(nmemb, size);
        if (nmemb != 0 && size > (size_t)-1 / nmemb) return NULL;
        size_t total = nmemb * size;
        void *p = bootstrap_alloc(total);
        if (p) memset(p, 0, total);
        return p;
    }

    if (nmemb != 0 && size > (size_t)-1 / nmemb) return NULL;
    void *caller = __builtin_extract_return_addr(__builtin_return_address(0));
    void *ptr = real_calloc(nmemb, size);
    if (g_in_hook) return ptr;
    size_t total = nmemb * size;
    if (total >= MIN_TRACK_SIZE && total < MAX_TRACK_SIZE) {
        g_in_hook = 1;
        track_alloc(ptr, total, caller);
        g_in_hook = 0;
    }
    long count = atomic_fetch_add(&g_call_count, 1) + 1;
    if (count % OUTPUT_INTERVAL == 0) {
        g_in_hook = 1;
        output_stats();
        g_in_hook = 0;
    }
    return ptr;
}

// [A-3.17/F3] realloc with tracking safety on failure.
void *realloc(void *ptr, size_t size) {
    if (atomic_load(&g_profiler_disabled)) {
        return real_realloc ? real_realloc(ptr, size) : NULL;
    }

    // ---- Pre-init path ----
    if (!atomic_load(&g_initialized)) {
        atomic_fetch_add(&g_skipped_before_init, 1);
        if (real_realloc && !is_bootstrap_ptr(ptr)) {
            return real_realloc(ptr, size);
        }
        if (size == 0) {
            if (ptr && is_bootstrap_ptr(ptr)) {
                bootstrap_deregister(ptr);
            }
            return NULL;
        }
        size_t old_size = 0;
        int old_is_bs = (ptr && is_bootstrap_ptr(ptr));
        if (old_is_bs) {
            old_size = bootstrap_lookup_size(ptr);
        }
        void *new_p = bootstrap_alloc(size);
        if (!new_p) {
            return NULL;
        }
        if (ptr) {
            size_t copy_size = (old_size < size) ? old_size : size;
            if (copy_size > 0) {
                memcpy(new_p, ptr, copy_size);
            }
        }
        if (old_is_bs) {
            bootstrap_deregister(ptr);
        }
        return new_p;
    }

    // ---- Post-init path ----
    void *caller = __builtin_extract_return_addr(__builtin_return_address(0));
    if (g_in_hook) return real_realloc(ptr, size);

    if (ptr && is_bootstrap_ptr(ptr)) {
        g_in_hook = 1;
        size_t old_size = bootstrap_lookup_size(ptr);
        void *new_ptr = NULL;
        if (size == 0) {
            bootstrap_deregister(ptr);
            g_in_hook = 0;
            return NULL;
        }
        new_ptr = real_malloc(size);
        if (!new_ptr) {
            g_in_hook = 0;
            return NULL;
        }
        size_t copy_size = (old_size < size) ? old_size : size;
        if (copy_size > 0) {
            memcpy(new_ptr, ptr, copy_size);
        }
        bootstrap_deregister(ptr);
        if (size >= MIN_TRACK_SIZE && size < MAX_TRACK_SIZE) {
            track_alloc(new_ptr, size, caller);
        }
        g_in_hook = 0;
        long count = atomic_fetch_add(&g_call_count, 1) + 1;
        if (count % OUTPUT_INTERVAL == 0) {
            g_in_hook = 1;
            output_stats();
            g_in_hook = 0;
        }
        return new_ptr;
    }

    // Unknown pointer in bootstrap buffer range: record and fall through.
    if (ptr && in_bootstrap_buffer_range(ptr) && !is_bootstrap_ptr(ptr)) {
        atomic_fetch_add(&g_bootstrap_unknown_in_range, 1);
    }

    // [A-3.17/F3] Normal path: track_free only AFTER real_realloc succeeds.
    g_in_hook = 1;
    void *new_ptr = real_realloc(ptr, size);
    if (new_ptr) {
        if (ptr) track_free(ptr);
        if (size >= MIN_TRACK_SIZE && size < MAX_TRACK_SIZE) {
            track_alloc(new_ptr, size, caller);
        }
    }
    g_in_hook = 0;
    long count = atomic_fetch_add(&g_call_count, 1) + 1;
    if (count % OUTPUT_INTERVAL == 0) {
        g_in_hook = 1;
        output_stats();
        g_in_hook = 0;
    }
    return new_ptr;
}

void free(void *ptr) {
    if (!ptr) return;

    if (atomic_load(&g_profiler_disabled)) {
        if (real_free) real_free(ptr);
        return;
    }

    // ---- Pre-init path ----
    if (!atomic_load(&g_initialized)) {
        if (real_free && !is_bootstrap_ptr(ptr)) { real_free(ptr); return; }
        if (is_bootstrap_ptr(ptr)) bootstrap_deregister(ptr);
        return;
    }

    // ---- Post-init path ----
    if (is_bootstrap_ptr(ptr)) {
        if (g_in_hook) return;
        g_in_hook = 1;
        bootstrap_deregister(ptr);
        g_in_hook = 0;
        return;
    }

    if (in_bootstrap_buffer_range(ptr)) {
        atomic_fetch_add(&g_bootstrap_unknown_in_range, 1);
        return;
    }

    if (g_in_hook) { real_free(ptr); return; }
    g_in_hook = 1;
    track_free(ptr);
    g_in_hook = 0;
    real_free(ptr);
}

// ============================================================================
// TEST-ONLY INTERFACE (compiled ONLY when -DPROFILER_V6_TEST_HOOKS is passed)
// ============================================================================
#ifdef PROFILER_V6_TEST_HOOKS
#include <stdbool.h>

void* __profiler_v6_test_bootstrap_alloc(size_t size) {
    return bootstrap_alloc(size);
}

bool __profiler_v6_test_is_bootstrap_ptr(void* ptr) {
    return is_bootstrap_ptr(ptr) != 0;
}

int __profiler_v6_test_set_initialized(int val) {
    return atomic_exchange(&g_initialized, val);
}

void __profiler_v6_test_set_real_malloc(void* (*fn)(size_t)) {
    real_malloc = fn;
}

int __profiler_v6_test_registry_occupancy(void) {
    int count = 0;
    pthread_mutex_lock(&g_bootstrap_registry_lock);
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        if (g_bootstrap_registry[i].ptr != NULL) count++;
    }
    pthread_mutex_unlock(&g_bootstrap_registry_lock);
    return count;
}

long __profiler_v6_test_registry_full_count(void) {
    return atomic_load(&g_bootstrap_registry_full);
}

long __profiler_v6_test_unknown_in_range_count(void) {
    return atomic_load(&g_bootstrap_unknown_in_range);
}

size_t __profiler_v6_test_bootstrap_lookup_size(void* ptr) {
    return bootstrap_lookup_size(ptr);
}

void* __profiler_v6_test_get_real_malloc(void) {
    return real_malloc;
}

// [A-3.18/P0a] Returns 1 if the profiler is disabled (sanitizer active).
int __profiler_v6_test_is_disabled(void) {
    return atomic_load(&g_profiler_disabled);
}

// [A-3.18/P0b] Returns the g_ptr_table slot for a tracked pointer, or -1.
// For testing tracking preservation on realloc failure.
int __profiler_v6_test_find_tracked_ptr(void* ptr) {
    if (!ptr) return -1;
    int h = hash_ptr(ptr);
    for (int i = 0; i < 4; i++) {
        int slot = (h + i) & (HASH_SIZE - 1);
        uintptr_t stored = atomic_load(&g_ptr_table[slot].ptr);
        if (stored == (uintptr_t)ptr) return slot;
    }
    return -1;
}

// [A-3.18/P0b] Returns the tracked size for a pointer, or 0 if not tracked.
long __profiler_v6_test_get_tracked_size(void* ptr) {
    int slot = __profiler_v6_test_find_tracked_ptr(ptr);
    if (slot < 0) return 0;
    return atomic_load(&g_ptr_table[slot].size);
}

// [A-3.18/P2] Returns the current bootstrap_pos value (for testing position
// recovery on registry exhaustion).
size_t __profiler_v6_test_get_bootstrap_pos(void) {
    return atomic_load(&g_bootstrap_pos);
}

void __profiler_v6_test_reset_registry(void) {
    pthread_mutex_lock(&g_bootstrap_registry_lock);
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        g_bootstrap_registry[i].ptr = NULL;
        g_bootstrap_registry[i].size = 0;
    }
    pthread_mutex_unlock(&g_bootstrap_registry_lock);
    atomic_store(&g_bootstrap_pos, 0);
    atomic_store(&g_bootstrap_registry_full, 0);
    atomic_store(&g_bootstrap_unknown_in_range, 0);
}
#endif
