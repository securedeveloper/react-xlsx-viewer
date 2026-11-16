import { useMemo, useState, type ReactElement } from 'react';
import { XlsxViewer, version, type WorkbookSource } from 'react-xlsx-viewer';
import { sampleWorkbook } from './sample';

// Open a sample or your own file; everything stays in the browser (XLV-11 adds samples and polish).
// Exported components need an explicit return type under isolatedDeclarations.
export function App(): ReactElement {
  const sample = useMemo(() => sampleWorkbook(), []);
  const [source, setSource] = useState<WorkbookSource>(sample);
  return (
    <main>
      <header className="bar">
        <h1>react-xlsx-viewer playground</h1>
        <label className="open">
          Open a file
          <input type="file" name="file" accept=".xlsx,.xlsm,.xltx,.xltm,.csv,.tsv,.txt" onChange={(e) => setSource(e.target.files?.[0] ?? sample)} />
        </label>
        <button type="button" onClick={() => setSource(sample)}>
          Sample
        </button>
        <span className="version">v{version}</span>
      </header>
      <p className="lead">Everything runs in your browser: no uploads, no tracking, no cookies.</p>
      <div className="viewer-box">
        <XlsxViewer source={source} />
      </div>
    </main>
  );
}
