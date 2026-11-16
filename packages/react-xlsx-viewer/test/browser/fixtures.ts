// A large in-memory workbook for the browser tests and the Performance harness:
// rows x cols numbers and text with a few shared styles, a frozen header row,
// some merges and hidden rows, like a real report.
import type { CellInput, Style, Workbook } from 'javascript-excel';

const STYLES: Style[] = [
  { font: { bold: true }, fill: 'DDEBF7', border: { bottom: { style: 'thin' } } },
  { numFmt: '#,##0.00' },
  { numFmt: '0%', font: { color: { theme: 5 } } },
  { numFmt: 14 },
  { alignment: { horizontal: 'center' }, border: { left: { style: 'thin' }, right: { style: 'thin' } } },
];

export function bigWorkbook(rows: number, cols: number): Workbook<CellInput> {
  const data: CellInput[][] = [Array.from({ length: cols }, (_, c) => ({ value: `Column ${c + 1}`, style: STYLES[0]! }))];
  for (let r = 1; r < rows; r++) {
    const row: CellInput[] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      const k = (r * 31 + c * 7) % 5;
      row[c] = k === 0 ? { value: `Item ${r}-${c}` } : k === 1 ? { value: r * 1.5 + c, style: STYLES[1]! } : k === 2 ? { value: (r % 100) / 100, style: STYLES[2]! } : k === 3 ? { value: 45000 + (r % 900), style: STYLES[3]! } : { value: r + c, style: STYLES[4]! };
    }
    data.push(row);
  }
  return {
    sheets: [
      {
        name: 'Big',
        rows: data,
        view: { freeze: { rows: 1, cols: 1 } },
        merges: ['B10:D11', 'A50:A55'],
        rowProps: Object.assign([], { 20: { hidden: true }, 21: { hidden: true } }),
      },
    ],
  };
}
