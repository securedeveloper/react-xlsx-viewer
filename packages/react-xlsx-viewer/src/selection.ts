// Selection model (docs/api.md §5.1): framework-free, so a non-React viewer
// could reuse it. Ranges are inclusive; ranges[last] holds the active cell.
import type { CellRef, RangeRef } from 'javascript-excel/render';

export interface Selection {
  ranges: RangeRef[];
  active: CellRef;
}

export const rangeOf = (a: CellRef, b: CellRef): RangeRef => ({
  start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
  end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
});

export const single = (c: CellRef): Selection => ({ ranges: [rangeOf(c, c)], active: c });

export const contains = (r: RangeRef, row: number, col: number): boolean =>
  row >= r.start.row && row <= r.end.row && col >= r.start.col && col <= r.end.col;

export const isSelected = (s: Selection, row: number, col: number): boolean => s.ranges.some((r) => contains(r, row, col));

export const cellCount = (r: RangeRef): number => (r.end.row - r.start.row + 1) * (r.end.col - r.start.col + 1);

/** The last range, extended from the active cell to `to` (Shift + movement or Shift + click). */
export function extendTo(s: Selection, to: CellRef): Selection {
  const ranges = s.ranges.slice(0, -1);
  return { ranges: [...ranges, rangeOf(s.active, to)], active: s.active };
}

/** Adds a range (Ctrl/Cmd + click). */
export function addRange(s: Selection, at: CellRef): Selection {
  return { ranges: [...s.ranges, rangeOf(at, at)], active: at };
}

/** The far corner of the last range, the end a Shift + movement moves. */
export function focusOf(s: Selection): CellRef {
  const r = s.ranges[s.ranges.length - 1]!;
  return { row: r.start.row === s.active.row ? r.end.row : r.start.row, col: r.start.col === s.active.col ? r.end.col : r.start.col };
}

export function equalSelection(a: Selection, b: Selection): boolean {
  if (a.active.row !== b.active.row || a.active.col !== b.active.col || a.ranges.length !== b.ranges.length) return false;
  return a.ranges.every((r, i) => {
    const o = b.ranges[i]!;
    return r.start.row === o.start.row && r.start.col === o.start.col && r.end.row === o.end.row && r.end.col === o.end.col;
  });
}

/** 'A', 'B', … 'AA' for a zero-based column. */
export function colName(col: number): string {
  let n = col + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export const address = (c: CellRef): string => `${colName(c.col)}${c.row + 1}`;
