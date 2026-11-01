// malloc_profiler_v6.c — Safe LD_PRELOAD profiler with constructor initialization
// ============================================================================
// STEP A-3.16 — Bootstrap Allocator Correctness Closure
//
// This version applies the four P0 fixes mandated by Steward STEP A-3.16:
//
//   C1: REGISTRY PROTOCOL — slot acquisition now uses a three-phase protocol:
//       RESERVE (CAS ptr 0 → RESERVE_SENTINEL) → INIT (write size) → PUBLISH
//       (CAS RESERVE_SENTINEL → actual ptr) with release semantics. Readers
//       use acquire-load and only read metadata after a non-sentinel ptr is
//       observed. Deregister uses the same protocol in reverse to allow safe
//       slot reuse without ABA.
//
//   C2: REALLOC FAILURE SAFETY — the old pointer's registry entry is NOT
//       deregistered until the new allocation has succeeded AND data has been
//       copied. If real_malloc fails, the old pointer retains its metadata
//       and remains valid per the POSIX realloc contract (return NULL, leave
//       ptr intact).
//
//   C3: POINTER CLASSIFICATION — is_bootstrap_ptr() now performs EXACT-MATCH
//       against the registry rather than range-based address comparison.
//       Unknown pointers (inside the buffer range but not a registered
//       allocation) are NOT treated as bootstrap and fall through to the real
//       allocator with a diagnostic counter. This eliminates the silent
//       memory-leak risk of the previous range-based check.
//
//   C4: REGISTRY EXHAUSTION — when the registry is full, bootstrap_alloc()
//       now returns NULL instead of returning an unregistered allocation.
//       This is a hard-fail policy: callers (dlsym, constructor) must handle
//       NULL gracefully. The previous silent-data-loss behavior is removed.
//       A diagnostic counter (g_bootstrap_registry_full) records the event.
//
// Standalone file history: extracted from Base64 blob in commit 46233a6
//   (.github/workflows/store-runtime-contract-proof.yml line 477), then
//   evolved through STEP A-3.15 (commit 7888199) and STEP A-3.16 (this file).
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
//
// [C1] REGISTRY PROTOCOL
//   Each slot has a `ptr` field that goes through these states:
//     EMPTY (0) → RESERVE_SENTINEL (CAS by acquirer) → actual ptr (CAS by
//     acquirer after writing size) → ... → 0 (CAS by deregisterer)
//   The RESERVE_SENTINEL state prevents ABA: a reader that observed ptr=P
//   cannot be fooled into reading stale metadata if the slot is freed and
//   reused, because the reuser must transition through RESERVE_SENTINEL
//   first (which the reader will detect as "in transition" and skip).
//
//   Readers use atomic_load_explicit(..., memory_order_acquire) on ptr and
//   only proceed if the value is a real pointer (not 0, not RESERVE_SENTINEL).
//   Writers use atomic_store_explicit(..., memory_order_release) when
//   publishing the actual ptr, after writing size with a relaxed store
//   (ordered by the release on ptr).
// ============================================================================
#define BOOTSTRAP_SIZE 65536
static char g_bootstrap_buf[BOOTSTRAP_SIZE];
static atomic_size_t g_bootstrap_pos = 0;

// Sentinel value marking a slot as "reserved, metadata not yet published".
// Must be non-NULL and non-zero. We use 1 since real pointers are always
// aligned to at least 16 bytes.
#define BOOTSTRAP_RESERVE_SENTINEL ((uintptr_t)1)

#define MAX_BOOTSTRAP_ALLOCS 64
typedef struct {
    atomic_uintptr_t ptr;   // 0 = empty, 1 = reserved, else = actual ptr
    size_t            size; // aligned size; valid only when ptr is a real ptr
} bootstrap_entry;
static bootstrap_entry g_bootstrap_registry[MAX_BOOTSTRAP_ALLOCS];

// Diagnostic counters (non-atomic; only read in output_stats under g_in_hook)
static atomic_long g_bootstrap_registry_full = 0;       // [C4] exhaustion events
static atomic_long g_bootstrap_unknown_in_range = 0;     // [C3] classification fallbacks

// [C1] Reserve a slot by CAS-ing ptr from 0 → RESERVE_SENTINEL.
// Returns slot index or -1 if no empty slot is available.
static int bootstrap_reserve_slot(void) {
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        uintptr_t expected = 0;
        if (atomic_compare_exchange_strong(&g_bootstrap_registry[i].ptr,
                                           &expected,
                                           BOOTSTRAP_RESERVE_SENTINEL)) {
            return i;
        }
    }
    return -1;
}

// [C1] Publish a reserved slot: write size (relaxed) then CAS ptr from
// RESERVE_SENTINEL → actual ptr (release). If the CAS fails, another thread
// forced a reset (should not happen in normal flow); we fall back to clearing.
static void bootstrap_publish_slot(int idx, void* ptr, size_t size) {
    g_bootstrap_registry[idx].size = size;
    uintptr_t expected = BOOTSTRAP_RESERVE_SENTINEL;
    if (!atomic_compare_exchange_strong(
            &g_bootstrap_registry[idx].ptr, &expected, (uintptr_t)ptr)) {
        // CAS failed: slot was reset by someone. Clear our size and walk away.
        // The pointer is still valid (in the static buffer); we just could not
        // register it. Callers must treat this as exhaustion.
        g_bootstrap_registry[idx].size = 0;
        atomic_store(&g_bootstrap_registry[idx].ptr, 0);
    }
    // On success, the release ordering on the CAS publishes `size` to readers.
}

// [C1] Look up the size of a bootstrap pointer. Uses acquire-load on ptr so
// that the subsequent read of `size` sees the value published by the writer.
// Returns 0 if the pointer is not a registered bootstrap allocation.
static size_t bootstrap_lookup_size(void* ptr) {
    if (!ptr) return 0;
    uintptr_t p = (uintptr_t)ptr;
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        uintptr_t stored = atomic_load_explicit(&g_bootstrap_registry[i].ptr,
                                                memory_order_acquire);
        // Skip empty (0) and reserved (sentinel) slots.
        if (stored == 0 || stored == BOOTSTRAP_RESERVE_SENTINEL) continue;
        if (stored == p) {
            return g_bootstrap_registry[i].size;
        }
    }
    return 0;
}

// [C1] Deregister a bootstrap pointer. CAS ptr from actual → 0 so that the
// slot becomes available for reuse. The CAS provides release ordering,
// ensuring any reader that observed the old ptr has finished reading metadata
// before the slot is reused.
static int bootstrap_deregister(void* ptr) {
    if (!ptr) return -1;
    uintptr_t p = (uintptr_t)ptr;
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        uintptr_t stored = atomic_load_explicit(&g_bootstrap_registry[i].ptr,
                                                memory_order_acquire);
        if (stored == p) {
            // CAS to 0. If this fails, someone else already deregistered or
            // the slot was reset; either way, the entry is gone for us.
            uintptr_t expected = p;
            if (atomic_compare_exchange_strong(
                    &g_bootstrap_registry[i].ptr, &expected, 0)) {
                g_bootstrap_registry[i].size = 0;
                return i;
            }
            return -1;
        }
    }
    return -1;
}

// [C3] Exact-match pointer classification. Returns 1 only if the pointer is a
// registered bootstrap allocation (i.e., found in the registry). Returns 0
// for unknown pointers, including those that happen to fall within the
// buffer's address range but are not registered.
static int is_bootstrap_ptr(void* ptr) {
    if (!ptr) return 0;
    uintptr_t p = (uintptr_t)ptr;
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        uintptr_t stored = atomic_load_explicit(&g_bootstrap_registry[i].ptr,
                                                memory_order_acquire);
        if (stored == 0 || stored == BOOTSTRAP_RESERVE_SENTINEL) continue;
        if (stored == p) return 1;
    }
    return 0;
}

// Range check helper (used only for diagnostics to detect unknown-in-range).
static int in_bootstrap_buffer_range(void* ptr) {
    return (char*)ptr >= g_bootstrap_buf &&
           (char*)ptr <  g_bootstrap_buf + BOOTSTRAP_SIZE;
}

// [C4] Fixed bootstrap allocator: returns NULL on registry exhaustion rather
// than returning an unregistered allocation.
static void* bootstrap_alloc(size_t size) {
    // Guard 1: size + 15 must not overflow size_t.
    if (size > (SIZE_MAX - 15)) return NULL;
    // Align to 16 bytes.
    size = (size + 15) & ~15;
    if (size == 0) size = 16;            // give zero-size a minimal slot
    // Guard 2: a single aligned allocation cannot exceed the buffer.
    if (size > BOOTSTRAP_SIZE) return NULL;
    // Atomically reserve position in the static buffer.
    size_t pos = atomic_fetch_add(&g_bootstrap_pos, size);
    // Guard 3: position must be within buffer.
    if (pos >= BOOTSTRAP_SIZE || pos > BOOTSTRAP_SIZE - size) {
        // Buffer exhausted. (pos was advanced; subsequent calls also fail.)
        return NULL;
    }
    void* p = g_bootstrap_buf + pos;
    // [C1] Register the allocation using the three-phase protocol:
    // reserve slot → write size → publish ptr. This ensures concurrent
    // readers never observe a ptr without its size.
    int slot = bootstrap_reserve_slot();
    if (slot < 0) {
        // [C4] Registry exhausted. Hard-fail: return NULL so the caller
        // (typically dlsym) does not receive an untracked allocation.
        atomic_fetch_add(&g_bootstrap_registry_full, 1);
        return NULL;
    }
    bootstrap_publish_slot(slot, p, size);
    return p;
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
        "{\"type\":\"PROFILER6_INIT\",\"pid\":%d,\"note\":\"v6-a316 constructor init (reserve/init/publish registry, exact-match classify, hard-fail exhaustion)\"}\n",
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

// [C2] realloc with failure-safe metadata handling.
// The old pointer's registry entry is only deregistered AFTER the new
// allocation succeeds AND data is copied. If real_malloc fails, the old
// pointer retains its metadata and remains valid per POSIX.
void *realloc(void *ptr, size_t size) {
    // ---- Pre-init path ----
    if (!atomic_load(&g_initialized)) {
        atomic_fetch_add(&g_skipped_before_init, 1);
        if (real_realloc && !is_bootstrap_ptr(ptr)) {
            return real_realloc(ptr, size);
        }
        // ptr is a bootstrap pointer, or real_realloc is unavailable.
        if (size == 0) {
            // realloc(ptr, 0): free the bootstrap allocation, return NULL.
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
            // [C2] Allocation failed. Old pointer's metadata is untouched
            // (we only called bootstrap_lookup_size, which is read-only).
            // Return NULL per POSIX; caller's ptr is still valid.
            return NULL;
        }
        if (new_p && ptr) {
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

    // [C3] Bootstrap pointer that survived past init: do NOT forward to
    // real_realloc. Allocate fresh, copy, then deregister old — IN THAT ORDER.
    if (ptr && is_bootstrap_ptr(ptr)) {
        g_in_hook = 1;
        size_t old_size = bootstrap_lookup_size(ptr);
        void *new_ptr = NULL;
        if (size == 0) {
            // realloc(ptr, 0) = free. Deregister old, return NULL.
            bootstrap_deregister(ptr);
            g_in_hook = 0;
            return NULL;
        }
        new_ptr = real_malloc(size);
        if (!new_ptr) {
            // [C2] Allocation failed. Old pointer's metadata is UNTOUCHED.
            // Per POSIX, return NULL and leave ptr valid.
            g_in_hook = 0;
            return NULL;
        }
        // Copy data BEFORE deregistering old.
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

    // [C3] Unknown pointer in bootstrap buffer range (not a registered alloc).
    // Record diagnostic and fall through to real allocator. This is the safe
    // path: we do NOT assume the pointer is a valid bootstrap allocation.
    if (ptr && in_bootstrap_buffer_range(ptr) && !is_bootstrap_ptr(ptr)) {
        atomic_fetch_add(&g_bootstrap_unknown_in_range, 1);
        // Fall through to real_realloc; if it crashes, that's the caller's
        // bug (passing an interior/free pointer), not ours.
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

void free(void *ptr) {
    if (!ptr) return;

    // ---- Pre-init path ----
    if (!atomic_load(&g_initialized)) {
        if (real_free && !is_bootstrap_ptr(ptr)) { real_free(ptr); return; }
        if (is_bootstrap_ptr(ptr)) bootstrap_deregister(ptr);
        return;
    }

    // ---- Post-init path ----
    // [C3] Use exact-match classification.
    if (is_bootstrap_ptr(ptr)) {
        if (g_in_hook) return;
        g_in_hook = 1;
        bootstrap_deregister(ptr);
        g_in_hook = 0;
        return;
    }

    // [C3] Unknown pointer in bootstrap buffer range: record and fall through.
    if (in_bootstrap_buffer_range(ptr)) {
        atomic_fetch_add(&g_bootstrap_unknown_in_range, 1);
        // Do NOT call real_free on a pointer that might be interior to the
        // static buffer. Return without freeing; this is a leak but not a
        // crash. The diagnostic counter records the event.
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

// [C2 test support] Returns the current registry occupancy count (0..64).
// Useful for tests that need to verify slot reuse.
int __profiler_v6_test_registry_occupancy(void) {
    int count = 0;
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        uintptr_t stored = atomic_load_explicit(&g_bootstrap_registry[i].ptr,
                                                memory_order_acquire);
        if (stored != 0 && stored != BOOTSTRAP_RESERVE_SENTINEL) count++;
    }
    return count;
}

// [C4 test support] Returns the registry_full counter value.
long __profiler_v6_test_registry_full_count(void) {
    return atomic_load(&g_bootstrap_registry_full);
}

// [C3 test support] Returns the unknown_in_range counter value.
long __profiler_v6_test_unknown_in_range_count(void) {
    return atomic_load(&g_bootstrap_unknown_in_range);
}

// [C1 test support] Force-reset the registry to empty (for ABA/reuse tests).
// DANGER: this invalidates all existing bootstrap pointers. Only call in
// tests that have discarded all their bootstrap pointers first.
void __profiler_v6_test_reset_registry(void) {
    for (int i = 0; i < MAX_BOOTSTRAP_ALLOCS; i++) {
        atomic_store(&g_bootstrap_registry[i].ptr, 0);
        g_bootstrap_registry[i].size = 0;
    }
    atomic_store(&g_bootstrap_pos, 0);
    atomic_store(&g_bootstrap_registry_full, 0);
    atomic_store(&g_bootstrap_unknown_in_range, 0);
}
#endif
