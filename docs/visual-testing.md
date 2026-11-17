# Fixtures, visual regression and the LibreOffice comparison

What runs in CI's **Browser** job and the **LibreOffice comparison** job (`.github/workflows/ci.yml`), and how to update it. The plan is [api.md §11.3](api.md#113-testing).

## Fixtures

| Set | Where | What it checks |
|---|---|---|
| Conformance corpus | `packages/react-xlsx-viewer/test/fixtures/corpus` ([README](../packages/react-xlsx-viewer/test/fixtures/corpus/README.md)), tested by `test/browser/corpus.browser.test.tsx` | The files match the manifest's SHA-256. Each opens with no error, no console error and no warning other than `UNSUPPORTED_PART`, and every visible sheet renders a grid |
| Stress and security files | Generated at test time by `test/browser/hostile-files.ts`, tested by `test/browser/hostile.browser.test.tsx` | Each fails safe with the documented error (ux.md §6.2), or renders as plain text. After every case: no script ran, no request left the test server, no CSP violation |

The generated cases:

| Case | Result |
|---|---|
| Zip bomb: 32 MB of spaces deflated at a ratio above 1000 | `LIMIT_EXCEEDED`, `maxRatio`, while inflating |
| Entry declaring 4 GB | `LIMIT_EXCEEDED`, `maxEntryBytes`, before inflating |
| 2,000 shared strings over an app limit of 1,000 | `LIMIT_EXCEEDED`, `maxSharedStrings` |
| 100,000 shared strings, default limits | Opens |
| One 1,000,000-character string | Renders in its cell; the DOM stays bounded |
| A merge over the whole sheet (A1:XFD1048576) plus 20,000 small merges | Opens; the rendered DOM stays bounded, also scrolled to the end |
| 60,000 distinct cell formats | Opens; the rendered DOM stays bounded |
| XML nested 200 deep | `LIMIT_EXCEEDED`, `maxXmlDepth` |
| XXE and "billion laughs" DOCTYPEs | `XML_DTD_FORBIDDEN` |
| Unterminated XML, CRC mismatch, encrypted entry, compression method 14, truncated zip | `XML_MALFORMED`, `ZIP_CRC_MISMATCH`, `ZIP_ENCRYPTED`, `ZIP_UNSUPPORTED_METHOD`, `ZIP_INVALID` ("damaged") |
| Zip without a workbook; compound-file (`.xls`) signature | `NOT_XLSX`; `UNSUPPORTED_FORMAT` (`cfb`) |
| Hyperlinks to `javascript:` (mixed case, leading whitespace, embedded newline), `data:`, `vbscript:`, `file:`, UNC paths | Plain text; the link chip says "Link not opened"; Alt+Enter opens nothing; no `href` other than `http(s):`/`mailto:` in the viewer |
| A link whose text is `https://bank.example/login` and whose target is elsewhere | The chip shows the real target, host in bold, before anything opens |
| External workbook link, remote image, web data connection | Cached values shown, formula as text, the "not shown" notice lists them, nothing fetched |
| Script-like text in a cell, the sheet name and a number-format literal; a font name with CSS in it | Text nodes only; the font name stays one `font-family` value |

## Visual regression

`packages/react-xlsx-viewer/test/visual/corpus.visual.test.tsx` screenshots every visible sheet of every corpus file (the kitchen-sink file aside, which repeats the others) and compares each with the reviewed baseline in `test/visual/__screenshots__/`. A mismatch fails the Browser job, and the job uploads a `visual-diffs` artifact with the actual screenshots and the diffs.

**Determinism.**
- **Image:** the Browser job runs in `mcr.microsoft.com/playwright:v1.65.1-noble` (Ubuntu 24.04), so the OS, its libraries and its fonts are the same on every run. It installs Carlito and Caladea on top (Calibri and Cambria in the font map); the image has Liberation (Arial, Times New Roman, Courier New).
- **Browser:** Playwright's Chromium headless shell for the repository's Playwright version. A newer Chromium can change anti-aliasing: refresh the baselines when Dependabot bumps Playwright, and bump the image tag in `ci.yml` and `scripts/visual.sh` with it (the job warns when they differ).
- **Page:** viewport 1280 × 800, device pixel ratio 1, light colour scheme, reduced motion, locale `en-US`, time zone UTC (`vitest.visual.config.ts`). Transitions, animations and the caret are off, and the chrome font is pinned to Liberation Sans. The viewer is 960 × 600 px.
- **Tolerance:** pixelmatch with `threshold: 0.1` (ignores anti-aliasing noise) and at most 0.1 % differing pixels.

**Updating the baselines.** Only the container image produces matching screenshots, so update them there:

```sh
npm run visual:docker -- --update   # sh scripts/visual.sh --update: Docker, same image as CI (linux/amd64)
npm run visual:docker               # compare only
```

Or take them from CI: download the `visual-diffs` artifact of a failed Browser run and copy its `test/visual/__screenshots__` over the committed one. Either way, look at every changed image before committing it; the diff in the pull request is the review.

`npm run test:visual` on a laptop works, but compares against Linux screenshots and will fail on font rendering; use it to debug, not to judge.

## LibreOffice comparison

The **LibreOffice comparison** job installs LibreOffice Calc (headless) and poppler, then `scripts/libreoffice-compare.mjs` exports each corpus file to PDF and to PNG pages at 96 dpi, and puts them next to the viewer's baselines in a `visual-comparison` artifact (`index.html`). The job summary lists the pages per file.

It is reported, not gating, as api.md §11.3 says: LibreOffice isn't Excel, and its output is a print layout (page margins, page breaks, no headers), so a pixel diff against a screen grid would measure the layout difference, not fidelity. It is for a person to look through before a release.
