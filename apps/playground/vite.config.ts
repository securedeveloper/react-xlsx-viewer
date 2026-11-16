import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type UserConfig } from 'vite';

// Resolve the library from source so the playground always matches the branch
// it is built from, without a separate package build step. The packed tarball
// (what npm users get) is covered by the smoke test.
//
// `vite preview` serves the same security headers as Vercel (vercel.json), so
// the Content-Security-Policy is exercised locally before a deploy.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: Array<{ headers: Array<{ key: string; value: string }> }>;
};
const headers = Object.fromEntries(vercel.headers.flatMap((h) => h.headers.map(({ key, value }) => [key, value])));

const config: UserConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-xlsx-viewer/styles.css': fileURLToPath(new URL('../../packages/react-xlsx-viewer/src/styles.css', import.meta.url)),
      'react-xlsx-viewer': fileURLToPath(new URL('../../packages/react-xlsx-viewer/src/index.ts', import.meta.url)),
    },
  },
  preview: { headers },
});

export default config;
