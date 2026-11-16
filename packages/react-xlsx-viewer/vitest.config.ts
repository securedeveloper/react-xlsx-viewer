import { defineConfig, type ViteUserConfig } from 'vitest/config';

const config: ViteUserConfig = defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
    // test/browser and test/perf run in Chromium (npm run test:browser, npm run perf).
    exclude: ['test/browser/**', 'test/perf/**', '**/node_modules/**'],
  },
});

export default config;
