/// <reference types="node" />
// The Performance harness (docs/api.md §9): test/perf in Chromium.
//   npm run perf          writes perf-results.json (and prints a table)
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

const executablePath = process.env['XLV_CHROMIUM'];

const config: ViteUserConfig = defineConfig({
  test: {
    include: ['test/perf/**/*.test.{ts,tsx}'],
    testTimeout: 600_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(executablePath ? { launchOptions: { executablePath } } : {}),
      instances: [{ browser: 'chromium', viewport: { width: 1280, height: 800 } }],
      screenshotFailures: false,
    },
  },
});

export default config;
