/// <reference types="vite/client" />
// The javascript-excel conformance corpus (test/fixtures/corpus, see its README.md), for the browser and visual tests.

import manifest from './corpus/manifest.json';

const URLS = import.meta.glob<string>('./corpus/*.xlsx', { query: '?url', import: 'default', eager: true });

/** Left out of this copy: 18-limits.xlsx is a 1 MB size stress file; the generated stress files cover limits. */
export const EXCLUDED: string[] = ['18-limits.xlsx'];

export interface CorpusFile {
  file: string;
  title: string;
  sha256: string;
  load(): Promise<Uint8Array>;
}

export const CORPUS_VERSION: string = manifest.version;

export const CORPUS: CorpusFile[] = manifest.files
  .filter((f) => !EXCLUDED.includes(f.file))
  .map((f) => {
    const url = URLS[`./corpus/${f.file}`];
    if (!url) throw new Error(`test/fixtures/corpus/${f.file} is listed in manifest.json but missing`);
    return { file: f.file, title: f.title, sha256: f.sha256, load: async () => new Uint8Array(await (await fetch(url)).arrayBuffer()) };
  });

export async function sha256(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
