'use client';

// react-xlsx-viewer 1.0: a read-only workbook viewer for React (docs/api.md,
// docs/ux.md), built on javascript-excel's /read, /format and /render.
export { XlsxViewer, COPY_LIMIT, STATS_LIMIT } from './viewer';
export type { XlsxViewerProps, XlsxViewerHandle, Selection } from './viewer';
export { useWorkbook } from './use-workbook';
export type { UseWorkbook, UseWorkbookOptions, WorkbookSource, WorkbookStatus } from './use-workbook';
export { DEFAULT_LABELS } from './labels';
export type { ViewerLabels } from './labels';
export { DEFAULT_FONT_MAP } from './fonts';
export type { CellRef, RangeRef } from 'javascript-excel/render';
export type { Cell, CellInput, ExcelWarning, Workbook } from 'javascript-excel';
export type { ReadLimits } from 'javascript-excel/read';
export { isExcelError } from 'javascript-excel';

/** The version of this package. Kept in step with package.json by `npm run version-packages`. */
export const version = '0.0.1';
