---
"react-xlsx-viewer": major
---

The first viewer API: `<XlsxViewer source>` with a virtualised, accessible grid, plus `useWorkbook` and `react-xlsx-viewer/styles.css`. The grid is a `role="grid"` with a roving tab stop, Excel's keyboard map, frozen panes, merges, styles and number formats from javascript-excel's `/render` and `/format`, zoom and selection. Around it:
- **formula bar:** formula text with the cached result;
- **sheet tabs and a status bar** with a selection summary;
- **copy** as TSV and HTML;
- **a hyperlink chip** that shows the real target before opening;
- **an error message per code,** and a notice for content not shown.
