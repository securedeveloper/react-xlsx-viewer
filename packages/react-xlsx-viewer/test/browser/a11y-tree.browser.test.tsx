// Automated screen-reader pre-pass (docs/a11y-manual-check.md): drives each step of the manual checklist with
// real keyboard input in Chromium and pins what the browser hands to screen readers, read from Chromium's
// accessibility tree over the DevTools protocol (the axSnapshot command in vitest.browser.config.ts): the focused
// node's role, name, description and states, its ancestors, and the live regions. It doesn't replace the manual
// passes with real screen readers; it catches regressions in what they are given.
//
// Chromium's protocol doesn't report aria-rowindex/colindex/rowcount/colcount/rowspan/colspan as properties
// (they go to the platform APIs as table attributes), so those are checked on the DOM next to the tree.
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { commands, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LABELS, XlsxViewer } from '../../src/index';
import '../../src/styles.css';
import type { AxNode, AxSnapshot } from '../../vitest.browser.config';
import { CORPUS } from '../fixtures/corpus';
import { externalTargets } from './hostile-files';

declare module 'vitest/browser' {
  interface BrowserCommands {
    axSnapshot: () => Promise<AxSnapshot>;
  }
}

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
});

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Mounts the viewer between two buttons (the page around it), with focus on the first one. */
async function open(source: File | Uint8Array, props: Partial<Parameters<typeof XlsxViewer>[0]> = {}): Promise<HTMLElement> {
  host = document.createElement('div');
  host.style.cssText = 'width: 900px;';
  const before = Object.assign(document.createElement('button'), { textContent: 'before' });
  const box = document.createElement('div');
  box.style.height = '560px';
  host.append(before, box, Object.assign(document.createElement('button'), { textContent: 'after' }));
  document.body.append(host);
  root = createRoot(box);
  flushSync(() => root!.render(createElement(XlsxViewer, { style: { height: '100%' }, locale: 'en-US', source, ...props })));
  await vi.waitFor(() => {
    if (!box.querySelector('[role="grid"], [role="alert"]')) throw new Error('still loading');
  }, { timeout: 10_000, interval: 20 });
  await nextFrame();
  before.focus();
  return box;
}
const corpus = async (file: string): Promise<File> => new File([(await CORPUS.find((f) => f.file === file)!.load()) as BlobPart], file);

/** Tab from the page until focus is in the grid (the formula bar's two fields come first). */
async function enterGrid(): Promise<void> {
  for (let i = 0; i < 6 && document.activeElement?.getAttribute('role') !== 'gridcell'; i++) await userEvent.tab();
  expect(document.activeElement?.getAttribute('role')).toBe('gridcell');
}
async function ax(): Promise<AxSnapshot> {
  await nextFrame();
  return commands.axSnapshot();
}
const focused = (s: AxSnapshot): AxNode => s.focus[0]!;
const ancestor = (s: AxSnapshot, role: string): AxNode | undefined => s.focus.find((n) => n.role === role);
const status = (s: AxSnapshot): string => s.live.find((n) => n.role === 'status')?.name ?? '';
/** Position of the focused cell as the DOM gives it to the platform (1-based, header row/column included). */
function position(): { row: number; col: number; rows: number; cols: number } {
  const el = document.activeElement!;
  const grid = el.closest('[role="grid"]')!;
  return {
    row: Number(el.closest('[role="row"]')!.getAttribute('aria-rowindex')),
    col: Number(el.getAttribute('aria-colindex')),
    rows: Number(grid.getAttribute('aria-rowcount')),
    cols: Number(grid.getAttribute('aria-colcount')),
  };
}

describe('screen-reader pre-pass (Chromium accessibility tree)', () => {
  it('1–2. entering the grid and moving: grid name, read-only, cell text, position; blank cells', async () => {
    await open(await corpus('14-merges-views.xlsx'));
    await enterGrid();
    let s = await ax();
    expect(focused(s)).toMatchObject({ role: 'gridcell', name: '8', props: { focused: true, selected: true, readonly: true } });
    expect(ancestor(s, 'grid')).toMatchObject({ name: DEFAULT_LABELS.sheet('Frozen both (active)'), props: { readonly: true, multiselectable: true } });
    expect(ancestor(s, 'row')!.name).toMatch(/^5 /); // the row's header comes first: "5 …"
    expect(position()).toEqual({ row: 6, col: 4, rows: 91, cols: 41 });
    await userEvent.keyboard('{ArrowRight}');
    s = await ax();
    expect(focused(s).name).toBe('12');
    expect(position().col).toBe(5);
    await userEvent.keyboard('{ArrowDown}');
    expect(focused(await ax()).name).toBe('15');
    expect(position().row).toBe(7);
    // A blank cell has an empty name, which screen readers announce as blank.
    await userEvent.keyboard('{Control>}{End}{/Control}{ArrowRight}');
    expect(focused(await ax())).toMatchObject({ role: 'gridcell', name: '' });
  });

  it('3. a merged cell is one cell spanning several columns, and the next arrow skips what it covers', async () => {
    await open(await corpus('14-merges-views.xlsx'));
    await enterGrid();
    await userEvent.keyboard('{Control>}{PageUp}{/Control}{Control>}{Home}{/Control}');
    expect(focused(await ax())).toMatchObject({ role: 'gridcell', name: 'A1:C1 merged, centred' });
    expect(document.activeElement!.getAttribute('aria-colspan')).toBe('3');
    expect(position().col).toBe(2);
    await userEvent.keyboard('{ArrowRight}');
    expect(position().col).toBe(5); // D1: B1 and C1 are inside the merge
    await userEvent.keyboard('{ArrowLeft}{ArrowDown}');
    expect(focused(await ax()).name).toBe('A2:A4 merged vertically');
    expect(document.activeElement!.getAttribute('aria-rowspan')).toBe('3');
  });

  it('4. hidden rows and columns: the row number jumps, and the next header describes the gap', async () => {
    const el = await open(await corpus('13-columns-rows.xlsx'));
    await enterGrid();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(position().row).toBe(5); // sheet row 4
    await userEvent.keyboard('{ArrowDown}');
    expect(position().row).toBe(7); // sheet row 6: row 5 is hidden
    // The header after the gap: its description says what is hidden (read with the reading cursor).
    for (const [selector, name, description] of [
      ['[role="rowheader"][title]', '6', DEFAULT_LABELS.rowsHidden(5, 5)],
      ['[role="columnheader"][title]', 'J', DEFAULT_LABELS.colsHidden('H', 'I')],
    ] as const) {
      const header = el.querySelector<HTMLElement>(selector)!;
      header.tabIndex = -1;
      header.focus();
      expect(focused(await ax())).toMatchObject({ name, description });
      header.removeAttribute('tabindex');
    }
  });

  it('5. frozen panes: Page Down and Ctrl+Home move and announce the active cell, focus stays in the grid', async () => {
    await open(await corpus('14-merges-views.xlsx'));
    await enterGrid();
    const start = position().row;
    await userEvent.keyboard('{PageDown}');
    let s = await ax();
    // A screen's worth of rows depends on the fonts and the viewport, so check the move, not the row.
    expect(position().row).toBeGreaterThan(start + 10);
    expect(focused(s)).toMatchObject({ role: 'gridcell', name: document.activeElement!.textContent });
    expect(ancestor(s, 'grid')!.name).toBe(DEFAULT_LABELS.sheet('Frozen both (active)'));
    await userEvent.keyboard('{Control>}{Home}{/Control}');
    s = await ax();
    expect(focused(s)).toMatchObject({ role: 'gridcell', name: '1' }); // B2: the first cell after the frozen row and column
    expect(position()).toMatchObject({ row: 3, col: 3 });
  });

  it('6. a range selection: cells are selected, and the summary is announced once after a pause', async () => {
    await open(await corpus('14-merges-views.xlsx'));
    await enterGrid();
    await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowRight}{/Shift}');
    let s = await ax();
    expect(focused(s).props['selected']).toBe(true);
    expect(document.querySelectorAll('[role="gridcell"][aria-selected="true"]').length).toBe(4);
    expect(status(s)).toBe(''); // not on every key press…
    await new Promise((r) => setTimeout(r, 800));
    s = await ax();
    expect(status(s)).toBe('4 cells · Sum 45 · Average 11.25'); // …but after 600 ms of quiet
  });

  it('7. formulas: the result is the name, the formula the description; no stored result says so', async () => {
    await open(await corpus('05-formulas.xlsx'));
    await enterGrid();
    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    expect(focused(await ax())).toMatchObject({ role: 'gridcell', name: '20', description: `${DEFAULT_LABELS.formula}: =D2*2` });
    const noCache = document.querySelector<HTMLElement>('.xv-nocache')!;
    noCache.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 }));
    noCache.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    await nextFrame();
    document.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')!.focus();
    const s = await ax();
    expect(focused(s).name).toBe('');
    expect(focused(s).description).toMatch(new RegExp(`^${DEFAULT_LABELS.formula}: =.+\\. ${DEFAULT_LABELS.notCalculated}$`));
  });

  it('8. switching sheets: the new grid name and cell, with a polite announcement', async () => {
    await open(await corpus('99-kitchen-sink.xlsx'));
    await enterGrid();
    await userEvent.keyboard('{Control>}{PageDown}{/Control}');
    const s = await ax();
    expect(focused(s).role).toBe('gridcell');
    expect(ancestor(s, 'grid')!.name).toBe(DEFAULT_LABELS.sheet('Text'));
    expect(status(s)).toBe(DEFAULT_LABELS.sheet('Text'));
  });

  it('9. sheet tabs: a named tab list, the current tab selected, hidden sheets marked', async () => {
    await open(await corpus('14-merges-views.xlsx'), { showHiddenSheets: true });
    await enterGrid();
    for (let i = 0; i < 6 && document.activeElement?.getAttribute('role') !== 'tab'; i++) await userEvent.tab();
    let s = await ax();
    expect(focused(s)).toMatchObject({ role: 'tab', name: 'Frozen both (active)', props: { selected: true } });
    expect(ancestor(s, 'tablist')).toMatchObject({ name: DEFAULT_LABELS.sheets, props: { orientation: 'horizontal' } });
    await userEvent.keyboard('{End}');
    s = await ax();
    expect(focused(s)).toMatchObject({ role: 'tab', name: `Hidden ${DEFAULT_LABELS.hiddenSheet}` });
    expect(focused(s).props['selected']).not.toBe(true);
    await userEvent.keyboard('{Enter}');
    expect((await ax()).focus[0]!.props['selected']).toBe(true);
  });

  it('10. link chip: the description names the target; Tab reaches the chip; Escape comes back', async () => {
    await open(await corpus('15-hyperlinks-names.xlsx'));
    await enterGrid();
    await userEvent.keyboard('{ArrowRight}');
    let s = await ax();
    expect(focused(s)).toMatchObject({ role: 'gridcell', name: 'example.com', description: DEFAULT_LABELS.linkTo('example.com') });
    await userEvent.tab();
    s = await ax();
    expect(focused(s)).toMatchObject({ role: 'link', name: DEFAULT_LABELS.linkOpen, props: { url: 'https://example.com/?a=1&b=2' } });
    await userEvent.keyboard('{Escape}');
    expect(focused(await ax())).toMatchObject({ role: 'gridcell', name: 'example.com' });
    // Internal link: the sheet's name and the cell.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    s = await ax();
    expect(focused(s)).toMatchObject({ name: 'go to Second sheet', description: DEFAULT_LABELS.linkTo('Second sheet, A1') });
    await userEvent.tab();
    expect(focused(await ax())).toMatchObject({ role: 'button', name: DEFAULT_LABELS.linkGoTo('Second sheet, A1') });
  });

  it('10b. a blocked link says so in the chip', async () => {
    const el = await open(new Uint8Array(0), { source: { sheets: [{ name: 'S', rows: [[{ value: 'Click', hyperlink: 'javascript:alert(1)' }]] }] } });
    await enterGrid();
    // Not "Link to javascript:…": the description says the link won't open, as the chip does.
    expect(focused(await ax())).toMatchObject({ name: 'Click', description: DEFAULT_LABELS.linkBlocked });
    expect(el.querySelector('.xv-link-chip')!.textContent).toBe(DEFAULT_LABELS.linkBlocked);
  });

  it('11. shortcuts dialog: a named modal dialog with focus on Close; Escape returns to the cell', async () => {
    await open(await corpus('14-merges-views.xlsx'));
    await enterGrid();
    await userEvent.keyboard('{Shift>}?{/Shift}');
    const s = await ax();
    expect(focused(s)).toMatchObject({ role: 'button', name: DEFAULT_LABELS.close });
    expect(ancestor(s, 'dialog')).toMatchObject({ name: DEFAULT_LABELS.shortcuts, props: { modal: true } });
    await userEvent.keyboard('{Escape}');
    expect(focused(await ax())).toMatchObject({ role: 'gridcell', name: '8' });
  });

  it('12. zoom controls have names, and the zoom list says its value', async () => {
    const el = await open(await corpus('14-merges-views.xlsx'));
    el.querySelector<HTMLElement>(`button[aria-label="${DEFAULT_LABELS.zoomOut}"]`)!.focus();
    expect(focused(await ax())).toMatchObject({ role: 'button', name: DEFAULT_LABELS.zoomOut });
    await userEvent.tab();
    expect(focused(await ax())).toMatchObject({ role: 'combobox', name: DEFAULT_LABELS.zoom, value: '100 %' });
    await userEvent.tab();
    expect(focused(await ax())).toMatchObject({ role: 'button', name: DEFAULT_LABELS.zoomIn });
    await userEvent.tab();
    expect(focused(await ax())).toMatchObject({ role: 'button', name: DEFAULT_LABELS.shortcuts });
  });

  it('13. a file that is not a workbook: an alert with the message, without moving focus', async () => {
    await open(new File([new Uint8Array([1, 2, 3, 4])], 'photo.png'));
    const s = await ax();
    expect(s.live.find((n) => n.role === 'alert')!.name).toContain(DEFAULT_LABELS.errors.notWorkbook);
    expect(focused(s).name).toBe('before');
  });

  it('14. the "not shown" notice is a named region with Dismiss', async () => {
    const el = await open(await externalTargets());
    el.querySelector<HTMLElement>('.xv-notice button')!.focus();
    const s = await ax();
    expect(focused(s)).toMatchObject({ role: 'button', name: DEFAULT_LABELS.dismiss });
    expect(ancestor(s, 'region')!.name).toBe(DEFAULT_LABELS.notShownTitle);
  });

  it('15. Tab leaves the grid, Shift+Tab comes back to the same cell', async () => {
    await open(await corpus('14-merges-views.xlsx'));
    await enterGrid();
    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    const cell = document.activeElement;
    await userEvent.tab();
    expect(focused(await ax()).role).not.toBe('gridcell');
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(cell);
    expect(focused(await ax())).toMatchObject({ role: 'gridcell', name: '15' });
  });
});
