# react-xlsx-viewer 1.0: UX design (phase 1, read-only viewer)

Status: **proposal (XLV-0), awaiting Afzal's decisions** in [api.md §12](api.md#12-open-questions-and-recommendations). The API and architecture are in [api.md](api.md). `[to verify]` and `[placeholder]` mean what they mean there.

The viewer follows familiar spreadsheet conventions: a grid with lettered columns and numbered rows, sheet tabs at the bottom, a formula bar on top. That way, people who know any spreadsheet program can use it without learning anything. It has **its own look**. It uses no Microsoft names, icons, colours or trade dress, and its labels say "workbook", "sheet" and "cell" (§8).

## Contents

1. [Layout](#1-layout)
2. [The grid](#2-the-grid)
3. [Keyboard, mouse and touch](#3-keyboard-mouse-and-touch)
4. [Sheet tabs](#4-sheet-tabs)
5. [Formula bar, link chip and status bar](#5-formula-bar-link-chip-and-status-bar)
6. [Loading, errors and "not shown" notices](#6-loading-errors-and-not-shown-notices)
7. [Screen readers and text](#7-screen-readers-and-text)
8. [Visual design: its own look](#8-visual-design-its-own-look)
9. [Accessibility checklist](#9-accessibility-checklist)
10. [Small screens](#10-small-screens)

---

## 1. Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ [ B4      ]  =  =SUM(B1:B3)                                           │  formula bar: address box, formula/value
├────┬──────────┬──────────┬──────────┬──────────────────────────────────┤
│    │    A     │    B     │    C     │ …                                │  column headers (sticky)
├────┼──────────┼──────────┼──────────┤                                  │
│  1 │ Region   │ Sales    │          │                                  │  frozen rows stay while scrolling
│  2 │ North    │ 1,250.50 │          │                                  │
│  …                                                                     │
├────┴──────────┴──────────┴──────────┴──────────────────────────────────┤
│ ‹ › │ Sales │ Costs │ Summary │                                        │  sheet tabs
├──────────────────────────────────────────────────────────────────────┤
│ 3 cells · Sum 2,230.50 · Average 1,115.25        [−] 100 % [+]        │  status bar, zoom
└──────────────────────────────────────────────────────────────────────┘
```

- **Size.** The viewer fills the box the app gives it, so the app sets a height. Without a height, it uses a minimum of [placeholder] px and logs a development warning.
- **Optional areas.** The formula bar, sheet tabs and status bar can each be turned off (`showFormulaBar`, `showSheetTabs`, `showStatusBar`). An app embedding a one-sheet preview might show the grid alone.
- **Direction.** The chrome follows the document's direction (`dir` on an ancestor). A right-to-left **sheet** flips only the grid (column A on the right, row headers on the right), as in spreadsheet programs. The chrome stays in the app's direction.
- **No toolbar in phase 1.** Zoom lives in the status bar. Find, sort/filter views and freeze toggles come in phase 2.

## 2. The grid

- **Headers.** Column letters across the top, row numbers down the side, both sticky. The headers of selected rows and columns are highlighted.
- **Hidden rows and columns** aren't drawn. A thin double line between neighbouring headers (between 4 and 7, say) marks the gap, with a tooltip "Rows 5–6 hidden". Navigation skips them.
- **Frozen panes.** A slightly heavier divider line separates the frozen part from the scrolling part, as spreadsheet programs do.
- **Grid lines** follow the file's setting. They are drawn in a light neutral colour and hidden under filled cells, as on paper.
- **Selection.**
  - A 2 px outline in the accent colour around the selection, with a translucent tint over the range.
  - The active cell has no tint, so its content stays readable.
  - Multiple ranges (Ctrl/Cmd+click) each get an outline.
  - In forced-colours mode (Windows High Contrast), the outline uses the system `Highlight` colour.
- **Empty margin.** After the used range, the grid continues for a margin (api.md §12 Q4) and then ends with a plain edge.
- **Formula without a cached value.** The cell is empty with a small corner marker. Its tooltip and the formula bar say: "Not calculated: this file has no stored result for this formula, and the viewer doesn't calculate formulas."
- **Disallowed hyperlink** (for example `javascript:`). The cell shows its text, unstyled as a link. Selecting it shows "Link not opened: unsupported address" in the link chip.

## 3. Keyboard, mouse and touch

### 3.1 Keyboard

The grid is **one tab stop** (WAI-ARIA grid pattern). Tab and Shift+Tab move focus out of it (api.md §12 Q6). On macOS, Cmd replaces Ctrl, and Fn+arrows give Home/End/PageUp/PageDown.

| Key | Action |
|---|---|
| Arrow keys | Move one visible cell. A merged cell counts as one. In an RTL sheet, Left/Right move in the visual direction `[to verify against Excel]` |
| Ctrl + arrow | To the edge of the data region (Excel's rule, api.md §3.1) |
| Home / Ctrl+Home | Start of the row / first cell of the sheet (below and after frozen panes, as Excel `[to verify]`) |
| Ctrl+End | Last used cell |
| PageUp / PageDown | One screen up/down |
| Alt+PageUp / Alt+PageDown | One screen left/right |
| Shift + any of the above | Extend the selection |
| Ctrl+A | Select the used range; again: everything in the extent |
| Shift+Space / Ctrl+Space | Select the row / column |
| Ctrl+PageUp / Ctrl+PageDown | Previous / next sheet. Focus stays in the grid at that sheet's remembered cell |
| Ctrl+C | Copy the selection (§3.3) |
| Alt+Enter | Open the active cell's hyperlink (after the scheme check) |
| Escape | Collapse the selection to the active cell; closes the link chip |
| Ctrl + / Ctrl − | **Left to the browser** (page zoom). The viewer's zoom has its own controls |

Every key in this table is listed in a "Keyboard shortcuts" dialog, opened from the status bar (a `?` button) and with Shift+? while the grid has focus.

### 3.2 Mouse and touch

- **Click** selects a cell. **Shift+click** extends. **Ctrl/Cmd+click** adds a range. **Drag** selects, and auto-scrolls near the edges.
- **Header clicks.** Clicking a column or row header selects the column or row, and dragging across headers selects several. Clicking the corner selects all.
- **Link chip.** Clicking a link cell selects it and shows the link chip (§5.3). Links open only from the chip or with Alt+Enter, never from a plain click or Ctrl/Cmd+click, so those keep their selection meanings.
- **Scroll wheel** scrolls vertically, Shift+wheel horizontally. Trackpads scroll natively.
- **Touch.** Pan scrolls natively, tap selects, and tapping a second cell with the selection handle extends. No long-press menus in phase 1.
- **No hover-only information.** Tooltips (number format, hidden-row markers) also appear on focus or selection.

### 3.3 Copy

- **What is copied.** Ctrl+C, or the handle's `copy()`, writes two forms:
  - `text/plain`: tab-separated displayed text, rows separated by CRLF, with merged areas as their anchor value;
  - `text/html`: a `<table>` with basic inline styles.

  Pasting into another spreadsheet, a document or an email keeps the layout.
- **Size limit.** Above [placeholder] cells (api.md §9), the viewer asks first: "Copy 2,400,000 cells? This may take a moment." Above a hard limit it refuses, with a message.
- **Confirmation.** A short "Copied 12 cells" appears in the status bar. It is announced politely (§7).
- **No paste and no cut.** This is a read-only viewer.

### 3.4 Find

- **The gap.** Phase 1 has no find. The browser's find (Ctrl+F) only searches the cells currently rendered.
- **Documentation.** The docs say so.
- **The notice.** The first Ctrl+F press while the grid has focus shows a dismissible hint: "Search in the sheet comes in a later version; the browser's find only sees the visible part." The browser's find still opens; the viewer doesn't block it. Phase 2 adds a real find.

## 4. Sheet tabs

- **Tab pattern.**
  - A WAI-ARIA `tablist` with one tab per visible sheet, in file order. The grid is the tab panel.
  - Arrow keys move between tabs, Home/End go to the first/last, and Enter or Space activates.
  - Activation is manual, so a 50-sheet workbook doesn't load each sheet the user arrows past.
- **Initial sheet.** The active sheet from the file (`workbook.activeSheet`) is selected on load.
- **Tab colours** show as a coloured bar on the tab. Text contrast is kept by never filling the label with the colour.
- **Many sheets.**
  - Tabs scroll horizontally, with ‹ › buttons at the start.
  - A "All sheets" button opens a list (a `menu`) for jumping to any sheet.
  - Hidden sheets appear there only when `showHiddenSheets` is set, marked "(hidden)". `veryHidden` sheets never appear.
- **Remembered view.** Each sheet remembers its scroll position, selection and zoom while the workbook is open. Switching back restores them.
- **CSV.** CSV/TSV files have one sheet, named after the file. Their tab bar shows the one tab, unless the app turns tabs off.

## 5. Formula bar, link chip and status bar

### 5.1 Formula bar

- **Address box** (left).
  - Shows the active cell's address (`B4`), or the selection's size while dragging (`3R × 2C`).
  - In phase 1 it is a read-only text field. Typing an address and pressing Enter to jump there is phase 2. It is announced as "Cell address".
- **Content** (right): a read-only, selectable text field, so users can copy part of a formula. It shows:
  - for a formula cell: `=` + formula text (with `_xlfn.` prefixes removed for display), in a monospace font. Array formulas show as `{=…}`;
  - for other cells: the value as entered, not as formatted (as spreadsheet programs do). Numbers appear in full precision, dates as the locale's date (and time, if any) `[to verify against Excel's formula-bar display]`, and text as is;
  - for formula cells, a small secondary line with the cached value ("Result: 2,230.50"), so the relation between the formula and the grid is explicit. For a formula without a cached value it reads "Result: not calculated".
- **Long formulas** wrap up to [placeholder] lines. A toggle expands the bar.
- **Accessible names.** The `=` before the content is a glyph, not an icon. The field's accessible name is "Formula" or "Value".

### 5.2 Status bar

The status bar is a `role="status"` region. Its updates are throttled, so arrowing through cells doesn't cause an announcement storm (§7).

- **Selection summary.** When more than one cell is selected: "N cells". When numbers are selected: "Sum …" and "Average …" over cached values (api.md §12 Q12), formatted with the first numeric cell's number format. Past the limit: "≥ N cells · sum not shown".
- **Zoom.** Zoom out and zoom in buttons (−/+), and a zoom value button that opens presets (50 %, 75 %, 100 %, 125 %, 150 %, 200 %, Fit width). The range is 10–400 %. Ctrl/Cmd+wheel is left to the browser (page zoom), like Ctrl/Cmd +/−.
- **Shortcuts.** A `?` button opens the keyboard shortcuts dialog.
- **Notices.** A "Some content not shown" button appears when there are notices (§6.3).

### 5.3 Link chip

When the active cell has a hyperlink, a small chip appears just below it (above it, near the bottom edge). It shows:

- **for an external link:** the **real target**. The full URL is shown, with the host in bold, followed by an "Open" button. The link opens in a new tab with `rel="noopener noreferrer"`. A cell whose display text is `bank.example` but whose target is elsewhere therefore shows the real host before anyone clicks;
- **for an internal link:** "Go to Summary!B4". It switches sheet and selects the cell;
- **for a disallowed link:** "Link not opened: unsupported address (scheme)", with no button.

The chip is reachable with Tab from the grid (it comes right after the grid in tab order while shown). Alt+Enter on the cell opens the link. Escape closes the chip. The app's `onHyperlink` can veto any opening.

## 6. Loading, errors and "not shown" notices

### 6.1 Loading

- **Progress.** A progress bar (`role="progressbar"` with `aria-valuenow`) shows the reader's progress, with the file name and a **Cancel** button. The grid area is `aria-busy="true"`.
- **Before the first file.** With no `source`, the viewer shows an empty state: "No workbook open." Opening files (a file picker or drop zone) is the app's job. The playground has a drop zone and sample files.

### 6.2 Errors

Errors replace the grid area with a message, the file name, and a "Details" disclosure that shows the error code. They are announced via `role="alert"`.

| Condition | Message |
|---|---|
| `UNSUPPORTED_FORMAT`, `format: 'cfb'` | "This file is an older binary workbook (.xls) or a password-protected file. These can't be opened yet." |
| `UNSUPPORTED_FORMAT`, `format: 'xlsb'` | "Binary workbooks (.xlsb) can't be opened yet. Save it as .xlsx and try again." |
| `UNSUPPORTED_FORMAT`, `format: 'ods'` | "OpenDocument spreadsheets (.ods) can't be opened yet. Save it as .xlsx and try again." |
| `UNSUPPORTED_FORMAT`, `'unknown'` / `NOT_XLSX` | "This doesn't look like a workbook or a CSV file." |
| `ZIP_INVALID`, XML errors | "This file is damaged and can't be read." |
| `LimitError` | "This file is larger than this viewer is set to open (limit: {name})." The app sets the limits |
| Other | "The file couldn't be opened." plus the code |

### 6.3 "Not shown" notices

When the reader reports content the viewer doesn't show (`UNSUPPORTED_PART`: charts, images, comments, pivot tables, form controls, macros…), a dismissible notice appears above the grid: "This workbook has content this viewer doesn't show yet: 3 charts, comments. Values and formatting are shown." The details list is grouped by kind. Macros are mentioned as "Macros (not run)". Users should never assume a sheet is complete when it isn't.

## 7. Screen readers and text

- **Grid name.** The grid is labelled "Sheet: {name}". The viewer region is labelled with the file name, or `aria-label`.
- **Cell announcements.** A cell is announced by its displayed text and position.
  - The position comes from the column and row header cells (`columnheader` "B", `rowheader` "4") and `aria-rowindex`/`aria-colindex`. Screen readers say "B, 4" or "row 4, column 2", depending on the reader `[to verify per screen reader]`.
  - Merged cells announce their span (`aria-colspan`/`aria-rowspan`).
  - Empty cells are announced as blank by the screen reader.
- **Formulas.**
  - The active formula cell gets `aria-describedby` pointing to a visually hidden "Formula: =SUM(B1:B3)" node, so the formula is announced after the value without leaving the grid.
  - A formula without a cached value is described as "Not calculated".
- **Hyperlinks.** Link cells are described as "Link to {host}" (or "Link to Summary, B4").
- **Selection.** `aria-selected` is set on the selected cells within the rendered window. The status bar's summary, throttled to at most one announcement per [placeholder] ms of keyboard idle, covers ranges larger than what is rendered.
- **Hidden rows and columns.** The `aria-rowindex` gaps tell the screen reader. The hidden-row markers in the headers have text alternatives.
- **Sheet switching.** Switching sheets announces "Sheet: {name}, {active cell}".
- **Loading, errors and notices.** These use `role="status"`, `role="alert"` and a labelled region, as in §6.
- **Translations.** All UI strings come from `labels` (api.md §5.1), with English defaults. Numbers in UI strings use the viewer's `locale`.
- **Motion.** No animated scrolling under `prefers-reduced-motion: reduce`. Elsewhere, the only motion is the selection outline following the active cell.

## 8. Visual design: its own look

### 8.1 Principles

- **Original.**
  - No Microsoft icons, product names, colours or layouts beyond the generic conventions any spreadsheet shares (grid, letters and numbers, tabs at the bottom, a formula field on top).
  - No "fx" label, no green brand colour, no ribbon look-alike.
  - The UI never says "Excel" except when naming file types ("Excel workbook (.xlsx)" in error messages is a factual file-type name).
- **Quiet chrome, loud content.** The sheet is the content. The chrome is neutral, thin and low-contrast against it, while still meeting contrast rules (§9).
- **Themeable.** All chrome colours, radii and fonts are CSS custom properties with an `--xv-` prefix (`--xv-accent`, `--xv-chrome-bg`, `--xv-header-bg`, `--xv-gridline`, `--xv-selection`, `--xv-font`), so an app can match its own design system without overriding selectors.

### 8.2 Default theme

- **Chrome.** A neutral grey scale with one accent colour, a desaturated indigo, as the default `--xv-accent` `[to verify: final values chosen with a contrast check]`. The accent is used for selection, focus rings and the active tab. It should read as this library's own, not as any office suite's.
- **Light and dark.** The chrome follows `prefers-color-scheme`, and the sheet area keeps the file's colours (api.md §12 Q8).
- **UI type and headers.** The UI uses the system UI font stack (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`). Header letters and numbers use tabular figures.
- **Focus.** Focus rings are 2 px, always visible on keyboard focus (`:focus-visible`), and never removed.
- **Icons.** The few icons (tab scroll arrows, zoom −/+, notices, shortcuts) are simple geometric inline SVGs drawn for this project, each with a text label or `aria-label`. No icon font, no external sprite.

### 8.3 Fonts from the file

- **Font map.** A cell's font family goes through a map from file font name to a CSS font stack (`DEFAULT_FONT_MAP`, overridable by the `fonts` prop):

  | File font | CSS stack (installed fonts only) |
  |---|---|
  | Calibri | `Calibri, Carlito, "Segoe UI", system-ui, sans-serif` |
  | Cambria | `Cambria, Caladea, Georgia, serif` |
  | Arial | `Arial, "Liberation Sans", Helvetica, sans-serif` |
  | Times New Roman | `"Times New Roman", "Liberation Serif", Times, serif` |
  | Courier New | `"Courier New", "Liberation Mono", monospace` |
  | Aptos | `Aptos, system-ui, sans-serif` `[to verify: a metric-compatible open alternative]` |
  | anything else | `"<name>", <generic family from the font's family class>` |

  Carlito, Caladea and the Liberation fonts are metric-compatible with the fonts they follow, so column fits match where they are installed.
- **No downloads.** The viewer never downloads a font (no web fonts, no `@font-face` with remote URLs).
- **Measurement.** Text measurement (api.md §3.2) uses the same stack, so overflow and `####` decisions match what is drawn.

## 9. Accessibility checklist

Run for each release (XLV-9 records the results). The automated parts run in CI.

- **WCAG 2.2 AA for the chrome:**
  - text contrast ≥ 4.5:1;
  - non-text contrast ≥ 3:1 for grid lines next to selection, focus rings, tab indicators and buttons;
  - targets ≥ 24 × 24 CSS px (WCAG 2.5.8), 44 px for touch in the playground's mobile layout;
  - no information by colour alone (hidden rows have a marker shape, not only a colour);
  - the cell area shows the file's colours; the viewer doesn't change them.
- **Keyboard:**
  - every action in §3 works without a mouse;
  - no keyboard trap; focus is always visible.
- **Screen readers.** A manual pass with NVDA + Firefox, NVDA + Chrome, VoiceOver + Safari (macOS and iOS), and TalkBack + Chrome on Android, covering:
  - entering the grid and reading cells;
  - merged cells and hidden rows;
  - selection summaries;
  - formula descriptions;
  - sheet switching;
  - link chip;
  - errors and notices.

  JAWS is checked when a licence is available `[placeholder: tester]`.
- **Zoom and reflow:**
  - the page works at 200 % browser zoom;
  - the chrome reflows at 320 CSS px width (WCAG 1.4.10); the grid itself scrolls in two dimensions, which the criterion allows for data tables;
  - text spacing overrides (WCAG 1.4.12) don't clip chrome labels.
- **Forced colours** (Windows High Contrast): selection and focus stay visible.
- **Reduced motion** is respected.
- **Automated checks:** an axe audit in the browser tests and Lighthouse accessibility on the playground, both expected at zero violations / 100.

## 10. Small screens

- **Under 600 px wide** [placeholder: breakpoint confirmed in XLV-4]:
  - the formula bar collapses to the address and a "Show formula" toggle;
  - the status bar shows only the zoom and the selection count;
  - sheet tabs keep their scrolling strip plus the "All sheets" list.
- **Headers** keep a minimum width so that 4-digit row numbers fit, and they scale with zoom.
- **Default zoom on narrow screens** is the file's zoom. Users can pick "Fit width" from the zoom menu, and the choice is remembered per sheet for the session.
- **Touch targets** in the chrome are 44 px.
- **Check.** The playground is checked at 390 px wide, as the family's other playgrounds are: no horizontal page scroll outside the grid's own scroll area.
