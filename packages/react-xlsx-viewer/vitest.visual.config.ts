/// <reference types="node" />
// Visual regression (test/visual): screenshots of the conformance corpus compared with committed baselines.
//   npm run test:visual            compare (CI: the Browser job)
//   npm run test:visual:update     rewrite the baselines (docs/visual-testing.md)
// The baselines are rendered in the Playwright container image that the Browser job uses, with the fonts it
// installs, so run both inside that image (scripts/visual.sh does it with Docker).
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

const executablePath = process.env['XLV_CHROMIUM'];

const config: ViteUserConfig = defineConfig({
  test: {
    include: ['test/visual/**/*.test.{ts,tsx}'],
    // One file, in order: the screenshots don't compete for the CPU.
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
        // Fixed device: 1× pixels, light scheme, no motion, one locale and time zone.
        contextOptions: { deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC' },
      }),
      viewport: { width: 1280, height: 800 },
      instances: [{ browser: 'chromium' }],
      screenshotFailures: false,
      expect: {
        toMatchScreenshot: {
          comparatorName: 'pixelmatch',
          // Anti-aliasing is ignored; at most 0.1 % of the pixels may differ beyond that.
          comparatorOptions: { threshold: 0.1, allowedMismatchedPixelRatio: 0.001 },
          // One baseline per screenshot, not per host OS: they are only valid in the CI image anyway.
          resolveScreenshotPath: ({ arg, ext, root, testFileDirectory, testFileName }) => `${root}/${testFileDirectory}/__screenshots__/${testFileName}/${arg}${ext}`,
        },
      },
    },
  },
});

export default config;
