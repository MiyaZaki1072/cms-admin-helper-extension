import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  zip: {
    // The sources zip (for AMO review) must hold only the public project:
    // no local CMS checkout, no AI/agent files, no test output.
    excludeSources: [
      'cms-server/**',
      'CLAUDE.md',
      'CLAUDE.local.md',
      'AGENTS.md',
      'GEMINI.md',
      '*Master Plan*.md',
      '.claude/**',
      '.cursor/**',
      '.codex/**',
      '.gemini/**',
      '.mcp.json',
      'test-results/**',
      'playwright-report/**',
      'screenshots/**',
      'coverage/**',
      '.env',
      '.env.*',
    ],
  },
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: ({ browser, mode }) => ({
    name: 'CMS Admin Helper',
    description: 'Tracker, bulk import, contest-day shortcuts and Bangkok time for the CMS v1.5 admin page.',
    permissions: ['storage', 'scripting', 'alarms', 'notifications'],
    // Asked for at runtime, for the one AWS origin the admin enters.
    optional_host_permissions: ['*://*/*'],
    // End-to-end test builds only: pre-grant the local dev server, since
    // Playwright cannot click the permission prompt.
    ...(mode === 'e2e' && { host_permissions: ['http://localhost:8889/*'] }),
    action: { default_title: 'CMS Admin Helper settings' },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'cms-admin-helper@miyazaki1072.github.io',
          // data_collection_permissions needs Firefox 140 (desktop) / 142 (Android).
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        gecko_android: { strict_min_version: '142.0' },
      },
    }),
  }),
});
