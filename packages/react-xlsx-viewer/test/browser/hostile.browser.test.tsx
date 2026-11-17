// Stress and security files through the whole viewer in Chromium (docs/api.md §10, §11.3; docs/ux.md §6.2).
// Every file is generated at test time (hostile-files.ts). Each must fail safe: either the documented error
// message and code, or the content rendered as plain text, with nothing executed and nothing fetched.
import { createElement, StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LABELS, XlsxViewer } from '../../src/index';
import '../../src/styles.css';
import * as H from './hostile-files';

let root: Root | null = null;
let host: HTMLElement | null = null;
let opened: unknown[][] = [];
let violations: string[] = [];
const onViolation = (e: SecurityPolicyViolationEvent): void => {
  violations.push(`${e.violatedDirective} ${e.blockedURI}`);
};
beforeEach(() => {
  opened = [];
  violations = [];
  vi.spyOn(window, 'open').mockImplementation((...args: unknown[]) => {
    opened.push(args);
    return null;
  });
  document.addEventListener('securitypolicyviolation', onViolation);
  performance.clearResourceTimings();
});
afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  vi.restoreAllMocks();
  document.removeEventListener('securitypolicyviolation', onViolation);
  // Nothing from any file ran, and nothing was requested from outside the test server.
  expect((window as { __xlvPwned?: unknown }).__xlvPwned).toBeUndefined();
  expect(violations).toEqual([]);
  const foreign = performance.getEntriesByType('resource').filter((r) => !r.name.startsWith(location.origin));
  expect(foreign.map((r) => r.name)).toEqual([]);
});

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

interface Mounted {
  el: HTMLElement;
  errors: unknown[];
}

async function open(bytes: Uint8Array, props: Partial<Parameters<typeof XlsxViewer>[0]> = {}): Promise<Mounted> {
  const errors: unknown[] = [];
  host = document.createElement('div');
  host.style.cssText = 'width: 900px; height: 600px;';
  document.body.append(host);
  root = createRoot(host);
  const el = host;
  flushSync(() =>
    root!.render(createElement(StrictMode, null, createElement(XlsxViewer, { style: { height: '100%' }, locale: 'en-US', source: bytes, onError: (e) => errors.push(e), ...props }))),
  );
  await vi.waitFor(() => {
    if (!el.querySelector('[role="grid"], [role="alert"]')) throw new Error('still loading');
  }, { timeout: 15_000, interval: 20 });
  await nextFrame();
  return { el, errors };
}

/** The error screen (docs/ux.md §6.2): the message, the code under Details, and no grid. */
function expectError(m: Mounted, message: string, code: string, details?: Record<string, unknown>): void {
  const alert = m.el.querySelector('[role="alert"]')!;
  expect(alert).not.toBeNull();
  expect(alert.querySelector('.xv-error')!.textContent).toBe(message);
  expect(alert.querySelector('code')!.textContent).toBe(code);
  expect(m.el.querySelector('[role="grid"]')).toBeNull();
  expect(m.errors).toHaveLength(1);
  const e = m.errors[0] as { code?: string; details?: Record<string, unknown> };
  expect(e.code).toBe(code);
  if (details) expect(e.details).toMatchObject(details);
}

const cell = (el: HTMLElement, r: number, c: number): HTMLElement => el.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)!;
const select = async (el: HTMLElement, r: number, c: number): Promise<void> => {
  cell(el, r, c).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 }));
  cell(el, r, c).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
  await nextFrame();
};

describe('limits: bounded memory and CPU', () => {
  it('zip bomb (compression ratio above 1000) stops while inflating', async () => {
    expectError(await open(await H.zipBomb()), DEFAULT_LABELS.errors.tooLarge('maxRatio'), 'LIMIT_EXCEEDED', { limit: 'maxRatio' });
  });

  it('an entry that declares 4 GB is refused before inflating', async () => {
    expectError(await open(await H.declaredHugeEntry()), DEFAULT_LABELS.errors.tooLarge('maxEntryBytes'), 'LIMIT_EXCEEDED', { limit: 'maxEntryBytes' });
  });

  it('more shared strings than the app allows', async () => {
    const m = await open(await H.manySharedStrings(2_000), { readOptions: { limits: { maxSharedStrings: 1_000 } } });
    expectError(m, DEFAULT_LABELS.errors.tooLarge('maxSharedStrings'), 'LIMIT_EXCEEDED', { limit: 'maxSharedStrings', max: 1_000 });
  });

  it('many shared strings within the default limits open normally', async () => {
    const m = await open(await H.manySharedStrings(100_000));
    expect(cell(m.el, 0, 1).textContent).toBe('s99999');
  });

  it('a 1,000,000-character string renders in its cell, clipped, and the DOM stays bounded', async () => {
    const m = await open(await H.hugeSharedString(1_000_000));
    const a1 = cell(m.el, 0, 0);
    expect(a1.textContent!.length).toBe(1_000_000);
    // The text spills into the empty neighbours, but the cell box stays one column wide.
    expect(a1.getBoundingClientRect().width).toBeLessThan(100);
    expect(m.el.querySelectorAll('[role="gridcell"]').length).toBeLessThan(2_000);
  });

  it('a merge over the whole sheet and 20,000 more: the grid stays bounded and usable', async () => {
    const m = await open(await H.hugeMerges(20_000));
    expect(cell(m.el, 0, 0).textContent).toBe('everything');
    expect(m.el.querySelectorAll('[role="gridcell"]').length).toBeLessThan(2_000);
    const scroller = m.el.querySelector<HTMLElement>('.xv-scroll')!;
    scroller.scrollTop = scroller.scrollHeight;
    scroller.dispatchEvent(new Event('scroll'));
    await nextFrame();
    expect(m.el.querySelectorAll('[role="gridcell"]').length).toBeLessThan(2_000);
  });

  it('60,000 distinct cell formats', async () => {
    const m = await open(await H.manyStyles(60_000));
    expect(cell(m.el, 0, 1).textContent).toBe('1');
    expect(m.el.querySelectorAll('[role="gridcell"]').length).toBeLessThan(2_000);
  });

  it('XML nested deeper than maxXmlDepth (64)', async () => {
    expectError(await open(await H.deepXml(200)), DEFAULT_LABELS.errors.tooLarge('maxXmlDepth'), 'LIMIT_EXCEEDED', { limit: 'maxXmlDepth' });
  });
});

describe('malformed and hostile parts', () => {
  it.each([
    ['XXE (external entity)', H.xxe, DEFAULT_LABELS.errors.damaged, 'XML_DTD_FORBIDDEN'],
    ['billion laughs (nested entities)', H.billionLaughs, DEFAULT_LABELS.errors.damaged, 'XML_DTD_FORBIDDEN'],
    ['unterminated XML', H.malformedXml, DEFAULT_LABELS.errors.damaged, 'XML_MALFORMED'],
    ['CRC-32 mismatch', H.badCrc, DEFAULT_LABELS.errors.damaged, 'ZIP_CRC_MISMATCH'],
    ['encrypted zip entry', H.encryptedEntry, DEFAULT_LABELS.errors.damaged, 'ZIP_ENCRYPTED'],
    ['unsupported compression method', H.unsupportedMethod, DEFAULT_LABELS.errors.damaged, 'ZIP_UNSUPPORTED_METHOD'],
    ['truncated file', H.truncated, DEFAULT_LABELS.errors.damaged, 'ZIP_INVALID'],
    ['a zip without a workbook', H.zipWithoutWorkbook, DEFAULT_LABELS.errors.notWorkbook, 'NOT_XLSX'],
    ['a legacy .xls / encrypted workbook signature', H.cfb, DEFAULT_LABELS.errors.xls, 'UNSUPPORTED_FORMAT'],
  ] as const)('%s', async (_, make, message, code) => {
    expectError(await open(await make()), message, code);
  });
});

describe('content: rendered as text, never run', () => {
  it('hostile hyperlink targets are blocked, at render and at open time', async () => {
    const m = await open(await H.hostileLinks());
    for (let r = 0; r < H.HOSTILE_TARGETS.length; r++) {
      await select(m.el, r, 0);
      expect(cell(m.el, r, 0).textContent).toBe(`Click me ${r + 1}`);
      const chip = m.el.querySelector('.xv-link-chip')!;
      expect(chip.textContent).toBe(DEFAULT_LABELS.linkBlocked);
      expect(chip.querySelector('a, button')).toBeNull();
      // Alt+Enter opens the active cell's link: nothing happens for a blocked one.
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', altKey: true, bubbles: true, cancelable: true }));
      await nextFrame();
    }
    expect(opened).toEqual([]);
    // No element anywhere in the viewer carries a script-capable URL.
    for (const a of m.el.querySelectorAll('[href]')) expect(a.getAttribute('href')).toMatch(/^(https?:|mailto:)/);
  });

  it('a look-alike link shows its real target in the chip before it opens', async () => {
    const m = await open(await H.hostileLinks());
    const r = H.HOSTILE_TARGETS.length;
    await select(m.el, r, 0);
    expect(cell(m.el, r, 0).textContent).toBe('https://bank.example/login');
    const chip = m.el.querySelector('.xv-link-chip')!;
    expect(chip.querySelector('.xv-link-url')!.textContent).toBe('https://attacker.example/phish');
    expect(chip.querySelector('strong')!.textContent).toBe('attacker.example');
    const a = chip.querySelector<HTMLAnchorElement>('a')!;
    expect(a.rel).toBe('noopener noreferrer');
    a.click();
    expect(opened).toEqual([['https://attacker.example/phish', '_blank', 'noopener,noreferrer']]);
  });

  it('external workbook links, remote images and data connections: cached values shown, nothing fetched, a notice lists them', async () => {
    const m = await open(await H.externalTargets());
    expect(cell(m.el, 0, 0).textContent).toBe('84');
    const notice = m.el.querySelector('.xv-notice')!;
    expect(notice.getAttribute('aria-label')).toBe(DEFAULT_LABELS.notShownTitle);
    expect([...notice.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'The workbook contains external links, which are not read.',
      'The workbook contains data connections, which are not read.',
      'The workbook contains drawings (charts, images, shapes), which are not read.',
    ]);
    expect(m.el.querySelector('img, iframe, object, embed')).toBeNull();
    // The formula bar shows the formula as text; it is never evaluated.
    expect(m.el.querySelector<HTMLTextAreaElement>('.xv-formula')!.value).toBe('=[1]Sheet1!A1*2');
  });

  it('script-like text in cells, sheet names, number-format literals and font names stays text', async () => {
    const m = await open(await H.scriptLikeContent());
    expect(cell(m.el, 0, 0).textContent).toBe(H.SCRIPTY);
    expect(cell(m.el, 0, 1).textContent).toBe('<img src=x onerror=window.__xlvPwned=1>5');
    expect(m.el.querySelector('[role="grid"]')!.getAttribute('aria-label')).toBe(DEFAULT_LABELS.sheet('<b>x</b>'));
    expect(m.el.querySelector('[role="tab"]')!.textContent).toBe('<b>x</b>');
    expect(m.el.querySelector('img, script, b, iframe, object, embed, style, link')).toBeNull();
    // A font name that tries to close the declaration is one quoted font-family value, so it can't add a background.
    const font = cell(m.el, 0, 2).querySelector<HTMLElement>('.xv-text')!;
    expect(font.style.background).toBe('');
    expect(getComputedStyle(document.body).backgroundImage).toBe('none');
    expect(getComputedStyle(cell(m.el, 0, 2)).backgroundImage).toBe('none');
  });
});
