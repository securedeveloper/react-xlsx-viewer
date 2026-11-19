# User guide

How to use `react-xlsx-viewer` in an app, and how people use the viewer once it's on screen. The API reference is [api.md §5](api.md#5-react-api); the design behind the UI is [ux.md](ux.md).

Try everything below in the live playground: https://react-xlsx-viewer-playground.vercel.app/ (it opens its samples or your own file in the browser; nothing is uploaded).

## Contents

1. [Install](#1-install)
2. [Show a file](#2-show-a-file)
3. [Sources: files, bytes, CSV and workbooks](#3-sources-files-bytes-csv-and-workbooks)
4. [Large files: the worker](#4-large-files-the-worker)
5. [Untrusted files: limits and errors](#5-untrusted-files-limits-and-errors)
6. [View state: sheet, selection, zoom](#6-view-state-sheet-selection-zoom)
7. [The imperative handle](#7-the-imperative-handle)
8. [Hyperlinks](#8-hyperlinks)
9. [Fonts](#9-fonts)
10. [Look and theme](#10-look-and-theme)
11. [Translation](#11-translation)
12. [Server rendering and CSP](#12-server-rendering-and-csp)
13. [Using the viewer: keyboard, mouse, copy](#13-using-the-viewer-keyboard-mouse-copy)
14. [Keyboard reference](#14-keyboard-reference)
15. [What isn't shown](#15-what-isnt-shown)

## 1. Install

```sh
npm install react-xlsx-viewer
```

React 18 or 19 is a peer dependency. The only runtime dependency is [javascript-excel](https://github.com/securedeveloper/javascript-excel).

Import the stylesheet once, anywhere in the app:

```tsx
import 'react-xlsx-viewer/styles.css';
```

## 2. Show a file

```tsx
import { XlsxViewer } from 'react-xlsx-viewer';
import 'react-xlsx-viewer/styles.css';

export function Preview({ file }: { file: File }) {
  return <XlsxViewer source={file} style={{ height: 600 }} />;
}
```

The viewer fills the box you give it, so give it a height (without one it is 240 px tall). It shows a loading state with a Cancel button while the file is read, then the grid, the formula bar, the sheet tabs and the status bar. `showFormulaBar`, `showSheetTabs` and `showStatusBar` (all `true` by default) turn the parts off.

## 3. Sources: files, bytes, CSV and workbooks

`source` accepts:
- a `File` or `Blob` (from an `<input type="file">`, drag and drop, or `fetch(...).then((r) => r.blob())`);
- an `ArrayBuffer` or `Uint8Array`;
- a `Workbook` you already have (built in code, or read with javascript-excel yourself);
- `null` for "nothing open".

The format is detected from the bytes: a zip is read as a workbook (`.xlsx`, `.xlsm`, `.xltx`, `.xltm`). A file without a zip signature is CSV or TSV when its name or type says so (`.csv`, `.txt`, `.tsv`, `.tab`, `text/csv`), or when you pass `format="csv"` / `format="tsv"`. `csvOptions` sets the delimiter and the encoding of bytes without a BOM.

`useWorkbook` is the loading half on its own, for your own loading UI or to show one workbook in several places:

```tsx
import { useWorkbook, XlsxViewer } from 'react-xlsx-viewer';

function Book({ file }: { file: File }) {
  const book = useWorkbook(file);
  if (book.status === 'loading') return <p>Reading… {Math.round((book.progress?.ratio ?? 0) * 100)} %</p>;
  if (book.status === 'error') return <p>Couldn't open it.</p>;
  return <XlsxViewer source={book.workbook} style={{ height: 600 }} />;
}
```

Changing `source`, unmounting or calling `abort()` cancels a read in progress.

## 4. Large files: the worker

Reading runs on the main thread by default, and it doesn't block it: the reader yields while it inflates and parses (a 2.7 MB, 500,000-cell file opened in 442 ms to the first grid, with no frame over 50 ms; [api.md §9.1](api.md#91-measured-in-xlv-3-and-xlv-4)). For very large files, or to keep the main thread completely free, read in a worker. The app owns the worker file (two lines):

```ts
// excel.worker.ts
import { exposeWorker } from 'javascript-excel/worker';
exposeWorker();
```

```tsx
const newWorker = () => new Worker(new URL('./excel.worker.ts', import.meta.url), { type: 'module' });

<XlsxViewer source={file} worker={newWorker} style={{ height: 600 }} />
```

`worker` takes a `Worker` or a factory. The worker needs `worker-src 'self'` under a CSP.

## 5. Untrusted files: limits and errors

The viewer is built to show files from anyone ([api.md §10](api.md#10-security-model)). Formulas are never calculated, macros never run, nothing in the file is fetched, links open only after the real address is shown, and everything from the file is rendered as text.

The reader's limits (javascript-excel's `DEFAULT_READ_LIMITS`: input size, zip entries, compression ratio, XML depth, cells, shared strings) protect against zip bombs and huge files. **Keep the defaults for untrusted files.** You can lower them, or raise them for files you trust:

```tsx
<XlsxViewer source={file} readOptions={{ limits: { maxCells: 1_000_000 } }} />
```

When a file can't be opened, the viewer shows a message in place of the grid and calls `onError` with the error. Errors from the reader carry a `code`; check them with `isExcelError(e)` and `e.code`:

| Code | Message |
|---|---|
| `UNSUPPORTED_FORMAT` (`details.format`: `cfb`, `xlsb`, `ods`, …) | Older `.xls` or password-protected, `.xlsb`, `.ods`, or not a workbook |
| `NOT_XLSX` | "This doesn't look like a workbook or a CSV file." |
| `ZIP_*`, `XML_*` | "This file is damaged and can't be read." |
| `LIMIT_EXCEEDED` (`details.limit` names the limit) | "This file is larger than this viewer is set to open." |

`onLoad` gets the workbook and its warnings; `onWarning` gets each warning as it comes.

## 6. View state: sheet, selection, zoom

Each of these is uncontrolled by default (the `default…` prop sets the start) and controlled when you pass the value:

| State | Controlled | Uncontrolled start | Change |
|---|---|---|---|
| Sheet (index into `workbook.sheets`) | `sheet` | `defaultSheet` (default: the file's active sheet) | `onSheetChange` |
| Selection (`{ ranges, active }`, zero-based rows and columns) | `selection` | `defaultSelection` (default: the file's) | `onSelectionChange` |
| Zoom (percent, 10–400) | `zoom` | `defaultZoom` (default: the sheet's file zoom) | `onZoomChange` |

```tsx
const [sheet, setSheet] = useState(0);
<XlsxViewer source={file} sheet={sheet} onSheetChange={setSheet} />
```

Other display options: `showGridLines` and `showHeaders` override the file's settings; `showHiddenSheets` shows sheets whose state is `hidden` (never `veryHidden`), marked "(hidden)" in the tabs; `locale` sets the locale for number formats (default: the browser's).

## 7. The imperative handle

```tsx
const viewer = useRef<XlsxViewerHandle>(null);
<XlsxViewer ref={viewer} source={file} />

viewer.current?.scrollTo("'Sales'!B12", { select: true });
viewer.current?.focus();          // focus the active cell
await viewer.current?.copy();     // copy the selection, like Ctrl+C
viewer.current?.getWorkbook();
```

## 8. Hyperlinks

Clicking a link cell selects it, like any cell. A small chip under the cell shows the link's **real address** (the host in bold) and an "Open" button; Alt+Enter also opens it. Only `http`, `https` and `mailto` links open, in a new tab with `noopener noreferrer`; anything else (`javascript:`, `data:`, `file:`, …) is shown as text and the chip says "Link not opened: unsupported address". Internal links ("Go to Sheet 2!B4") switch the sheet and select the cell.

`hyperlinkSchemes` changes the allowed schemes. `onHyperlink` is called before a link opens; return `false` to stop it, for example to route links inside your app or to log them:

```tsx
<XlsxViewer source={file} onHyperlink={(link) => (link.kind === 'external' && !link.href.startsWith('https://') ? false : undefined)} />
```

## 9. Fonts

The viewer never downloads fonts. It maps the file's font names to installed fonts with metric-compatible fallbacks (`DEFAULT_FONT_MAP`): Calibri → Carlito, Cambria → Caladea, Arial → Liberation Sans, Times New Roman → Liberation Serif, Courier New → Liberation Mono, then the system font. Where the fallback is wider than the file's font, numbers still decide `####` with the file font's widths, so a total that fits in Excel doesn't turn into `####`. Add or override mappings with `fonts`:

```tsx
<XlsxViewer source={file} fonts={{ 'Corporate Sans': '"Inter", system-ui, sans-serif' }} />
```

## 10. Look and theme

The chrome (formula bar, headers, tabs, status bar) follows the system's light or dark mode; the sheet keeps the file's colours on white, as a document viewer does. Every chrome colour and the font are CSS custom properties on `.xv-viewer`:

```css
.my-app .xv-viewer {
  --xv-accent: #0b6e4f;        /* selection, focus rings, active tab */
  --xv-chrome-bg: #fafafa;
  --xv-header-bg: #eeeeee;
  --xv-font: 'Inter', system-ui, sans-serif;
}
```

The full list is at the top of `styles.css`. `className` and `style` go on the outer element.

## 11. Translation

Every UI string comes from `labels`, merged over the English `DEFAULT_LABELS`. Strings with numbers are functions, so you control the wording and the number format:

```tsx
<XlsxViewer source={file} labels={{ sheets: 'Blätter', cells: (n) => `${n.toLocaleString('de-DE')} Zellen`, linkOpen: 'Öffnen' }} />
```

The region's accessible name is `aria-label`, or the file name, or `labels.viewer`.

## 12. Server rendering and CSP

The package entry is marked `"use client"` and touches no `window` or `document` at import, so it can be imported from server components and SSR code. On the server it renders an empty shell; the grid renders on the client.

It works under a strict policy such as:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'
```

The stylesheet is a file you import, and cell styles are set through the CSSOM, which `style-src 'self'` allows. The viewer never injects `<style>` elements or `style` attributes into server HTML.

## 13. Using the viewer: keyboard, mouse, copy

- **Focus.** The grid is one tab stop. Tab moves into it, to the active cell; Tab and Shift+Tab leave it again. Arrow keys move between cells.
- **Mouse and touch.** Click selects a cell, Shift+click extends, Ctrl/Cmd+click adds a range, drag selects (and scrolls near the edges). Click a column or row header to select it, the corner to select everything. Touch: pan to scroll, tap to select.
- **Formula bar.** Shows the active cell's address and its formula (or its value as entered). The grid shows the results stored in the file; nothing is calculated. A formula without a stored result is shown empty, with a small corner mark and "Not calculated".
- **Status bar.** For a selection of more than one cell: the count, and for numbers the sum and the average, from the stored values. Zoom out, the zoom list (with "Fit width") and zoom in, and the `?` button for the keyboard shortcuts.
- **Copy.** Ctrl/Cmd+C copies the selection as tab-separated text and as an HTML table, so pasting into a spreadsheet, a document or an email keeps the layout. Up to 50,000 cells (`COPY_LIMIT`) at once.
- **Browser zoom** (Ctrl/Cmd + and −) is left to the browser and stacks with the viewer's zoom.
- **Find.** There is no find in the sheet yet. The browser's find (Ctrl/Cmd+F) only sees the rows and columns currently drawn; the viewer says so the first time.
- **Small screens.** Under 600 px wide the formula bar and status bar collapse to the essentials.

## 14. Keyboard reference

On macOS, use Cmd where the table says Ctrl, and Fn+arrows for Home, End, Page Up and Page Down. In a right-to-left sheet, Left and Right move in the direction you see. Press **Shift+?** in the grid for this list in the viewer.

| Keys | Action |
|---|---|
| Arrow keys | Move one cell (a merged cell counts as one; hidden rows and columns are skipped) |
| Ctrl + arrow | Move to the edge of the data |
| Home | Start of the row |
| Ctrl + Home | First cell of the sheet (after frozen rows and columns) |
| Ctrl + End | Last used cell |
| Page Up / Page Down | One screen up / down |
| Alt + Page Up / Alt + Page Down | One screen left / right |
| Shift + any of the above | Extend the selection |
| Ctrl + A | Select the used range; press again for everything |
| Shift + Space / Ctrl + Space | Select the row / the column |
| Ctrl + Page Up / Ctrl + Page Down | Previous / next sheet |
| Ctrl + C | Copy the selection |
| Alt + Enter | Open the active cell's hyperlink |
| Escape | Collapse the selection to the active cell; in the link chip, go back to the cell |
| Tab / Shift + Tab | Leave the grid |
| Shift + ? | Show the keyboard shortcuts |

In the sheet tabs: Left and Right move between tabs, Home and End go to the first and last, Enter or Space opens the sheet.

## 15. What isn't shown

This is phase 1, a read-only viewer. When a file has content the viewer doesn't draw yet (charts, images, comments, pivot tables, form controls, data connections, external links, macros), a notice above the grid says so and lists it, so nobody takes the sheet for complete when it isn't. Conditional formatting and data validation aren't shown yet either. Autofilter buttons are shown but can't filter. Nothing is calculated and macros never run, in any phase.
