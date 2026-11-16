import { defineConfig, type ViteUserConfig } from 'vitest/config';

const config: ViteUserConfig = defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
    // test/browser runs in Chromium (vitest.browser.config.ts, npm run test:browser).
    exclude: ['test/browser/**', '**/node_modules/**'],
  },
});

export default config;
