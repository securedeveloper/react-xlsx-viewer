---
"react-xlsx-viewer": patch
---

Autofilter buttons are shown (#19): a sheet with an autofilter range gets a dropdown button at the bottom-right of each header cell of the range, as in Excel. The viewer is read-only, so the buttons are disabled, out of the tab order and named by the new `labels.filterButton` ("Filter (not available in this viewer)"); a click selects the cell.
