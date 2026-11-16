import type { CellInput, Workbook } from 'react-xlsx-viewer';

// A small sample workbook: styles, number formats, merges, frozen panes, formulas with cached values, links.
export function sampleWorkbook(): Workbook<CellInput> {
  const head = { font: { bold: true, color: 'FFFFFF' }, fill: '4F4FB3', alignment: { horizontal: 'center' as const } };
  const money = { numFmt: '#,##0.00;[Red]-#,##0.00' };
  const rows: CellInput[][] = [
    [{ value: 'Quarterly sales (sample)', style: { font: { bold: true, size: 14 } } }],
    [{ value: 'Region', style: head }, { value: 'Q1', style: head }, { value: 'Q2', style: head }, { value: 'Change', style: head }, { value: 'Updated', style: head }, { value: 'Link', style: head }],
  ];
  const regions = ['North', 'South', 'East', 'West', 'Central'];
  regions.forEach((name, i) => {
    const r = i + 3;
    rows.push([
      name,
      { value: 1000 + i * 250.5, style: money },
      { value: 900 + i * 310.25 - (i === 2 ? 800 : 0), style: money },
      { formula: `(C${r}-B${r})/B${r}`, value: (900 + i * 310.25 - (i === 2 ? 800 : 0) - (1000 + i * 250.5)) / (1000 + i * 250.5), style: { numFmt: '0.0%' } },
      { value: 45306 + i * 7, style: { numFmt: 'd mmm yyyy' } },
      { value: 'details', hyperlink: 'https://example.com/' + name.toLowerCase() },
    ]);
  }
  );
  rows.push([{ value: 'Total', style: { font: { bold: true } } }, { formula: 'SUM(B3:B7)', value: 6252.5, style: { ...money, font: { bold: true } } }, { formula: 'SUM(C3:C7)', value: 5838.75, style: { ...money, font: { bold: true } } }]);
  return {
    sheets: [
      { name: 'Sales', rows, merges: ['A1:F1'], view: { freeze: { rows: 2 } }, colProps: [{ width: 14 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 10 }] },
      { name: 'Grid', rows: Array.from({ length: 2000 }, (_, r) => Array.from({ length: 40 }, (_, c) => (c === 0 ? `Row ${r + 1}` : r * 40 + c))), view: { freeze: { rows: 1, cols: 1 } } },
    ],
  };
}
