// Performance harness (docs/api.md §9), in Chromium. Measures the goals of the
// design and writes them to perf-results.json; the CI job `Performance` puts
// them in its summary. Assertions are only sanity bounds; the thresholds the
// design states are compared in the report, not here, until a baseline is stable.
import { createElement, Profiler } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { toUint8Array } from 'javascript-excel';
import { read } from 'javascript-excel/read';
import { createWorkerClient } from 'javascript-excel/worker';
import { createRenderSheet, rangeAsHtml, rangeAsTsv, rangeStats } from 'javascript-excel/render';
import { commands } from 'vitest/browser';
import { expect, it } from 'vitest';
import { XlsxViewer } from '../../src/index';
import '../../src/styles.css';
import { bigWorkbook } from '../browser/fixtures';

const frame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));
const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]! * 100) / 100;
};
const stat = (xs: number[]): { p50: number; p95: number; max: number; n: number } => ({ p50: quantile(xs, 0.5), p95: quantile(xs, 0.95), max: Math.round(Math.max(...xs) * 100) / 100, n: xs.length });
/** Frames that took longer than 1.5 x 16.7 ms: at least one frame was dropped. */
const dropped = (xs: number[]): number => xs.filter((d) => d > 25).length;

it('measures the viewer', async () => {
  const results: Record<string, unknown> = { userAgent: navigator.userAgent, viewport: `${innerWidth}x${innerHeight}` };
  const longFrames: number[] = [];
  let lofSupported = false;
  try {
    const po = new PerformanceObserver((list) => list.getEntries().forEach((e) => longFrames.push(e.duration)));
    po.observe({ type: 'long-animation-frame', buffered: false });
    lofSupported = true;
  } catch {
    lofSupported = false;
  }

  // 1. Time to first cells, workbook object of 2,000,000 cells (200,000 rows x 10 columns).
  const t0 = performance.now();
  const wb = bigWorkbook(200_000, 10);
  const buildMs = performance.now() - t0;
  const host = document.createElement('div');
  host.style.cssText = 'width: 1200px; height: 700px;';
  document.body.append(host);
  const root = createRoot(host);
  const t1 = performance.now();
  const commits: number[] = [];
  flushSync(() => root.render(createElement(Profiler, { id: 'viewer', onRender: (_id: string, _phase: string, actual: number) => commits.push(actual) }, createElement(XlsxViewer, { source: wb, style: { height: '100%' }, locale: 'en-US' }))));
  while (!host.querySelector('[role="gridcell"]')) await frame();
  await frame();
  const firstCellsMs = performance.now() - t1;
  expect(document.querySelector('[role="grid"]')).toBeTruthy();
  results['firstCells'] = { cells: 2_000_000, buildWorkbookMs: Math.round(buildMs), mountToFirstPaintMs: Math.round(firstCellsMs) };

  // 2. Scripted scrolling: vertical, horizontal, diagonal; frame durations and DOM size.
  const scroller = document.querySelector<HTMLElement>('.xv-scroll')!;
  const scrollRun = async (dy: number, dx: number, frames: number): Promise<{ frames: ReturnType<typeof stat>; droppedFrames: number; commitMs: ReturnType<typeof stat>; maxCells: number }> => {
    longFrames.length = 0;
    commits.length = 0;
    const deltas: number[] = [];
    let maxCells = 0;
    let last = await frame();
    for (let i = 0; i < frames; i++) {
      scroller.scrollTop += dy;
      scroller.scrollLeft += dx;
      const now = await frame();
      deltas.push(now - last);
      last = now;
      maxCells = Math.max(maxCells, document.querySelectorAll('[role="gridcell"]').length);
    }
    return { frames: stat(deltas), droppedFrames: dropped(deltas), commitMs: stat(commits.length ? commits : [0]), maxCells };
  };
  const vertical = await scrollRun(120, 0, 300);
  scroller.scrollTop = 0;
  const horizontal = await scrollRun(0, 60, 100);
  const diagonal = await scrollRun(90, 30, 200);
  results['scroll'] = { vertical, horizontal, diagonal, longAnimationFrames: lofSupported ? { count: longFrames.length, maxMs: longFrames.length ? Math.round(Math.max(...longFrames)) : 0 } : 'unsupported' };

  // 3. Keyboard response: keydown to the next frame (an INP proxy; synthetic events).
  scroller.scrollTop = 0;
  scroller.scrollLeft = 0;
  await frame();
  document.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')!.focus();
  const press = async (key: string, init: KeyboardEventInit = {}): Promise<number> => {
    const t = performance.now();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    await frame();
    return performance.now() - t;
  };
  const arrows: number[] = [];
  for (let i = 0; i < 100; i++) arrows.push(await press(i % 10 === 9 ? 'ArrowRight' : 'ArrowDown'));
  const pages: number[] = [];
  for (let i = 0; i < 30; i++) pages.push(await press('PageDown'));
  const jumps: number[] = [await press('ArrowDown', { ctrlKey: true }), await press('ArrowUp', { ctrlKey: true }), await press('End', { ctrlKey: true }), await press('Home', { ctrlKey: true })];
  const extend: number[] = [];
  for (let i = 0; i < 30; i++) extend.push(await press('ArrowDown', { shiftKey: true }));
  results['keyboard'] = { arrow: stat(arrows), pageDown: stat(pages), ctrlJumps: stat(jumps), shiftExtend: stat(extend) };

  // 4. Click response: pointerdown on a cell to the next frame.
  const clicks: number[] = [];
  for (let i = 0; i < 30; i++) {
    const cells = document.querySelectorAll<HTMLElement>('.xv-body [role="gridcell"]');
    const target = cells[(i * 37) % cells.length]!;
    const t = performance.now();
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 }));
    await frame();
    clicks.push(performance.now() - t);
  }
  results['click'] = stat(clicks);
  root.unmount();
  host.remove();

  // 5. Copy cost by size (sets COPY_LIMIT).
  const rs = createRenderSheet(wb, 0);
  const copy: Array<{ cells: number; ms: number }> = [];
  for (const rows of [1_000, 5_000, 10_000, 50_000]) {
    const t = performance.now();
    const range = { start: { row: 0, col: 0 }, end: { row: rows - 1, col: 9 } };
    const text = rangeAsTsv(rs, range);
    const html = rangeAsHtml(rs, range);
    copy.push({ cells: rows * 10, ms: Math.round(performance.now() - t) });
    expect(text.length + html.length).toBeGreaterThan(0);
  }
  results['copy'] = copy;

  // 6. Status-bar summary cost by size (sets STATS_LIMIT).
  const stats: Array<{ cells: number; ms: number }> = [];
  for (const rows of [10_000, 100_000, 200_000]) {
    const t = performance.now();
    rangeStats(rs, { start: { row: 0, col: 0 }, end: { row: rows - 1, col: 9 } }, 10_000_000);
    stats.push({ cells: rows * 10, ms: Math.round(performance.now() - t) });
  }
  results['stats'] = stats;

  // 7. Opening an .xlsx on the main thread (no worker): time to the grid and the longest frame.
  const bytes = await toUint8Array(bigWorkbook(50_000, 10));
  const host2 = document.createElement('div');
  host2.style.cssText = 'width: 1200px; height: 700px;';
  document.body.append(host2);
  const root2 = createRoot(host2);
  longFrames.length = 0;
  const t3 = performance.now();
  flushSync(() => root2.render(createElement(XlsxViewer, { source: bytes, style: { height: '100%' } })));
  while (!host2.querySelector('[role="grid"]')) await frame();
  results['openXlsx'] = { cells: 500_000, fileBytes: bytes.length, toGridMs: Math.round(performance.now() - t3), longestFrameMs: longFrames.length ? Math.round(Math.max(...longFrames)) : null };
  root2.unmount();
  host2.remove();

  // 8. Reading through a worker: the main thread only deserialises the result. Frame gaps and long
  // animation frames while the worker reads are the receive cost (docs/api.md §6.1).
  const newWorker = (): Worker => new Worker(new URL('./excel.worker.ts', import.meta.url), { type: 'module' });
  {
    const client = createWorkerClient(newWorker());
    await client.read(await toUint8Array(bigWorkbook(100, 5)), { dates: 'serial' }); // warm up the worker
    longFrames.length = 0;
    const gaps: number[] = [];
    let busy = true;
    const watch = (async () => {
      let last = await frame();
      while (busy) {
        const now = await frame();
        gaps.push(now - last);
        last = now;
      }
    })();
    const t = performance.now();
    const { workbook: viaWorker } = await client.read(bytes, { dates: 'serial' });
    const workerMs = performance.now() - t;
    busy = false;
    await watch;
    client.terminate();
    expect(viaWorker.sheets[0]!.rows.length).toBe(50_000);
    results['workerRead'] = {
      cells: 500_000,
      totalMs: Math.round(workerMs),
      mainThreadFrames: stat(gaps),
      longestFrameMs: Math.round(Math.max(...gaps)),
      longAnimationFrames: lofSupported ? longFrames.map((d) => Math.round(d)) : 'unsupported',
    };
  }
  {
    // The same file through <XlsxViewer worker>.
    const host3 = document.createElement('div');
    host3.style.cssText = 'width: 1200px; height: 700px;';
    document.body.append(host3);
    const root3 = createRoot(host3);
    longFrames.length = 0;
    const t = performance.now();
    flushSync(() => root3.render(createElement(XlsxViewer, { source: bytes, worker: newWorker, style: { height: '100%' } })));
    while (!host3.querySelector('[role="grid"]')) await frame();
    results['openXlsxWorker'] = { cells: 500_000, toGridMs: Math.round(performance.now() - t), longestFrameMs: longFrames.length ? Math.round(Math.max(...longFrames)) : null };
    root3.unmount();
    host3.remove();
  }

  // 9. Memory per file: the page's V8 heap after a full GC, through the harness's `heapUsed` command (CDP).
  {
    const heapUsed = (commands as unknown as { heapUsed: () => Promise<number> }).heapUsed;
    const heap = async (): Promise<number> => {
      await frame();
      return heapUsed();
    };
    const MB = (n: number): number => Math.round((n / 2 ** 20) * 10) / 10;
    const base = await heap();
    let { workbook } = await read(bytes, { dates: 'serial' });
    const afterRead = await heap();
    let rsHandle: ReturnType<typeof createRenderSheet> | null = createRenderSheet(workbook, 0);
    const afterRender = await heap();
    const host4 = document.createElement('div');
    host4.style.cssText = 'width: 1200px; height: 700px;';
    document.body.append(host4);
    const root4 = createRoot(host4);
    flushSync(() => root4.render(createElement(XlsxViewer, { source: workbook, style: { height: '100%' } })));
    while (!host4.querySelector('[role="gridcell"]')) await frame();
    const afterMount = await heap();
    root4.unmount();
    host4.remove();
    rsHandle = null;
    workbook = { sheets: [] };
    const afterRelease = await heap();
    results['memory'] = {
      cells: 500_000,
      fileBytes: bytes.length,
      modelMB: MB(afterRead - base),
      modelBytesPerCell: Math.round((afterRead - base) / 500_000),
      renderModelMB: MB(afterRender - afterRead),
      viewerMountedMB: MB(afterMount - afterRender),
      retainedAfterReleaseMB: MB(afterRelease - base),
    };
    expect(rsHandle).toBeNull();
  }

  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (mem) results['heapMB'] = Math.round(mem.usedJSHeapSize / 2 ** 20);

  console.log(`XLV_PERF ${JSON.stringify(results)}`);
  await commands.writeFile('perf-results.json', JSON.stringify(results, null, 2));
  expect(vertical.maxCells).toBeLessThan(5000);
});
