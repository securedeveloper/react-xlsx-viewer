// UI strings (docs/ux.md §7): every visible or announced string, so apps can
// translate the viewer through the `labels` prop. English defaults.

export interface ViewerLabels {
  viewer: string;
  sheet: (name: string) => string;
  cellAddress: string;
  formula: string;
  value: string;
  result: (text: string) => string;
  notCalculated: string;
  notCalculatedLong: string;
  noWorkbook: string;
  loading: (fileName: string | null) => string;
  cancel: string;
  details: string;
  sheets: string;
  allSheets: string;
  hiddenSheet: string;
  scrollTabsBack: string;
  scrollTabsForward: string;
  cells: (n: number) => string;
  sum: (text: string) => string;
  average: (text: string) => string;
  tooManyForSum: (n: number) => string;
  zoom: string;
  zoomIn: string;
  zoomOut: string;
  fitWidth: string;
  shortcuts: string;
  close: string;
  copied: (n: number) => string;
  copyTooLarge: (n: number, limit: number) => string;
  notShownTitle: string;
  notShownSummary: string;
  macrosNotRun: string;
  dismiss: string;
  linkOpen: string;
  linkGoTo: (target: string) => string;
  linkBlocked: string;
  linkTo: (target: string) => string;
  rowsHidden: (from: number, to: number) => string;
  colsHidden: (from: string, to: string) => string;
  findHint: string;
  errors: {
    xls: string;
    xlsb: string;
    ods: string;
    notWorkbook: string;
    damaged: string;
    tooLarge: (limit: string) => string;
    generic: string;
  };
  shortcutList: Array<[keys: string, action: string]>;
}

export const DEFAULT_LABELS: Readonly<ViewerLabels> = Object.freeze({
  viewer: 'Workbook viewer',
  sheet: (name: string) => `Sheet: ${name}`,
  cellAddress: 'Cell address',
  formula: 'Formula',
  value: 'Value',
  result: (text: string) => `Result: ${text}`,
  notCalculated: 'not calculated',
  notCalculatedLong: "Not calculated: this file has no stored result for this formula, and the viewer doesn't calculate formulas.",
  noWorkbook: 'No workbook open.',
  loading: (fileName: string | null) => (fileName ? `Opening ${fileName}…` : 'Opening the workbook…'),
  cancel: 'Cancel',
  details: 'Details',
  sheets: 'Sheets',
  allSheets: 'All sheets',
  hiddenSheet: '(hidden)',
  scrollTabsBack: 'Previous sheets',
  scrollTabsForward: 'Next sheets',
  cells: (n: number) => `${n.toLocaleString()} cells`,
  sum: (text: string) => `Sum ${text}`,
  average: (text: string) => `Average ${text}`,
  tooManyForSum: (n: number) => `≥ ${n.toLocaleString()} cells · sum not shown`,
  zoom: 'Zoom',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fitWidth: 'Fit width',
  shortcuts: 'Keyboard shortcuts',
  close: 'Close',
  copied: (n: number) => `Copied ${n.toLocaleString()} ${n === 1 ? 'cell' : 'cells'}`,
  copyTooLarge: (n: number, limit: number) => `${n.toLocaleString()} cells is more than this viewer copies at once (${limit.toLocaleString()}). Select fewer cells.`,
  notShownTitle: "Some content isn't shown",
  notShownSummary: "This workbook has content this viewer doesn't show yet. Values and formatting are shown.",
  macrosNotRun: 'Macros (not run)',
  dismiss: 'Dismiss',
  linkOpen: 'Open',
  linkGoTo: (target: string) => `Go to ${target}`,
  linkBlocked: 'Link not opened: unsupported address',
  linkTo: (target: string) => `Link to ${target}`,
  rowsHidden: (from: number, to: number) => (from === to ? `Row ${from} hidden` : `Rows ${from}–${to} hidden`),
  colsHidden: (from: string, to: string) => (from === to ? `Column ${from} hidden` : `Columns ${from}–${to} hidden`),
  findHint: "Search in the sheet comes in a later version; the browser's find only sees the visible part.",
  errors: {
    xls: "This file is an older binary workbook (.xls) or a password-protected file. These can't be opened yet.",
    xlsb: "Binary workbooks (.xlsb) can't be opened yet. Save it as .xlsx and try again.",
    ods: "OpenDocument spreadsheets (.ods) can't be opened yet. Save it as .xlsx and try again.",
    notWorkbook: "This doesn't look like a workbook or a CSV file.",
    damaged: "This file is damaged and can't be read.",
    tooLarge: (limit: string) => `This file is larger than this viewer is set to open (limit: ${limit}).`,
    generic: "The file couldn't be opened.",
  },
  shortcutList: [
    ['Arrow keys', 'Move one cell'],
    ['Ctrl + arrow', 'Move to the edge of the data'],
    ['Home / Ctrl + Home', 'Start of the row / first cell'],
    ['Ctrl + End', 'Last used cell'],
    ['Page Up / Page Down', 'One screen up / down'],
    ['Alt + Page Up / Page Down', 'One screen left / right'],
    ['Shift + any of the above', 'Extend the selection'],
    ['Ctrl + A', 'Select the used range, then everything'],
    ['Shift + Space / Ctrl + Space', 'Select the row / column'],
    ['Ctrl + Page Up / Page Down', 'Previous / next sheet'],
    ['Ctrl + C', 'Copy the selection'],
    ['Alt + Enter', 'Open the hyperlink of the active cell'],
    ['Escape', 'Collapse the selection'],
    ['Tab / Shift + Tab', 'Leave the grid'],
    ['Shift + ?', 'Show these shortcuts'],
  ],
} satisfies ViewerLabels);

interface ErrorLike {
  code?: unknown;
  details?: { format?: unknown; limit?: unknown } | undefined;
  name?: unknown;
}

/** The message for a load error (docs/ux.md §6.2) and its code, if any. */
export function errorMessage(error: unknown, labels: ViewerLabels): { message: string; code: string | null } {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike;
  const code = typeof e.code === 'string' ? e.code : null;
  const fmt = e.details?.format;
  if (code === 'UNSUPPORTED_FORMAT') {
    if (fmt === 'cfb') return { message: labels.errors.xls, code };
    if (fmt === 'xlsb') return { message: labels.errors.xlsb, code };
    if (fmt === 'ods') return { message: labels.errors.ods, code };
    return { message: labels.errors.notWorkbook, code };
  }
  if (code === 'NOT_XLSX') return { message: labels.errors.notWorkbook, code };
  if (code === 'ZIP_INVALID' || (code !== null && (code.startsWith('XML_') || code.startsWith('ZIP_')))) return { message: labels.errors.damaged, code };
  if (code === 'LIMIT_EXCEEDED' || e.name === 'LimitError') return { message: labels.errors.tooLarge(typeof e.details?.limit === 'string' ? e.details.limit : code ?? 'size'), code };
  return { message: labels.errors.generic, code };
}
