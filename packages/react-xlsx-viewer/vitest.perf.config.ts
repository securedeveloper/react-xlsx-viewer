/// <reference types="node" />
// The Performance harness (docs/api.md §9): test/perf in Chromium.
//   npm run perf          writes perf-results.json (and prints a table)
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, type ViteUserConfig } from 'vitest/config';
import type { BrowserCommandContext } from 'vitest/node';

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
      // Heap per file (docs/api.md §9): a full GC, then the page's V8 heap, over the Chrome DevTools Protocol.
      commands: {
        heapUsed: async (ctx: BrowserCommandContext): Promise<number> => {
          const cdp = await ctx.page.context().newCDPSession(ctx.page);
          try {
            await cdp.send('HeapProfiler.collectGarbage');
            const usage = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
            return usage.usedSize;
          } finally {
            await cdp.detach();
          }
        },
      },
    },
  },
});

export default config;
