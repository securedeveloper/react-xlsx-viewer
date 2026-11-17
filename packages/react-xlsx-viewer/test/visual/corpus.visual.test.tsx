// Visual regression: every visible sheet of the conformance corpus, screenshotted and compared with the
// reviewed baselines in __screenshots__ (docs/visual-testing.md). Run with `npm run test:visual`.
import { createElement, StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { XlsxViewer } from '../../src/index';
import '../../src/styles.css';
import { CORPUS } from '../fixtures/corpus';

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
});

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

// No caret, no transitions, and one pinned chrome font (the sheet's fonts come from the file and the font map).
const STYLE = `
  * { transition: none !important; animation: none !important; caret-color: transparent !important; }
  body { margin: 0; background: #ffffff; }
  .xv-viewer { --xv-font: 'Liberation Sans', sans-serif; }
`;

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sheet';

describe('corpus screenshots', () => {
  for (const f of CORPUS.filter((c) => c.file !== '99-kitchen-sink.xlsx')) {
    it(f.file, async () => {
      if (!document.getElementById('xv-visual')) document.head.append(Object.assign(document.createElement('style'), { id: 'xv-visual', textContent: STYLE }));
      host = document.createElement('div');
      host.style.cssText = 'width: 960px; height: 600px;';
      host.dataset['testid'] = 'viewer';
      document.body.append(host);
      root = createRoot(host);
      const el = host;
      const bytes = await f.load();
      flushSync(() => root!.render(createElement(StrictMode, null, createElement(XlsxViewer, { style: { height: '100%' }, locale: 'en-US', source: bytes }))));
      await vi.waitFor(() => {
        if (!el.querySelector('[role="grid"]')) throw new Error('still loading');
      }, { timeout: 10_000, interval: 20 });
      await document.fonts.ready;
      const tabs = [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      for (const [i, tab] of tabs.entries()) {
        tab.click();
        // Auto-fit rows and the margin settle over a few frames.
        for (let k = 0; k < 4; k++) await nextFrame();
        await expect.element(page.getByTestId('viewer')).toMatchScreenshot(`${f.file.replace(/\.xlsx$/, '')}/${i + 1}-${slug(tab.textContent ?? '')}`);
      }
    });
  }
});
