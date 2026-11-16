import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef, StrictMode, version as reactVersion } from 'react';
import { version as reactDomVersion } from 'react-dom';
import { toUint8Array, type CellInput, type Workbook } from 'javascript-excel';
import pkg from '../package.json';
import { DEFAULT_LABELS, XlsxViewer, useWorkbook, version, type XlsxViewerHandle } from '../src/index';
import { patternCss } from '../src/grid';

const book = (): Workbook<CellInput> => ({
  sheets: [
    {
      name: 'Sales',
      rows: [
        [{ value: 'Region' }, { value: 'Q1' }, { value: 'Q2' }],
        [{ value: 'North' }, { value: 1250.5, style: { numFmt: '#,##0.00' } }, { value: 980 }],
        [{ value: 'South' }, { value: 700 }, { formula: 'SUM(B2:B3)', value: 1950.5 }],
        [{ value: 'Link', hyperlink: 'javascript:alert(1)' }, { value: 'Site', hyperlink: 'https://example.com/x' }, { formula: 'NOW()' }],
      ],
      view: { freeze: { rows: 1 } },
    },
    { name: 'Costs', rows: [[{ value: 'c' }]] },
    { name: 'Secret', rows: [[1]], state: 'hidden' },
  ],
});

const cell = (r: number, c: number): HTMLElement => document.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)!;
const active = (): HTMLElement => document.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')!;

describe('react-xlsx-viewer', () => {
  it('exports the package version', () => {
    expect(version).toBe(pkg.version);
  });

  it('the entry starts with the "use client" directive', () => {
    const entry = join(dirname(fileURLToPath(import.meta.url)), '../src/index.ts');
    expect(readFileSync(entry, 'utf8').split('\n', 1)[0]).toBe("'use client';");
  });

  // Guards the CI matrix: fails if the job did not really install the React major it claims.
  it.runIf(process.env['REACT_MAJOR'])('runs against the expected React major', () => {
    expect(reactVersion.split('.')[0]).toBe(process.env['REACT_MAJOR']);
    expect(reactDomVersion).toBe(reactVersion);
  });
});

describe('<XlsxViewer> grid', () => {
  it('renders an ARIA grid with true row/column indices, headers and values', () => {
    render(
      <StrictMode>
        <XlsxViewer source={book()} locale="en-US" />
      </StrictMode>,
    );
    const grid = screen.getByRole('grid', { name: 'Sheet: Sales' });
    expect(grid.getAttribute('aria-readonly')).toBe('true');
    expect(Number(grid.getAttribute('aria-rowcount'))).toBeGreaterThan(4);
    expect(within(grid).getAllByRole('columnheader').map((h) => h.textContent).slice(1, 4)).toEqual(['A', 'B', 'C']);
    expect(cell(1, 1).textContent).toBe('1,250.50'); // the format hook is /format's formatCell
    expect(cell(1, 1).getAttribute('aria-colindex')).toBe('3');
    expect(cell(1, 1).closest('[role="row"]')!.getAttribute('aria-rowindex')).toBe('3');
    expect(active()).toBe(cell(0, 0));
  });

  it('moves with the keyboard (arrows, Ctrl+arrow, Shift extends, Escape collapses)', () => {
    render(<XlsxViewer source={book()} locale="en-US" />);
    act(() => cell(0, 0).focus());
    fireEvent.keyDown(active(), { key: 'ArrowRight' });
    expect(active()).toBe(cell(0, 1));
    expect(screen.getByLabelText('Cell address')).toHaveProperty('value', 'B1');
    fireEvent.keyDown(active(), { key: 'ArrowDown', ctrlKey: true });
    expect(active()).toBe(cell(3, 1));
    fireEvent.keyDown(active(), { key: 'ArrowUp', shiftKey: true });
    expect(cell(2, 1).getAttribute('aria-selected')).toBe('true');
    expect(cell(3, 1).getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector(".xv-status-text")!.textContent).toBe("2 cells · Sum 700 · Average 700");
    fireEvent.keyDown(active(), { key: 'Escape' });
    expect(cell(2, 1).getAttribute('aria-selected')).toBe('false');
    fireEvent.keyDown(active(), { key: 'End', ctrlKey: true });
    expect(active()).toBe(cell(3, 2));
  });

  it('shows formula text and the cached result in the formula bar', () => {
    render(<XlsxViewer source={book()} locale="en-US" defaultSelection={{ ranges: [{ start: { row: 2, col: 2 }, end: { row: 2, col: 2 } }], active: { row: 2, col: 2 } }} />);
    expect(screen.getByLabelText('Formula')).toHaveProperty('value', '=SUM(B2:B3)');
    expect(screen.getByText('Result: 1950.5')).toBeTruthy();
  });

  it('marks formulas without a cached value and describes them to screen readers', () => {
    render(<XlsxViewer source={book()} locale="en-US" defaultSelection={{ ranges: [{ start: { row: 3, col: 2 }, end: { row: 3, col: 2 } }], active: { row: 3, col: 2 } }} />);
    expect(screen.getByText('Result: not calculated')).toBeTruthy();
    const desc = document.getElementById(active().getAttribute('aria-describedby')!)!;
    expect(desc.textContent).toContain('Formula: =NOW()');
  });

  it('labels the corner header, gives link cells a hover text, and draws the frozen divider', () => {
    render(<XlsxViewer source={book()} />);
    expect(screen.getByRole('columnheader', { name: 'Select all cells' })).toBeTruthy();
    expect(cell(3, 1).getAttribute('title')).toBe('https://example.com/x');
    expect(cell(3, 1).className).toContain('xv-link');
    // Row 1 is frozen: its cells carry the divider below them.
    expect(cell(0, 1).style.boxShadow).toContain('var(--xv-frozen-line)');
    expect(cell(1, 1).style.boxShadow).not.toContain('var(--xv-frozen-line)');
  });

  it('link chip: shows the real target, blocks disallowed schemes', () => {
    const { rerender } = render(<XlsxViewer source={book()} defaultSelection={{ ranges: [{ start: { row: 3, col: 1 }, end: { row: 3, col: 1 } }], active: { row: 3, col: 1 } }} />);
    expect(screen.getByText('example.com').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('rel')).toBe('noopener noreferrer');
    rerender(<XlsxViewer source={book()} selection={{ ranges: [{ start: { row: 3, col: 0 }, end: { row: 3, col: 0 } }], active: { row: 3, col: 0 } }} />);
    expect(screen.getByText(DEFAULT_LABELS.linkBlocked)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open' })).toBeNull();
  });

  it('sheet tabs: visible sheets only, arrow keys move focus, Enter activates; Ctrl+PageDown switches', () => {
    const onSheetChange = vi.fn();
    render(<XlsxViewer source={book()} onSheetChange={onSheetChange} />);
    const tabs = within(screen.getByRole('tablist', { name: 'Sheets' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Sales', 'Costs']);
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(tabs[1]!, { key: 'Enter' });
    expect(onSheetChange).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole('grid', { name: 'Sheet: Costs' })).toBeTruthy();
    fireEvent.keyDown(active(), { key: 'PageUp', ctrlKey: true });
    expect(screen.getByRole('grid', { name: 'Sheet: Sales' })).toBeTruthy();
  });

  it('shows hidden sheets on request', () => {
    render(<XlsxViewer source={book()} showHiddenSheets />);
    expect(within(screen.getByRole('tablist')).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Sales', 'Costs', 'Secret (hidden)']);
  });

  it('copies TSV and HTML through the copy event', () => {
    render(<XlsxViewer source={book()} locale="en-US" />);
    fireEvent.keyDown(active(), { key: 'ArrowRight', shiftKey: true });
    const data = new Map<string, string>();
    const event = new Event('copy', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { setData: (t: string, v: string) => data.set(t, v) } });
    act(() => {
      active().dispatchEvent(event);
    });
    expect(data.get('text/plain')).toBe('Region\tQ1');
    expect(data.get('text/html')).toMatch(/^<table><tr><td[^>]*>Region<\/td><td[^>]*>Q1<\/td><\/tr><\/table>$/);
    expect(event.defaultPrevented).toBe(true);
  });

  it('zoom controls scale the geometry', () => {
    render(<XlsxViewer source={book()} />);
    const before = parseFloat(cell(0, 1).style.width);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(parseFloat(cell(0, 1).style.width)).toBeCloseTo(before * 1.1, 5);
    expect(screen.getByLabelText('Zoom')).toHaveProperty('value', '110');
  });

  it('the imperative handle scrolls, selects and returns the workbook', () => {
    const ref = createRef<XlsxViewerHandle>();
    const wb = book();
    render(<XlsxViewer ref={ref} source={wb} />);
    act(() => ref.current!.scrollTo("'Costs'!A1"));
    expect(screen.getByRole('grid', { name: 'Sheet: Costs' })).toBeTruthy();
    expect(ref.current!.getWorkbook()).toBe(wb);
  });
});

describe('pattern fills', () => {
  it('each of the 17 non-solid patterns has its own CSS', () => {
    const patterns = ['mediumGray', 'darkGray', 'lightGray', 'darkHorizontal', 'darkVertical', 'darkDown', 'darkUp', 'darkGrid', 'darkTrellis', 'lightHorizontal', 'lightVertical', 'lightDown', 'lightUp', 'lightGrid', 'lightTrellis', 'gray125', 'gray0625'];
    const css = patterns.map((p) => JSON.stringify(patternCss(p, '#FF0000', '#FFFF00')));
    expect(new Set(css).size).toBe(patterns.length);
    for (const c of css) expect(c).not.toContain('url(');
  });
});

describe('loading', () => {
  it('reads an .xlsx from bytes, with progress then the grid', async () => {
    const bytes = await toUint8Array({ sheets: [{ name: 'Data', rows: [[{ value: 45306, style: { numFmt: 14 } }, 'x']] }] });
    render(<XlsxViewer source={bytes} locale="de-DE" />);
    await waitFor(() => expect(screen.getByRole('grid', { name: 'Sheet: Data' })).toBeTruthy());
    expect(cell(0, 0).textContent).toBe('15.01.2024');
  });

  it('reads a CSV File, named after the file', async () => {
    const file = new File(['name,amount\r\nAda,1250.5\r\n'], 'people.csv', { type: 'text/csv' });
    render(<XlsxViewer source={file} />);
    await waitFor(() => expect(screen.getByRole('grid', { name: 'Sheet: people' })).toBeTruthy());
    expect(cell(1, 1).textContent).toBe('1250.5');
    expect(screen.getByRole('region', { name: 'people.csv' })).toBeTruthy();
  });

  it('shows a specific message per error code', async () => {
    const onError = vi.fn();
    render(<XlsxViewer source={new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0])} onError={onError} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('older binary workbook (.xls)');
    expect(alert.textContent).toContain('UNSUPPORTED_FORMAT');
    expect(onError).toHaveBeenCalledOnce();
  });

  it('useWorkbook: idle without a source', () => {
    function Probe() {
      const w = useWorkbook(null);
      return <output>{w.status}</output>;
    }
    render(<Probe />);
    expect(screen.getByText('idle')).toBeTruthy();
  });
});
