---
"react-xlsx-viewer": minor
---

Rows without a stored height now auto-fit to their content as they come into view (#14): wrapped text, larger fonts, rotated and stacked text. Rows only grow, merged cells are skipped as in Excel, and the row at the top of the view stays in place while rows above it grow. Rotated text turns about the cell's centre and is no longer clipped to the column first. Needs javascript-excel 2.0.0-alpha.5 (`setRowHeights`).
