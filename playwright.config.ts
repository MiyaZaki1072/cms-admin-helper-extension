import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests: Chromium with the unpacked extension, against the local
 * CMS dev server (docs/dev-server.md) on http://localhost:8889.
 * Build first with `pnpm build:e2e` (done by `pnpm test:e2e`).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});
