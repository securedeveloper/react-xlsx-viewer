// <XlsxViewer>: the read-only workbook viewer (docs/api.md §5.1, docs/ux.md).
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type RefAttributes,
} from 'react';
import { decodeCell, isDateFormat, type Cell, type CellInput, type ExcelWarning, type Workbook } from 'javascript-excel';
import { formatCell, formatValue } from 'javascript-excel/format';
import {
  createRenderSheet,
  colLeft,
  lastUsedCell,
  rangeAsHtml,
  rangeAsTsv,
  rangeStats,
  renderCell,
  sheetSettings,
  type CellRef,
  type RenderHyperlink,
  type RenderSheet,
} from 'javascript-excel/render';
import { Grid, type GridHandle } from './grid';
import { DEFAULT_LABELS, errorMessage, type ViewerLabels } from './labels';
import { address, cellCount, equalSelection, single, type Selection } from './selection';
import { useWorkbook, type UseWorkbookOptions, type WorkbookSource } from './use-workbook';

/**
 * Above this many cells, copy refuses with a message. Set from the Performance harness (docs/api.md §9.1):
 * building TSV + HTML for 50,000 cells took 153 ms on a GitHub Actions runner (87 ms locally), under the
 * 200 ms "good" INP threshold; 100,000 cells took 249–302 ms there.
 */
export const COPY_LIMIT = 50_000;
/** The status-bar summary scans at most this many cells (docs/api.md §12 Q12); 1,000,000 cells took 19 ms in the harness. */
export const STATS_LIMIT = 1_000_000;
const ZOOM_STEPS = [10, 25, 50, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400];

export type { Selection } from './selection';

export interface XlsxViewerProps extends UseWorkbookOptions {
  /** What to show: a File, Blob, ArrayBuffer or Uint8Array is read; a Workbook is shown as is. */
  source: WorkbookSource;
  sheet?: number | undefined;
  defaultSheet?: number | undefined;
  onSheetChange?: ((index: number) => void) | undefined;
  selection?: Selection | undefined;
  defaultSelection?: Selection | undefined;
  onSelectionChange?: ((s: Selection) => void) | undefined;
  /** Percent, 10..400. Default: the sheet's zoom from the file. */
  zoom?: number | undefined;
  defaultZoom?: number | undefined;
  onZoomChange?: ((percent: number) => void) | undefined;
  showFormulaBar?: boolean | undefined;
  showSheetTabs?: boolean | undefined;
  showStatusBar?: boolean | undefined;
  /** Override the file's setting. */
  showGridLines?: boolean | undefined;
  showHeaders?: boolean | undefined;
  /** Show sheets whose state is 'hidden' (never 'veryHidden'). Default false. */
  showHiddenSheets?: boolean | undefined;
  /** Locale for number formats. Default: the browser's. */
  locale?: string | undefined;
  /** File font name → CSS font-family list, merged over DEFAULT_FONT_MAP. */
  fonts?: Readonly<Record<string, string>> | undefined;
  /** Hyperlink schemes that may be opened. Default ['http', 'https', 'mailto']. */
  hyperlinkSchemes?: readonly string[] | undefined;
  /** Called before a link opens; return false to stop it. */
  onHyperlink?: ((link: { kind: 'external'; href: string } | { kind: 'internal'; sheet: number; ref: string }) => boolean | void) | undefined;
  onLoad?: ((result: { workbook: Workbook<CellInput>; warnings: ExcelWarning[] }) => void) | undefined;
  onError?: ((error: unknown) => void) | undefined;
  onWarning?: ((w: ExcelWarning) => void) | undefined;
  /** UI strings, merged over the English defaults. */
  labels?: Partial<ViewerLabels> | undefined;
  'aria-label'?: string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

export interface XlsxViewerHandle {
  /** 'B12', "'Sheet 2'!B12" or a cell reference on the current sheet. */
  scrollTo(cell: CellRef | string, options?: { select?: boolean }): void;
  select(selection: Selection): void;
  copy(): Promise<void>;
  focus(): void;
  getWorkbook(): Workbook<CellInput> | null;
}

// ---------------------------------------------------------------------------
// Controlled-or-uncontrolled state

function useControllable<T>(value: T | undefined, initial: () => T, onChange: ((v: T) => void) | undefined): [T, (v: T) => void] {
  const [inner, setInner] = useState(initial);
  const current = value === undefined ? inner : value;
  const set = useCallback(
    (v: T) => {
      if (value === undefined) setInner(v);
      onChange?.(v);
    },
    [value, onChange],
  );
  return [current, set];
}

const browserLocale = (): string => (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

function visibleSheets(wb: Workbook<CellInput> | null, showHidden: boolean): number[] {
  if (!wb) return [];
  return wb.sheets.flatMap((s, i) => ((s.state ?? 'visible') === 'visible' || (showHidden && s.state === 'hidden') ? [i] : []));
}

/** The value "as entered", for the formula bar (docs/ux.md §5.1). */
function enteredValue(model: CellInput, locale: string): string {
  if (model === null || model === undefined) return '';
  const cell: Cell = typeof model === 'object' && !(model instanceof Date) && !('error' in model) && !('richText' in model) ? (model as Cell) : { value: model as Cell['value'] };
  const v = cell.value;
  if (v === null || v === undefined) return '';
  const fmt = cell.style?.numFmt;
  if (typeof v === 'number' && fmt !== undefined && isDateFormat(fmt)) {
    const hasDate = v >= 1;
    const hasTime = v % 1 !== 0;
    return formatValue(v, hasDate && hasTime ? 22 : hasDate ? 14 : 'h:mm:ss', { locale }).text;
  }
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return formatValue(v, 22, { locale }).text;
  if (typeof v === 'object' && 'error' in v) return v.error;
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('');
  return String(v);
}

function hostOf(href: string): string {
  try {
    return new URL(href).host || href;
  } catch {
    return href;
  }
}

function parseTarget(target: string, wb: Workbook<CellInput>, current: number): { sheet: number; cell: CellRef } | null {
  const bang = target.lastIndexOf('!');
  let sheet = current;
  let ref = target;
  if (bang !== -1) {
    let name = target.slice(0, bang);
    if (name.startsWith("'") && name.endsWith("'")) name = name.slice(1, -1).replace(/''/g, "'");
    sheet = wb.sheets.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
    ref = target.slice(bang + 1);
    if (sheet < 0) return null;
  }
  try {
    return { sheet, cell: decodeCell(ref.replace(/\$/g, '').split(':')[0]!) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The viewer

interface SheetMemory {
  selection: Selection;
  scroll: { top: number; left: number };
  zoom: number;
}

export const XlsxViewer: ForwardRefExoticComponent<XlsxViewerProps & RefAttributes<XlsxViewerHandle>> = forwardRef<XlsxViewerHandle, XlsxViewerProps>(
  function XlsxViewer(props, ref): ReactElement {
    const labels = useMemo<ViewerLabels>(() => ({ ...DEFAULT_LABELS, ...props.labels }), [props.labels]);
    const loaded = useWorkbook(props.source, { format: props.format, worker: props.worker, readOptions: props.readOptions, csvOptions: props.csvOptions });
    const wb = loaded.workbook;
    const idBase = `xv${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const locale = props.locale ?? browserLocale();
    const sheets = useMemo(() => visibleSheets(wb, props.showHiddenSheets === true), [wb, props.showHiddenSheets]);

    // Report load results once per workbook.
    const reported = useRef<unknown>(null);
    useEffect(() => {
      if (loaded.status === 'ready' && wb && reported.current !== wb) {
        reported.current = wb;
        props.onLoad?.({ workbook: wb, warnings: loaded.warnings });
        for (const w of loaded.warnings) props.onWarning?.(w);
      }
      if (loaded.status === 'error' && reported.current !== loaded.error) {
        reported.current = loaded.error;
        props.onError?.(loaded.error);
      }
    }, [loaded.status, wb, loaded.warnings, loaded.error, props]);

    const initialSheet = (): number => {
      const want = props.defaultSheet ?? wb?.activeSheet ?? 0;
      return sheets.includes(want) ? want : (sheets[0] ?? 0);
    };
    const [sheet, setSheetRaw] = useControllable(props.sheet, initialSheet, props.onSheetChange);
    // A new workbook resets an uncontrolled sheet choice.
    const lastWb = useRef(wb);
    useEffect(() => {
      if (lastWb.current !== wb) {
        lastWb.current = wb;
        memory.current.clear();
        if (props.sheet === undefined && wb) setSheetRaw(initialSheet());
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wb]);
    const sheetIndex = wb && sheets.includes(sheet) ? sheet : (sheets[0] ?? 0);

    const schemesKey = (props.hyperlinkSchemes ?? []).join(',');
    const rs: RenderSheet | null = useMemo(
      () => (wb && wb.sheets[sheetIndex] ? createRenderSheet(wb, sheetIndex, { format: formatCell, locale, hyperlinkSchemes: props.hyperlinkSchemes }) : null),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [wb, sheetIndex, locale, schemesKey],
    );
    const settings = useMemo(() => (rs ? sheetSettings(rs) : null), [rs]);

    const memory = useRef(new Map<number, SheetMemory>());
    const initialSelection = (): Selection => {
      if (props.defaultSelection) return props.defaultSelection;
      if (!settings) return single({ row: 0, col: 0 });
      const a = settings.activeCell;
      return settings.selection ? { ranges: [settings.selection], active: a } : single(a);
    };
    const [selection, setSelectionRaw] = useControllable(props.selection, initialSelection, props.onSelectionChange);
    const [zoom, setZoomRaw] = useControllable(props.zoom, () => props.defaultZoom ?? settings?.zoom ?? 100, props.onZoomChange);
    const clampZoom = (n: number): number => Math.min(400, Math.max(10, Math.round(n)));
    const setZoom = useCallback((n: number) => setZoomRaw(clampZoom(n)), [setZoomRaw]);
    const setSelection = useCallback((s: Selection) => (equalSelection(s, selection) ? undefined : setSelectionRaw(s)), [selection, setSelectionRaw]);

    // Remember each sheet's view; restore it when the sheet comes back.
    const scrollPos = useRef({ top: 0, left: 0 });
    const lastRs = useRef<RenderSheet | null>(null);
    useEffect(() => {
      if (!rs || lastRs.current === rs) return;
      const prev = lastRs.current;
      lastRs.current = rs;
      if (prev && prev.name !== undefined) memory.current.set(prev.sheet, { selection, scroll: scrollPos.current, zoom });
      const saved = memory.current.get(rs.sheet);
      if (props.selection === undefined) setSelectionRaw(saved?.selection ?? initialSelection());
      if (props.zoom === undefined) setZoomRaw(saved?.zoom ?? props.defaultZoom ?? sheetSettings(rs).zoom);
      scrollPos.current = saved?.scroll ?? { top: 0, left: 0 };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rs]);

    const grid = useRef<GridHandle>(null);
    const [announce, setAnnounce] = useState('');
    const [hint, setHint] = useState<string | null>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [noticeOpen, setNoticeOpen] = useState(true);
    const findHinted = useRef(false);

    const changeSheet = useCallback(
      (index: number) => {
        if (!wb || index === sheetIndex) return;
        setSheetRaw(index);
        setAnnounce(labels.sheet(wb.sheets[index]!.name));
      },
      [wb, sheetIndex, setSheetRaw, labels],
    );
    const sheetStep = useCallback(
      (delta: 1 | -1) => {
        const i = sheets.indexOf(sheetIndex);
        const next = sheets[i + delta];
        if (next !== undefined) {
          changeSheet(next);
          requestAnimationFrame(() => grid.current?.focusActive());
        }
      },
      [sheets, sheetIndex, changeSheet],
    );

    // The active cell, its model cell and its render cell.
    const activeModel = wb && rs ? wb.sheets[sheetIndex]?.rows[selection.active.row]?.[selection.active.col] : undefined;
    const activeCell = rs ? renderCell(rs, selection.active.row, selection.active.col) : null;
    const link: RenderHyperlink | undefined = activeCell?.hyperlink;

    const openLink = useCallback(() => {
      if (!link || !wb) return;
      if (link.kind === 'external') {
        if (!link.allowed) return;
        if (props.onHyperlink?.({ kind: 'external', href: link.href }) === false) return;
        window.open(link.href, '_blank', 'noopener,noreferrer');
      } else if (link.sheet !== null) {
        if (props.onHyperlink?.({ kind: 'internal', sheet: link.sheet, ref: link.ref }) === false) return;
        const target = parseTarget(link.ref, wb, link.sheet);
        if (!target) return;
        changeSheet(link.sheet);
        setSelectionRaw(single(target.cell));
        requestAnimationFrame(() => {
          grid.current?.scrollToCell(target.cell);
          grid.current?.focusActive();
        });
      }
    }, [link, wb, props, changeSheet, setSelectionRaw]);

    // Copy: TSV + HTML of the last range (docs/api.md §5.8.4 of javascript-excel; docs/ux.md §3.3).
    const lastCopy = useRef(0);
    const copy = useCallback(
      async (event: ClipboardEvent | null): Promise<void> => {
        if (!rs) return;
        const range = selection.ranges[selection.ranges.length - 1]!;
        const n = cellCount(range);
        if (n > COPY_LIMIT) {
          setHint(labels.copyTooLarge(n, COPY_LIMIT));
          return;
        }
        const text = rangeAsTsv(rs, range);
        const html = rangeAsHtml(rs, range);
        if (event?.clipboardData) {
          event.clipboardData.setData('text/plain', text);
          event.clipboardData.setData('text/html', html);
          event.preventDefault();
        } else if (Date.now() - lastCopy.current > 200 && typeof navigator !== 'undefined' && navigator.clipboard) {
          lastCopy.current = Date.now();
          try {
            if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
              await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
            } else await navigator.clipboard.writeText(text);
          } catch {
            return; // The copy event (if it fires) still fills the clipboard.
          }
        }
        setAnnounce(labels.copied(n));
        setHint(labels.copied(n));
      },
      [rs, selection, labels],
    );

    useImperativeHandle(
      ref,
      () => ({
        scrollTo(target, options) {
          if (!wb) return;
          let at: { sheet: number; cell: CellRef } | null;
          if (typeof target === 'string') at = parseTarget(target, wb, sheetIndex);
          else at = { sheet: sheetIndex, cell: target };
          if (!at) return;
          if (at.sheet !== sheetIndex) changeSheet(at.sheet);
          if (options?.select !== false) setSelectionRaw(single(at.cell));
          const cell = at.cell;
          requestAnimationFrame(() => grid.current?.scrollToCell(cell));
        },
        select: (s) => setSelectionRaw(s),
        copy: () => copy(null),
        focus: () => grid.current?.focusActive(),
        getWorkbook: () => wb,
      }),
      [wb, sheetIndex, changeSheet, setSelectionRaw, copy],
    );

    // Debounced status-bar announcement, so arrowing through cells doesn't flood screen readers.
    const stats = useMemo(() => {
      if (!rs) return null;
      if (selection.ranges.length === 1 && cellCount(selection.ranges[0]!) === 1) return null;
      let count = 0;
      let numeric = 0;
      let sum = 0;
      let truncated = false;
      let budget = STATS_LIMIT;
      for (const r of selection.ranges) {
        const s = rangeStats(rs, r, budget);
        count += s.count;
        numeric += s.numericCount;
        sum += s.sum;
        budget -= cellCount(r);
        if (s.truncated || budget <= 0) {
          truncated = true;
          break;
        }
      }
      return { count, numeric, sum, truncated, cells: selection.ranges.reduce((n, r) => n + cellCount(r), 0) };
    }, [rs, selection]);
    const numFmt = typeof activeModel === 'object' && activeModel !== null && !(activeModel instanceof Date) && 'style' in activeModel ? (activeModel as Cell).style?.numFmt : undefined;
    const fmtNumber = (n: number): string => formatValue(n, numFmt && !isDateFormat(numFmt) ? numFmt : undefined, { locale }).text;
    const summary = stats
      ? stats.truncated
        ? labels.tooManyForSum(STATS_LIMIT)
        : [labels.cells(stats.count), ...(stats.numeric ? [labels.sum(fmtNumber(stats.sum)), labels.average(fmtNumber(stats.sum / stats.numeric))] : [])].join(' · ')
      : '';
    useEffect(() => {
      if (!summary) return undefined;
      const t = setTimeout(() => setAnnounce(summary), 600);
      return () => clearTimeout(t);
    }, [summary]);
    useEffect(() => {
      if (!hint) return undefined;
      const t = setTimeout(() => setHint(null), 4000);
      return () => clearTimeout(t);
    }, [hint]);

    // Description of the active cell for screen readers: its formula and link.
    const description = [
      activeCell?.formula ? `${labels.formula}: ${activeCell.formula}` : '',
      activeCell?.noCachedValue ? labels.notCalculated : '',
      link ? labels.linkTo(link.kind === 'external' ? hostOf(link.href) : link.ref) : '',
    ]
      .filter(Boolean)
      .join('. ');

    const notices = loaded.warnings.filter((w) => w.code === 'UNSUPPORTED_PART');
    const rootStyle: CSSProperties = { ...props.style };
    const showFormulaBar = props.showFormulaBar !== false;
    const showTabs = props.showSheetTabs !== false;
    const showStatus = props.showStatusBar !== false;

    let body: ReactElement;
    if (loaded.status === 'loading') {
      const pct = Math.round((loaded.progress?.ratio ?? 0) * 100);
      body = (
        <div className="xv-state" aria-busy="true">
          <p>{labels.loading(loaded.fileName)}</p>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={labels.loading(loaded.fileName)} className="xv-progress">
            <div className="xv-progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <button type="button" className="xv-button" onClick={loaded.abort}>
            {labels.cancel}
          </button>
        </div>
      );
    } else if (loaded.status === 'error') {
      const { message, code } = errorMessage(loaded.error, labels);
      body = (
        <div className="xv-state" role="alert">
          <p className="xv-error">{message}</p>
          {loaded.fileName ? <p className="xv-muted">{loaded.fileName}</p> : null}
          {code ? (
            <details>
              <summary>{labels.details}</summary>
              <code>{code}</code>
            </details>
          ) : null}
        </div>
      );
    } else if (!wb || !rs || !settings) {
      body = (
        <div className="xv-state">
          <p className="xv-muted">{labels.noWorkbook}</p>
        </div>
      );
    } else {
      body = (
        <Grid
          key={rs.sheet}
          ref={grid}
          rs={rs}
          settings={settings}
          zoom={zoom}
          selection={selection}
          onSelectionChange={setSelection}
          showGridLines={props.showGridLines ?? settings.showGridLines}
          showHeaders={props.showHeaders ?? settings.showHeaders}
          labels={labels}
          fonts={props.fonts}
          idBase={`${idBase}-${rs.sheet}`}
          activeDescription={description}
          onSheetStep={sheetStep}
          onCopy={(e) => void copy(e)}
          onOpenLink={openLink}
          onShortcuts={() => setShortcutsOpen(true)}
          onFindKey={() => {
            if (!findHinted.current) {
              findHinted.current = true;
              setHint(labels.findHint);
            }
          }}
          initialScroll={memory.current.get(rs.sheet)?.scroll}
          onScrollChange={(p) => {
            scrollPos.current = p;
          }}
          overlay={(g) =>
            link ? (
              <LinkChip link={link} labels={labels} geometry={g} onOpen={openLink} onClose={() => grid.current?.focusActive()} />
            ) : null
          }
        />
      );
    }

    return (
      <div className={`xv-viewer${props.className ? ` ${props.className}` : ''}`} role="region" aria-label={props['aria-label'] ?? loaded.fileName ?? labels.viewer} style={rootStyle}>
        {showFormulaBar && rs && wb ? (
          <FormulaBar
            labels={labels}
            address={address(selection.active)}
            formula={activeCell?.formula ? (activeCell.arrayFormula ? `{${activeCell.formula}}` : activeCell.formula) : null}
            value={activeCell?.formula ? null : enteredValue(activeModel, locale)}
            result={activeCell?.formula ? (activeCell.noCachedValue ? labels.result(labels.notCalculated) : labels.result(activeCell.text)) : null}
          />
        ) : null}
        {notices.length && noticeOpen ? <Notices warnings={notices} labels={labels} onDismiss={() => setNoticeOpen(false)} /> : null}
        <div className="xv-body-area">{body}</div>
        {showTabs && wb && sheets.length ? <SheetTabs wb={wb} sheets={sheets} current={sheetIndex} labels={labels} onChange={changeSheet} /> : null}
        {showStatus && rs ? (
          <div className="xv-status">
            <span className="xv-status-text">{hint ?? summary}</span>
            <span className="xv-status-tools">
              <button type="button" className="xv-button xv-icon-button" aria-label={labels.zoomOut} onClick={() => setZoom([...ZOOM_STEPS].reverse().find((s) => s < zoom) ?? 10)}>
                <Icon kind="minus" />
              </button>
              <select
                className="xv-zoom"
                name="xv-zoom"
                aria-label={labels.zoom}
                value={ZOOM_STEPS.includes(zoom) ? String(zoom) : 'custom'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'fit' && rs) {
                    const width = grid.current?.viewport().width ?? 800;
                    const used = colLeft(rs, lastUsedCell(rs).col + 1);
                    setZoom((width / Math.max(1, used)) * 100);
                  } else if (v !== 'custom') setZoom(Number(v));
                }}
              >
                {ZOOM_STEPS.includes(zoom) ? null : <option value="custom">{zoom} %</option>}
                {ZOOM_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {s} %
                  </option>
                ))}
                <option value="fit">{labels.fitWidth}</option>
              </select>
              <button type="button" className="xv-button xv-icon-button" aria-label={labels.zoomIn} onClick={() => setZoom(ZOOM_STEPS.find((s) => s > zoom) ?? 400)}>
                <Icon kind="plus" />
              </button>
              <button type="button" className="xv-button xv-icon-button" aria-label={labels.shortcuts} onClick={() => setShortcutsOpen(true)}>
                ?
              </button>
            </span>
          </div>
        ) : null}
        <div className="xv-visually-hidden" role="status" aria-live="polite">
          {announce}
        </div>
        {shortcutsOpen ? <Shortcuts labels={labels} onClose={() => { setShortcutsOpen(false); grid.current?.focusActive(); }} /> : null}
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// Parts

function Icon({ kind }: { kind: 'minus' | 'plus' | 'left' | 'right' }): ReactElement {
  // Simple geometric icons drawn for this project (docs/ux.md §8.2).
  const d = { minus: 'M4 8h8', plus: 'M4 8h8M8 4v8', left: 'M10 3 5 8l5 5', right: 'M6 3l5 5-5 5' }[kind];
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FormulaBar(p: { labels: ViewerLabels; address: string; formula: string | null; value: string | null; result: string | null }): ReactElement {
  const isFormula = p.formula !== null;
  return (
    <div className="xv-formula-bar">
      <input className="xv-address" name="xv-address" readOnly value={p.address} aria-label={p.labels.cellAddress} />
      <span className="xv-equals" aria-hidden="true">
        =
      </span>
      <div className="xv-formula-field">
        <textarea name="xv-formula" className={`xv-formula${isFormula ? ' xv-mono' : ''}`} readOnly rows={1} value={isFormula ? p.formula! : (p.value ?? '')} aria-label={isFormula ? p.labels.formula : p.labels.value} />
        {p.result !== null ? <div className="xv-result">{p.result}</div> : null}
      </div>
    </div>
  );
}

function Notices(p: { warnings: ExcelWarning[]; labels: ViewerLabels; onDismiss: () => void }): ReactElement {
  const lines = [...new Set(p.warnings.map((w) => (/VBA|macro/i.test(w.message) ? p.labels.macrosNotRun : w.message)))];
  return (
    <div className="xv-notice" role="region" aria-label={p.labels.notShownTitle}>
      <div>
        <strong>{p.labels.notShownTitle}.</strong> {p.labels.notShownSummary}
        <details>
          <summary>{p.labels.details}</summary>
          <ul>
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      </div>
      <button type="button" className="xv-button" onClick={p.onDismiss}>
        {p.labels.dismiss}
      </button>
    </div>
  );
}

function LinkChip(p: { link: RenderHyperlink; labels: ViewerLabels; geometry: { x: number; y: number; width: number; height: number }; onOpen: () => void; onClose: () => void }): ReactElement {
  const style: CSSProperties = { insetInlineStart: p.geometry.x, top: p.geometry.y + p.geometry.height + 2 };
  const onKeyDown = (e: ReactKeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      p.onClose();
    }
  };
  if (p.link.kind === 'external' && !p.link.allowed) {
    return (
      <div className="xv-link-chip xv-link-blocked" style={style}>
        {p.labels.linkBlocked}
      </div>
    );
  }
  if (p.link.kind === 'external') {
    const host = hostOf(p.link.href);
    const i = p.link.href.indexOf(host);
    return (
      <div className="xv-link-chip" style={style} onKeyDown={onKeyDown}>
        <span className="xv-link-url">
          {i >= 0 ? (
            <>
              {p.link.href.slice(0, i)}
              <strong>{host}</strong>
              {p.link.href.slice(i + host.length)}
            </>
          ) : (
            p.link.href
          )}
        </span>
        <a
          className="xv-button"
          href={p.link.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            p.onOpen();
          }}
        >
          {p.labels.linkOpen}
        </a>
      </div>
    );
  }
  return (
    <div className="xv-link-chip" style={style} onKeyDown={onKeyDown}>
      <button type="button" className="xv-button" disabled={p.link.sheet === null} onClick={p.onOpen}>
        {p.link.sheet === null ? p.labels.linkBlocked : p.labels.linkGoTo(p.link.ref)}
      </button>
    </div>
  );
}

function SheetTabs(p: { wb: Workbook<CellInput>; sheets: number[]; current: number; labels: ViewerLabels; onChange: (i: number) => void }): ReactElement {
  const [focused, setFocused] = useState(p.current);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => setFocused(p.current), [p.current]);
  const onKeyDown = (e: ReactKeyboardEvent): void => {
    const i = p.sheets.indexOf(focused);
    let next: number | undefined;
    if (e.key === 'ArrowRight') next = p.sheets[Math.min(p.sheets.length - 1, i + 1)];
    else if (e.key === 'ArrowLeft') next = p.sheets[Math.max(0, i - 1)];
    else if (e.key === 'Home') next = p.sheets[0];
    else if (e.key === 'End') next = p.sheets[p.sheets.length - 1];
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      p.onChange(focused);
      return;
    } else return;
    e.preventDefault();
    if (next !== undefined) {
      setFocused(next);
      strip.current?.querySelector<HTMLElement>(`[data-sheet="${next}"]`)?.focus();
    }
  };
  return (
    <div className="xv-tabs">
      <button type="button" className="xv-button xv-icon-button" aria-label={p.labels.scrollTabsBack} onClick={() => strip.current?.scrollBy({ left: -200 })}>
        <Icon kind="left" />
      </button>
      <button type="button" className="xv-button xv-icon-button" aria-label={p.labels.scrollTabsForward} onClick={() => strip.current?.scrollBy({ left: 200 })}>
        <Icon kind="right" />
      </button>
      <div className="xv-tablist" role="tablist" aria-label={p.labels.sheets} ref={strip} onKeyDown={onKeyDown}>
        {p.sheets.map((i) => {
          const s = p.wb.sheets[i]!;
          const color = s.tabColor ? tabColor(s.tabColor) : null;
          return (
            <button
              key={i}
              type="button"
              role="tab"
              data-sheet={i}
              aria-selected={i === p.current}
              tabIndex={i === focused ? 0 : -1}
              className="xv-tab"
              onClick={() => p.onChange(i)}
            >
              {color ? <span className="xv-tab-color" style={{ backgroundColor: color }} aria-hidden="true" /> : null}
              {s.name}
              {s.state === 'hidden' ? ` ${p.labels.hiddenSheet}` : ''}
            </button>
          );
        })}
      </div>
      {p.sheets.length > 1 ? (
        <select className="xv-all-sheets" name="xv-sheet" aria-label={p.labels.allSheets} value={String(p.current)} onChange={(e) => p.onChange(Number(e.target.value))}>
          {p.sheets.map((i) => (
            <option key={i} value={i}>
              {p.wb.sheets[i]!.name}
              {p.wb.sheets[i]!.state === 'hidden' ? ` ${p.labels.hiddenSheet}` : ''}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function tabColor(c: NonNullable<Workbook['sheets'][number]['tabColor']>): string | null {
  const s = typeof c === 'string' ? c : 'rgb' in c ? c.rgb : null;
  if (!s) return null;
  const hex = s.replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : /^[0-9a-f]{8}$/i.test(hex) ? `#${hex.slice(2)}` : null;
}

function Shortcuts(p: { labels: ViewerLabels; onClose: () => void }): ReactElement {
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => close.current?.focus(), []);
  return (
    <div
      className="xv-dialog-backdrop"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          p.onClose();
        }
      }}
    >
      <div className="xv-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{p.labels.shortcuts}</h2>
        <table>
          <tbody>
            {p.labels.shortcutList.map(([k, a]) => (
              <tr key={k}>
                <th scope="row">
                  <kbd>{k}</kbd>
                </th>
                <td>{a}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button ref={close} type="button" className="xv-button" onClick={p.onClose}>
          {p.labels.close}
        </button>
      </div>
    </div>
  );
}
