// Runs in real Chromium (vitest.browser.config.ts), where the viewer's grid,
// focus, keyboard and layout tests will live: jsdom has no layout, scrolling
// or real focus. For now it proves the toolchain: React renders the package
// in a real browser, without the jsdom shims.
import { createElement, StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useVersion, version } from '../../src/index';

function Probe() {
  return createElement('output', { 'data-testid': 'version' }, useVersion());
}

describe('react-xlsx-viewer in Chromium', () => {
  it('runs in a real browser, not jsdom', () => {
    expect(navigator.userAgent).toMatch(/Chrome\//);
    expect(navigator.userAgent).not.toMatch(/jsdom/);
  });

  it('renders with react-dom in StrictMode and lays out', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() => root.render(createElement(StrictMode, null, createElement(Probe))));
    const out = host.querySelector('[data-testid="version"]')!;
    expect(out.textContent).toBe(version);
    expect(out.getBoundingClientRect().height).toBeGreaterThan(0);
    root.unmount();
    host.remove();
  });
});
