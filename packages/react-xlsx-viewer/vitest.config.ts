import { defineConfig, type ViteUserConfig } from 'vitest/config';

const config: ViteUserConfig = defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
    // test/browser, test/visual and test/perf run in Chromium (npm run test:browser, test:visual, perf).
    exclude: ['test/browser/**', 'test/visual/**', 'test/perf/**', '**/node_modules/**'],
  },
});

export default config;
