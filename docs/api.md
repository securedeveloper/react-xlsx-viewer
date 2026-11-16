# react-xlsx-viewer 1.0: API and architecture design (phase 1, read-only viewer)

Status: **design, decided.** Afzal accepted all sixteen recommendations in [§12](#12-design-decisions) on 2026-11-16. Nothing here is implemented yet. The UX side (layout, keyboard, screen readers, look) is in [ux.md](ux.md).

Conventions follow javascript-excel's [docs/api.md](https://github.com/securedeveloper/javascript-excel/blob/main/docs/api.md) (cited below as "engine §n"):
- `[to verify]` marks a fact about Excel, a browser or a standard that must be checked before code relies on it.
- `[placeholder]` marks a number that has not been measured yet. No target in this document is a guess presented as a measurement.
- Version numbers are the plan, not a commitment.

## Contents

1. [Scope of phase 1](#1-scope-of-phase-1)
2. [Architecture: engine vs React package](#2-architecture-engine-vs-react-package)
3. [Engine addition A: the render model (`javascript-excel/render`)](#3-engine-addition-a-the-render-model-javascript-excelrender)
4. [Engine addition B: the number-format renderer (`javascript-excel/format`)](#4-engine-addition-b-the-number-format-renderer-javascript-excelformat)
5. [React API](#5-react-api)
6. [Loading files: worker, limits, progress, errors](#6-loading-files-worker-limits-progress-errors)
7. [Rendering: virtualised DOM grid](#7-rendering-virtualised-dom-grid)
8. [Feature coverage in phase 1](#8-feature-coverage-in-phase-1)
9. [Performance goals and how they are measured](#9-performance-goals-and-how-they-are-measured)
10. [Security model](#10-security-model)
11. [Packaging, runtime support, testing](#11-packaging-runtime-support-testing)
12. [Design decisions](#12-design-decisions)
13. [Task breakdown](#13-task-breakdown)

---

## 1. Scope of phase 1

Phase 1 is a **read-only viewer**: open an `.xlsx` (or `.xlsm`/`.xltx`/`.xltm`, read through the same decoder) or a `.csv`/`.tsv` and show it faithfully.

**In phase 1:**
- **Grid:** a virtualised DOM grid (rows and columns) with real `role="grid"` keyboard and screen-reader semantics.
- **Appearance:** cell styles (font, fill, borders, alignment, wrap, rotation, indent), merged cells, column widths and row heights, frozen panes, hidden rows and columns, right-to-left sheets, zoom.
- **Workbook navigation:** sheet tabs.
- **Number formats:** rendered with the file's format codes. This needs the engine's planned `/format` renderer ([§4](#4-engine-addition-b-the-number-format-renderer-javascript-excelformat)), added as JSE-18 (decided, §12 Q1).
- **Selection and copy:** selection by mouse, touch and keyboard, plus copy to the clipboard as text and as HTML.
- **Formula bar:** shows the formula text of the active cell. The grid shows Excel's **cached values**; nothing is evaluated.
- **Status bar:** shows a selection summary and the zoom.
- **Honest gaps:** a notice lists the content the file has but the viewer does not show (charts, images, comments and so on, from the reader's `UNSUPPORTED_PART` warnings).

**Not in phase 1** (later phases of the viewer plan):
- **Phase 2:** view-level toolbar (find, sort/filter views, freeze toggles).
- **Phase 3:** editing and recalculation (needs `javascript-excel/formula`).
- **Phase 4:** conditional formatting, data-validation dropdowns, comments, images and charts.
- **Never in any phase:** running macros.

The design must not block any of these (engine §13 guardrails). In particular:
- the render model is window-based, so it can move into a worker;
- cell rendering goes through one function that later phases extend (conditional formats, images);
- view state (zoom, freeze, selection) is separate from the workbook, so phase 2 can change it without editing the file.

## 2. Architecture: engine vs React package

The rule, as for react-data-export: **anything a Vue or vanilla viewer would also need belongs in javascript-excel.** react-xlsx-viewer adds the DOM, React state and interaction.

| Concern | Where | Why |
|---|---|---|
| Read `.xlsx`, parse CSV, limits, warnings | javascript-excel `/read`, `/csv` (exists) | Already there |
| Parse in a worker | javascript-excel `/worker` (exists) | Already there |
| **Render model:** geometry (column/row offsets in px, hidden = 0), merge map, resolved concrete styles, display text, hit testing, data-region edges for Ctrl+arrow, visible-index stepping | **javascript-excel `/render` (new, XLV-2)** | Pure functions of the workbook; a Vue or canvas viewer needs exactly the same; unit-testable in Node |
| **Number-format rendering:** `#,##0.00`, dates, sections, colours, `[h]:mm` | **javascript-excel `/format` (new, JSE-18)** | Needed by the viewer, by import previews and by `autoWidth`. The engine already decided it belongs there (engine §12 Q14) |
| Formula display text (strip `_xlfn.` and similar prefixes, array braces) | javascript-excel `/render` | Display rule, framework-free |
| Text measurement (overflow into neighbours, `####` for numbers that don't fit, shrink-to-fit, auto row height) | react-xlsx-viewer | Needs a browser (canvas `measureText`); the render model takes measurements as input |
| Virtualisation, DOM structure, ARIA, focus, keyboard map, selection state, clipboard, zoom, sheet tabs, formula bar, status bar, notices | react-xlsx-viewer | UI and interaction. Selection and keyboard logic is written as framework-free internal modules inside this repo, so a later `@…/viewer-core` split is cheap ([§12 Q13](#12-design-decisions)) |
| Look (CSS, icons, labels) | react-xlsx-viewer | Its own look, [ux.md §8](ux.md#8-visual-design-its-own-look) |

Data flow:

```
File / Blob / ArrayBuffer
  └─ detect format ─► worker: read() or parseCsv()          (javascript-excel, off the main thread)
        └─ Workbook<Cell> (structured clone to the main thread, §6)
              └─ createRenderSheet(workbook, sheetIndex, options)   (javascript-excel/render, main thread)
                    ├─ geometry: prefix sums over rows/cols ─► virtualiser: which rows/cols are on screen
                    └─ renderCell(r, c) for the visible window ─► React: <div role="gridcell"> with inline styles
```

The render model is **lazy**. Creating it costs O(rows + columns) for the offset tables plus one pass over `merges`. Per-cell work (style resolution, number formatting) happens only for cells that are rendered, and is cached. A 2M-cell sheet therefore does not need 2M view objects.

## 3. Engine addition A: the render model (`javascript-excel/render`)

A new subpath of javascript-excel, implemented as XLV-2 in the engine repo. It is framework-free and has no DOM access at import or call time, so it runs in Node tests and in a worker. It follows the engine's style: an opaque handle plus free functions over plain data. The model itself stays plain (engine §3.1). The handle only adds caches.

```ts
// javascript-excel/render
export function createRenderSheet(workbook: Workbook<Cell>, sheet: number, options?: RenderOptions): RenderSheet;

export interface RenderOptions {
  /** Number formatting. Default: `formatCell` from javascript-excel/format when the app passes it, else cellText (raw values). */
  format?: (cell: Cell, ctx: FormatContext) => FormattedValue;
  /** Locale for locale-dependent built-in formats and separators (§4). Default 'en-US' in the engine; the React viewer passes the browser's. */
  locale?: string;
  /** Maximum digit width of the workbook's default font, in px at 100 %. Default 7 (Calibri 11, engine §3.3). */
  maxDigitWidth?: number;
  /** Rows/columns of empty margin after the used range (§12 Q4). Default 50 rows, 10 columns (kept in XLV-3). */
  margin?: { rows?: number; cols?: number };
  /** Allowed hyperlink schemes. Default ['http', 'https', 'mailto'], as the writer (engine §12 Q16). */
  hyperlinkSchemes?: string[];
}

export interface RenderSheet { readonly __brand: 'RenderSheet' }   // opaque; caches inside

// Extent and view settings
export function sheetExtent(s: RenderSheet): { rows: number; cols: number };          // used range + margin, capped at 1,048,576 x 16,384
export function sheetSettings(s: RenderSheet): {
  freeze: { rows: number; cols: number };
  rightToLeft: boolean; showGridLines: boolean; showHeaders: boolean;
  zoom: number;                       // file zoom in percent, default 100
  activeCell: CellRef; selection: RangeRef | null;
  tabColor: string | null;            // '#RRGGBB'
};

// Geometry, in CSS px at zoom 100 %. Hidden rows/columns have size 0.
export function rowTop(s: RenderSheet, row: number): number;       // prefix sum, O(1)
export function rowHeight(s: RenderSheet, row: number): number;
export function colLeft(s: RenderSheet, col: number): number;      // logical (LTR) offset; RTL is mirrored by the DOM layer
export function colWidth(s: RenderSheet, col: number): number;
export function rowAt(s: RenderSheet, y: number): number;          // binary search, skips hidden rows
export function colAt(s: RenderSheet, x: number): number;

// Visibility and navigation
export function isRowHidden(s: RenderSheet, row: number): boolean;
export function isColHidden(s: RenderSheet, col: number): boolean;
export function step(s: RenderSheet, from: CellRef, dir: 'up' | 'down' | 'left' | 'right'): CellRef;        // next visible cell, merge-aware
export function edge(s: RenderSheet, from: CellRef, dir: 'up' | 'down' | 'left' | 'right'): CellRef;        // Ctrl+arrow: edge of the data region, Excel's rule
export function lastUsedCell(s: RenderSheet): CellRef;                                                      // Ctrl+End

// Merges
export function mergeAt(s: RenderSheet, row: number, col: number): { anchor: CellRef; range: RangeRef } | null;  // O(1) via a map built once

// Cells
export function renderCell(s: RenderSheet, row: number, col: number): RenderCell | null;  // null = nothing to draw (empty, unstyled, not covered by a merge)

export interface RenderCell {
  /** Displayed text, after number formatting. Rich text: `runs` instead. */
  text: string;
  runs?: Array<{ text: string; font: RenderFont }>;
  value: CellValue | null;            // cached value, for copy-as-value and the status bar
  type: CellType;
  formula?: string;                   // display form, '=' added, `_xlfn.` stripped (§3.2)
  arrayFormula?: boolean;             // shown in braces in the formula bar
  noCachedValue?: boolean;            // formula without a cached value: shown empty, marked (ux.md §5)
  style: RenderStyle;                 // concrete, frozen, shared between cells with the same xf
  merge?: { rows: number; cols: number };   // set on the anchor; covered cells return null
  hyperlink?:
    | { kind: 'external'; href: string; allowed: true; tooltip?: string }
    | { kind: 'external'; href: string; allowed: false; reason: 'scheme' | 'malformed' }
    | { kind: 'internal'; sheet: number | null; ref: string; tooltip?: string };
  /** Numbers and dates align right under 'general' alignment, text left, booleans/errors centre (Excel's rule). */
  autoAlign: 'left' | 'center' | 'right';
  /** From a format section colour such as [Red]: overrides the font colour. */
  formatColor?: string;
  /** From `*x` in a format: repeat x to fill the cell (§4). */
  fill?: string;
}

export interface RenderStyle {
  font: RenderFont;
  background: { kind: 'none' } | { kind: 'solid'; color: string }
    | { kind: 'pattern'; pattern: PatternType; fg: string; bg: string }
    | { kind: 'gradient'; gradient: 'linear' | 'path'; degree: number; stops: Array<{ position: number; color: string }> };
  /** Edges after resolving conflicts with the neighbour (§3.1). */
  border: { top?: RenderBorder; right?: RenderBorder; bottom?: RenderBorder; left?: RenderBorder; diagonalUp?: RenderBorder; diagonalDown?: RenderBorder };
  align: { horizontal: 'general' | 'left' | 'center' | 'right' | 'fill' | 'justify' | 'centerContinuous' | 'distributed'; vertical: 'top' | 'center' | 'bottom' | 'justify' | 'distributed'; wrap: boolean; shrink: boolean; indent: number; rotation: number | 'vertical'; direction: 'auto' | 'ltr' | 'rtl' };
}
export interface RenderFont { family: string; sizePt: number; color: string; bold: boolean; italic: boolean; underline: 'none' | 'single' | 'double' | 'singleAccounting' | 'doubleAccounting'; strike: boolean; vertAlign: 'baseline' | 'superscript' | 'subscript' }
export interface RenderBorder { style: BorderStyle; color: string }

// Copy
export function rangeAsTsv(s: RenderSheet, range: RangeRef, options?: { values?: 'displayed' | 'raw' }): string;
export function rangeAsHtml(s: RenderSheet, range: RangeRef): string;   // escaped <table> with inline styles, for text/html
export function rangeStats(s: RenderSheet, range: RangeRef, limit: number): { count: number; numericCount: number; sum: number; average: number | null; truncated: boolean };

export interface CellRef { row: number; col: number }
export interface RangeRef { start: CellRef; end: CellRef }
```

All colours in the render model are concrete `#RRGGBB` strings, resolved with `resolveColor` against the file's theme and indexed palette (engine §3.5.6). Consumers never see theme or indexed colours.

### 3.1 Rules the render model owns

- **Sizes.**
  - Column width in characters becomes px with the engine's file-width formula and `maxDigitWidth` (engine §3.3).
  - Row height in points becomes px as `pt × 96 / 72`.
  - Missing sizes use `defaultColWidth`/`defaultRowHeight`, then Excel's defaults: 8.43 characters, and 15 pt for Calibri 11 `[to verify: default row height per default font]`.
  - Hidden, or width/height 0, means size 0.
  - Pixel-exact layout is a non-goal (engine §1).
- **Style precedence.** The engine reader returns each cell's complete `xf` as `cell.style` (engine §3.5.7). Cells without a `<c>` element take the row style, then the column style, then the sheet default, which is how Excel shows them.
- **Shared style resolution.** The reader shares one frozen `Style` object per `xf` (engine §12 Q8). The resolved `RenderStyle` is therefore cached in a `WeakMap<Style, RenderStyle>`, so a 100k-cell sheet with 20 distinct formats resolves 20 styles.
- **Border conflicts.**
  - Two adjacent cells can both define their shared edge (A1's right border and B1's left border). The model draws one edge.
  - The heavier style wins (by a fixed weight order `[to verify: Excel's precedence on screen]`); on a tie, the right/bottom cell wins.
  - Each cell draws only its top and left edges, plus right/bottom at the sheet extent or at a merge boundary. No edge is drawn twice.
- **Merges.**
  - The anchor carries `merge.rows`/`merge.cols` and the anchor's style and value.
  - Covered cells return `null`, even if the file stores values there (Excel hides them, engine §3.6).
  - A merge that crosses a frozen boundary is clipped at the boundary, as Excel shows it `[to verify]`.
  - Hidden rows inside a merge shrink it.
- **Formula display.**
  - `=` is prefixed.
  - Prefixes `_xlfn.`, `_xlfn._xlws.` and `_xlpm.` are removed for display only `[to verify: the full prefix list]`.
  - Array formulas are flagged, so the formula bar shows `{=…}`.
  - The text is never parsed or evaluated.
- **Hyperlinks.**
  - External targets are checked against `hyperlinkSchemes`, case-insensitively, after trimming. Targets that fail are kept as text with `allowed: false`.
  - Internal locations (`'Sheet 2'!B4`, defined names) are resolved to a sheet index and a ref. A target that doesn't resolve gives `sheet: null`.
- **Data-region edges (Ctrl+arrow).**
  - From a non-empty cell whose neighbour is non-empty, move to the last non-empty cell before a blank.
  - Otherwise move to the next non-empty cell, or to the sheet edge.
  - Hidden rows and columns are skipped `[to verify against Excel for hidden cells]`.
  - This is computed on the sparse rows, so it costs O(cells in that row or column), not O(extent).

### 3.2 What the render model leaves to the DOM layer

- **Text measurement.** Overflow of long text into empty neighbours, `####` for numbers that don't fit, shrink-to-fit and auto-fit row heights for wrapped text without a stored height all need font metrics. The DOM layer measures with canvas `measureText` (an `OffscreenCanvas` where available) and caches by `(font, text)`. Auto-fit measures the rendered cells' laid-out text instead (wrapped lines, rotation and stacked text included) and passes the heights to `setRowHeights` in `javascript-excel/render`.
- **RTL mirroring.** The model works in logical columns, and the DOM layer mirrors. This keeps hit testing and navigation identical in both directions.
- **Zoom.** The model returns sizes at 100 %. The DOM layer multiplies sizes and font sizes by `zoom / 100` ([§7.4](#74-zoom)).

## 4. Engine addition B: the number-format renderer (`javascript-excel/format`)

The engine decided not to render number formats in 2.0 and planned `javascript-excel/format` for later (engine §3.5.5, §12 Q14; roadmap row 3.x). **The viewer can't be faithful without it.** Dates would show as ISO strings or serials, currency and percentages as bare numbers, and `[Red]` negatives in black. So this design adds (decided, §12 Q1):

> **JSE-18 · `javascript-excel/format`: number-format renderer.** Moves from the 3.x row of the engine roadmap to a 2.x minor, independent of the 2.1–2.5 phases (it touches no file parts). Prerequisite for viewer 1.0. Also used by `autoWidth` (formatted widths), import previews in react-data-import, and `fromTable`/`toCsv` "as displayed" options later.

API sketch (final names are decided in JSE-18):

```ts
// javascript-excel/format
export function formatValue(value: number | string | boolean | CellErrorValue | null, numFmt: NumFmt | undefined, options?: FormatOptions): FormattedValue;
export function formatCell(cell: Cell, ctx?: FormatContext): FormattedValue;          // the RenderOptions.format hook
export function compileFormat(code: string): CompiledFormat;                          // parsed once, cached by the caller or an internal LRU

export interface FormatOptions {
  locale?: string;          // BCP 47; default 'en-US'
  date1904?: boolean;       // serials are counted from the workbook's epoch
  /** Width in characters available for 'General' (Excel shortens General numbers to fit). Default 11 [to verify]. */
  generalWidth?: number;
}
export type FormatContext = FormatOptions;
export interface FormattedValue {
  text: string;
  color?: string;           // from [Red], [Color10], …, as '#RRGGBB'
  fill?: string;            // '*x' repeat character
  align?: 'left' | 'right'; // what General implies for this value
}
```

**Inputs are serials, not `Date`s.** The viewer reads with `dates: 'serial'` (engine §5.2), so formatting is a pure function of `(serial, code, locale, date1904)`. It doesn't depend on the viewer's time zone, and every Excel date and time rule (1900 leap-year bug, elapsed time) applies to the raw number. `formatValue` also accepts a `Date` by converting it with `dateToSerial`, for callers that read with dates on.

**What JSE-18 must cover** (ECMA-376 §18.8.31 `[to verify each against Excel]`):
- **Format structure:**
  - up to four sections (positive; negative; zero; text);
  - conditions (`[>=100]`);
  - colours (`[Red]` and the other seven names, `[ColorN]` 1–56 against the indexed palette).
- **Literals and layout:**
  - literals (`"text"`, `\x`, the characters Excel shows unquoted);
  - `_x` spacing;
  - `*x` fill.
- **Numbers:**
  - digit placeholders `0 # ?`;
  - decimal point;
  - thousands separator, and scaling by trailing commas;
  - `%`;
  - scientific `E+ E-`;
  - fractions `# ?/?` and `# ?/8`;
  - `@` text placeholder.
- **Dates and times:**
  - `d dd ddd dddd`, `m mm mmm mmmm mmmmm` (with the month/minute rule), `yy yyyy`;
  - `h hh m mm s ss`, `AM/PM` and `A/P`, fractional seconds `.0`–`.000`;
  - elapsed `[h] [m] [s]`;
  - the `e`/`g`/`b` era tokens where the locale supports them `[to verify]`.
- **Locale tags** `[$€-407]` and `[$-409]`. The tag's LCID selects separators and names. The currency symbol is printed as written.
- **Built-in ids:**
  - built-in ids 0–49 (engine §11.2);
  - the locale-dependent ones (14, 22, 27–36, 50–58) map to the locale's short-date and time patterns.
- **`General`:**
  - numbers with up to 11 characters (decimal or scientific, Excel's rule `[to verify]`), text as is, booleans `TRUE`/`FALSE`, errors as written.

**Locale data comes from the platform.** Month and day names, separators and short-date patterns come from `Intl.DateTimeFormat` and `Intl.NumberFormat`, so the module ships no locale tables. Excel replaces the `,` and `.` of a format code with the locale's group and decimal separators `[to verify]`. The module does the same with the `locale` option.

**Ground truth.** LibreOffice can export a workbook "as shown" to CSV in CI (the engine's conformance job already runs LibreOffice). That gives an automatic reference for thousands of `(value, code)` pairs. Where LibreOffice and Excel differ, Excel wins, and each difference is recorded in a manual-check table like the engine's `docs/conformance.md`.

**Until JSE-18 ships**, the render model falls back to `cellText`, so XLV-2 to XLV-4 aren't blocked. Viewer 1.0 is not released on the fallback.

## 5. React API

One component and one hook in phase 1, plus an imperative handle. The parts (grid, tabs, formula bar) are not exported separately yet ([§12 Q13](#12-design-decisions)).

```tsx
import { XlsxViewer, useWorkbook } from 'react-xlsx-viewer';
import 'react-xlsx-viewer/styles.css';

<XlsxViewer source={file} style={{ height: 600 }} />
```

### 5.1 `<XlsxViewer>`

```ts
export interface XlsxViewerProps {
  /** What to show. A File/Blob/ArrayBuffer/Uint8Array is read (§6); a Workbook is shown as is. */
  source: BinaryInput | File | Workbook<Cell> | null;
  /** 'auto' (default): zip signature means a workbook, else the File's name/type decides CSV/TSV; else an error. */
  format?: 'auto' | 'xlsx' | 'csv' | 'tsv';
  /** A worker running javascript-excel's exposeWorker (engine §5.5), or a factory. false = read on the main thread. Default: false; reading on the main thread doesn't block (§6.1). */
  worker?: Worker | (() => Worker) | false;
  /** Passed to read(): limits, sheets. `dates` is forced to 'serial' and `styles`/`formulas` to true. */
  readOptions?: Pick<ReadOptions, 'limits' | 'sheets'>;
  /** CSV only: delimiter and encoding, passed to parseCsv. */
  csvOptions?: Pick<CsvParseOptions, 'delimiter'> & { encoding?: string };

  // View state: each is controlled when the value prop is given, uncontrolled otherwise.
  sheet?: number;                defaultSheet?: number;            onSheetChange?: (index: number) => void;
  selection?: Selection;         defaultSelection?: Selection;     onSelectionChange?: (s: Selection) => void;
  zoom?: number;                 defaultZoom?: number;             onZoomChange?: (percent: number) => void;   // 10..400; default: the sheet's file zoom

  showFormulaBar?: boolean;      // default true
  showSheetTabs?: boolean;       // default true
  showStatusBar?: boolean;       // default true
  /** Override the file's showGridLines / showRowColHeaders. Default: as the file says. */
  showGridLines?: boolean;
  showHeaders?: boolean;
  /** Show sheets whose state is 'hidden' (never 'veryHidden'). Default false (§12 Q10). */
  showHiddenSheets?: boolean;

  /** Locale for number formats. Default: the browser's (navigator.language), see §12 Q9. */
  locale?: string;
  /** Font substitution: file font name → CSS font-family list (ux.md §8.3). Merged over the built-in map. */
  fonts?: Record<string, string>;
  /** Hyperlink schemes that may be opened. Default ['http', 'https', 'mailto']. */
  hyperlinkSchemes?: string[];
  /** Called before a link opens; return false to stop it (to route internal app links, or to log). */
  onHyperlink?: (link: { kind: 'external'; href: string } | { kind: 'internal'; sheet: number; ref: string }) => boolean | void;

  onLoad?: (result: { workbook: Workbook<Cell>; warnings: ExcelWarning[] }) => void;
  onError?: (error: unknown) => void;
  onWarning?: (w: ExcelWarning) => void;

  /** UI strings, for translation (ux.md §7). Merged over the English defaults. */
  labels?: Partial<ViewerLabels>;
  /** Accessible name of the viewer region. Default: the file name, or labels.viewer. */
  'aria-label'?: string;
  className?: string;
  style?: React.CSSProperties;   // the viewer fills its box: give it a height
}

export interface Selection { ranges: RangeRef[]; active: CellRef }   // ranges[0] contains active

export interface XlsxViewerHandle {
  scrollTo(cell: CellRef | string, options?: { select?: boolean }): void;   // 'B12' or 'Sheet 2'!B12
  select(selection: Selection): void;
  copy(): Promise<void>;                     // copies the selection like Ctrl+C
  focus(): void;                             // focuses the active cell
  getWorkbook(): Workbook<Cell> | null;
}
export const XlsxViewer: React.ForwardRefExoticComponent<XlsxViewerProps & React.RefAttributes<XlsxViewerHandle>>;
```

### 5.2 `useWorkbook`

The loading half on its own. It's for apps that want their own UI, or that show a workbook in several places.

```ts
export function useWorkbook(source: XlsxViewerProps['source'], options?: Pick<XlsxViewerProps, 'format' | 'worker' | 'readOptions' | 'csvOptions'>): {
  status: 'idle' | 'loading' | 'ready' | 'error';
  workbook: Workbook<Cell> | null;
  warnings: ExcelWarning[];
  error: unknown;                    // ExcelError (with code) or LimitError, see §6.2
  progress: Progress | null;
  abort(): void;                     // also called on unmount and when source changes
};
```

`<XlsxViewer source={workbook}>` accepts its result, so `useWorkbook` plus `<XlsxViewer>` is the composable path.

### 5.3 Exports

The package exports:
- `XlsxViewer`, `useWorkbook`;
- the types above;
- `DEFAULT_LABELS`, `DEFAULT_FONT_MAP`;
- re-exported engine types (`Workbook`, `Cell`, `ExcelWarning`, `ReadLimits`, `isExcelError`), as react-data-export does.

There is nothing at import time: no `window`/`document` access. The entry starts with `"use client"`.

## 6. Loading files: worker, limits, progress, errors

### 6.1 Reading

- **Format detection.** `detectFormat` (engine §5.2) decides for binary input. A zip goes to `read()`. `'cfb'`, `'xlsb'` and `'ods'` give the engine's `UNSUPPORTED_FORMAT`, which the UI turns into a specific message (ux.md §6). Input without a signature is CSV/TSV when the `File` name or type says so, or when `format` says so.
- **Read options.** `read()` always runs with `{ dates: 'serial', styles: true, formulas: true, richText: 'runs' }`. Serials make number formatting zone-independent (§4).
- **Worker.** With `worker`, the read runs through `createWorkerClient` (engine §5.5): the file bytes go to the worker (`transfer: true` for an `ArrayBuffer` the viewer created itself, never for the app's own buffer), and the `Workbook` comes back by structured clone.
  - The engine measured the **send** direction: for 600k cells, the calling thread is busy 6–254 ms depending on cell shape (engine §5.5, JSE-15).
  - The **receive** direction (the main thread deserialising a large workbook from a worker), measured in XLV-4 (§9.1): while a worker reads a 500,000-cell file, main-thread frames stay at p95 17.3 ms and max 17.4 ms, so receiving fits within a frame. That settles [§12 Q5](#12-design-decisions): the workbook can live on the main thread after a worker read.
  - **Reading on the main thread** (measured in XLV-3, §9.1): opening a 2.7 MB, 500,000-cell file took 442 ms to the first grid, with no long animation frame over 50 ms, because the reader yields while it inflates and parses. The worker is therefore optional, not a default requirement.
- **Why `worker` defaults to false.** The app owns the worker file (engine §12 Q15), so the viewer can't create one itself. The docs and the playground show the two-line worker file, and the README recommends it for files over a size measured in XLV-3.
- **Cancellation.** Changing `source`, unmounting or calling `abort()` aborts the read through `signal`.

### 6.2 Limits and errors

- **Limits.** The engine's `DEFAULT_READ_LIMITS` (engine §5.2, measured in JSE-6) apply unchanged. `readOptions.limits` can only be set by the app, never by the file. The README tells apps that show untrusted files to keep the defaults.
- **Errors.** Errors keep the engine's classes and codes. The UI maps codes to messages (ux.md §6): `UNSUPPORTED_FORMAT` with `details.format`, `NOT_XLSX`, `ZIP_INVALID`, `LimitError`, `XML_DTD_FORBIDDEN` and others. Any other error shows a generic message plus the code.
- **Warnings.** Warnings are collected. `UNSUPPORTED_PART` warnings (charts, images, comments, pivots, VBA, …) feed the "not shown" notice. The others are available through `onWarning`/`onLoad`.

## 7. Rendering: virtualised DOM grid

Decided by the plan: **DOM, not canvas**, for real accessibility. Canvas is evaluated only if DOM can't meet the targets in §9, and that decision is taken on measurements from XLV-3, not in advance.

### 7.1 Structure

```
<div class="xv-viewer" role="region" aria-label="…">
  <div class="xv-formula-bar">…</div>                       (ux.md §5)
  <div class="xv-scroll" dir="ltr|rtl">                     one scroll container
    <div role="grid" aria-label="Sheet: Sales" aria-readonly="true" aria-multiselectable="true"
         aria-rowcount="{extent rows + 1}" aria-colcount="{extent cols + 1}">
      <div role="row" aria-rowindex="1">                     column header row (sticky top)
        <div role="columnheader" aria-colindex="2">A</div> …
      <div role="row" aria-rowindex="{r + 2}">              one element per rendered sheet row
        <div role="rowheader" aria-colindex="1">{r + 1}</div>   (sticky start)
        <div role="gridcell" aria-colindex="{c + 2}" aria-colspan? aria-rowspan? aria-selected>…</div> …
  <div class="xv-tabs" role="tablist">…</div>               (ux.md §4)
  <div class="xv-status" role="status">…</div>
```

- **Indices.**
  - `aria-rowindex` and `aria-colindex` are the true sheet positions (plus 1 for the header row and column). Hidden rows leave gaps, so a screen reader announces row 7 right after row 5, as Excel's sheet does.
  - `aria-rowcount`/`aria-colcount` are the extent, not the number of rendered elements.
- **Merges.** Merged cells use `aria-rowspan`/`aria-colspan` (valid on `gridcell` in WAI-ARIA 1.2) and are positioned to cover the merged area.
- **Positioning.**
  - Cells are absolutely positioned inside their row, at `colLeft` × zoom.
  - The scroll container's inner size is `rowTop(extent) × zoom` by `colLeft(extent) × zoom`.
- **Frozen panes.**
  - Frozen rows and columns use `position: sticky` (top / `inset-inline-start`) inside the single scroll container.
  - Keeping one container keeps one grid in the accessibility tree and makes RTL work with logical properties.
  - Frozen regions larger than the viewport are clipped, as Excel does `[to verify]`.
- **Focus.**
  - Focus uses a roving `tabIndex`: the active cell has `tabIndex=0`, all others `-1`.
  - **The active cell is always rendered**, even when scrolled out of the window, so focus never lands on a removed node.
  - `aria-activedescendant` is not used: screen-reader support for it inside grids is uneven `[to verify in XLV-3's screen-reader pass]`.

### 7.2 Virtualisation

- **Window.** The visible window comes from the scroll offsets via `rowAt`/`colAt`, plus an overscan of 6 rows and 3 columns (`OVERSCAN`; with it the harness drops no frames, §9.1). It is recomputed on scroll in a `requestAnimationFrame`.
- **Always rendered.** Frozen rows and columns, merge anchors whose area intersects the window, and the active cell are always rendered.
- **Element reuse.** Row and cell elements are keyed by sheet position. React reconciles a scroll step as a shift, and style objects are reused (the render-model cache returns the same `RenderStyle`, and a second `WeakMap<RenderStyle, CSSProperties>` returns the same style object).
- **Browser element-size cap.** Browsers cap element sizes (on the order of tens of millions of px, varying by engine `[to verify per browser]`). A full 1,048,576-row sheet at 20 px would exceed some engines. Phase 1 therefore renders the **used range plus a margin** (§12 Q4). If a later phase needs the full grid, it adds scaled scrolling.

### 7.3 Cell content

- **Escaping.** Text is a React text node: never `innerHTML`, never `dangerouslySetInnerHTML`. Rich text renders as `<span>` runs with inline font styles.
- **Styles.** Styles are inline style objects, applied by React through the CSSOM, which a strict `style-src 'self'` CSP doesn't block. The react-data-export playground already shows this: its preview colours cells this way under the same CSP with no violations (RDE-1.18).
  - A constructable stylesheet with one class per distinct style is the alternative, if XLV-3 measures inline styles as too slow `[to verify: CSP treatment of constructable stylesheets]`.
- **Fills.**
  - Pattern fills use CSS gradients (no `url()`, so no `img-src` needs).
  - Gradient fills use `linear-gradient`/`radial-gradient`.
  - Diagonal borders use an inline `<svg>` element, not a data URL.
- **Overflow and `####`** follow Excel's rules:
  - general- or left-aligned, unwrapped text spills into empty neighbours in the reading direction;
  - centred text spills both ways;
  - numbers never spill; they show `####` when they don't fit.
  - Both need measurement (§3.2) and are computed for the rendered window plus the spill reach.
- **Rotation, vertical text, indent, shrink-to-fit, `fill` and `distributed` alignment** are covered in the table in §8.

### 7.4 Zoom

- **Scaling.** Zoom scales geometry and font sizes (`size × zoom / 100`), not a CSS `transform`. Transforms blur text, break `position: sticky` and complicate hit testing.
- **Range.** 10–400 %, Excel's range (engine §3.6). The default is the sheet's file zoom.
- **Browser zoom is untouched.** The browser's own zoom (Ctrl/Cmd +/−, Ctrl/Cmd+wheel) keeps working and stacks with the viewer's. The viewer never intercepts it. The viewer zoom has its own controls (ux.md §5.2).

## 8. Feature coverage in phase 1

| Feature | Phase 1 | Notes |
|---|---|---|
| Values: numbers, text, booleans, errors, rich text | Full | Errors as written, including `#SPILL!` |
| Number formats | Full, via JSE-18 | Fallback to raw values until JSE-18 |
| Font: family, size, bold, italic, colour, strike, super/subscript | Full | Family via the font map (ux.md §8.3) |
| Underline single/double; accounting variants | Approximate | Accounting underline spans the cell width in Excel; shown as single/double under the text |
| Solid fills; 18 pattern fills; gradient fills | Solid full; others approximate | Patterns as CSS gradients; visual check against LibreOffice (§11.3) |
| Borders: 14 styles, colours, diagonals | Approximate | `hair`, `dashDot*`, `slantDashDot` map to the nearest CSS style |
| Horizontal alignment: general, left, centre, right, justify, distributed | Full | `distributed` as `text-align: justify` plus `text-align-last` |
| `fill`, `centerContinuous` | Approximate | `fill` repeats the text; `centerContinuous` centres across empty neighbours |
| Vertical alignment, wrap, indent | Full | |
| Rotation (−90..90), vertical stacked text | Full | CSS `transform: rotate` on the content, `writing-mode` for stacked |
| Shrink to fit | Full | Measured font scaling |
| Reading order (context/LTR/RTL) per cell | Full | `dir` on the content |
| Merged cells | Full | |
| Column widths, row heights, defaults | Full | Wrapped rows without a stored height: auto-fit by measurement (§12 Q11) |
| Hidden rows/columns | Full | Not rendered, skipped by navigation, marked in the headers (ux.md §2) |
| Outline levels (grouping) | Shown as hidden/visible only | Expand/collapse buttons are phase 2 |
| Frozen panes | Full | Split (non-frozen) panes are ignored by the reader with a warning |
| Right-to-left sheets | Full | |
| Show grid lines / headers (file setting) | Full | Overridable by props |
| Zoom | Full | |
| Sheet tabs, tab colours, hidden sheets | Full | `veryHidden` sheets are never shown |
| Active cell / selection from the file | Full | Initial selection |
| Hyperlinks (external, internal) | Full | Scheme allowlist; link chip (ux.md §5.3) |
| Formula bar (formula text, cached value) | Full | No evaluation |
| Selection, copy (TSV + HTML) | Full | Size limit, §9 |
| Status bar: count, sum, average of selection | Full | Over cached values; bounded (§12 Q12) |
| CSV / TSV | Full | One sheet, no styles, General formatting |
| Conditional formatting, data validation, comments, images, charts, sparklines, pivots | No | Phase 4; listed in the "not shown" notice |
| Find (Ctrl+F) | No | Phase 2. The browser's find only sees rendered cells (ux.md §3.4) |
| Printing | No | |

## 9. Performance goals and how they are measured

Targets are stated as **measurable goals**. Where a threshold is a public guideline, it is cited. Where it depends on this code, XLV-3's harness set it from measurement (§9.1). There are no invented numbers.

| Goal | Metric | Threshold | Method |
|---|---|---|---|
| Scrolling stays smooth | p95 frame duration during a scripted scroll (vertical, horizontal, diagonal) over the largest fixture | ≤ 16.7 ms (one frame at 60 Hz) | rAF timestamps plus Long Animation Frames entries, in Playwright Chromium; Firefox and WebKit reported, not gated |
| Keyboard and click response | Interaction to Next Paint for arrow keys, PageDown, Ctrl+End, click and shift-click | ≤ 200 ms ("good" INP per Core Web Vitals); the XLV-3 baseline (§9.1) is the reference CI compares with | `PerformanceEventTiming` in the harness; keydown → next frame for synthetic events |
| Rendered DOM stays bounded | Number of `gridcell` elements while scrolling | ≤ (visible rows + overscan) × (visible cols + overscan) + frozen + merges; must not grow with sheet size | DOM count after each scroll step |
| Main thread stays free while loading | Longest task on the main thread between "file chosen" and "first cells painted" | No long animation frame (> 50 ms) while opening a file; XLV-3 baseline: none for 500,000 cells (§9.1) | Long Animation Frames API |
| Time to first cells | "File chosen" mark → first grid paint | Reported per fixture size; XLV-3 baseline in §9.1 | `performance.now()` around mount, until the grid is painted |
| Memory | JS heap per file after a full GC: the model, the render model, the mounted viewer, and what stays after release | Render-model overhead O(rows + cols + distinct styles + rendered cells), not O(cells); viewer overhead independent of file size; nothing retained after unmount. XLV-4 baseline in §9.1 | `Runtime.getHeapUsage` after `HeapProfiler.collectGarbage` over CDP, from the harness's `heapUsed` command |
| Copy doesn't freeze | Time to build TSV + HTML for the copy limit | ≤ 200 ms (INP "good") on the CI runner, which set `COPY_LIMIT` to 50,000 cells (153 ms there) | Harness |
| Bundle size | Minified + gzipped size of `XlsxViewer` with its engine imports | Reported per PR; XLV-3 baseline 30.3 KiB gzipped initially, 56.7 KiB with the lazily loaded reader (§9.1). A budget follows once the viewer is feature-complete | `scripts/bundle-size.mjs` (Vite, React external) in the `Performance` job |

**Fixtures** come from the engine's corpus generator (`test/fixtures/read/generate_corpus.py`): dense numbers, unique strings, heavily styled, many merges, wide (16k columns), tall (1M rows), RTL, frozen and hidden rows/columns. They are generated in CI, not committed.

**CI job.** A `Performance` job reports every metric in the job summary on each PR. It is non-required until the baseline is stable, then the thresholds above gate. Machine-dependent numbers are compared with the same job's `main` baseline, not with absolute values.

### 9.1 Measured in XLV-3 and XLV-4

`npm run perf -w react-xlsx-viewer` (`test/perf`, Vitest browser mode in Chromium; the CI job `Performance` runs it and reports to its summary). The fixture is a 2,000,000-cell workbook (200,000 rows × 10 columns) with shared styles, a frozen row and column, merges and hidden rows; the viewport is 1280 × 800 and the viewer 1200 × 700. "Local" is headless Chromium 150 on an Apple M2 laptop. "CI" is two runs of the `Performance` job on GitHub's `ubuntu-latest`, whose shared runners vary noticeably from run to run. Measured 2026-11-16. Times are ms, p50 / p95 / max.

| Measure | Local | CI (two runs) |
|---|---|---|
| Scroll frames, vertical | 16.7 / 17.2 / 17.7; 0 dropped | 16.7 / 16.8 / 16.8, 0 dropped; 16.7 / 33.3 / 33.4, 20 of 300 dropped |
| Scroll frames, diagonal | 16.7 / 17.2 / 17.6; 0 dropped | 4 and 9 of 200 dropped |
| Long animation frames while scrolling | 0 | — |
| React commit while scrolling | 3.7 / 8.7 / 22.7 | 4.9 / 10 / 22.1; 7.9 / 15.1 / 30.4 |
| Rendered gridcells | at most 820, for 2,000,000 cells | 820 |
| Arrow key → next frame | 16.7 / 17.4 / 17.7 | 16.7 / 18.1–18.9 / ≤ 22.3 |
| Shift+arrow, click → next frame | ≤ 17.5 p95 | ≤ 25.6 p95 |
| PageDown → next frame | 29.7 / 52.7 / 57.4 | 27.8–43.3 / 53.5–69.1 / ≤ 77.7 |
| Ctrl+arrow, Ctrl+Home/End → next frame | 28.9 / 40.8 / 40.8 | p95 74.8–101.9 |
| First cells, 2,000,000-cell workbook object | 145 | 211–266 |
| Open a 2.7 MB `.xlsx` (500,000 cells) on the main thread | 442 to the grid; no long animation frame | 584–828; no long animation frame |
| Copy, TSV + HTML | 10k 20; 100k 174; 500k 851 | 10k 30–39; 50k 153; 100k 249–302; 500k 1,333–1,622 |
| Selection summary (`rangeStats`) | 1M cells 19 | 1M cells 17–22 |
| Open the 2.7 MB `.xlsx` through a worker (`worker` prop, XLV-4) | 636 to the grid; no long animation frame | — |
| Worker read of that file: main-thread frames while it runs (XLV-4) | 16.7 / 17.3 / 17.4; read 540 | — |
| Scroll frames with auto-fit: 20,000 rows, every row wraps (XLV-5) | 16.7 / 17 / 17.6, 0 dropped; commit 1.2 / 8.4 / 11; no long animation frame | 16.7 / 16.8 / 33.4, 11 of 300 dropped; commit 1.7 / 9.7 / 17.3; no long animation frame (the same run's plain vertical scroll dropped 53 of 300) |
| Memory, 500,000-cell file, JS heap after a full GC (XLV-4) | model 25.8 MB (54 bytes/cell); render model ≈ 0 MB of JS heap (its offset tables are ArrayBuffers, about 8 bytes per row and column); mounted viewer +3.3 MB; 0 MB retained after release | — |
| Bundle (Vite, minified + gzip, React external) | 96.8 / 30.3 KiB initially (viewer, render model, number formats); 184.1 / 56.7 KiB with the lazily loaded reader and CSV parser; `styles.css` 8.4 / 2.3 KiB | same |

**What the measurements set:**
- **Overscan:** 6 rows and 3 columns. Locally no frames are dropped, and on CI they drop only in the noisier run.
- **`COPY_LIMIT`:** 50,000 cells, under 200 ms on the CI runner.
- **`STATS_LIMIT`:** 1,000,000 cells, at most 22 ms.
- **Worker:** stays optional (§6.1).
- **Keyboard and click:** every interaction stays well under the 200 ms INP "good" threshold on both machines.

**Changes the harness forced:**
- **Rows are memoised,** so scrolling renders only the rows that enter the window. Before that, the local p95 frame was 33 ms.
- **A zoom-unit bug** was found in the browser that jsdom couldn't show; a browser test now covers it.

**Scroll smoothness on CI** depends on the runner. The `Performance` job is therefore non-required and reports rather than gates, as planned. Gating can compare against `main`'s own runs once enough of them exist.

**Canvas decision rule.** If the scroll and INP goals can't be met by the DOM grid on the largest fixtures after profiling, a canvas renderer is evaluated with an ARIA grid overlay, and its design is a separate document. Until then, DOM.

## 10. Security model

**Threat model.** The viewer shows files from anyone: email attachments, uploads, URLs. An attacker controls every byte of the file. Goals:
- no script execution;
- no network requests caused by the file;
- no UI spoofing through the file's content;
- bounded memory and CPU;
- safe behaviour under a strict CSP.

| Threat | Defence |
|---|---|
| Parser attacks (zip bombs, XXE, deep nesting, huge strings, prototype pollution) | The engine reader's defences and limits (engine §8), on by default; the viewer only passes limits the app sets |
| Formula execution | Formulas are never evaluated. Formula text is displayed as a text node. Cached values are shown. No DDE, no external links, no data connections |
| HTML/script injection through cell text, sheet names, tooltips, fonts, number-format literals | Everything from the file is rendered as React text nodes or set through CSSOM style properties. No `innerHTML`, no `dangerouslySetInnerHTML`, no `eval`/`new Function`. Clipboard HTML is built by an escaping serialiser (`rangeAsHtml`) and tested with hostile strings |
| CSS injection through style values | The render model emits only concrete values: `#RRGGBB` colours, numbers, enum keywords. Font family names from the file are quoted CSS strings, assigned as one property (`style.fontFamily`), so they can't add declarations |
| Malicious hyperlinks (`javascript:`, `data:`, look-alike text) | Scheme allowlist (default `http`, `https`, `mailto`), checked again at click time. Links open with `rel="noopener noreferrer"`. The link chip shows the **real target** before it opens, so display text can't disguise it (ux.md §5.3). `onHyperlink` lets the app veto. Disallowed links are plain text with an explanation |
| Network access caused by a file (tracking pixels, external images, fonts, linked data) | Phase 1 fetches nothing. Fonts are never downloaded (font map uses installed fonts only, ux.md §8.3). Images and external links are not read. Phase 4 images come from the package's own parts as `blob:` URLs, never remote |
| Macros | `.xlsm` VBA parts are not read (engine §5.2) and never run |
| UI spoofing (a sheet styled to look like a login form or the app's own UI) | The grid is visually contained: its own border, headers and sheet tabs stay visible. Cell content can't draw outside its cell area except text overflow into empty cells |
| Resource exhaustion in rendering | Bounded DOM (§9), copy and status-bar limits, and a measurement cache with an LRU bound |
| Clipboard | Copy only on user action (Ctrl/Cmd+C or the handle's `copy()`), through the `copy` event or `navigator.clipboard.write`. The viewer never reads the clipboard (no paste in a read-only viewer) |

**CSP.** The viewer works under the policy the family's playgrounds use:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

- **No inline styles in HTML.** The package CSS is a file the app imports (no runtime `<style>` injection). Cell styles go through the CSSOM.
- **No SSR of the grid.** The viewer renders an empty shell on the server and the grid only on the client, so no `style="…"` attributes appear in server HTML that `style-src 'self'` would block.
- **Workers.** A worker needs `worker-src 'self'` with the app-owned worker file.
- **CI check.** The playground ships this CSP in `vercel.json`, served by `vite preview` too, and CI checks the console for CSP violations.

## 11. Packaging, runtime support, testing

### 11.1 Package

Layout follows the family: npm workspaces, `packages/react-xlsx-viewer`, `apps/playground` (Vercel).

| Item | Value |
|---|---|
| Format | ESM only; `exports` with `types` conditions; `sideEffects: ["*.css"]` |
| Entry points | `react-xlsx-viewer` (component, hook, types), `react-xlsx-viewer/styles.css` |
| Peer dependencies | `react` and `react-dom` ≥ 18 (§12 Q3) |
| Dependencies | `javascript-excel` (≥ the release with `/render` and `/format`); nothing else |
| TypeScript | Built with TS 7 and isolatedDeclarations; consumer floor 5.0, like the engine (engine §9.3) |
| SSR | `"use client"`; the server renders the empty shell |

### 11.2 Runtime support

The browsers in the engine's matrix (engine §9.3: Chrome/Edge 103+, Firefox 113+, Safari 16.4+), unless a viewer API raises the floor:
- `position: sticky` and CSS logical properties are older than those versions.
- `OffscreenCanvas` is used only when present.

Node is only for SSR (shell) and tests.

### 11.3 Testing

| Layer | Tests |
|---|---|
| Render model (engine, XLV-2) | Vitest in Node: geometry, merges, border resolution, navigation (`step`, `edge`), hyperlink checks, TSV/HTML escaping with hostile strings |
| Number formats (engine, JSE-18) | Table tests per token class; generated reference corpus from LibreOffice "as shown" export in CI; manual Excel checks in a conformance table |
| React (XLV-3+) | Vitest browser mode (Playwright Chromium, as the engine): keyboard map, focus retention while scrolling, selection, copy payloads, ARIA attributes, RTL mirroring, zoom |
| Accessibility | Automated audit in the browser tests (axe-core as a devDependency, to be explained in its PR), Lighthouse on the playground, and a manual screen-reader checklist (ux.md §9) per release |
| Visual (XLV-8) | Screenshots of fixture sheets compared with reviewed baselines (gating), and with LibreOffice's PDF/PNG rendering of the same files (reported, not gating: it measures fidelity, LibreOffice isn't Excel) |
| Performance (XLV-3) | The harness and `Performance` job in §9 |
| Security | Fixture files with hostile content: script-like text in cells, sheet names and number-format literals; `javascript:` links; huge merges; deep styles. Each must render as text with no console CSP violations |

## 12. Design decisions

Each question had a recommendation, and Afzal accepted all sixteen on 2026-11-16. The sections above state the outcome as the design. The numbering is kept stable so references such as "§12 Q4" stay valid.

**Q1. Number-format renderer timing.** Viewer 1.0 needs `javascript-excel/format`, which the engine roadmap places in 3.x.
- *Decided (2026-11-16):* add **JSE-18** and ship `/format` as a 2.x minor, before viewer 1.0 and independent of 2.1–2.5. It is self-contained (no file parts), and import previews and `autoWidth` benefit too.

**Q2. Render model in the engine.**
- *Decided (2026-11-16):* yes, as `javascript-excel/render` (XLV-2, built in the engine repo), as the plan's architecture note says. A Vue or canvas viewer reuses it, and it tests in Node. The React package keeps only DOM and interaction.

**Q3. React floor.**
- *Decided (2026-11-16):* **React 18+**. A new package has no 17 users to keep. React 17.0.2 dates from 2021, and 18 brings `useId` and `useSyncExternalStore`, both useful for a stateful grid. react-data-export keeps 17 because it has existing users.

**Q4. Grid extent.**
- *Decided (2026-11-16):* used range plus a margin (default 50 rows and 10 columns), not the full 1,048,576 × 16,384 grid. It avoids browser element-size caps and gives screen readers a meaningful `aria-rowcount`. Full-grid scrolling can come with editing (phase 3), when empty cells become useful.
- *Implemented (XLV-6, #17):* the viewer's margin is at least 50 rows and 30 columns, and at least as many default-size rows and columns as fill the viewport at the current zoom. A small sheet therefore never ends inside the viewer. The margin only grows, in steps of 10, as the viewer grows or zooms out. A rebuild of the same sheet keeps the auto-fitted row heights, the selection, the zoom and the scroll position.

**Q5. Where the workbook lives.**
- *Decided (2026-11-16):* in phase 1, on the main thread, after a worker read. The render model API is window-based (`renderCell`, `rowTop`, …), so a later version can keep the workbook in the worker and fetch windows asynchronously, if XLV-3 measures the receive cost as too high for large files.

**Q6. Tab key.** Excel moves one cell right on Tab; the WAI-ARIA grid pattern makes the grid one tab stop and Tab leaves it.
- *Decided (2026-11-16):* follow WAI-ARIA (Tab leaves the grid), so keyboard users are never trapped in a large sheet. Arrow keys move between cells.

**Q7. Hyperlink activation.** Excel follows a link on click, which makes selecting a link cell awkward and shows only the display text.
- *Decided (2026-11-16):* a click selects. A link chip under the selected cell shows the real URL and opens it; Alt+Enter also opens it (ux.md §5.3). Ctrl/Cmd+click keeps its selection meaning (add a range). This is safer against disguised links.

**Q8. Dark mode.** Cell colours come from the file, and most files assume white paper.
- *Decided (2026-11-16):* the viewer's chrome (formula bar, tabs, headers, status bar) follows `prefers-color-scheme`. The sheet area keeps the file's colours (white default) in both themes, as a document viewer would. An adaptive option that inverts default-coloured cells can come later if asked.

**Q9. Locale default.**
- *Decided (2026-11-16):* the browser's locale (`navigator.language`), overridable by `locale`. That matches how Excel renders locale-dependent formats on the reader's machine. Custom format codes still render as written (engine §12 Q5), with the locale's separators.

**Q10. Hidden sheets.**
- *Decided (2026-11-16):* not shown by default. `showHiddenSheets` shows `hidden` sheets (marked as hidden in the tab). `veryHidden` sheets are never shown, as in Excel's UI.

**Q11. Rows with wrapped text and no stored height.** Excel auto-fits them on open.
- *Decided (2026-11-16):* auto-fit by measurement for those rows only, inside the rendered window, and adjust the offsets when they come into view. Rows with a stored height always use it.
- *Risk:* scroll positions shift as rows are measured.
- *Implemented (XLV-5, #14):*
  - **Measuring.** After each render, the grid measures cells it hasn't measured yet, in rows without a stored height. Rows only grow, from the default up to 409 pt, and merged cells are skipped, as in Excel.
  - **The shift.** The row at the top of the scrolling pane stays in place: when rows above it grow, the grid moves the scroll position by the same amount. Native `overflow-anchor` is off, so every browser behaves the same.
  - **Rotated text** turns about the cell's centre and isn't clipped to the column first.
  - **Cost.** The Performance harness scrolls a 20,000-row sheet where every row wraps (row "Scroll frames with auto-fit" in §9.1).

**Q12. Status-bar aggregates.**
- *Decided (2026-11-16):* count, numeric count, sum and average of the selection's cached values, computed up to a limit (1,000,000 cells, 19 ms in the harness, §9.1), with "≥" shown past it. This is arithmetic on cached values, not formula evaluation.

**Q13. Composable parts.**
- *Decided (2026-11-16):* phase 1 exports `<XlsxViewer>` and `useWorkbook` only. Grid, tabs and formula bar become separate exports in phase 2, once the toolbar shows which seams are real. Exporting them now would freeze an API before it has a second user.

**Q14. Component name.**
- *Decided (2026-11-16):* `XlsxViewer` (matches the package name, and it also opens CSV). The alternative `SpreadsheetViewer` is more generic but doesn't match the package.

**Q15. Copy guard.** Copying text that starts with `=` and pasting it into another spreadsheet as TSV can create a formula there.
- *Decided (2026-11-16):* no guard on copy. The user copies what they see into their own clipboard, and Excel does the same. The engine's CSV guard stays for files sent to others. Document it.

**Q16. Fonts.**
- *Decided (2026-11-16):* never download fonts. Map file fonts to installed fonts with metric-compatible fallbacks (for example Calibri → Carlito, Cambria → Caladea, Arial → Liberation Sans, then the system sans-serif), via `DEFAULT_FONT_MAP` plus the `fonts` prop. No network, works under CSP, and layout stays close where those fonts are installed.

## 13. Task breakdown

Updated from the plan's sketch. Each task is one branch and one PR.

| ID | Repo | Task | Depends on |
|---|---|---|---|
| XLV-0 | viewer | This design (api.md, ux.md) | — |
| JSE-18 | engine | `javascript-excel/format` number-format renderer (§4) | — |
| XLV-1 | viewer | Scaffold: workspaces, package, playground shell with CSP, CI (Node 22/24, browser tests) | XLV-0 decided |
| XLV-2 | engine | `javascript-excel/render`: render model (§3) | XLV-0 decided |
| XLV-3 | viewer | Virtualised grid, ARIA, focus, keyboard, performance harness and `Performance` job; measures every `[placeholder]` | XLV-1, XLV-2 |
| XLV-4 | viewer | Styles, merges, freeze, hidden rows/cols, RTL, zoom, sheet tabs, notices | XLV-3 |
| XLV-5 | viewer | Number formats wired to `/format`; locale; `####` and overflow measurement | JSE-18, XLV-4 |
| XLV-6 | viewer | Formula bar, selection, copy, status bar, hyperlinks and link chip | XLV-4 |
| XLV-8 | viewer | Fixtures, visual regression, LibreOffice comparison, security fixtures | XLV-4 |
| XLV-9 | viewer | Docs: README, guides, keyboard reference, screen-reader checklist results | XLV-6 |
| XLV-11 | viewer | Playground: open a sample or your own file; Vercel notes | XLV-4 |
| XLV-10 | viewer | 1.0.0 release (pre-releases before) | all above |

XLV-7 (view-level toolbar) is phase 2.
