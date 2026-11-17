// LibreOffice comparison (docs/api.md §11.3, docs/visual-testing.md): renders each conformance corpus file
// with LibreOffice (xlsx → PDF → PNG at 96 dpi) and puts the pages next to this viewer's baseline screenshots
// in visual-comparison/index.html, for a person to look through. Reported, not gating: LibreOffice isn't
// Excel, and a printed page isn't a screen grid, so no pixel diff is computed.
//
//   node scripts/libreoffice-compare.mjs    needs soffice (LibreOffice) and pdftoppm (poppler-utils)
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const corpus = join(root, 'packages/react-xlsx-viewer/test/fixtures/corpus');
const shots = join(root, 'packages/react-xlsx-viewer/test/visual/__screenshots__/corpus.visual.test.tsx');
const out = join(root, 'visual-comparison');
const profile = join(tmpdir(), 'xlv-libreoffice-profile');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'libreoffice'), { recursive: true });
mkdirSync(join(out, 'viewer'), { recursive: true });

const version = execFileSync('soffice', ['--version'], { encoding: 'utf8' }).trim();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rows = [];
let failures = 0;
const files = readdirSync(corpus).filter((f) => f.endsWith('.xlsx') && f !== '99-kitchen-sink.xlsx').sort();
for (const file of files) {
  const base = file.replace(/\.xlsx$/, '');
  const started = Date.now();
  let pages = [];
  let error = null;
  try {
    // One file at a time: headless LibreOffice instances sharing a profile block each other.
    execFileSync('soffice', [`-env:UserInstallation=file://${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', join(out, 'libreoffice'), join(corpus, file)], { stdio: 'pipe', timeout: 120_000 });
    const pdf = join(out, 'libreoffice', `${base}.pdf`);
    if (!existsSync(pdf)) throw new Error('no PDF written');
    execFileSync('pdftoppm', ['-r', '96', '-png', pdf, join(out, 'libreoffice', base)], { stdio: 'pipe', timeout: 120_000 });
    pages = readdirSync(join(out, 'libreoffice')).filter((f) => f.startsWith(`${base}-`) && f.endsWith('.png')).sort();
  } catch (e) {
    error = String(e?.message ?? e).split('\n')[0];
    failures++;
  }
  const ms = Date.now() - started;
  let viewer = [];
  if (existsSync(join(shots, base))) {
    cpSync(join(shots, base), join(out, 'viewer', base), { recursive: true });
    viewer = readdirSync(join(shots, base)).filter((f) => f.endsWith('.png')).sort();
  }
  rows.push({ file, base, pages, viewer, ms, error });
  console.log(`${file}: ${pages.length} LibreOffice page(s), ${viewer.length} viewer screenshot(s), ${ms} ms${error ? `, error: ${error}` : ''}`);
}

const html = `<!doctype html><meta charset="utf-8"><title>Viewer vs LibreOffice</title>
<style>body{font:14px system-ui,sans-serif;margin:1rem}section{border-top:1px solid #ccc;padding:1rem 0}.cols{display:flex;gap:1rem;align-items:flex-start}.cols>div{flex:1;min-width:0}img{max-width:100%;border:1px solid #ddd;display:block;margin-bottom:.5rem}h3{font-size:13px;margin:.25rem 0}</style>
<h1>react-xlsx-viewer vs LibreOffice</h1>
<p>${esc(version)}. Left: this viewer's baseline screenshots (one per visible sheet). Right: LibreOffice's PDF export of the same file at 96 dpi (print layout: page margins, no headers). For a visual read, not a pixel diff.</p>
${rows
  .map(
    (r) => `<section><h2>${esc(r.file)}</h2>${r.error ? `<p>LibreOffice failed: ${esc(r.error)}</p>` : ''}<div class="cols"><div><h3>Viewer</h3>${r.viewer.map((v) => `<img src="viewer/${esc(r.base)}/${esc(v)}" alt="${esc(v)}">`).join('')}</div><div><h3>LibreOffice</h3>${r.pages.map((p) => `<img src="libreoffice/${esc(p)}" alt="${esc(p)}">`).join('')}</div></div></section>`,
  )
  .join('\n')}`;
writeFileSync(join(out, 'index.html'), html);

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    '## Viewer vs LibreOffice',
    '',
    `${version}. Download the \`visual-comparison\` artifact and open \`index.html\` for the side-by-side pages. Reported, not gating.`,
    '',
    '| File | Viewer screenshots | LibreOffice pages | Time |',
    '|---|---:|---:|---:|',
    ...rows.map((r) => `| ${r.file} | ${r.viewer.length} | ${r.error ? `failed: ${r.error}` : r.pages.length} | ${(r.ms / 1000).toFixed(1)} s |`),
    '',
  ].join('\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}
if (failures === rows.length) {
  console.error('LibreOffice converted no file.');
  process.exit(1);
}
