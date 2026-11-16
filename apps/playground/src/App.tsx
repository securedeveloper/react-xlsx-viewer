import type { ReactElement } from 'react';
import { useVersion } from 'react-xlsx-viewer';

// A shell until XLV-11: open a sample or your own file and view it.
// Exported components need an explicit return type under isolatedDeclarations.
export function App(): ReactElement {
  const version = useVersion();
  return (
    <main>
      <h1>react-xlsx-viewer playground</h1>
      <p className="lead">A read-only workbook viewer for React is being built here. This page will open a sample or your own .xlsx or .csv file, entirely in your browser.</p>
      <p>
        Workspace package version: <code>{version}</code>
      </p>
    </main>
  );
}
