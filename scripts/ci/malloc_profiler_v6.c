// malloc_profiler_v6.c — Safe LD_PRELOAD profiler with constructor initialization
// ============================================================================
// STEP A-3.17 — Registry Lifetime Synchronization + Realloc Tracking Safety
//
// This version fixes the four findings from Steward's independent review of
// STEP A-3.16:
//
//   F1: REGISTRY RACE ON `size` FIELD
//       The A-3.16 version used CAS on `ptr` with release/acquire ordering,
//       but `size` was a plain (non-atomic) field. A reader that loaded `ptr`
//       (acquire) before deregister's CAS could then race with the `size = 0`
//       store in deregister — a genuine data race.
//
//       FIX: The entire bootstrap registry is now protected by a single
//       pthread_mutex_t (g_bootstrap_registry_lock). All reads and writes
//       of {ptr, size} happen under the lock, providing real mutual-exclusion
//       lifetime synchronization. This is correct because the bootstrap
//       allocator is NOT a hot path (used only during constructor + tests).
//
//   F2: PUBLICATION FAILURE RETURNED ALLOCATION WITHOUT METADATA
//       In A-3.16, if bootstrap_publish_slot's CAS failed, bootstrap_alloc
//       still returned `p` to the caller — an untracked allocation, exactly
//       what C4 was supposed to prevent.
//
//       FIX: bootstrap_alloc now checks the result of registration and
//       returns NULL on failure (hard-fail per C4). With the mutex approach,
//       registration is infallible under the lock, but the check remains
//       as defense-in-depth and to satisfy the Steward's requirement that
//       "publication failure must propagate to the caller."
//
//   F3: NORMAL REALLOC TRACKING LOSS ON FAILURE
//       In A-3.16's normal (non-bootstrap) realloc path, track_free(ptr) was
//       called BEFORE real_realloc. If real_realloc failed, the old pointer's
//       tracking was already removed, corrupting profiler statistics (though
//       the pointer itself was valid per POSIX).
//
//       FIX: track_free is now called only AFTER real_realloc succeeds.
//       On failure, the old pointer's tracking remains intact.
//
//   F4: (addressed in test script, not in this file)
//       The test script accepted non-zero exit codes if "0 failures" appeared
//       in output. Fixed in test_profiler_v6.sh to require exit code 0.
//
// Standalone file history: extracted from Base64 blob in commit 46233a6,
//   evolved through A-3.15 (7888199), A-3.16 (3f0a508), A-3.17 (this file).
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
// Bootstrap allocator: used ONLY during constructor when dlsym calls calloc.
//
// [A-3.17/F1] The entire registry is protected by a single mutex. This
// provides real lifetime synchronization: a reader holding the lock sees a
// consistent {ptr, size} pair, and a writer (deregister/publish) cannot
// modify either field while a reader holds the lock.
//
// The mutex is statically initialized (PTHREAD_MUTEX_INITIALIZER) so no
// constructor is needed for the lock itself. The bootstrap allocator is
// NOT a hot path — it is used during the constructor (single-threaded) and
// in tests. Mutex overhead is negligible for this usage pattern.
// ============================================================================
#define BOOTSTRAP_SIZE 65536
static char g_bootstrap_buf[BOOTSTRAP_SIZE];
static atomic_size_t g_bootstrap_pos = 0;

#define MAX_BOOTSTRAP_ALLOCS 64

// [A-3.17/F1] Single mutex protecting the entire registry.
// All access to g_bootstrap_registry[] fields (ptr AND size) MUST hold this lock.
static pthread_mutex_t g_bootstrap_registry_lock = PTHREAD_MUTEX_INITIALIZER;

typedef struct {
    void*  ptr;   // NULL = empty slot; else pointer into g_bootstrap_buf
    size_t size;   // aligned allocation size; valid only when ptr != NULL
} bootstrap_entry;
static bootstrap_entry g_bootstrap_registry[MAX_BOOTSTRAP_ALLOCS];

// Diagnostic counters
static atomic_long g_bootstrap_registry_full = 0;
static atomic_long g_bootstrap_unknown_in_range = 0;

// [A-3.17/F1] All registry operations hold g_bootstrap_registry_lock.
// This eliminates the data race on the `size` field that existed in A-3.16.

// Register a bootstrap allocation under the lock. Returns 0 on success, -1 if
// no empty slot is available. Caller MUST hold g_bootstrap_registry_lock.
static int bootstrap_register_locked(void* ptr, size_t size) {
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        if (g_bootstrap_registry[i].ptr == NULL) {
            g_bootstrap_registry[i].ptr = ptr;
            g_bootstrap_registry[i].size = size;
            return 0;
        }
    }
    return -1;  // registry full
}

// Look up the size of a bootstrap pointer. Thread-safe (acquires lock).
// Returns 0 if the pointer is not a registered bootstrap allocation.
static size_t bootstrap_lookup_size(void* ptr) {
    if (!ptr) return 0;
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

// Deregister a bootstrap pointer. Thread-safe (acquires lock).
// Returns slot index on success, -1 if not found.
static int bootstrap_deregister(void* ptr) {
    if (!ptr) return -1;
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

// [C3/A-3.17] Exact-match pointer classification. Thread-safe.
// Returns 1 only if the pointer is a registered bootstrap allocation.
// Returns 0 for unknown pointers, including those in the buffer range
// but not registered.
//
// Fast-path optimization: if the pointer is outside the bootstrap buffer's
// address range, it cannot be in the registry (all registry entries point
// into g_bootstrap_buf). Skip the lock in that case. For in-range pointers,
// acquire the lock and do exact-match. This is safe: the range check is a
// conservative filter — out-of-range → definitely not registered → skip.
static int is_bootstrap_ptr(void* ptr) {
    if (!ptr) return 0;
    // Fast path: outside buffer range → definitely not bootstrap.
    if ((char*)ptr < g_bootstrap_buf ||
        (char*)ptr >= g_bootstrap_buf + BOOTSTRAP_SIZE) {
        return 0;
    }
    // Slow path: in range → take lock and do exact match.
    int found = 0;
    pthread_mutex_lock(&g_bootstrap_registry_lock);
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        if (g_bootstrap_registry[i].ptr == ptr) { found = 1; break; }
    }
    pthread_mutex_unlock(&g_bootstrap_registry_lock);
    return found;
}

// Range check helper (for diagnostics only).
static int in_bootstrap_buffer_range(void* ptr) {
    return (char*)ptr >= g_bootstrap_buf &&
           (char*)ptr <  g_bootstrap_buf + BOOTSTRAP_SIZE;
}

// [A-3.17/F2] Fixed bootstrap allocator: returns NULL on registry exhaustion
// OR on publication failure. The caller never receives an untracked allocation.
static void* bootstrap_alloc(size_t size) {
    // Guard 1: size + 15 must not overflow size_t.
    if (size > (SIZE_MAX - 15)) return NULL;
    // Align to 16 bytes.
    size = (size + 15) & ~15;
    if (size == 0) size = 16;
    // Guard 2: a single aligned allocation cannot exceed the buffer.
    if (size > BOOTSTRAP_SIZE) return NULL;
    // Atomically reserve position in the static buffer.
    // The bump pointer (g_bootstrap_pos) is the only field that needs to be
    // atomic — it's a monotonic counter, not metadata.
    size_t pos = atomic_fetch_add(&g_bootstrap_pos, size);
    // Guard 3: position must be within buffer.
    if (pos >= BOOTSTRAP_SIZE || pos > BOOTSTRAP_SIZE - size) {
        return NULL;  // buffer exhausted
    }
    void* p = g_bootstrap_buf + pos;

    // [A-3.17/F1+F2] Register under the lock. If registration fails (registry
    // full), return NULL — do NOT return the untracked allocation.
    pthread_mutex_lock(&g_bootstrap_registry_lock);
    int rc = bootstrap_register_locked(p, size);
    pthread_mutex_unlock(&g_bootstrap_registry_lock);

    if (rc != 0) {
        // [C4] Registry exhausted. Hard-fail: return NULL.
        atomic_fetch_add(&g_bootstrap_registry_full, 1);
        return NULL;
    }
    return p;
}

// ============================================================================
// Tracked-allocation data structures (unchanged from A-3.16)
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

// Constructor — resolve real functions BEFORE any malloc call
__attribute__((constructor))
static void profiler_init(void) {
    int expected = 0;
    if (!atomic_compare_exchange_strong(&g_init_in_progress, &expected, 1)) {
        return; // Another thread is already initializing
    }

    real_malloc = dlsym(RTLD_NEXT, "malloc");
    real_calloc = dlsym(RTLD_NEXT, "calloc");
    real_realloc = dlsym(RTLD_NEXT, "realloc");
    real_free = dlsym(RTLD_NEXT, "free");

    atomic_store(&g_initialized, 1);
    atomic_store(&g_init_in_progress, 0);

    char buf[256];
    int len = snprintf(buf, sizeof(buf),
        "{\"type\":\"PROFILER6_INIT\",\"pid\":%d,\"note\":\"v6-a317 constructor init (mutex-protected registry, exact-match classify, hard-fail exhaustion, realloc tracking safety)\"}\n",
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
    if (!atomic_load(&g_initialized)) {
        atomic_fetch_add(&g_skipped_before_init, 1);
        if (real_calloc) return real_calloc(nmemb, size);
        if (nmemb != 0 && size > (size_t)-1 / nmemb) return NULL; // overflow
        size_t total = nmemb * size;
        void *p = bootstrap_alloc(total);
        if (p) memset(p, 0, total);
        return p;
    }

    // Overflow check BEFORE calling real_calloc.
    if (nmemb != 0 && size > (size_t)-1 / nmemb) return NULL; // overflow
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
// - Bootstrap path: old metadata deregistered only after new allocation
//   succeeds AND data is copied (carried over from A-3.16 C2).
// - Normal path: track_free(old) called only AFTER real_realloc succeeds.
//   On failure, old pointer's tracking remains intact.
void *realloc(void *ptr, size_t size) {
    // ---- Pre-init path ----
    if (!atomic_load(&g_initialized)) {
        atomic_fetch_add(&g_skipped_before_init, 1);
        if (real_realloc && !is_bootstrap_ptr(ptr)) {
            return real_realloc(ptr, size);
        }
        // ptr is a bootstrap pointer, or real_realloc is unavailable.
        if (size == 0) {
            if (ptr && is_bootstrap_ptr(ptr)) {
                bootstrap_deregister(ptr);
            }
            return NULL;
        }
        // [C2] Look up old size BEFORE allocating new, so we can preserve
        // the old entry if allocation fails.
        size_t old_size = 0;
        int old_is_bs = (ptr && is_bootstrap_ptr(ptr));
        if (old_is_bs) {
            old_size = bootstrap_lookup_size(ptr);
        }
        void *new_p = bootstrap_alloc(size);
        if (!new_p) {
            // [C2] Allocation failed. Old pointer's metadata is untouched.
            return NULL;
        }
        if (ptr) {
            size_t copy_size = (old_size < size) ? old_size : size;
            if (copy_size > 0) {
                memcpy(new_p, ptr, copy_size);
            }
        }
        // [C2] Only deregister the old entry AFTER the new one is fully ready.
        if (old_is_bs) {
            bootstrap_deregister(ptr);
        }
        return new_p;
    }

    // ---- Post-init path ----
    void *caller = __builtin_extract_return_addr(__builtin_return_address(0));
    if (g_in_hook) return real_realloc(ptr, size);

    // Bootstrap pointer that survived past init: do NOT forward to
    // real_realloc. Allocate fresh, copy, then deregister old.
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
            // [C2] Allocation failed. Old pointer's metadata is UNTOUCHED.
            g_in_hook = 0;
            return NULL;
        }
        size_t copy_size = (old_size < size) ? old_size : size;
        if (copy_size > 0) {
            memcpy(new_ptr, ptr, copy_size);
        }
        // Now that new is fully populated, deregister the old entry.
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

    // [A-3.17/F3] Normal (non-bootstrap) path.
    // Call real_realloc FIRST. Only remove old tracking on success.
    // On failure, ptr is still valid (POSIX) and its tracking is intact.
    g_in_hook = 1;
    void *new_ptr = real_realloc(ptr, size);
    if (new_ptr) {
        // Success: remove old tracking and add new.
        if (ptr) track_free(ptr);
        if (size >= MIN_TRACK_SIZE && size < MAX_TRACK_SIZE) {
            track_alloc(new_ptr, size, caller);
        }
    }
    // On failure (new_ptr == NULL): ptr is unchanged, tracking preserved.
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

    // Unknown pointer in bootstrap buffer range: record and return without
    // freeing (leak, not crash).
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

// Returns the current registry occupancy count (0..64). Thread-safe.
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

// [A-3.17] Lookup size directly (exposes bootstrap_lookup_size for T9).
// Thread-safe.
size_t __profiler_v6_test_bootstrap_lookup_size(void* ptr) {
    return bootstrap_lookup_size(ptr);
}

// [A-3.17/T7] Returns the real libc malloc pointer saved by the constructor.
// This allows the test harness to get a WORKING allocator (bypassing the
// profiler's interposition) for failure injection tests. The test binary
// CANNOT use dlsym(RTLD_NEXT, "malloc") because that would return the
// profiler's malloc symbol (LD_PRELOAD comes before libc in search order),
// causing infinite recursion.
void* __profiler_v6_test_get_real_malloc(void) {
    return real_malloc;
}

// Force-reset the registry to empty (for ABA/reuse tests).
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
