# STEP A-3.21 Review Artifacts

Unify Production Normal Realloc Logic and TSan Test Path.

## What changed from A-3.20

A-3.20 had a DUPLICATE of the normal realloc tracking logic in the test hook.
A-3.21 extracts this logic into a shared static function `normal_realloc_tracked()`
that BOTH production and test call. T12 now tests the EXACT SAME code as production.

## Key architectural principle

Tests must exercise the SAME production code, not a simulated copy.

## Test results

```
Plain suite: 121 tests, exit 0
TSan: exit 0, 0 data races
  T8:  RAN    T9:  RAN    T10: RAN
  T11: SKIPPED (expected — requires interposition)
  T12: RAN    (tests SAME production code via shared function)
Node smoke: exit 0
PROD isolation: verified
```
