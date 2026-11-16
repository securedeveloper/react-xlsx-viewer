# react-xlsx-viewer playground

A Vite + React 19 app that shows react-xlsx-viewer: a built-in sample workbook, or any `.xlsx`, `.xlsm`, `.xltx`, `.xltm`, `.csv` or `.tsv` you open. The file never leaves the browser. It resolves the library and its stylesheet from source (`vite.config.ts`), so it always matches the branch it is built from.

```sh
npm run dev -w playground       # http://localhost:5173
npm run build -w playground     # dist/
npm run preview -w playground   # serves dist/ with the production security headers
```

## Privacy and security

Everything runs in the browser: no uploads, analytics, cookies, CDNs or web fonts. `vercel.json` sets a strict Content-Security-Policy (`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, …) plus `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and a restrictive `Permissions-Policy`, the same as the other playgrounds of the family. `vite preview` serves the same headers, so the policy is tested locally. Styles go in `src/style.css`, never in `style` attributes in HTML.

## Vercel (not created yet)

When Afzal creates the project (Vercel dashboard → Add New → Project → import `securedeveloper/react-xlsx-viewer`):

| Setting | Value |
|---|---|
| Project name | `react-xlsx-viewer-playground` |
| Framework preset | Vite (also set in `vercel.json`) |
| Root Directory | `apps/playground`, with **"Include files outside the root directory in the Build Step"** enabled, because the build reads `packages/react-xlsx-viewer` and the root lockfile |
| Install command | from `vercel.json`: `cd ../.. && npm ci` (the whole workspace, from the root lockfile) |
| Build command | from `vercel.json`: `npm run build`, which builds the library, then the playground |
| Output directory | `dist` |
| Node.js version | 24.x |
| Production branch | `main` (preview deployments for pull requests are fine: there is nothing secret) |
| Environment variables | none |
| Analytics, Speed Insights, Web Analytics | leave off: the page promises no tracking |

After the first deploy:

```sh
curl -sI https://react-xlsx-viewer-playground.vercel.app | grep -iE 'content-security-policy|referrer-policy|x-content-type-options|permissions-policy'
```

All four headers must show the values in `vercel.json`. Then open the page and check in the browser's console that opening the sample and a local file gives no CSP violation. A custom domain, if wanted, is added in the project's Domains settings; nothing in the app depends on the domain.
