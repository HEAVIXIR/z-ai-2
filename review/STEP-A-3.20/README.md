# STEP A-3.20 Review Artifacts

Restore Normal Realloc Failure Coverage Without Losing TSan Bootstrap Coverage.

## What changed from A-3.19

- T10 (bootstrap realloc): KEPT unchanged
- T11 (NEW): Normal realloc failure injection — restored from A-3.18, runs in Plain Suite
- T12 (NEW): Normal realloc tracking via direct hook — TSan coverage of track_free/track_alloc

## Test results

```
Plain suite: 121 tests, exit 0
TSan: exit 0, 0 data races
  T8:  RAN    T9:  RAN    T10: RAN
  T11: SKIPPED (expected — requires interposition)
  T12: RAN    (direct hook, TSan coverage of normal realloc tracking)
Node smoke: exit 0
PROD isolation: verified
```
