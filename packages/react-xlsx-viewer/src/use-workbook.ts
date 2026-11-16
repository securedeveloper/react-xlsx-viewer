// useWorkbook: the loading half of the viewer (docs/api.md §5.2, §6). Turns a
// File, Blob, ArrayBuffer, Uint8Array or an already-read Workbook into a
// Workbook<Cell>, through javascript-excel's reader, its CSV parser, or an
// app-owned worker. Aborts on unmount and when the source changes.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cell, CellInput, ExcelWarning, Progress, Workbook } from 'javascript-excel';
import type { ReadLimits } from 'javascript-excel/read';
import { createWorkerClient, type WorkerLike } from 'javascript-excel/worker';

/** What the viewer can show: binary file content, or a workbook already read or built. */
export type WorkbookSource = File | Blob | ArrayBuffer | Uint8Array | Workbook<CellInput> | null | undefined;

export interface UseWorkbookOptions {
  /** 'auto' (default): a zip signature means a workbook; otherwise the File's name or type decides CSV/TSV. */
  format?: 'auto' | 'xlsx' | 'csv' | 'tsv' | undefined;
  /** A worker running javascript-excel's exposeWorker, or a factory for one. false (default): read on the main thread. */
  worker?: WorkerLike | (() => WorkerLike) | false | undefined;
  /** Passed to read(): limits and the sheets to parse. */
  readOptions?: { limits?: Partial<ReadLimits> | undefined; sheets?: Array<string | number> | undefined } | undefined;
  /** CSV only: the delimiter and the encoding of bytes without a BOM. */
  csvOptions?: { delimiter?: string | undefined; encoding?: string | undefined } | undefined;
}

export type WorkbookStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseWorkbook {
  status: WorkbookStatus;
  workbook: Workbook<CellInput> | null;
  warnings: ExcelWarning[];
  /** An ExcelError (with `code`) or LimitError, or anything else the read threw. */
  error: unknown;
  progress: Progress | null;
  /** The file name, when the source is a File. */
  fileName: string | null;
  abort(): void;
}

const isWorkbook = (s: unknown): s is Workbook<CellInput> =>
  typeof s === 'object' && s !== null && !(s instanceof ArrayBuffer) && !ArrayBuffer.isView(s) && Array.isArray((s as { sheets?: unknown }).sheets);

const fileNameOf = (s: unknown): string | null => (typeof File !== 'undefined' && s instanceof File ? s.name : null);

function textFormat(source: unknown, format: UseWorkbookOptions['format']): 'csv' | 'tsv' | null {
  if (format === 'csv' || format === 'tsv') return format;
  const name = fileNameOf(source)?.toLowerCase() ?? '';
  const type = typeof Blob !== 'undefined' && source instanceof Blob ? source.type : '';
  if (name.endsWith('.tsv') || name.endsWith('.tab') || type === 'text/tab-separated-values') return 'tsv';
  if (name.endsWith('.csv') || name.endsWith('.txt') || type === 'text/csv') return 'csv';
  return null;
}

/** Reads a source into a workbook. Exported for tests; the hook wraps it. */
export async function loadWorkbook(
  source: Exclude<WorkbookSource, null | undefined>,
  options: UseWorkbookOptions,
  signal: AbortSignal,
  onProgress: (p: Progress) => void,
): Promise<{ workbook: Workbook<CellInput>; warnings: ExcelWarning[] }> {
  if (isWorkbook(source)) return { workbook: source, warnings: [] };
  const { detectFormat, read } = await import('javascript-excel/read');
  const detected = options.format === 'xlsx' ? 'xlsx' : await detectFormat(source);
  const isZip = detected !== 'unknown';
  const text = isZip ? null : textFormat(source, options.format);
  if (text) {
    const { readCsv } = await import('javascript-excel/csv');
    const delimiter = options.csvOptions?.delimiter ?? (text === 'tsv' ? '\t' : 'auto');
    const result = await readCsv(source, { delimiter, inferTypes: true, signal, encoding: options.csvOptions?.encoding });
    const base = fileNameOf(source)?.replace(/\.[^.]*$/, '') || 'Sheet1';
    const rows = result.rows.map((row) => row.map((value): Cell => ({ value })));
    return { workbook: { sheets: [{ name: base.slice(0, 31), rows }] }, warnings: result.warnings };
  }
  // A workbook, or something the reader turns into a precise error (UNSUPPORTED_FORMAT, NOT_XLSX, ...).
  const readOptions = { ...options.readOptions, dates: 'serial' as const, styles: true, formulas: true, richText: 'runs' as const, signal, onProgress };
  const worker = options.worker;
  if (worker) {
    const client = createWorkerClient(typeof worker === 'function' ? worker() : worker);
    try {
      return await client.read(source, readOptions);
    } finally {
      if (typeof worker === 'function') client.terminate();
    }
  }
  return read(source, readOptions);
}

/** Loads a workbook from a source (docs/api.md §5.2). */
export function useWorkbook(source: WorkbookSource, options: UseWorkbookOptions = {}): UseWorkbook {
  const [state, setState] = useState<Omit<UseWorkbook, 'abort'>>({ status: 'idle', workbook: null, warnings: [], error: null, progress: null, fileName: null });
  const controller = useRef<AbortController | null>(null);
  const opts = useRef(options);
  opts.current = options;

  // Cancel: stop the read and go back to "no workbook" (a cancelled read is not an error).
  const abort = useCallback(() => {
    const ac = controller.current;
    if (!ac || ac.signal.aborted) return;
    ac.abort();
    setState((s) => (s.status === 'loading' ? { status: 'idle', workbook: null, warnings: [], error: null, progress: null, fileName: s.fileName } : s));
  }, []);

  useEffect(() => {
    controller.current?.abort();
    if (source === null || source === undefined) {
      setState({ status: 'idle', workbook: null, warnings: [], error: null, progress: null, fileName: null });
      return undefined;
    }
    const ac = new AbortController();
    controller.current = ac;
    const fileName = fileNameOf(source);
    if (isWorkbook(source)) {
      setState({ status: 'ready', workbook: source, warnings: [], error: null, progress: null, fileName });
      return () => ac.abort();
    }
    setState({ status: 'loading', workbook: null, warnings: [], error: null, progress: null, fileName });
    let last = 0;
    loadWorkbook(source, opts.current, ac.signal, (p) => {
      // Progress arrives often; a render per 2 % is enough for a progress bar.
      if (p.ratio - last >= 0.02 || p.ratio === 1) {
        last = p.ratio;
        if (!ac.signal.aborted) setState((s) => ({ ...s, progress: p }));
      }
    }).then(
      ({ workbook, warnings }) => {
        if (!ac.signal.aborted) setState({ status: 'ready', workbook, warnings, error: null, progress: null, fileName });
      },
      (error: unknown) => {
        if (!ac.signal.aborted) setState({ status: 'error', workbook: null, warnings: [], error, progress: null, fileName });
      },
    );
    return () => ac.abort();
  }, [source]);

  return { ...state, abort };
}
