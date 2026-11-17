// Real files: every workbook of javascript-excel's conformance corpus (test/fixtures/corpus) opens in the
// viewer, through the same read path as a user's file, and every visible sheet renders without errors.
import { createElement, StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { XlsxViewer } from '../../src/index';
import '../../src/styles.css';
import { CORPUS, sha256 } from '../fixtures/corpus';

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  vi.restoreAllMocks();
});

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

describe('conformance corpus', () => {
  it('has the files the manifest lists, unchanged', async () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(19);
    for (const f of CORPUS) expect(await sha256(await f.load()), f.file).toBe(f.sha256);
  });

  it.each(CORPUS.map((f) => [f.file, f] as const))('%s opens and every visible sheet renders', async (_, f) => {
    const consoleErrors: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => consoleErrors.push(a));
    const errors: unknown[] = [];
    const warnings: string[] = [];
    host = document.createElement('div');
    host.style.cssText = 'width: 900px; height: 600px;';
    document.body.append(host);
    root = createRoot(host);
    const el = host;
    const bytes = await f.load();
    flushSync(() =>
      root!.render(
        createElement(StrictMode, null, createElement(XlsxViewer, { style: { height: '100%' }, locale: 'en-US', source: bytes, onError: (e) => errors.push(e), onWarning: (w) => warnings.push(w.code) })),
      ),
    );
    await vi.waitFor(() => {
      if (!el.querySelector('[role="grid"], [role="alert"]')) throw new Error('still loading');
    }, { timeout: 10_000, interval: 20 });
    expect(errors).toEqual([]);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    const tabs = [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.length).toBeGreaterThan(0);
    for (const tab of tabs) {
      tab.click();
      await nextFrame();
      const grid = el.querySelector('[role="grid"]')!;
      expect(grid.getAttribute('aria-label')).toBe(`Sheet: ${tab.textContent}`);
      expect(grid.querySelectorAll('[role="gridcell"]').length).toBeGreaterThan(0);
    }
    // The only warnings a corpus file may give are about content the viewer doesn't show.
    expect(warnings.filter((w) => w !== 'UNSUPPORTED_PART')).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
