# Conformance corpus

The workbooks of javascript-excel's conformance corpus (its `docs/conformance.md`), copied here so the viewer's browser and visual tests open real `.xlsx` files through the same read path as a user's file.

- **Source:** the `conformance-corpus` artifact of javascript-excel's CI (`npm -w packages/javascript-excel run conformance:artifact` in that repository builds the same files). `manifest.json` is that artifact's manifest, unchanged: it names the javascript-excel version and each file's SHA-256, and `test/browser/corpus.browser.test.tsx` checks the files against it.
- **Left out:** `18-limits.xlsx` (about 1 MB, a size stress file). The generated stress files in `test/browser/hostile-files.ts` cover the limits.
- **Refreshing:** download the artifact of a newer javascript-excel release, replace the `.xlsx` files and `manifest.json` here, then refresh the visual baselines (`docs/visual-testing.md`), because the files' content changes the screenshots.
