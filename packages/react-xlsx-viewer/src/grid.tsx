// The virtualised, accessible sheet grid (docs/api.md §7, docs/ux.md §2–3).
// One scroll container; a role="grid" with row groups: the sticky top group
// holds the column headers and frozen rows, the body group the scrolling rows.
// Rows are flex rows, so frozen columns and row headers can be position:
// sticky. Only the visible window (plus overscan, the active cell and merge
// anchors reaching into the window) is rendered.
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type RefAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  colAt,
  colLeft,
  colWidth,
  edge,
  isColHidden,
  isRowHidden,
  lastUsedCell,
  mergeAt,
  renderCell,
  rowAt,
  rowHeight,
  rowTop,
  sheetExtent,
  step,
  type CellRef,
  type RangeRef,
  type RenderBorder,
  type RenderCell,
  type RenderDirection,
  type RenderSheet,
  type SheetSettings,
} from 'javascript-excel/render';
import { fontStack } from './fonts';
import type { ViewerLabels } from './labels';
import { textWidth } from './measure';
import { cellCount, colName, contains, extendTo, focusOf, rangeOf, single, type Selection } from './selection';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Rows and columns rendered beyond the viewport on each side. Set from the Performance harness (docs/api.md §9). */
export const OVERSCAN = { rows: 6, cols: 3 } as const;
const HEADER_H = 20;

export interface GridHandle {
  focusActive(): void;
  scrollToCell(cell: CellRef): void;
  viewport(): { width: number; height: number };
}

export interface GridProps {
  rs: RenderSheet;
  settings: SheetSettings;
  zoom: number;
  selection: Selection;
  onSelectionChange: (s: Selection) => void;
  showGridLines: boolean;
  showHeaders: boolean;
  labels: ViewerLabels;
  fonts?: Readonly<Record<string, string>> | undefined;
  idBase: string;
  /** Describes the active cell for screen readers (formula, link), rendered off screen. */
  activeDescription: string;
  onSheetStep: (delta: 1 | -1) => void;
  onCopy: (event: ClipboardEvent | null) => void;
  onOpenLink: () => void;
  onShortcuts: () => void;
  onFindKey: () => void;
  /** Extra content positioned in the scroll area, after the grid (the link chip). */
  overlay?: ((geometry: { x: number; y: number; width: number; height: number }) => ReactNode) | undefined;
  initialScroll?: { top: number; left: number } | undefined;
  onScrollChange?: ((pos: { top: number; left: number }) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Cell styles

const BORDER_CSS: Record<string, string> = {
  hair: '1px dotted', dotted: '1px dotted', dashDotDot: '1px dashed', dashDot: '1px dashed', dashed: '1px dashed', thin: '1px solid',
  mediumDashDotDot: '2px dashed', slantDashDot: '2px dashed', mediumDashDot: '2px dashed', mediumDashed: '2px dashed', medium: '2px solid',
  double: '3px double', thick: '3px solid',
};
const borderCss = (b: RenderBorder | undefined): string | undefined => (b ? `${BORDER_CSS[b.style] ?? '1px solid'} ${b.color}` : undefined);

function backgroundCss(cell: RenderCell): CSSProperties {
  const bg = cell.style.background;
  if (bg.kind === 'solid') return { backgroundColor: bg.color };
  if (bg.kind === 'pattern') {
    // Patterns are approximated with CSS gradients (no url(), so no img-src needed under a strict CSP).
    return { backgroundColor: bg.bg, backgroundImage: `repeating-linear-gradient(45deg, ${bg.fg} 0 1px, transparent 1px 4px)` };
  }
  if (bg.kind === 'gradient') {
    const stops = bg.stops.map((s) => `${s.color} ${Math.round(s.position * 100)}%`).join(', ');
    return { backgroundImage: bg.gradient === 'path' ? `radial-gradient(${stops})` : `linear-gradient(${bg.degree + 90}deg, ${stops})` };
  }
  return {};
}

const H_ALIGN: Record<string, CSSProperties['justifyContent']> = { left: 'flex-start', center: 'center', right: 'flex-end' };
const V_ALIGN: Record<string, CSSProperties['alignItems']> = { top: 'flex-start', center: 'center', bottom: 'flex-end', justify: 'stretch', distributed: 'stretch' };

interface CellViewProps {
  cell: RenderCell | null;
  row: number;
  col: number;
  width: number;
  height: number;
  /** Width the text may spill into (empty neighbours to the right), in px. */
  spill: number;
  zoom: number;
  active: boolean;
  selected: boolean;
  /** Selection outline sides, as 'trbl' flags. */
  outline: string;
  sticky: number | null;
  gridLines: boolean;
  fonts: Readonly<Record<string, string>> | undefined;
  id: string;
  describedBy: string | undefined;
}

const CellView = memo(function CellView(p: CellViewProps): ReactElement {
  const { cell, zoom: z } = p;
  const style: CSSProperties = { width: p.width, minWidth: p.width, height: p.height };
  if (p.sticky !== null) Object.assign(style, { position: 'sticky', insetInlineStart: p.sticky, zIndex: 2 });
  const shadows: string[] = [];
  if (p.outline) {
    const w = 2;
    if (p.outline.includes('t')) shadows.push(`inset 0 ${w}px 0 var(--xv-selection-line)`);
    if (p.outline.includes('b')) shadows.push(`inset 0 -${w}px 0 var(--xv-selection-line)`);
    if (p.outline.includes('l')) shadows.push(`inset ${w}px 0 0 var(--xv-selection-line)`);
    if (p.outline.includes('r')) shadows.push(`inset -${w}px 0 0 var(--xv-selection-line)`);
  }
  let content: ReactNode = null;
  let textStyle: CSSProperties | undefined;
  if (cell) {
    Object.assign(style, backgroundCss(cell));
    const f = cell.style.font;
    const a = cell.style.align;
    const horizontal = a.horizontal === 'general' ? cell.align : a.horizontal === 'centerContinuous' ? 'center' : a.horizontal === 'distributed' || a.horizontal === 'justify' || a.horizontal === 'fill' ? 'left' : a.horizontal;
    style.justifyContent = H_ALIGN[horizontal] ?? 'flex-start';
    style.alignItems = V_ALIGN[a.vertical] ?? 'flex-end';
    const fontSizePx = (f.sizePt * 96) / 72 * z;
    const family = fontStack(f.family, p.fonts);
    textStyle = {
      fontFamily: family,
      fontSize: fontSizePx,
      fontWeight: f.bold ? 700 : 400,
      fontStyle: f.italic ? 'italic' : 'normal',
      color: cell.color ?? f.color,
      textDecorationLine: [f.underline !== 'none' ? 'underline' : '', f.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
      textDecorationStyle: f.underline === 'double' || f.underline === 'doubleAccounting' ? 'double' : 'solid',
      whiteSpace: a.wrap ? 'pre-wrap' : 'pre',
      paddingInlineStart: a.indent ? a.indent * 9 * z : undefined,
      textAlign: a.horizontal === 'justify' || a.horizontal === 'distributed' ? 'justify' : (horizontal as CSSProperties['textAlign']),
    };
    if (f.vertAlign !== 'baseline') textStyle.verticalAlign = f.vertAlign === 'superscript' ? 'super' : 'sub';
    if (a.rotation === 'vertical') Object.assign(textStyle, { writingMode: 'vertical-rl', textOrientation: 'upright' });
    else if (a.rotation) textStyle.transform = `rotate(${-a.rotation}deg)`;
    if (p.spill > 0) Object.assign(textStyle, { width: p.width + p.spill - 6 * z, overflow: 'hidden' });
    let text = cell.text;
    const font = `${f.italic ? 'italic ' : ''}${f.bold ? '700 ' : ''}${fontSizePx}px ${family}`;
    if ((cell.type === 'number' || cell.type === 'date') && !a.wrap && text) {
      // Numbers that don't fit show as #### (Excel), when the text can be measured.
      const avail = p.width - 6 * z;
      const w = textWidth(text, font);
      if (w !== null && w > avail) {
        const hash = textWidth('#', font) ?? 1;
        text = '#'.repeat(Math.max(1, Math.floor(avail / hash)));
      }
    }
    if (cell.fill && !a.wrap) {
      const free = p.width - 6 * z - (textWidth(text, font) ?? p.width);
      const one = textWidth(cell.fill.char, font);
      if (one && free > one) text = text.slice(0, cell.fill.at) + cell.fill.char.repeat(Math.floor(free / one)) + text.slice(cell.fill.at);
    }
    content = cell.runs ? (
      cell.runs.map((run, i) => (
        <span
          key={i}
          style={{
            fontWeight: run.font.bold ? 700 : 400,
            fontStyle: run.font.italic ? 'italic' : 'normal',
            color: run.font.color,
            fontSize: (run.font.sizePt * 96) / 72 * z,
            fontFamily: fontStack(run.font.family, p.fonts),
            textDecorationLine: run.font.underline !== 'none' ? 'underline' : run.font.strike ? 'line-through' : 'none',
          }}
        >
          {run.text}
        </span>
      ))
    ) : (
      text
    );
    if (cell.merge || p.spill > 0) style.zIndex = Math.max(Number(style.zIndex ?? 0), 1);
  }
  const filled = cell !== null && cell.style.background.kind !== 'none';
  if (p.gridLines && !filled) shadows.push('inset -1px -1px 0 var(--xv-gridline)');
  if (shadows.length) style.boxShadow = shadows.join(', ');
  const edges = cell?.edges;
  const hasEdges = edges && (edges.top || edges.left || edges.right || edges.bottom);
  return (
    <div
      role="gridcell"
      id={p.id}
      aria-colindex={p.col + 2}
      aria-colspan={cell?.merge && cell.merge.cols > 1 ? cell.merge.cols : undefined}
      aria-rowspan={cell?.merge && cell.merge.rows > 1 ? cell.merge.rows : undefined}
      aria-selected={p.selected}
      aria-describedby={p.describedBy}
      tabIndex={p.active ? 0 : -1}
      data-r={p.row}
      data-c={p.col}
      className={`xv-cell${p.active ? ' xv-active' : ''}${p.selected && !p.active ? ' xv-selected' : ''}${p.spill > 0 ? ' xv-spill' : ''}${cell?.noCachedValue ? ' xv-nocache' : ''}`}
      style={style}
    >
      {hasEdges ? (
        <span
          className="xv-edges"
          aria-hidden="true"
          style={{ borderTop: borderCss(edges.top), borderLeft: borderCss(edges.left), borderRight: borderCss(edges.right), borderBottom: borderCss(edges.bottom) }}
        />
      ) : null}
      {content !== null ? (
        <span className="xv-text" dir={cell?.style.align.direction === 'auto' ? 'auto' : cell?.style.align.direction} style={textStyle}>
          {content}
        </span>
      ) : null}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Rows: memoised, so scrolling only renders rows that enter the window.

interface RowViewProps {
  r: number;
  top: number;
  height: number;
  width: number;
  /** Changes when the row's columns change. */
  colsKey: string;
  /** Changes when the selection touches this row differently. */
  selKey: string;
  /** Changes when anything shared by all rows changes (sheet, zoom, options). */
  ctx: object;
  render: (r: number) => ReactNode[];
}

const RowView = memo(
  function RowView(p: RowViewProps): ReactElement {
    return (
      <div role="row" aria-rowindex={p.r + 2} className="xv-row" style={{ top: p.top, height: p.height, width: p.width }}>
        {p.render(p.r)}
      </div>
    );
  },
  (a, b) => a.r === b.r && a.top === b.top && a.height === b.height && a.width === b.width && a.colsKey === b.colsKey && a.selKey === b.selKey && a.ctx === b.ctx,
);

// ---------------------------------------------------------------------------
// Grid

interface Window {
  rows: number[];
  cols: number[];
}

function visibleRange(offsetsAt: (px: number) => number, from: number, to: number, frozen: number, count: number, overscan: number): [number, number] {
  const a = Math.max(frozen, offsetsAt(from) - overscan);
  const b = Math.min(count - 1, offsetsAt(to) + overscan);
  return [a, Math.max(a, b)];
}

export const Grid: ForwardRefExoticComponent<GridProps & RefAttributes<GridHandle>> = forwardRef<GridHandle, GridProps>(function Grid(props, ref): ReactElement {
  const { rs, settings, zoom, selection, onSelectionChange, labels, idBase } = props;
  const z = zoom / 100;
  const scroller = useRef<HTMLDivElement>(null);
  const gridEl = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(props.initialScroll ?? { top: 0, left: 0 });
  const [view, setView] = useState({ width: 800, height: 400 });
  const hadFocus = useRef(false);
  const dragging = useRef(false);

  const ext = sheetExtent(rs);
  const fr = Math.min(settings.freeze.rows, ext.rows);
  const fc = Math.min(settings.freeze.cols, ext.cols);
  const showHeaders = props.showHeaders;
  const headerW = showHeaders ? Math.max(32, String(ext.rows).length * 8 + 16) * z : 0;
  const headerH = showHeaders ? HEADER_H * z : 0;
  const totalW = headerW + colLeft(rs, ext.cols) * z;
  const totalH = headerH + rowTop(rs, ext.rows) * z;
  const frozenH = rowTop(rs, fr) * z;
  const frozenW = colLeft(rs, fc) * z;
  const rtl = settings.rightToLeft;

  // Viewport size and scroll position.
  useIsoLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const measure = (): void => setView((v) => (v.width === el.clientWidth && v.height === el.clientHeight ? v : { width: el.clientWidth || v.width, height: el.clientHeight || v.height }));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useIsoLayoutEffect(() => {
    const el = scroller.current;
    if (el && props.initialScroll) {
      el.scrollTop = props.initialScroll.top;
      el.scrollLeft = rtl ? -props.initialScroll.left : props.initialScroll.left;
    }
    // Only when the sheet changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rs]);
  const frame = useRef(0);
  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = scroller.current;
      if (!el) return;
      const pos = { top: el.scrollTop, left: Math.abs(el.scrollLeft) };
      setScroll((s) => (s.top === pos.top && s.left === pos.left ? s : pos));
      props.onScrollChange?.(pos);
    });
  }, [props]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // The rendered window.
  const win: Window = useMemo(() => {
    const [r0, r1] = visibleRange((y) => rowAt(rs, y), (scroll.top + frozenH) / z, (scroll.top + view.height - headerH) / z, fr, ext.rows, OVERSCAN.rows);
    const [c0, c1] = visibleRange((x) => colAt(rs, x), (scroll.left + frozenW) / z, (scroll.left + view.width - headerW) / z, fc, ext.cols, OVERSCAN.cols);
    const rows = new Set<number>();
    for (let r = r0; r <= r1; r++) if (!isRowHidden(rs, r)) rows.add(r);
    const cols = new Set<number>();
    for (let c = c0; c <= c1; c++) if (!isColHidden(rs, c)) cols.add(c);
    // The active cell is always rendered, so focus never lands on a removed node.
    if (selection.active.row >= fr) rows.add(selection.active.row);
    if (selection.active.col >= fc) cols.add(selection.active.col);
    // Merges that start above or left of the window but reach into it.
    for (const c of [...cols]) {
      const m = mergeAt(rs, r0, c);
      if (m && m.anchor.row < r0 && m.anchor.row >= fr) rows.add(m.anchor.row);
    }
    for (const r of [...rows]) {
      const m = mergeAt(rs, r, c0);
      if (m && m.anchor.col < c0 && m.anchor.col >= fc) cols.add(m.anchor.col);
    }
    return { rows: [...rows].sort((a, b) => a - b), cols: [...cols].sort((a, b) => a - b) };
  }, [rs, scroll, view, z, fr, fc, frozenH, frozenW, headerH, headerW, ext.rows, ext.cols, selection.active.row, selection.active.col]);

  const frozenCols = useMemo(() => Array.from({ length: fc }, (_, c) => c).filter((c) => !isColHidden(rs, c)), [rs, fc]);
  const frozenRows = useMemo(() => Array.from({ length: fr }, (_, r) => r).filter((r) => !isRowHidden(rs, r)), [rs, fr]);

  // Selection helpers.
  const outlineOf = useCallback(
    (r: number, c: number, rows = 1, cols = 1): string => {
      let s = '';
      for (const range of selection.ranges) {
        if (!(r <= range.end.row && r + rows - 1 >= range.start.row && c <= range.end.col && c + cols - 1 >= range.start.col)) continue;
        if (r <= range.start.row) s += 't';
        if (r + rows - 1 >= range.end.row) s += 'b';
        if (c <= range.start.col) s += rtl ? 'r' : 'l';
        if (c + cols - 1 >= range.end.col) s += rtl ? 'l' : 'r';
      }
      return s;
    },
    [selection.ranges, rtl],
  );
  const multi = selection.ranges.length > 1 || cellCount(selection.ranges[0]!) > 1;

  // Scrolling a cell into view (keyboard moves, scrollTo).
  const scrollToCell = useCallback(
    (cell: CellRef) => {
      const el = scroller.current;
      if (!el) return;
      const top = headerH + rowTop(rs, cell.row) * z;
      const bottom = top + rowHeight(rs, cell.row) * z;
      const left = headerW + colLeft(rs, cell.col) * z;
      const right = left + colWidth(rs, cell.col) * z;
      if (cell.row >= fr) {
        if (top - headerH - frozenH < el.scrollTop) el.scrollTop = top - headerH - frozenH;
        else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
      }
      if (cell.col >= fc) {
        const sl = Math.abs(el.scrollLeft);
        let next = sl;
        if (left - headerW - frozenW < sl) next = left - headerW - frozenW;
        else if (right > sl + el.clientWidth) next = right - el.clientWidth;
        if (next !== sl) el.scrollLeft = rtl ? -next : next;
      }
    },
    [rs, z, headerH, headerW, fr, fc, frozenH, frozenW, rtl],
  );

  const focusActive = useCallback(() => {
    const el = document.getElementById(`${idBase}-${selection.active.row}-${selection.active.col}`);
    el?.focus({ preventScroll: true });
  }, [idBase, selection.active.row, selection.active.col]);

  useImperativeHandle(ref, () => ({ focusActive, scrollToCell, viewport: () => ({ width: view.width - headerW, height: view.height - headerH }) }), [focusActive, scrollToCell, view, headerW, headerH]);

  // Keep focus on the active cell while the grid has focus.
  useIsoLayoutEffect(() => {
    if (hadFocus.current) focusActive();
  }, [selection.active.row, selection.active.col, focusActive]);

  const move = useCallback(
    (to: CellRef, extend: boolean) => {
      const next = extend ? extendTo(selection, to) : single(to);
      onSelectionChange(next);
      scrollToCell(extend ? to : next.active);
    },
    [selection, onSelectionChange, scrollToCell],
  );

  const pageRows = useCallback(
    (from: number, dir: 1 | -1): number => {
      const y = rowTop(rs, from) + (dir * (view.height - headerH - frozenH)) / z;
      return Math.max(fr, rowAt(rs, Math.max(0, y)));
    },
    [rs, view.height, headerH, frozenH, z, fr],
  );
  const pageCols = useCallback(
    (from: number, dir: 1 | -1): number => {
      const x = colLeft(rs, from) + (dir * (view.width - headerW - frozenW)) / z;
      return Math.max(fc, colAt(rs, Math.max(0, x)));
    },
    [rs, view.width, headerW, frozenW, z, fc],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const from = e.shiftKey ? focusOf(selection) : selection.active;
      const arrows: Record<string, RenderDirection> = rtl
        ? { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'right', ArrowRight: 'left' }
        : { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      const dir = arrows[e.key];
      let handled = true;
      if (dir) move(ctrl ? edge(rs, from, dir) : step(rs, from, dir), e.shiftKey);
      else if (e.key === 'Home') move(ctrl ? { row: fr, col: fc } : { row: from.row, col: fc }, e.shiftKey);
      else if (e.key === 'End' && ctrl) move(lastUsedCell(rs), e.shiftKey);
      else if (e.key === 'PageDown' || e.key === 'PageUp') {
        const d = e.key === 'PageDown' ? 1 : -1;
        if (ctrl) props.onSheetStep(d);
        else if (e.altKey) move({ row: from.row, col: pageCols(from.col, d) }, e.shiftKey);
        else move({ row: pageRows(from.row, d), col: from.col }, e.shiftKey);
      } else if (ctrl && (e.key === 'a' || e.key === 'A')) {
        const used = rangeOf({ row: 0, col: 0 }, lastUsedCell(rs));
        const r = selection.ranges[0]!;
        const isUsed = selection.ranges.length === 1 && r.start.row === 0 && r.start.col === 0 && r.end.row === used.end.row && r.end.col === used.end.col;
        const all = isUsed ? rangeOf({ row: 0, col: 0 }, { row: ext.rows - 1, col: ext.cols - 1 }) : used;
        onSelectionChange({ ranges: [all], active: selection.active });
      } else if (e.key === ' ' && (e.shiftKey || ctrl)) {
        const r = selection.ranges[selection.ranges.length - 1]!;
        const range: RangeRef = e.shiftKey && !ctrl ? { start: { row: r.start.row, col: 0 }, end: { row: r.end.row, col: ext.cols - 1 } } : { start: { row: 0, col: r.start.col }, end: { row: ext.rows - 1, col: r.end.col } };
        onSelectionChange({ ranges: [range], active: selection.active });
      } else if (ctrl && (e.key === 'c' || e.key === 'C')) {
        props.onCopy(null);
        handled = false; // let the native copy event fire too; onCopy below fills it
      } else if (ctrl && (e.key === 'f' || e.key === 'F')) {
        props.onFindKey();
        handled = false; // the browser's find still opens
      } else if (e.key === 'Enter' && e.altKey) props.onOpenLink();
      else if (e.key === 'Escape') onSelectionChange(single(selection.active));
      else if (e.key === '?' || (e.key === '/' && e.shiftKey)) props.onShortcuts();
      else handled = false;
      if (handled) e.preventDefault();
    },
    [selection, rs, rtl, fr, fc, ext.rows, ext.cols, move, pageRows, pageCols, onSelectionChange, props],
  );

  const cellFromEvent = (target: EventTarget | null): CellRef | null => {
    const el = (target as HTMLElement | null)?.closest?.('[data-r]') as HTMLElement | null;
    if (!el) return null;
    return { row: Number(el.dataset['r']), col: Number(el.dataset['c']) };
  };
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const at = cellFromEvent(e.target);
      if (!at) return;
      const anchor = mergeAt(rs, at.row, at.col)?.anchor ?? at;
      if (e.shiftKey) onSelectionChange(extendTo(selection, anchor));
      else if (e.ctrlKey || e.metaKey) onSelectionChange({ ranges: [...selection.ranges, rangeOf(anchor, anchor)], active: anchor });
      else onSelectionChange(single(anchor));
      hadFocus.current = true;
      dragging.current = true;
    },
    [rs, selection, onSelectionChange],
  );
  const onPointerOver = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging.current || e.buttons !== 1) return;
      const at = cellFromEvent(e.target);
      if (at) onSelectionChange(extendTo(selection, at));
    },
    [selection, onSelectionChange],
  );
  useEffect(() => {
    const up = (): void => {
      dragging.current = false;
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const selectHeader = (kind: 'row' | 'col' | 'all', index: number, extend: boolean): void => {
    const range: RangeRef =
      kind === 'all'
        ? rangeOf({ row: 0, col: 0 }, { row: ext.rows - 1, col: ext.cols - 1 })
        : kind === 'row'
          ? rangeOf({ row: extend ? selection.active.row : index, col: 0 }, { row: index, col: ext.cols - 1 })
          : rangeOf({ row: 0, col: extend ? selection.active.col : index }, { row: ext.rows - 1, col: index });
    const active = extend ? selection.active : kind === 'col' ? { row: Math.max(fr, 0), col: index } : kind === 'row' ? { row: index, col: Math.max(fc, 0) } : selection.active;
    onSelectionChange({ ranges: [range], active });
    hadFocus.current = true;
  };

  // Row content: [row header][frozen cells][spacer][window cells...].
  const renderRowCells = (r: number): ReactNode[] => {
    const out: ReactNode[] = [];
    const h = rowHeight(rs, r) * z;
    const pushCells = (cols: number[], sticky: boolean): void => {
      let x = sticky ? 0 : colLeft(rs, fc);
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i]!;
        const left = colLeft(rs, c);
        if (left > x) out.push(<div key={`s${c}`} className="xv-spacer" aria-hidden="true" style={{ width: (left - x) * z, minWidth: (left - x) * z }} />);
        const m = mergeAt(rs, r, c);
        if (m && (m.anchor.row !== r || m.anchor.col !== c)) {
          // Covered: horizontally by an anchor in this row (already drawn), or vertically from above (leave the space).
          if (m.anchor.row !== r) out.push(<div key={`v${c}`} className="xv-spacer" aria-hidden="true" style={{ width: colWidth(rs, c) * z, minWidth: colWidth(rs, c) * z }} />);
          x = left + colWidth(rs, c);
          continue;
        }
        const cell = renderCell(rs, r, c);
        let w = colWidth(rs, c);
        let hh = h;
        if (cell?.merge) {
          w = colLeft(rs, c + cell.merge.cols) - left;
          hh = (rowTop(rs, r + cell.merge.rows) - rowTop(rs, r)) * z;
          // Skip the columns the merge covers in this row.
          while (i + 1 < cols.length && cols[i + 1]! < c + cell.merge.cols) i++;
        }
        let spill = 0;
        if (cell && !cell.merge && !cell.style.align.wrap && (cell.type === 'string' || cell.type === 'richText') && cell.align === 'left' && (cell.style.align.horizontal === 'general' || cell.style.align.horizontal === 'left')) {
          for (let j = i + 1; j < cols.length && cols[j] === cols[j - 1]! + 1; j++) {
            const next = renderCell(rs, r, cols[j]!);
            if (next && (next.text !== '' || next.merge)) break;
            if (mergeAt(rs, r, cols[j]!)) break;
            spill += colWidth(rs, cols[j]!) * z;
          }
        }
        const isActive = selection.active.row === r && selection.active.col === c;
        const span = cell?.merge;
        out.push(
          <CellView
            key={c}
            cell={cell}
            row={r}
            col={c}
            width={w * z}
            height={hh}
            spill={spill}
            zoom={z}
            active={isActive}
            selected={selection.ranges.some((rg) => contains(rg, r, c))}
            outline={multi || isActive ? outlineOf(r, c, span?.rows ?? 1, span?.cols ?? 1) : ''}
            sticky={sticky ? headerW + left * z : null}
            gridLines={props.showGridLines}
            fonts={props.fonts}
            id={`${idBase}-${r}-${c}`}
            describedBy={isActive && props.activeDescription ? `${idBase}-desc` : undefined}
          />,
        );
        x = left + w;
      }
    };
    if (showHeaders) {
      const hiddenBefore = r > 0 && isRowHidden(rs, r - 1);
      let from = r - 1;
      while (from > 0 && isRowHidden(rs, from - 1)) from--;
      out.push(
        <div
          key="h"
          role="rowheader"
          aria-colindex={1}
          className={`xv-rowheader${hiddenBefore ? ' xv-hidden-before' : ''}${selection.ranges.some((rg) => r >= rg.start.row && r <= rg.end.row) ? ' xv-header-selected' : ''}`}
          title={hiddenBefore ? labels.rowsHidden(from + 1, r) : undefined}
          style={{ width: headerW, minWidth: headerW, height: h, insetInlineStart: 0 }}
          onPointerDown={(e) => {
            e.preventDefault();
            selectHeader('row', r, e.shiftKey);
          }}
        >
          {r + 1}
        </div>,
      );
    }
    pushCells(frozenCols, true);
    pushCells(win.cols, false);
    return out;
  };

  // What a row's rendering depends on besides its index: the shared context, its columns and its part of the selection.
  const ctx = useMemo(() => ({}), [rs, z, fc, headerW, props.showGridLines, props.fonts, idBase, labels, props.activeDescription, multi, rtl, showHeaders]);
  const colsKey = win.cols.join(',');
  const selKey = (r: number): string => {
    let k = '';
    for (const rg of selection.ranges) if (r >= rg.start.row - 1 && r <= rg.end.row + 1) k += `${rg.start.row},${rg.start.col},${rg.end.row},${rg.end.col};`;
    if (selection.active.row === r) k += `a${selection.active.col}`;
    return k;
  };
  const renderRow = (r: number, top: number): ReactElement => (
    <RowView key={r} r={r} top={top} height={rowHeight(rs, r) * z} width={totalW} colsKey={colsKey} selKey={selKey(r)} ctx={ctx} render={renderRowCells} />
  );

  // Column header row.
  const headerCells: ReactNode[] = [];
  if (showHeaders) {
    headerCells.push(
      <div
        key="corner"
        role="columnheader"
        aria-colindex={1}
        aria-label={labels.allSheets}
        className="xv-corner"
        style={{ width: headerW, minWidth: headerW, height: headerH, insetInlineStart: 0 }}
        onPointerDown={(e) => {
          e.preventDefault();
          selectHeader('all', 0, false);
        }}
      />,
    );
    const pushHeaders = (cols: number[], sticky: boolean): void => {
      let x = sticky ? 0 : colLeft(rs, fc);
      for (const c of cols) {
        const left = colLeft(rs, c);
        if (left > x) headerCells.push(<div key={`s${c}`} className="xv-spacer" aria-hidden="true" style={{ width: (left - x) * z, minWidth: (left - x) * z }} />);
        const w = colWidth(rs, c) * z;
        const hiddenBefore = c > 0 && isColHidden(rs, c - 1);
        let from = c - 1;
        while (from > 0 && isColHidden(rs, from - 1)) from--;
        headerCells.push(
          <div
            key={c}
            role="columnheader"
            aria-colindex={c + 2}
            className={`xv-colheader${hiddenBefore ? ' xv-hidden-before' : ''}${selection.ranges.some((rg) => c >= rg.start.col && c <= rg.end.col) ? ' xv-header-selected' : ''}`}
            title={hiddenBefore ? labels.colsHidden(colName(from), colName(c - 1)) : undefined}
            style={{ width: w, minWidth: w, height: headerH, ...(sticky ? { position: 'sticky', insetInlineStart: headerW + left * z, zIndex: 3 } : {}) }}
            onPointerDown={(e) => {
              e.preventDefault();
              selectHeader('col', c, e.shiftKey);
            }}
          >
            {colName(c)}
          </div>,
        );
        x = left + colWidth(rs, c);
      }
    };
    pushHeaders(frozenCols, true);
    pushHeaders(win.cols, false);
  }

  const active = selection.active;
  const activeGeometry = {
    x: headerW + colLeft(rs, active.col) * z,
    y: headerH + rowTop(rs, active.row) * z,
    width: colWidth(rs, active.col) * z,
    height: rowHeight(rs, active.row) * z,
  };

  return (
    <div
      ref={scroller}
      className="xv-scroll"
      dir={rtl ? 'rtl' : 'ltr'}
      onScroll={onScroll}
      // The scroll area is not a tab stop; the grid's active cell is.
      tabIndex={-1}
    >
      <div className="xv-canvas" style={{ width: totalW, height: totalH }}>
        <div
          ref={gridEl}
          role="grid"
          aria-label={labels.sheet(props.rs.name)}
          aria-readonly="true"
          aria-multiselectable="true"
          aria-rowcount={ext.rows + 1}
          aria-colcount={ext.cols + 1}
          className="xv-grid"
          style={{ width: totalW, height: totalH }}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerOver={onPointerOver}
          onFocus={() => {
            hadFocus.current = true;
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hadFocus.current = false;
          }}
          onCopy={(e) => {
            props.onCopy(e.nativeEvent);
          }}
        >
          <div role="rowgroup" className="xv-top" style={{ height: headerH + frozenH, width: totalW }}>
            {showHeaders ? (
              <div role="row" aria-rowindex={1} className="xv-row xv-header-row" style={{ top: 0, height: headerH, width: totalW }}>
                {headerCells}
              </div>
            ) : null}
            {frozenRows.map((r) => renderRow(r, headerH + rowTop(rs, r) * z))}
          </div>
          <div role="rowgroup" className="xv-body">
            {win.rows.map((r) => renderRow(r, headerH + rowTop(rs, r) * z))}
          </div>
        </div>
        {props.overlay?.(activeGeometry)}
      </div>
      <span id={`${idBase}-desc`} className="xv-visually-hidden">
        {props.activeDescription}
      </span>
    </div>
  );
});
