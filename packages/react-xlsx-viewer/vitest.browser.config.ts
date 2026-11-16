/// <reference types="node" />
// Real-browser tests (test/browser) with Vitest browser mode and Playwright Chromium.
//   npm run test:browser
// XLV_CHROMIUM points Playwright at a local Chromium binary instead of its own download.
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

const executablePath = process.env['XLV_CHROMIUM'];

const config: ViteUserConfig = defineConfig({
  test: {
    include: ['test/browser/**/*.test.{ts,tsx}'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(executablePath ? { launchOptions: { executablePath } } : {}),
      instances: [{ browser: 'chromium' }],
      screenshotFailures: false,
    },
  },
});

export default config;
