# react-xlsx-viewer

> **Status: prerelease (1.0.0-alpha.1).** This is phase 1, a read-only viewer: it shows workbooks and doesn't edit or calculate them. Install the prerelease with `npm install react-xlsx-viewer@next`. `latest` stays the 0.0.1 name reservation until 1.0.0. The API can still change between alphas.
>
> Known issues in this alpha:
> - numbers can show `####` where Calibri or Carlito isn't installed ([#16](https://github.com/securedeveloper/react-xlsx-viewer/issues/16));
> - autofilter buttons aren't shown ([#19](https://github.com/securedeveloper/react-xlsx-viewer/issues/19)).

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

**Try it** in the live playground: https://react-xlsx-viewer-playground.vercel.app/ (open the sample or your own file; nothing is uploaded).

The design is in [docs/api.md](https://github.com/securedeveloper/react-xlsx-viewer/blob/main/docs/api.md) and [docs/ux.md](https://github.com/securedeveloper/react-xlsx-viewer/blob/main/docs/ux.md).

## License

MIT © Afzal Ahmad
