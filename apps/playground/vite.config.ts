import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type UserConfig } from 'vite';

// Resolve the library from source so the playground always matches the branch
// it is built from, without a separate package build step. The packed tarball
// (what npm users get) is covered by the smoke test.

// `vite preview` serves a strict Content-Security-Policy and the other security
// headers (they used to live in vercel.json), so the sandbox and its tests
// exercise the CSP. This app is not deployed; the public playground,
// securedeveloper/react-xlsx-viewer-playground, sets its own headers.
const headers: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

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
