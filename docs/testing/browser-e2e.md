# HEAVIX browser E2E

The browser suite is Playwright Test, separate from the existing Vitest configuration smoke tests.

## Scope in the first slice

- Public route smoke: home, categories, listings, rentals, brands, store and login.
- Persian document language and RTL direction.
- Uncaught browser runtime errors during initial route rendering.
- Horizontal overflow at 320px, 768px and 1280px viewport widths.
- Keyboard activation of desktop rental navigation and the mobile menu.
- Anonymous admin API denial (401).

## Reproducible execution

- Playwright Test is pinned in `package.json` and `bun.lock`.
- Bun is pinned to 1.4.4 by the repository CI workflow.
- CI installs only Chromium and its operating-system dependencies.
- The test web server runs the already-built Next.js app against disposable CI PostgreSQL databases and seeded synthetic fixtures.
- The suite must never receive Preview or Production database credentials.

Run locally after building the app and configuring disposable local test databases:

```bash
bun run build
bunx playwright install chromium
bun run test:e2e
```

CI runs with one worker, retries once, and retains bounded HTML/trace diagnostics only on failure.
