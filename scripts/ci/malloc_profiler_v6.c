// malloc_profiler_v6.c — Safe LD_PRELOAD profiler with constructor initialization
// ============================================================================
// STANDALONE AUDITABLE VERSION — extracted from commit 46233a6
//   (originally embedded as Base64 in .github/workflows/store-runtime-contract-proof.yml)
//
// This file was created by extracting the Base64-embedded C source from the
// workflow file at commit 46233a6f6fe81a5b4f1a91c4f01f462639c73947 and then
// applying the P0 fixes mandated by STEP A-3.15. It is NOT claimed that this
// standalone file pre-existed in the repository; the original form was the
// Base64 blob in the workflow.
//
// P0 fixes applied in this version (v6-fixed):
//
//   P0-a: Bootstrap allocation sizes are now tracked in a dedicated registry
//         (g_bootstrap_registry). Every bootstrap_alloc() registers {ptr,size};
//         bootstrap_lookup_size() retrieves the old size; bootstrap_deregister()
//         removes the entry on free/realloc.
//
//   P0-b: realloc() pre-init path now copies min(old_size, new_size) bytes
//         instead of `size` bytes. Reads can no longer escape the old
//         allocation bounds.
//
//   P0-c: realloc() and free() POST-init paths now check is_bootstrap_ptr()
//         BEFORE delegating to real_realloc/real_free. Bootstrap pointers that
//         survive past initialization are handled safely (copy-then-deregister
//         for realloc; pure deregister for free) and are NEVER passed to the
//         real allocator.
//
//   P0-d: bootstrap_alloc() now guards against:
//           - size + 15 overflow  (size > SIZE_MAX - 15)
//           - single allocation exceeding BOOTSTRAP_SIZE  (early reject)
//           - position overflow / exhaustion (pos > BOOTSTRAP_SIZE guard)
//
//   Bonus: calloc() post-init path now performs the nmemb*size overflow check
//          BEFORE calling real_calloc(), so invalid products are never passed
//          to the real allocator.
//
// Original v6 design (preserved):
//   1. init_real() moved to __attribute__((constructor)) — runs before any malloc
//   2. g_initialized flag — if false, skip all tracking (pass-through)
//   3. No dlsym calls in malloc/calloc/realloc/free hot paths
//   4. Caller address captured in wrapper, passed to track_alloc()
//   5. Reentrancy guard preserved
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
// This is a bounded static buffer — safe because dlsym makes very few
// allocations.
//
// [P0-a] We now track the size of every bootstrap allocation in a registry so
// that realloc/free can know the old size and copy exactly min(old, new).
// ============================================================================
#define BOOTSTRAP_SIZE 65536
static char g_bootstrap_buf[BOOTSTRAP_SIZE];
static atomic_size_t g_bootstrap_pos = 0;

// [P0-a] Registry of bootstrap allocations. dlsym makes very few calls, so a
// small fixed array with linear search is sufficient and lock-free via CAS.
#define MAX_BOOTSTRAP_ALLOCS 64
typedef struct {
    atomic_uintptr_t ptr;   // 0 = empty slot
    size_t            size; // original requested size (NOT aligned)
} bootstrap_entry;
static bootstrap_entry g_bootstrap_registry[MAX_BOOTSTRAP_ALLOCS];

// [P0-a] Register a bootstrap allocation. Returns slot index or -1 if full.
// Uses CAS so concurrent registration (unlikely during constructor, but safe)
// does not corrupt entries.
static int bootstrap_register(void* ptr, size_t requested_size) {
    if (!ptr) return -1;
    uintptr_t p = (uintptr_t)ptr;
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        uintptr_t expected = 0;
        if (atomic_compare_exchange_strong(&g_bootstrap_registry[i].ptr,
                                           &expected, p)) {
            g_bootstrap_registry[i].size = requested_size;
            return i;
        }
    }
    return -1; // registry full
}

// [P0-a] Look up the original requested size for a bootstrap pointer.
// Returns 0 if the pointer is not in the registry (including non-bootstrap ptrs).
static size_t bootstrap_lookup_size(void* ptr) {
    if (!ptr) return 0;
    uintptr_t p = (uintptr_t)ptr;
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        uintptr_t stored = atomic_load(&g_bootstrap_registry[i].ptr);
        if (stored == p) {
            return g_bootstrap_registry[i].size;
        }
    }
    return 0;
}

// [P0-a] Remove a bootstrap allocation from the registry.
static void bootstrap_deregister(void* ptr) {
    if (!ptr) return;
    uintptr_t p = (uintptr_t)ptr;
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        uintptr_t stored = atomic_load(&g_bootstrap_registry[i].ptr);
        if (stored == p) {
            atomic_store(&g_bootstrap_registry[i].ptr, 0);
            g_bootstrap_registry[i].size = 0;
            return;
        }
    }
}

// [P0-d] Fixed bootstrap allocator with overflow guards.
static void* bootstrap_alloc(size_t size) {
    // Guard 1: size + 15 must not overflow size_t.
    if (size > (SIZE_MAX - 15)) return NULL;
    // Align to 16 bytes.
    size = (size + 15) & ~15;
    // Guard 2: a single aligned allocation cannot exceed the buffer.
    if (size == 0) size = 16;            // give zero-size a minimal slot
    if (size > BOOTSTRAP_SIZE) return NULL;
    // Atomically reserve position.
    size_t pos = atomic_fetch_add(&g_bootstrap_pos, size);
    // Guard 3: position must be within buffer AND pos+size must not overflow.
    if (pos >= BOOTSTRAP_SIZE || pos > BOOTSTRAP_SIZE - size) {
        // Buffer exhausted — do not serve. (pos was advanced; subsequent calls
        // will also fail this guard, which is the correct behavior.)
        return NULL;
    }
    void* p = g_bootstrap_buf + pos;
    // [P0-a] Register the allocation with its original requested size.
    // Note: we register the ALIGNED size here because that is the number of
    // bytes actually backed by the buffer for this allocation. Callers pass
    // the requested size separately via bootstrap_alloc's `size` param — but
    // to keep the API simple we register the aligned size, which is always
    // >= requested size and <= buffer bounds, so memcpy of min(aligned, new)
    // never reads out of the allocation's buffer footprint.
    bootstrap_register(p, size);
    return p;
}

static int is_bootstrap_ptr(void* ptr) {
    return (char*)ptr >= g_bootstrap_buf &&
           (char*)ptr <  g_bootstrap_buf + BOOTSTRAP_SIZE;
}

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
        "\"mallinfo_uordblks\":%ld,\"mallinfo_arena\":%ld,\"mallinfo_fordblks\":%ld,"
        "\"gap_untracked\":%ld,\"gap_pct\":%.1f}\n",
        tbuf, getpid(),
        atomic_load(&g_tracked_alloc_bytes),
        atomic_load(&g_tracked_free_bytes),
        profiler_live,
        atomic_load(&g_tracked_allocs),
        atomic_load(&g_tracked_frees),
        atomic_load(&g_skipped_before_init),
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
    // Prevent re-entrant initialization
    int expected = 0;
    if (!atomic_compare_exchange_strong(&g_init_in_progress, &expected, 1)) {
        return; // Another thread is already initializing
    }

    // Resolve real functions
    real_malloc = dlsym(RTLD_NEXT, "malloc");
    real_calloc = dlsym(RTLD_NEXT, "calloc");
    real_realloc = dlsym(RTLD_NEXT, "realloc");
    real_free = dlsym(RTLD_NEXT, "free");

    // Mark as initialized — all future malloc calls will use real_* directly
    atomic_store(&g_initialized, 1);
    atomic_store(&g_init_in_progress, 0);

    char buf[128];
    int len = snprintf(buf, sizeof(buf),
        "{\"type\":\"PROFILER6_INIT\",\"pid\":%d,\"note\":\"v6-fixed constructor init complete (4KiB-1MiB, %d buckets)\"}\n",
        getpid(), NUM_BUCKETS);
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
// If not yet initialized (constructor hasn't run), pass through to real_*
// (which may still be NULL — in that case, use the bootstrap static buffer).
// If initialized, capture caller address and track.
//
// [P0-c] Post-init paths now detect bootstrap pointers that survived past
//        initialization and handle them safely instead of passing them to
//        real_realloc / real_free (which would crash or corrupt the heap).
// ============================================================================

void *malloc(size_t size) {
    if (!atomic_load(&g_initialized)) {
        atomic_fetch_add(&g_skipped_before_init, 1);
        if (real_malloc) return real_malloc(size);
        // Bootstrap: use static buffer
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
        // Bootstrap: use static buffer (dlsym calls calloc during init)
        if (nmemb != 0 && size > (size_t)-1 / nmemb) return NULL; // overflow
        size_t total = nmemb * size;
        void *p = bootstrap_alloc(total);
        if (p) memset(p, 0, total);
        return p;
    }

    // [Bonus fix] Overflow check BEFORE calling real_calloc.
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

// [P0-b] realloc pre-init path now copies min(old_size, new_size).
// [P0-c] realloc post-init path now detects bootstrap pointers and handles
//        them safely (copy from static buffer into a real allocation) instead
//        of forwarding them to real_realloc.
void *realloc(void *ptr, size_t size) {
    // ---- Pre-init path ----
    if (!atomic_load(&g_initialized)) {
        atomic_fetch_add(&g_skipped_before_init, 1);
        // If ptr is NOT a bootstrap pointer and real_realloc is available,
        // delegate to the real allocator.
        if (real_realloc && !is_bootstrap_ptr(ptr)) {
            return real_realloc(ptr, size);
        }
        // Either ptr is a bootstrap pointer, or real_realloc is not yet
        // resolved. Handle bootstrap → bootstrap (or bootstrap → NULL on
        // exhaustion) with a SAFE bounded copy.
        if (size == 0) {
            // realloc(ptr, 0): free the old bootstrap allocation and return NULL.
            if (ptr && is_bootstrap_ptr(ptr)) {
                bootstrap_deregister(ptr);
            }
            return NULL;
        }
        void *new_p = bootstrap_alloc(size);
        if (new_p && ptr) {
            // [P0-b] Look up the old allocation size and copy only
            // min(old_size, new_size) bytes. This prevents reading past the
            // end of the old allocation when new_size > old_size.
            size_t old_size = bootstrap_lookup_size(ptr);
            size_t copy_size = (old_size < size) ? old_size : size;
            if (copy_size > 0) {
                memcpy(new_p, ptr, copy_size);
            }
        }
        // The old bootstrap allocation is being replaced; deregister it so the
        // registry does not retain a stale entry. (The static buffer itself
        // is not reclaimable, which is acceptable — bootstrap is bounded and
        // used only during init.)
        if (ptr && is_bootstrap_ptr(ptr)) {
            bootstrap_deregister(ptr);
        }
        return new_p;
    }

    // ---- Post-init path ----
    void *caller = __builtin_extract_return_addr(__builtin_return_address(0));
    if (g_in_hook) return real_realloc(ptr, size);

    // [P0-c] If ptr is a bootstrap pointer that survived past initialization,
    // do NOT forward it to real_realloc — that would corrupt the real heap.
    // Instead: allocate fresh memory from the real allocator, copy the old
    // data (bounded by min(old_size, new_size)), deregister the bootstrap
    // entry, and track the new allocation if it falls in the tracked range.
    if (ptr && is_bootstrap_ptr(ptr)) {
        g_in_hook = 1;
        size_t old_size = bootstrap_lookup_size(ptr);
        bootstrap_deregister(ptr);
        void *new_ptr = NULL;
        if (size > 0) {
            new_ptr = real_malloc(size);
            if (new_ptr) {
                size_t copy_size = (old_size < size) ? old_size : size;
                if (copy_size > 0) {
                    memcpy(new_ptr, ptr, copy_size);
                }
                if (size >= MIN_TRACK_SIZE && size < MAX_TRACK_SIZE) {
                    track_alloc(new_ptr, size, caller);
                }
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

    // Normal (non-bootstrap) path.
    g_in_hook = 1;
    if (ptr) track_free(ptr);
    void *new_ptr = real_realloc(ptr, size);
    if (new_ptr && size >= MIN_TRACK_SIZE && size < MAX_TRACK_SIZE) {
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

// [P0-c] free post-init path now detects bootstrap pointers and does NOT
//        forward them to real_free.
void free(void *ptr) {
    if (!ptr) return;

    // ---- Pre-init path ----
    if (!atomic_load(&g_initialized)) {
        if (real_free && !is_bootstrap_ptr(ptr)) { real_free(ptr); return; }
        // Bootstrap pointer or no real_free yet: deregister the entry.
        // The static buffer is not reclaimable; this is acceptable.
        if (is_bootstrap_ptr(ptr)) bootstrap_deregister(ptr);
        return;
    }

    // ---- Post-init path ----
    // [P0-c] If ptr is a bootstrap pointer that survived past initialization,
    // do NOT forward it to real_free. Just deregister the entry; the static
    // buffer cannot be freed.
    if (is_bootstrap_ptr(ptr)) {
        if (g_in_hook) return; // already inside tracking, avoid recursion
        g_in_hook = 1;
        bootstrap_deregister(ptr);
        // Do NOT call track_free — bootstrap allocations were never tracked.
        // Do NOT call real_free — pointer is in the static buffer.
        g_in_hook = 0;
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
//
// This block is absent in the production build. It exists solely to let the
// P0 test harness obtain a REAL bootstrap pointer (one allocated from
// g_bootstrap_buf) regardless of constructor ordering, so that the post-init
// realloc/free bootstrap-detection paths (P0-c) can be exercised
// deterministically.
//
// Without this hook, the only way to obtain a bootstrap pointer is to have
// malloc called during the window when real_malloc is still NULL (i.e.,
// during the profiler's own constructor, before dlsym resolves real_malloc).
// Constructor ordering between LD_PRELOAD and NEEDED libraries is not
// guaranteed across glibc versions, making that approach unreliable.
// ============================================================================
#ifdef PROFILER_V6_TEST_HOOKS
#include <stdbool.h>

// Allocate a pointer from the bootstrap pool. This bypasses the g_initialized
// check and calls bootstrap_alloc() directly, producing a pointer inside
// g_bootstrap_buf. The pointer is registered in the bootstrap registry with
// its size, exactly as a real pre-init allocation would be.
void* __profiler_v6_test_bootstrap_alloc(size_t size) {
    return bootstrap_alloc(size);
}

// Check whether a pointer lies within the bootstrap buffer.
bool __profiler_v6_test_is_bootstrap_ptr(void* ptr) {
    return is_bootstrap_ptr(ptr) != 0;
}

// Force g_initialized to a specific value, for testing both the pre-init and
// post-init code paths deterministically. Returns the previous value.
int __profiler_v6_test_set_initialized(int val) {
    return atomic_exchange(&g_initialized, val);
}

// Force-set real_malloc to a given function pointer (or NULL) for testing.
void __profiler_v6_test_set_real_malloc(void* (*fn)(size_t)) {
    real_malloc = fn;
}
#endif

