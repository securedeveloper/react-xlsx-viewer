// The grid in real Chromium: layout, sticky panes, scrolling and focus, which jsdom does not have.
import { createElement, StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LABELS, XlsxViewer } from '../../src/index';
import '../../src/styles.css';
import { bigWorkbook } from './fixtures';

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
});

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

function mount(props: Parameters<typeof XlsxViewer>[0]): HTMLElement {
  host = document.createElement('div');
  host.style.cssText = 'width: 900px; height: 600px;';
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root!.render(createElement(StrictMode, null, createElement(XlsxViewer, { style: { height: '100%' }, locale: 'en-US', ...props }))));
  return host;
}
const activeCell = (): HTMLElement => document.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')!;
const key = (k: string, init: KeyboardEventInit = {}): void => {
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
};

describe('grid in Chromium', () => {
  it('keeps focus on the active cell while the keyboard scrolls far away, and bounds the DOM', async () => {
    mount({ source: bigWorkbook(20_000, 30) });
    await nextFrame();
    activeCell().focus();
    for (let i = 0; i < 10; i++) {
      key('PageDown');
      await nextFrame();
    }
    expect(document.activeElement).toBe(activeCell());
    const row = Number(activeCell().dataset['r']);
    expect(row).toBeGreaterThan(150);
    key('ArrowDown', { ctrlKey: true });
    await nextFrame();
    expect(Number(activeCell().dataset['r'])).toBe(19_999);
    expect(document.activeElement).toBe(activeCell());
    // The active cell is on screen.
    const scroller = document.querySelector<HTMLElement>('.xv-scroll')!.getBoundingClientRect();
    const box = activeCell().getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(scroller.top);
    expect(box.bottom).toBeLessThanOrEqual(scroller.bottom + 1);
    // Only the window is in the DOM, not 600,000 cells.
    expect(document.querySelectorAll('[role="gridcell"]').length).toBeLessThan(2000);
  });

  it('frozen rows, frozen columns and headers stay in place while scrolling', async () => {
    mount({ source: bigWorkbook(2_000, 60) });
    await nextFrame();
    const scroller = document.querySelector<HTMLElement>('.xv-scroll')!;
    const header = (): DOMRect => document.querySelector<HTMLElement>('[data-r="0"][data-c="0"]')!.getBoundingClientRect(); // A1: frozen row and column
    const frozenCol = (): DOMRect => document.querySelector<HTMLElement>('[data-r="5"][data-c="0"]')?.getBoundingClientRect() ?? new DOMRect();
    const before = { header: header().top, col: frozenCol().left };
    scroller.scrollTop = 3000;
    scroller.scrollLeft = 1500;
    scroller.dispatchEvent(new Event('scroll'));
    await nextFrame();
    expect(Math.round(header().top)).toBe(Math.round(before.header));
    const firstBodyRow = Number(document.querySelector<HTMLElement>('.xv-body [role="row"]')!.getAttribute('aria-rowindex'));
    expect(firstBodyRow).toBeGreaterThan(100);
    // Column A (frozen) is still drawn at the same x.
    const a = document.querySelector<HTMLElement>(`.xv-body [data-c="0"]`)!.getBoundingClientRect();
    expect(Math.round(a.left)).toBe(Math.round(before.col));
  });

  it('right-to-left sheets put column A on the right', async () => {
    const wb = bigWorkbook(50, 5);
    wb.sheets[0]!.view = { rightToLeft: true };
    mount({ source: wb });
    await nextFrame();
    const a = document.querySelector<HTMLElement>('[data-r="1"][data-c="0"]')!.getBoundingClientRect();
    const b = document.querySelector<HTMLElement>('[data-r="1"][data-c="1"]')!.getBoundingClientRect();
    expect(a.left).toBeGreaterThan(b.left);
  });

  it('scales fonts and sizes with zoom (11 pt is 14.67 px at 100 %)', async () => {
    mount({ source: { sheets: [{ name: 'S', rows: [['abc']] }] }, defaultZoom: 200 });
    await nextFrame();
    const text = document.querySelector<HTMLElement>('[data-r="0"][data-c="0"] .xv-text')!;
    expect(parseFloat(getComputedStyle(text).fontSize)).toBeCloseTo(29.33, 1);
    expect(document.querySelector<HTMLElement>('[data-r="0"][data-c="0"]')!.getBoundingClientRect().height).toBeCloseTo(40, 0);
  });

  it('draws 1px borders inside the cell, and diagonal borders', async () => {
    const thin = { style: 'thin' as const, color: 'FF0000' };
    mount({ source: { sheets: [{ name: 'S', rows: [[{ value: 'a', style: { border: { top: thin, left: thin, right: thin, bottom: thin } } }, { value: 'X', style: { border: { diagonal: thin, diagonalUp: true, diagonalDown: true } } }]] }] } });
    await nextFrame();
    const cell = document.querySelector<HTMLElement>('[data-r="0"][data-c="0"]')!;
    const edges = cell.querySelector<HTMLElement>('.xv-edges')!;
    const c = cell.getBoundingClientRect();
    const e = edges.getBoundingClientRect();
    // The overlay lies within the cell box, so overflow: hidden doesn't clip the edge.
    expect(e.top).toBeGreaterThanOrEqual(c.top);
    expect(e.left).toBeGreaterThanOrEqual(c.left);
    expect(getComputedStyle(edges).borderTopWidth).toBe('1px');
    expect(document.querySelectorAll('[data-r="0"][data-c="1"] .xv-diagonals line').length).toBe(2);
  });

  it('in a right-to-left sheet, long text spills to the left into empty cells', async () => {
    mount({ source: { sheets: [{ name: 'S', rows: [['A1 is on the right and this text is long', undefined, undefined]], view: { rightToLeft: true } }] } });
    await nextFrame();
    const cell = document.querySelector<HTMLElement>('[data-r="0"][data-c="0"]')!.getBoundingClientRect();
    const text = document.querySelector<HTMLElement>('[data-r="0"][data-c="0"] .xv-text')!.getBoundingClientRect();
    expect(Math.round(text.right)).toBeLessThanOrEqual(Math.round(cell.right));
    expect(text.left).toBeLessThan(cell.left);
    // The text itself hugs the cell's right edge (general alignment starts on the right in an RTL sheet).
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('[data-r="0"][data-c="0"] .xv-text')!);
    expect(cell.right - range.getBoundingClientRect().right).toBeLessThan(8);
  });

  it('superscript cells are raised, fill alignment repeats, RTL reading order aligns right', async () => {
    mount({
      source: {
        sheets: [{
          name: 'S',
          rows: [
            [{ value: 'base' }, { value: 'sup', style: { font: { vertAlign: 'superscript' } } }],
            [{ value: 'ab', style: { alignment: { horizontal: 'fill' } } }],
            [{ value: 'abc', style: { alignment: { readingOrder: 'rtl' } } }],
          ],
        }],
      },
    });
    await nextFrame();
    const base = document.querySelector<HTMLElement>('[data-r="0"][data-c="0"] .xv-text')!.getBoundingClientRect();
    const sup = document.querySelector<HTMLElement>('[data-r="0"][data-c="1"] .xv-text')!;
    expect(sup.getBoundingClientRect().bottom).toBeLessThan(base.bottom - 2); // raised above the baseline of normal text
    expect(parseFloat(getComputedStyle(sup).fontSize)).toBeLessThan(14.67);
    expect(document.querySelector('[data-r="1"][data-c="0"]')!.textContent!.length).toBeGreaterThan(4);
    const rtlCell = document.querySelector<HTMLElement>('[data-r="2"][data-c="0"]')!.getBoundingClientRect();
    const rtlText = document.querySelector<HTMLElement>('[data-r="2"][data-c="0"] .xv-text')!.getBoundingClientRect();
    expect(rtlCell.right - rtlText.right).toBeLessThan(rtlText.left - rtlCell.left);
  });

  it('shows #### for a number that does not fit (measured text)', async () => {
    mount({ source: { sheets: [{ name: 'S', rows: [[{ value: 123456789012345, style: { numFmt: '#,##0' } }]], colProps: [{ width: 4 }] }] } });
    await nextFrame();
    expect(document.querySelector('[data-r="0"][data-c="0"]')!.textContent).toMatch(/^#+$/);
  });
  describe('auto-fit rows (issue #14)', () => {
    const rowH = (r: number): number => document.querySelector<HTMLElement>(`[data-r="${r}"][data-c="0"]`)!.getBoundingClientRect().height;
    const long = 'one two three four five six seven eight nine ten eleven twelve';

    it('grows rows without a stored height to wrapped, larger and rotated text; leaves the rest alone', async () => {
      mount({
        source: {
          sheets: [{
            name: 'S',
            rows: [
              ['plain'],
              [{ value: long, style: { alignment: { wrapText: true } } }],
              [{ value: 'Big', style: { font: { size: 28 } } }],
              [{ value: 'Rotated text', style: { alignment: { rotation: 90 } } }],
              [{ value: long, style: { alignment: { wrapText: true } } }],
              [{ value: 'Stacked', style: { alignment: { rotation: 'vertical' } } }],
            ],
            rowProps: [undefined, undefined, undefined, undefined, { height: 15 }],
            colProps: [{ width: 12 }],
          }],
        },
      });
      await nextFrame();
      await nextFrame();
      expect(rowH(0)).toBeCloseTo(20, 0); // default
      expect(rowH(1)).toBeGreaterThan(50); // several wrapped lines
      expect(rowH(2)).toBeGreaterThan(40); // 28 pt is 37.3 px, line height 1.2
      expect(rowH(3)).toBeGreaterThan(60); // the rotated box is as tall as the text is long
      expect(rowH(4)).toBeCloseTo(20, 0); // a stored height wins
      expect(rowH(5)).toBeGreaterThan(60); // stacked letters
      // The wrapped text fits: nothing is cut off.
      const text = document.querySelector<HTMLElement>('[data-r="1"][data-c="0"] .xv-text')!;
      expect(text.getBoundingClientRect().height).toBeLessThanOrEqual(rowH(1) + 0.5);
    });

    it('keeps the row at the top in place when rows around the viewport grow', async () => {
      // Rows 0–199 have a stored height (20 px, never auto-fitted); rows from 200 on wrap and grow when they are rendered.
      const rows = Array.from({ length: 400 }, () => [{ value: long, style: { alignment: { wrapText: true } } }]);
      const rowProps = Array.from({ length: 200 }, () => ({ height: 15 }));
      const el = mount({ source: { sheets: [{ name: 'S', rows, rowProps, colProps: [{ width: 12 }] }] } });
      await nextFrame();
      const scroller = el.querySelector<HTMLElement>('.xv-scroll')!;
      // Before the jump every row is 20 px, so this position puts row 250 at the top, 7 px into it.
      scroller.scrollTop = 250 * 20 + 7;
      for (let i = 0; i < 4; i++) await nextFrame();
      const line = scroller.getBoundingClientRect().top + 20; // just below the column headers
      const top = [...el.querySelectorAll<HTMLElement>('.xv-body [data-c="0"]')].find((c) => {
        const b = c.getBoundingClientRect();
        return b.top <= line + 0.5 && b.bottom > line + 0.5;
      })!;
      // The rows in the overscan above it grew too, yet row 250 is still at the top, 7 px into it.
      expect(Number(top.dataset['r'])).toBe(250);
      expect(rowH(250)).toBeGreaterThan(40);
      expect(line - top.getBoundingClientRect().top).toBeCloseTo(7, 0);
    });
  });
  describe('small sheets fill the viewport (issue #17)', () => {
    const filled = (el: HTMLElement): void => {
      const scroller = el.querySelector<HTMLElement>('.xv-scroll')!;
      const canvas = el.querySelector<HTMLElement>('.xv-canvas')!.getBoundingClientRect();
      expect(canvas.width).toBeGreaterThanOrEqual(scroller.clientWidth);
      expect(canvas.height).toBeGreaterThanOrEqual(scroller.clientHeight);
    };

    it('adds enough empty rows and columns to fill the viewer at a small zoom', async () => {
      const el = mount({ source: { sheets: [{ name: 'S', rows: [['a', 'b'], ['c', 'd']] }] }, defaultZoom: 25 });
      for (let i = 0; i < 3; i++) await nextFrame();
      filled(el);
    });

    it('grows when zooming out, keeping the selection and scroll position', async () => {
      const el = mount({ source: { sheets: [{ name: 'S', rows: [['a', 'b'], ['c', 'd']] }] } });
      await nextFrame();
      document.querySelector<HTMLElement>('[data-r="1"][data-c="1"]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 }));
      await nextFrame();
      const zoomOut = el.querySelector<HTMLButtonElement>(`button[aria-label="${DEFAULT_LABELS.zoomOut}"]`)!;
      for (let i = 0; i < 6; i++) {
        zoomOut.click();
        await nextFrame();
      }
      for (let i = 0; i < 3; i++) await nextFrame();
      expect(el.querySelector<HTMLSelectElement>('select.xv-zoom')!.value).not.toBe('100');
      filled(el);
      expect(activeCell().dataset['r']).toBe('1');
      expect(activeCell().dataset['c']).toBe('1');
    });
  });
});
