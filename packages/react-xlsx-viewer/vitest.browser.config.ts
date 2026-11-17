/// <reference types="node" />
// Real-browser tests (test/browser) with Vitest browser mode and Playwright Chromium.
//   npm run test:browser
// XLV_CHROMIUM points Playwright at a local Chromium binary instead of its own download.
import { playwright } from '@vitest/browser-playwright';
import type { BrowserCommand } from 'vitest/node';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

const executablePath = process.env['XLV_CHROMIUM'];

/** Switches prefers-color-scheme for the page, so the axe audit covers the dark theme (test/browser/a11y). */
const emulateColorScheme: BrowserCommand<['light' | 'dark']> = async (ctx, scheme) => {
  if (ctx.provider.name !== 'playwright') throw new Error('emulateColorScheme needs the Playwright provider');
  await ctx.page.emulateMedia({ colorScheme: scheme });
};

const config: ViteUserConfig = defineConfig({
  test: {
    include: ['test/browser/**/*.test.{ts,tsx}'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(executablePath ? { launchOptions: { executablePath } } : {}),
      instances: [{ browser: 'chromium' }],
      screenshotFailures: false,
      commands: { emulateColorScheme },
    },
  },
});

export default config;
