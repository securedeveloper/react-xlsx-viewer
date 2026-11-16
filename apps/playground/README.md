# react-xlsx-viewer playground

A Vite + React 19 app that will open a sample or your own .xlsx/.csv file with react-xlsx-viewer (XLV-11). For now it is a shell that shows the workspace package version. It resolves the library from source (`vite.config.ts`), so it always matches the branch it is built from.

```sh
npm run dev -w playground       # http://localhost:5173
npm run build -w playground     # dist/
npm run preview -w playground   # serves dist/ with the production security headers
```

## Privacy and security

Everything runs in the browser: no uploads, analytics, cookies, CDNs or web fonts. `vercel.json` sets a strict Content-Security-Policy (`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, …) plus `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and a restrictive `Permissions-Policy`, the same as the other playgrounds of the family. `vite preview` serves the same headers, so the policy is tested locally. Styles go in `src/style.css`, never in `style` attributes in HTML.

## Vercel (not created yet)

When Afzal creates the project:

- Project name: `react-xlsx-viewer-playground`
- Root Directory: `apps/playground`, with "Include files outside the root directory" enabled (the build reads `packages/`)
- Install and build commands come from `vercel.json` (`cd ../.. && npm ci`, `npm run build`); output `dist`
- Node.js 24.x, production branch `main`, no environment variables
- After the first deploy: `curl -sI https://<domain> | grep -i content-security-policy` shows the policy above
