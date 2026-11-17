# react-xlsx-viewer playground (dev sandbox)

> **Dev sandbox, not deployed.** This app runs in CI (tests and build) and locally. It is not deployed anywhere. The public playground is a separate repository, [`securedeveloper/react-xlsx-viewer-playground`](https://github.com/securedeveloper/react-xlsx-viewer-playground), live at https://react-xlsx-viewer-playground.vercel.app/. It installs the published package from npm.

A Vite + React 19 app that shows react-xlsx-viewer: a built-in sample workbook, or any `.xlsx`, `.xlsm`, `.xltx`, `.xltm`, `.csv` or `.tsv` you open. The file never leaves the browser. It resolves the library and its stylesheet from source (`vite.config.ts`), so it always matches the branch it is built from.

```sh
npm run dev -w playground       # http://localhost:5173
npm run build -w playground     # dist/
npm run preview -w playground   # serves dist/ with the security headers
```

## Privacy and security

Everything runs in the browser: no uploads, analytics, cookies, CDNs or web fonts. `vite.config.ts` gives `vite preview` a strict Content-Security-Policy (`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, …) plus `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and a restrictive `Permissions-Policy`, so the policy is tested locally. Styles go in `src/style.css`, never in `style` attributes in HTML.
