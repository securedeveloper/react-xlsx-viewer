# react-xlsx-viewer

> **Status: planned.** This package is not usable yet. Version 0.0.1 only reserves the name.

Render .xlsx and .csv workbooks in React: styles, merged cells, frozen panes, sheet tabs and formulas. Built on javascript-excel.

It will be part of a small family of spreadsheet libraries:

- [javascript-excel](https://github.com/securedeveloper/javascript-excel): the framework-agnostic TypeScript engine that reads and writes .xlsx and .csv
- [react-data-export](https://github.com/securedeveloper/react-data-export): export datasets and tables to .xlsx / .csv
- [react-data-import](https://github.com/securedeveloper/react-data-import): import .xlsx / .csv as datasets
- [react-xlsx-viewer](https://github.com/securedeveloper/react-xlsx-viewer): view workbooks in the browser

Watch the repository for the first real release.

## Status

- **1.0 is designed:** [docs/api.md](docs/api.md) and [docs/ux.md](docs/ux.md) (decided 2026-11-16) describe a read-only viewer: a virtualised, accessible grid with styles, merges, frozen panes, sheet tabs, number formats and a formula bar, built on javascript-excel.
- **The workspace is scaffolded** (XLV-1): the package builds, is tested on React 18 and 19 (jsdom and Chromium), and is checked as a packed tarball. There is no viewer yet.
- **0.0.1 on npm only reserves the name.**

## Repository layout

```
packages/react-xlsx-viewer/   the published library (TypeScript, ESM + CJS + .d.ts, "use client")
apps/playground/              Vite + React 19 shell with a strict CSP; becomes the demo (XLV-11)
scripts/                      tarball smoke test, consumer TypeScript matrix, release helpers
docs/                         the 1.0 API and UX design
```

## Development

Development needs Node `^22.22.2 || ^24.15.0 || >=26` (the strictest dev-tool floor, from jsdom). The published package declares Node >= 22 and has no Node-specific code.

```sh
npm ci
npm run typecheck
npm test                     # Vitest + React Testing Library (jsdom)
npm run test:browser         # Vitest browser mode in Chromium (npx playwright install chromium once)
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
