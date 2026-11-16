// Turns packages/react-xlsx-viewer/perf-results.json (written by `npm run perf`)
// into a Markdown table for the CI job summary. Node built-ins only.
import { appendFileSync, readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'packages/react-xlsx-viewer/perf-results.json';
const r = JSON.parse(readFileSync(file, 'utf8'));
const f = (s) => `${s.p50} / ${s.p95} / ${s.max}`;
const lines = [
  '### Viewer performance (Chromium)',
  '',
  `${r.userAgent.match(/HeadlessChrome\/[\d.]+|Chrome\/[\d.]+/)?.[0] ?? 'Chromium'}, viewport ${r.viewport}. Times in ms; p50 / p95 / max.`,
  '',
  '| measure | result | design goal (docs/api.md §9) |',
  '|---|---|---|',
  `| Scroll frames, vertical | ${f(r.scroll.vertical.frames)}, ${r.scroll.vertical.droppedFrames} dropped | p95 one frame (16.7 ms at 60 Hz) |`,
  `| Scroll frames, horizontal | ${f(r.scroll.horizontal.frames)}, ${r.scroll.horizontal.droppedFrames} dropped | same |`,
  `| Scroll frames, diagonal | ${f(r.scroll.diagonal.frames)}, ${r.scroll.diagonal.droppedFrames} dropped | same |`,
  `| React commit while scrolling (vertical) | ${f(r.scroll.vertical.commitMs)} | fits in the frame |`,
  `| Long animation frames while scrolling | ${typeof r.scroll.longAnimationFrames === 'object' ? `${r.scroll.longAnimationFrames.count} (max ${r.scroll.longAnimationFrames.maxMs} ms)` : r.scroll.longAnimationFrames} | none |`,
  `| Rendered gridcells, max | ${r.scroll.vertical.maxCells} (2,000,000-cell sheet) | bounded by the window |`,
  `| Arrow key → next frame | ${f(r.keyboard.arrow)} | ≤ 200 ms (INP "good") |`,
  `| PageDown → next frame | ${f(r.keyboard.pageDown)} | ≤ 200 ms |`,
  `| Ctrl+arrow / Ctrl+Home/End → next frame | ${f(r.keyboard.ctrlJumps)} | ≤ 200 ms |`,
  `| Shift+arrow → next frame | ${f(r.keyboard.shiftExtend)} | ≤ 200 ms |`,
  `| Click → next frame | ${f(r.click)} | ≤ 200 ms |`,
  `| First cells, 2,000,000-cell workbook object | ${r.firstCells.mountToFirstPaintMs} ms | — |`,
  `| Open a ${(r.openXlsx.fileBytes / 1e6).toFixed(1)} MB .xlsx (${r.openXlsx.cells.toLocaleString('en-US')} cells), main thread | ${r.openXlsx.toGridMs} ms to the grid; longest frame ${r.openXlsx.longestFrameMs ?? 'none over 50 ms'} | no long tasks |`,
  `| Open the same file through a worker (\`worker\` prop) | ${r.openXlsxWorker?.toGridMs ?? 'n/a'} ms to the grid; longest frame ${r.openXlsxWorker?.longestFrameMs ?? 'none over 50 ms'} | no long tasks |`,
  `| Worker read, main-thread frames while it runs (receive cost) | ${r.workerRead ? `${f(r.workerRead.mainThreadFrames)}; read ${r.workerRead.totalMs} ms` : 'n/a'} | receiving stays within a frame |`,
  `| Memory, 500,000-cell file (JS heap after GC) | ${typeof r.memory === 'object' ? `model ${r.memory.modelMB} MB (${r.memory.modelBytesPerCell} B/cell), render model ${r.memory.renderModelMB} MB, mounted viewer ${r.memory.viewerMountedMB} MB, retained after release ${r.memory.retainedAfterReleaseMB} MB` : r.memory} | O(cells) model, small viewer overhead, nothing retained |`,
  `| Copy (TSV + HTML) | ${r.copy.map((c) => `${c.cells.toLocaleString('en-US')} cells ${c.ms} ms`).join(', ')} | COPY_LIMIT keeps it ≤ 200 ms |`,
  `| Selection summary | ${r.stats.map((c) => `${c.cells.toLocaleString('en-US')} cells ${c.ms} ms`).join(', ')} | STATS_LIMIT |`,
  `| JS heap after the run | ${r.heapMB ?? 'n/a'} MB | — |`,
];
const table = lines.join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
