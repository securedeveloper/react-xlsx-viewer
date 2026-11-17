# react-xlsx-viewer

> **Status: prerelease (1.0.0-beta.0).** This is phase 1, a read-only viewer: it shows workbooks and doesn't edit or calculate them. It is feature-complete for 1.0; only fixes go in until 1.0.0. Install the prerelease with `npm install react-xlsx-viewer@next`. `latest` stays the 0.0.1 name reservation until 1.0.0. The API is not expected to change before 1.0.0.

Open `.xlsx` and `.csv` files in React and show them as a spreadsheet: styles, number formats, merged cells, frozen panes, sheet tabs, hyperlinks, and formulas with their stored results. It is built on [javascript-excel](https://github.com/securedeveloper/javascript-excel) and runs entirely in the browser.

```sh
npm install react-xlsx-viewer@next
```

```tsx
import { XlsxViewer } from 'react-xlsx-viewer';
import 'react-xlsx-viewer/styles.css';

export function Preview({ file }: { file: File }) {
  return <XlsxViewer source={file} style={{ height: 600 }} />;
}
```

- **`source`:** a `File`, `Blob`, `ArrayBuffer` or `Uint8Array` (read with javascript-excel), or a `Workbook` you already have.
- **Optional props:**
  - sheet, selection and zoom, each controlled or uncontrolled;
  - `locale` for number formats;
  - `fonts`, `hyperlinkSchemes` and `onHyperlink`;
  - `labels` for translation;
  - `worker` (a worker running javascript-excel's `exposeWorker`).
- **`useWorkbook(source)`:** the loading half on its own.
- **`ref`:** an `XlsxViewerHandle` with `scrollTo`, `select`, `copy`, `focus` and `getWorkbook`.

**What the viewer does:**
- **Accessibility:** a real `role="grid"` with a roving tab stop, Excel's keyboard map (arrows, Ctrl+arrow, Page Up/Down, Shift to extend, Ctrl+A, Ctrl+C, Ctrl+Page Up/Down for sheets; Shift+? lists them all), and screen-reader descriptions for formulas and links.
- **Large sheets:** rows and columns are virtualised. A 2,000,000-cell sheet keeps under 1,000 cells in the DOM.
- **Read-only:** formulas show the results stored in the file, and nothing is calculated or run. Links open only for `http`, `https` and `mailto`, and only after the real address has been shown.
- **Strict CSP:** it works under `style-src 'self'` and `script-src 'self'`. Styles come from the imported stylesheet and the CSSOM; there is nothing inline in HTML.

**Try it** in the live playground: https://react-xlsx-viewer-playground.vercel.app/ (open a sample or your own file; nothing is uploaded).

## Guide

The [user guide](https://github.com/securedeveloper/react-xlsx-viewer/blob/main/docs/guide.md) covers sources and CSV, the worker for large files, limits and errors for untrusted files, controlled sheet/selection/zoom, the imperative handle, hyperlinks, fonts, theming with `--xv-*` custom properties, translation, SSR and CSP, and what isn't shown yet.

For untrusted files, keep javascript-excel's default read limits. A file can't change them; only `readOptions.limits` in your code can. Errors come back through `onError` with a `code` (`isExcelError(e)`), and the viewer shows a plain message in place of the grid.

## Keyboard

The grid is one tab stop: Tab enters it at the active cell, Tab and Shift+Tab leave it. On macOS use Cmd for Ctrl, and Fn+arrows for Home, End, Page Up and Page Down. In a right-to-left sheet, Left and Right move the way you see. Shift+? shows this list in the viewer.

| Keys | Action |
|---|---|
| Arrow keys | Move one cell (merged cells count as one; hidden rows and columns are skipped) |
| Ctrl + arrow | Edge of the data |
| Home / Ctrl + Home | Start of the row / first cell (after frozen panes) |
| Ctrl + End | Last used cell |
| Page Up / Page Down | One screen up / down |
| Alt + Page Up / Alt + Page Down | One screen left / right |
| Shift + any of the above | Extend the selection |
| Ctrl + A | Select the used range; again for everything |
| Shift + Space / Ctrl + Space | Select the row / column |
| Ctrl + Page Up / Ctrl + Page Down | Previous / next sheet |
| Ctrl + C | Copy (tab-separated text and an HTML table) |
| Alt + Enter | Open the active cell's hyperlink (after showing its address) |
| Escape | Collapse the selection |
| Shift + ? | Keyboard shortcuts |

The design is in [docs/api.md](https://github.com/securedeveloper/react-xlsx-viewer/blob/main/docs/api.md) and [docs/ux.md](https://github.com/securedeveloper/react-xlsx-viewer/blob/main/docs/ux.md).

## License

MIT © Afzal Ahmad
