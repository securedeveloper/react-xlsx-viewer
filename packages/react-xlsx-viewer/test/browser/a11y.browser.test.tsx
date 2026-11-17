// Automated accessibility audit (docs/api.md §11.3, docs/ux.md §9): axe-core in Chromium over each
// part of the viewer, in the light and the dark theme. The target is zero violations.
import axe from 'axe-core';
import { createElement, StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { commands } from 'vitest/browser';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { XlsxViewer } from '../../src/index';
import '../../src/styles.css';
import { bigWorkbook } from './fixtures';

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateColorScheme: (scheme: 'light' | 'dark') => Promise<void>;
  }
}

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
});
afterAll(async () => {
  await commands.emulateColorScheme('light');
});

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

async function mount(props: Parameters<typeof XlsxViewer>[0]): Promise<HTMLElement> {
  host = document.createElement('main');
  host.style.cssText = 'width: 900px; height: 600px;';
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root!.render(createElement(StrictMode, null, createElement(XlsxViewer, { style: { height: '100%' }, locale: 'en-US', ...props }))));
  await nextFrame();
  await nextFrame();
  return host;
}

const click = (r: number, c: number): void => {
  document.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 }));
  document.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
};

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/**
 * Runs axe over the viewer and fails with a readable list of violations. Cell text keeps the file's own
 * colours (docs/ux.md §9: the viewer doesn't change them), so colour contrast is checked on the chrome only.
 */
async function audit(el: HTMLElement): Promise<void> {
  const all = await axe.run(el, {
    resultTypes: ['violations'],
    runOnly: { type: 'tag', values: TAGS },
    rules: {
      'color-contrast': { enabled: false },
      // The test page itself (not the viewer) has no <h1>; the viewer is a component, not a page.
      'page-has-heading-one': { enabled: false },
    },
  });
  const chrome = await axe.run({ include: [el], exclude: [[`.xv-cell`]] } as axe.ElementContext, { resultTypes: ['violations'], runOnly: { type: 'rule', values: ['color-contrast'] } });
  const lines = [...all.violations, ...chrome.violations].flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}): ${n.target.join(' ')} ${n.failureSummary?.replace(/\s+/g, ' ') ?? ''}`));
  expect(lines).toEqual([]);
}

const workbook = {
  sheets: [
    {
      name: 'Sales',
      tabColor: 'FF4F4FB3',
      rows: [
        [{ value: 'Region', style: { font: { bold: true } } }, { value: 'Q1', style: { font: { bold: true } } }, { value: 'Q2', style: { font: { bold: true } } }, { value: 'Site' }],
        ['North', 120, 140, { value: 'Example', hyperlink: 'https://example.com/report' }],
        ['South', 90, { value: 0.25, style: { numFmt: '0%' } }, { value: 'Blocked', hyperlink: 'javascript:alert(1)' }],
        [{ value: 'Total', style: { font: { bold: true } } }, { formula: 'SUM(B2:B3)', value: 210 }, { formula: 'SUM(C2:C3)' }, { value: 'Go', hyperlink: { location: "'Notes'!A1" } }],
      ],
      merges: ['A6:B7'],
      rowProps: Object.assign([], { 4: { hidden: true } }),
      autoFilter: 'A1:C3',
    },
    { name: 'Notes', rows: [['A second sheet']] },
    { name: 'Secret', state: 'hidden' as const, rows: [['hidden']] },
  ],
};

describe.each(['light', 'dark'] as const)('axe, %s theme', (scheme) => {
  it('default grid, formula bar, sheet tabs and status bar', async () => {
    await commands.emulateColorScheme(scheme);
    const el = await mount({ source: workbook });
    expect(matchMedia('(prefers-color-scheme: dark)').matches).toBe(scheme === 'dark');
    await audit(el);
  });

  it('a range selection (status-bar summary)', async () => {
    await commands.emulateColorScheme(scheme);
    const el = await mount({ source: workbook, defaultSelection: { ranges: [{ start: { row: 1, col: 1 }, end: { row: 2, col: 2 } }], active: { row: 1, col: 1 } } });
    await audit(el);
  });

  it('frozen panes and merges on a large sheet', async () => {
    await commands.emulateColorScheme(scheme);
    const el = await mount({ source: bigWorkbook(200, 20) });
    const scroller = el.querySelector<HTMLElement>('.xv-scroll')!;
    scroller.scrollTop = 600;
    scroller.dispatchEvent(new Event('scroll'));
    await nextFrame();
    await audit(el);
  });

  it('a right-to-left sheet', async () => {
    await commands.emulateColorScheme(scheme);
    const wb = bigWorkbook(40, 6);
    wb.sheets[0]!.view = { rightToLeft: true, freeze: { rows: 1, cols: 1 } };
    const el = await mount({ source: wb });
    await audit(el);
  });

  it('the link chip: allowed, blocked and internal links', async () => {
    await commands.emulateColorScheme(scheme);
    const el = await mount({ source: workbook });
    for (const r of [1, 2, 3]) {
      click(r, 3);
      await nextFrame();
      expect(el.querySelector('.xv-link-chip')).not.toBeNull();
      await audit(el);
    }
  });

  it('hidden sheets shown and the shortcuts dialog', async () => {
    await commands.emulateColorScheme(scheme);
    const el = await mount({ source: workbook, showHiddenSheets: true });
    el.querySelector<HTMLButtonElement>('.xv-status-tools button:last-child')!.click();
    await nextFrame();
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    await audit(el);
  });

  it('loading and error states', async () => {
    await commands.emulateColorScheme(scheme);
    const el = await mount({ source: new Uint8Array([1, 2, 3, 4]), format: 'xlsx' });
    for (let i = 0; i < 20 && !el.querySelector('[role="alert"]'); i++) await nextFrame();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    await audit(el);
  });
});
