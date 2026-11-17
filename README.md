# react-xlsx-viewer

> **Status: prerelease (1.0.0-beta.0).** Phase 1, a read-only viewer, is on npm under the `next` tag: `npm install react-xlsx-viewer@next`. `latest` stays the 0.0.1 name reservation until 1.0.0. Try it in the live playground: https://react-xlsx-viewer-playground.vercel.app/

Render .xlsx and .csv workbooks in React: styles, merged cells, frozen panes, sheet tabs and formulas. Built on javascript-excel.

It will be part of a small family of spreadsheet libraries:

- [javascript-excel](https://github.com/securedeveloper/javascript-excel): the framework-agnostic TypeScript engine that reads and writes .xlsx and .csv
- [react-data-export](https://github.com/securedeveloper/react-data-export): export datasets and tables to .xlsx / .csv
- [react-data-import](https://github.com/securedeveloper/react-data-import): import .xlsx / .csv as datasets
- [react-xlsx-viewer](https://github.com/securedeveloper/react-xlsx-viewer): view workbooks in the browser

Watch the repository for 1.0.0.

## Status

- **1.0 is designed:** [docs/api.md](docs/api.md) and [docs/ux.md](docs/ux.md) (decided 2026-11-16) describe a read-only viewer: a virtualised, accessible grid with styles, merges, frozen panes, sheet tabs, number formats and a formula bar, built on javascript-excel.
- **The viewer exists** (XLV-3): `<XlsxViewer>` and `useWorkbook`, on javascript-excel 2.0.0-beta.1 (`/read`, `/format`, `/render`). It is tested on React 18 and 19 in jsdom and Chromium, and has a performance harness (`npm run perf -w react-xlsx-viewer`). Styles, merges, panes and tabs work; XLV-4 onwards refines them.
- **1.0.0-beta.0 is the current prerelease** (`npm install react-xlsx-viewer@next`): the phase-1 read-only viewer, feature-complete for 1.0; fixes only until 1.0.0, which waits for the manual screen-reader passes. `latest` stays the 0.0.1 name reservation until 1.0.0.

**Using it:** the [user guide](docs/guide.md) (with the keyboard reference) and the [package README](packages/react-xlsx-viewer/README.md). Playground: https://react-xlsx-viewer-playground.vercel.app/

## Repository layout

```
packages/react-xlsx-viewer/   the published library (TypeScript, ESM + CJS + .d.ts, "use client")
apps/playground/              Vite + React 19 dev sandbox with a strict CSP, tested in CI (the public
                              playground is securedeveloper/react-xlsx-viewer-playground)
scripts/                      tarball smoke test, consumer TypeScript matrix, release helpers
docs/                         user guide (guide.md), the 1.0 API and UX design, test docs
```

## Development

Development needs Node `^22.22.2 || ^24.15.0 || >=26` (the strictest dev-tool floor, from jsdom). The published package declares Node >= 22 and has no Node-specific code.

```sh
npm ci
npm run typecheck
npm test                     # Vitest + React Testing Library (jsdom)
npm run test:browser         # Vitest browser mode in Chromium (npx playwright install chromium once)
npm run perf -w react-xlsx-viewer   # the Performance harness (Chromium): writes perf-results.json
npm run build                # library (tsdown) + playground (Vite)
npm run lint:pkg             # publint + are-the-types-wrong
npm run smoke                # packs the library; checks "use client", ESM import, CJS require, types
npm run consumer-ts -- --ts 5.0,7.0 --react 18,19   # consumer TypeScript matrix
npm run test:release         # release script unit tests
```

CI runs Node 22, 24 and 26 against React 18 and 19. To try React 18 locally: `node scripts/use-react.mjs 18` (it rewrites dev ranges and node_modules; restore with `git checkout -- package-lock.json '*/*/package.json' && npm ci`).

## Releasing

Versions are managed with [Changesets](https://github.com/changesets/changesets). Merging a pull request that bumps the version publishes it to npm. See [RELEASING.md](RELEASING.md).

## License

MIT © Afzal Ahmad
