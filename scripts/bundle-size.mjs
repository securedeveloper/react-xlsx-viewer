// Bundle size of an app that imports only <XlsxViewer> (docs/api.md §9):
// built with Vite from the built package, React external, minified; reports
// raw and gzip sizes of the JS that ships with the viewer, and of the CSS.
//   npm run build -w react-xlsx-viewer && node scripts/bundle-size.mjs
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'apps/playground/package.json'));
const vite = await import(pathToFileURL(require.resolve('vite')).href);
const work = mkdtempSync(join(tmpdir(), 'xlv-size-'));
try {
  const entry = join(work, 'entry.js');
  writeFileSync(entry, `import { XlsxViewer } from 'react-xlsx-viewer';\nexport { XlsxViewer };\n`);
  const result = await vite.build({
    root: work,
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { 'react-xlsx-viewer': join(root, 'packages/react-xlsx-viewer/dist/index.js') } },
    build: { write: false, minify: true, lib: { entry, formats: ['es'], fileName: 'entry' }, rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'] } },
  });
  const chunks = [result].flat().flatMap((r) => r.output).filter((o) => o.type === 'chunk');
  const all = chunks.map((c) => c.code).join('\n');
  const initial = chunks.filter((c) => c.isEntry).map((c) => c.code).join('\n');
  const css = readFileSync(join(root, 'packages/react-xlsx-viewer/dist/styles.css'));
  const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
  const table = [
    '### Bundle size (Vite, minified, React external)',
    '',
    '| part | minified | gzip |',
    '|---|---:|---:|',
    `| XlsxViewer, initial chunk (viewer, render model, number formats) | ${kb(Buffer.byteLength(initial))} | ${kb(gzipSync(initial).length)} |`,
    `| everything, including the lazily loaded reader and CSV parser | ${kb(Buffer.byteLength(all))} | ${kb(gzipSync(all).length)} |`,
    `| styles.css | ${kb(css.length)} | ${kb(gzipSync(css).length)} |`,
  ].join('\n');
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
