# react-xlsx-viewer

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
