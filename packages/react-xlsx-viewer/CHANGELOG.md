# react-xlsx-viewer

## 1.0.0-beta.0

The first beta. Phase 1, the read-only viewer, is feature-complete for 1.0, and from here until 1.0.0 only fixes go in. It runs on javascript-excel 2.0.0-beta.1 and has:
- an axe audit at 0 violations in light and dark themes;
- an automated pre-pass over Chromium's accessibility tree;
- real-file, hostile-file and visual-regression tests;
- a Performance budget that gates CI.

The manual screen-reader passes are still open: NVDA, VoiceOver on macOS and iOS, TalkBack, and JAWS before 1.0 (`docs/a11y-manual-check.md`).

### Patch Changes

- c5d466b: Screen-reader fixes found by an automated pass over Chromium's accessibility tree:
  - Grid cells are exposed as read-only. Chromium doesn't pass the grid's `aria-readonly` down to its cells, so each cell now says it too.
  - An internal link names its sheet: "Link to Second sheet, A1" in the cell's description, and "Go to Second sheet, A1" in the link chip.
  - A link that won't open (a `javascript:` address, for example) is described as "Link not opened: unsupported address", as in the chip, instead of "Link to javascript:…".
- b34c1a0: Accessibility fixes found by an axe audit: the corner header ("Select all cells") now has its name as visually hidden text instead of `aria-label`, so screen readers in browse mode find it too; and the loading, error and empty states sit on the chrome background, so their text keeps its contrast in the dark theme.
- 44dde94: Depends on javascript-excel `^2.0.0-beta.1` (was `^2.0.0-alpha.5`).

## 1.0.0-alpha.2

### Patch Changes

- 38d9800: Autofilter buttons are shown (#19): a sheet with an autofilter range gets a dropdown button at the bottom-right of each header cell of the range, as in Excel. The viewer is read-only, so the buttons are disabled, out of the tab order and named by the new `labels.filterButton` ("Filter (not available in this viewer)"); a click selects the cell.
- 85b08d8: Numbers no longer show `####` just because Calibri or Carlito isn't installed (#16). Whether a number fits its column is decided with the file font's digit and separator widths (Calibri, Arial, Times New Roman, Courier New), so a number that fits in the file's font is drawn slightly smaller in a wider fallback font instead of `####`. `DEFAULT_FONT_MAP` also lists Arimo, Tinos and Cousine, the metric-compatible fonts common on ChromeOS and Linux.

## 1.0.0-alpha.1

### Minor Changes

- f09a9b6: Rows without a stored height now auto-fit to their content as they come into view (#14): wrapped text, larger fonts, rotated and stacked text. Rows only grow, merged cells are skipped as in Excel, and the row at the top of the view stays in place while rows above it grow. Rotated text turns about the cell's centre and is no longer clipped to the column first. Needs javascript-excel 2.0.0-alpha.5 (`setRowHeights`).

### Patch Changes

- cbd7592: Small sheets fill the viewer (#17). The empty rows and columns after the used range now number at least 50 rows and 30 columns, and enough to fill the viewport at the current zoom. They grow when the viewer grows or zooms out, keeping the selection, scroll position and auto-fitted rows.
- 8fa2e95: Shrink to fit is applied (#15): text in a cell with `shrinkToFit` is drawn smaller so it fits the column width, numbers shrink instead of showing `####`, and the text no longer spills into neighbours. Where text can't be measured (no `OffscreenCanvas`), it still clips.

## 1.0.0-alpha.0

### Major Changes

- 818bedc: The first viewer API: `<XlsxViewer source>` with a virtualised, accessible grid, plus `useWorkbook` and `react-xlsx-viewer/styles.css`. The grid is a `role="grid"` with a roving tab stop, Excel's keyboard map, frozen panes, merges, styles and number formats from javascript-excel's `/render` and `/format`, zoom and selection. Around it:
  - **formula bar:** formula text with the cached result;
  - **sheet tabs and a status bar** with a selection summary;
  - **copy** as TSV and HTML;
  - **a hyperlink chip** that shows the real target before opening;
  - **an error message per code,** and a notice for content not shown.

### Patch Changes

- d1b6bdc: Borders: 1px edges (thin, hair, dotted, dashed, dashDot) were clipped away by the cell, and thicker ones lost a pixel; edges are now drawn inside the cell box. Diagonal borders (up, down, both) are drawn.
- 76d0694: - **Corner header:** it is announced as "Select all cells" (new label `selectAll`), not "All sheets".
  - **Link cells:** they show the file's tooltip, or else the link target, on hover, with a pointer cursor.
  - **Frozen panes:** a divider line (`--xv-frozen-line`) separates them from the scrolling part.
- cfd5b97: Pattern fills: each of the 18 patterns now looks like itself: horizontal, vertical and diagonal stripes, grids, trellises, and dot densities for the gray patterns. Before, all showed the same hatch. They are still CSS gradients with no `url()`.
- 3f3e61e: Text rendering fixes:
  - Long text spills into empty neighbours again. It was squeezed back into its cell as a flex item, in left-to-right and right-to-left sheets alike.
  - In a right-to-left sheet, general-aligned text starts at the cell's right edge and spills left.
  - Superscript and subscript cells and rich-text runs are raised or lowered, and smaller.
  - `fill` alignment repeats the text across the cell.
  - Text with right-to-left reading order aligns right and doesn't spill rightwards.
