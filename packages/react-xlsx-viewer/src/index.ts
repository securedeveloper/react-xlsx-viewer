'use client';

// react-xlsx-viewer 1.0: a read-only workbook viewer for React (docs/api.md,
// docs/ux.md). This is the XLV-1 scaffold: the toolchain, React 18/19 matrix,
// packaging and browser tests are in place; <XlsxViewer> and useWorkbook arrive
// from XLV-3 onwards, on javascript-excel's `/format` and `/render` entries.
import { useDebugValue } from 'react';

/** The version of this package. Kept in step with package.json by `npm run version-packages`. */
export const version = '0.0.1';

/**
 * Placeholder hook, so the React toolchain (peer resolution, tests on React
 * 18 and 19 in jsdom and in Chromium, typings, the "use client" build) is
 * exercised before the real API exists. Removed when `useWorkbook` lands.
 */
export function useVersion(): string {
  useDebugValue(version);
  return version;
}
